import { LiveRoomEvent } from '../../domain/live-room/live-room-event.types';
import { LiveRoomSnapshot } from '../../domain/live-room/live-room.types';

export interface LiveRoomRepositoryPort {
  save(
    room: LiveRoomSnapshot,
    expectedVersion: number | null,
    events: LiveRoomEvent[],
  ): Promise<boolean>;
  getById(roomId: string): Promise<LiveRoomSnapshot | null>;
  getEventsByRoomId(
    roomId: string,
    fromVersion?: number,
    limit?: number,
  ): Promise<LiveRoomEvent[]>;
}
