ALTER TABLE "feed_catalog_entries" ADD COLUMN IF NOT EXISTS "municipality" varchar(128);
--> statement-breakpoint
ALTER TABLE "agencies_compact" ADD COLUMN IF NOT EXISTS "brand_color" varchar(6);
--> statement-breakpoint
ALTER TABLE "agencies_compact" ADD COLUMN IF NOT EXISTS "logo_url" text;
