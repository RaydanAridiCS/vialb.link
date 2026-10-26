ALTER TABLE "clicks" ADD COLUMN "routed_by" text;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "routing_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;