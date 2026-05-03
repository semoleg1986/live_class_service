import { ConfigService } from '@nestjs/config';

import { CourseAccessCheckerPort } from '../../../src/application/ports/course-access-checker.port';
import { LiveRoomFacade } from '../../../src/application/live-room/live-room.facade';
import { LiveRoomRepositoryPort } from '../../../src/application/ports/live-room-repository.port';
import {
  ApplicationAccessDeniedError,
  ApplicationConflictError,
  ApplicationNotFoundError,
  ApplicationValidationError
} from '../../../src/application/shared/errors';
import { LiveClassMetricsService } from '../../../src/infrastructure/observability/live-class-metrics.service';
import { LiveRoomSnapshot, RoomAttendanceRecord } from '../../../src/domain/live-room/live-room.types';

const NOW = '2026-04-10T10:00:00.000Z';

function snapshot(overrides: Partial<LiveRoomSnapshot> = {}): LiveRoomSnapshot {
  return {
    roomId: 'room-1',
    courseId: 'course-1',
    lessonId: 'lesson-1',
    teacherAccountId: 'teacher-1',
    status: 'created',
    version: 1,
    participantsLimit: 11,
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: null,
    endedAt: null,
    participants: [],
    ...overrides
  };
}

describe('LiveRoomFacade (unit)', () => {
  function build() {
    const repo: LiveRoomRepositoryPort = {
      save: jest.fn(
        async (_room, _expectedVersion, _events) => true
      ) as LiveRoomRepositoryPort['save'],
      getById: jest.fn(async (_roomId) => null) as LiveRoomRepositoryPort['getById'],
      getEventsByRoomId: jest.fn(
        async (_roomId, _fromVersion, _limit) => []
      ) as LiveRoomRepositoryPort['getEventsByRoomId'],
      getAttendanceByRoomId: jest.fn(
        async (_roomId) => []
      ) as LiveRoomRepositoryPort['getAttendanceByRoomId']
    };
    const checker: CourseAccessCheckerPort = {
      ensureCanJoinCourse: jest.fn(async () => undefined)
    };
    const config = { get: jest.fn((_k: string, d: number) => d) } as unknown as ConfigService;
    const metrics = new LiveClassMetricsService();
    return {
      repo,
      checker,
      metrics,
      saveMock: repo.save as unknown as jest.Mock,
      getByIdMock: repo.getById as unknown as jest.Mock,
      getEventsByRoomIdMock: repo.getEventsByRoomId as unknown as jest.Mock,
      getAttendanceByRoomIdMock: repo.getAttendanceByRoomId as unknown as jest.Mock,
      ensureCanJoinCourseMock: checker.ensureCanJoinCourse as unknown as jest.Mock,
      facade: new LiveRoomFacade(repo, checker, config, metrics)
    };
  }

  it('creates room and persists event', async () => {
    const { facade, saveMock } = build();
    const created = await facade.createRoom({
      courseId: 'course-1',
      lessonId: 'lesson-1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher']
    });

    expect(created.roomId).toBeDefined();
    expect(saveMock).toHaveBeenCalledTimes(1);
    const [, expectedVersion, events] = saveMock.mock.calls[0];
    expect(expectedVersion).toBeNull();
    expect(events[0].eventType).toBe('room_created');
  });

  it('maps not found and version conflict errors', async () => {
    const { facade, getByIdMock } = build();

    await expect(facade.getRoom('missing')).rejects.toBeInstanceOf(ApplicationNotFoundError);

    getByIdMock.mockResolvedValue(snapshot({ version: 3 }));
    await expect(
      facade.joinRoom({
        roomId: 'room-1',
        actorAccountId: 'student-1',
        actorRoles: ['student'],
        accessToken: 'token-student-1',
        expectedVersion: 1
      })
    ).rejects.toBeInstanceOf(ApplicationConflictError);
  });

  it('maps validation and save-conflict branches', async () => {
    const { facade, getByIdMock, saveMock, ensureCanJoinCourseMock } = build();

    getByIdMock.mockResolvedValue(snapshot({ status: 'closed' }));
    await expect(
      facade.joinRoom({
        roomId: 'room-1',
        actorAccountId: 'student-1',
        actorRoles: ['student'],
        accessToken: 'token-student-1'
      })
    ).rejects.toBeInstanceOf(ApplicationValidationError);

    getByIdMock.mockResolvedValue(snapshot());
    ensureCanJoinCourseMock.mockRejectedValueOnce(
      new ApplicationAccessDeniedError('Нет активного доступа к курсу для входа в live-комнату.')
    );
    await expect(
      facade.joinRoom({
        roomId: 'room-1',
        actorAccountId: 'student-1',
        actorRoles: ['student'],
        accessToken: 'token-student-1'
      })
    ).rejects.toBeInstanceOf(ApplicationAccessDeniedError);

    getByIdMock.mockResolvedValue(
      snapshot({
        status: 'active',
        version: 2,
        participants: [{ accountId: 'student-1', role: 'student', joinedAt: NOW }]
      })
    );
    saveMock.mockResolvedValue(false);
    await expect(
      facade.leaveRoom({
        roomId: 'room-1',
        actorAccountId: 'student-1'
      })
    ).rejects.toBeInstanceOf(ApplicationConflictError);
  });

  it('returns events and validates visibility policy', async () => {
    const { facade, getByIdMock, getEventsByRoomIdMock, getAttendanceByRoomIdMock } = build();
    getByIdMock.mockResolvedValue(snapshot());
    getEventsByRoomIdMock.mockResolvedValue([
      {
        eventId: 'e-1',
        roomId: 'room-1',
        roomVersion: 1,
        eventType: 'room_created',
        actorAccountId: 'teacher-1',
        occurredAt: NOW,
        payload: {}
      }
    ]);

    const events = await facade.getRoomEvents({
      roomId: 'room-1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher']
    });
    expect(events).toHaveLength(1);

    await expect(
      facade.getRoomEvents({
        roomId: 'room-1',
        actorAccountId: 'student-1',
        actorRoles: ['student']
      })
    ).rejects.toBeInstanceOf(ApplicationValidationError);

    const attendance: RoomAttendanceRecord[] = [
      {
        accountId: 'student-1',
        role: 'student',
        firstJoinedAt: NOW,
        lastJoinedAt: NOW,
        lastLeftAt: null,
        activeSessionStartedAt: NOW,
        totalAttendanceSeconds: 0,
        sessionCount: 1,
        updatedAt: NOW
      }
    ];
    getAttendanceByRoomIdMock.mockResolvedValue(attendance);
    const records = await facade.getRoomAttendance({
      roomId: 'room-1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher']
    });
    expect(records).toHaveLength(1);
  });

  it('executes join/leave/kick/close success flows and emits proper events', async () => {
    const { facade, getByIdMock, getEventsByRoomIdMock, saveMock, ensureCanJoinCourseMock } =
      build();

    // join without explicit role uses first actor role
    getByIdMock.mockResolvedValue(snapshot());
    const joined = await facade.joinRoom({
      roomId: 'room-1',
      actorAccountId: 'student-1',
      actorRoles: ['student'],
      accessToken: 'token-student-1'
    });
    expect(joined.version).toBe(2);
    expect(ensureCanJoinCourseMock).toHaveBeenCalledWith({
      courseId: 'course-1',
      actorAccountId: 'student-1',
      actorRoles: ['student'],
      accessToken: 'token-student-1'
    });
    expect(saveMock.mock.calls.at(-1)?.[2][0].eventType).toBe('participant_joined');
    expect(saveMock.mock.calls.at(-1)?.[2][0].payload).toEqual({ role: 'student' });

    getByIdMock.mockResolvedValue(snapshot());
    ensureCanJoinCourseMock.mockClear();
    await facade.joinRoom({
      roomId: 'room-1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher'],
      accessToken: 'token-teacher-1'
    });
    expect(ensureCanJoinCourseMock).not.toHaveBeenCalled();

    // leave
    getByIdMock.mockResolvedValue(
      snapshot({
        status: 'active',
        version: 2,
        participants: [{ accountId: 'student-1', role: 'student', joinedAt: NOW }]
      })
    );
    const left = await facade.leaveRoom({
      roomId: 'room-1',
      actorAccountId: 'student-1'
    });
    expect(left.version).toBe(3);
    expect(saveMock.mock.calls.at(-1)?.[2][0].eventType).toBe('participant_left');

    // kick with explicit participant id
    getByIdMock.mockResolvedValue(
      snapshot({
        status: 'active',
        version: 3,
        participants: [{ accountId: 'student-2', role: 'student', joinedAt: NOW }]
      })
    );
    const kicked = await facade.kickFromRoom({
      roomId: 'room-1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher'],
      participantAccountId: 'student-2'
    });
    expect(kicked.version).toBe(4);
    expect(saveMock.mock.calls.at(-1)?.[2][0].eventType).toBe('participant_kicked');
    expect(saveMock.mock.calls.at(-1)?.[2][0].payload).toEqual({
      participantAccountId: 'student-2'
    });

    // close
    getByIdMock.mockResolvedValue(
      snapshot({
        status: 'active',
        version: 4
      })
    );
    const closed = await facade.closeRoom({
      roomId: 'room-1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher']
    });
    expect(closed.status).toBe('closed');
    expect(saveMock.mock.calls.at(-1)?.[2][0].eventType).toBe('room_closed');

    // get events passes pagination args through repository
    getByIdMock.mockResolvedValue(snapshot());
    getEventsByRoomIdMock.mockResolvedValue([]);
    await facade.getRoomEvents({
      roomId: 'room-1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher'],
      fromVersion: 2,
      limit: 5
    });
    expect(getEventsByRoomIdMock).toHaveBeenCalledWith('room-1', 2, 5);
  });

  it('returns unchanged snapshot and does not persist duplicate or noop attendance transitions', async () => {
    const { facade, getByIdMock, saveMock } = build();

    getByIdMock.mockResolvedValue(
      snapshot({
        status: 'active',
        version: 2,
        participants: [{ accountId: 'student-1', role: 'student', joinedAt: NOW }]
      })
    );

    const duplicateJoin = await facade.joinRoom({
      roomId: 'room-1',
      actorAccountId: 'student-1',
      actorRoles: ['student'],
      accessToken: 'token-student-1'
    });
    expect(duplicateJoin.version).toBe(2);
    expect(saveMock).not.toHaveBeenCalled();

    const noopLeave = await facade.leaveRoom({
      roomId: 'room-1',
      actorAccountId: 'missing-student'
    });
    expect(noopLeave.version).toBe(2);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
