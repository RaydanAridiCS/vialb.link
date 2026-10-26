ALTER TABLE "links" ADD COLUMN "qr_ecc" text DEFAULT 'M' NOT NULL;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "qr_frame" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "qr_frame_text" text;