import { InvariantViolationError } from '../../../src/domain/shared/errors';
import { LiveRoomAggregate } from '../../../src/domain/live-room/live-room.aggregate';

const NOW = '2026-04-10T10:00:00.000Z';

function makeAggregate(limit = 3) {
  return LiveRoomAggregate.create({
    roomId: 'room-1',
    courseId: 'course-1',
    lessonId: 'lesson-1',
    teacherAccountId: 'teacher-1',
    actorRoles: ['teacher'],
    participantsLimit: limit,
    nowIso: NOW
  });
}

describe('LiveRoomAggregate (unit)', () => {
  it('validates create invariants', () => {
    expect(() =>
      LiveRoomAggregate.create({
        roomId: 'r',
        courseId: 'c',
        lessonId: 'l',
        teacherAccountId: 't',
        actorRoles: ['student'],
        participantsLimit: 10,
        nowIso: NOW
      })
    ).toThrow(InvariantViolationError);

    expect(() => makeAggregate(1)).toThrow(InvariantViolationError);
    expect(() => makeAggregate(51)).toThrow(InvariantViolationError);
  });

  it('handles join/leave/kick/close lifecycle', () => {
    const room = makeAggregate(2);

    room.join({ accountId: 'student-1', role: 'student', nowIso: NOW });
    let snapshot = room.toSnapshot();
    expect(snapshot.status).toBe('active');
    expect(snapshot.version).toBe(2);
    expect(snapshot.participants).toHaveLength(1);

    room.join({ accountId: 'student-1', role: 'student', nowIso: NOW });
    expect(room.toSnapshot().version).toBe(2);

    room.join({ accountId: 'student-2', role: 'student', nowIso: NOW });
    expect(room.toSnapshot().participants).toHaveLength(2);

    expect(() => room.join({ accountId: 'student-3', role: 'student', nowIso: NOW })).toThrow(
      InvariantViolationError
    );

    room.leave({ accountId: 'unknown', nowIso: NOW });
    expect(room.toSnapshot().version).toBe(3);

    room.leave({ accountId: 'student-1', nowIso: NOW });
    expect(room.toSnapshot().participants).toHaveLength(1);

    expect(() =>
      room.kick({
        actorAccountId: 'teacher-1',
        actorRoles: ['teacher'],
        participantAccountId: 'teacher-1',
        nowIso: NOW
      })
    ).toThrow(InvariantViolationError);

    room.kick({
      actorAccountId: 'admin-1',
      actorRoles: ['admin'],
      participantAccountId: 'teacher-1',
      nowIso: NOW
    });

    room.close({ actorAccountId: 'teacher-1', actorRoles: ['teacher'], nowIso: NOW });
    snapshot = room.toSnapshot();
    expect(snapshot.status).toBe('closed');

    const versionAfterClose = snapshot.version;
    room.close({ actorAccountId: 'teacher-1', actorRoles: ['teacher'], nowIso: NOW });
    expect(room.toSnapshot().version).toBe(versionAfterClose);

    expect(() => room.leave({ accountId: 'student-2', nowIso: NOW })).toThrow(
      InvariantViolationError
    );
    expect(() =>
      room.kick({
        actorAccountId: 'admin-1',
        actorRoles: ['admin'],
        participantAccountId: 'student-2',
        nowIso: NOW
      })
    ).toThrow(InvariantViolationError);
  });
});
