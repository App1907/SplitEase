import amqp, { type Channel, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { configuration } from '../../config/configuration';
import { AppError, ErrorCode } from '../../common/errors';
import { errorMessage, sleep } from '../../common/utils';
import { logger } from '../../logger/logger';
import { assertTopology } from './rabbitmq.topology';

type ConnectionHook = () => Promise<void>;

/** On reconnect: re-declares the topology and re-runs every hook, so consumers re-subscribe. */
export class RabbitMQProvider {
  private static readonly STARTUP_ATTEMPTS = 15;

  private connection: ChannelModel | null = null;
  private publishChannel: ConfirmChannel | null = null;
  private readonly hooks: ConnectionHook[] = [];
  private closing = false;
  private reconnecting = false;

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    /* eslint-disable no-await-in-loop -- connection retries must wait between attempts */
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.establish();
        return;
      } catch (error) {
        if (attempt >= RabbitMQProvider.STARTUP_ATTEMPTS) throw error;
        logger.warn(`RabbitMQ connection failed (attempt ${attempt}), retrying`, {
          error: errorMessage(error),
        });
        await sleep(Math.min(1000 * 2 ** attempt, 10000));
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  async onConnected(hook: ConnectionHook): Promise<void> {
    this.hooks.push(hook);
    if (this.connection) await hook();
  }

  async createChannel(): Promise<Channel> {
    if (!this.connection) throw new AppError(ErrorCode.SERVICE_UNAVAILABLE);
    return this.connection.createChannel();
  }

  getPublishChannel(): ConfirmChannel {
    if (!this.publishChannel) throw new AppError(ErrorCode.SERVICE_UNAVAILABLE);
    return this.publishChannel;
  }

  isHealthy(): boolean {
    return this.connection !== null && this.publishChannel !== null;
  }

  async close(): Promise<void> {
    this.closing = true;
    const connection = this.connection;
    this.connection = null;
    this.publishChannel = null;
    if (connection) {
      await connection.close().catch(() => undefined);
      logger.info('RabbitMQ connection closed');
    }
  }

  private async establish(): Promise<void> {
    const connection = await amqp.connect(this.url, {
      clientProperties: { connection_name: `splitease-${process.pid}` },
    });
    connection.on('error', (error: Error) =>
      logger.error('RabbitMQ connection error', { error: error.message }),
    );
    connection.on('close', () => {
      this.connection = null;
      this.publishChannel = null;
      if (!this.closing) {
        logger.warn('RabbitMQ connection lost');
        void this.reconnect();
      }
    });

    const publishChannel = await connection.createConfirmChannel();
    publishChannel.on('error', (error: Error) =>
      logger.error('RabbitMQ publish channel error', { error: error.message }),
    );
    publishChannel.on('close', () => {
      if (this.publishChannel === publishChannel) this.publishChannel = null;
    });
    await assertTopology(publishChannel);

    this.connection = connection;
    this.publishChannel = publishChannel;
    logger.info('RabbitMQ connected');

    await Promise.all(this.hooks.map((hook) => hook()));
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    /* eslint-disable no-await-in-loop -- reconnect backoff must be sequential */
    for (let attempt = 1; !this.closing; attempt += 1) {
      await sleep(Math.min(1000 * 2 ** attempt, 15000));
      try {
        await this.establish();
        logger.info('RabbitMQ reconnected');
        break;
      } catch (error) {
        logger.warn(`RabbitMQ reconnect failed (attempt ${attempt})`, { error: errorMessage(error) });
      }
    }
    /* eslint-enable no-await-in-loop */
    this.reconnecting = false;
  }
}

export const rabbitMQProvider = new RabbitMQProvider(configuration.rabbitmq.url);
