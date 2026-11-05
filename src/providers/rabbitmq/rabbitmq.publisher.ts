import { randomUUID } from 'node:crypto';
import { RABBITMQ } from '../../common/constant';
import { errorMessage, sleep } from '../../common/utils';
import { type AppEvent, type DomainEvent } from '../../interfaces/events.interface';
import { type EventType } from '../../enum/enum';
import { logContext, logger } from '../../logger/logger';
import { type RabbitMQProvider, rabbitMQProvider } from './rabbitmq.provider';

const CONFIRM_TIMEOUT_MS = 5000;
const PUBLISH_ATTEMPTS = 3;

export class EventPublisher {
  constructor(private readonly provider: RabbitMQProvider) {}

  build<TType extends EventType, TData>(
    type: TType,
    groupId: string,
    actorId: string,
    data: TData,
  ): DomainEvent<TType, TData> {
    return {
      eventId: randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      groupId,
      actorId,
      requestId: logContext.getStore()?.requestId,
      data,
    };
  }

  /** Persistent publish on a confirm channel; resolves only once the broker has the message. */
  publish(event: AppEvent): Promise<void> {
    const channel = this.provider.getPublishChannel();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Publish confirm timed out')), CONFIRM_TIMEOUT_MS);
      const fail = (error: unknown): void => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      try {
        channel.publish(
          RABBITMQ.EXCHANGE,
          event.type,
          Buffer.from(JSON.stringify(event)),
          {
            persistent: true,
            contentType: 'application/json',
            messageId: event.eventId,
            type: event.type,
            timestamp: Math.floor(Date.now() / 1000),
            correlationId: event.requestId,
          },
          (error: unknown) => {
            if (error) return fail(error);
            clearTimeout(timer);
            resolve();
          },
        );
      } catch (error) {
        fail(error);
      }
    });
  }

  /**
   * Publishing must never fail a request whose data is already saved; callers get false instead.
   * A few short retries cover brief broker blips without an outbox table.
   */
  async publishSafe(event: AppEvent): Promise<boolean> {
    /* eslint-disable no-await-in-loop -- publish retries must wait between attempts */
    for (let attempt = 1; attempt <= PUBLISH_ATTEMPTS; attempt += 1) {
      try {
        await this.publish(event);
        logger.debug('Event published', { type: event.type, eventId: event.eventId, attempt });
        return true;
      } catch (error) {
        logger.error('Event publish failed', {
          type: event.type,
          eventId: event.eventId,
          attempt,
          error: errorMessage(error),
        });
        if (attempt < PUBLISH_ATTEMPTS) await sleep(100 * attempt);
      }
    }
    /* eslint-enable no-await-in-loop */
    return false;
  }
}

export const eventPublisher = new EventPublisher(rabbitMQProvider);
