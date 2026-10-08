CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"muscle_groups" jsonb NOT NULL,
	"measures" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"exercise_id" uuid,
	"exercise_name" text NOT NULL,
	"position" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"weight_kg" double precision,
	"reps" integer,
	"duration_s" integer,
	"distance_m" double precision,
	"rpe" double precision,
	"is_warmup" boolean DEFAULT false NOT NULL,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"feel" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_workout_exercise_id_workout_exercises_id_fk" FOREIGN KEY ("workout_exercise_id") REFERENCES "public"."workout_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_user_name_idx" ON "exercises" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "workout_exercises_workout_idx" ON "workout_exercises" USING btree ("workout_id","position");--> statement-breakpoint
CREATE INDEX "workout_exercises_user_exercise_idx" ON "workout_exercises" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "workout_sets_block_idx" ON "workout_sets" USING btree ("workout_exercise_id","position");--> statement-breakpoint
CREATE INDEX "workouts_user_day_idx" ON "workouts" USING btree ("user_id","day");--> statement-breakpoint
-- The shared exercise catalogue (D35): fixed ids, null user. Source: src/db/exercise-catalogue.ts
INSERT INTO "exercises" ("id", "name", "kind", "muscle_groups", "measures") VALUES
('0199c0a1-5e00-7000-8000-000000000001', 'Barbell back squat', 'barbell', '["quads","glutes"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000002', 'Barbell front squat', 'barbell', '["quads","core"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000003', 'Goblet squat', 'dumbbell', '["quads","glutes"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000004', 'Leg press', 'machine', '["quads","glutes"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000005', 'Hack squat', 'machine', '["quads"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000006', 'Bulgarian split squat', 'dumbbell', '["quads","glutes"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000007', 'Walking lunge', 'dumbbell', '["quads","glutes"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000008', 'Conventional deadlift', 'barbell', '["hamstrings","glutes","back"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000009', 'Sumo deadlift', 'barbell', '["glutes","hamstrings","quads"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000010', 'Romanian deadlift', 'barbell', '["hamstrings","glutes"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000011', 'Dumbbell Romanian deadlift', 'dumbbell', '["hamstrings","glutes"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000012', 'Trap bar deadlift', 'barbell', '["quads","glutes","back"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000013', 'Hip thrust', 'barbell', '["glutes","hamstrings"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000014', 'Leg extension', 'machine', '["quads"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000015', 'Lying leg curl', 'machine', '["hamstrings"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000016', 'Seated leg curl', 'machine', '["hamstrings"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000017', 'Standing calf raise', 'machine', '["calves"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000018', 'Seated calf raise', 'machine', '["calves"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000019', 'Kettlebell swing', 'kettlebell', '["glutes","hamstrings","back"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000020', 'Barbell bench press', 'barbell', '["chest","triceps","shoulders"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000021', 'Incline barbell bench press', 'barbell', '["chest","shoulders"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000022', 'Dumbbell bench press', 'dumbbell', '["chest","triceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000023', 'Incline dumbbell bench press', 'dumbbell', '["chest","shoulders"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000024', 'Machine chest press', 'machine', '["chest","triceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000025', 'Push-up', 'bodyweight', '["chest","triceps"]'::jsonb, '["reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000026', 'Dip', 'bodyweight', '["chest","triceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000027', 'Cable fly', 'cable', '["chest"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000028', 'Pec deck', 'machine', '["chest"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000029', 'Overhead press', 'barbell', '["shoulders","triceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000030', 'Seated dumbbell shoulder press', 'dumbbell', '["shoulders","triceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000031', 'Machine shoulder press', 'machine', '["shoulders"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000032', 'Dumbbell lateral raise', 'dumbbell', '["shoulders"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000033', 'Cable lateral raise', 'cable', '["shoulders"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000034', 'Rear delt fly', 'dumbbell', '["shoulders","back"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000035', 'Face pull', 'cable', '["shoulders","back"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000036', 'Close-grip bench press', 'barbell', '["triceps","chest"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000037', 'Triceps pushdown', 'cable', '["triceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000038', 'Overhead triceps extension', 'cable', '["triceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000039', 'Skull crusher', 'barbell', '["triceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000040', 'Pull-up', 'bodyweight', '["back","biceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000041', 'Chin-up', 'bodyweight', '["back","biceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000042', 'Lat pulldown', 'cable', '["back","biceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000043', 'Barbell row', 'barbell', '["back","biceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000044', 'Pendlay row', 'barbell', '["back"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000045', 'Dumbbell row', 'dumbbell', '["back","biceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000046', 'Seated cable row', 'cable', '["back","biceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000047', 'Chest-supported row', 'machine', '["back"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000048', 'T-bar row', 'machine', '["back"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000049', 'Straight-arm pulldown', 'cable', '["back"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000050', 'Barbell shrug', 'barbell', '["back"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000051', 'Barbell curl', 'barbell', '["biceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000052', 'Dumbbell curl', 'dumbbell', '["biceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000053', 'Hammer curl', 'dumbbell', '["biceps","forearms"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000054', 'Incline dumbbell curl', 'dumbbell', '["biceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000055', 'Cable curl', 'cable', '["biceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000056', 'Preacher curl', 'machine', '["biceps"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000057', 'Wrist curl', 'dumbbell', '["forearms"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000058', 'Power clean', 'barbell', '["full_body"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000059', 'Clean and jerk', 'barbell', '["full_body"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000060', 'Snatch', 'barbell', '["full_body"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000061', 'Thruster', 'barbell', '["full_body"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000062', 'Farmer carry', 'dumbbell', '["full_body","forearms"]'::jsonb, '["weight","distance"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000063', 'Plank', 'bodyweight', '["core"]'::jsonb, '["time"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000064', 'Hanging leg raise', 'bodyweight', '["core"]'::jsonb, '["reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000065', 'Cable crunch', 'cable', '["core"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000066', 'Ab wheel rollout', 'bodyweight', '["core"]'::jsonb, '["reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000067', 'Russian twist', 'bodyweight', '["core"]'::jsonb, '["reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000068', 'Back extension', 'bodyweight', '["back","glutes","hamstrings"]'::jsonb, '["weight","reps"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000069', 'Run', 'cardio', '["full_body"]'::jsonb, '["time","distance"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000070', 'Walk', 'cardio', '["full_body"]'::jsonb, '["time","distance"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000071', 'Rowing machine', 'cardio', '["full_body"]'::jsonb, '["time","distance"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000072', 'Stationary bike', 'cardio', '["quads"]'::jsonb, '["time","distance"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000073', 'Stair climber', 'cardio', '["glutes","quads"]'::jsonb, '["time"]'::jsonb),
('0199c0a1-5e00-7000-8000-000000000074', 'Skipping', 'cardio', '["calves"]'::jsonb, '["time"]'::jsonb);
