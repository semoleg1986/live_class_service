ALTER TABLE "live_rooms" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "live_rooms" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;