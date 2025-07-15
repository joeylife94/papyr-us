-- Add blocks field to wiki_pages table for block-based editor
ALTER TABLE "wiki_pages" ADD COLUMN "blocks" jsonb DEFAULT '[]'::jsonb; 