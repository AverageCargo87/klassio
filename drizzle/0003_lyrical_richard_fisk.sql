CREATE TYPE "public"."progress_event_type" AS ENUM('session_started', 'session_completed', 'phase_change', 'tool_used', 'task_correct', 'task_wrong', 'hint_shown', 'fatigue_signal', 'pause_started', 'pause_ended', 'reward_given', 'diagnostic_result', 'moderation_warning', 'moderation_escalation');--> statement-breakpoint
CREATE TYPE "public"."tutor_phase" AS ENUM('connecting', 'warmup', 'diagnostic', 'bridge', 'cycle', 'pause', 'summary', 'farewell');--> statement-breakpoint
CREATE TYPE "public"."tutor_session_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "lesson_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"skill_tag" text,
	"correct" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"reaction_ms" integer,
	"answered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"user_id" text NOT NULL,
	"event_type" "progress_event_type" NOT NULL,
	"payload" jsonb,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_mastery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"skill_tag" text NOT NULL,
	"attempts_total" integer DEFAULT 0 NOT NULL,
	"correct_total" integer DEFAULT 0 NOT NULL,
	"mastery_level" real DEFAULT 0 NOT NULL,
	"last_practiced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"lesson_slug" text NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"phase" "tutor_phase" DEFAULT 'connecting' NOT NULL,
	"status" "tutor_session_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_sec" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_attempt" ADD CONSTRAINT "lesson_attempt_session_id_tutor_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tutor_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attempt" ADD CONSTRAINT "lesson_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_event" ADD CONSTRAINT "progress_event_session_id_tutor_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tutor_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_event" ADD CONSTRAINT "progress_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_session" ADD CONSTRAINT "tutor_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_attempt_session_idx" ON "lesson_attempt" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "lesson_attempt_user_idx" ON "lesson_attempt" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_attempt_session_task_uniq" ON "lesson_attempt" USING btree ("session_id","task_id");--> statement-breakpoint
CREATE INDEX "progress_event_user_idx" ON "progress_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "progress_event_session_idx" ON "progress_event" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "progress_event_type_idx" ON "progress_event" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_mastery_user_skill_uniq" ON "skill_mastery" USING btree ("user_id","skill_tag");--> statement-breakpoint
CREATE INDEX "skill_mastery_user_idx" ON "skill_mastery" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tutor_session_user_id_idx" ON "tutor_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tutor_session_lesson_idx" ON "tutor_session" USING btree ("user_id","subject_id","lesson_slug");