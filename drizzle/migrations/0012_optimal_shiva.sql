CREATE TABLE "custom_avatars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"image_base64" text NOT NULL,
	"content_type" text DEFAULT 'image/webp' NOT NULL,
	"reserved" boolean DEFAULT false NOT NULL,
	"claim_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_avatars_key_prefixed" CHECK ("custom_avatars"."key" LIKE 'custom-%')
);
--> statement-breakpoint
ALTER TABLE "custom_avatars" ADD CONSTRAINT "custom_avatars_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_avatars_key_unique" ON "custom_avatars" USING btree ("key");