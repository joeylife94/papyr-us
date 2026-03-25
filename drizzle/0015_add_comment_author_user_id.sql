ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "author_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL;
