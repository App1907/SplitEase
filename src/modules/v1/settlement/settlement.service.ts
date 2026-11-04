import { MONEY } from '../../../common/constant';
import { AppError } from '../../../common/errors';
import { MESSAGES } from '../../../common/messages';
import { toPaginated } from '../../../common/utils';
import { EventType } from '../../../enum/enum';
import { type Paginated } from '../../../interfaces/pagination.interface';
import { type GroupContext } from '../../../interfaces/request.interface';
import { type EventPublisher, eventPublisher } from '../../../providers/rabbitmq/rabbitmq.publisher';
import { toObjectId } from '../../../repositories/base.repository';
import { type SettlementRepository, settlementRepository } from '../../../repositories/settlement.repository';
import { type UserRepository, userRepository } from '../../../repositories/user.repository';
import { type ISettlement } from '../../../schemas/settlement.schema';
import { type BalanceService, balanceService } from '../balance/balance.service';
import { type CreateSettlementDto, type ListSettlementsQuery } from './dto/settlement.dto';
import { type SettlementResponse } from './interface/settlement.interface';

export class SettlementService {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly users: UserRepository,
    private readonly balances: BalanceService,
    private readonly publisher: EventPublisher,
  ) {}

  async create(group: GroupContext, actorId: string, dto: CreateSettlementDto): Promise<SettlementResponse> {
    const fromUserId = dto.fromUserId ?? actorId;
    if (fromUserId === dto.toUserId) {
      throw AppError.validation(
        [{ field: 'body.toUserId', message: 'Cannot settle with yourself' }],
        MESSAGES.SETTLEMENT_SAME_USER,
      );
    }
    const memberIds = new Set(group.members.map((member) => member.userId));
    const outsiders = [fromUserId, dto.toUserId].filter((userId) => !memberIds.has(userId));
    if (outsiders.length > 0) {
      throw AppError.validation(
        outsiders.map((userId) => ({
          field: 'body',
          message: `User ${userId} is not a member of this group`,
        })),
        MESSAGES.SETTLEMENT_USER_NOT_MEMBER,
      );
    }

    const settlement = await this.settlements.create({
      groupId: toObjectId(group.id),
      fromUserId: toObjectId(fromUserId),
      toUserId: toObjectId(dto.toUserId),
      amount: dto.amount,
      note: dto.note || undefined,
      createdBy: toObjectId(actorId),
    });

    await this.balances.recordLedgerChange(
      this.publisher.build(EventType.SETTLEMENT_CREATED, group.id, actorId, {
        settlementId: settlement._id.toString(),
        fromUserId,
        toUserId: dto.toUserId,
        amount: settlement.amount,
        note: settlement.note,
      }),
    );

    const [response] = await this.toResponses([settlement]);
    if (!response) throw AppError.notFound();
    return response;
  }

  async list(group: GroupContext, query: ListSettlementsQuery): Promise<Paginated<SettlementResponse>> {
    const { items, total } = await this.settlements.paginate(group.id, query, query.userId);
    return toPaginated(await this.toResponses(items), total, query);
  }

  private async toResponses(settlements: ISettlement[]): Promise<SettlementResponse[]> {
    const users = await this.users.findByIds([
      ...new Set(settlements.flatMap((s) => [s.fromUserId.toString(), s.toUserId.toString()])),
    ]);
    const names = new Map(users.map((user) => [user._id.toString(), user.name]));
    const ref = (id: string) => ({ id, name: names.get(id) ?? 'Former member' });

    return settlements.map((settlement) => ({
      id: settlement._id.toString(),
      groupId: settlement.groupId.toString(),
      from: ref(settlement.fromUserId.toString()),
      to: ref(settlement.toUserId.toString()),
      amount: settlement.amount,
      currency: MONEY.CURRENCY,
      ...(settlement.note ? { note: settlement.note } : {}),
      createdBy: settlement.createdBy.toString(),
      createdAt: settlement.createdAt,
    }));
  }
}

export const settlementService = new SettlementService(
  settlementRepository,
  userRepository,
  balanceService,
  eventPublisher,
);
