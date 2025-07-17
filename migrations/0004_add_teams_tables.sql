-- Add teams table
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL UNIQUE,
	"display_name" text NOT NULL,
	"description" text,
	"password" text,
	"icon" text,
	"color" text,
	"is_active" boolean NOT NULL DEFAULT true,
	"order" integer NOT NULL DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add members table
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"role" text NOT NULL,
	"team_id" integer REFERENCES "teams"("id") ON DELETE SET NULL,
	"avatar_url" text,
	"bio" text,
	"github_username" text,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"joined_date" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add tasks table
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text NOT NULL DEFAULT 'todo',
	"priority" integer NOT NULL DEFAULT 3,
	"assigned_to" integer REFERENCES "members"("id") ON DELETE SET NULL,
	"team_id" text NOT NULL,
	"due_date" timestamp,
	"estimated_hours" integer,
	"actual_hours" integer,
	"progress" integer NOT NULL DEFAULT 0,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"linked_page_id" integer REFERENCES "wiki_pages"("id") ON DELETE SET NULL,
	"created_by" integer REFERENCES "members"("id") ON DELETE SET NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add notifications table
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Add progress_stats table
CREATE TABLE "progress_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"member_id" integer REFERENCES "members"("id") ON DELETE CASCADE,
	"date" date NOT NULL,
	"pages_created" integer DEFAULT 0 NOT NULL,
	"pages_edited" integer DEFAULT 0 NOT NULL,
	"comments_added" integer DEFAULT 0 NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"hours_worked" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add template_categories table
CREATE TABLE "template_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL UNIQUE,
	"display_name" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"order" integer NOT NULL DEFAULT 0,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add templates table
CREATE TABLE "templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"category_id" integer REFERENCES "template_categories"("id") ON DELETE SET NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"author" text NOT NULL,
	"is_public" boolean NOT NULL DEFAULT true,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add indexes for better performance
CREATE INDEX "idx_teams_name" ON "teams"("name");
CREATE INDEX "idx_teams_is_active" ON "teams"("is_active");
CREATE INDEX "idx_members_email" ON "members"("email");
CREATE INDEX "idx_members_team_id" ON "members"("team_id");
CREATE INDEX "idx_tasks_team_id" ON "tasks"("team_id");
CREATE INDEX "idx_tasks_status" ON "tasks"("status");
CREATE INDEX "idx_tasks_assigned_to" ON "tasks"("assigned_to");
CREATE INDEX "idx_notifications_user_id" ON "notifications"("user_id");
CREATE INDEX "idx_notifications_is_read" ON "notifications"("is_read");
CREATE INDEX "idx_progress_stats_team_id" ON "progress_stats"("team_id");
CREATE INDEX "idx_progress_stats_member_id" ON "progress_stats"("member_id");
CREATE INDEX "idx_templates_category_id" ON "templates"("category_id");
CREATE INDEX "idx_templates_is_public" ON "templates"("is_public"); 