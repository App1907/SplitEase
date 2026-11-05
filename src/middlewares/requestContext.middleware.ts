import { randomUUID } from 'node:crypto';
import { type NextFunction, type Request, type Response } from 'express';
import { HEADER } from '../common/constant';
import { logContext, logger } from '../logger/logger';

const SAFE_REQUEST_ID = /^[\w-]{8,64}$/;

/** Reuses a sane incoming x-request-id (or creates one) and scopes logs to it. */
export class RequestContextMiddleware {
  static handle(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.get(HEADER.REQUEST_ID);
    const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader(HEADER.REQUEST_ID, requestId);

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
      logger.log(level, `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`, {
        requestId,
        userId: req.user?.userId,
        ip: req.ip,
      });
    });

    logContext.run({ requestId }, () => next());
  }
}

export const requestContextMiddleware = RequestContextMiddleware.handle;
