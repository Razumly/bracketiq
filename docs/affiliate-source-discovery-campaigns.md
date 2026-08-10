# Affiliate Source Discovery Campaign Rollout

The source of record is the Census Bureau's [City and Town Population Totals: 2020-2025](https://www.census.gov/data/datasets/time-series/demo/popest/2020s-total-cities-and-towns.html). The checked-in initial catalog includes every incorporated city meeting its numeric `thresholdPopulation` of 178,618; the setup command derives 129 version-one market campaigns from it and keeps them `PAUSED`. The threshold is population-based, not a literal Eugene or Salem inclusion rule, and later catalog versions may lower it.

The catalog generator filters workbook rows by the configured population threshold, joins stable place GEOIDs from the national places Gazetteer, and writes deterministic JSON. Runtime code does not download Census data. Eugene and Salem are current snapshot evidence only.

```bash
npm run affiliate:discovery:setup
```

One campaign may cover multiple cities when they belong to the explicit catalog market grouping. The campaign keeps every covered city, stable place GEOID in the catalog, and Census rank in metadata so coverage remains auditable. `US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES` remains a top-50 compatibility export; `AFFILIATE_COVERAGE_CAMPAIGN_TEMPLATES` is the complete registry.
## Coverage inventory and ranked queue

Run the read-only inventory before enabling coverage work:

```bash
npm run affiliate:coverage:inventory -- --cohort=west-coast-core --format=json --limit=50
npm run affiliate:coverage:query-preview -- --campaign=<campaign-id>
```

The inventory evaluates every city, concrete sport, and one of seven profiles. It reports `coverageStatus` separately from `searchStatus`: a cell can remain `GAP / SATURATED` when governed strategies produced no new qualified direct policy keys. Population-weighted priority is ordered by `WEST_COAST_CORE`, `WEST_COAST_EXPANSION`, then `NATIONAL`; the queue uses the same order and preserves lease safety.

Focused proposals select one through twenty eligible cell IDs and one through three governed strategy keys. The server materializes `coverageTargetCells` and deterministic strategy keys; agents cannot submit arbitrary provider query text. Query-level execution rows retain returned, qualified, linked, duplicate, intake, rejection, failure, and new-policy-key counts.

Use `SATURATED_NO_YIELD` only after two completed zero-yield cycles with different governed strategy families, successful terminal query evidence, no unresolved pipeline lead or active capture failure, and a current strategy version. Saturation sets a future review date without changing a coverage gap into coverage.

## Location-First Search Order

National discovery completes one metropolitan area before advancing to the next priority-ranked location. Each campaign includes every canonical sport except the generic `Other` fallback. Within a location, queries rotate across all selected sports before advancing to the next source-type template. `Grass Soccer` searches use the public-facing phrase `outdoor soccer`.

Each complete query cycle includes one broad regional sports directory search. The remaining queries advance a persisted cursor through the location's complete sport/type matrix. Successful partial cycles become immediately due again; a completed cycle returns its cursor to zero and resumes on the normal campaign cadence, allowing the next city to start. Campaign setup records the query-strategy version and resets the cursor once when the strategy changes; rerunning the same setup version does not reset progress or results.

The matrix uses seven searches per sport:

1. Clubs, academies, and competitive programs.
2. Tryouts and evaluations.
3. General events and registration.
4. League operators, leagues, associations, and registration.
5. Tournament operators, cups, championships, and competition series.
6. Camps, clinics, open play, and pickup.
7. Fields, courts, facilities, rentals, and reservations.

With 14 concrete sports, one city requires 98 sport-profile searches plus one broad directory search. Ten searches fit in each default run, so a complete city uses ten bounded runs and 99 provider search requests. League and tournament operators no longer share one query with general events.

| Priority | Campaign | Search region | Top-50 cities covered |
| ---: | --- | --- | --- |
| 1 | New York Metro Sports Sources | New York metropolitan area | New York (1) |
| 2 | Los Angeles Metro Sports Sources | Greater Los Angeles | Los Angeles (2), Long Beach (44) |
| 3 | Chicago Metro Sports Sources | Chicago metropolitan area | Chicago (3) |
| 4 | Houston Metro Sports Sources | Houston metropolitan area | Houston (4) |
| 5 | Phoenix Metro Sports Sources | Phoenix metropolitan area | Phoenix (5), Mesa (38) |
| 6 | Philadelphia Metro Sports Sources | Philadelphia metropolitan area | Philadelphia (6) |
| 7 | San Antonio Metro Sports Sources | San Antonio metropolitan area | San Antonio (7) |
| 8 | San Diego Metro Sports Sources | San Diego metropolitan area | San Diego (8) |
| 9 | Dallas-Fort Worth Metro Sports Sources | Dallas-Fort Worth metropolitan area | Dallas (9), Fort Worth (10) |
| 11 | Jacksonville Metro Sports Sources | Jacksonville metropolitan area | Jacksonville (11) |
| 12 | Austin Metro Sports Sources | Austin metropolitan area | Austin (12) |
| 13 | San Francisco Bay Area Sports Sources | San Francisco Bay Area | San Jose (13), San Francisco (17), Oakland (45) |
| 14 | Charlotte Metro Sports Sources | Charlotte metropolitan area | Charlotte (14) |
| 15 | Columbus Metro Sports Sources | Columbus metropolitan area | Columbus (15) |
| 16 | Indianapolis Metro Sports Sources | Indianapolis metropolitan area | Indianapolis (16) |
| 18 | Seattle Metro Sports Sources | Seattle metropolitan area | Seattle (18) |
| 19 | Denver Metro Sports Sources | Denver metropolitan area | Denver (19), Aurora (50) |
| 20 | Nashville Metro Sports Sources | Nashville metropolitan area | Nashville (20) |
| 21 | Oklahoma City Metro Sports Sources | Oklahoma City metropolitan area | Oklahoma City (21) |
| 22 | Washington DC Metro Sports Sources | Washington metropolitan area | Washington (22) |
| 23 | El Paso Metro Sports Sources | El Paso metropolitan area | El Paso (23) |
| 24 | Las Vegas Metro Sports Sources | Las Vegas metropolitan area | Las Vegas (24) |
| 25 | Boston Metro Sports Sources | Boston metropolitan area | Boston (25) |
| 26 | Detroit Metro Sports Sources | Detroit metropolitan area | Detroit (26) |
| 27 | Louisville Metro Sports Sources | Louisville metropolitan area | Louisville (27) |
| 28 | Portland Metro Sports Sources | Portland metropolitan area | Portland (28) |
| 29 | Memphis Metro Sports Sources | Memphis metropolitan area | Memphis (29) |
| 30 | Baltimore Metro Sports Sources | Baltimore metropolitan area | Baltimore (30) |
| 31 | Milwaukee Metro Sports Sources | Milwaukee metropolitan area | Milwaukee (31) |
| 32 | Albuquerque Metro Sports Sources | Albuquerque metropolitan area | Albuquerque (32) |
| 33 | Fresno Metro Sports Sources | Fresno metropolitan area | Fresno (33) |
| 34 | Tucson Metro Sports Sources | Tucson metropolitan area | Tucson (34) |
| 35 | Sacramento Metro Sports Sources | Sacramento metropolitan area | Sacramento (35) |
| 36 | Atlanta Metro Sports Sources | Atlanta metropolitan area | Atlanta (36) |
| 37 | Kansas City Metro Sports Sources | Kansas City metropolitan area | Kansas City (37) |
| 39 | Raleigh Metro Sports Sources | Raleigh metropolitan area | Raleigh (39) |
| 40 | Colorado Springs Metro Sports Sources | Colorado Springs metropolitan area | Colorado Springs (40) |
| 41 | Miami Metro Sports Sources | Miami metropolitan area | Miami (41) |
| 42 | Omaha Metro Sports Sources | Omaha metropolitan area | Omaha (42) |
| 43 | Hampton Roads Metro Sports Sources | Hampton Roads metropolitan area | Virginia Beach (43) |
| 46 | Minneapolis-St. Paul Metro Sports Sources | Minneapolis-St. Paul metropolitan area | Minneapolis (46) |
| 47 | Bakersfield Metro Sports Sources | Bakersfield metropolitan area | Bakersfield (47) |
| 48 | Tulsa Metro Sports Sources | Tulsa metropolitan area | Tulsa (48) |
| 49 | Tampa Metro Sports Sources | Tampa metropolitan area | Tampa (49) |

## Rollout Rules

1. Keep every newly seeded campaign paused.
2. Enable campaigns in priority order after reviewing query and result limits.
3. Start each city with one bounded manual run before enabling its cadence.
4. Review unknown-domain policies before intake capture.
5. Do not activate the next market merely because a prior market produced results; first clear its policy-review and mapping queues.
6. Revisit rankings when the Census Bureau publishes a newer completed vintage.

## Mapping Queue Terms

A mapping job is the handoff from captured source evidence to the worker that writes a source-specific mapping and tests. Claiming is atomic: the database changes one eligible job from `QUEUED` to `CLAIMED` in the same guarded operation that selects it, so two workers cannot receive the same job.

The claim has a lease with a worker ID and expiration time. The lease is temporary ownership, not permanent completion. A healthy worker finishes or releases the job. If it crashes or disappears, another worker may reclaim the job only after the lease expires. This prevents duplicate concurrent mapping work without leaving a source permanently stuck after a worker failure.

## Coverage Agent Terms

The Coverage Agent owns market assessment and failed campaign intake recovery. It claims one `AffiliateCoverageAgentJobs` row at a time. A market job may create active focused campaigns through the validated campaign command. A failed-capture job may attach one durable `MANUAL_BROWSER` evidence run when a public page works outside the provider capture. It does not map source code, approve packages, publish organizations, or bypass explicit access restrictions.

Coverage is not a raw organization count. A market is covered only when relevant query profiles completed, at least two independent source families were checked, no discovered lead remains unresolved, recent new-domain yield is recorded, and failed capture jobs have terminal outcomes. The repo-backed operating contract is `.agents/skills/plan-affiliate-discovery-campaigns/SKILL.md`.
