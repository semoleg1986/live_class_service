import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LiveRoomFacade } from '../../application/live-room/live-room.facade';
import { RedisStreamOutboxRelayService } from '../messaging/redis-stream-outbox-relay.service';
import { InMemoryLiveRoomRepository } from '../persistence/inmemory/inmemory-live-room.repository';
import { PostgresLiveRoomRepository } from '../persistence/postgres/postgres-live-room.repository';

export const liveRoomProviders: Provider[] = [
  InMemoryLiveRoomRepository,
  PostgresLiveRoomRepository,
  {
    provide: 'LIVE_ROOM_REPOSITORY',
    inject: [ConfigService, InMemoryLiveRoomRepository, PostgresLiveRoomRepository],
    useFactory: (
      configService: ConfigService,
      inMemoryRepository: InMemoryLiveRoomRepository,
      postgresRepository: PostgresLiveRoomRepository,
    ) => {
      const useInMemory = configService.get<boolean>(
        'liveClass.useInmemory',
        true,
      );
      return useInMemory ? inMemoryRepository : postgresRepository;
    },
  },
  RedisStreamOutboxRelayService,
  LiveRoomFacade,
];
