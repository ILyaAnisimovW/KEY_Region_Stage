import { ArgumentsHost, Catch, ExceptionFilter, HttpException, type INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response, NextFunction } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { AuthConfig } from './config.js';
import type { AuthRequest } from './modules/access/access.guard.js';

@Catch()
class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<AuthRequest>();
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const codes: Record<number, string> = { 400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 429: 'RATE_LIMITED', 503: 'IDENTITY_UNAVAILABLE' };
    if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(status).json({ code: codes[status] ?? 'INTERNAL_ERROR', message: status === 500 ? 'Internal server error' : (error as Error).message, requestId: req.requestId });
  }
}
export function configureHttp(app: INestApplication, config: AuthConfig, limit = 120) {
  app.setGlobalPrefix('v1');
  app.use(helmet());
  app.enableCors({ origin: config.webOrigin, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'] });
  app.use((req: AuthRequest, res: Response, next: NextFunction) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(rateLimit({ windowMs: 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res) => { res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many requests', requestId: (req as AuthRequest).requestId }); } }));
  app.useGlobalFilters(new ErrorFilter());
}
