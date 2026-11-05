import { RABBITMQ, REDIS_KEYS, TTL } from '../../common/constant';
import { formatINR } from '../../common/utils';
import { EventType } from '../../enum/enum';
import { logger } from '../../logger/logger';
import {
  type ActivityEvent,
  type ActivityService,
  activityService,
} from '../../modules/v1/activity/activity.service';
import { type RecordedActivity } from '../../modules/v1/activity/interface/activity.interface';
import { type EmailProvider, emailProvider } from '../email/email.provider';
import { buildEmail } from '../email/email.templates';
import { BaseConsumer } from './base.consumer';

export class NotificationConsumer extends BaseConsumer<ActivityEvent> {
  protected readonly queue = RABBITMQ.QUEUES.NOTIFICATION;

  constructor(
    private readonly activities: ActivityService,
    private readonly email: EmailProvider,
  ) {
    super();
  }

  protected async handle(event: ActivityEvent): Promise<void> {
    const recorded = await this.activities.recordFromEvent(event);
    const recipients = this.recipients(event);

    await Promise.all(
      recipients.map(async (userId) => {
        const user = recorded.names.get(userId);
        if (!user?.isActive) return;
        // Per-recipient marker: a retry after a partial failure does not email anyone twice.
        const firstTime = await this.redis.setIfAbsent(
          REDIS_KEYS.emailSent(event.eventId, userId),
          '1',
          TTL.CONSUMER_DONE_SECONDS,
        );
        if (!firstTime) return;
        try {
          await this.email.send(
            buildEmail(user.email, this.subject(event, recorded), this.lines(event, userId, recorded)),
          );
        } catch (error) {
          await this.redis.del(REDIS_KEYS.emailSent(event.eventId, userId));
          throw error;
        }
      }),
    );
    logger.info('Notification processed', { type: event.type, recipients: recipients.length });
  }

  private recipients(event: ActivityEvent): string[] {
    const involved =
      event.type === EventType.MEMBER_ADDED
        ? [event.data.userId]
        : event.type === EventType.SETTLEMENT_CREATED
          ? [event.data.fromUserId, event.data.toUserId]
          : [event.data.paidBy, ...event.data.splits.map((split) => split.userId)];
    return [...new Set(involved)].filter((userId) => userId !== event.actorId);
  }

  private subject(event: ActivityEvent, recorded: RecordedActivity): string {
    switch (event.type) {
      case EventType.EXPENSE_CREATED:
        return `New expense in ${recorded.groupName}: ${event.data.description}`;
      case EventType.EXPENSE_UPDATED:
        return `Expense updated in ${recorded.groupName}: ${event.data.description}`;
      case EventType.EXPENSE_DELETED:
        return `Expense deleted in ${recorded.groupName}: ${event.data.description}`;
      case EventType.SETTLEMENT_CREATED:
        return `Payment recorded in ${recorded.groupName}`;
      case EventType.MEMBER_ADDED:
        return `You were added to ${recorded.groupName}`;
    }
  }

  private lines(event: ActivityEvent, recipientId: string, recorded: RecordedActivity): string[] {
    const lines = [recorded.summary];
    if (
      event.type === EventType.EXPENSE_CREATED ||
      event.type === EventType.EXPENSE_UPDATED ||
      event.type === EventType.EXPENSE_DELETED
    ) {
      const share = event.data.splits.find((split) => split.userId === recipientId)?.share;
      if (share !== undefined && event.type !== EventType.EXPENSE_DELETED)
        lines.push(`Your share: ${formatINR(share)}`);
    }
    lines.push('Open SplitEase to see your updated balances.');
    return lines;
  }
}

export const notificationConsumer = new NotificationConsumer(activityService, emailProvider);
