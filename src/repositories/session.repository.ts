import { type DeviceType, type Lang } from '../enum/enum';
import { type ISession, SessionModel } from '../schemas/session.schema';
import { BaseRepository, toObjectId, type Id } from './base.repository';

export interface UpsertSessionInput {
  sid: string;
  userId: Id;
  deviceId: string;
  deviceType: DeviceType;
  timezone: string;
  lang: Lang;
  ip: string;
  userAgent: string;
  expiresAt: Date;
}

export class SessionRepository extends BaseRepository<ISession> {
  constructor() {
    super(SessionModel);
  }

  /**
   * Atomically replaces the session of (userId, deviceId) and returns the previous one,
   * so the caller can revoke the old session id in Redis.
   */
  upsertForDevice(input: UpsertSessionInput): Promise<ISession | null> {
    const now = new Date();
    return this.model
      .findOneAndUpdate(
        { userId: toObjectId(input.userId), deviceId: input.deviceId },
        {
          $set: {
            sid: input.sid,
            deviceType: input.deviceType,
            timezone: input.timezone,
            lang: input.lang,
            ip: input.ip,
            userAgent: input.userAgent,
            loginAt: now,
            lastUsedAt: now,
            revokedAt: null,
            expiresAt: input.expiresAt,
          },
        },
        { upsert: true, new: false },
      )
      .lean<ISession>()
      .exec();
  }

  findActiveByUser(userId: Id): Promise<ISession[]> {
    return this.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } }, undefined, {
      sort: { lastUsedAt: -1 },
    });
  }

  async revokeBySid(sid: string): Promise<void> {
    await this.model.updateOne({ sid, revokedAt: null }, { $set: { revokedAt: new Date() } }).exec();
  }

  async revokeAllForUser(userId: Id): Promise<void> {
    await this.model.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } }).exec();
  }

  async touch(sid: string): Promise<void> {
    await this.model.updateOne({ sid, revokedAt: null }, { $set: { lastUsedAt: new Date() } }).exec();
  }

  async extend(sid: string, expiresAt: Date): Promise<void> {
    await this.model
      .updateOne({ sid, revokedAt: null }, { $set: { lastUsedAt: new Date(), expiresAt } })
      .exec();
  }
}

export const sessionRepository = new SessionRepository();
