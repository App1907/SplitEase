import { Schema, model, type Types } from 'mongoose';
import { LIMITS } from '../common/constant';

export interface ISettlement {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  fromUserId: Types.ObjectId;
  toUserId: Types.ObjectId;
  amount: number;
  note?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const settlementSchema = new Schema<ISettlement>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'must be an integer number of paise' },
    },
    note: { type: String, trim: true, maxlength: LIMITS.NOTE_MAX },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false },
);

settlementSchema.index({ groupId: 1, createdAt: -1 });

export const SettlementModel = model<ISettlement>('Settlement', settlementSchema);
