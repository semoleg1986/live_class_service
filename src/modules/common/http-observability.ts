import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { LiveClassMetricsService } from '../../infrastructure/observability/live-class-metrics.service';

export type RequestWithObservability = Request & {
  requestId?: string;
  correlationId?: string;
};

export function installHttpObservability(app: INestApplication): void {
  const metricsService = app.get(LiveClassMetricsService, { strict: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const observed = req as RequestWithObservability;
    const requestId = req.header('X-Request-ID') ?? randomUUID();
    const correlationId = req.header('X-Correlation-ID') ?? requestId;
    const startedAt = process.hrtime.bigint();

    observed.requestId = requestId;
    observed.correlationId = correlationId;
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Correlation-ID', correlationId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.on('finish', () => {
      const routePath =
        ((req as Request & { route?: { path?: string } }).route?.path as string | undefined) ??
        req.path;
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      metricsService?.recordHttpRequest({
        method: req.method,
        path: routePath,
        status: res.statusCode,
        durationSeconds
      });
    });
    next();
  });
}
