-- Add time and priority fields to calendar_events table
ALTER TABLE "calendar_events" ADD COLUMN "start_time" text;
ALTER TABLE "calendar_events" ADD COLUMN "end_time" text;
ALTER TABLE "calendar_events" ADD COLUMN "priority" integer DEFAULT 1 NOT NULL; 