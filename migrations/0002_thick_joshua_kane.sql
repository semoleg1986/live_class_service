CREATE TABLE "room_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"room_version" integer NOT NULL,
	"event_type" text NOT NULL,
	"actor_account_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_room_id_live_rooms_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."live_rooms"("room_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_room_events_room_version" ON "room_events" USING btree ("room_id","room_version");--> statement-breakpoint
CREATE INDEX "ix_room_events_occurred_at" ON "room_events" USING btree ("occurred_at");