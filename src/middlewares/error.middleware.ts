import { type NextFunction, type Request, type Response } from 'express';
import { mongo, Error as MongooseError } from 'mongoose';
import { AppError, ErrorCode } from '../common/errors';
import { MESSAGES } from '../common/messages';
import { ApiResponse } from '../common/responses';
import { logger } from '../logger/logger';

interface HttpLikeError {
  type?: string;
  status?: number;
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return typeof error === 'object' && error !== null && ('type' in error || 'status' in error);
}

export class ErrorMiddleware {
  static normalize(error: unknown): AppError {
    if (error instanceof AppError) return error;

    if (isHttpLikeError(error)) {
      if (error.type === 'entity.parse.failed') {
        return AppError.validation(
          [{ field: 'body', message: 'Body is not valid JSON' }],
          MESSAGES.MALFORMED_JSON,
        );
      }
      if (error.type === 'entity.too.large') return new AppError(ErrorCode.PAYLOAD_TOO_LARGE);
      if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
        return AppError.validation([{ field: 'body', message: 'Unsupported body encoding' }]);
      }
    }

    if (error instanceof MongooseError.CastError) {
      return AppError.validation([{ field: error.path, message: `Invalid value for ${error.path}` }]);
    }
    if (error instanceof MongooseError.ValidationError) {
      return AppError.validation(
        Object.values(error.errors).map((issue) => ({ field: issue.path, message: issue.message })),
      );
    }
    if (error instanceof mongo.MongoServerError && error.code === 11000) {
      return new AppError(ErrorCode.CONFLICT, { cause: error });
    }

    return new AppError(ErrorCode.INTERNAL_ERROR, { cause: error });
  }

  static handle(error: unknown, req: Request, res: Response, _next: NextFunction): void {
    const appError = ErrorMiddleware.normalize(error);
    if (appError.isOperational) {
      logger.debug('Request rejected', { code: appError.code, path: req.originalUrl });
    } else {
      logger.error('Unhandled error', {
        error: error instanceof Error ? error : String(error),
        path: req.originalUrl,
      });
    }
    if (res.headersSent) return;
    ApiResponse.error(req, res, appError);
  }

  static notFound(_req: Request, _res: Response, next: NextFunction): void {
    next(AppError.notFound(MESSAGES.ROUTE_NOT_FOUND));
  }
}

export const errorMiddleware = ErrorMiddleware.handle;
export const notFoundMiddleware = ErrorMiddleware.notFound;
