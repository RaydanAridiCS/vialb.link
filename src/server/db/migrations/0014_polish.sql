ALTER TABLE "links" ADD COLUMN "preview_interstitial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "require_admin_2fa" boolean;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "branding" jsonb;