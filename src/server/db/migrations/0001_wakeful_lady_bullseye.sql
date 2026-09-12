CREATE TYPE "public"."currency" AS ENUM('EUR', 'USD');--> statement-breakpoint
CREATE TYPE "public"."wallet_kind" AS ENUM('asset', 'liability');--> statement-breakpoint
CREATE TABLE "wallet" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" "currency" NOT NULL,
	"kind" "wallet_kind" NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"date" date NOT NULL,
	"amount" bigint NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_snapshot_wallet_date_uq" UNIQUE("wallet_id","date")
);
--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_snapshot" ADD CONSTRAINT "wallet_snapshot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_snapshot" ADD CONSTRAINT "wallet_snapshot_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_user_idx" ON "wallet" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_snapshot_user_idx" ON "wallet_snapshot" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_snapshot_wallet_date_idx" ON "wallet_snapshot" USING btree ("wallet_id","date");