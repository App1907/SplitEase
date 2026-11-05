import { type NetBalance } from '../../../../providers/workerThread/worker.types';

export interface BalanceSnapshot {
  version: number;
  computedAt: number;
  balances: NetBalance[];
}

export interface SettlePlanSnapshot {
  version: number;
  computedAt: number;
  payments: { from: string; to: string; amount: number }[];
}

export interface MemberBalance {
  userId: string;
  name: string;
  net: number;
}

export interface GroupBalancesResponse {
  groupId: string;
  currency: string;
  balances: MemberBalance[];
  isSettled: boolean;
  stale: boolean;
  computedAt: string;
}

export interface SettlePaymentResponse {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export interface SettlePlanResponse {
  groupId: string;
  currency: string;
  payments: SettlePaymentResponse[];
  stale: boolean;
}

export interface MyGroupBalance {
  groupId: string;
  name: string;
  net: number;
}

export interface MyBalancesResponse {
  currency: string;
  youOwe: number;
  youAreOwed: number;
  net: number;
  summary: { youOwe: string; youAreOwed: string };
  groups: MyGroupBalance[];
}
