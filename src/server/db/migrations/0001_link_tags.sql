ALTER TABLE "links" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "links_tags_idx" ON "links" USING gin ("tags");