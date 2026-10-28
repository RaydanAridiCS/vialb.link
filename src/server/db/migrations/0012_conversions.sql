CREATE TABLE "conversions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "conversions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"link_id" uuid NOT NULL,
	"click_id" bigint NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"value_minor" bigint,
	"currency" text,
	CONSTRAINT "conversions_click_id_unique" UNIQUE("click_id")
);
--> statement-breakpoint
ALTER TABLE "clicks" ADD COLUMN "click_ref" text;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "conversions_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_click_id_clicks_id_fk" FOREIGN KEY ("click_id") REFERENCES "public"."clicks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversions_link_occurred_idx" ON "conversions" USING btree ("link_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clicks_click_ref_unique" ON "clicks" USING btree ("click_ref") WHERE "clicks"."click_ref" is not null;