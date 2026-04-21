# Feature Specification: GTFS Bus Map Explorer

**Feature Branch**: `001-gtfs-bus-map`
**Created**: 2026-04-13
**Status**: Draft
**Input**: User description: "Costruisci una applicazione stile flightsimulator ma per i bus. L'app non visualizzera in una prima versione dati in tempo reale ma i google transit feed statici. L'applicazione si mostrerà come una mappa a schermo intero dove zoommando su una certa zona del mondo potremmo filtrare le aziende locali e le linee disponibili e avere informazioni sui transiti e sulle fermate."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - World Map Navigation (Priority: P1)

A user opens the application and sees a full-screen, interactive world map — similar to a flight
simulator's globe view. The entire planet is visible. The user pans and zooms freely to any region.
As they zoom into a metropolitan area or country, transit agencies operating in that area appear
as selectable markers or a panel entry. The map simultaneously shows the route network as coloured
line overlays on the road/geography.

**Why this priority**: This is the core interaction model. Without navigation and the zoom-based
discovery of agencies, none of the other stories are reachable. Delivers the "wow" flight-simulator
feel immediately.

**Independent Test**: Launch the app, open it in a browser, navigate to any city (e.g., Rome, Tokyo,
New York). Confirm the map loads, zoom controls work, and agency/route overlays appear as the
viewport focuses on a populated transit area.

**Acceptance Scenarios**:

1. **Given** the app is open at world zoom level, **When** the user zooms into a city that has GTFS
   data, **Then** transit agency names and route overlays for that city become visible on the map.
2. **Given** the user is viewing a city, **When** they zoom back out to country or continent level,
   **Then** individual stop markers disappear and only aggregate agency/region indicators remain
   (decluttering at low zoom).
3. **Given** no GTFS data is available for a region, **When** the user zooms into it, **Then** the
   map renders cleanly with a subtle indicator that no transit data is available for that area.

---

### User Story 2 - Agency & Route Filtering (Priority: P2)

Once a region with transit data is in view, the user can select a specific transit agency from an
on-screen list or panel. The map filters to show only that agency's routes. The user can then select
an individual route/line to highlight it on the map, showing its full path and all its stops.

**Why this priority**: Filtering by agency and route is the primary tool for exploring a transit
network. Without it, cities with dozens of agencies would be overwhelming.

**Independent Test**: Zoom into a city, open the agency panel, select one agency, confirm only that
agency's routes remain on the map. Then select a specific route and confirm its polyline is
highlighted and its stops are marked.

**Acceptance Scenarios**:

1. **Given** multiple agencies are visible in the viewport, **When** the user selects one agency,
   **Then** only routes belonging to that agency are displayed and others are hidden or dimmed.
2. **Given** an agency is selected, **When** the user selects a specific route, **Then** the route
   is highlighted with its colour, all its stops appear as distinct markers, and the map auto-fits
   to show the full route extent.
3. **Given** a route is selected, **When** the user clears the selection, **Then** the view resets
   to show all routes for the active agency (or all agencies if no agency was selected).

---

### User Story 3 - Stop & Schedule Information (Priority: P3)

The user clicks or taps on a stop marker on the map and a panel or popup opens showing details about
that stop: its name, which routes serve it, and the scheduled departure times extracted from the
static GTFS data.

**Why this priority**: Schedule information at the stop level is the primary informational payoff of
the app. It transforms the explorer into a useful reference tool.

**Independent Test**: Select a route, click one of its stop markers, verify an information panel
appears with stop name, serving routes, and a timetable (list of scheduled times per route for that
stop).

**Acceptance Scenarios**:

1. **Given** a stop marker is visible on the map, **When** the user clicks it, **Then** an
   information panel opens showing the stop name, stop ID, and list of routes that serve it.
2. **Given** the stop information panel is open, **When** the user views the schedule section,
   **Then** scheduled departure times for each serving route are displayed grouped by route and
   sorted chronologically, derived from static GTFS data.
3. **Given** a stop has no scheduled service for the day (e.g., holiday or out-of-season), **When**
   the panel opens, **Then** a clear message indicates "No scheduled service available for today."

---

### Edge Cases

- What happens when a GTFS feed covers a very large area (e.g., a national rail network) and the
  user is zoomed out to country level — does the entire network render at once?
- How does the app handle GTFS feeds with hundreds of routes and thousands of stops in a single city
  (e.g., NYC MTA) without overwhelming the map?
- What if a GTFS feed file is malformed or partially corrupt?
- How are route colour conflicts handled when two agencies use the same colour?
- What does the user see when zoomed to ocean or uninhabited areas with no transit data?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST display a full-screen, interactive world map as its primary
  interface, covering all geographic regions.
- **FR-002**: The map MUST support continuous zoom and pan from global (world) level down to
  street level.
- **FR-003**: Transit agencies MUST become visible as the user zooms into a region where GTFS
  data is available; they MUST be hidden or aggregated at low zoom levels.
- **FR-004**: Route polylines MUST be rendered on the map using the colour defined in the GTFS
  feed for each route; a default colour MUST be applied when none is defined.
- **FR-005**: The user MUST be able to filter the map to show only the routes of a selected
  transit agency.
- **FR-006**: The user MUST be able to select a specific route and see only that route's
  polyline and stops highlighted on the map.
- **FR-007**: Stop markers MUST appear when the user is at sufficient zoom level (street/district
  level); they MUST be hidden at low zoom to avoid visual clutter.
- **FR-008**: Clicking or tapping a stop marker MUST open an information panel showing the stop
  name, serving routes, and scheduled departure times from static GTFS data.
- **FR-009**: The application MUST source transit data exclusively from static GTFS feeds (no
  real-time GTFS-RT in this version).
- **FR-010**: The application MUST handle GTFS feeds for multiple agencies and regions
  simultaneously without requiring a page reload.
- **FR-011**: The user MUST be able to clear all active filters and return to the unfiltered
  world view.
- **FR-012**: The application MUST display a clear visual indicator for geographic areas where
  no GTFS data is available.

### Key Entities

- **GTFS Feed**: A data source covering one or more transit agencies in a geographic region.
  Attributes: source identifier, coverage bounding box, last updated date.
- **Agency**: A transit operator. Attributes: agency ID, name, geographic coverage area, website.
- **Route**: A named service (line). Attributes: route ID, short name, long name, type (bus, tram,
  subway, rail, etc.), colour, agency.
- **Stop**: A physical boarding/alighting point. Attributes: stop ID, name, latitude, longitude,
  served routes.
- **Shape**: The geographic path of a route. Attributes: ordered sequence of latitude/longitude
  points defining the polyline on the map.
- **Stop Time**: A scheduled event at a stop. Attributes: trip ID, arrival time, departure time,
  stop sequence number.
- **Trip**: A single timed journey along a route. Attributes: trip ID, route, service calendar
  (operating days), direction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can navigate from world view to a specific city and see its transit network
  fully rendered within 3 seconds of the viewport settling on that area.
- **SC-002**: Applying an agency or route filter updates the map display within 500 milliseconds
  of selection.
- **SC-003**: Stop information panels open and populate with schedule data within 1 second of
  clicking a stop marker.
- **SC-004**: The map remains responsive (no perceptible lag during pan/zoom) when a city with
  up to 5,000 stops and 200 routes is in the viewport.
- **SC-005**: 90% of first-time users can successfully navigate to a city, select an agency,
  and view stop information without consulting documentation.
- **SC-006**: The application correctly parses and displays data from at least 10 publicly
  available GTFS feeds covering different continents.

## Assumptions

- GTFS feeds are sourced from a curated set of publicly available feeds that ship with the
  application; users cannot upload their own feeds in this version (v1 scope boundary).
- The application targets modern desktop and tablet browsers; mobile-phone-optimised layout
  is out of scope for v1 but MUST NOT be actively broken.
- All GTFS data is pre-processed and indexed at build/load time; live feed fetching during
  user sessions is out of scope for v1.
- Service calendar logic (which trips run on which days) is applied relative to the client's
  local date, not a server clock.
- The initial curated dataset will cover at least the major metropolitan areas across all
  inhabited continents (minimum 20 cities at launch).
- Route type rendering (bus vs. tram vs. subway) uses distinct visual styles so users can
  differentiate transport modes at a glance.
- The application is a web-based product accessible via a browser URL; no native mobile app
  or desktop installer is required for v1.
