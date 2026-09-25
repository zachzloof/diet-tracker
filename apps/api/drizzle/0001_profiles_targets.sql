CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sex" text NOT NULL,
	"dob" date NOT NULL,
	"height_cm" double precision NOT NULL,
	"weight_kg" double precision NOT NULL,
	"body_fat_pct" double precision,
	"goal" text NOT NULL,
	"pace" text,
	"goal_weight_kg" double precision,
	"activity" text NOT NULL,
	"training_type" text NOT NULL,
	"training_days" integer NOT NULL,
	"diet_pattern" text NOT NULL,
	"allergies" text[] DEFAULT '{}' NOT NULL,
	"dislikes" text[] DEFAULT '{}' NOT NULL,
	"timezone" text NOT NULL,
	"units" text NOT NULL,
	"flags" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"trigger" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"computed" jsonb NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective" jsonb NOT NULL,
	"explanation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weight_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"weight_kg" double precision NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_versions" ADD CONSTRAINT "target_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_user_created_idx" ON "ai_calls" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "target_versions_user_effective_idx" ON "target_versions" USING btree ("user_id","effective_from","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "weight_entries_user_day_idx" ON "weight_entries" USING btree ("user_id","day");