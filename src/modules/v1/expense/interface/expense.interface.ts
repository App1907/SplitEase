import { type SplitType } from '../../../../enum/enum';
import { type PercentSplitInput, type ShareSplit } from '../../../../common/utils';

export interface UserRef {
  id: string;
  name: string;
}

export interface ExpenseSplitResponse {
  userId: string;
  name: string;
  share: number;
  percent?: number;
}

export interface ExpenseResponse {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  currency: string;
  paidBy: UserRef;
  splitType: SplitType;
  splits: ExpenseSplitResponse[];
  expenseDate: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SplitSpec =
  | { splitType: SplitType.EQUAL; participants?: string[] }
  | { splitType: SplitType.EXACT; splits: ShareSplit[] }
  | { splitType: SplitType.PERCENT; splits: PercentSplitInput[] };

export interface ResolvedSplit {
  userId: string;
  share: number;
  percent?: number;
}
