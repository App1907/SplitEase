import { EventType } from '../enum/enum';

export const API_PREFIX = '/api/v1';

export const HEADER = {
  DEVICE_ID: 'device_id',
  DEVICE_TYPE: 'device_type',
  TIMEZONE: 'timezone',
  LANG: 'lang',
  AUTHORIZATION: 'authorization',
  ACCESS_TOKEN: 'x-access-token',
  REFRESH_TOKEN: 'x-refresh-token',
  REQUEST_ID: 'x-request-id',
  RETRY_AFTER: 'retry-after',
} as const;

export const EXPOSED_HEADERS = [
  HEADER.ACCESS_TOKEN,
  HEADER.REFRESH_TOKEN,
  HEADER.REQUEST_ID,
  HEADER.RETRY_AFTER,
  'content-disposition',
];

export const ALLOWED_HEADERS = [
  HEADER.DEVICE_ID,
  HEADER.DEVICE_TYPE,
  HEADER.TIMEZONE,
  HEADER.LANG,
  HEADER.AUTHORIZATION,
  HEADER.REFRESH_TOKEN,
  HEADER.REQUEST_ID,
  'content-type',
];

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const MONEY = {
  CURRENCY: 'INR',
  /** ₹10 crore per single expense / settlement, in paise. Keeps every product below Number.MAX_SAFE_INTEGER. */
  MAX_AMOUNT_PAISE: 10_000_000_000,
  /** Percentages are accepted with up to 2 decimals and handled internally as basis points (1% = 100 bp). */
  BASIS_POINTS_PER_PERCENT: 100,
  TOTAL_BASIS_POINTS: 10_000,
} as const;

export const LIMITS = {
  MAX_GROUP_MEMBERS: 50,
  GROUP_NAME_MAX: 60,
  USER_NAME_MAX: 50,
  DESCRIPTION_MAX: 140,
  NOTE_MAX: 200,
  SEARCH_MAX: 100,
  JSON_BODY: '100kb',
  REFRESH_TOKEN_MAX_LENGTH: 2048,
} as const;

export const REDIS_KEYS = {
  session: (sessionId: string) => `session:${sessionId}`,
  sessionTouch: (sessionId: string) => `session:touch:${sessionId}`,
  rateLimit: (scope: string, identifier: string) => `ratelimit:${scope}:${identifier}`,
  balances: (groupId: string) => `balances:${groupId}`,
  balancesVersion: (groupId: string) => `balances:version:${groupId}`,
  settlePlan: (groupId: string) => `settleplan:${groupId}`,
  exportProgress: (exportId: string) => `export:progress:${exportId}`,
  consumerDone: (queue: string, eventId: string) => `consumer:done:${queue}:${eventId}`,
  consumerLock: (queue: string, eventId: string) => `consumer:lock:${queue}:${eventId}`,
  emailSent: (eventId: string, userId: string) => `email:sent:${eventId}:${userId}`,
} as const;

export const TTL = {
  SESSION_TOUCH_SECONDS: 60,
  CONSUMER_DONE_SECONDS: 7 * 24 * 60 * 60,
  CONSUMER_LOCK_SECONDS: 120,
  EXPORT_PROGRESS_SECONDS: 24 * 60 * 60,
} as const;

export interface QueueDefinition {
  name: string;
  bindings: EventType[];
}

export const RABBITMQ = {
  EXCHANGE: 'splitease.events',
  DEAD_LETTER_EXCHANGE: 'splitease.dlx',
  RETRY_COUNT_HEADER: 'x-retry-count',
  QUEUES: {
    BALANCE: {
      name: 'splitease.balance',
      bindings: [
        EventType.EXPENSE_CREATED,
        EventType.EXPENSE_UPDATED,
        EventType.EXPENSE_DELETED,
        EventType.SETTLEMENT_CREATED,
      ],
    },
    NOTIFICATION: {
      name: 'splitease.notification',
      bindings: [
        EventType.EXPENSE_CREATED,
        EventType.EXPENSE_UPDATED,
        EventType.EXPENSE_DELETED,
        EventType.SETTLEMENT_CREATED,
        EventType.MEMBER_ADDED,
      ],
    },
    EXPORT: {
      name: 'splitease.export',
      bindings: [EventType.EXPORT_REQUESTED],
    },
  } satisfies Record<string, QueueDefinition>,
  retryQueue: (queue: string) => `${queue}.retry`,
  deadLetterQueue: (queue: string) => `${queue}.dlq`,
} as const;

export const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;
export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
