import { type Lang } from '../enum/enum';

/** User-facing copy keyed by `lang`. Add a new Lang enum member + translations when a locale ships. */
export type LocalizedText = Record<Lang, string>;

export const MESSAGES = {
  REGISTERED: { en: 'Account created' },
  LOGGED_IN: { en: 'Logged in' },
  TOKENS_REFRESHED: { en: 'Tokens refreshed' },
  LOGGED_OUT: { en: 'Logged out' },
  LOGGED_OUT_ALL: { en: 'Logged out from all devices' },
  SESSIONS_FETCHED: { en: 'Active sessions' },
  INVALID_CREDENTIALS: { en: 'Invalid email or password' },
  ACCOUNT_DISABLED: { en: 'This account is disabled' },
  SESSION_REVOKED: { en: 'Session expired or revoked, please log in again' },
  DEVICE_MISMATCH: { en: 'Token does not belong to this device' },
  REFRESH_TOKEN_MISSING: { en: 'x-refresh-token header is required' },
  ACCESS_TOKEN_MISSING: { en: 'Authorization: Bearer <token> header is required' },

  PROFILE_FETCHED: { en: 'Profile' },
  PROFILE_UPDATED: { en: 'Profile updated' },
  USER_FOUND: { en: 'User found' },
  USER_NOT_FOUND: { en: 'No user found with this email' },

  GROUP_CREATED: { en: 'Group created' },
  GROUPS_FETCHED: { en: 'Groups' },
  GROUP_FETCHED: { en: 'Group details' },
  GROUP_RENAMED: { en: 'Group renamed' },
  GROUP_NOT_FOUND: { en: 'Group not found' },
  MEMBER_ADDED: { en: 'Member added' },
  MEMBER_REMOVED: { en: 'Member removed' },
  MEMBER_NOT_FOUND: { en: 'This user is not a member of the group' },
  GROUP_FULL: { en: 'Group member limit reached' },

  EXPENSE_ADDED: { en: 'Expense added' },
  EXPENSES_FETCHED: { en: 'Expenses' },
  EXPENSE_FETCHED: { en: 'Expense details' },
  EXPENSE_UPDATED: { en: 'Expense updated' },
  EXPENSE_DELETED: { en: 'Expense deleted' },
  EXPENSE_NOT_FOUND: { en: 'Expense not found' },
  PAYER_NOT_MEMBER: { en: 'paidBy must be a member of the group' },
  SPLIT_USER_NOT_MEMBER: { en: 'Every user in the split must be a member of the group' },
  EXACT_SPLIT_MISMATCH: { en: 'Splits must add up to the expense amount' },
  PERCENT_SPLIT_MISMATCH: { en: 'Percentages must add up to 100' },
  EXACT_SPLITS_REQUIRED: {
    en: 'Amount changed on an EXACT expense: send new splits that add up to the amount',
  },

  BALANCES_FETCHED: { en: 'Group balances' },
  SETTLE_PLAN_FETCHED: { en: 'Settle-up plan' },
  MY_BALANCES_FETCHED: { en: 'Your balances' },
  BALANCE_NOT_SETTLED: { en: 'Member still has a non-zero balance in this group' },

  SETTLEMENT_RECORDED: { en: 'Settlement recorded' },
  SETTLEMENTS_FETCHED: { en: 'Settlements' },
  SETTLEMENT_SAME_USER: { en: 'fromUserId and toUserId must be different' },
  SETTLEMENT_USER_NOT_MEMBER: {
    en: 'Both users of a settlement must be members of the group',
  },

  ACTIVITY_FETCHED: { en: 'Activity' },

  EXPORT_QUEUED: { en: 'Export queued' },
  EXPORT_STATUS: { en: 'Export status' },
  EXPORT_NOT_FOUND: { en: 'Export not found' },
  EXPORT_NOT_READY: { en: 'Export is not ready yet' },
  EXPORT_QUEUE_UNAVAILABLE: { en: 'Could not queue the export, please try again' },

  HEALTHY: { en: 'Healthy' },
  UNHEALTHY: { en: 'One or more dependencies are down' },
  ROUTE_NOT_FOUND: { en: 'Route not found' },
  MALFORMED_JSON: { en: 'Malformed JSON body' },
} as const satisfies Record<string, LocalizedText>;
