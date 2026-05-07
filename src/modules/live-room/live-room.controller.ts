import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { LiveRoomEvent } from '../../domain/live-room/live-room-event.types';
import { CloseRoomDto } from './dto/close-room.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { GetRoomEventsQueryDto } from './dto/get-room-events.query.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { KickFromRoomDto } from './dto/kick-from-room.dto';
import { LeaveRoomDto } from './dto/leave-room.dto';
import { LiveRoomService } from './live-room.service';
import { LiveRoomSnapshot, RoomAttendanceRecord } from '../../domain/live-room/live-room.types';
import { LiveRoomRateLimit } from '../common/rate-limit.decorator';
import { LiveRoomRateLimitGuard } from '../common/rate-limit.guard';

@Controller('/v1/live/rooms')
@UseGuards(BearerAuthGuard)
export class LiveRoomController {
  constructor(private readonly liveRoomService: LiveRoomService) {}

  @Post()
  async createRoom(
    @Body() dto: CreateRoomDto,
    @CurrentUser() user: AuthUser
  ): Promise<LiveRoomSnapshot> {
    return this.liveRoomService.createRoom(dto, user);
  }

  @Get(':roomId')
  async getRoom(@Param('roomId') roomId: string): Promise<LiveRoomSnapshot> {
    return this.liveRoomService.getRoom(roomId);
  }

  @Get(':roomId/events')
  async getRoomEvents(
    @Param('roomId') roomId: string,
    @Query() query: GetRoomEventsQueryDto,
    @CurrentUser() user: AuthUser
  ): Promise<LiveRoomEvent[]> {
    return this.liveRoomService.getRoomEvents(roomId, user, query);
  }

  @Get(':roomId/attendance')
  @UseGuards(LiveRoomRateLimitGuard)
  @LiveRoomRateLimit('attendance')
  async getRoomAttendance(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthUser
  ): Promise<RoomAttendanceRecord[]> {
    return this.liveRoomService.getRoomAttendance(roomId, user);
  }

  @Post(':roomId/join')
  @UseGuards(LiveRoomRateLimitGuard)
  @LiveRoomRateLimit('join')
  async joinRoom(
    @Param('roomId') roomId: string,
    @Body() dto: JoinRoomDto,
    @CurrentUser() user: AuthUser
  ): Promise<LiveRoomSnapshot> {
    return this.liveRoomService.joinRoom(roomId, user, dto);
  }

  @Post(':roomId/leave')
  @UseGuards(LiveRoomRateLimitGuard)
  @LiveRoomRateLimit('leave')
  async leaveRoom(
    @Param('roomId') roomId: string,
    @Body() dto: LeaveRoomDto,
    @CurrentUser() user: AuthUser
  ): Promise<LiveRoomSnapshot> {
    return this.liveRoomService.leaveRoom(roomId, user, dto);
  }

  @Post(':roomId/kick')
  async kickFromRoom(
    @Param('roomId') roomId: string,
    @Body() dto: KickFromRoomDto,
    @CurrentUser() user: AuthUser
  ): Promise<LiveRoomSnapshot> {
    return this.liveRoomService.kickFromRoom(roomId, user, dto);
  }

  @Post(':roomId/close')
  async closeRoom(
    @Param('roomId') roomId: string,
    @Body() dto: CloseRoomDto,
    @CurrentUser() user: AuthUser
  ): Promise<LiveRoomSnapshot> {
    return this.liveRoomService.closeRoom(roomId, user, dto);
  }
}
