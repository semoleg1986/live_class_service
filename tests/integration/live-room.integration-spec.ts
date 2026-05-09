import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../../src/app.module';
import { CourseAccessCheckerPort } from '../../src/application/ports/course-access-checker.port';
import { ApplicationAccessDeniedError } from '../../src/application/shared/errors';
import { BearerAuthGuard } from '../../src/modules/auth/bearer-auth.guard';
import { ApplicationErrorFilter } from '../../src/modules/common/application-error.filter';
import { installHttpObservability } from '../../src/modules/common/http-observability';

@Injectable()
class FakeBearerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: {
        accountId: string;
        roles: string[];
        tokenId: string | null;
        accessToken: string;
        requestId?: string;
        correlationId?: string;
      };
    }>();

    const accountId = req.headers['x-account-id'] ?? 'teacher-1';
    const rolesHeader = req.headers['x-roles'] ?? 'teacher';
    const roles = rolesHeader.split(',').map((item) => item.trim());

    req.user = {
      accountId,
      roles,
      tokenId: null,
      accessToken: `token-for-${accountId}`,
      requestId: req.headers['x-request-id'],
      correlationId: req.headers['x-correlation-id']
    };
    return true;
  }
}

function asUser(app: INestApplication, accountId: string, roles: string[]) {
  const withAuth = (call: any) =>
    call.set('x-account-id', accountId).set('x-roles', roles.join(','));

  return {
    post(path: string) {
      return withAuth(request(app.getHttpServer()).post(path));
    },
    get(path: string) {
      return withAuth(request(app.getHttpServer()).get(path));
    }
  };
}

async function createTestApp(): Promise<INestApplication> {
  process.env.LIVE_CLASS_USE_INMEMORY = '1';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideGuard(BearerAuthGuard)
    .useClass(FakeBearerAuthGuard)
    .overrideProvider('COURSE_ACCESS_CHECKER')
    .useValue({
      ensureCanJoinCourse: async (input: { actorAccountId: string }) => {
        if (input.actorAccountId === 'student-denied') {
          throw new ApplicationAccessDeniedError(
            'Нет активного доступа к курсу для входа в live-комнату.'
          );
        }
      }
    } satisfies CourseAccessCheckerPort)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );
  installHttpObservability(app);
  app.useGlobalFilters(new ApplicationErrorFilter());
  await app.init();
  return app;
}

const describeIntegration = process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

describeIntegration('LiveRoomController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('проходит основной lifecycle: create -> join -> leave -> kick -> close', async () => {
    const createResponse = await asUser(app, 'teacher-1', ['teacher'])
      .post('/v1/live/rooms')
      .send({
        courseId: 'course-1',
        lessonId: 'lesson-1'
      })
      .expect(201);

    const roomId = createResponse.body.roomId as string;
    expect(createResponse.body.version).toBe(1);
    expect(createResponse.body.status).toBe('created');

    const firstJoin = await asUser(app, 'student-1', ['student'])
      .post(`/v1/live/rooms/${roomId}/join`)
      .send({ expectedVersion: 1 })
      .expect(201);

    expect(firstJoin.body.version).toBe(2);
    expect(firstJoin.body.status).toBe('active');
    expect(firstJoin.body.participants).toHaveLength(1);

    const leave = await asUser(app, 'student-1', ['student'])
      .post(`/v1/live/rooms/${roomId}/leave`)
      .send({ expectedVersion: 2 })
      .expect(201);

    expect(leave.body.version).toBe(3);
    expect(leave.body.participants).toHaveLength(0);

    const secondJoin = await asUser(app, 'student-2', ['student'])
      .post(`/v1/live/rooms/${roomId}/join`)
      .send({ expectedVersion: 3 })
      .expect(201);

    expect(secondJoin.body.version).toBe(4);
    expect(secondJoin.body.participants).toHaveLength(1);

    const kick = await asUser(app, 'teacher-1', ['teacher'])
      .post(`/v1/live/rooms/${roomId}/kick`)
      .send({
        participantAccountId: 'student-2',
        expectedVersion: 4
      })
      .expect(201);

    expect(kick.body.version).toBe(5);
    expect(kick.body.participants).toHaveLength(0);

    const close = await asUser(app, 'teacher-1', ['teacher'])
      .post(`/v1/live/rooms/${roomId}/close`)
      .send({ expectedVersion: 5 })
      .expect(201);

    expect(close.body.version).toBe(6);
    expect(close.body.status).toBe('closed');

    const events = await asUser(app, 'teacher-1', ['teacher'])
      .get(`/v1/live/rooms/${roomId}/events`)
      .expect(200);

    expect(events.body).toHaveLength(6);
    expect(events.body.map((item: { eventType: string }) => item.eventType)).toEqual([
      'room_created',
      'participant_joined',
      'participant_left',
      'participant_joined',
      'participant_kicked',
      'room_closed'
    ]);

    const paged = await asUser(app, 'teacher-1', ['teacher'])
      .get(`/v1/live/rooms/${roomId}/events?fromVersion=3&limit=2`)
      .expect(200);

    expect(paged.body).toHaveLength(2);
    expect(paged.body[0].roomVersion).toBe(3);
    expect(paged.body[1].roomVersion).toBe(4);

    const attendance = await asUser(app, 'teacher-1', ['teacher'])
      .get(`/v1/live/rooms/${roomId}/attendance`)
      .expect(200);

    expect(attendance.body).toHaveLength(2);
    expect(attendance.body[0].accountId).toBe('student-1');
    expect(attendance.body[0].sessionCount).toBe(1);
    expect(attendance.body[0].lastLeftAt).toBeTruthy();
    expect(attendance.body[0].activeSessionStartedAt).toBeNull();
    expect(attendance.body[1].accountId).toBe('student-2');
    expect(attendance.body[1].sessionCount).toBe(1);
    expect(attendance.body[1].lastLeftAt).toBeTruthy();
    expect(attendance.body[1].activeSessionStartedAt).toBeNull();
  });

  it('возвращает 409 при optimistic locking конфликте', async () => {
    const createResponse = await asUser(app, 'teacher-2', ['teacher'])
      .post('/v1/live/rooms')
      .send({
        courseId: 'course-2',
        lessonId: 'lesson-2'
      })
      .expect(201);

    const roomId = createResponse.body.roomId as string;

    await asUser(app, 'student-3', ['student'])
      .post(`/v1/live/rooms/${roomId}/join`)
      .send({ expectedVersion: 1 })
      .expect(201);

    const conflict = await asUser(app, 'student-4', ['student'])
      .post(`/v1/live/rooms/${roomId}/join`)
      .set('X-Request-ID', 'req-live-conflict-001')
      .set('X-Correlation-ID', 'corr-live-conflict-001')
      .send({ expectedVersion: 1 })
      .expect(409);

    expect(conflict.body.error).toBe('Conflict');
    expect(conflict.body.request_id).toBe('req-live-conflict-001');
    expect(conflict.body.correlation_id).toBe('corr-live-conflict-001');
    expect(conflict.headers['x-request-id']).toBe('req-live-conflict-001');
    expect(conflict.headers['x-correlation-id']).toBe('corr-live-conflict-001');
  });

  it('запрещает student читать timeline комнаты', async () => {
    const createResponse = await asUser(app, 'teacher-3', ['teacher'])
      .post('/v1/live/rooms')
      .send({
        courseId: 'course-3',
        lessonId: 'lesson-3'
      })
      .expect(201);

    const roomId = createResponse.body.roomId as string;

    const denied = await asUser(app, 'student-9', ['student'])
      .get(`/v1/live/rooms/${roomId}/events`)
      .expect(400);

    expect(denied.body.message).toContain('owner teacher или admin');
  });

  it('возвращает 403 при join без доступа к курсу', async () => {
    const createResponse = await asUser(app, 'teacher-4', ['teacher'])
      .post('/v1/live/rooms')
      .send({
        courseId: 'course-4',
        lessonId: 'lesson-4'
      })
      .expect(201);

    const roomId = createResponse.body.roomId as string;

    const denied = await asUser(app, 'student-denied', ['student'])
      .post(`/v1/live/rooms/${roomId}/join`)
      .set('X-Request-ID', 'req-live-denied-001')
      .set('X-Correlation-ID', 'corr-live-denied-001')
      .send({ expectedVersion: 1 })
      .expect(403);

    expect(denied.body.message).toContain('Нет активного доступа к курсу');

    const events = await asUser(app, 'teacher-4', ['teacher'])
      .get(`/v1/live/rooms/${roomId}/events`)
      .expect(200);

    expect(events.body).toHaveLength(2);
    expect(events.body[1].eventType).toBe('participant_join_denied');
    expect(events.body[1].actorAccountId).toBe('student-denied');
    expect(events.body[1].payload).toEqual({
      role: 'student',
      courseId: 'course-4',
      reason: 'Нет активного доступа к курсу для входа в live-комнату.',
      reasonCode: 'course_access_denied',
      requestId: 'req-live-denied-001',
      correlationId: 'corr-live-denied-001'
    });
  });

  it('публикует live metrics endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(response.text).toContain('http_requests_total{service="live_class_service"');
    expect(response.text).toContain(
      'http_request_duration_seconds_sum{service="live_class_service"'
    );
    expect(response.text).toContain('live_room_rooms_created_total');
    expect(response.text).toContain('live_room_participant_joins_total');
    expect(response.text).toContain('live_room_attendance_seconds_total');
    expect(response.text).toContain('live_room_open_rooms');
    expect(response.text).toContain('live_room_active_participants');
  });

  it('echoes request and correlation ids on success responses', async () => {
    const response = await asUser(app, 'teacher-7', ['teacher'])
      .post('/v1/live/rooms')
      .set('X-Request-ID', 'req-live-create-001')
      .set('X-Correlation-ID', 'corr-live-create-001')
      .send({
        courseId: 'course-7',
        lessonId: 'lesson-7'
      })
      .expect(201);

    expect(response.headers['x-request-id']).toBe('req-live-create-001');
    expect(response.headers['x-correlation-id']).toBe('corr-live-create-001');
  });
});

describeIntegration('LiveRoomController rate limiting (e2e)', () => {
  let app: INestApplication;
  const originalEnv = {
    joinMax: process.env.LIVE_CLASS_RATE_LIMIT_JOIN_MAX,
    joinWindowSeconds: process.env.LIVE_CLASS_RATE_LIMIT_JOIN_WINDOW_SECONDS,
    leaveMax: process.env.LIVE_CLASS_RATE_LIMIT_LEAVE_MAX,
    leaveWindowSeconds: process.env.LIVE_CLASS_RATE_LIMIT_LEAVE_WINDOW_SECONDS,
    attendanceMax: process.env.LIVE_CLASS_RATE_LIMIT_ATTENDANCE_MAX,
    attendanceWindowSeconds: process.env.LIVE_CLASS_RATE_LIMIT_ATTENDANCE_WINDOW_SECONDS
  };

  beforeAll(async () => {
    process.env.LIVE_CLASS_RATE_LIMIT_JOIN_MAX = '1';
    process.env.LIVE_CLASS_RATE_LIMIT_JOIN_WINDOW_SECONDS = '60';
    process.env.LIVE_CLASS_RATE_LIMIT_LEAVE_MAX = '1';
    process.env.LIVE_CLASS_RATE_LIMIT_LEAVE_WINDOW_SECONDS = '60';
    process.env.LIVE_CLASS_RATE_LIMIT_ATTENDANCE_MAX = '1';
    process.env.LIVE_CLASS_RATE_LIMIT_ATTENDANCE_WINDOW_SECONDS = '60';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();

    process.env.LIVE_CLASS_RATE_LIMIT_JOIN_MAX = originalEnv.joinMax;
    process.env.LIVE_CLASS_RATE_LIMIT_JOIN_WINDOW_SECONDS = originalEnv.joinWindowSeconds;
    process.env.LIVE_CLASS_RATE_LIMIT_LEAVE_MAX = originalEnv.leaveMax;
    process.env.LIVE_CLASS_RATE_LIMIT_LEAVE_WINDOW_SECONDS = originalEnv.leaveWindowSeconds;
    process.env.LIVE_CLASS_RATE_LIMIT_ATTENDANCE_MAX = originalEnv.attendanceMax;
    process.env.LIVE_CLASS_RATE_LIMIT_ATTENDANCE_WINDOW_SECONDS =
      originalEnv.attendanceWindowSeconds;
  });

  it('возвращает 429 при повторном join одного и того же account в окне лимита', async () => {
    const firstRoom = await asUser(app, 'teacher-rl-join', ['teacher'])
      .post('/v1/live/rooms')
      .send({
        courseId: 'course-rl-join-1',
        lessonId: 'lesson-rl-join-1'
      })
      .expect(201);

    const secondRoom = await asUser(app, 'teacher-rl-join', ['teacher'])
      .post('/v1/live/rooms')
      .send({
        courseId: 'course-rl-join-2',
        lessonId: 'lesson-rl-join-2'
      })
      .expect(201);

    await asUser(app, 'student-rl-join', ['student'])
      .post(`/v1/live/rooms/${firstRoom.body.roomId}/join`)
      .send({ expectedVersion: 1 })
      .expect(201);

    const limited = await asUser(app, 'student-rl-join', ['student'])
      .post(`/v1/live/rooms/${secondRoom.body.roomId}/join`)
      .set('X-Request-ID', 'req-live-rl-join-001')
      .set('X-Correlation-ID', 'corr-live-rl-join-001')
      .send({ expectedVersion: 1 })
      .expect(429);

    expect(limited.body.message).toBe('Слишком много запросов, попробуйте позже.');
    expect(limited.body.request_id).toBe('req-live-rl-join-001');
    expect(limited.body.correlation_id).toBe('corr-live-rl-join-001');
  });

  it('возвращает 429 при повторном чтении attendance в окне лимита', async () => {
    const createResponse = await asUser(app, 'teacher-rl-attendance', ['teacher'])
      .post('/v1/live/rooms')
      .send({
        courseId: 'course-rl-attendance',
        lessonId: 'lesson-rl-attendance'
      })
      .expect(201);

    const roomId = createResponse.body.roomId as string;

    await asUser(app, 'teacher-rl-attendance', ['teacher'])
      .get(`/v1/live/rooms/${roomId}/attendance`)
      .expect(200);

    const limited = await asUser(app, 'teacher-rl-attendance', ['teacher'])
      .get(`/v1/live/rooms/${roomId}/attendance`)
      .set('X-Request-ID', 'req-live-rl-attendance-001')
      .set('X-Correlation-ID', 'corr-live-rl-attendance-001')
      .expect(429);

    expect(limited.body.message).toBe('Слишком много запросов, попробуйте позже.');
    expect(limited.body.request_id).toBe('req-live-rl-attendance-001');
    expect(limited.body.correlation_id).toBe('corr-live-rl-attendance-001');
  });
});
