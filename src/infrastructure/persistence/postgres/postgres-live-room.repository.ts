import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, gte } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { LiveRoomEvent } from '../../../domain/live-room/live-room-event.types';
import { LiveRoomSnapshot } from '../../../domain/live-room/live-room.types';
import { LiveRoomRepositoryPort } from '../../../application/ports/live-room-repository.port';
import {
  liveRoomsTable,
  outboxEventsTable,
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
}
