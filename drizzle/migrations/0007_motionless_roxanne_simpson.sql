ALTER TABLE "chip_denominations" ADD COLUMN "edge_color" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "avatar_key" text;--> statement-breakpoint
ALTER TABLE "chip_denominations" ADD CONSTRAINT "chip_denominations_edge_color_hex" CHECK ("chip_denominations"."edge_color" IS NULL OR "chip_denominations"."edge_color" ~ '^#[0-9a-fA-F]{6}$');