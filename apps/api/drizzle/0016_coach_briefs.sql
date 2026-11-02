CREATE TABLE "coach_briefs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"half" text NOT NULL,
	"day" date NOT NULL,
	"text" text NOT NULL,
	"model" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_briefs" ADD CONSTRAINT "coach_briefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_briefs_user_half_day_idx" ON "coach_briefs" USING btree ("user_id","half","day");