ALTER TABLE "instance_settings" ADD COLUMN "click_retention_days" integer;--> statement-breakpoint
CREATE INDEX "clicks_occurred_brin" ON "clicks" USING brin ("occurred_at");