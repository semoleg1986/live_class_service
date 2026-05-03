export type LiveRoomEventType =
  | 'room_created'
  | 'participant_joined'
  | 'participant_join_denied'
  | 'participant_left'
  | 'participant_kicked'
  | 'attendance_updated'
  | 'room_closed';

export type LiveRoomEvent = {
  eventId: string;
  roomId: string;
  roomVersion: number;
  eventType: LiveRoomEventType;
  actorAccountId: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
};
