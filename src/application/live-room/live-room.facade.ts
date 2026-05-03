import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import { CourseAccessCheckerPort } from '../ports/course-access-checker.port';
import { LiveRoomAggregate } from '../../domain/live-room/live-room.aggregate';
import { LiveRoomEvent } from '../../domain/live-room/live-room-event.types';
import { LiveRoomPolicy } from '../../domain/live-room/live-room.policy';
import { LiveRoomSnapshot, RoomAttendanceRecord } from '../../domain/live-room/live-room.types';
import { InvariantViolationError, NotFoundError } from '../../domain/shared/errors';
import { LiveRoomRepositoryPort } from '../ports/live-room-repository.port';
import {
  ApplicationAccessDeniedError,
  ApplicationConflictError,
  ApplicationNotFoundError,
  ApplicationValidationError
} from '../shared/errors';
import { LiveClassMetricsService } from '../../infrastructure/observability/live-class-metrics.service';
import {
  CloseLiveRoomCommand,
  CreateLiveRoomCommand,
  JoinLiveRoomCommand,
  KickFromLiveRoomCommand,
  LeaveLiveRoomCommand
} from './live-room.commands';

@Injectable()
export class LiveRoomFacade {
  constructor(
    @Inject('LIVE_ROOM_REPOSITORY')
    private readonly repository: LiveRoomRepositoryPort,
    @Inject('COURSE_ACCESS_CHECKER')
    private readonly courseAccessChecker: CourseAccessCheckerPort,
    private readonly configService: ConfigService,
    private readonly metricsService: LiveClassMetricsService
  ) {}

  async createRoom(command: CreateLiveRoomCommand): Promise<LiveRoomSnapshot> {
    try {
      const nowIso = new Date().toISOString();
      const defaultMax = this.configService.get<number>('liveClass.maxParticipants', 11);

      const aggregate = LiveRoomAggregate.create({
        roomId: randomUUID(),
        courseId: command.courseId,
        lessonId: command.lessonId,
        teacherAccountId: command.actorAccountId,
        actorRoles: command.actorRoles,
        participantsLimit: command.participantsLimit ?? defaultMax,
        nowIso
      });

      const snapshot = aggregate.toSnapshot();
      await this.saveOrThrowConflict(snapshot, null, [
        this.newEvent({
          roomId: snapshot.roomId,
          roomVersion: snapshot.version,
          eventType: 'room_created',
          actorAccountId: command.actorAccountId,
          occurredAt: snapshot.createdAt,
          payload: {
            courseId: snapshot.courseId,
            lessonId: snapshot.lessonId,
            participantsLimit: snapshot.participantsLimit
          }
        })
      ]);
      this.metricsService.markRoomCreated(snapshot);
      return snapshot;
    } catch (error) {
      this.mapDomainError(error);
    }
  }

  async getRoom(roomId: string): Promise<LiveRoomSnapshot> {
    try {
      const snapshot = await this.repository.getById(roomId);
      if (!snapshot) {
        throw new NotFoundError('Live-комната не найдена.');
      }
      return snapshot;
    } catch (error) {
      this.mapDomainError(error);
    }
  }

  async joinRoom(command: JoinLiveRoomCommand): Promise<LiveRoomSnapshot> {
    try {
      const snapshot = await this.getRoom(command.roomId);
      this.ensureExpectedVersion(snapshot.version, command.expectedVersion);
      const effectiveRole = command.roleOverride ?? command.actorRoles[0] ?? 'student';
      if (effectiveRole === 'student') {
        await this.courseAccessChecker.ensureCanJoinCourse({
          courseId: snapshot.courseId,
          actorAccountId: command.actorAccountId,
          actorRoles: command.actorRoles,
          accessToken: command.accessToken
        });
      }
      const aggregate = LiveRoomAggregate.restore(snapshot);

      const nowIso = new Date().toISOString();
      const changed = aggregate.join({
        accountId: command.actorAccountId,
        role: effectiveRole,
        nowIso
      });

      if (!changed) {
        this.metricsService.markParticipantJoin({ role: effectiveRole, result: 'noop', snapshot });
        return snapshot;
      }

      const updated = aggregate.toSnapshot();
      await this.saveOrThrowConflict(updated, snapshot.version, [
        this.newEvent({
          roomId: updated.roomId,
          roomVersion: updated.version,
          eventType: 'participant_joined',
          actorAccountId: command.actorAccountId,
          occurredAt: updated.updatedAt,
          payload: {
            role: effectiveRole
          }
        })
      ]);
      this.metricsService.markParticipantJoin({
        role: effectiveRole,
        result: 'joined',
        snapshot: updated
      });
      return updated;
    } catch (error) {
      if (error instanceof ApplicationAccessDeniedError) {
        const effectiveRole = command.roleOverride ?? command.actorRoles[0] ?? 'student';
        this.metricsService.markParticipantJoin({ role: effectiveRole, result: 'denied' });
      }
      this.mapDomainError(error);
    }
  }

  async leaveRoom(command: LeaveLiveRoomCommand): Promise<LiveRoomSnapshot> {
    try {
      const snapshot = await this.getRoom(command.roomId);
      this.ensureExpectedVersion(snapshot.version, command.expectedVersion);
      const aggregate = LiveRoomAggregate.restore(snapshot);
      const previousParticipant = snapshot.participants.find(
        (item) => item.accountId === command.actorAccountId
      );
      const nowIso = new Date().toISOString();

      const changed = aggregate.leave({
        accountId: command.actorAccountId,
        nowIso
      });

      if (!changed) {
        this.metricsService.markParticipantLeave({
          role: previousParticipant?.role ?? 'unknown',
          result: 'noop',
          snapshot
        });
        return snapshot;
      }

      const updated = aggregate.toSnapshot();
      await this.saveOrThrowConflict(updated, snapshot.version, [
        this.newEvent({
          roomId: updated.roomId,
          roomVersion: updated.version,
          eventType: 'participant_left',
          actorAccountId: command.actorAccountId,
          occurredAt: updated.updatedAt,
          payload: {}
        })
      ]);
      this.metricsService.markParticipantLeave({
        role: previousParticipant?.role ?? 'unknown',
        result: 'left',
        durationSeconds: previousParticipant
          ? this.calculateDurationSeconds(previousParticipant.joinedAt, nowIso)
          : undefined,
        snapshot: updated
      });
      return updated;
    } catch (error) {
      this.mapDomainError(error);
    }
  }

  async kickFromRoom(command: KickFromLiveRoomCommand): Promise<LiveRoomSnapshot> {
    try {
      const snapshot = await this.getRoom(command.roomId);
      this.ensureExpectedVersion(snapshot.version, command.expectedVersion);
      const aggregate = LiveRoomAggregate.restore(snapshot);
      const previousParticipant = snapshot.participants.find(
        (item) => item.accountId === command.participantAccountId
      );
      const nowIso = new Date().toISOString();

      const changed = aggregate.kick({
        actorAccountId: command.actorAccountId,
        actorRoles: command.actorRoles,
        participantAccountId: command.participantAccountId,
        nowIso
      });

      if (!changed) {
        this.metricsService.markParticipantKick({
          role: previousParticipant?.role ?? 'unknown',
          result: 'noop',
          snapshot
        });
        return snapshot;
      }

      const updated = aggregate.toSnapshot();
      await this.saveOrThrowConflict(updated, snapshot.version, [
        this.newEvent({
          roomId: updated.roomId,
          roomVersion: updated.version,
          eventType: 'participant_kicked',
          actorAccountId: command.actorAccountId,
          occurredAt: updated.updatedAt,
          payload: {
            participantAccountId: command.participantAccountId
          }
        })
      ]);
      this.metricsService.markParticipantKick({
        role: previousParticipant?.role ?? 'unknown',
        result: 'kicked',
        durationSeconds: previousParticipant
          ? this.calculateDurationSeconds(previousParticipant.joinedAt, nowIso)
          : undefined,
        snapshot: updated
      });
      return updated;
    } catch (error) {
      this.mapDomainError(error);
    }
  }

  async closeRoom(command: CloseLiveRoomCommand): Promise<LiveRoomSnapshot> {
    try {
      const snapshot = await this.getRoom(command.roomId);
      this.ensureExpectedVersion(snapshot.version, command.expectedVersion);
      const aggregate = LiveRoomAggregate.restore(snapshot);

      const changed = aggregate.close({
        actorAccountId: command.actorAccountId,
        actorRoles: command.actorRoles,
        nowIso: new Date().toISOString()
      });

      if (!changed) {
        return snapshot;
      }

      const updated = aggregate.toSnapshot();
      await this.saveOrThrowConflict(updated, snapshot.version, [
        this.newEvent({
          roomId: updated.roomId,
          roomVersion: updated.version,
          eventType: 'room_closed',
          actorAccountId: command.actorAccountId,
          occurredAt: updated.updatedAt,
          payload: {}
        })
      ]);
      this.metricsService.markRoomClosed(updated);
      return updated;
    } catch (error) {
      this.mapDomainError(error);
    }
  }

  async getRoomEvents(input: {
    roomId: string;
    actorAccountId: string;
    actorRoles: string[];
    fromVersion?: number;
    limit?: number;
  }): Promise<LiveRoomEvent[]> {
    try {
      const room = await this.getRoom(input.roomId);
      LiveRoomPolicy.ensureCanViewEvents(
        input.actorAccountId,
        input.actorRoles,
        room.teacherAccountId
      );
      return this.repository.getEventsByRoomId(input.roomId, input.fromVersion, input.limit);
    } catch (error) {
      this.mapDomainError(error);
    }
  }

  async getRoomAttendance(input: {
    roomId: string;
    actorAccountId: string;
    actorRoles: string[];
  }): Promise<RoomAttendanceRecord[]> {
    try {
      const room = await this.getRoom(input.roomId);
      LiveRoomPolicy.ensureCanViewEvents(
        input.actorAccountId,
        input.actorRoles,
        room.teacherAccountId
      );
      return this.repository.getAttendanceByRoomId(input.roomId);
    } catch (error) {
      this.mapDomainError(error);
    }
  }

  private mapDomainError(error: unknown): never {
    if (error instanceof NotFoundError) {
      throw new ApplicationNotFoundError(error.message);
    }
    if (error instanceof InvariantViolationError) {
      throw new ApplicationValidationError(error.message);
    }
    if (error instanceof ApplicationAccessDeniedError) {
      throw error;
    }
    throw error;
  }

  private ensureExpectedVersion(currentVersion: number, expectedVersion?: number): void {
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      throw new ApplicationConflictError(
        `Версия комнаты изменилась: ожидалась ${expectedVersion}, текущая ${currentVersion}.`
      );
    }
  }

  private async saveOrThrowConflict(
    snapshot: LiveRoomSnapshot,
    expectedVersion: number | null,
    events: LiveRoomEvent[]
  ): Promise<void> {
    const saved = await this.repository.save(snapshot, expectedVersion, events);
    if (!saved) {
      throw new ApplicationConflictError(
        'Конкурентное изменение комнаты. Обновите данные и повторите запрос.'
      );
    }
  }

  private newEvent(input: Omit<LiveRoomEvent, 'eventId'>): LiveRoomEvent {
    return {
      eventId: randomUUID(),
      ...input
    };
  }

  private calculateDurationSeconds(startedAtIso: string, endedAtIso: string): number {
    const startedAt = new Date(startedAtIso).getTime();
    const endedAt = new Date(endedAtIso).getTime();
    return Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  }
}
