CREATE TABLE IF NOT EXISTS "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_id" uuid NOT NULL,
	"agency_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text,
	"timezone" varchar(64) NOT NULL,
	"lang" char(2),
	"phone" varchar(64),
	"bounding_box" geometry(Polygon,4326),
	"route_count" integer DEFAULT 0 NOT NULL,
	"stop_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_id" uuid NOT NULL,
	"service_id" varchar(64) NOT NULL,
	"date" date NOT NULL,
	"exception_type" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_id" uuid NOT NULL,
	"service_id" varchar(64) NOT NULL,
	"monday" boolean NOT NULL,
	"tuesday" boolean NOT NULL,
	"wednesday" boolean NOT NULL,
	"thursday" boolean NOT NULL,
	"friday" boolean NOT NULL,
	"saturday" boolean NOT NULL,
	"sunday" boolean NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feed_catalog_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobility_db_id" varchar(64) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"country_code" char(2) NOT NULL,
	"download_url" text NOT NULL,
	"bounding_box" geometry(Polygon,4326),
	"hash_sha256" char(64),
	"last_checked_at" timestamp with time zone,
	"last_imported_at" timestamp with time zone,
	"import_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_catalog_entries_mobility_db_id_unique" UNIQUE("mobility_db_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"route_id" varchar(64) NOT NULL,
	"short_name" varchar(32),
	"long_name" varchar(255),
	"description" text,
	"route_type" smallint NOT NULL,
	"color" char(6) DEFAULT 'AAAAAA',
	"text_color" char(6) DEFAULT 'FFFFFF',
	"shape_geom" geometry(MultiLineString,4326)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shapes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_id" uuid NOT NULL,
	"shape_id" varchar(64) NOT NULL,
	"geom" geometry(LineString,4326) NOT NULL,
	"length_m" double precision
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stop_times" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"feed_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"arrival_time" interval NOT NULL,
	"departure_time" interval NOT NULL,
	"stop_sequence" integer NOT NULL,
	"stop_headsign" varchar(255),
	"pickup_type" smallint DEFAULT 0 NOT NULL,
	"drop_off_type" smallint DEFAULT 0 NOT NULL,
	"timepoint" smallint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_id" uuid NOT NULL,
	"stop_id" varchar(64) NOT NULL,
	"code" varchar(32),
	"name" varchar(255) NOT NULL,
	"description" text,
	"location" geometry(Point,4326) NOT NULL,
	"zone_id" varchar(64),
	"url" text,
	"location_type" smallint DEFAULT 0 NOT NULL,
	"parent_station_id" uuid,
	"wheelchair_boarding" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_id" uuid NOT NULL,
	"trip_id" varchar(64) NOT NULL,
	"route_id" uuid NOT NULL,
	"service_id" varchar(64) NOT NULL,
	"shape_id" uuid,
	"headsign" varchar(255),
	"direction_id" smallint,
	"block_id" varchar(64),
	"wheelchair_accessible" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agencies" ADD CONSTRAINT "agencies_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_dates" ADD CONSTRAINT "calendar_dates_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendars" ADD CONSTRAINT "calendars_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routes" ADD CONSTRAINT "routes_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routes" ADD CONSTRAINT "routes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shapes" ADD CONSTRAINT "shapes_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stop_times" ADD CONSTRAINT "stop_times_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stop_times" ADD CONSTRAINT "stop_times_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stop_times" ADD CONSTRAINT "stop_times_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stops" ADD CONSTRAINT "stops_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_feed_id_feed_catalog_entries_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed_catalog_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_shape_id_shapes_id_fk" FOREIGN KEY ("shape_id") REFERENCES "public"."shapes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agencies_feed_agency_idx" ON "agencies" USING btree ("feed_id","agency_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agencies_bbox_idx" ON "agencies" USING gist ("bounding_box");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_dates_exception_idx" ON "calendar_dates" USING btree ("feed_id","service_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendars_service_idx" ON "calendars" USING btree ("feed_id","service_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "routes_feed_route_idx" ON "routes" USING btree ("feed_id","route_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routes_shape_geom_idx" ON "routes" USING gist ("shape_geom");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routes_agency_idx" ON "routes" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shapes_feed_shape_idx" ON "shapes" USING btree ("feed_id","shape_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shapes_geom_idx" ON "shapes" USING gist ("geom");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stop_times_seq_idx" ON "stop_times" USING btree ("feed_id","trip_id","stop_sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stop_times_stop_dep_idx" ON "stop_times" USING btree ("stop_id","departure_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stop_times_trip_idx" ON "stop_times" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stops_feed_stop_idx" ON "stops" USING btree ("feed_id","stop_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stops_location_idx" ON "stops" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trips_feed_trip_idx" ON "trips" USING btree ("feed_id","trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_route_idx" ON "trips" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_service_idx" ON "trips" USING btree ("feed_id","service_id");