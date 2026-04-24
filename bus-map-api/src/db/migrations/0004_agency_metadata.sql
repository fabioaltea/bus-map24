-- Add municipality to feed_catalog_entries (populated from MobilityDB API)
ALTER TABLE "feed_catalog_entries" ADD COLUMN "municipality" varchar(128);

-- Add branding fields to agencies_compact
ALTER TABLE "agencies_compact" ADD COLUMN "brand_color" varchar(6);
ALTER TABLE "agencies_compact" ADD COLUMN "logo_url" text;
