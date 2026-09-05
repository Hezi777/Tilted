CREATE TYPE "public"."result_entry" AS ENUM('host_only', 'players');--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "result_entry" "result_entry" DEFAULT 'host_only' NOT NULL;