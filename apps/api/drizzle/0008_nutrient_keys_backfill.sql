-- Vitamin E, vitamin K, iodine and omega-3 joined the nutrient enum (DECISIONS.md D30).
-- Stored vectors are complete by contract, so every existing vector gets the four keys at 0.
-- `||` keeps any value already present on the right-hand side.
UPDATE "foods"
SET "nutrients" = '{"omega3_g":0,"iodine_ug":0,"vitamin_e_mg":0,"vitamin_k_ug":0}'::jsonb || "nutrients"
WHERE NOT ("nutrients" ?& array['omega3_g','iodine_ug','vitamin_e_mg','vitamin_k_ug']);
--> statement-breakpoint
UPDATE "log_entries"
SET "nutrients" = '{"omega3_g":0,"iodine_ug":0,"vitamin_e_mg":0,"vitamin_k_ug":0}'::jsonb || "nutrients"
WHERE NOT ("nutrients" ?& array['omega3_g','iodine_ug','vitamin_e_mg','vitamin_k_ug']);
--> statement-breakpoint
UPDATE "saved_meal_items"
SET "nutrients" = '{"omega3_g":0,"iodine_ug":0,"vitamin_e_mg":0,"vitamin_k_ug":0}'::jsonb || "nutrients"
WHERE NOT ("nutrients" ?& array['omega3_g','iodine_ug','vitamin_e_mg','vitamin_k_ug']);
--> statement-breakpoint
UPDATE "daily_summaries"
SET "totals" = '{"omega3_g":0,"iodine_ug":0,"vitamin_e_mg":0,"vitamin_k_ug":0}'::jsonb || "totals"
WHERE NOT ("totals" ?& array['omega3_g','iodine_ug','vitamin_e_mg','vitamin_k_ug']);
--> statement-breakpoint
-- An AI estimate made before these keys existed is missing four values, so its confidence drops.
UPDATE "log_entries"
SET "confidence" = 'low'
WHERE "source" = 'ai' AND "confidence" IS NOT NULL AND "confidence" <> 'low'
  AND "created_at" < now();
