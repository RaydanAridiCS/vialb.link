CREATE TABLE "bio_buttons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"link_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bio_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"theme" text DEFAULT 'paper' NOT NULL,
	"socials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"show_badge" boolean DEFAULT true NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "kind" text DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE "bio_buttons" ADD CONSTRAINT "bio_buttons_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_buttons" ADD CONSTRAINT "bio_buttons_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_profiles" ADD CONSTRAINT "bio_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bio_buttons_link_unique" ON "bio_buttons" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "bio_buttons_user_position_idx" ON "bio_buttons" USING btree ("user_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "bio_profiles_handle_unique" ON "bio_profiles" USING btree ("handle");