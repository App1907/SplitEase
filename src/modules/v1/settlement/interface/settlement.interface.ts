import { type UserRef } from '../../expense/interface/expense.interface';

export interface SettlementResponse {
  id: string;
  groupId: string;
  from: UserRef;
  to: UserRef;
  amount: number;
  currency: string;
  note?: string;
  createdBy: string;
  createdAt: Date;
}
