import { InvariantViolationError } from '../shared/errors';

export class LiveRoomPolicy {
  static ensureCanCreate(roles: string[]): void {
    if (!roles.includes('teacher') && !roles.includes('admin')) {
      throw new InvariantViolationError(
        'Создавать live-комнаты могут только teacher или admin.',
      );
    }
  }

  static ensureCanClose(
    actorAccountId: string,
    actorRoles: string[],
    teacherAccountId: string,
  ): void {
    if (actorAccountId !== teacherAccountId && !actorRoles.includes('admin')) {
      throw new InvariantViolationError(
        'Закрыть комнату может только owner teacher или admin.',
      );
    }
  }

  static ensureCanManageParticipants(
    actorAccountId: string,
    actorRoles: string[],
    teacherAccountId: string,
  ): void {
    if (actorAccountId !== teacherAccountId && !actorRoles.includes('admin')) {
      throw new InvariantViolationError(
        'Управлять участниками может только owner teacher или admin.',
      );
    }
  }

  static ensureCanViewEvents(
    actorAccountId: string,
    actorRoles: string[],
    teacherAccountId: string,
  ): void {
    if (actorAccountId !== teacherAccountId && !actorRoles.includes('admin')) {
      throw new InvariantViolationError(
        'Просматривать timeline комнаты может только owner teacher или admin.',
      );
    }
  }
}
