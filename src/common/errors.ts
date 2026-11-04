import { type Lang } from '../enum/enum';
import { type LocalizedText } from './messages';

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DEVICE_ID_REQUIRED: 'DEVICE_ID_REQUIRED',
  INVALID_DEVICE_ID: 'INVALID_DEVICE_ID',
  DEVICE_TYPE_REQUIRED: 'DEVICE_TYPE_REQUIRED',
  INVALID_DEVICE_TYPE: 'INVALID_DEVICE_TYPE',
  TIMEZONE_REQUIRED: 'TIMEZONE_REQUIRED',
  INVALID_TIMEZONE: 'INVALID_TIMEZONE',
  LANG_REQUIRED: 'LANG_REQUIRED',
  INVALID_LANG: 'INVALID_LANG',
  SPLIT_TOTAL_MISMATCH: 'SPLIT_TOTAL_MISMATCH',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  NOT_GROUP_MEMBER: 'NOT_GROUP_MEMBER',
  NOT_FOUND: 'NOT_FOUND',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  BALANCE_NOT_SETTLED: 'BALANCE_NOT_SETTLED',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  DEVICE_ID_REQUIRED: 400,
  INVALID_DEVICE_ID: 400,
  DEVICE_TYPE_REQUIRED: 400,
  INVALID_DEVICE_TYPE: 400,
  TIMEZONE_REQUIRED: 400,
  INVALID_TIMEZONE: 400,
  LANG_REQUIRED: 400,
  INVALID_LANG: 400,
  SPLIT_TOTAL_MISMATCH: 400,
  UNAUTHORIZED: 401,
  TOKEN_EXPIRED: 401,
  REFRESH_TOKEN_REUSED: 401,
  NOT_GROUP_MEMBER: 403,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  ALREADY_MEMBER: 409,
  BALANCE_NOT_SETTLED: 409,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_ATTEMPTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

const DEFAULT_MESSAGES: Record<ErrorCode, LocalizedText> = {
  VALIDATION_ERROR: { en: 'Request validation failed' },
  DEVICE_ID_REQUIRED: { en: 'device_id header is required' },
  INVALID_DEVICE_ID: {
    en: 'device_id must be 1-128 characters of letters, digits, ".", "_", ":" or "-"',
  },
  DEVICE_TYPE_REQUIRED: { en: 'device_type header is required' },
  INVALID_DEVICE_TYPE: { en: 'device_type must be 1 (Android), 2 (iOS) or 3 (Web)' },
  TIMEZONE_REQUIRED: { en: 'timezone header is required' },
  INVALID_TIMEZONE: { en: 'timezone must be a valid IANA name, e.g. Asia/Kolkata' },
  LANG_REQUIRED: { en: 'lang header is required' },
  INVALID_LANG: { en: 'lang must be "en"' },
  SPLIT_TOTAL_MISMATCH: { en: 'Splits must add up to the expense amount' },
  UNAUTHORIZED: { en: 'Authentication required' },
  TOKEN_EXPIRED: { en: 'Access token expired, call /auth/refresh' },
  REFRESH_TOKEN_REUSED: {
    en: 'Refresh token was already used; the session has been revoked',
  },
  NOT_GROUP_MEMBER: { en: 'You are not a member of this group' },
  NOT_FOUND: { en: 'Resource not found' },
  EMAIL_TAKEN: { en: 'This email is already registered' },
  ALREADY_MEMBER: { en: 'User is already a member of this group' },
  BALANCE_NOT_SETTLED: { en: 'Member still has a non-zero balance in this group' },
  CONFLICT: { en: 'Resource already exists' },
  PAYLOAD_TOO_LARGE: { en: 'Request body is too large' },
  TOO_MANY_ATTEMPTS: { en: 'Too many attempts, please try again later' },
  INTERNAL_ERROR: { en: 'Something went wrong' },
  SERVICE_UNAVAILABLE: { en: 'Service temporarily unavailable' },
};

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface AppErrorOptions {
  message?: LocalizedText;
  details?: ErrorDetail[];
  retryAfterSeconds?: number;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly details?: ErrorDetail[];
  public readonly retryAfterSeconds?: number;
  private readonly localized: LocalizedText;

  constructor(
    public readonly code: ErrorCode,
    options: AppErrorOptions = {},
  ) {
    const localized = options.message ?? DEFAULT_MESSAGES[code];
    super(localized.en, { cause: options.cause });
    this.name = 'AppError';
    this.statusCode = STATUS_BY_CODE[code];
    this.localized = localized;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get isOperational(): boolean {
    return this.statusCode < 500;
  }

  messageFor(lang: Lang): string {
    return this.localized[lang];
  }

  static validation(details: ErrorDetail[], message?: LocalizedText): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, { details, message });
  }

  static notFound(message?: LocalizedText): AppError {
    return new AppError(ErrorCode.NOT_FOUND, { message });
  }

  static unauthorized(message?: LocalizedText): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, { message });
  }
}
