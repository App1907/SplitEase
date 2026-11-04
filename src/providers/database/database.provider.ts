import mongoose from 'mongoose';
import { configuration } from '../../config/configuration';
import { errorMessage, sleep } from '../../common/utils';
import { logger } from '../../logger/logger';

export class DatabaseProvider {
  private static readonly MAX_ATTEMPTS = 10;

  async connect(): Promise<void> {
    mongoose.set('strictQuery', true);
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
    mongoose.connection.on('error', (error: Error) =>
      logger.error('MongoDB error', { error: error.message }),
    );

    /* eslint-disable no-await-in-loop -- connection retries must wait between attempts */
    for (let attempt = 1; ; attempt += 1) {
      try {
        await mongoose.connect(configuration.mongo.uri, {
          serverSelectionTimeoutMS: 5000,
          maxPoolSize: 20,
          autoIndex: true,
        });
        logger.info('MongoDB connected');
        return;
      } catch (error) {
        if (attempt >= DatabaseProvider.MAX_ATTEMPTS) throw error;
        logger.warn(`MongoDB connection failed (attempt ${attempt}), retrying`, {
          error: errorMessage(error),
        });
        await sleep(Math.min(1000 * 2 ** attempt, 10000));
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  async isHealthy(): Promise<boolean> {
    try {
      const db = mongoose.connection.db;
      if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected || !db) return false;
      await db.admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed');
  }
}

export const databaseProvider = new DatabaseProvider();
