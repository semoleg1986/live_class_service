import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import { LiveRoomAggregate } from '../../domain/live-room/live-room.aggregate';
import { LiveRoomEvent } from '../../domain/live-room/live-room-event.types';
import { LiveRoomPolicy } from '../../domain/live-room/live-room.policy';
import { LiveRoomSnapshot } from '../../domain/live-room/live-room.types';
import {
  InvariantViolationError,
  NotFoundError,
} from '../../domain/shared/errors';
import { LiveRoomRepositoryPort } from '../ports/live-room-repository.port';
import {
  ApplicationConflictError,
  ApplicationNotFoundError,
  ApplicationValidationError,
} from '../shared/errors';
import {
  CloseLiveRoomCommand,
  CreateLiveRoomCommand,
  JoinLiveRoomCommand,
  KickFromLiveRoomCommand,
  LeaveLiveRoomCommand,
} from './live-room.commands';

@Injectable()
export class LiveRoomFacade {
  constructor(
    @Inject('LIVE_ROOM_REPOSITORY')
    private readonly repository: LiveRoomRepositoryPort,
    private readonly configService: ConfigService,
  ) {}

  async createRoom(command: CreateLiveRoomCommand): Promise<LiveRoomSnapshot> {
    try {
      const nowIso = new Date().toISOString();
      const defaultMax = this.configService.get<number>(
        'liveClass.maxParticipants',
        11,
      );

      const aggregate = LiveRoomAggregate.create({
        roomId: randomUUID(),
        courseId: command.courseId,
        lessonId: command.lessonId,
        teacherAccountId: command.actorAccountId,
        actorRoles: command.actorRoles,
        participantsLimit: command.participantsLimit ?? defaultMax,
        nowIso,
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
            participantsLimit: snapshot.participantsLimit,
          },
        }),
      ]);
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
      this.ensureExpectedVersion(
        snapshot.version,
        command.expectedVersion,
      );
      const aggregate = LiveRoomAggregate.restore(snapshot);

      aggregate.join({
        accountId: command.actorAccountId,
        role: command.roleOverride ?? command.actorRoles[0] ?? 'student',
        nowIso: new Date().toISOString(),
      });

      const updated = aggregate.toSnapshot();
      await this.saveOrThrowConflict(updated, snapshot.version, [
        this.newEvent({
          roomId: updated.roomId,
          roomVersion: updated.version,
          eventType: 'participant_joined',
          actorAccountId: command.actorAccountId,
          occurredAt: updated.updatedAt,
          payload: {
            role: command.roleOverride ?? command.actorRoles[0] ?? 'student',
          },
        }),
      ]);
      return updated;
    } catch (error) {
      this.mapDomainError(error);
    }
  }

  async leaveRoom(command: LeaveLiveRoomCommand): Promise<LiveRoomSnapshot> {
    try {
      const snapshot = await this.getRoom(command.roomId);
      this.ensureExpectedVersion(
        snapshot.version,
        command.expectedVersion,
      );
      const aggregate = LiveRoomAggregate.restore(snapshot);

      aggregate.leave({
        accountId: command.actorAccountId,
        nowIso: new Date().toISOString(),
      });

      const updated = aggregate.toSnapshot();
      await this.saveOrThrowConflict(updated, snapshot.version, [
        this.newEvent({
          roomId: updated.roomId,
          roomVersion: updated.version,
          eventType: 'participant_left',
          actorAccountId: command.actorAccountId,
          occurredAt: updated.updatedAt,
          payload: {},
        }),
      ]);
      return updated;
    } catch (error) {
      this.mapDomainError(error);
    }
  }

  async kickFromRoom(command: KickFromLiveRoomCommand): Promise<LiveRoomSnapshot> {
    try {
      const snapshot = await this.getRoom(command.roomId);
      this.ensureExpectedVersion(
        snapshot.version,
        command.expectedVersion,
      );
      const aggregate = LiveRoomAggregate.restore(snapshot);

      aggregate.kick({
        actorAccountId: command.actorAccountId,
        actorRoles: command.actorRoles,
        participantAccountId: command.participantAccountId,
        nowIso: new Date().toISOString(),
      });

      const updated = aggregate.toSnapshot();
      await this.saveOrThrowConflict(updated, snapshot.version, [
        this.newEvent({
          roomId: updated.roomId,
          roomVersion: updated.version,
          eventType: 'participant_kicked',
          actorAccountId: command.actorAccountId,
          occurredAt: updated.updatedAt,
          payload: {
            participantAccountId: command.participantAccountId,
          },
        }),
      ]);
      return updated;
    } catch (error) {
      this.mapDomainError(error);
    }
  }

  async closeRoom(command: CloseLiveRoomCommand): Promise<LiveRoomSnapshot> {
    try {
      const snapshot = await this.getRoom(command.roomId);
      this.ensureExpectedVersion(
        snapshot.version,
        command.expectedVersion,
      );
      const aggregate = LiveRoomAggregate.restore(snapshot);

      aggregate.close({
        actorAccountId: command.actorAccountId,
        actorRoles: command.actorRoles,
        nowIso: new Date().toISOString(),
      });

      const updated = aggregate.toSnapshot();
      await this.saveOrThrowConflict(updated, snapshot.version, [
        this.newEvent({
          roomId: updated.roomId,
          roomVersion: updated.version,
          eventType: 'room_closed',
          actorAccountId: command.actorAccountId,
          occurredAt: updated.updatedAt,
          payload: {},
        }),
      ]);
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
        room.teacherAccountId,
      );
      return this.repository.getEventsByRoomId(
        input.roomId,
        input.fromVersion,
        input.limit,
      );
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
    throw error;
  }

  private ensureExpectedVersion(
    currentVersion: number,
    expectedVersion?: number,
  ): void {
    if (
      expectedVersion !== undefined &&
      expectedVersion !== currentVersion
    ) {
      throw new ApplicationConflictError(
        `Версия комнаты изменилась: ожидалась ${expectedVersion}, текущая ${currentVersion}.`,
      );
    }
  }

  private async saveOrThrowConflict(
    snapshot: LiveRoomSnapshot,
    expectedVersion: number | null,
    events: LiveRoomEvent[],
  ): Promise<void> {
    const saved = await this.repository.save(snapshot, expectedVersion, events);
    if (!saved) {
      throw new ApplicationConflictError(
        'Конкурентное изменение комнаты. Обновите данные и повторите запрос.',
      );
    }
  }

  private newEvent(input: Omit<LiveRoomEvent, 'eventId'>): LiveRoomEvent {
    return {
      eventId: randomUUID(),
      ...input,
    };
  }
}
