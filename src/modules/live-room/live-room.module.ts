import { Module } from '@nestjs/common';

import { liveRoomProviders } from '../../infrastructure/di/live-room.providers';
import { LiveRoomController } from './live-room.controller';
import { LiveRoomGateway } from './live-room.gateway';
import { LiveRoomService } from './live-room.service';

@Module({
  controllers: [LiveRoomController],
  providers: [...liveRoomProviders, LiveRoomService, LiveRoomGateway],
  exports: liveRoomProviders
})
export class LiveRoomModule {}
