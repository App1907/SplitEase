import { type DeviceType, type Lang } from '../enum/enum';
import { type AuthenticatedUser, type RefreshTokenPayload } from './auth.interface';

export interface DeviceContext {
  deviceId: string;
  deviceType: DeviceType;
  timezone: string;
  lang: Lang;
}

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

export interface GroupMemberContext {
  userId: string;
  joinedAt: Date;
}

/** The group loaded once by groupMember.middleware and reused by the services. */
export interface GroupContext {
  id: string;
  name: string;
  createdBy: string;
  members: GroupMemberContext[];
  createdAt: Date;
  updatedAt: Date;
}

export type ValidatedSource = 'body' | 'query' | 'params';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      ctx?: DeviceContext;
      user?: AuthenticatedUser;
      refreshToken?: RefreshTokenPayload;
      group?: GroupContext;
      validated?: Partial<Record<ValidatedSource, unknown>>;
    }
  }
}
