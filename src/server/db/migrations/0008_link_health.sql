CREATE TABLE "job_runs" (
	"name" text PRIMARY KEY NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"last_summary" text
);
--> statement-breakpoint
CREATE TABLE "link_health" (
	"link_id" uuid PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'ok' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reason" text,
	"last_status_code" integer,
	"failing_target" text,
	"flagged_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "health_monitor_enabled" boolean;--> statement-breakpoint
ALTER TABLE "link_health" ADD CONSTRAINT "link_health_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "link_health_next_check_idx" ON "link_health" USING btree ("next_check_at");--> statement-breakpoint
CREATE INDEX "link_health_flagged_idx" ON "link_health" USING btree ("state") WHERE "link_health"."state" = 'flagged';