import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { installHttpObservability } from '../../../src/modules/common/http-observability';

describe('installHttpObservability', () => {
  it('sets request, correlation, and baseline security headers', () => {
    const metricsService = {
      recordHttpRequest: jest.fn()
    };
    let registered: ((req: Request, res: Response, next: NextFunction) => void) | undefined;
    const app = {
      get: jest.fn(() => metricsService),
      use: jest.fn((middleware: (req: Request, res: Response, next: NextFunction) => void) => {
        registered = middleware;
      })
    } as unknown as INestApplication;

    installHttpObservability(app);

    expect(registered).toBeDefined();

    const headers = new Map<string, string>();
    const req = {
      method: 'GET',
      path: '/healthz',
      header: (name: string) => {
        if (name === 'X-Request-ID') {
          return 'req-live-001';
        }
        if (name === 'X-Correlation-ID') {
          return 'corr-live-001';
        }
        return undefined;
      }
    } as unknown as Request;
    const res = {
      on: jest.fn((_event: string, cb: () => void) => cb()),
      statusCode: 200,
      setHeader: jest.fn((name: string, value: string) => {
        headers.set(name, value);
      })
    } as unknown as Response;
    const next = jest.fn();

    registered!(req, res, next);

    expect(headers.get('X-Request-ID')).toBe('req-live-001');
    expect(headers.get('X-Correlation-ID')).toBe('corr-live-001');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
    expect(metricsService.recordHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/healthz',
        status: 200
      })
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
