import { Module } from '@nestjs/common';

import { liveRoomProviders } from '../../infrastructure/di/live-room.providers';
import { LiveRoomRateLimitGuard } from '../common/rate-limit.guard';
import { LiveRoomController } from './live-room.controller';
import { LiveRoomGateway } from './live-room.gateway';
import { LiveRoomService } from './live-room.service';

@Module({
  controllers: [LiveRoomController],
  providers: [...liveRoomProviders, LiveRoomRateLimitGuard, LiveRoomService, LiveRoomGateway],
  exports: liveRoomProviders
})
export class LiveRoomModule {}
