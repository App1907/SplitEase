export enum SplitType {
  EQUAL = 'EQUAL',
  EXACT = 'EXACT',
  PERCENT = 'PERCENT',
}

export enum DeviceType {
  ANDROID = 1,
  IOS = 2,
  WEB = 3,
}

export enum ExportStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export enum ActivityType {
  EXPENSE_ADDED = 'EXPENSE_ADDED',
  EXPENSE_UPDATED = 'EXPENSE_UPDATED',
  EXPENSE_DELETED = 'EXPENSE_DELETED',
  SETTLEMENT_ADDED = 'SETTLEMENT_ADDED',
  MEMBER_ADDED = 'MEMBER_ADDED',
}

export enum EventType {
  EXPENSE_CREATED = 'expense.created',
  EXPENSE_UPDATED = 'expense.updated',
  EXPENSE_DELETED = 'expense.deleted',
  SETTLEMENT_CREATED = 'settlement.created',
  MEMBER_ADDED = 'member.added',
  EXPORT_REQUESTED = 'export.requested',
}

/** Supported `lang` header values — add a member when a new locale ships. */
export enum Lang {
  EN = 'en',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}
