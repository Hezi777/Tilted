CREATE TYPE "public"."buy_in_kind" AS ENUM('initial', 'rebuy');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('active', 'settling', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."mismatch_kind" AS ENUM('none', 'recount', 'split', 'assigned');--> statement-breakpoint
CREATE TABLE "buy_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"kind" "buy_in_kind" NOT NULL,
	"op_id" uuid NOT NULL,
	"created_by_device" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "buy_ins_amount_positive" CHECK ("buy_ins"."amount" > 0),
	CONSTRAINT "buy_ins_amount_bounded" CHECK ("buy_ins"."amount" <= 100000000)
);
--> statement-breakpoint
CREATE TABLE "cash_outs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"adjustment" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_outs_amount_non_negative" CHECK ("cash_outs"."amount" >= 0),
	CONSTRAINT "cash_outs_amount_bounded" CHECK ("cash_outs"."amount" <= 100000000),
	CONSTRAINT "cash_outs_adjustment_bounded" CHECK ("cash_outs"."adjustment" BETWEEN -100000000 AND 100000000)
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"buy_in" integer NOT NULL,
	"rebuy_amount" integer NOT NULL,
	"status" "game_status" DEFAULT 'active' NOT NULL,
	"mismatch_kind" "mismatch_kind" DEFAULT 'none' NOT NULL,
	"mismatch_amount" integer,
	"mismatch_player_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "games_buy_in_positive" CHECK ("games"."buy_in" > 0),
	CONSTRAINT "games_buy_in_bounded" CHECK ("games"."buy_in" <= 100000000),
	CONSTRAINT "games_rebuy_amount_positive" CHECK ("games"."rebuy_amount" > 0),
	CONSTRAINT "games_rebuy_amount_bounded" CHECK ("games"."rebuy_amount" <= 100000000),
	CONSTRAINT "games_mismatch_amount_bounded" CHECK ("games"."mismatch_amount" BETWEEN -100000000 AND 100000000)
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"nickname" text
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"person_id" uuid,
	"name" text NOT NULL,
	"avatar_key" text,
	"seat_order" integer NOT NULL,
	"device_id" text,
	"is_host" boolean DEFAULT false NOT NULL,
	"settled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "players_id_game_id_key" UNIQUE("id","game_id")
);
--> statement-breakpoint
ALTER TABLE "buy_ins" ADD CONSTRAINT "buy_ins_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_ins" ADD CONSTRAINT "buy_ins_player_game_fk" FOREIGN KEY ("player_id","game_id") REFERENCES "public"."players"("id","game_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_outs" ADD CONSTRAINT "cash_outs_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_outs" ADD CONSTRAINT "cash_outs_player_game_fk" FOREIGN KEY ("player_id","game_id") REFERENCES "public"."players"("id","game_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_mismatch_player_id_players_id_fk" FOREIGN KEY ("mismatch_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buy_ins_op_id_unique" ON "buy_ins" USING btree ("op_id");--> statement-breakpoint
CREATE INDEX "buy_ins_game_id_idx" ON "buy_ins" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "buy_ins_player_id_idx" ON "buy_ins" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_outs_game_id_player_id_unique" ON "cash_outs" USING btree ("game_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "games_code_active_unique" ON "games" USING btree ("code") WHERE "games"."status" NOT IN ('closed', 'cancelled');--> statement-breakpoint
CREATE INDEX "games_status_closed_at_idx" ON "games" USING btree ("status","closed_at");--> statement-breakpoint
CREATE INDEX "players_game_id_idx" ON "players" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "players_person_id_idx" ON "players" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_game_id_person_id_unique" ON "players" USING btree ("game_id","person_id") WHERE "person_id" IS NOT NULL AND "deleted_at" IS NULL;