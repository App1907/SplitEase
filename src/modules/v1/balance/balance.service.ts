import { configuration } from '../../../config/configuration';
import { MONEY, REDIS_KEYS } from '../../../common/constant';
import { errorMessage, formatINR } from '../../../common/utils';
import { type ExpenseEvent, type SettlementEvent } from '../../../interfaces/events.interface';
import { type GroupContext } from '../../../interfaces/request.interface';
import { logger } from '../../../logger/logger';
import { type EventPublisher, eventPublisher } from '../../../providers/rabbitmq/rabbitmq.publisher';
import { type RedisService, redisService } from '../../../providers/redis/redis.service';
import {
  type WorkerThreadService,
  workerThreadService,
} from '../../../providers/workerThread/worker-thread.service';
import { type ExpenseRepository, expenseRepository } from '../../../repositories/expense.repository';
import { type GroupRepository, groupRepository } from '../../../repositories/group.repository';
import { type UserRepository, userRepository } from '../../../repositories/user.repository';
import {
  type BalanceSnapshot,
  type GroupBalancesResponse,
  type MyBalancesResponse,
  type SettlePlanResponse,
  type SettlePlanSnapshot,
} from './interface/balance.interface';

/**
 * Balances are never stored in Mongo. They are computed by an aggregation over expenses +
 * settlements and cached in Redis as a versioned snapshot:
 *
 *  - every ledger write INCRs balances:version:<groupId>, then publishes an event
 *  - the balance consumer recomputes and stores { version, balances } (only if not older)
 *  - a read whose snapshot.version < current version is served with stale: true
 */
export class BalanceService {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly groups: GroupRepository,
    private readonly users: UserRepository,
    private readonly redis: RedisService,
    private readonly publisher: EventPublisher,
    private readonly workers: WorkerThreadService,
  ) {}

  async recordLedgerChange(event: ExpenseEvent | SettlementEvent): Promise<void> {
    let versionBumped = false;
    try {
      await this.redis.incr(REDIS_KEYS.balancesVersion(event.groupId));
      versionBumped = true;
    } catch (error) {
      logger.error('Could not bump balance version', { groupId: event.groupId, error: errorMessage(error) });
    }
    const published = await this.publisher.publishSafe(event);
    // If the version bump or the publish failed, drop the cache so the next read recomputes.
    // (A failed bump with a live cache would otherwise look "fresh" to the consumer forever.)
    if (!published || !versionBumped) await this.invalidate(event.groupId);
  }

  /** Full recompute from Mongo; never overwrites a newer snapshot. */
  async recalculate(groupId: string): Promise<BalanceSnapshot> {
    const version = await this.currentVersion(groupId);
    const rows = await this.expenses.aggregateGroupNet(groupId);
    const balances = rows
      .filter((row) => row.net !== 0)
      .sort((a, b) => b.net - a.net || a.userId.localeCompare(b.userId));

    const total = balances.reduce((sum, row) => sum + row.net, 0);
    if (total !== 0) logger.error('Group balances do not sum to zero', { groupId, total });

    const snapshot: BalanceSnapshot = { version, computedAt: Date.now(), balances };
    await this.redis.setIfNewerVersion(
      REDIS_KEYS.balances(groupId),
      snapshot,
      configuration.balances.cacheTtlSeconds,
    );
    return snapshot;
  }

  async refreshIfStale(groupId: string): Promise<boolean> {
    const [cachedRaw, versionRaw] = await this.redis.mget([
      REDIS_KEYS.balances(groupId),
      REDIS_KEYS.balancesVersion(groupId),
    ]);
    const cached = BalanceService.parseSnapshot<BalanceSnapshot>(cachedRaw);
    if (cached && cached.version >= Number(versionRaw ?? 0)) return false;
    await this.recalculate(groupId);
    return true;
  }

  async getSnapshot(groupId: string): Promise<{ snapshot: BalanceSnapshot; stale: boolean }> {
    const [cachedRaw, versionRaw] = await this.redis.mget([
      REDIS_KEYS.balances(groupId),
      REDIS_KEYS.balancesVersion(groupId),
    ]);
    const cached = BalanceService.parseSnapshot<BalanceSnapshot>(cachedRaw);
    if (!cached) return { snapshot: await this.recalculate(groupId), stale: false };

    const isBehind = cached.version < Number(versionRaw ?? 0);
    if (!isBehind) return { snapshot: cached, stale: false };

    // Self-healing: if the consumer has not caught up for too long, compute inline.
    if (Date.now() - cached.computedAt > configuration.balances.staleRecomputeMs) {
      return { snapshot: await this.recalculate(groupId), stale: false };
    }
    return { snapshot: cached, stale: true };
  }

  async getGroupBalances(group: GroupContext): Promise<GroupBalancesResponse> {
    const { snapshot, stale } = await this.getSnapshot(group.id);
    const netByUser = new Map(snapshot.balances.map((row) => [row.userId, row.net]));
    const userIds = [...new Set([...group.members.map((member) => member.userId), ...netByUser.keys()])];
    const names = await this.nameMap(userIds);

    const balances = userIds
      .map((userId) => ({
        userId,
        name: names.get(userId) ?? 'Former member',
        net: netByUser.get(userId) ?? 0,
      }))
      .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));

    return {
      groupId: group.id,
      currency: MONEY.CURRENCY,
      balances,
      isSettled: balances.every((row) => row.net === 0),
      stale,
      computedAt: new Date(snapshot.computedAt).toISOString(),
    };
  }

  async getSettlePlan(group: GroupContext): Promise<SettlePlanResponse> {
    const { snapshot, stale } = await this.getSnapshot(group.id);
    const planKey = REDIS_KEYS.settlePlan(group.id);

    let plan = await this.redis.getJson<SettlePlanSnapshot>(planKey);
    if (!plan || plan.version !== snapshot.version || plan.computedAt !== snapshot.computedAt) {
      const { payments } = await this.workers.runTask('simplifyDebts', { balances: snapshot.balances });
      plan = { version: snapshot.version, computedAt: snapshot.computedAt, payments };
      await this.redis.setJson(planKey, plan, configuration.balances.cacheTtlSeconds);
    }

    const names = await this.nameMap(plan.payments.flatMap((payment) => [payment.from, payment.to]));
    return {
      groupId: group.id,
      currency: MONEY.CURRENCY,
      payments: plan.payments.map((payment) => ({
        from: payment.from,
        fromName: names.get(payment.from) ?? 'Former member',
        to: payment.to,
        toName: names.get(payment.to) ?? 'Former member',
        amount: payment.amount,
      })),
      stale,
    };
  }

  async getMyBalances(userId: string): Promise<MyBalancesResponse> {
    const groups = await this.groups.findAllForUser(userId);
    const nets = await this.getUserNetForGroups(
      userId,
      groups.map((group) => group._id.toString()),
    );

    let youOwe = 0;
    let youAreOwed = 0;
    const perGroup = groups.map((group) => {
      const net = nets.get(group._id.toString()) ?? 0;
      if (net < 0) youOwe += -net;
      else youAreOwed += net;
      return { groupId: group._id.toString(), name: group.name, net };
    });
    perGroup.sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));

    return {
      currency: MONEY.CURRENCY,
      youOwe,
      youAreOwed,
      net: youAreOwed - youOwe,
      summary: { youOwe: formatINR(youOwe), youAreOwed: formatINR(youAreOwed) },
      groups: perGroup,
    };
  }

  async getUserNetForGroups(userId: string, groupIds: readonly string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (groupIds.length === 0) return result;

    const [snapshots, versions] = await Promise.all([
      this.redis.mgetJson<BalanceSnapshot>(groupIds.map(REDIS_KEYS.balances)),
      this.redis.mget(groupIds.map(REDIS_KEYS.balancesVersion)),
    ]);

    const misses: string[] = [];
    groupIds.forEach((groupId, index) => {
      const snapshot = snapshots[index];
      const currentVersion = Number(versions[index] ?? 0);
      // Same freshness rule as getSnapshot: a behind-version cache is treated as a miss.
      if (!snapshot || snapshot.version < currentVersion) {
        misses.push(groupId);
        return;
      }
      result.set(groupId, snapshot.balances.find((row) => row.userId === userId)?.net ?? 0);
    });

    if (misses.length > 0) {
      const fresh = await this.expenses.aggregateUserNetByGroups(userId, misses);
      for (const groupId of misses) result.set(groupId, fresh.get(groupId) ?? 0);
    }
    return result;
  }

  /** Always computed from Mongo; used where a stale value is not acceptable (removing a member). */
  async getFreshUserNet(userId: string, groupId: string): Promise<number> {
    const nets = await this.expenses.aggregateUserNetByGroups(userId, [groupId]);
    return nets.get(groupId) ?? 0;
  }

  private async invalidate(groupId: string): Promise<void> {
    try {
      await this.redis.del(REDIS_KEYS.balances(groupId), REDIS_KEYS.settlePlan(groupId));
    } catch (error) {
      logger.error('Could not invalidate balance cache', { groupId, error: errorMessage(error) });
    }
  }

  private async currentVersion(groupId: string): Promise<number> {
    return Number((await this.redis.get(REDIS_KEYS.balancesVersion(groupId))) ?? 0);
  }

  private async nameMap(userIds: readonly string[]): Promise<Map<string, string>> {
    const users = await this.users.findByIds([...new Set(userIds)]);
    return new Map(users.map((user) => [user._id.toString(), user.name]));
  }

  private static parseSnapshot<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}

export const balanceService = new BalanceService(
  expenseRepository,
  groupRepository,
  userRepository,
  redisService,
  eventPublisher,
  workerThreadService,
);
