CREATE TABLE "live_rooms" (
	"room_id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"teacher_account_id" text NOT NULL,
	"status" text NOT NULL,
	"participants_limit" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "room_participants" (
	"room_id" text NOT NULL,
	"account_id" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	CONSTRAINT "room_participants_room_id_account_id_pk" PRIMARY KEY("room_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_room_id_live_rooms_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."live_rooms"("room_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_live_rooms_course_id" ON "live_rooms" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "ix_live_rooms_teacher_account_id" ON "live_rooms" USING btree ("teacher_account_id");--> statement-breakpoint
CREATE INDEX "ix_room_participants_room_id" ON "room_participants" USING btree ("room_id");