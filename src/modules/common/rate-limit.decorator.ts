import { SetMetadata } from '@nestjs/common';

export type LiveRoomRateLimitPolicyName = 'attendance' | 'join' | 'leave';

export const LIVE_ROOM_RATE_LIMIT_POLICY = 'live_room_rate_limit_policy';

export const LiveRoomRateLimit = (policy: LiveRoomRateLimitPolicyName) =>
  SetMetadata(LIVE_ROOM_RATE_LIMIT_POLICY, policy);
