import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { type z, type ZodTypeAny } from 'zod';
import { AppError } from '../common/errors';
import { type ValidatedSource } from '../interfaces/request.interface';

function parseOrThrow<S extends ZodTypeAny>(schema: S, input: unknown, source: ValidatedSource): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw AppError.validation(
      result.error.issues.map((issue) => ({
        field: [source, ...issue.path].join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data as z.output<S>;
}

export class ValidateMiddleware {
  static validate(schema: ZodTypeAny, source: ValidatedSource = 'body'): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
      const data = parseOrThrow(schema, req[source] ?? {}, source);
      req.validated = { ...req.validated, [source]: data };
      next();
    };
  }
}

export const validate = ValidateMiddleware.validate;

export function validated<S extends ZodTypeAny>(
  req: Request,
  schema: S,
  source: ValidatedSource = 'body',
): z.output<S> {
  const value = req.validated?.[source];
  return value === undefined ? parseOrThrow(schema, req[source] ?? {}, source) : (value as z.output<S>);
}
