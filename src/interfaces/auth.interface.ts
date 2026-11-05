export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  deviceId: string;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
