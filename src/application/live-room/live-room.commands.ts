export type CreateLiveRoomCommand = {
  courseId: string;
  lessonId: string;
  actorAccountId: string;
  actorRoles: string[];
  participantsLimit?: number;
};

export type JoinLiveRoomCommand = {
  roomId: string;
  actorAccountId: string;
  actorRoles: string[];
  accessToken: string;
  roleOverride?: string;
  expectedVersion?: number;
};

export type CloseLiveRoomCommand = {
  roomId: string;
  actorAccountId: string;
  actorRoles: string[];
  expectedVersion?: number;
};

export type LeaveLiveRoomCommand = {
  roomId: string;
  actorAccountId: string;
  expectedVersion?: number;
};

export type KickFromLiveRoomCommand = {
  roomId: string;
  actorAccountId: string;
  actorRoles: string[];
  participantAccountId: string;
  expectedVersion?: number;
};
