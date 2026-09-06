ALTER TABLE "people" ADD COLUMN "chip_body" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "chip_edge" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "chip_spots" integer;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "chip_initials" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "default_buy_in" integer;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "default_chip_set_id" uuid;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "haptics_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "reduce_motion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "chip_body" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "chip_edge" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "chip_spots" integer;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "chip_initials" text;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_chip_body_hex" CHECK ("people"."chip_body" IS NULL OR "people"."chip_body" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_chip_edge_hex" CHECK ("people"."chip_edge" IS NULL OR "people"."chip_edge" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_chip_spots_range" CHECK ("people"."chip_spots" IS NULL OR ("people"."chip_spots" >= 3 AND "people"."chip_spots" <= 8));--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_chip_initials_len" CHECK ("people"."chip_initials" IS NULL OR char_length("people"."chip_initials") <= 2);--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_default_buy_in_range" CHECK ("people"."default_buy_in" IS NULL OR ("people"."default_buy_in" > 0 AND "people"."default_buy_in" <= 100000000));