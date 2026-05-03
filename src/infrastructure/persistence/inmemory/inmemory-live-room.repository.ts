import { Injectable } from '@nestjs/common';

import { LiveRoomEvent } from '../../../domain/live-room/live-room-event.types';
import { LiveRoomSnapshot } from '../../../domain/live-room/live-room.types';
import { LiveRoomRepositoryPort } from '../../../application/ports/live-room-repository.port';

@Injectable()
export class InMemoryLiveRoomRepository implements LiveRoomRepositoryPort {
  private readonly rooms = new Map<string, LiveRoomSnapshot>();
  private readonly events = new Map<string, LiveRoomEvent[]>();

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
      this.appendEvents(room.roomId, events);
      return true;
    }

    if (expectedVersion === null || current.version !== expectedVersion) {
      return false;
    }

    this.rooms.set(room.roomId, this.cloneRoom(room));
    this.appendEvents(room.roomId, events);
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
}
