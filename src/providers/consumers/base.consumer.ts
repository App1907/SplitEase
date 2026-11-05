import { randomUUID } from 'node:crypto';
import { type Channel, type ConsumeMessage } from 'amqplib';
import { configuration } from '../../config/configuration';
import { RABBITMQ, REDIS_KEYS, TTL, type QueueDefinition } from '../../common/constant';
import { errorMessage } from '../../common/utils';
import { type AppEvent } from '../../interfaces/events.interface';
import { logContext, logger } from '../../logger/logger';
import { type RabbitMQProvider, rabbitMQProvider } from '../rabbitmq/rabbitmq.provider';
import { type RedisService, redisService } from '../redis/redis.service';

function isAppEvent(value: unknown): value is AppEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.eventId === 'string' &&
    typeof event.type === 'string' &&
    typeof event.groupId === 'string' &&
    typeof event.actorId === 'string' &&
    typeof event.data === 'object' &&
    event.data !== null
  );
}

/**
 * Reliable consumption shared by every queue:
 *  - idempotency: a Redis "done" marker per (queue, eventId) + a short processing lock
 *  - failures go to <queue>.retry (TTL) up to CONSUMER_MAX_RETRIES, then to <queue>.dlq
 *  - malformed messages go straight to the DLQ
 */
export abstract class BaseConsumer<TEvent extends AppEvent = AppEvent> {
  protected abstract readonly queue: QueueDefinition;
  protected readonly prefetch: number = configuration.rabbitmq.prefetch;

  private channel: Channel | null = null;
  private consumerTag: string | null = null;
  private readonly inFlight = new Set<Promise<void>>();
  private stopping = false;

  constructor(
    private readonly rabbit: RabbitMQProvider = rabbitMQProvider,
    protected readonly redis: RedisService = redisService,
  ) {}

  protected abstract handle(event: TEvent): Promise<void>;

  protected async onFinalFailure(_event: TEvent, _error: unknown): Promise<void> {}

  protected accepts(event: AppEvent): event is TEvent {
    return (this.queue.bindings as string[]).includes(event.type);
  }

  async start(): Promise<void> {
    await this.rabbit.onConnected(() => this.subscribe());
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const channel = this.channel;
    if (channel && this.consumerTag) await channel.cancel(this.consumerTag).catch(() => undefined);
    await Promise.allSettled([...this.inFlight]);
    if (channel) await channel.close().catch(() => undefined);
    this.channel = null;
    logger.info(`Consumer ${this.queue.name} stopped`);
  }

  private async subscribe(): Promise<void> {
    if (this.stopping) return;
    const channel = await this.rabbit.createChannel();
    channel.on('error', (error: Error) =>
      logger.error(`Channel error on ${this.queue.name}`, { error: error.message }),
    );
    await channel.prefetch(this.prefetch);
    const { consumerTag } = await channel.consume(this.queue.name, (message) => {
      if (!message) return;
      const task = this.process(channel, message).finally(() => this.inFlight.delete(task));
      this.inFlight.add(task);
    });
    this.channel = channel;
    this.consumerTag = consumerTag;
    logger.info(`Consumer ${this.queue.name} listening (prefetch ${this.prefetch})`);
  }

  private async process(channel: Channel, message: ConsumeMessage): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.content.toString('utf8'));
    } catch {
      parsed = null;
    }
    if (!isAppEvent(parsed) || !this.accepts(parsed)) {
      logger.error(`Malformed message on ${this.queue.name}, dead-lettering`);
      this.safely(() => channel.nack(message, false, false));
      return;
    }
    const event = parsed;

    await logContext.run({ requestId: event.requestId ?? randomUUID() }, async () => {
      const doneKey = REDIS_KEYS.consumerDone(this.queue.name, event.eventId);
      const lockKey = REDIS_KEYS.consumerLock(this.queue.name, event.eventId);
      try {
        if (await this.redis.exists(doneKey)) {
          logger.debug('Duplicate message skipped', { queue: this.queue.name, eventId: event.eventId });
          this.safely(() => channel.ack(message));
          return;
        }
        if (!(await this.redis.setIfAbsent(lockKey, String(process.pid), TTL.CONSUMER_LOCK_SECONDS))) {
          // Another consumer is processing the same event right now: look again later.
          await this.retryLater(channel, message, false);
          return;
        }
      } catch (error) {
        logger.error('Idempotency store unavailable', { error: errorMessage(error) });
        await this.retryLater(channel, message, true, event, error);
        return;
      }

      try {
        await this.handle(event);
        await this.redis.set(doneKey, '1', TTL.CONSUMER_DONE_SECONDS);
        this.safely(() => channel.ack(message));
        logger.debug('Message processed', {
          queue: this.queue.name,
          type: event.type,
          eventId: event.eventId,
        });
      } catch (error) {
        logger.error(`Failed to process ${event.type}`, {
          queue: this.queue.name,
          eventId: event.eventId,
          error: errorMessage(error),
        });
        await this.retryLater(channel, message, true, event, error);
      } finally {
        await this.redis.del(lockKey).catch(() => undefined);
      }
    });
  }

  private async retryLater(
    channel: Channel,
    message: ConsumeMessage,
    countAttempt: boolean,
    event?: TEvent,
    error?: unknown,
  ): Promise<void> {
    const headers = message.properties.headers ?? {};
    const attempts = Number(headers[RABBITMQ.RETRY_COUNT_HEADER] ?? 0);

    if (countAttempt && attempts >= configuration.rabbitmq.maxRetries) {
      logger.error(`Giving up after ${attempts} retries, dead-lettering`, {
        queue: this.queue.name,
        eventId: event?.eventId,
      });
      if (event)
        await this.onFinalFailure(event, error).catch((hookError: unknown) => {
          logger.error('onFinalFailure hook failed', { error: errorMessage(hookError) });
        });
      this.safely(() => channel.nack(message, false, false));
      return;
    }

    // Publish the retry copy on the confirm channel and ack only after the broker confirms it.
    // Acking first on the consume channel could lose the message if the broker dies mid-write.
    try {
      const publishChannel = this.rabbit.getPublishChannel();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Retry publish confirm timed out')), 5000);
        const fail = (error: unknown): void => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        };
        try {
          publishChannel.sendToQueue(
            RABBITMQ.retryQueue(this.queue.name),
            message.content,
            {
              ...message.properties,
              headers: {
                ...headers,
                [RABBITMQ.RETRY_COUNT_HEADER]: countAttempt ? attempts + 1 : attempts,
              },
              persistent: true,
            },
            (error) => {
              if (error) return fail(error);
              clearTimeout(timer);
              resolve();
            },
          );
        } catch (error) {
          fail(error);
        }
      });
      this.safely(() => channel.ack(message));
    } catch (error) {
      logger.error('Could not schedule retry, requeueing original', {
        queue: this.queue.name,
        eventId: event?.eventId,
        error: errorMessage(error),
      });
      this.safely(() => channel.nack(message, false, true));
    }
  }

  /** The channel may already be closed (broker restart); the message is then redelivered anyway. */
  private safely(action: () => void): void {
    try {
      action();
    } catch (error) {
      logger.warn('Channel operation failed, message will be redelivered', { error: errorMessage(error) });
    }
  }
}
