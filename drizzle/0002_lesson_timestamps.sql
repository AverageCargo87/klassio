ALTER TABLE "lesson" ADD COLUMN IF NOT EXISTS "actual_start_at" timestamp;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN IF NOT EXISTS "actual_end_at" timestamp;
