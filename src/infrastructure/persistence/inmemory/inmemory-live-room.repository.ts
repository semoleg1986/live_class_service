import { Injectable } from '@nestjs/common';

import { LiveRoomEvent } from '../../../domain/live-room/live-room-event.types';
import { LiveRoomSnapshot, RoomAttendanceRecord } from '../../../domain/live-room/live-room.types';
import { LiveRoomRepositoryPort } from '../../../application/ports/live-room-repository.port';

@Injectable()
export class InMemoryLiveRoomRepository implements LiveRoomRepositoryPort {
  private readonly rooms = new Map<string, LiveRoomSnapshot>();
  private readonly events = new Map<string, LiveRoomEvent[]>();
  private readonly attendance = new Map<string, Map<string, RoomAttendanceRecord>>();

  async save(
    room: LiveRoomSnapshot,
    expectedVersion: number | null,
    events: LiveRoomEvent[]
  ): Promise<boolean> {
    const current = this.rooms.get(room.roomId);

    if (!current) {
      if (expectedVersion !== null) {
        return false;
      }
      this.rooms.set(room.roomId, this.cloneRoom(room));
      this.applyAttendance(room.roomId, events);
      this.appendEvents(room.roomId, events);
      return true;
    }

    if (expectedVersion === null || current.version !== expectedVersion) {
      return false;
    }

    this.rooms.set(room.roomId, this.cloneRoom(room));
    this.applyAttendance(room.roomId, events);
    this.appendEvents(room.roomId, events);
    return true;
  }

  async appendAuditEvents(
    roomId: string,
    expectedVersion: number,
    events: LiveRoomEvent[]
  ): Promise<boolean> {
    const current = this.rooms.get(roomId);
    if (!current || current.version !== expectedVersion) {
      return false;
    }

    this.appendEvents(roomId, events);
    return true;
  }

  async getById(roomId: string): Promise<LiveRoomSnapshot | null> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }
    return {
      ...room,
      participants: room.participants.map((item) => ({ ...item }))
    };
  }

  async getEventsByRoomId(
    roomId: string,
    fromVersion?: number,
    limit = 100
  ): Promise<LiveRoomEvent[]> {
    const events = this.events.get(roomId) ?? [];
    const sliced = events
      .filter((item) => fromVersion === undefined || item.roomVersion >= fromVersion)
      .slice(0, limit);
    return sliced.map((item) => ({ ...item, payload: { ...item.payload } }));
  }

  async getAttendanceByRoomId(roomId: string): Promise<RoomAttendanceRecord[]> {
    const items = [...(this.attendance.get(roomId)?.values() ?? [])];
    items.sort((left, right) => left.firstJoinedAt.localeCompare(right.firstJoinedAt));
    return items.map((item) => ({ ...item }));
  }

  private appendEvents(roomId: string, events: LiveRoomEvent[]): void {
    if (events.length === 0) {
      return;
    }

    const existing = this.events.get(roomId) ?? [];
    this.events.set(roomId, [...existing, ...events.map((item) => ({ ...item }))]);
  }

  private cloneRoom(room: LiveRoomSnapshot): LiveRoomSnapshot {
    return {
      ...room,
      participants: room.participants.map((item) => ({ ...item }))
    };
  }

  private applyAttendance(roomId: string, events: LiveRoomEvent[]): void {
    if (events.length === 0) {
      return;
    }

    const roomAttendance = this.attendance.get(roomId) ?? new Map<string, RoomAttendanceRecord>();

    for (const event of events) {
      if (event.eventType === 'participant_joined') {
        const accountId = event.actorAccountId;
        const role = String(event.payload.role ?? 'student');

        if (!accountId) {
          continue;
        }

        const existing = roomAttendance.get(accountId);
        if (!existing) {
          roomAttendance.set(accountId, {
            accountId,
            role,
            firstJoinedAt: event.occurredAt,
            lastJoinedAt: event.occurredAt,
            lastLeftAt: null,
            activeSessionStartedAt: event.occurredAt,
            totalAttendanceSeconds: 0,
            sessionCount: 1,
            updatedAt: event.occurredAt
          });
          continue;
        }

        if (existing.activeSessionStartedAt) {
          continue;
        }

        existing.role = role;
        existing.lastJoinedAt = event.occurredAt;
        existing.activeSessionStartedAt = event.occurredAt;
        existing.sessionCount += 1;
        existing.updatedAt = event.occurredAt;
      }

      if (event.eventType === 'participant_left' || event.eventType === 'participant_kicked') {
        const accountId =
          event.eventType === 'participant_left'
            ? event.actorAccountId
            : String(event.payload.participantAccountId ?? '');

        if (!accountId) {
          continue;
        }

        const existing = roomAttendance.get(accountId);
        if (!existing || !existing.activeSessionStartedAt) {
          continue;
        }

        const startedAt = new Date(existing.activeSessionStartedAt).getTime();
        const endedAt = new Date(event.occurredAt).getTime();
        const durationSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));

        existing.totalAttendanceSeconds += durationSeconds;
        existing.lastLeftAt = event.occurredAt;
        existing.activeSessionStartedAt = null;
        existing.updatedAt = event.occurredAt;
      }
    }

    this.attendance.set(roomId, roomAttendance);
  }
}
