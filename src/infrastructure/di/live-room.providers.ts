import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CourseAccessCheckerPort } from '../../application/ports/course-access-checker.port';
import { LiveRoomFacade } from '../../application/live-room/live-room.facade';
import { HttpCourseAccessChecker } from '../access/http-course-access-checker';
import { InMemoryCourseAccessChecker } from '../access/inmemory-course-access-checker';
import { RedisStreamOutboxRelayService } from '../messaging/redis-stream-outbox-relay.service';
import { LiveClassMetricsService } from '../observability/live-class-metrics.service';
import { InMemoryLiveRoomRepository } from '../persistence/inmemory/inmemory-live-room.repository';
import { PostgresLiveRoomRepository } from '../persistence/postgres/postgres-live-room.repository';

export const liveRoomProviders: Provider[] = [
  InMemoryCourseAccessChecker,
  HttpCourseAccessChecker,
  InMemoryLiveRoomRepository,
  PostgresLiveRoomRepository,
  {
    provide: 'LIVE_ROOM_REPOSITORY',
    inject: [ConfigService, InMemoryLiveRoomRepository, PostgresLiveRoomRepository],
    useFactory: (
      configService: ConfigService,
      inMemoryRepository: InMemoryLiveRoomRepository,
      postgresRepository: PostgresLiveRoomRepository
    ) => {
      const useInMemory = configService.get<boolean>('liveClass.useInmemory', true);
      return useInMemory ? inMemoryRepository : postgresRepository;
    }
  },
  {
    provide: 'COURSE_ACCESS_CHECKER',
    inject: [ConfigService, InMemoryCourseAccessChecker, HttpCourseAccessChecker],
    useFactory: (
      configService: ConfigService,
      inMemoryChecker: InMemoryCourseAccessChecker,
      httpChecker: HttpCourseAccessChecker
    ): CourseAccessCheckerPort => {
      const useInMemory = configService.get<boolean>('liveClass.useInmemory', true);
      return useInMemory ? inMemoryChecker : httpChecker;
    }
  },
  RedisStreamOutboxRelayService,
  LiveClassMetricsService,
  LiveRoomFacade
];
