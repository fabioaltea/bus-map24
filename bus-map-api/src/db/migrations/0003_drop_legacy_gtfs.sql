-- 0003_drop_legacy_gtfs.sql
-- ⚠️  DO NOT RUN AUTOMATICALLY.
-- Gate this behind explicit operator acknowledgement after ALL feeds have been
-- re-ingested under the compact pipeline (pipeline_version = 2).
--
-- Verify before running:
--   SELECT COUNT(*) FROM feed_catalog_entries WHERE pipeline_version <> 2 OR import_status <> 'ready';
-- Must return 0.

DROP TABLE IF EXISTS stop_times CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS shapes CASCADE;
DROP TABLE IF EXISTS stops CASCADE;
DROP TABLE IF EXISTS routes CASCADE;
DROP TABLE IF EXISTS agencies CASCADE;
DROP TABLE IF EXISTS calendars CASCADE;
DROP TABLE IF EXISTS calendar_dates CASCADE;
