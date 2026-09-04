CREATE TABLE "cash_out_chips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_out_id" uuid NOT NULL,
	"denomination_id" uuid NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "cash_out_chips_count_non_negative" CHECK ("cash_out_chips"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "chip_denominations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chip_set_id" uuid NOT NULL,
	"color" text NOT NULL,
	"value" integer NOT NULL,
	"image_key" text,
	"sort_order" integer NOT NULL,
	CONSTRAINT "chip_denominations_set_sort_unique" UNIQUE("chip_set_id","sort_order"),
	CONSTRAINT "chip_denominations_value_positive" CHECK ("chip_denominations"."value" > 0),
	CONSTRAINT "chip_denominations_value_bounded" CHECK ("chip_denominations"."value" <= 100000000),
	CONSTRAINT "chip_denominations_color_hex" CHECK ("chip_denominations"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "chip_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_person_id" uuid,
	"is_preset" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hand_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hand_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"hole_cards" text,
	"delta" integer,
	CONSTRAINT "hand_players_delta_bounded" CHECK ("hand_players"."delta" BETWEEN -100000000 AND 100000000)
);
--> statement-breakpoint
CREATE TABLE "hands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"title" text,
	"note" text,
	"board" text,
	"pot_amount" integer,
	"winner_player_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hands_pot_amount_bounded" CHECK ("hands"."pot_amount" BETWEEN 0 AND 100000000)
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "playlists_sort_order_unique" UNIQUE("sort_order")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"from_player_id" uuid NOT NULL,
	"to_player_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"paid_at" timestamp with time zone,
	"marked_by_device" text,
	CONSTRAINT "transfers_amount_positive" CHECK ("transfers"."amount" > 0),
	CONSTRAINT "transfers_amount_bounded" CHECK ("transfers"."amount" <= 100000000),
	CONSTRAINT "transfers_distinct_players" CHECK ("transfers"."from_player_id" <> "transfers"."to_player_id")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "chip_set_id" uuid;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "created_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "table_seat" integer;--> statement-breakpoint
ALTER TABLE "cash_out_chips" ADD CONSTRAINT "cash_out_chips_cash_out_id_cash_outs_id_fk" FOREIGN KEY ("cash_out_id") REFERENCES "public"."cash_outs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_out_chips" ADD CONSTRAINT "cash_out_chips_denomination_id_chip_denominations_id_fk" FOREIGN KEY ("denomination_id") REFERENCES "public"."chip_denominations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_denominations" ADD CONSTRAINT "chip_denominations_chip_set_id_chip_sets_id_fk" FOREIGN KEY ("chip_set_id") REFERENCES "public"."chip_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_sets" ADD CONSTRAINT "chip_sets_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hand_players" ADD CONSTRAINT "hand_players_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hands" ADD CONSTRAINT "hands_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hands" ADD CONSTRAINT "hands_winner_player_game_fk" FOREIGN KEY ("winner_player_id","game_id") REFERENCES "public"."players"("id","game_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_player_game_fk" FOREIGN KEY ("from_player_id","game_id") REFERENCES "public"."players"("id","game_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_player_game_fk" FOREIGN KEY ("to_player_id","game_id") REFERENCES "public"."players"("id","game_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_out_chips_cash_out_denomination_unique" ON "cash_out_chips" USING btree ("cash_out_id","denomination_id");--> statement-breakpoint
CREATE INDEX "chip_denominations_chip_set_id_idx" ON "chip_denominations" USING btree ("chip_set_id");--> statement-breakpoint
CREATE INDEX "chip_sets_owner_person_id_idx" ON "chip_sets" USING btree ("owner_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hand_players_hand_player_unique" ON "hand_players" USING btree ("hand_id","player_id");--> statement-breakpoint
CREATE INDEX "hands_game_id_idx" ON "hands" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transfers_game_from_to_unique" ON "transfers" USING btree ("game_id","from_player_id","to_player_id");--> statement-breakpoint
CREATE INDEX "transfers_game_id_idx" ON "transfers" USING btree ("game_id");--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_chip_set_id_chip_sets_id_fk" FOREIGN KEY ("chip_set_id") REFERENCES "public"."chip_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;