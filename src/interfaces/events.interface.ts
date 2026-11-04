import { type EventType, type SplitType } from '../enum/enum';

export interface DomainEvent<TType extends EventType = EventType, TData = unknown> {
  eventId: string;
  type: TType;
  occurredAt: string;
  groupId: string;
  actorId: string;
  requestId?: string;
  data: TData;
}

export interface ExpenseEventData {
  expenseId: string;
  description: string;
  amount: number;
  paidBy: string;
  splitType: SplitType;
  splits: { userId: string; share: number }[];
  previous?: { description: string; amount: number };
}

export interface SettlementEventData {
  settlementId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  note?: string;
}

export interface MemberAddedEventData {
  userId: string;
}

export interface ExportRequestedEventData {
  exportId: string;
}

export type ExpenseEvent = DomainEvent<
  EventType.EXPENSE_CREATED | EventType.EXPENSE_UPDATED | EventType.EXPENSE_DELETED,
  ExpenseEventData
>;
export type SettlementEvent = DomainEvent<EventType.SETTLEMENT_CREATED, SettlementEventData>;
export type MemberAddedEvent = DomainEvent<EventType.MEMBER_ADDED, MemberAddedEventData>;
export type ExportRequestedEvent = DomainEvent<EventType.EXPORT_REQUESTED, ExportRequestedEventData>;

export type AppEvent = ExpenseEvent | SettlementEvent | MemberAddedEvent | ExportRequestedEvent;
