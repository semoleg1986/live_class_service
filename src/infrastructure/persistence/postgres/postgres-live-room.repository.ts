import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, gte } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { LiveRoomEvent } from '../../../domain/live-room/live-room-event.types';
import { LiveRoomSnapshot, RoomAttendanceRecord } from '../../../domain/live-room/live-room.types';
import { LiveRoomRepositoryPort } from '../../../application/ports/live-room-repository.port';
import {
  liveRoomsTable,
  outboxEventsTable,
  roomAttendanceTable,
  roomEventsTable,
  roomParticipantsTable
} from './schema';

@Injectable()
export class PostgresLiveRoomRepository implements LiveRoomRepositoryPort, OnModuleDestroy {
  private readonly pool: Pool;
  private readonly db: NodePgDatabase;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>(
      'liveClass.databaseUrl',
      'postgresql://postgres:postgres@localhost:5432/live_class_service'
    );
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async save(
    room: LiveRoomSnapshot,
    expectedVersion: number | null,
    events: LiveRoomEvent[]
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      let saved = false;

      if (expectedVersion === null) {
        const created = await tx
          .insert(liveRoomsTable)
          .values({
            roomId: room.roomId,
            courseId: room.courseId,
            lessonId: room.lessonId,
            teacherAccountId: room.teacherAccountId,
            status: room.status,
            version: room.version,
            participantsLimit: room.participantsLimit,
            createdAt: new Date(room.createdAt),
            updatedAt: new Date(room.updatedAt),
            startedAt: room.startedAt ? new Date(room.startedAt) : null,
            endedAt: room.endedAt ? new Date(room.endedAt) : null
          })
          .onConflictDoNothing()
          .returning({ roomId: liveRoomsTable.roomId });

        saved = created.length > 0;
      } else {
        const updated = await tx
          .update(liveRoomsTable)
          .set({
            courseId: room.courseId,
            lessonId: room.lessonId,
            teacherAccountId: room.teacherAccountId,
            status: room.status,
            version: room.version,
            participantsLimit: room.participantsLimit,
            createdAt: new Date(room.createdAt),
            updatedAt: new Date(room.updatedAt),
            startedAt: room.startedAt ? new Date(room.startedAt) : null,
            endedAt: room.endedAt ? new Date(room.endedAt) : null
          })
          .where(
            and(eq(liveRoomsTable.roomId, room.roomId), eq(liveRoomsTable.version, expectedVersion))
          )
          .returning({ roomId: liveRoomsTable.roomId });

        saved = updated.length > 0;
      }

      if (!saved) {
        return false;
      }

      await tx.delete(roomParticipantsTable).where(eq(roomParticipantsTable.roomId, room.roomId));

      if (room.participants.length > 0) {
        await tx.insert(roomParticipantsTable).values(
          room.participants.map((participant) => ({
            roomId: room.roomId,
            accountId: participant.accountId,
            role: participant.role,
            joinedAt: new Date(participant.joinedAt)
          }))
        );
      }

      await this.applyAttendance(tx, room.roomId, events);

      if (events.length > 0) {
        await tx.insert(roomEventsTable).values(
          events.map((event) => ({
            eventId: event.eventId,
            roomId: event.roomId,
            roomVersion: event.roomVersion,
            eventType: event.eventType,
            actorAccountId: event.actorAccountId,
            occurredAt: new Date(event.occurredAt),
            payload: event.payload
          }))
        );

        await tx.insert(outboxEventsTable).values(
          events.map((event) => ({
            eventId: event.eventId,
            topic: 'live_room.events',
            payload: {
              eventId: event.eventId,
              roomId: event.roomId,
              roomVersion: event.roomVersion,
              eventType: event.eventType,
              actorAccountId: event.actorAccountId,
              occurredAt: event.occurredAt,
              payload: event.payload
            }
          }))
        );
      }

      return true;
    });
  }

  async appendAuditEvents(
    roomId: string,
    expectedVersion: number,
    events: LiveRoomEvent[]
  ): Promise<boolean> {
    if (events.length === 0) {
      return true;
    }

    return this.db.transaction(async (tx) => {
      const current = await tx
        .select({ roomId: liveRoomsTable.roomId })
        .from(liveRoomsTable)
        .where(and(eq(liveRoomsTable.roomId, roomId), eq(liveRoomsTable.version, expectedVersion)))
        .limit(1);

      if (current.length === 0) {
        return false;
      }

      await tx.insert(roomEventsTable).values(
        events.map((event) => ({
          eventId: event.eventId,
          roomId: event.roomId,
          roomVersion: event.roomVersion,
          eventType: event.eventType,
          actorAccountId: event.actorAccountId,
          occurredAt: new Date(event.occurredAt),
          payload: event.payload
        }))
      );

      await tx.insert(outboxEventsTable).values(
        events.map((event) => ({
          eventId: event.eventId,
          topic: 'live_room.events',
          payload: {
            eventId: event.eventId,
            roomId: event.roomId,
            roomVersion: event.roomVersion,
            eventType: event.eventType,
            actorAccountId: event.actorAccountId,
            occurredAt: event.occurredAt,
            payload: event.payload
          }
        }))
      );

      return true;
    });
  }

  async getById(roomId: string): Promise<LiveRoomSnapshot | null> {
    const rooms = await this.db
      .select()
      .from(liveRoomsTable)
      .where(eq(liveRoomsTable.roomId, roomId))
      .limit(1);

    const room = rooms[0];
    if (!room) {
      return null;
    }

    const participants = await this.db
      .select()
      .from(roomParticipantsTable)
      .where(eq(roomParticipantsTable.roomId, roomId))
      .orderBy(asc(roomParticipantsTable.joinedAt));

    return {
      roomId: room.roomId,
      courseId: room.courseId,
      lessonId: room.lessonId,
      teacherAccountId: room.teacherAccountId,
      status: room.status as LiveRoomSnapshot['status'],
      version: room.version,
      participantsLimit: room.participantsLimit,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      startedAt: room.startedAt ? room.startedAt.toISOString() : null,
      endedAt: room.endedAt ? room.endedAt.toISOString() : null,
      participants: participants.map((item) => ({
        accountId: item.accountId,
        role: item.role,
        joinedAt: item.joinedAt.toISOString()
      }))
    };
  }

  async getEventsByRoomId(
    roomId: string,
    fromVersion?: number,
    limit = 100
  ): Promise<LiveRoomEvent[]> {
    const predicate =
      fromVersion === undefined
        ? eq(roomEventsTable.roomId, roomId)
        : and(eq(roomEventsTable.roomId, roomId), gte(roomEventsTable.roomVersion, fromVersion));

    const rows = await this.db
      .select()
      .from(roomEventsTable)
      .where(predicate)
      .orderBy(asc(roomEventsTable.roomVersion), asc(roomEventsTable.occurredAt))
      .limit(limit);

    return rows.map((item) => ({
      eventId: item.eventId,
      roomId: item.roomId,
      roomVersion: item.roomVersion,
      eventType: item.eventType as LiveRoomEvent['eventType'],
      actorAccountId: item.actorAccountId,
      occurredAt: item.occurredAt.toISOString(),
      payload: item.payload
    }));
  }

  async getAttendanceByRoomId(roomId: string): Promise<RoomAttendanceRecord[]> {
    const rows = await this.db
      .select()
      .from(roomAttendanceTable)
      .where(eq(roomAttendanceTable.roomId, roomId))
      .orderBy(asc(roomAttendanceTable.firstJoinedAt), asc(roomAttendanceTable.accountId));

    return rows.map((item) => ({
      accountId: item.accountId,
      role: item.role,
      firstJoinedAt: item.firstJoinedAt.toISOString(),
      lastJoinedAt: item.lastJoinedAt.toISOString(),
      lastLeftAt: item.lastLeftAt ? item.lastLeftAt.toISOString() : null,
      activeSessionStartedAt: item.activeSessionStartedAt
        ? item.activeSessionStartedAt.toISOString()
        : null,
      totalAttendanceSeconds: item.totalAttendanceSeconds,
      sessionCount: item.sessionCount,
      updatedAt: item.updatedAt.toISOString()
    }));
  }

  private async applyAttendance(
    tx: Parameters<NodePgDatabase['transaction']>[0] extends (arg: infer T) => any ? T : never,
    roomId: string,
    events: LiveRoomEvent[]
  ): Promise<void> {
    for (const event of events) {
      if (event.eventType === 'participant_joined') {
        const accountId = event.actorAccountId;
        const role = String(event.payload.role ?? 'student');

        if (!accountId) {
          continue;
        }

        const current = await tx
          .select()
          .from(roomAttendanceTable)
          .where(
            and(
              eq(roomAttendanceTable.roomId, roomId),
              eq(roomAttendanceTable.accountId, accountId)
            )
          )
          .limit(1);

        const row = current[0];

        if (!row) {
          await tx.insert(roomAttendanceTable).values({
            roomId,
            accountId,
            role,
            firstJoinedAt: new Date(event.occurredAt),
            lastJoinedAt: new Date(event.occurredAt),
            lastLeftAt: null,
            activeSessionStartedAt: new Date(event.occurredAt),
            totalAttendanceSeconds: 0,
            sessionCount: 1,
            updatedAt: new Date(event.occurredAt)
          });
          continue;
        }

        if (row.activeSessionStartedAt) {
          continue;
        }

        await tx
          .update(roomAttendanceTable)
          .set({
            role,
            lastJoinedAt: new Date(event.occurredAt),
            activeSessionStartedAt: new Date(event.occurredAt),
            sessionCount: row.sessionCount + 1,
            updatedAt: new Date(event.occurredAt)
          })
          .where(
            and(
              eq(roomAttendanceTable.roomId, roomId),
              eq(roomAttendanceTable.accountId, accountId)
            )
          );
      }

      if (event.eventType === 'participant_left' || event.eventType === 'participant_kicked') {
        const accountId =
          event.eventType === 'participant_left'
            ? event.actorAccountId
            : String(event.payload.participantAccountId ?? '');

        if (!accountId) {
          continue;
        }

        const current = await tx
          .select()
          .from(roomAttendanceTable)
          .where(
            and(
              eq(roomAttendanceTable.roomId, roomId),
              eq(roomAttendanceTable.accountId, accountId)
            )
          )
          .limit(1);

        const row = current[0];
        if (!row || !row.activeSessionStartedAt) {
          continue;
        }

        const durationSeconds = Math.max(
          0,
          Math.floor(
            (new Date(event.occurredAt).getTime() - row.activeSessionStartedAt.getTime()) / 1000
          )
        );

        await tx
          .update(roomAttendanceTable)
          .set({
            totalAttendanceSeconds: row.totalAttendanceSeconds + durationSeconds,
            lastLeftAt: new Date(event.occurredAt),
            activeSessionStartedAt: null,
            updatedAt: new Date(event.occurredAt)
          })
          .where(
            and(
              eq(roomAttendanceTable.roomId, roomId),
              eq(roomAttendanceTable.accountId, accountId)
            )
          );
      }
    }
  }
}
