CREATE TABLE "outbox_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE INDEX "ix_outbox_events_status_available_at" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "ix_outbox_events_created_at" ON "outbox_events" USING btree ("created_at");