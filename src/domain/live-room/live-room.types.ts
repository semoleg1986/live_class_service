export type LiveRoomStatus = 'created' | 'active' | 'closed';

export type RoomParticipant = {
  accountId: string;
  role: string;
  joinedAt: string;
};

export type LiveRoomSnapshot = {
  roomId: string;
  courseId: string;
  lessonId: string;
  teacherAccountId: string;
  status: LiveRoomStatus;
  version: number;
  participantsLimit: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  participants: RoomParticipant[];
};
