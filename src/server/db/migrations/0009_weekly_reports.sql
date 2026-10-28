CREATE TABLE "email_deliveries" (
	"kind" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"period_key" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_deliveries_kind_workspace_id_user_id_period_key_pk" PRIMARY KEY("kind","workspace_id","user_id","period_key")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"weekly_report" boolean DEFAULT true NOT NULL,
	"broken_links_email" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "weekly_report_enabled" boolean;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "report_send_day" integer;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "report_send_hour_utc" integer;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;