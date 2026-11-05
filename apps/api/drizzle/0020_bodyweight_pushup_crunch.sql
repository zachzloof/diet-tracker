-- D44, decided by the owner 2026-11-05: a push-up counts the share of bodyweight the hands
-- carry (0.7, the middle of the force-plate measurements), not all of it.
-- Source: src/db/exercise-catalogue.ts
UPDATE "exercises" SET "bodyweight_share" = 0.7 WHERE "id" = '0199c0a1-5e00-7000-8000-000000000025';
--> statement-breakpoint
-- Every push-up block logged so far was stamped at all of the person's weight on its day
-- (migration 0019, or a save since), so the stored load is rescaled, keeping that day's weight.
UPDATE "workout_exercises"
SET "bodyweight_kg" = round(("bodyweight_kg" * 0.7)::numeric, 1)::double precision
WHERE "exercise_id" = '0199c0a1-5e00-7000-8000-000000000025' AND "bodyweight_kg" IS NOT NULL;
--> statement-breakpoint
-- Two bodyweight core exercises the catalogue lacked, with their shares.
INSERT INTO "exercises" ("id", "name", "kind", "muscle_groups", "measures", "bodyweight_share") VALUES
('0199c0a1-5e00-7000-8000-000000000075', 'Crunch', 'bodyweight', '["core"]'::jsonb, '["reps"]'::jsonb, 0.3),
('0199c0a1-5e00-7000-8000-000000000076', 'Sit-up', 'bodyweight', '["core"]'::jsonb, '["reps"]'::jsonb, 0.5)
ON CONFLICT ("id") DO NOTHING;
