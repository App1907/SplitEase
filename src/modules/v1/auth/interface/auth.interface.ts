import { type DeviceType, type Lang } from '../../../../enum/enum';
import { type TokenPair } from '../../../../interfaces/auth.interface';

export interface AuthUserResponse {
  id: string;
  name: string;
  email: string;
}

export interface AuthResult {
  user: AuthUserResponse;
  tokens: TokenPair;
}

export interface SessionResponse {
  sessionId: string;
  deviceId: string;
  deviceType: DeviceType;
  timezone: string;
  lang: Lang;
  ip?: string;
  userAgent?: string;
  loginAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  current: boolean;
}
