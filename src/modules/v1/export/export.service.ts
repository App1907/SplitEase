import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configuration } from '../../../config/configuration';
import { API_PREFIX, REDIS_KEYS, TTL } from '../../../common/constant';
import { AppError, ErrorCode } from '../../../common/errors';
import { MESSAGES } from '../../../common/messages';
import { errorMessage, formatDateInTimeZone } from '../../../common/utils';
import { EventType, ExportStatus } from '../../../enum/enum';
import { type DeviceContext, type GroupContext } from '../../../interfaces/request.interface';
import { logger } from '../../../logger/logger';
import { type EventPublisher, eventPublisher } from '../../../providers/rabbitmq/rabbitmq.publisher';
import { type RedisService, redisService } from '../../../providers/redis/redis.service';
import {
  type WorkerThreadService,
  workerThreadService,
} from '../../../providers/workerThread/worker-thread.service';
import { type CsvLedgerRow, type CsvMemberColumn } from '../../../providers/workerThread/worker.types';
import { toObjectId } from '../../../repositories/base.repository';
import { type ExpenseRepository, expenseRepository } from '../../../repositories/expense.repository';
import { type ExportRepository, exportRepository } from '../../../repositories/export.repository';
import { type GroupRepository, groupRepository } from '../../../repositories/group.repository';
import { type SettlementRepository, settlementRepository } from '../../../repositories/settlement.repository';
import { type UserRepository, userRepository } from '../../../repositories/user.repository';
import { type IExport } from '../../../schemas/export.schema';
import { type ExportDownload, type ExportStatusResponse } from './interface/export.interface';

export class ExportService {
  constructor(
    private readonly exports: ExportRepository,
    private readonly groups: GroupRepository,
    private readonly expenses: ExpenseRepository,
    private readonly settlements: SettlementRepository,
    private readonly users: UserRepository,
    private readonly redis: RedisService,
    private readonly publisher: EventPublisher,
    private readonly workers: WorkerThreadService,
  ) {}

  /** An export of the same group still in flight is returned instead of queuing a duplicate. */
  async request(group: GroupContext, userId: string, ctx: DeviceContext): Promise<ExportStatusResponse> {
    const inFlight = await this.exports.findInFlight(group.id, userId);
    if (inFlight) return this.toStatus(inFlight);

    const record = await this.exports.create({
      groupId: toObjectId(group.id),
      requestedBy: toObjectId(userId),
      status: ExportStatus.QUEUED,
      timezone: ctx.timezone,
    });
    const exportId = record._id.toString();
    await this.redis.set(REDIS_KEYS.exportProgress(exportId), '0', TTL.EXPORT_PROGRESS_SECONDS);

    const published = await this.publisher.publishSafe(
      this.publisher.build(EventType.EXPORT_REQUESTED, group.id, userId, { exportId }),
    );
    if (!published) {
      await this.exports.markFailed(exportId, 'Could not queue the export');
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, { message: MESSAGES.EXPORT_QUEUE_UNAVAILABLE });
    }
    return this.toStatus(record);
  }

  async getStatus(exportId: string, userId: string): Promise<ExportStatusResponse> {
    return this.toStatus(await this.loadAuthorized(exportId, userId));
  }

  async getDownload(exportId: string, userId: string): Promise<ExportDownload> {
    const record = await this.loadAuthorized(exportId, userId);
    if (record.status !== ExportStatus.DONE || !record.fileName)
      throw AppError.notFound(MESSAGES.EXPORT_NOT_READY);

    const filePath = ExportService.filePathFor(exportId);
    try {
      await fs.access(filePath);
    } catch {
      throw AppError.notFound(MESSAGES.EXPORT_NOT_FOUND);
    }
    return { filePath, fileName: record.fileName };
  }

  async process(exportId: string): Promise<void> {
    const existing = await this.exports.findById(exportId);
    if (!existing || existing.status === ExportStatus.DONE || existing.status === ExportStatus.FAILED) {
      logger.info('Export skipped', { exportId, status: existing?.status ?? 'missing' });
      return;
    }
    const record = await this.exports.markProcessing(exportId);
    if (!record) return;

    const progressKey = REDIS_KEYS.exportProgress(exportId);
    await this.redis.set(progressKey, '0', TTL.EXPORT_PROGRESS_SECONDS);

    const group = await this.groups.findById(record.groupId);
    const [expenses, settlements] = await Promise.all([
      this.expenses.findAllForExport(record.groupId),
      this.settlements.findAllForGroup(record.groupId),
    ]);

    const memberIds = group?.members.map((member) => member.userId.toString()) ?? [];
    const ledgerUserIds = [
      ...expenses.flatMap((e) => [e.paidBy.toString(), ...e.splits.map((s) => s.userId.toString())]),
      ...settlements.flatMap((s) => [s.fromUserId.toString(), s.toUserId.toString()]),
    ];
    const orderedUserIds = [...new Set([...memberIds, ...ledgerUserIds])];
    const users = await this.users.findByIds(orderedUserIds);
    const byId = new Map(users.map((user) => [user._id.toString(), user]));
    const nameOf = (userId: string): string => byId.get(userId)?.name ?? 'Former member';

    const nameCounts = new Map<string, number>();
    orderedUserIds.forEach((id) => nameCounts.set(nameOf(id), (nameCounts.get(nameOf(id)) ?? 0) + 1));
    const columns: CsvMemberColumn[] = orderedUserIds.map((userId) => ({
      userId,
      label:
        (nameCounts.get(nameOf(userId)) ?? 0) > 1
          ? `${nameOf(userId)} (${byId.get(userId)?.email ?? userId})`
          : nameOf(userId),
    }));

    const timed: { at: number; row: CsvLedgerRow }[] = [
      ...expenses.map((expense) => ({
        at: expense.expenseDate.getTime(),
        row: {
          date: formatDateInTimeZone(expense.expenseDate, record.timezone),
          description: expense.description,
          paidBy: nameOf(expense.paidBy.toString()),
          amount: expense.amount,
          splitType: expense.splitType,
          shares: Object.fromEntries(expense.splits.map((split) => [split.userId.toString(), split.share])),
        },
      })),
      ...settlements.map((settlement) => ({
        at: settlement.createdAt.getTime(),
        row: {
          date: formatDateInTimeZone(settlement.createdAt, record.timezone),
          description: `Settlement: ${nameOf(settlement.fromUserId.toString())} paid ${nameOf(settlement.toUserId.toString())}${settlement.note ? ` - ${settlement.note}` : ''}`,
          paidBy: nameOf(settlement.fromUserId.toString()),
          amount: settlement.amount,
          splitType: 'SETTLEMENT',
          shares: { [settlement.toUserId.toString()]: settlement.amount },
        },
      })),
    ];
    timed.sort((a, b) => a.at - b.at);

    let lastReported = 0;
    const { csv, rowCount } = await this.workers.runTask(
      'exportCsv',
      { columns, rows: timed.map((entry) => entry.row) },
      {
        onProgress: (progress) => {
          // Capped below 100: 100 is only written once the file is on disk.
          const value = Math.min(progress, 99);
          if (value - lastReported < 5) return;
          lastReported = value;
          this.redis.set(progressKey, String(value), TTL.EXPORT_PROGRESS_SECONDS).catch((error: unknown) => {
            logger.warn('Could not store export progress', { exportId, error: errorMessage(error) });
          });
        },
      },
    );

    const filePath = ExportService.filePathFor(exportId);
    await fs.mkdir(configuration.exportDir, { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, csv, 'utf8');
    await fs.rename(tempPath, filePath);

    const fileName = `splitease-${ExportService.slug(group?.name ?? 'group')}-${formatDateInTimeZone(new Date(), record.timezone)}.csv`;
    await this.exports.markDone(exportId, filePath, fileName, rowCount);
    await this.redis.set(progressKey, '100', TTL.EXPORT_PROGRESS_SECONDS);
    logger.info('Export finished', { exportId, rowCount });
  }

  async markFailed(exportId: string, error: unknown): Promise<void> {
    await this.exports.markFailed(exportId, errorMessage(error));
    await this.redis.del(REDIS_KEYS.exportProgress(exportId));
  }

  private async loadAuthorized(exportId: string, userId: string): Promise<IExport> {
    const record = await this.exports.findById(exportId);
    if (!record) throw AppError.notFound(MESSAGES.EXPORT_NOT_FOUND);
    const group = await this.groups.findById(record.groupId);
    if (!group?.members.some((member) => member.userId.toString() === userId)) {
      throw new AppError(ErrorCode.NOT_GROUP_MEMBER);
    }
    return record;
  }

  private async toStatus(record: IExport): Promise<ExportStatusResponse> {
    const exportId = record._id.toString();
    let progress = 0;
    if (record.status === ExportStatus.DONE) progress = 100;
    else if (record.status === ExportStatus.PROCESSING) {
      progress = Number((await this.redis.get(REDIS_KEYS.exportProgress(exportId))) ?? 0);
    }
    return {
      exportId,
      groupId: record.groupId.toString(),
      status: record.status,
      progress,
      ...(record.rowCount !== undefined ? { rowCount: record.rowCount } : {}),
      ...(record.error ? { error: record.error } : {}),
      ...(record.status === ExportStatus.DONE
        ? { downloadUrl: `${API_PREFIX}/exports/${exportId}/download` }
        : {}),
      createdAt: record.createdAt,
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
    };
  }

  private static filePathFor(exportId: string): string {
    return path.join(configuration.exportDir, `${exportId}.csv`);
  }

  private static slug(value: string): string {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'group'
    );
  }
}

export const exportService = new ExportService(
  exportRepository,
  groupRepository,
  expenseRepository,
  settlementRepository,
  userRepository,
  redisService,
  eventPublisher,
  workerThreadService,
);
