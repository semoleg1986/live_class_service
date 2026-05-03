import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export type RequestWithObservability = Request & {
  requestId?: string;
  correlationId?: string;
};

export function installHttpObservability(app: INestApplication): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const observed = req as RequestWithObservability;
    const requestId = req.header('X-Request-ID') ?? randomUUID();
    const correlationId = req.header('X-Correlation-ID') ?? requestId;

    observed.requestId = requestId;
    observed.correlationId = correlationId;
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Correlation-ID', correlationId);
    next();
  });
}
