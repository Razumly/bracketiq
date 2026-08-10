# Build a population-weighted affiliate coverage inventory and gap queue

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must remain current while work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root. This plan extends the implemented worker described in `docs/affiliate-coverage-agent-execplan.md`. It does not replace the capture-recovery, mapping, approval, or publishing boundaries in that plan.

## Purpose / Big Picture

BracketIQ must find sports organizations and source websites across the United States. The first national scope is every incorporated city with a 2025 Census population at least 178,618, the population of Eugene, Oregon in the selected Census vintage. This initial numeric cutoff produces 150 cities; Eugene and Salem are evidence for the cutoff, not special inclusion rules. Future catalog versions can lower the population cutoff without changing the contract. The current system starts from the 50 largest cities and lets the Coverage Agent reassess whole market campaigns. It does not give the agent a structured view of what BracketIQ already has, which city, sport, and search profile is weak, which search strategy already ran, or whether another campaign produced any coverage improvement.

After this change, an operator can run one read-only command and see a 150-city inventory. The report ranks missing city, sport, and profile cells by population, evidence quality, and age. Portland and Seattle markets appear first. The remaining California, Oregon, and Washington markets appear next. National markets appear only after those cohorts have no eligible work. The agent receives the same ranked evidence through its claim command. It can create only a bounded, materially new campaign for selected gap cells.

The system will track coverage and search saturation as separate facts. A cell can remain a coverage gap while its search is saturated. Saturation stops repeated low-value campaigns, but it does not claim that BracketIQ has adequate coverage. A later review date or a new query strategy makes the cell eligible again.

This plan does not authorize a live migration, a provider request, campaign activation, process control, deployment, or a production database write. Each operational action requires separate approval after the read-only report and tests pass.

## Progress

- [x] (2026-08-09 21:59Z) Traced the current campaign templates, query generator, discovery result persistence, Coverage Agent queue, claim order, completion contract, Codex goal, supervisor loop, and focused tests.
- [x] (2026-08-09 21:59Z) Confirmed the initial numeric scope from Census Vintage 2025: cities with at least 178,618 residents. Eugene is the reference population at rank 150 and Salem is another in-scope row at rank 147. The initial snapshot has 150 cities, including 34 cities in California, Oregon, and Washington; these row names and counts are not future scope invariants.
- [x] (2026-08-09 21:59Z) Chose separate coverage and search states so no-yield saturation cannot become false coverage.
- [x] (2026-08-09 21:59Z) Chose a West Coast cohort boundary plus a population-weighted score. Cohort order takes precedence over the score.
- [x] (2026-08-09) Create and validate the checked-in 2025 city and market catalog; scope membership is numeric population threshold, not a named-city predicate.
- [x] (2026-08-09) Build the read-only inventory service and report command without changing queue behavior.
- [x] (2026-08-09) Add durable city, cell, assessment-cycle, and query-execution records through an additive migration.
- [x] (2026-08-09) Persist query-level results and controlled strategy keys for new discovery runs.
- [x] (2026-08-09) Replace FIFO market selection with the ranked gap queue while preserving lease safety and failed-capture recovery.
- [x] (2026-08-09) Add the `SATURATED_NO_YIELD` completion decision, recheck timing, and strategy-version reopening.
- [x] (2026-08-09) Update the Codex goal, repository skill, completion contract, operator documentation, and focused tests.
- [x] (2026-08-09) Validate the local dry-run workflow and prepare separate rollout gates. No deployment or enablement occurred under this ExecPlan.

## Surprises & Discoveries

- Observation: The current claim order cannot enforce a West Coast objective.
  Evidence: `claimNextAffiliateCoverageJob` in `src/server/affiliateImports/coverageAgentQueue.ts` sorts claimable jobs by `subjectType` and `createdAt`. The Codex prompt cannot change this database order.

- Observation: A campaign name is not a provider query.
  Evidence: `generateAffiliateSourceDiscoveryQueries` in `src/server/affiliateImports/sourceDiscoveryRules.ts` builds each provider query from target city, state, sport, profile terms, and the word `official`.

- Observation: The current run summary cannot prove cell-level marginal yield.
  Evidence: `processNextAffiliateSourceDiscoveryRun` stores the generated queries and aggregate run outcomes. It does not store returned, qualified, duplicate, intake, and new-policy-key totals for each individual query.

- Observation: A discovery result keeps only its latest query attribution.
  Evidence: `AffiliateSourceDiscoveryResults` is unique by campaign and URL key. A later observation updates `latestRunId`, `latestQuery`, `reasonDetails.queryProfile`, and `reasonDetails.queryTarget`. Historical cell attribution can be lost.

- Observation: Shared market campaigns reduce campaign rows, but they do not reduce the query matrix by themselves.
  Evidence: `campaignTargets` expands every `metadata.coveredCities` entry. The generator then creates sport and profile combinations for each target city.

- Observation: The current completion evidence uses free-form source-family text.
  Evidence: `affiliateCoverageCompletionSchema` accepts any nonempty source-family string. The server checks the count but cannot prove that two materially independent strategies ran.

- Observation: Existing discovery data can support a partial baseline, but it cannot support an exact historical backfill.
  Evidence: Run summaries prove that queries were generated. Current discovery results can show present policy keys and downstream links. They cannot allocate every historical aggregate yield to one city, sport, and profile. The first report must label such cells as partial evidence instead of inventing precision.

## Decision Log

- Decision: Use incorporated places whose population meets a versioned numeric threshold as the national boundary. The initial threshold is 178,618 from the 2025 Census Vintage 2025 table.
  Rationale: Eugene's population provides a reproducible initial cutoff, while the catalog remains extensible to a lower threshold. City names must not be used as boundary predicates.
  Date/Author: 2026-08-09 / Codex

- Decision: Check in a versioned city catalog and load it without network access at runtime.
  Rationale: Queue reconciliation, tests, and production operation must not depend on a live Census download. An explicit generator can refresh the catalog when a newer completed Census vintage is adopted.
  Date/Author: 2026-08-09 / Codex

- Decision: Use a stable Census place GEOID as the city identity and a separate application market key as the campaign grouping identity.
  Rationale: Names can collide or change. One market can contain several cities. City evidence must remain auditable when cities share a campaign.
  Date/Author: 2026-08-09 / Codex

- Decision: Preserve the existing 44 top-50 market groups. Extend Greater Los Angeles with Anaheim, Irvine, Santa Ana, Santa Clarita, Huntington Beach, and Glendale. Extend San Diego with Chula Vista. Extend San Francisco Bay with Fremont. Extend Sacramento with Elk Grove. Extend Portland with Vancouver, Washington. Extend Seattle with Tacoma. Group Riverside, San Bernardino, Fontana, Moreno Valley, and Ontario as Inland Empire. Keep Stockton, Spokane, Modesto, Oxnard, Salem, Santa Rosa, and Eugene as separate markets. Keep every other newly added national city as a separate version-one market unless an existing top-50 grouping already covers it. This produces 129 version-one markets.
  Rationale: This gives the active West Coast cohort useful grouping without introducing an unverified national metro crosswalk. A later catalog version can merge additional markets without changing city identity.
  Date/Author: 2026-08-09 / Codex

- Decision: Treat Portland-Vancouver and Seattle-Tacoma as `WEST_COAST_CORE`. Treat the other California, Oregon, and Washington cities as `WEST_COAST_EXPANSION`. Treat all other in-scope cities as `NATIONAL`.
  Rationale: The user asked for Portland and Seattle first, then the West Coast, then the national scope.
  Date/Author: 2026-08-09 / Codex

- Decision: Apply cohort order before numerical priority score.
  Rationale: A population score alone would place Los Angeles ahead of Portland and Seattle. The requested geographic focus must be a scheduler rule, not prompt text.
  Date/Author: 2026-08-09 / Codex

- Decision: Use population bands instead of raw population.
  Rationale: Raw population would let the largest cities dominate the queue. Bands preserve a useful advantage for large cities while keeping Eugene-sized cities material.
  Date/Author: 2026-08-09 / Codex

- Decision: Store current cell state and append one assessment row per completed cycle.
  Rationale: Current state makes queue reads fast. Append-only assessment rows preserve the evidence used for coverage and saturation decisions.
  Date/Author: 2026-08-09 / Codex

- Decision: Persist one query-execution row for every provider query after this feature is introduced.
  Rationale: The system needs query-level success, failure, direct-domain, duplicate, and intake counts to measure marginal yield and prove strategy novelty.
  Date/Author: 2026-08-09 / Codex

- Decision: Define independent source families as versioned search-strategy families, not provider names or free-form agent labels.
  Rationale: The same provider can execute operator, governing-directory, public-recreation, registration-platform, and facility-booking searches. These strategies examine different source ecosystems and can be validated by the server.
  Date/Author: 2026-08-09 / Codex

- Decision: Keep query text deterministic and disallow arbitrary agent-authored search text.
  Rationale: The agent should select a governed strategy. The server must retain query limits, URL safety, deduplication, provider selection, and a reproducible fingerprint.
  Date/Author: 2026-08-09 / Codex

- Decision: Represent coverage and search state with two fields.
  Rationale: `coverageStatus=GAP` and `searchStatus=SATURATED` accurately describes a weak cell where valid new campaigns stopped producing results. A single status would conflate those facts.
  Date/Author: 2026-08-09 / Codex

- Decision: Do not infer exact historical query yield during backfill.
  Rationale: Current rows do not preserve every prior query-to-result observation. The report must mark the historical evidence as partial and collect exact evidence from new runs.
  Date/Author: 2026-08-09 / Codex

## Outcomes & Retrospective

The implementation is complete through local validation. The catalog-only report loads 150 cities, 129 markets, 34 West Coast cities, and a 178,618 numeric population threshold. With the current 14 concrete sports and seven profiles, the theoretical inventory is 14,700 cells; the focused inventory fixture reports 14,700 cells and 3,332 Pacific Coast cells. The generator was rerun from the official 2025 workbook and Gazetteer into a temporary output, and its checksum matched the checked-in snapshot.

The focused coverage suite passed 10 suites and 71 tests. `npx prisma validate`, `npx prisma generate`, `npx tsc --noEmit`, the catalog generator at both the initial and lower thresholds, the catalog-only report, the lower-threshold runtime validator, Codex goal dry-run, and ESLint passed. Scoped `git diff --check` passed for the affiliate coverage implementation and documentation; the repository-wide check still reports generated Prisma whitespace and an unrelated pre-existing event-editor blank line. The additive migration remains undeployed; no production inventory, scheduler, provider run, or campaign activation occurred. The remaining rollout risk is operational approval and live-data verification, covered by the separate rollout gates below.

## Context and Orientation

The repository root is `/Users/elesesy/StudioProjects/mvp-site`.

`src/server/affiliateImports/sourceDiscoveryCampaignTemplates.ts` contains 44 templates that cover the 50 largest incorporated cities. Campaign metadata stores the anchor city, population, priority rank, and covered cities. `scripts/setup-affiliate-source-discovery-campaigns.ts` upserts these templates as paused campaigns.

`src/server/affiliateImports/sourceDiscoveryRules.ts` contains seven query profiles. A query profile is the kind of evidence being searched. The profile keys are `clubs-programs`, `tryouts-evaluations`, `events-registration`, `league-operators`, `tournament-operators`, `camps-clinics-open-play`, and `facilities-rentals`. With the current 14 concrete sports, 150 cities produce 14,700 city, sport, and profile cells. The broad directory query remains a search strategy. It is not an eighth coverage profile.

`src/server/affiliateImports/sourceDiscovery.ts` claims discovery runs, generates queries, calls the provider, scores results, stores deduplicated `AffiliateSourceDiscoveryResults`, and promotes eligible results into `AffiliateSourceIntakes`. The run stores aggregate counts and a JSON summary.

`src/server/affiliateImports/coverageAgentContracts.ts` validates campaign proposals and completion results. `src/server/affiliateImports/coverageAgentQueue.ts` reconciles persistent jobs, exports claim context, creates focused campaigns, stores manual browser evidence, and completes jobs. `src/server/affiliateImports/codexCoverageGoal.ts` builds the agent objective. `scripts/run-affiliate-coverage-loop.ts` holds a PostgreSQL advisory lock and launches only one Codex goal at a time.

A coverage cell is one city, one sport, and one query profile. A market is one campaign-planning group. A market can contain more than one city. A strategy is a deterministic query variant. A strategy family is a group of variants that searches the same kind of ecosystem. Marginal yield is the count of qualified direct policy keys that a completed cycle added to a cell and that were not known for that cell before the cycle started. A policy key is the repository's canonical domain or shared-tenant identity.

Coverage status and search status have different meanings. `UNASSESSED`, `GAP`, and `COVERED` are coverage statuses. `READY`, `SEARCHING`, `WAITING_FOR_PIPELINE`, `SATURATED`, and `STALE` are search statuses. A combined display can say `GAP / SATURATED`, but the database must not replace the gap with coverage.

## Data and Scoring Contract

Create `data/affiliate-coverage/us-incorporated-cities-2025.json`. The file must contain every row from the Census Bureau workbook whose July 1, 2025 estimate is at least the versioned numeric threshold. The initial threshold is 178,618, which yields the first 150 rows because the workbook is population-ranked. The workbook source is `https://www2.census.gov/programs-surveys/popest/tables/2020-2025/cities/totals/SUB-IP-EST2025-ANNRNK.xlsx`. The data worksheet is `SUB-IP-EST2025-ANNRNK`. Data starts at row 5. Column A is rank, column B is geographic area, and column I is the July 1, 2025 estimate. Lowering the threshold in a later catalog version must add qualifying rows by population rather than require a named city.

Each catalog entry must contain `placeGeoid`, `rank`, `censusName`, `city`, `state`, `stateCode`, `population`, `marketKey`, `marketName`, and `cohort`. Obtain `placeGeoid` from the official 2025 Census national places Gazetteer at `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip`. Join the ranked workbook geographic name before its final state separator to the Gazetteer `NAME` field and the workbook state to the Gazetteer `USPS` field. The Gazetteer file is pipe-delimited and its `GEOID` field is the stable seven-character place GEOID. Fail on zero matches or multiple matches. Do not derive a permanent identifier from rank or display name. Include top-level metadata with schema version, Census vintage, estimate date, threshold city, threshold population, ranked-workbook URL, Gazetteer URL, generated-at timestamp, and a content checksum. Calculate the content checksum from canonical source metadata and the ordered city array while excluding the checksum field itself.

The catalog validator must prove that every row's population meets the top-level numeric threshold, ranks are unique and contiguous from 1 through the catalog size, and place GEOIDs are unique. For the initial snapshot, Eugene is rank 150 with population 178,618 and Salem is rank 147 with population 181,779; California, Oregon, and Washington contribute 34 rows in total. Those values are snapshot evidence, not literal boundary requirements. Every city has one market and one cohort.

Use these population weights:

- Population 1,000,000 or more has weight `1.00`.
- Population from 500,000 through 999,999 has weight `0.85`.
- Population from 250,000 through 499,999 has weight `0.70`.
- Population from 178,618 through 249,999 has weight `0.55`.
- For a later lower threshold, extend the lowest population band with the same `0.55` weight or add an explicitly versioned band; do not hard-code a city name as the lower bound.
Round stored component weights and final scores to six decimal places. Do not use raw population in the score.

Use a gap severity of `1.00` when no qualified direct policy key is linked to an intake, approved source, or organization for the cell. Use `0.75` when only one qualified direct policy key exists or only one strategy family has completed. Use `0.50` when the evidence is present but stale or is only partially attributable. Use `0.00` when the cell meets the coverage contract.

Define profile weights in one exported registry. Use `1.00` for `league-operators` and `tournament-operators`; `0.90` for `clubs-programs` and `facilities-rentals`; `0.85` for `events-registration`; and `0.75` for `tryouts-evaluations` and `camps-clinics-open-play`.

Use a staleness weight of `1.00` when a cell has never been assessed or is due now. Increase it linearly to at most `1.50` when the cell is overdue by one full review interval. A future review date makes the cell ineligible and gives it no claim score.

Calculate the numerical score as:

    priorityScore = populationWeight * gapSeverity * profileWeight * stalenessWeight

Sort eligible work by cohort order first. Use `WEST_COAST_CORE`, then `WEST_COAST_EXPANSION`, then `NATIONAL`. Within one cohort, sort by `priorityScore` descending, Census rank ascending, market key ascending, city rank ascending, sport name ascending, and profile key ascending. This full tie order must be shared by the report and claim code.

## Coverage and Saturation Contract

A qualified direct policy key must come from a direct source result that meets the discovery score and safety rules. It must be linked to an intake, an approved affiliate source, or an organization. Intermediary pages, search pages, social-only pages, unsupported files, rejected results, and review-only directory results do not count as direct coverage.

Mark a cell `COVERED` only when at least one qualified direct policy key exists, the required query profile completed successfully in the minimum number of independent strategy families, no automatically promotable lead remains unresolved, and all capture failures that affect the cell have a terminal outcome. The minimum is three strategy families for cities with population at least 500,000. The minimum is two strategy families for all other in-scope cities. League and tournament cells must retain evidence of a persistent operator identity. A competition name without an independent operator does not count.

Set `searchStatus=WAITING_FOR_PIPELINE` when an automatically promotable direct result for the cell has no intake, source, or organization link. Do not run another campaign for that cell until reconciliation observes zero such results.

Accept the completion decision `SATURATED_NO_YIELD` only when all of these conditions are true:

- The last two completed assessment cycles each added zero qualified direct policy keys.
- The cycles used materially different strategy keys.
- The cell has the required number of successful strategy families for its population band.
- Every cited provider query reached a successful or useful partial terminal state.
- No unresolved automatically promotable lead remains.
- No failed capture that affects the evidence remains nonterminal.
- No required, untested strategy family remains for the profile.
- The stored query-strategy version matches the active version.

`SATURATED_NO_YIELD` sets `searchStatus=SATURATED`. It preserves `coverageStatus=GAP` when the coverage contract is not met. It may coexist with `coverageStatus=COVERED` when the cell has valid coverage and later campaigns add nothing.

Set the next review date to 30 days for cities with at least 1,000,000 residents, 45 days for 500,000 through 999,999, 60 days for 250,000 through 499,999, and 90 days for the initial 178,618 through 249,999 band. Reconciliation changes a due saturated cell to `searchStatus=STALE`. A higher query-strategy version also changes it to `STALE` immediately. It must not erase the prior assessment history. A lower-threshold catalog version must define review treatment for newly included populations.

## Plan of Work

### Milestone 1: Create the versioned city and market catalog

Add `data/affiliate-coverage/us-incorporated-cities-2025.json`, `scripts/generate-affiliate-coverage-city-catalog.ts`, and `src/server/affiliateImports/coverageCityCatalog.ts`. The generator is an operator tool. It downloads the official ranked workbook and place-code source into a temporary directory, validates the published values, writes a deterministic JSON snapshot, and prints its checksum. Runtime code loads only the checked-in JSON.

Keep the existing 44 top-50 groupings. Expand the West Coast groupings named in the Decision Log. New catalog cities that have no existing grouping remain one-city markets in version one. The loader must reject an invalid checksum, duplicate rank, duplicate GEOID, missing market, missing cohort, or any population below the catalog's numeric threshold.

Refactor `src/server/affiliateImports/sourceDiscoveryCampaignTemplates.ts` so templates are derived from the validated catalog instead of a separate hand-maintained top-50 population list. Keep `US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES` as a compatibility export. Add a test that every catalog city occurs in exactly one template and that the first 50 rows preserve the current template coverage.

At the end of this milestone, the catalog-only command must print the current snapshot's 150 cities, 34 Pacific Coast cities, and 129 version-one markets, with no database changes. These counts are reported snapshot facts, not invariants that block a later lower-threshold catalog.

### Milestone 2: Build the read-only inventory before queue changes

Add `src/server/affiliateImports/coverageProfiles.ts`, `src/server/affiliateImports/coverageGapScoring.ts`, and `src/server/affiliateImports/coverageInventory.ts`. Move the seven query-profile definitions out of the private constant in `sourceDiscoveryRules.ts` into the shared profile registry. Preserve current generated query text for the legacy strategy so existing tests do not change unexpectedly.

The inventory service must load the city catalog, current concrete sports, campaigns, runs, discovery results, intakes, approved affiliate sources, organizations, mapping jobs, and failed intake runs. Attribute evidence from new query-execution rows when they exist. For older rows, use run-summary target, profile, and sport fields only where attribution is direct. Label all other historical evidence `PARTIAL_HISTORY`. Do not distribute an aggregate run count across several cells.

Add `scripts/report-affiliate-coverage-inventory.ts` and package command `affiliate:coverage:inventory`. Support `--cohort=west-coast-core|west-coast-expansion|national|all`, `--market=<market-key>`, `--city=<place-geoid>`, `--status=gap|covered|saturated|waiting|stale`, `--limit=<1-500>`, and `--format=json|summary`. The command is read-only. The JSON result must contain catalog metadata, city count, market count, sport count, profile count, theoretical cell count, state counts, coverage counts, search-state counts, partial-history count, and ranked cell rows.

Do not create a job, campaign, discovery run, intake run, or source record in this milestone. The first review gate is the read-only West Coast report. An operator must be able to compare Portland, Vancouver, Seattle, Tacoma, Salem, and Eugene evidence before approving persistence or scheduler changes.

### Milestone 3: Persist exact query and cell evidence

Add an additive Prisma migration and update `prisma/schema.prisma` with four models.

`AffiliateCoverageCities` stores the checked-in catalog in the database. It must contain `id`, timestamps, Census vintage, place GEOID, rank, display city, Census name, state, state code, population, market key, market name, cohort, population weight, and active flag. Make place GEOID unique. Index active cohort and rank, and index market key.

`AffiliateCoverageCells` stores current state. It must contain `id`, timestamps, city ID, market key, cohort, cohort priority, sport ID, profile key, coverage status, search status, population weight, gap severity, profile weight, staleness weight, priority score, direct policy-key count, approved-source count, strategy-family count, unresolved-lead count, consecutive no-yield cycles, query-strategy version, evidence-quality label, last-assessed time, and next-review time. Keep JSON evidence for compact counts and identifiers that do not need dedicated columns. Make city, sport, and profile unique. Index cohort priority with search status and priority score, market with search status, coverage with search status, and next-review time.

`AffiliateCoverageCellAssessments` is append-only history. It must contain `id`, timestamps, cell ID, cycle key, decision, campaign IDs, strategy keys, strategy-family keys, new qualified policy-key count, unresolved-lead count, successful-query count, failed-query count, query-strategy version, and JSON evidence. Make cell and cycle key unique.

`AffiliateSourceDiscoveryQueryExecutions` stores exact query evidence. It must contain `id`, timestamps, run ID, campaign ID, query key, city GEOID, target city and state, sport ID and name, profile key, strategy key, strategy-family key, query text, provider, status, returned-result count, qualified-direct count, new-qualified-policy-key count, intake-created count, duplicate count, rejected count, qualified policy keys, new qualified policy keys, error code, and compact JSON metadata. Make run ID and query key unique. Index cell lookup fields, run ID, campaign ID, and strategy-family key.

Use raw string IDs in the same style as the existing affiliate models. Do not add cascading deletes. The catalog-sync function must upsert every city in the versioned catalog and the current city, sport, and profile cells. It must archive removed catalog cities instead of deleting history. A second sync with the same catalog must produce zero changes.

Update `processNextAffiliateSourceDiscoveryRun` to collect counts inside each query loop and persist one query-execution row after the query reaches a terminal state. Calculate `new qualified` against policy keys already attributed to the cell before the query starts. A failed provider call must create a failed query-execution row with zero yield and a normalized error code. It must not count as a valid no-yield cycle.

Existing runs remain immutable. Backfill only facts that are directly present in stored summaries. Mark backfilled executions and cells as partial history. Do not manufacture per-query yield from run aggregates.

### Milestone 4: Add governed strategy variants and targeted campaigns

Add `src/server/affiliateImports/coverageQueryStrategies.ts`. Define versioned strategy keys and strategy families. The first registry must include operator-focused web search, governing-association directory search, public recreation search, registration-platform search, and facility-booking search. Define which strategies each of the seven profiles may use. Each strategy must provide deterministic terms and must retain the current provider and URL-safety boundaries.

Extend `AffiliateSourceDiscoveryQuery` with `cityGeoid`, `profileKey`, `strategyKey`, and `strategyFamilyKey`. Preserve the legacy query path for existing template campaigns. A focused campaign created for coverage gaps must include `metadata.coverageTargetCells` and `metadata.coverageStrategyKeys`. The query generator must produce only those selected city, sport, profile, and strategy combinations. It must not expand every city and sport in the parent market.

Extend `affiliateCoverageCampaignProposalSchema` with one through twenty `coverageCellIds` and one through three governed `strategyKeys`. The campaign-create command must verify that every cell belongs to the claimed market, is eligible, uses an allowed strategy for its profile, and is not waiting or saturated before its review date. Include sorted cell IDs and strategy keys in the fingerprint. An identical proposal must reuse the campaign. A different name with the same cells and strategies must also reuse it.

Add a read-only query-preview command. It must print campaign metadata separately from every exact provider query. It must not queue or run the campaign. The agent uses this preview to prove that a proposed refinement is materially different from prior work.

### Milestone 5: Replace FIFO assessment work with the ranked gap queue

Keep the existing lease and advisory-lock boundaries. Do not create one agent job for every theoretical cell. Reconciliation must update cell state, group eligible cells by market, and create or refresh one `MARKET_COVERAGE` job per market and active strategy version. The job context must contain the highest-ranked eligible cells for that market, capped at fifty, plus recent assessment cycles, tested strategy keys, exact query-yield summaries, pipeline blockers, and neighboring focused campaigns.

Add explicit job priority fields to `AffiliateCoverageAgentJobs`: `cohortPriority`, `priorityScore`, `priorityRank`, and `isBlockingCoverage`. Use an additive migration. Reconciliation updates these fields from the highest eligible cell in the market. Failed-capture jobs must inherit city and cohort priority from their discovery or intake provenance when this can be proved. Unknown provenance receives the national cohort and the lowest score. A failed capture that blocks the highest-ranked cell in a market sets `isBlockingCoverage=true` and takes priority within that market.

Change `claimNextAffiliateCoverageJob` to resume the worker's active lease first, as it does now. For new work, sort by cohort priority ascending, `isBlockingCoverage` descending, priority score descending, priority rank ascending, subject type, and creation time. This order prevents a national failed-capture backlog from blocking Portland and Seattle. When a completed market job gains an eligible cell again, reconciliation must return the same versioned job to `QUEUED` unless it has an active lease. It must retain prior decisions in cell-assessment history.

Update queue summaries to include counts by cohort, coverage status, search status, waiting reason, and saturated review date. The supervisor must launch a goal only when an eligible claim exists. `claimableJobs=0` must mean that no current cohort cell or blocking capture is eligible, not that all future saturated rechecks are complete forever.

### Milestone 6: Enforce saturation and update the agent goal

Add `SATURATED_NO_YIELD` to `AFFILIATE_COVERAGE_DECISIONS` and the skill completion contract. Extend coverage evidence with cell IDs, cycle key, strategy keys, strategy-family keys, successful-query IDs, failed-query IDs, new qualified policy-key count, unresolved-lead count, and proposed next-review date. The server, not the agent, recalculates all decisive counts from persisted query executions.

`completeAffiliateCoverageJob` must reject saturation when fewer than two zero-yield cycles exist, the cycles repeat the same strategy, a required strategy family is missing, a cited query failed, an unresolved lead exists, a capture failure is active, or the strategy version is stale. A valid saturation completion appends assessment rows, updates the cells, releases the lease, and leaves coverage gaps visible.

Update `buildCodexAffiliateCoverageObjective` so the goal drains only the eligible ranked queue. Tell the agent to inspect inventory cells, query previews, prior strategy families, marginal yield, and pipeline state. Remove language that implies every market must end only as `COVERED` or `WAITING_FOR_PIPELINE`. Add `SATURATED_NO_YIELD` and its exact meaning.

Update `.agents/skills/plan-affiliate-discovery-campaigns/SKILL.md`, its `references/completion-contract.md`, `docs/affiliate-source-discovery-campaigns.md`, and `docs/affiliate-coverage-agent-execplan.md`. Keep the current safety boundary. The agent may assess gaps, select governed strategies, create bounded campaigns, and record saturation. It may not invent query text, write scraper mappings, approve policy, publish data, enable automation, deploy, restart, or change unrelated live state.

### Milestone 7: Validate locally and prepare a separate rollout

Run catalog, scoring, inventory, query-generation, discovery persistence, queue, completion, goal, and loop tests. Run the inventory report against local fixtures and, if a read-only database is available, against the current local database. Do not use `--live` during implementation validation unless the user gives separate current authorization.

Prepare a rollout section in this living plan after local validation. The rollout must separate migration deployment, catalog sync, read-only production inventory, scheduler change, and campaign activation into different approval points. The first production action after migration must be a read-only report. Do not create, activate, run, pause, or archive a campaign as part of report verification.

#### Separate rollout gates

1. **Migration deployment:** review and deploy the additive Prisma migration. Do not enable the scheduler or create campaigns in this gate.
2. **Catalog sync:** run the catalog sync for the checked-in snapshot and verify idempotence. A lower-threshold catalog requires a new reviewed snapshot and its own checksum.
3. **Read-only production inventory:** run the inventory report for `west-coast-core`, `west-coast-expansion`, and `national`; verify city, market, sport, profile, coverage, search-state, and partial-history counts. This is the first production action after migration.
4. **Scheduler change:** only after the report is accepted, enable the coverage loop with one advisory-lock owner and observe claim, lease, reconcile, and completion metrics.
5. **Campaign activation:** only after queue behavior is accepted, activate paused campaigns in a separately approved batch. Campaign activation is not part of report verification.

No migration deployment, catalog sync, scheduler enablement, provider run, or campaign activation occurred during this implementation validation.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

Before edits, inspect and preserve the dirty worktree:

    git status --short
    git diff -- src/server/affiliateImports prisma scripts docs package.json

Generate and validate the catalog without a database write:

    npm run affiliate:coverage:catalog:generate -- --output=data/affiliate-coverage/us-incorporated-cities-2025.json
    npm run affiliate:coverage:inventory -- --catalog-only --format=summary

Expected catalog summary:

    censusVintage: 2025
    thresholdCity: Eugene, Oregon
    thresholdPopulation: 178618
    cityCount: 150
    westCoastCityCount: 34
    marketCount: 129
    californiaCityCount: 27
    oregonCityCount: 3
    washingtonCityCount: 4

To preview a later lower population cutoff without changing the checked-in snapshot, generate to a temporary file:

    npm run affiliate:coverage:catalog:generate -- --output /tmp/affiliate-coverage-city-catalog-lower.json --threshold-population=100000

The generator filters by `population >= thresholdPopulation`; it does not look for Eugene, Salem, or any other named city. A lower-threshold snapshot requires review before replacing the checked-in catalog and syncing the database.

Run the first read-only inventory gate:

    npm run affiliate:coverage:inventory -- --cohort=west-coast-core --format=json --limit=50
    npm run affiliate:coverage:inventory -- --cohort=west-coast-expansion --format=summary --limit=100

The report must show Portland-Vancouver and Seattle-Tacoma before any other market. It must print exact campaign names separately from exact generated query previews. It must report partial historical evidence instead of converting run aggregates into cell yield.

After the additive migration exists, validate and generate Prisma code:

    npx prisma validate
    npx prisma generate

Run focused tests in one process:

    npx jest --runInBand \
      src/server/affiliateImports/__tests__/coverageCityCatalog.test.ts \
      src/server/affiliateImports/__tests__/coverageGapScoring.test.ts \
      src/server/affiliateImports/__tests__/coverageInventory.test.ts \
      src/server/affiliateImports/__tests__/coverageQueryStrategies.test.ts \
      src/server/affiliateImports/__tests__/sourceDiscoveryRules.test.ts \
      src/server/affiliateImports/__tests__/sourceDiscovery.test.ts \
      src/server/affiliateImports/__tests__/sourceDiscoveryCampaignTemplates.test.ts \
      src/server/affiliateImports/__tests__/coverageAgentQueue.test.ts \
      src/server/affiliateImports/__tests__/coverageAgentLoop.test.ts \
      src/server/affiliateImports/__tests__/codexCoverageGoal.test.ts

Run static validation:

    npx eslint \
      src/server/affiliateImports/coverageCityCatalog.ts \
      src/server/affiliateImports/coverageProfiles.ts \
      src/server/affiliateImports/coverageGapScoring.ts \
      src/server/affiliateImports/coverageInventory.ts \
      src/server/affiliateImports/coverageQueryStrategies.ts \
      src/server/affiliateImports/sourceDiscoveryCampaignTemplates.ts \
      src/server/affiliateImports/sourceDiscoveryRules.ts \
      src/server/affiliateImports/sourceDiscovery.ts \
      src/server/affiliateImports/coverageAgentContracts.ts \
      src/server/affiliateImports/coverageAgentQueue.ts \
      src/server/affiliateImports/codexCoverageGoal.ts \
      scripts/generate-affiliate-coverage-city-catalog.ts \
      scripts/report-affiliate-coverage-inventory.ts
    npx tsc --noEmit
    npm run affiliate:coverage:codex-goal:dry-run
    git diff --check

Do not run migration deployment, the coverage loop, a discovery provider run, or a live command as part of these steps.

## Validation and Acceptance

The catalog tests must prove the initial 150-city snapshot, Eugene and Salem values, the initial 34-city Pacific Coast subset, unique place GEOIDs, stable market membership, compatibility with the original top-50 coverage, and rejection of a city below the configured numeric threshold. The tests must not require Eugene or Salem to remain the boundary rows when a later catalog lowers the threshold.

The scoring tests must prove that cohort order outranks population. Portland and Seattle core work must sort before Los Angeles expansion work. Within one cohort, a larger equally weak city must sort before a smaller city. A direct raw-population ratio must not appear in the calculation.

The inventory tests must use a 14-sport fixture and produce 14,700 cells. They must produce 3,332 cells for California, Oregon, and Washington. They must distinguish approved direct evidence, unresolved automatic leads, intermediary results, rejected results, failed queries, terminal capture exclusions, and partial historical attribution.

The query-execution tests must prove one durable row per generated query, correct city, sport, profile, strategy, provider status, direct-domain counts, and exact new-policy-key counts. A provider error must not become a successful zero-yield observation.

The strategy tests must prove that the agent can select only registered strategies. They must reject arbitrary query text, disallowed profile and strategy pairs, a repeated strategy fingerprint, a foreign market cell, a waiting cell, and a saturated cell whose review date has not arrived.

The campaign test must prove that one targeted campaign searches only its listed cells. It must not expand all cities and sports from the parent template. Query preview and execution must return the same ordered query list.

The queue tests must prove active-lease resumption, conditional claims, West Coast core priority, West Coast expansion priority, national fallback, blocking-capture priority within a market, and deterministic tie ordering. Two concurrent workers must still receive different jobs.

The completion tests must prove that `SATURATED_NO_YIELD` preserves a gap, requires two materially different zero-yield cycles, rejects failed queries and unresolved pipeline work, assigns the correct review interval, and reopens when due or when the strategy version increases. They must also prove that existing `COVERED`, `WAITING_FOR_PIPELINE`, failed-capture recovery, retry, exclusion, and human-review paths still work.

The goal dry run must name the inventory and query-preview commands, explain `GAP / SATURATED`, preserve all safety boundaries, and stop only when the current eligible queue and active leases are empty.

Acceptance is complete when the read-only local report ranks Portland-Vancouver and Seattle-Tacoma first, the focused tests pass, Prisma validation passes, TypeScript passes, and no live state or provider call changed.

## Idempotence and Recovery

Catalog generation must be deterministic for the same source files. Catalog sync must use upserts and archive removed rows. It must not delete a city, cell, query execution, or assessment history.

Cell reconciliation and score calculation must be repeatable. Running reconciliation twice without new evidence must not add an assessment cycle, increase no-yield counters, move a review date, or create another market job.

Query executions use the run and query key as the unique boundary. A retried persistence operation must update or reuse the same row. It must not count the same policy key as new twice.

Campaign fingerprints include parent market, sorted cell IDs, sorted strategy keys, and query-strategy version. Retrying the same proposal must not create a second campaign or a second active run.

All migrations are additive. If application code rolls back, leave the new tables and optional job-priority columns in place. Do not drop evidence as part of rollback. Disable the new scheduler path through code configuration only after separate authorization. Preserve the original FIFO logic until the ranked inventory path is fully tested, then remove the fallback in a later reviewed change.

If the Census download changes or a place-code join is ambiguous, stop catalog generation and print the unmatched records. Do not guess GEOIDs. If exact historical attribution is unavailable, keep `PARTIAL_HISTORY`. Do not convert uncertainty into zero yield.

## Artifacts and Notes

The source-of-record population page is `https://www.census.gov/data/datasets/time-series/demo/popest/2020s-total-cities-and-towns.html`. The ranked workbook is `https://www2.census.gov/programs-surveys/popest/tables/2020-2025/cities/totals/SUB-IP-EST2025-ANNRNK.xlsx`.

The initial 2025 snapshot evidence is:

    Salem city, Oregon: rank 147, population 181779
    Eugene city, Oregon: rank 150, population 178618
    Initial threshold population: 178618
    Initial in-scope incorporated cities: 150
    Initial California, Oregon, and Washington cities: 34

These city names document the source snapshot. Scope membership is determined only by `population >= thresholdPopulation`, so later versions can lower the threshold without adding named-city exceptions.

The repository was already dirty when this plan was created. Unrelated event-editor changes exist under `src/app/events/[id]/schedule`, `src/app/api/events`, `src/contracts`, and `src/server/events`, with an unrelated plan at `plans/event-editor-architecture-hardening-execplan.md`. Preserve those changes. Limit this implementation to the affiliate coverage files named in this plan and new files created for this feature.

## Interfaces and Dependencies

`src/server/affiliateImports/coverageCityCatalog.ts` must export interfaces equivalent to:

    type AffiliateCoverageCohort =
      | 'WEST_COAST_CORE'
      | 'WEST_COAST_EXPANSION'
      | 'NATIONAL';

    type AffiliateCoverageCity = {
      placeGeoid: string;
      rank: number;
      city: string;
      state: string;
      stateCode: string;
      population: number;
      marketKey: string;
      marketName: string;
      cohort: AffiliateCoverageCohort;
      populationWeight: number;
    };

    loadAffiliateCoverageCityCatalog(): AffiliateCoverageCityCatalog;
    validateAffiliateCoverageCityCatalog(input: unknown): AffiliateCoverageCityCatalog;

`src/server/affiliateImports/coverageGapScoring.ts` must export interfaces equivalent to:

    calculateAffiliateCoverageGapSeverity(evidence): number;
    calculateAffiliateCoveragePriorityScore(components): number;
    compareAffiliateCoverageWork(left, right): number;
    reviewIntervalDaysForPopulation(population: number): number;
    requiredStrategyFamilyCountForPopulation(population: number): number;

`src/server/affiliateImports/coverageInventory.ts` must export interfaces equivalent to:

    buildAffiliateCoverageInventory(filters, dependencies): Promise<AffiliateCoverageInventory>;
    reconcileAffiliateCoverageCells(options, dependencies): Promise<CoverageCellReconcileSummary>;
    getAffiliateCoverageMarketContext(marketKey, options): Promise<AffiliateCoverageMarketContext>;

`src/server/affiliateImports/coverageQueryStrategies.ts` must export a version, a validated registry, and deterministic rendering functions equivalent to:

    AFFILIATE_COVERAGE_QUERY_STRATEGY_VERSION: number;
    AFFILIATE_COVERAGE_QUERY_STRATEGIES: readonly AffiliateCoverageQueryStrategy[];
    allowedStrategiesForProfile(profileKey: string): readonly AffiliateCoverageQueryStrategy[];
    renderAffiliateCoverageQuery(target, strategy): AffiliateSourceDiscoveryQuery;

`coverageAgentContracts.ts` must add cell IDs and strategy keys to campaign proposals. It must add `SATURATED_NO_YIELD` and server-verifiable cycle evidence to completion results.

`coverageAgentQueue.ts` must continue to export its current reconcile, summary, claim, campaign-create, manual-evidence, and completion functions. It may call the inventory and scoring modules, but it must not duplicate their scoring or sorting rules.

Use existing Prisma, Zod, `createId`, discovery provider, URL safety, policy-key, intake, artifact, lease, and campaign-run code. Do not add a second queue service, provider client, browser framework, or runtime database. The catalog generator may use a development-only XLSX parser. Runtime and production code must not need that parser or network access.

Revision note: Created 2026-08-09 to turn the agreed population-threshold, 150-city initial snapshot, West Coast-first coverage design into an executable implementation plan. The plan keeps no-yield saturation separate from coverage and requires a read-only inventory gate before queue or campaign behavior changes. Updated 2026-08-09 to make the threshold numeric and versioned rather than tied to literal Eugene or Salem rows.
