import { Schema, model, type Types } from 'mongoose';
import { DeviceType, Lang } from '../enum/enum';

/**
 * One document per (user, device). Logging in again on the same device replaces the
 * session id in place, so the unique index makes the replacement atomic.
 */
export interface ISession {
  _id: Types.ObjectId;
  sid: string;
  userId: Types.ObjectId;
  deviceId: string;
  deviceType: DeviceType;
  timezone: string;
  lang: Lang;
  ip?: string;
  userAgent?: string;
  loginAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  expiresAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    sid: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, required: true },
    deviceType: {
      type: Number,
      enum: Object.values(DeviceType).filter((v) => typeof v === 'number'),
      required: true,
    },
    timezone: { type: String, required: true },
    lang: { type: String, enum: Object.values(Lang), required: true },
    ip: { type: String },
    userAgent: { type: String },
    loginAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

sessionSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
sessionSchema.index({ sid: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model<ISession>('Session', sessionSchema);
