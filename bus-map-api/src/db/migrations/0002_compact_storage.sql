CREATE TABLE IF NOT EXISTS "agencies_compact" (
	"feed_id" uuid NOT NULL,
	"internal_id" integer NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"tz" text NOT NULL,
	"coverage" geometry(MultiPolygon,4326),
	CONSTRAINT "agencies_compact_feed_id_internal_id_pk" PRIMARY KEY("feed_id","internal_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_compact" (
	"feed_id" uuid NOT NULL,
	"service_internal_id" integer NOT NULL,
	"monday" boolean NOT NULL,
	"tuesday" boolean NOT NULL,
	"wednesday" boolean NOT NULL,
	"thursday" boolean NOT NULL,
	"friday" boolean NOT NULL,
	"saturday" boolean NOT NULL,
	"sunday" boolean NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "calendar_compact_feed_id_service_internal_id_pk" PRIMARY KEY("feed_id","service_internal_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_dates_compact" (
	"feed_id" uuid NOT NULL,
	"service_internal_id" integer NOT NULL,
	"date" date NOT NULL,
	"exception_type" smallint NOT NULL,
	CONSTRAINT "calendar_dates_compact_feed_id_service_internal_id_date_pk" PRIMARY KEY("feed_id","service_internal_id","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feed_agencies" (
	"feed_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"internal_id" integer NOT NULL,
	CONSTRAINT "feed_agencies_feed_id_external_id_pk" PRIMARY KEY("feed_id","external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feed_routes" (
	"feed_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"internal_id" integer NOT NULL,
	CONSTRAINT "feed_routes_feed_id_external_id_pk" PRIMARY KEY("feed_id","external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feed_services" (
	"feed_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"internal_id" integer NOT NULL,
	CONSTRAINT "feed_services_feed_id_external_id_pk" PRIMARY KEY("feed_id","external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feed_shapes" (
	"feed_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"internal_id" integer NOT NULL,
	CONSTRAINT "feed_shapes_feed_id_external_id_pk" PRIMARY KEY("feed_id","external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feed_stops" (
	"feed_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"internal_id" integer NOT NULL,
	CONSTRAINT "feed_stops_feed_id_external_id_pk" PRIMARY KEY("feed_id","external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feed_trips" (
	"feed_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"internal_id" integer NOT NULL,
	CONSTRAINT "feed_trips_feed_id_external_id_pk" PRIMARY KEY("feed_id","external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "frequencies_compact" (
	"feed_id" uuid NOT NULL,
	"trip_internal_id" integer NOT NULL,
	"start_time_sec" integer NOT NULL,
	"end_time_sec" integer NOT NULL,
	"headway_sec" integer NOT NULL,
	"exact_times" boolean DEFAULT false NOT NULL,
	CONSTRAINT "frequencies_compact_feed_id_trip_internal_id_start_time_sec_pk" PRIMARY KEY("feed_id","trip_internal_id","start_time_sec")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pattern_stops" (
	"pattern_id" bigint NOT NULL,
	"seq" smallint NOT NULL,
	"stop_internal_id" integer NOT NULL,
	"offset_arrival_sec" integer NOT NULL,
	"offset_departure_sec" integer NOT NULL,
	CONSTRAINT "pattern_stops_pattern_id_seq_pk" PRIMARY KEY("pattern_id","seq")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routes_compact" (
	"feed_id" uuid NOT NULL,
	"internal_id" integer NOT NULL,
	"agency_internal_id" integer NOT NULL,
	"short_name" text,
	"long_name" text,
	"route_type" smallint NOT NULL,
	"color" char(6),
	"text_color" char(6),
	CONSTRAINT "routes_compact_feed_id_internal_id_pk" PRIMARY KEY("feed_id","internal_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shapes_compact" (
	"feed_id" uuid NOT NULL,
	"internal_id" integer NOT NULL,
	"polyline6" text NOT NULL,
	"simplify_eps_m" real DEFAULT 5 NOT NULL,
	"shape_hash" bigint NOT NULL,
	"bbox" geometry(Polygon,4326),
	CONSTRAINT "shapes_compact_feed_id_internal_id_pk" PRIMARY KEY("feed_id","internal_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stop_patterns" (
	"pattern_id" bigserial PRIMARY KEY NOT NULL,
	"feed_id" uuid NOT NULL,
	"stop_count" smallint NOT NULL,
	"duration_sec" integer NOT NULL,
	"pattern_hash" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stops_compact" (
	"feed_id" uuid NOT NULL,
	"internal_id" integer NOT NULL,
	"name" text NOT NULL,
	"lat_e6" integer NOT NULL,
	"lon_e6" integer NOT NULL,
	"parent_internal_id" integer,
	"geom" geometry(Point,4326) GENERATED ALWAYS AS (
		ST_SetSRID(
			ST_MakePoint(
				"lon_e6"::double precision / 1e6,
				"lat_e6"::double precision / 1e6
			),
			4326
		)
	) STORED,
	CONSTRAINT "stops_compact_feed_id_internal_id_pk" PRIMARY KEY("feed_id","internal_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trips_compact" (
	"feed_id" uuid NOT NULL,
	"internal_id" integer NOT NULL,
	"route_internal_id" integer NOT NULL,
	"service_internal_id" integer NOT NULL,
	"pattern_id" bigint NOT NULL,
	"start_time_sec" integer NOT NULL,
	"shape_internal_id" integer,
	"direction_id" smallint,
	"headsign" text,
	CONSTRAINT "trips_compact_feed_id_internal_id_pk" PRIMARY KEY("feed_id","internal_id")
);
--> statement-breakpoint
ALTER TABLE "feed_catalog_entries" ADD COLUMN "last_imported_sha256" char(64);--> statement-breakpoint
ALTER TABLE "feed_catalog_entries" ADD COLUMN "pipeline_version" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agencies_compact" ADD CONSTRAINT "agencies_compact_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_compact" ADD CONSTRAINT "calendar_compact_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_dates_compact" ADD CONSTRAINT "calendar_dates_compact_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feed_agencies" ADD CONSTRAINT "feed_agencies_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feed_routes" ADD CONSTRAINT "feed_routes_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feed_services" ADD CONSTRAINT "feed_services_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feed_shapes" ADD CONSTRAINT "feed_shapes_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feed_stops" ADD CONSTRAINT "feed_stops_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feed_trips" ADD CONSTRAINT "feed_trips_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "frequencies_compact" ADD CONSTRAINT "frequencies_compact_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pattern_stops" ADD CONSTRAINT "pattern_stops_pattern_id_stop_patterns_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."stop_patterns"("pattern_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routes_compact" ADD CONSTRAINT "routes_compact_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shapes_compact" ADD CONSTRAINT "shapes_compact_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stop_patterns" ADD CONSTRAINT "stop_patterns_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stops_compact" ADD CONSTRAINT "stops_compact_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips_compact" ADD CONSTRAINT "trips_compact_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agencies_compact_coverage_idx" ON "agencies_compact" USING gist ("coverage");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feed_agencies_internal_uniq" ON "feed_agencies" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agencies_internal" ON "feed_agencies" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feed_routes_internal_uniq" ON "feed_routes" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_routes_internal" ON "feed_routes" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feed_services_internal_uniq" ON "feed_services" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_services_internal" ON "feed_services" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feed_shapes_internal_uniq" ON "feed_shapes" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_shapes_internal" ON "feed_shapes" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feed_stops_internal_uniq" ON "feed_stops" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stops_internal" ON "feed_stops" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feed_trips_internal_uniq" ON "feed_trips" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trips_internal" ON "feed_trips" USING btree ("feed_id","internal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pattern_stops_stop_idx" ON "pattern_stops" USING btree ("stop_internal_id","pattern_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routes_compact_agency_idx" ON "routes_compact" USING btree ("feed_id","agency_internal_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shapes_compact_hash_uniq" ON "shapes_compact" USING btree ("feed_id","shape_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shapes_compact_bbox_idx" ON "shapes_compact" USING gist ("bbox");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stop_patterns_hash_uniq" ON "stop_patterns" USING btree ("feed_id","pattern_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stops_compact_geom_idx" ON "stops_compact" USING gist ("geom");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_compact_pattern_service_idx" ON "trips_compact" USING btree ("pattern_id","service_internal_id","start_time_sec");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_compact_route_idx" ON "trips_compact" USING btree ("feed_id","route_internal_id");