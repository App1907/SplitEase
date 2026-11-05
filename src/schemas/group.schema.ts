import { Schema, model, type Types } from 'mongoose';
import { LIMITS } from '../common/constant';

export interface IGroupMember {
  userId: Types.ObjectId;
  joinedAt: Date;
}

export interface IGroup {
  _id: Types.ObjectId;
  name: string;
  createdBy: Types.ObjectId;
  members: IGroupMember[];
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const memberSchema = new Schema<IGroupMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const groupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, trim: true, maxlength: LIMITS.GROUP_NAME_MAX },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

groupSchema.index({ 'members.userId': 1 });

export const GroupModel = model<IGroup>('Group', groupSchema);
