CREATE TYPE "public"."homework_status" AS ENUM('assigned', 'done');--> statement-breakpoint
CREATE TABLE "homework_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"session_id" uuid,
	"subject_id" text NOT NULL,
	"lesson_slug" text NOT NULL,
	"title" text NOT NULL,
	"items" jsonb NOT NULL,
	"status" "homework_status" DEFAULT 'assigned' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "lesson_transcript" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"seq" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tutor_session" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "homework_assignment" ADD CONSTRAINT "homework_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignment" ADD CONSTRAINT "homework_assignment_session_id_tutor_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tutor_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_transcript" ADD CONSTRAINT "lesson_transcript_session_id_tutor_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tutor_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_transcript" ADD CONSTRAINT "lesson_transcript_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homework_user_idx" ON "homework_assignment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "homework_lesson_idx" ON "homework_assignment" USING btree ("user_id","subject_id","lesson_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_transcript_session_seq_uniq" ON "lesson_transcript" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "lesson_transcript_user_idx" ON "lesson_transcript" USING btree ("user_id");