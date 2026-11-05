ALTER TABLE "exercises" ADD COLUMN "bodyweight_share" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD COLUMN "bodyweight_kg" double precision;--> statement-breakpoint
-- Bodyweight counts toward volume (DECISIONS.md D44, docs/TRAINING-MATHS.md).
-- A bodyweight exercise that counts reps lifts all of the person by default, the person's own
-- exercises included (`defaultBodyweightShare`); a timed one (a plank) lifts nothing.
UPDATE "exercises" SET "bodyweight_share" = 1 WHERE "kind" = 'bodyweight' AND "measures" ? 'reps';
--> statement-breakpoint
-- The catalogue's exceptions, where only part of the body moves. Source: src/db/exercise-catalogue.ts
UPDATE "exercises" SET "bodyweight_share" = 0.35 WHERE "id" = '0199c0a1-5e00-7000-8000-000000000064'; -- Hanging leg raise
--> statement-breakpoint
UPDATE "exercises" SET "bodyweight_share" = 0.5 WHERE "id" = '0199c0a1-5e00-7000-8000-000000000066'; -- Ab wheel rollout
--> statement-breakpoint
UPDATE "exercises" SET "bodyweight_share" = 0.3 WHERE "id" = '0199c0a1-5e00-7000-8000-000000000067'; -- Russian twist
--> statement-breakpoint
UPDATE "exercises" SET "bodyweight_share" = 0.5 WHERE "id" = '0199c0a1-5e00-7000-8000-000000000068'; -- Back extension
--> statement-breakpoint
-- Backdate every session already logged: each block gets the kilograms of the person one rep
-- lifted, from their weight on the session's day. That is the latest weigh-in on or before the
-- day, else the earliest one after it, else the profile weight (`bodyWeightOn` in
-- weight-service.ts reads it the same way for new sessions).
UPDATE "workout_exercises" AS we
SET "bodyweight_kg" = round((e."bodyweight_share" * body."weight_kg")::numeric, 1)::double precision
FROM "exercises" AS e, "workouts" AS w
CROSS JOIN LATERAL (
  SELECT COALESCE(
    (SELECT "weight_kg" FROM "weight_entries" WHERE "user_id" = w."user_id" AND "day" <= w."day" ORDER BY "day" DESC LIMIT 1),
    (SELECT "weight_kg" FROM "weight_entries" WHERE "user_id" = w."user_id" ORDER BY "day" ASC LIMIT 1),
    (SELECT "weight_kg" FROM "profiles" WHERE "user_id" = w."user_id")
  ) AS "weight_kg"
) AS body
WHERE e."id" = we."exercise_id"
  AND w."id" = we."workout_id"
  AND e."bodyweight_share" > 0
  AND body."weight_kg" IS NOT NULL;
