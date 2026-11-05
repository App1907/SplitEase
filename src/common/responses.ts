import { type Request, type Response } from 'express';
import { HEADER } from './constant';
import { type AppError, type ErrorDetail } from './errors';
import { type LocalizedText } from './messages';
import { Lang } from '../enum/enum';

export interface SuccessEnvelope<T> {
  statusCode: number;
  message: string;
  data: T;
}

export interface ErrorEnvelope {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  details?: ErrorDetail[];
}

export function resolveLang(req: Request): Lang {
  if (req.ctx) return req.ctx.lang;
  const raw = req.get(HEADER.LANG)?.trim().toLowerCase();
  return (Object.values(Lang) as string[]).includes(raw ?? '') ? (raw as Lang) : Lang.EN;
}

export class ApiResponse {
  static send<T>(req: Request, res: Response, statusCode: number, message: LocalizedText, data: T): void {
    const body: SuccessEnvelope<T> = { statusCode, message: message[resolveLang(req)], data };
    res.status(statusCode).json(body);
  }

  static ok<T>(req: Request, res: Response, message: LocalizedText, data: T): void {
    ApiResponse.send(req, res, 200, message, data);
  }

  static created<T>(req: Request, res: Response, message: LocalizedText, data: T): void {
    ApiResponse.send(req, res, 201, message, data);
  }

  static accepted<T>(req: Request, res: Response, message: LocalizedText, data: T): void {
    ApiResponse.send(req, res, 202, message, data);
  }

  static error(req: Request, res: Response, error: AppError): void {
    const body: ErrorEnvelope = {
      statusCode: error.statusCode,
      code: error.code,
      message: error.messageFor(resolveLang(req)),
      requestId: req.requestId,
    };
    if (error.details?.length) body.details = error.details;
    if (error.retryAfterSeconds !== undefined)
      res.setHeader(HEADER.RETRY_AFTER, String(error.retryAfterSeconds));
    res.status(error.statusCode).json(body);
  }
}
