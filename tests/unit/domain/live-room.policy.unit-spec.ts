import { InvariantViolationError } from '../../../src/domain/shared/errors';
import { LiveRoomPolicy } from '../../../src/domain/live-room/live-room.policy';

describe('LiveRoomPolicy (unit)', () => {
  it('allows teacher/admin create and denies others', () => {
    expect(() => LiveRoomPolicy.ensureCanCreate(['teacher'])).not.toThrow();
    expect(() => LiveRoomPolicy.ensureCanCreate(['admin'])).not.toThrow();
    expect(() => LiveRoomPolicy.ensureCanCreate(['student'])).toThrow(InvariantViolationError);
  });

  it('checks close/manage/view permissions', () => {
    expect(() =>
      LiveRoomPolicy.ensureCanClose('teacher-1', ['teacher'], 'teacher-1')
    ).not.toThrow();
    expect(() =>
      LiveRoomPolicy.ensureCanManageParticipants('admin-1', ['admin'], 'teacher-1')
    ).not.toThrow();
    expect(() =>
      LiveRoomPolicy.ensureCanViewEvents('admin-1', ['admin'], 'teacher-1')
    ).not.toThrow();

    expect(() => LiveRoomPolicy.ensureCanClose('student-1', ['student'], 'teacher-1')).toThrow(
      InvariantViolationError
    );
    expect(() =>
      LiveRoomPolicy.ensureCanManageParticipants('student-1', ['student'], 'teacher-1')
    ).toThrow(InvariantViolationError);
    expect(() => LiveRoomPolicy.ensureCanViewEvents('student-1', ['student'], 'teacher-1')).toThrow(
      InvariantViolationError
    );
  });
});
