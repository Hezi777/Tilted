ALTER TABLE "people" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "people_user_id_unique" ON "people" USING btree ("user_id") WHERE "user_id" IS NOT NULL;