import { Injectable } from '@nestjs/common';

import { LiveRoomFacade } from '../../application/live-room/live-room.facade';
import { LiveRoomEvent } from '../../domain/live-room/live-room-event.types';
import { LiveRoomSnapshot } from '../../domain/live-room/live-room.types';
import { AuthUser } from '../auth/auth-user.interface';
import { CloseRoomDto } from './dto/close-room.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { GetRoomEventsQueryDto } from './dto/get-room-events.query.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { KickFromRoomDto } from './dto/kick-from-room.dto';
import { LeaveRoomDto } from './dto/leave-room.dto';

@Injectable()
export class LiveRoomService {
  constructor(private readonly facade: LiveRoomFacade) {}

  async createRoom(dto: CreateRoomDto, user: AuthUser): Promise<LiveRoomSnapshot> {
    return this.facade.createRoom({
      courseId: dto.courseId,
      lessonId: dto.lessonId,
      actorAccountId: user.accountId,
      actorRoles: user.roles,
      participantsLimit: dto.participantsLimit,
    });
  }

  async getRoom(roomId: string): Promise<LiveRoomSnapshot> {
    return this.facade.getRoom(roomId);
  }

  async getRoomEvents(
    roomId: string,
    user: AuthUser,
    query: GetRoomEventsQueryDto,
  ): Promise<LiveRoomEvent[]> {
    return this.facade.getRoomEvents({
      roomId,
      actorAccountId: user.accountId,
      actorRoles: user.roles,
      fromVersion: query.fromVersion,
      limit: query.limit,
    });
  }

  async joinRoom(
    roomId: string,
    user: AuthUser,
    dto: JoinRoomDto,
  ): Promise<LiveRoomSnapshot> {
    return this.facade.joinRoom({
      roomId,
      actorAccountId: user.accountId,
      actorRoles: user.roles,
      roleOverride: dto.role,
      expectedVersion: dto.expectedVersion,
    });
  }

  async leaveRoom(
    roomId: string,
    user: AuthUser,
    dto: LeaveRoomDto,
  ): Promise<LiveRoomSnapshot> {
    return this.facade.leaveRoom({
      roomId,
      actorAccountId: user.accountId,
      expectedVersion: dto.expectedVersion,
    });
  }

  async kickFromRoom(
    roomId: string,
    user: AuthUser,
    dto: KickFromRoomDto,
  ): Promise<LiveRoomSnapshot> {
    return this.facade.kickFromRoom({
      roomId,
      actorAccountId: user.accountId,
      actorRoles: user.roles,
      participantAccountId: dto.participantAccountId,
      expectedVersion: dto.expectedVersion,
    });
  }

  async closeRoom(
    roomId: string,
    user: AuthUser,
    dto: CloseRoomDto,
  ): Promise<LiveRoomSnapshot> {
    return this.facade.closeRoom({
      roomId,
      actorAccountId: user.accountId,
      actorRoles: user.roles,
      expectedVersion: dto.expectedVersion,
    });
  }
}
