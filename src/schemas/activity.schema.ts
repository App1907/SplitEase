import { Schema, model, type Types } from 'mongoose';
import { ActivityType } from '../enum/enum';

export interface IActivity {
  _id: Types.ObjectId;
  /** The domain event that produced this activity; unique so redelivered messages are no-ops. */
  eventId: string;
  userIds: Types.ObjectId[];
  groupId: Types.ObjectId;
  actorId: Types.ObjectId;
  type: ActivityType;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    eventId: { type: String, required: true },
    userIds: { type: [Schema.Types.ObjectId], ref: 'User', required: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(ActivityType), required: true },
    summary: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

activitySchema.index({ userIds: 1, createdAt: -1 });
activitySchema.index({ eventId: 1 }, { unique: true });

export const ActivityModel = model<IActivity>('Activity', activitySchema);
