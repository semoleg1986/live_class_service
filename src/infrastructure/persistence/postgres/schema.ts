import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const liveRoomsTable = pgTable(
  'live_rooms',
  {
    roomId: text('room_id').primaryKey(),
    courseId: text('course_id').notNull(),
    lessonId: text('lesson_id').notNull(),
    teacherAccountId: text('teacher_account_id').notNull(),
    status: text('status').notNull(),
    version: integer('version').notNull().default(1),
    participantsLimit: integer('participants_limit').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true })
  },
  (table) => ({
    courseIdIdx: index('ix_live_rooms_course_id').on(table.courseId),
    teacherAccountIdIdx: index('ix_live_rooms_teacher_account_id').on(table.teacherAccountId)
  })
);

export const roomParticipantsTable = pgTable(
  'room_participants',
  {
    roomId: text('room_id')
      .notNull()
      .references(() => liveRoomsTable.roomId, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    role: text('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roomId, table.accountId] }),
    roomIdIdx: index('ix_room_participants_room_id').on(table.roomId)
  })
);

export const roomAttendanceTable = pgTable(
  'room_attendance',
  {
    roomId: text('room_id')
      .notNull()
      .references(() => liveRoomsTable.roomId, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    role: text('role').notNull(),
    firstJoinedAt: timestamp('first_joined_at', { withTimezone: true }).notNull(),
    lastJoinedAt: timestamp('last_joined_at', { withTimezone: true }).notNull(),
    lastLeftAt: timestamp('last_left_at', { withTimezone: true }),
    activeSessionStartedAt: timestamp('active_session_started_at', { withTimezone: true }),
    totalAttendanceSeconds: integer('total_attendance_seconds').notNull().default(0),
    sessionCount: integer('session_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roomId, table.accountId] }),
    roomIdIdx: index('ix_room_attendance_room_id').on(table.roomId)
  })
);

export const roomEventsTable = pgTable(
  'room_events',
  {
    eventId: text('event_id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => liveRoomsTable.roomId, { onDelete: 'cascade' }),
    roomVersion: integer('room_version').notNull(),
    eventType: text('event_type').notNull(),
    actorAccountId: text('actor_account_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull()
  },
  (table) => ({
    roomVersionIdx: index('ix_room_events_room_version').on(table.roomId, table.roomVersion),
    occurredAtIdx: index('ix_room_events_occurred_at').on(table.occurredAt)
  })
);

export const outboxEventsTable = pgTable(
  'outbox_events',
  {
    eventId: text('event_id').primaryKey(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lastError: text('last_error')
  },
  (table) => ({
    statusAvailableAtIdx: index('ix_outbox_events_status_available_at').on(
      table.status,
      table.availableAt
    ),
    createdAtIdx: index('ix_outbox_events_created_at').on(table.createdAt)
  })
);
