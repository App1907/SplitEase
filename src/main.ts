import { type Server } from 'node:http';
import { App } from './app';
import { configuration } from './config/configuration';
import { errorMessage } from './common/utils';
import { logger } from './logger/logger';
import { databaseProvider } from './providers/database/database.provider';
import { rabbitMQProvider } from './providers/rabbitmq/rabbitmq.provider';
import { redisProvider } from './providers/redis/redis.provider';
import { workerThreadService } from './providers/workerThread/worker-thread.service';

class HttpServer {
  private server: Server | null = null;
  private shuttingDown = false;

  async start(): Promise<void> {
    await Promise.all([databaseProvider.connect(), redisProvider.connect()]);
    await rabbitMQProvider.connect();

    const { app } = new App();
    this.server = app.listen(configuration.port, () => {
      logger.info(`SplitEase API listening on :${configuration.port} (${configuration.env})`);
      if (configuration.swaggerEnabled)
        logger.info(`API docs at http://localhost:${configuration.port}/docs`);
    });
    this.server.keepAliveTimeout = 65_000;
    this.server.headersTimeout = 66_000;
    this.server.requestTimeout = 30_000;

    process.once('SIGTERM', () => void this.shutdown('SIGTERM'));
    process.once('SIGINT', () => void this.shutdown('SIGINT'));
  }

  async shutdown(reason: string, exitCode = 0): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    logger.info(`Shutting down API (${reason})`);
    const force = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, configuration.shutdownTimeoutMs);
    force.unref();

    let code = exitCode;
    try {
      const server = this.server;
      if (server) {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeIdleConnections();
        });
        logger.info('HTTP server closed');
      }
      await workerThreadService.shutdown();
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

const httpServer = new HttpServer();

process.on('unhandledRejection', (reason) =>
  logger.error('Unhandled promise rejection', { error: errorMessage(reason) }),
);
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  void httpServer.shutdown('uncaughtException', 1);
});

httpServer.start().catch((error: unknown) => {
  logger.error('API failed to start', { error: errorMessage(error) });
  void httpServer.shutdown('startup failure', 1);
});
