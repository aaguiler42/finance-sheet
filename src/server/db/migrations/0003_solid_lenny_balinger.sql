CREATE TABLE "income" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category_id" text NOT NULL,
	"date" date NOT NULL,
	"amount" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_category_id_income_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."income_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "income_user_date_idx" ON "income" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "income_category_idx" ON "income" USING btree ("category_id");