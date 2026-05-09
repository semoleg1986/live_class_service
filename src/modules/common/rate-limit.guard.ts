import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { AuthUser } from '../auth/auth-user.interface';
import { RequestWithObservability } from './http-observability';
import { LIVE_ROOM_RATE_LIMIT_POLICY, LiveRoomRateLimitPolicyName } from './rate-limit.decorator';

type RateLimitPolicy = {
  max: number;
  windowSeconds: number;
};

type RateLimitedRequest = RequestWithObservability & {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  user?: AuthUser;
};

@Injectable()
export class LiveRoomRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policyName = this.reflector.getAllAndOverride<LiveRoomRateLimitPolicyName>(
      LIVE_ROOM_RATE_LIMIT_POLICY,
      [context.getHandler(), context.getClass()]
    );
    if (!policyName) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const policy = this.getPolicy(policyName);
    if (policy.max <= 0 || policy.windowSeconds <= 0) {
      return true;
    }

    const actorKey = this.resolveActorKey(request);
    const bucketKey = `${policyName}:${actorKey}`;
    const now = Date.now();
    const windowStart = now - policy.windowSeconds * 1000;
    const hits = (this.buckets.get(bucketKey) ?? []).filter((hit) => hit > windowStart);

    if (hits.length >= policy.max) {
      throw new HttpException(
        {
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Слишком много запросов, попробуйте позже.',
          request_id: request.requestId,
          correlation_id: request.correlationId
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    hits.push(now);
    this.buckets.set(bucketKey, hits);
    return true;
  }

  private getPolicy(policyName: LiveRoomRateLimitPolicyName): RateLimitPolicy {
    switch (policyName) {
      case 'join':
        return {
          max: this.configService.get<number>('liveClass.rateLimit.joinMax', 20),
          windowSeconds: this.configService.get<number>('liveClass.rateLimit.joinWindowSeconds', 60)
        };
      case 'leave':
        return {
          max: this.configService.get<number>('liveClass.rateLimit.leaveMax', 30),
          windowSeconds: this.configService.get<number>(
            'liveClass.rateLimit.leaveWindowSeconds',
            60
          )
        };
      case 'attendance':
        return {
          max: this.configService.get<number>('liveClass.rateLimit.attendanceMax', 60),
          windowSeconds: this.configService.get<number>(
            'liveClass.rateLimit.attendanceWindowSeconds',
            60
          )
        };
    }
  }

  private resolveActorKey(request: RateLimitedRequest): string {
    const accountId = request.user?.accountId;
    if (accountId) {
      return accountId;
    }

    const trustXForwardedFor = this.configService.get<boolean>(
      'liveClass.trustXForwardedFor',
      false
    );
    if (trustXForwardedFor) {
      const forwardedFor = request.headers['x-forwarded-for'];
      if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0].trim();
      }
    }

    if (request.ip) {
      return request.ip;
    }

    if (request.socket?.remoteAddress) {
      return request.socket.remoteAddress;
    }

    return 'anonymous';
  }
}
