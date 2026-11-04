import { formatINR, toPaginated, uniqueStrings } from '../../../common/utils';
import { ActivityType, EventType } from '../../../enum/enum';
import {
  type ExpenseEvent,
  type MemberAddedEvent,
  type SettlementEvent,
} from '../../../interfaces/events.interface';
import { type Paginated } from '../../../interfaces/pagination.interface';
import { type ActivityRepository, activityRepository } from '../../../repositories/activity.repository';
import { toObjectId } from '../../../repositories/base.repository';
import { type GroupRepository, groupRepository } from '../../../repositories/group.repository';
import { type UserRepository, userRepository } from '../../../repositories/user.repository';
import { type ListActivityQuery } from './dto/activity.dto';
import { type ActivityResponse, type RecordedActivity } from './interface/activity.interface';

export type ActivityEvent = ExpenseEvent | SettlementEvent | MemberAddedEvent;

const ACTIVITY_TYPE: Record<ActivityEvent['type'], ActivityType> = {
  [EventType.EXPENSE_CREATED]: ActivityType.EXPENSE_ADDED,
  [EventType.EXPENSE_UPDATED]: ActivityType.EXPENSE_UPDATED,
  [EventType.EXPENSE_DELETED]: ActivityType.EXPENSE_DELETED,
  [EventType.SETTLEMENT_CREATED]: ActivityType.SETTLEMENT_ADDED,
  [EventType.MEMBER_ADDED]: ActivityType.MEMBER_ADDED,
};

export class ActivityService {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly groups: GroupRepository,
    private readonly users: UserRepository,
  ) {}

  static involvedUserIds(event: ActivityEvent): string[] {
    switch (event.type) {
      case EventType.EXPENSE_CREATED:
      case EventType.EXPENSE_UPDATED:
      case EventType.EXPENSE_DELETED:
        return uniqueStrings([event.data.paidBy, ...event.data.splits.map((split) => split.userId)]);
      case EventType.SETTLEMENT_CREATED:
        return [event.data.fromUserId, event.data.toUserId];
      case EventType.MEMBER_ADDED:
        return [event.data.userId];
    }
  }

  /**
   * Idempotent: the activity is keyed by eventId, so a redelivered message creates nothing new.
   * Visible to every current member plus anyone involved in the event.
   */
  async recordFromEvent(event: ActivityEvent): Promise<RecordedActivity> {
    const group = await this.groups.findById(event.groupId);
    const memberIds = group?.members.map((member) => member.userId.toString()) ?? [];
    const involved = ActivityService.involvedUserIds(event);
    const audience = uniqueStrings([...memberIds, ...involved, event.actorId]);

    const users = await this.users.findByIds(uniqueStrings([event.actorId, ...involved]));
    const names = new Map(
      users.map((user) => [
        user._id.toString(),
        { name: user.name, email: user.email, isActive: user.isActive },
      ]),
    );
    const nameOf = (userId: string): string => names.get(userId)?.name ?? 'Someone';
    const groupName = group?.name ?? 'a group';
    const summary = ActivityService.summarize(event, nameOf, groupName);

    const created = await this.activities.createIfAbsent({
      eventId: event.eventId,
      userIds: audience.map(toObjectId),
      groupId: toObjectId(event.groupId),
      actorId: toObjectId(event.actorId),
      type: ACTIVITY_TYPE[event.type],
      summary,
      payload: { ...event.data, groupName },
    });
    return { created, summary, groupName, names };
  }

  async list(userId: string, query: ListActivityQuery): Promise<Paginated<ActivityResponse>> {
    const { items, total } = await this.activities.paginateForUser(userId, query, query.groupId);
    return toPaginated(
      items.map((activity) => ({
        id: activity._id.toString(),
        type: activity.type,
        groupId: activity.groupId.toString(),
        actorId: activity.actorId.toString(),
        summary: activity.summary,
        payload: activity.payload,
        createdAt: activity.createdAt,
      })),
      total,
      query,
    );
  }

  private static summarize(event: ActivityEvent, nameOf: (id: string) => string, groupName: string): string {
    const actor = nameOf(event.actorId);
    switch (event.type) {
      case EventType.EXPENSE_CREATED:
        return `${actor} added "${event.data.description}" (${formatINR(event.data.amount)}) in "${groupName}"`;
      case EventType.EXPENSE_UPDATED:
        return `${actor} updated "${event.data.description}" (${formatINR(event.data.amount)}) in "${groupName}"`;
      case EventType.EXPENSE_DELETED:
        return `${actor} deleted "${event.data.description}" (${formatINR(event.data.amount)}) in "${groupName}"`;
      case EventType.SETTLEMENT_CREATED:
        return `${nameOf(event.data.fromUserId)} paid ${nameOf(event.data.toUserId)} ${formatINR(event.data.amount)} in "${groupName}"`;
      case EventType.MEMBER_ADDED:
        return `${actor} added ${nameOf(event.data.userId)} to "${groupName}"`;
    }
  }
}

export const activityService = new ActivityService(activityRepository, groupRepository, userRepository);
