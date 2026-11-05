import { Schema, model, type Types } from 'mongoose';
import { LIMITS } from '../common/constant';
import { SplitType } from '../enum/enum';

export interface IExpenseSplit {
  userId: Types.ObjectId;
  /** Always paise, also for PERCENT splits (converted on save). */
  share: number;
  /** Original percentage, kept only for PERCENT splits so edits can re-split. */
  percent?: number;
}

export interface IExpense {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  description: string;
  amount: number;
  paidBy: Types.ObjectId;
  splitType: SplitType;
  splits: IExpenseSplit[];
  expenseDate: Date;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const integerPaise = {
  validator: Number.isSafeInteger,
  message: 'must be an integer number of paise',
};

const splitSchema = new Schema<IExpenseSplit>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    share: { type: Number, required: true, min: 0, validate: integerPaise },
    percent: { type: Number, min: 0, max: 100 },
  },
  { _id: false },
);

const expenseSchema = new Schema<IExpense>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    description: { type: String, required: true, trim: true, maxlength: LIMITS.DESCRIPTION_MAX },
    amount: { type: Number, required: true, min: 1, validate: integerPaise },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    splitType: { type: String, enum: Object.values(SplitType), required: true },
    splits: { type: [splitSchema], required: true },
    expenseDate: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

expenseSchema.index({ groupId: 1, expenseDate: -1 });
// Text search on description, prefixed by groupId: every search is scoped to one group.
expenseSchema.index({ groupId: 1, description: 'text' });

export const ExpenseModel = model<IExpense>('Expense', expenseSchema);
