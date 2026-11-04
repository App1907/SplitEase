import { configuration } from './config/configuration';
import { errorMessage } from './common/utils';
import { logger } from './logger/logger';
import { type BaseConsumer } from './providers/consumers/base.consumer';
import { balanceConsumer } from './providers/consumers/balance.consumer';
import { exportConsumer } from './providers/consumers/export.consumer';
import { notificationConsumer } from './providers/consumers/notification.consumer';
import { databaseProvider } from './providers/database/database.provider';
import { emailProvider } from './providers/email/email.provider';
import { rabbitMQProvider } from './providers/rabbitmq/rabbitmq.provider';
import { redisProvider } from './providers/redis/redis.provider';
import { workerThreadService } from './providers/workerThread/worker-thread.service';

class ConsumerApp {
  private readonly consumers: BaseConsumer[] = [balanceConsumer, notificationConsumer, exportConsumer];
  private shuttingDown = false;

  async start(): Promise<void> {
    await Promise.all([databaseProvider.connect(), redisProvider.connect()]);
    await rabbitMQProvider.connect();
    await emailProvider.verify();
    await Promise.all(this.consumers.map((consumer) => consumer.start()));
    logger.info(`SplitEase consumers running (pid ${process.pid})`);

    process.once('SIGTERM', () => void this.shutdown('SIGTERM'));
    process.once('SIGINT', () => void this.shutdown('SIGINT'));
  }

  async shutdown(reason: string, exitCode = 0): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    logger.info(`Shutting down consumers (${reason})`);
    const force = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, configuration.shutdownTimeoutMs);
    force.unref();

    let code = exitCode;
    try {
      await Promise.all(this.consumers.map((consumer) => consumer.stop()));
      await workerThreadService.shutdown();
      emailProvider.close();
      await rabbitMQProvider.close();
      await databaseProvider.disconnect();
      await redisProvider.disconnect();
    } catch (error) {
      logger.error('Error during shutdown', { error: errorMessage(error) });
      code = 1;
    }
    clearTimeout(force);
    process.exit(code);
  }
}

const consumerApp = new ConsumerApp();

process.on('unhandledRejection', (reason) =>
  logger.error('Unhandled promise rejection', { error: errorMessage(reason) }),
);
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  void consumerApp.shutdown('uncaughtException', 1);
});

consumerApp.start().catch((error: unknown) => {
  logger.error('Consumers failed to start', { error: errorMessage(error) });
  void consumerApp.shutdown('startup failure', 1);
});
