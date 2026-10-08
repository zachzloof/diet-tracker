ALTER TABLE "log_entries" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "log_entries" ADD COLUMN "group_name" text;--> statement-breakpoint
CREATE INDEX "log_entries_group_idx" ON "log_entries" USING btree ("group_id");