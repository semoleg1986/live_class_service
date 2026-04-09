import { InvariantViolationError } from '../shared/errors';
import { LiveRoomPolicy } from './live-room.policy';
import { LiveRoomSnapshot } from './live-room.types';

export class LiveRoomAggregate {
  private constructor(private readonly state: LiveRoomSnapshot) {}

  static create(input: {
    roomId: string;
    courseId: string;
    lessonId: string;
    teacherAccountId: string;
    actorRoles: string[];
    participantsLimit: number;
    nowIso: string;
  }): LiveRoomAggregate {
    LiveRoomPolicy.ensureCanCreate(input.actorRoles);

    if (input.participantsLimit < 2 || input.participantsLimit > 50) {
      throw new InvariantViolationError(
        'participantsLimit должен быть в диапазоне 2..50.',
      );
    }

    return new LiveRoomAggregate({
      roomId: input.roomId,
      courseId: input.courseId,
      lessonId: input.lessonId,
      teacherAccountId: input.teacherAccountId,
      status: 'created',
      version: 1,
      participantsLimit: input.participantsLimit,
      createdAt: input.nowIso,
      updatedAt: input.nowIso,
      startedAt: null,
      endedAt: null,
      participants: [],
    });
  }

  static restore(snapshot: LiveRoomSnapshot): LiveRoomAggregate {
    return new LiveRoomAggregate({
      ...snapshot,
      participants: snapshot.participants.map((item) => ({ ...item })),
    });
  }

  join(input: { accountId: string; role: string; nowIso: string }): void {
    if (this.state.status === 'closed') {
      throw new InvariantViolationError('Комната уже закрыта.');
    }

    if (this.state.participants.some((item) => item.accountId === input.accountId)) {
      return;
    }

    if (this.state.participants.length >= this.state.participantsLimit) {
      throw new InvariantViolationError('Достигнут лимит участников комнаты.');
    }

    this.state.participants.push({
      accountId: input.accountId,
      role: input.role,
      joinedAt: input.nowIso,
    });

    if (this.state.status === 'created') {
      this.state.status = 'active';
      this.state.startedAt = input.nowIso;
    }

    this.touch(input.nowIso);
  }

  leave(input: { accountId: string; nowIso: string }): void {
    if (this.state.status === 'closed') {
      throw new InvariantViolationError('Комната уже закрыта.');
    }

    const initialLength = this.state.participants.length;
    this.state.participants = this.state.participants.filter(
      (item) => item.accountId !== input.accountId,
    );

    if (this.state.participants.length === initialLength) {
      return;
    }

    this.touch(input.nowIso);
  }

  kick(input: {
    actorAccountId: string;
    actorRoles: string[];
    participantAccountId: string;
    nowIso: string;
  }): void {
    LiveRoomPolicy.ensureCanManageParticipants(
      input.actorAccountId,
      input.actorRoles,
      this.state.teacherAccountId,
    );

    if (this.state.status === 'closed') {
      throw new InvariantViolationError('Комната уже закрыта.');
    }

    if (
      input.participantAccountId === this.state.teacherAccountId &&
      !input.actorRoles.includes('admin')
    ) {
      throw new InvariantViolationError(
        'Только admin может исключить owner teacher из комнаты.',
      );
    }

    const initialLength = this.state.participants.length;
    this.state.participants = this.state.participants.filter(
      (item) => item.accountId !== input.participantAccountId,
    );

    if (this.state.participants.length === initialLength) {
      return;
    }

    this.touch(input.nowIso);
  }

  close(input: { actorAccountId: string; actorRoles: string[]; nowIso: string }): void {
    LiveRoomPolicy.ensureCanClose(
      input.actorAccountId,
      input.actorRoles,
      this.state.teacherAccountId,
    );

    if (this.state.status === 'closed') {
      return;
    }

    this.state.status = 'closed';
    this.state.endedAt = input.nowIso;
    this.touch(input.nowIso);
  }

  toSnapshot(): LiveRoomSnapshot {
    return {
      ...this.state,
      participants: this.state.participants.map((item) => ({ ...item })),
    };
  }

  private touch(nowIso: string): void {
    this.state.version += 1;
    this.state.updatedAt = nowIso;
  }
}
