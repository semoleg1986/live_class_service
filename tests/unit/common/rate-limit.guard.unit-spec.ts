import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { LiveRoomRateLimitGuard } from '../../../src/modules/common/rate-limit.guard';

function buildContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    }),
    getHandler: () => undefined,
    getClass: () => undefined
  } as never;
}

describe('LiveRoomRateLimitGuard', () => {
  it('ignores x-forwarded-for by default', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => 'join')
    } as unknown as Reflector;
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'liveClass.rateLimit.joinMax') {
          return 1;
        }
        if (key === 'liveClass.rateLimit.joinWindowSeconds') {
          return 60;
        }
        return fallback;
      })
    } as never;
    const guard = new LiveRoomRateLimitGuard(reflector, configService);

    const first = {
      headers: { 'x-forwarded-for': '203.0.113.10' },
      ip: '127.0.0.1'
    };
    const second = {
      headers: { 'x-forwarded-for': '203.0.113.11' },
      ip: '127.0.0.1'
    };

    expect(guard.canActivate(buildContext(first))).toBe(true);
    expect(() => guard.canActivate(buildContext(second))).toThrow(HttpException);
  });

  it('can trust x-forwarded-for when explicitly enabled', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => 'join')
    } as unknown as Reflector;
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'liveClass.rateLimit.joinMax') {
          return 1;
        }
        if (key === 'liveClass.rateLimit.joinWindowSeconds') {
          return 60;
        }
        if (key === 'liveClass.trustXForwardedFor') {
          return true;
        }
        return fallback;
      })
    } as never;
    const guard = new LiveRoomRateLimitGuard(reflector, configService);

    const first = {
      headers: { 'x-forwarded-for': '203.0.113.10' },
      ip: '127.0.0.1'
    };
    const second = {
      headers: { 'x-forwarded-for': '203.0.113.11' },
      ip: '127.0.0.1'
    };

    expect(guard.canActivate(buildContext(first))).toBe(true);
    expect(guard.canActivate(buildContext(second))).toBe(true);
  });
});
