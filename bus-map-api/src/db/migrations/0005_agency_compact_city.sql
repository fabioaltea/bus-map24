-- Add city field to agencies_compact (for admin metadata editing)
ALTER TABLE "agencies_compact" ADD COLUMN IF NOT EXISTS "city" varchar(128);
