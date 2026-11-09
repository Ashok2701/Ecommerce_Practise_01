import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Business error. `code` is a translation key the portal shows in the user's
 * language (errors.* in lib/i18n/locales/*.json); `message` is English for logs.
 */
export class AppError extends Error {
  constructor(public code: string, public status = 400, message?: string) { super(message ?? code); }
}

export const notFound = (code = 'errors.notFound') => new AppError(code, 404);
export const forbidden = () => new AppError('errors.forbidden', 403);
export const badRequest = (code: string) => new AppError(code, 400);
export const conflict = (code: string) => new AppError(code, 409);

/** Every error leaves the API as { code, message }. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private log = new Logger('API');
  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof AppError) return res.status(err.status).json({ code: err.code, message: err.message });
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const code = status === 401 ? 'errors.auth.unauthorized' : status === 403 ? 'errors.forbidden' : status === 404 ? 'errors.notFound' : 'errors.generic';
      return res.status(status).json({ code, message: err.message });
    }
    const e = err as Error & { code?: string };
    // the shared domain code throws new Error('errors.x.y')
    if (typeof e?.message === 'string' && /^errors\.[a-zA-Z.]+$/.test(e.message)) {
      const status = /notFound$/.test(e.message) ? 404 : e.message === 'errors.forbidden' ? 403 : 400;
      return res.status(status).json({ code: e.message, message: e.message });
    }
    this.log.error(e?.stack ?? String(err));
    return res.status(500).json({ code: 'errors.generic', message: 'Internal error' });
  }
}
