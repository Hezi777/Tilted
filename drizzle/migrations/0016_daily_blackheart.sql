CREATE TABLE "seat_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_outs" ADD COLUMN "entered_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "count_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seat_members" ADD CONSTRAINT "seat_members_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_members" ADD CONSTRAINT "seat_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_members" ADD CONSTRAINT "seat_members_player_game_fk" FOREIGN KEY ("player_id","game_id") REFERENCES "public"."players"("id","game_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seat_members_game_id_person_id_unique" ON "seat_members" USING btree ("game_id","person_id");--> statement-breakpoint
CREATE INDEX "seat_members_player_id_idx" ON "seat_members" USING btree ("player_id");--> statement-breakpoint
ALTER TABLE "cash_outs" ADD CONSTRAINT "cash_outs_entered_by_person_id_people_id_fk" FOREIGN KEY ("entered_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;