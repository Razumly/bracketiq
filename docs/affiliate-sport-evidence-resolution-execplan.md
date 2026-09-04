# Make affiliate sport mappings evidence-backed and catalog-current

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must remain current while work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root. It extends the implemented mapping, approval, and sport-catalog work described in the repository paths named below; this document contains the current authoritative cutover and does not rely on memory of those plans.

## Purpose / Big Picture

After this change, an affiliate source that explicitly describes outdoor soccer, futsal, indoor volleyball, beach volleyball, or another supported surface can reach review with the exact current `Sports.name` stored in PostgreSQL. A generic label such as only “Soccer” or only “Volleyball” cannot be guessed into a surface; it becomes one evidence-backed human-review item. Unsupported and blacklisted activities remain recorded with source evidence and cannot create executable mappings.

An administrator can see the source wording, stored-artifact citations, catalog version, mapper conclusion, and any prior decision in the existing affiliate mapping-review panel. The administrator can choose a governed catalog sport for an unresolved label, refresh a stale catalog claim, or confirm that a blacklisted source stays excluded. The historical repair command first produces a deterministic no-write preview, then requeues only the reviewed cohort once. The focused tests, fleet contract command, dry-run report, and browser workflow described below make the result observable.

## Progress

- [x] (2026-08-10) Inspected the live mapping claim/export/completion path, model-agent contracts, sport validators, disposable package checks, reviewer/approval flow, admin human-review queue, deployment topology, and historical mapping-job envelopes.
- [x] (2026-08-10) Defined the authoritative claim-time catalog, evidence-backed determination, completion/approval invariants, authenticated human-resolution action, bounded historical reconciliation, fleet preflight, and verification contracts.
- [x] (2026-08-10) Incorporated an independent review of the proposed plan, closing the live model-agent, standalone apply, stale-lease completion, approval-disposition, mixed-run citation, and sport-less human-review gaps it identified.
- [x] (2026-08-10) Re-reviewed the revised cutover against production data and every live writer; narrowed the first cohort to 423 pure catalog rows and added coverage-worker CAS, domain-policy and logo-evidence claim binding, the separate model-controller image rollout, and a hard abort instead of legacy live apply.
- [x] (2026-08-10) Synthesized the 20 parallel review slices, corrected the remaining transaction, fleet-stop, coverage-writer, approval-reset, and nonrecursive-history gaps, and received final independent approval of the revised plan.
- [x] (2026-08-10) Implemented the catalog snapshot, evidence-backed determination, claim-evidence, queue CAS, model-agent, reviewer, admin, approval-only application, coverage, and bounded reconciliation changes; the deleted standalone live-apply command and its package entry are absent.
- [x] (2026-08-10) Ran the complete affiliate-import suite (203 suites, 885 tests), the approved focused suite plus the dedicated claim-evidence boundary suite (38 suites, 295 tests), the sport-resolution route fixture, lint, type-check, whitespace checks, and the no-write fleet contract preflight successfully.
- [ ] (2026-08-10) Perform the guarded production rollout, historical dry-run/apply/idempotency check, worker monitoring, package inspection, and browser verification only after an operator supplies the approved full implementation commit, published image digests, and host access; no live mutation was performed in this change.

## Surprises & Discoveries

- Observation: The current Codex claim/export path does not preserve an authoritative `Sports` snapshot on the mapping job.
  Evidence: `scripts/claim-affiliate-source-mapping.ts` exports by source key, `src/server/affiliateImports/sourceIntakeExport.ts` emits no catalog, and `src/server/affiliateImports/sourceMappingQueue.ts` stores no claim catalog.

- Observation: The open-weight model-agent path independently decides catalog membership from compiled defaults.
  Evidence: `src/server/affiliateImports/affiliateSportMapping.ts` constructs its canonical-name set from `DEFAULT_SPORTS`, and `src/server/affiliateImports/agentContracts.ts` invokes that validation from a context-free schema.

- Observation: Disposable package validation can reject a newly valid live sport even when the mapper chose it correctly.
  Evidence: `src/server/affiliateImports/sportQuality.ts` queries the disposable database’s `Sports` seed instead of consuming the mapper claim’s catalog.

- Observation: Current mapper results do not preserve one conclusion and source-owned citation per sport label.
  Evidence: `src/server/affiliateImports/codexIngestionResult.ts` retains unsupported labels only in a generic human-review envelope, so historical rows cannot be auto-corrected safely.

- Observation: The admin mapping-review panel is informational for these rows.
  Evidence: `src/server/affiliateImports/sourceMappingHumanReview.ts` and `src/app/admin/AdminAffiliateMappingReviewPanel.tsx` expose guidance and links but no governed sport-resolution mutation.

- Observation: Existing JSON columns and queue rows are sufficient; a migration would add storage without adding an invariant.
  Evidence: `AffiliateSourceMappingJobs.resultSummary` and `AffiliateApprovalJobs.decision` in `prisma/schema.prisma` already retain versioned envelopes, histories, claim timestamps, owners, and leases.

- Observation: The live model controller bypasses the Codex claim provenance path and stores only result metadata.
  Evidence: `scripts/run-affiliate-mapping-agent.ts` calls `claimNextAffiliateSourceIntakeForMapping`, exports separately, and invokes `finishAffiliateSourceMappingClaim` without the full worker result or catalog context.

- Observation: Mapping completion is vulnerable to a same-worker reclaim race.
  Evidence: `finishAffiliateSourceMappingClaim` in `src/server/affiliateImports/sourceMappingQueue.ts` performs a read followed by an update by job id; it does not compare `claimedAt` or the unexpired lease in the terminal write.

- Observation: The live apply script is a second approval authority.
  Evidence: `scripts/apply-approved-affiliate-mapping-jobs.ts --apply` can execute a package with an operator id, while `scripts/complete-affiliate-approval.ts` shells out to it before the approval row becomes terminal.

- Observation: The general model context builder can merge artifacts from multiple runs under one primary run id.
  Evidence: `buildAffiliateMappingJobContextFromExports` in `src/server/affiliateImports/agentJobContext.ts` is appropriate for training materialization but cannot prove single-run live citation ownership.

- Observation: The live approval/mapping join currently has no already-approved package waiting on the deleted standalone application path.
  Evidence: A read-only production query on 2026-08-10 grouped mapping-package approval and mapping statuses as `APPROVED|APPROVED|601`, `DEFERRED|HUMAN_REVIEW_REQUIRED|228`, `REJECTED|EXPANDED|1`, `REJECTED|FAILED|65`, and `REJECTED|HUMAN_REVIEW_REQUIRED|480`; there was no `APPROVED|REVIEW_REQUIRED` row. The stopped-fleet preview remains mandatory because that can change before rollout.

- Observation: The coverage service is a third live writer to the mapping queue.
  Evidence: `queueCoverageMappingRepair` in `src/server/affiliateImports/coverageAgentQueue.ts` reads an active mapping row and later resets it to `QUEUED`; `deploy/affiliate-agents/compose.yml` runs a separate `coverage` checkout, so stopping and preflighting only mapper and reviewer containers would leave a race.

- Observation: The production sport-only backlog is a narrow, countable cohort.
  Evidence: A read-only query on 2026-08-10 found 423 `HUMAN_REVIEW_REQUIRED` mapping jobs whose structured reason-code array is exactly `["SPORT_NOT_IN_CATALOG"]`, 22 rows where that code is mixed with another reason, and 523 `FAILED` rows with no structured reason code. The first rollout targets the 423 pure rows; mixed and unstructured rows remain untouched unless the dry-run proves an exact allowlisted legacy shape.

- Observation: The requested surface-specific examples already exist in the live catalog.
  Evidence: A read-only production query on 2026-08-10 returned exact id/name pairs for `Beach Volleyball`, `Futsal`, `Grass Soccer`, `Indoor Soccer`, and `Indoor Volleyball`; the defect is the worker contract, not missing catalog rows.

## Decision Log

- Decision: Use the current live Prisma `Sports` rows as the only catalog authority for a mapping claim.
  Rationale: Exact ids or names can change independently of producer checkouts. A deterministic id/name snapshot hash can bind the claim, mapper result, completion, report, review, and approval without treating compiled seed data as runtime truth.
  Date/Author: 2026-08-10 / Codex

- Decision: Represent sport resolution as an evidence-backed union rather than one inferred label.
  Rationale: A source may genuinely offer multiple surfaces, while a generic family label may establish none. One or more determinations preserve both cases without a fallback guess.
  Date/Author: 2026-08-10 / Codex

- Decision: Keep blacklist policy independent from catalog membership.
  Rationale: A blacklisted name can exist in `Sports` for product reasons without becoming eligible for affiliate execution. Mixed sources may retain explicit exclusions beside valid resolved sports.
  Date/Author: 2026-08-10 / Codex

- Decision: Make human sport choices authenticated, per-determination inputs.
  Rationale: The server derives source labels from persisted evidence, validates selected names against a fresh catalog, stores actor and rationale, and requires the next completion to match one-to-one. An all-blacklisted source can only receive a checked exclusion confirmation.
  Date/Author: 2026-08-10 / Codex

- Decision: Make mapping and approval completion compare immutable claim generations.
  Rationale: Stable worker or reviewer ids can reclaim expired rows. Matching `claimedAt` and an unexpired lease in the final compare-and-swap prevents an old process from completing a new claim.
  Date/Author: 2026-08-10 / Codex

- Decision: Use one live claim/export/context/completion service for Codex and model-agent workers.
  Rationale: Parallel live pipelines would recreate catalog and provenance drift. The model-agent live command must fail closed if it cannot use the shared boundary.
  Date/Author: 2026-08-10 / Codex

- Decision: Permit live package application only inside validated approval completion.
  Rationale: A claimed approval row is not an approval decision. The application service may create only safe unlisted rows and cannot mark either queue terminal; one final approval CAS does that atomically.
  Date/Author: 2026-08-10 / Codex

- Decision: Requeue the historical cohort once on the same mapping jobs.
  Rationale: Exact sole-code arrays plus two anchored legacy messages identify the known false-negative class without admitting mixed failures or guessing a sport. Count/hash guards, identity checks, active-job checks, and append-only provenance make the operation reviewable and idempotent.
  Date/Author: 2026-08-10 / Codex

- Decision: Store prior envelopes as nonrecursive, hash-linked history snapshots.
  Rationale: Embedding history arrays inside later history entries grows recursively. Retaining each history array once at the top level plus verified prefix counts and hashes is lossless and bounded.
  Date/Author: 2026-08-10 / Codex

- Decision: Bind every approval-owned side effect to one immutable approval generation.
  Rationale: Domain policy and supplemental logo capture currently write before a final approval CAS. Extending and rechecking exact `claimedAt` makes a stale reviewer unable to mutate policy, attach evidence, or authorize package application.
  Date/Author: 2026-08-10 / Codex

- Decision: Abort rather than drain through the deleted legacy apply authority.
  Rationale: An operator id and terminal approval row do not reconstruct an active approval claim generation. The pre-cutover preview must be zero; any nonzero result requires a revised governed recovery, not an unsafe escape hatch.
  Date/Author: 2026-08-10 / Codex

- Decision: Deploy as a stopped-fleet cutover.
  Rationale: All ten mapper services, both reviewer services, the coverage service, and the separately deployed model controller share or mutate live mapping queues. Every mounted checkout and the digest-pinned controller image must expose the same context, completion, approval, and coverage-repair contract before any historical row is requeued.
  Date/Author: 2026-08-10 / Codex

## Outcomes & Retrospective

Local implementation and verification are complete: the catalog/determination, claim-evidence, generation-CAS, model-agent, reviewer, admin resolution, approval-only application, coverage, historical reconciliation, fleet contract, and operational guidance are present. The complete affiliate-import suite passed 203 suites and 885 tests; the approved focused suite plus the dedicated claim-evidence boundary suite passed 38 suites and 295 tests; the sport-resolution route, lint, type-check, whitespace checks, and no-write contract preflight also passed. Production rollout remains intentionally unperformed because this workspace does not provide the approved immutable commit/image digests or authorized two-host mutation window; the rollout section remains the operator-run next step and no live database, queue, controller, or browser state was changed.

## Context and Orientation

Affiliate discovery captures a public site into `AffiliateSourceIntakes`, `AffiliateSourceIntakeRuns`, pages, and stored artifacts. A mapping producer then claims one `AffiliateSourceMappingJobs` row, inspects only those stored artifacts, writes a source package in its producer checkout, validates the package against a disposable PostgreSQL database, and completes the mapping job as review-ready, human-review-required, or failed. In this plan, a *claim generation* is the tuple of job id, worker or reviewer id, and the row’s `claimedAt` timestamp. A *lease* is the deadline in `leaseExpiresAt` during which that generation owns the row. A *compare-and-swap* (CAS) is a conditional database update that succeeds only if those values still match.

The Codex producer is launched by `scripts/run-affiliate-intake-codex-loop.ts`; its goal text is built in `src/server/affiliateImports/codexCliGoal.ts` and follows `.agents/skills/ingest-affiliate-intakes/SKILL.md`. It reserves or resumes work with `scripts/claim-affiliate-source-mapping.ts`, exports stored evidence with `scripts/export-affiliate-source-intake.ts`, and submits a result through `scripts/complete-affiliate-source-mapping.ts` and `src/server/affiliateImports/sourceMappingQueue.ts`. `scripts/run-affiliate-mapping-agent.ts` is the separate open-weight model controller. It produces `AffiliateSourceDraft` and `AffiliateMappingWorkerResult` values through `agentContracts.ts`, `agentJobContext.ts`, `agentModelClient.ts`, `agentRunner.ts`, `agentGenerator.ts`, and `agentTooling.ts`.

A *catalog snapshot* in this plan is the sorted set of current `Sports.id` and exact `Sports.name` values plus a deterministic hash. A *sport determination* is a persisted mapper conclusion that binds exact source labels to one of `RESOLVED`, `VARIANT_UNRESOLVED`, `UNSUPPORTED`, or `BLACKLISTED`, with stored-artifact citations. A *review-ready package* is a producer result whose setup, disposable scrape, candidates, organization, logo disposition, and evidence report passed the repository’s existing checks. It is not live approval.

Independent review uses `AffiliateApprovalJobs`, `src/server/affiliateImports/approvalQueue.ts`, `src/server/affiliateImports/codexApprovalGoal.ts`, `.agents/skills/review-affiliate-approvals/SKILL.md`, and `scripts/complete-affiliate-approval.ts`. The existing `scripts/apply-approved-affiliate-mapping-jobs.ts` is a second live mutation path and is removed by this plan. Human product decisions are shown by `src/server/affiliateImports/sourceMappingHumanReview.ts` and `src/app/admin/AdminAffiliateMappingReviewPanel.tsx`; the panel is served by routes under `src/app/api/admin/affiliate-mapping-reviews` and authenticated by `requireRazumlyAdmin`.

Production runs ten `mapper-*` services, two `reviewer-*` services, and one default `coverage` service from `deploy/affiliate-agents/compose.yml`. Mapper services mount ten distinct producer checkouts, coverage mounts its own checkout, and both reviewers mount one shared reviewer checkout plus the producer checkouts read-only. The open-weight worker is a separate digest-pinned `controller` image and systemd timer on the OVH model host described by `deploy/ai/README.md`; it claims the same live mapping queue. The deployment must preserve every producer commit because package paths and hashes are approval evidence, and must cut over both hosts to the same contract before queue processing resumes.

The defect is cross-cutting: the export and claim do not retain a live catalog, the model path uses `DEFAULT_SPORTS`, disposable validation queries its own possibly stale seed, current result envelopes lack evidence-backed per-label determinations, completion updates are not claim-generation-safe, and historical false negatives contain only partial evidence. Correcting only the prompt would leave every other boundary able to reject, alter, or approve the wrong sport.

Affiliate mapping must determine an exact current `Sports.name` from stored first-party HTML, Markdown, screenshots, and source pages instead of treating discovery `sportHints` or a literal generic source label as the answer. The implementation must give each mapper an authoritative current catalog, require evidence for a surface/format-specific selection, distinguish unresolved variants from truly unsupported sports and stale catalog state, and re-evaluate the historical terminal backlog without guessing. The intended end state is that evidence-backed `Grass Soccer`, `Indoor Soccer`, `Beach Volleyball`, and similar mappings proceed automatically, while genuinely ambiguous raw evidence produces one accurately classified review item rather than a misleading `SPORT_NOT_IN_CATALOG` failure.

## Plan of Work

### 1. Export a claim-time, authoritative sport catalog

Add `src/server/affiliateImports/affiliateSportsCatalog.ts` as the single catalog snapshot implementation. It will:

- load `id` and `name` from the current Prisma `sports` model used by the mapping claim;
- reject an empty catalog, blank or padded ids/names, duplicate ids, duplicate exact names, and case-folded name collisions, then sort by `name` and `id` with a code-unit comparator (`<`/`>`), not locale-dependent collation;
- export a strict `affiliateSportsCatalogSnapshotSchema`/type that recomputes and verifies `sha256`, plus pure `buildAffiliateSportsCatalogSnapshot(rows, capturedAt)` and injectable `loadAffiliateSportsCatalogSnapshot(queryable, capturedAt)` helpers; and
- return `{ schemaVersion: 1, capturedAt, sha256, sports: [{ id, name }] }`, where `sha256` is `createHash('sha256')` over `JSON.stringify({ schemaVersion: 1, sports: sortedIdNamePairs })` and excludes only `capturedAt`; the payload has fixed key order, so no generic stable-JSON dependency or contract-module cycle is needed.

Extend `buildAffiliateSourceEvidence` in `src/server/affiliateImports/sourceIntakeExport.ts` to require that snapshot and emit its hash as `sportsCatalogSha256` provenance. Update `scripts/export-affiliate-source-intake.ts` to load the catalog from the same configured database connection, accept exact `--intake-id` and `--run-id` selectors for live claims, put the full `sportsCatalog` at the manifest root, write a sibling `sports-catalog.json`, and return the validated snapshot in its JSON output. A live claim must never select evidence by source key alone. Do not copy the full catalog into `source-evidence.json`, because producers persist that object in each source's metadata; the hash is sufficient there while the manifest, claim, and dedicated file retain the full claim input. Whenever `scripts/claim-affiliate-source-mapping.ts` performs the export (including the resumed claim executed inside the Codex goal), it must strictly parse the exporter output, cross-check its intake id, run id, and catalog against the written manifest, write a strict `mapping-job-context.json` containing the claim handle and any preserved `humanSportResolution` from the database, and call a new conditional `storeAffiliateSourceMappingClaimEvidenceContext` operation in `sourceMappingQueue.ts`. That operation records `{ jobId, workerId, claimedAt, intakeId, evidenceRunId, sportsCatalog }` in the claimed job's existing JSON `resultSummary.claimEvidenceContext` only when the job is still `CLAIMED`, leased, and owned by that exact claim generation. A resumed process within the same generation reuses this persisted run and snapshot; a reclaim with a new `claimedAt` archives the prior context in `sportCatalogRefreshHistory`, then captures and replaces it before work. The claim command returns success only after this write, and the goal contract forbids evidence inspection or generation before that successful output.

This makes the selected run and catalog durable claim-time inputs rather than trusting a mapper-supplied hash. The loop may retain its existing `--no-export` reservation claim, but that reservation cannot inspect evidence, generate files, or complete; the resumed claim inside the goal must re-export and atomically store its claim evidence context before work proceeds. Do not add `sportHints` to the mapper evidence contract and do not fall back to `DEFAULT_SPORTS`.

Extract the database-and-filesystem sequence into `src/server/affiliateImports/sourceMappingClaimEvidence.ts` rather than implementing it only inside a CLI. Both `scripts/claim-affiliate-source-mapping.ts` and the live `scripts/run-affiliate-mapping-agent.ts` must use that function to claim/resume, export, cross-check, write the job-context file, and persist the claim evidence before model execution. It returns an immutable claim handle `{ jobId, workerId, claimedAt }`. Remove the model-agent command's direct `claimNextAffiliateSourceIntakeForMapping`/export/finish shortcut; after generation it must feed the complete version-2 worker result and claim handle through the same sport completion verifier and guarded finish path as the Codex command. If this integration is unavailable, `affiliate:mapping:agent --live` must fail closed rather than use its old shortcut.

The acquisition service is idempotent for one claim generation. If `claimEvidenceContext` already belongs to the same `{ jobId, workerId, claimedAt }`, it never replaces the selected run or catalog. It verifies the persisted snapshot against a fresh catalog before work; a mismatch conditionally releases that exact generation to `QUEUED` for a fresh claim. If the evidence directory is missing or incomplete while the snapshot is still current, it rematerializes the exact persisted run using the persisted catalog as input, verifies the regenerated manifest/hash, and rewrites `mapping-job-context.json`; it never silently captures a newer run or catalog under the old `claimedAt`.

Update `finishAffiliateSourceMappingClaim` to carry `claimEvidenceContext`, `humanSportResolution`, `sportResolutionHistory`, `sportCatalogRefreshHistory`, `sportReconciliationHistory`, and `approvalCycleHistory` forward alongside its existing repair histories when it replaces `resultSummary`; otherwise successful completion would discard the new audit inputs.

Keep the existing source-evidence schema version because its hash is an additive provenance field in a generated claim artifact, but fail the live export and mapper goal closed if the full manifest catalog is absent. Local fixtures must pass an explicit snapshot so tests cannot accidentally exercise a compiled fallback.

#### Eliminate compiled catalog decisions from every mapper path

The repository's model-agent path currently calls `collectAffiliateAgentSportIssues` from the static `affiliateSourceDraftSchema`, and `affiliateSportMapping.ts` builds its canonical set from `DEFAULT_SPORTS`. That recreates the stale-catalog failure even if the Codex CLI receives a live export. Make catalog membership explicitly context-dependent:

- change `validateAffiliateAgentSportName` and `collectAffiliateAgentSportIssues` to require `catalogNames: readonly string[]`; do not provide a default argument;
- remove catalog membership from `affiliateSourceDraftSchema`'s context-free `superRefine`, while retaining its structural, evidence, target-kind, date, URL, and policy checks;
- add `assertAffiliateSourceDraftSports(draft, catalogNames)` and call it at every executable boundary rather than inside the static schema;
- add `contextContractVersion: 2`, the full `sportsCatalog` snapshot, and optional strict `humanSportResolution` to `AffiliateMappingJobContext`; populate them from the single live `manifest.sportsCatalog` and `mapping-job-context.json` in `agentJobContext.ts`, require the job-context id to equal the requested job, require the catalog hash to equal `manifest.sourceEvidence.sportsCatalogSha256`, retain each manifest `artifactId` and `runId` in the v2 artifact summaries, and include all of this in the model prompt. The live builder rejects more than one export and any intake/run mismatch. Rename the multi-export builder as an explicitly training-only API, retain per-artifact run provenance there, and never pass its output to mapping completion;
- have `agentModelClient.ts`, `agentRunner.ts`, `agentGenerator.ts`, and the async `AffiliateAgentToolbox` validation/render path pass that context's names and decision explicitly and assert before returning, rendering, or writing a draft;
- version `affiliateMappingWorkerResultSchema` and `affiliateMappingReviewSchema`: new schema-version-2 worker results carry `contextContractVersion: 2`, the full validated catalog snapshot, and the optional human-resolution record, reviews bind to their hashes, and `buildAffiliateReviewerInput`, corrected-draft validation, `agentReview.ts`, and teaching-signal approval all validate against those inputs;
- make agent evaluation, gold materialization, teaching envelopes, and training dataset contexts carry the version-2 catalog snapshot/hash; retain explicit parse-only legacy-v1 unions for historical worker/review/training artifacts, but exclude v1 examples from current release/evaluation gates rather than filling them from today's defaults;
- add `sportDeterminations` to the agent draft contract, required for new executable/refusal contexts by the runner even though the base schema remains able to parse legacy version-1 training artifacts; and
- replace the live model controller's metadata-only queue completion with the full schema-version-2 `affiliateMappingWorkerResultSchema` envelope plus the same persisted `claimEvidenceContext`; a tagged adapter feeds its `draft.sportDeterminations` into the shared completion verifier, while `sourceMappingHumanReview.ts` can read determinations from either this worker envelope or the existing Codex result envelope. Do not invent a third persisted shape, and do not make model-agent review recommendations approval authority.

Update every caller of the two sport-validation functions in one cutover. `DEFAULT_SPORTS` remains valid seed/application data, but no live claim, model response, draft renderer, completion, or approval decision may use it as catalog authority. `BLACKLISTED_AFFILIATE_SPORT_NAMES` remains the independent scoring-policy exclusion and is checked before injected-catalog membership; its presence in the live `Sports` table never makes a sport executable. Regression tests must prove that a name present only in an injected snapshot passes, a name present only in the compiled defaults fails, and a blacklisted name present in the injected snapshot still fails executable validation.

### 2. Make sport determination a persisted mapper result, not prompt prose

Define and export the strict `affiliateSportDeterminationSchema`, `affiliateHumanSportResolutionSchema`, and their stable hash helpers from `src/server/affiliateImports/affiliateSportDetermination.ts`; embed those same schemas in `codexIngestionResult.ts`, `agentContracts.ts`, queue/completion, and the admin action rather than creating separate Codex, model-agent, and UI contracts:

    type AffiliateSportDetermination = {
      sourceLabels: string[]; // unique, sorted exact labels observed in source evidence
      status: 'RESOLVED' | 'VARIANT_UNRESOLVED' | 'UNSUPPORTED' | 'BLACKLISTED';
      resolutionBasis: 'SOURCE_EVIDENCE' | 'USER_DECISION';
      resolvedFromDeterminationSha256?: string; // required only for USER_DECISION
      canonicalSportNames: string[]; // unique, sorted; nonempty only for RESOLVED
      rationale: string;
      evidence: Array<{
        artifactId: string;
        artifactSha256: string;
        artifactKind: 'PAGE_HTML' | 'PAGE_MARKDOWN' | 'PAGE_SCREENSHOT';
        pageUrl: string;
        excerpt: string; // verbatim text quote, or concise visible observation for a screenshot
      }>;
    };

    type AffiliateHumanSportResolution = {
      schemaVersion: 1;
      state: 'PENDING' | 'CONSUMED';
      decidedAt: string;
      decidedByUserId: string;
      catalogSha256: string;
      priorResultSummarySha256: string;
      rationale: string;
      resolutions: Array<{
        determinationSha256: string;
        sourceLabels: string[];
        canonicalSportNames: string[];
      }>;
      consumedAt?: string;
      consumedDeterminationSha256s?: string[];
    };

`PENDING` requires neither consumed field; `CONSUMED` requires both. Cap the rationale at 2,000 characters and the resolution list at 50 entries. Resolution entries are sorted and unique by `determinationSha256`, each source-label list equals the matched persisted determination, and every selected name is sorted, unique, exact-catalog, and nonblacklisted; consumed determination hashes are likewise sorted and unique.

The Codex result gains `evidenceRunId`, `sportsCatalogSha256`, and `sportDeterminations`. Cap the array at 50 determinations, each at 20 source labels and 8 citations; cap labels at 160 characters, excerpts at 1,000 characters, and rationale at 2,000 characters. All “sorted, unique” arrays use the same code-unit comparator as the catalog. Citations are unique by `(artifactId, artifactSha256, artifactKind, canonicalized pageUrl, excerpt)` and sorted by that tuple. Export `affiliateSportDeterminationSha256` from the determination module; hash the schema-parsed, fixed-key-order shape after those arrays are sorted, so it has no dependency on `agentContracts.ts`. Determinations are unique by that hash and sorted by `(status, joined sourceLabels, joined canonicalSportNames, determination hash)`. One determination represents one sport conclusion, so a source that explicitly offers more than one surface may put multiple canonical names in one resolved record. New mapper completions must satisfy these invariants:

- every determination has at least one stored first-party citation;
- a `SOURCE_EVIDENCE` `RESOLVED` determination has one or more exact names from the claim-time catalog, those surfaces are established by the cited evidence, and a genuinely multi-sport source may have multiple names;
- a `USER_DECISION` determination is allowed only for `RESOLVED`, names the exact prior unresolved/unsupported determination in `resolvedFromDeterminationSha256`, and has source labels and canonical names that exactly equal that still-preserved, authenticated `humanSportResolution` entry on the job; the citations still prove the source's raw terminology;
- `VARIANT_UNRESOLVED` has no canonical name, uses `SOURCE_EVIDENCE`, and means that the sport family is known but the stored evidence cannot distinguish the governed variants;
- `UNSUPPORTED` has no canonical name, uses `SOURCE_EVIDENCE`, and means that no current catalog sport can represent the evidenced activity;
- `BLACKLISTED` has no canonical name, uses `SOURCE_EVIDENCE`, and means that the exact evidenced sport is excluded by the existing affiliate scoring policy even if it appears in `Sports`;
- `REVIEW_REQUIRED` packages contain at least one `RESOLVED` determination, may also retain `BLACKLISTED` determinations as explicit exclusions, and contain no unresolved or unsupported determination;
- a `HUMAN_REVIEW_REQUIRED` result with `SPORT_VARIANT_UNRESOLVED`, `SPORT_NOT_IN_CATALOG`, or `SPORT_BLACKLISTED` contains at least one matching `VARIANT_UNRESOLVED`, `UNSUPPORTED`, or `BLACKLISTED` determination, respectively, and no mapping artifacts or candidates;
- a non-sport `HUMAN_REVIEW_REQUIRED` result may omit determinations when stored evidence cannot establish a sport; it must use only non-sport reason codes and an empty `sourceSportLabels` array rather than inventing a label or `SPORT_NOT_IN_CATALOG`. When determinations are present, every unresolved/unsupported/blacklisted status still requires its matching sport reason code unless `BLACKLISTED` is an exclusion alongside a review-ready resolved sport; and
- `sourceSportLabels` for a sport human-review payload is the sorted, unique union of the determination labels.

Retain parse compatibility for already persisted schema-version-1 results with an explicit legacy union. In the current result schema, allow `sourceSportLabels: []` only for non-sport human review, and enforce the new catalog/determination fields for every `REVIEW_REQUIRED` completion and every sport-coded `HUMAN_REVIEW_REQUIRED` completion without inventing defaults. Replace the narrowly named `buildCodexAffiliateUnsupportedSportHumanReviewResult` with two explicit helpers: `buildCodexAffiliateSportHumanReviewResult`, which accepts determinations and derives sport reason codes, labels, rationale, and blocking issues, and a generic non-sport builder that rejects all sport reason codes and emits empty labels.

Old results remain readable for queue/history tools, but an existing `REVIEW_REQUIRED` package that lacks the new fields is not grandfathered into approval. Its package-evidence report must set determination/catalog consistency to failed, and the reviewer must return `PACKAGE_VALIDATION_FAILED` for producer repair so the source receives a new claim snapshot.

### 3. Verify catalog freshness, evidence ownership, and emitted sports at completion

Extend `src/server/affiliateImports/affiliateSportDetermination.ts` with the pure completion verifier plus a thin database adapter. `completeAffiliateSourceMapping` in `scripts/complete-affiliate-source-mapping.ts` will call it before `finishAffiliateSourceMappingClaim`.

Harden the queue boundary at the same time. `storeAffiliateSourceMappingClaimEvidenceContext`, `releaseAffiliateSourceMappingClaim`, and `finishAffiliateSourceMappingClaim` must all require the immutable claim handle returned at claim time. Release and terminal transactions use a conditional update/CAS over `id`, `status = 'CLAIMED'`, `workerId`, exact `claimedAt`, and `leaseExpiresAt >= CURRENT_TIMESTAMP`; only after one row matches may terminal completion update the intake or approval state. A zero-row result is a stale-claim failure with no writes. Update every caller, including the claim/release CLI, Codex completion CLI, and `run-affiliate-mapping-agent.ts`, and add a race test in which the lease expires and the same worker id reclaims the job with a new `claimedAt`; the old process can neither release nor overwrite the new claim.

`AffiliateApprovalJobs` has one database-unique `(subjectType, subjectKey)` row, so a remapped package must reuse that row rather than assume a second approval can be inserted. In the same successful mapping-completion transaction, a new `REVIEW_REQUIRED` result must either create the missing approval row or, when the existing row is terminal (`APPROVED`, `REJECTED`, or `DEFERRED`), append its full prior `{ id, status, claimedAt, leaseExpiresAt, reviewerId, attemptCount, decision, errorMessage, finishedAt }` envelope and hash to `resultSummary.approvalCycleHistory` before resetting that row to fresh `QUEUED` state. An existing active approval aborts completion. All other mapping outcomes leave the approval row unchanged. Preserve `approvalCycleHistory` through every later result replacement and verify that it, like the other histories, never nests itself.

The coverage worker is also a mapping-queue writer. Extend `coverageAgentContracts.ts`, `codexCoverageGoal.ts`, `coverageAgentLoop.ts`, and `coverageAgentQueue.ts` so every coverage action carries its immutable `{ jobId, agentId, claimedAt }` generation. `storeAffiliateManualBrowserEvidence` must CAS that still-owned, unexpired generation before its first write, tag its run and artifacts with the generation, and recheck it in the final transaction before marking the run successful, changing `intake.lastRunId`, or creating a mapping job; a lost claim leaves the run failed and cannot make its evidence current. For `MAPPER_REPAIR_REQUIRED`, one transaction must first CAS the coverage claim; then conditionally requeue only the mapping-row state that was read (`QUEUED`, or the exact expired `CLAIMED` generation), preserving every new audit field; update the intake; and complete the coverage job. A newly reclaimed mapping or coverage job makes the entire transaction write nothing. Both mapping-job create paths must treat the existing partial active-mapping uniqueness constraint as a concurrent skip, not overwrite or duplicate another row. Add the coverage service/checkout to fleet preflight and race tests for a mapping reclaim, same-agent coverage reclaim, and manual-evidence claim loss.

The verifier reloads the current live catalog and claimed intake/run context, then fails without changing queue state unless all of the following hold:

1. `evidenceRunId` equals `job.resultSummary.claimEvidenceContext.evidenceRunId` and belongs to the claimed intake. Each citation's `artifactId` must resolve to exactly one artifact from that run; its SHA-256 and kind must equal `artifactSha256` and `artifactKind`, and its canonicalized `pageUrl` must equal the artifact's canonicalized `sourceUrl` or `finalUrl`. Read and normalize each distinct stored artifact only once per completion through the existing artifact reader, recomputing its SHA-256. For HTML, derive visible text with the existing HTML artifact parser; for Markdown, use the decoded body. After NFKC normalization, nonbreaking-space replacement, and whitespace collapse without case folding, every textual `excerpt` must be a nonempty substring of that artifact text. A screenshot citation carries a concise observation rather than a fake quote; object integrity and ownership are machine-checked, while the reviewer contract requires visual inspection of that stored screenshot before approval.

2. `sportsCatalogSha256` equals the validated `job.resultSummary.claimEvidenceContext.sportsCatalog.sha256` and a fresh live-catalog snapshot. A mismatch is `SPORT_CATALOG_MISMATCH`; the operator must re-export/re-run the claim rather than accept a stale answer.
3. Every `RESOLVED.canonicalSportNames` entry exists exactly in that snapshot and is not blacklisted by the current affiliate scoring policy; every `BLACKLISTED` determination still matches that policy. A policy mismatch is producer repair, never an inferred substitution.
4. `USER_DECISION` determinations provide one-to-one coverage of the authenticated job's preserved resolution entries, while `SOURCE_EVIDENCE` determinations do not claim a human override. A missing, extra, or changed decision fails completion.
5. For a review-ready package, exactly one source organization exists; every candidate sport is a member of that organization's sports; and the union of distinct candidate `sportName` and organization `sports` values in the disposable validation database exactly equals the union of resolved canonical names. Missing, extra, wrong-case, or generic values fail completion.
6. Human-review results have no producer package and the reason-code/status matrix described above is exact.

Reuse the disposable database setup already used by `inspectAffiliateSportQuality`; do not connect the live verifier to candidate tables and do not trust the disposable database's potentially stale `Sports` seed. Refactor `sportQuality.ts` so `inspectAffiliateSportQuality` requires the validated claim-time catalog snapshot plus mapper determinations, queries only disposable candidates/source organization, and validates every emitted string against the injected names. It reports `catalogSha256`, `catalogHashMatched`, `determinationCoveragePassed`, `expectedSportNames`, and `observedSportNames` in addition to its current exact-name checks. Update `scripts/report-affiliate-mapping-package-evidence.ts` to emit the full compact `sportDeterminations` and load a fresh live snapshot for one `catalogConsistency` block containing the claim-time hash, current-live hash, and disposable validator's injected-input hash plus a single `passed` flag. This makes a newly added live sport usable even when a producer branch or disposable seed predates it. The report also reuses the verified artifact loader: textual citations report `excerptMatched`, and screenshot citations are hash-verified and materialized atomically under `output/affiliate-mapping-package-evidence/<jobId>/citations/<artifactId>.<verified-image-extension>` with a returned local path so the container reviewer can actually inspect them. Reject a screenshot kind whose stored MIME type is not an allowlisted image type. The existing artifact-retention policy must cover that bounded directory. Completion and approval review consume these shared outputs instead of implementing a second equality rule.

Add a final guard in `completeAffiliateApproval`: `APPROVE` requires the persisted mapper result to contain only package-eligible determinations (`RESOLVED` plus explicit `BLACKLISTED` exclusions, with at least one resolved sport), every `USER_DECISION` determination to match the preserved authenticated resolution, its catalog hash to match preserved `claimEvidenceContext`, and that hash to match a fresh live catalog. Extend `ApprovalCompletionDependencies` with an injectable catalog loader for focused tests; production defaults to `loadAffiliateSportsCatalogSnapshot(prisma)`. This prevents a reviewer flag from approving a legacy, tampered-decision, or newly stale package. It does not reimplement disposable candidate checks; those remain in the shared `sportQuality` report and existing `sportQualityVerified` review assertion.

Completion failures before the terminal update leave the active lease intact so the mapper can repair its result and do not manufacture a human-review row. The one exception is `SPORT_CATALOG_MISMATCH`: the shared completion adapter records no terminal result, then uses the same claim-handle CAS to release the job back to `QUEUED` with a fresh-claim reason so the next claim re-exports the catalog. `SPORT_CATALOG_MISMATCH` is a retryable producer-state mismatch, `SPORT_VARIANT_UNRESOLVED` is a deliberate human product decision, `SPORT_NOT_IN_CATALOG` is reserved for an evidenced unsupported source, and `SPORT_BLACKLISTED` is reserved for an evidenced all-blacklisted source.

### 4. Change the mapper and reviewer operating contracts

Update `src/server/affiliateImports/codexCliGoal.ts`, `.agents/skills/ingest-affiliate-intakes/SKILL.md`, and `.agents/skills/ingest-affiliate-intakes/references/completion-contract.md` with one mandatory sequence:

1. inspect stored HTML, Markdown, screenshots, and linked first-party pages;
2. record the source's exact terminology;
3. compare against the exported `sportsCatalog`;
4. select a canonical name only when the raw evidence establishes its surface or format;
5. record evidence-backed `sportDeterminations`; and
6. validate candidate and organization sports against those determinations before completing.

State explicitly that discovery `sportHints`, campaign metadata, organization names, URL tokens, and a bare generic family word are optional search context only. They cannot satisfy sport evidence or force a variant. Document the initial decision matrix:

| Stored first-party evidence | Result |
| --- | --- |
| `outdoor soccer`, grass/field context that expressly establishes the outdoor surface | `Grass Soccer` |
| `indoor soccer`, arena/boarded-field context, or expressly indoor soccer | `Indoor Soccer` |
| futsal rules or futsal court | `Futsal` |
| sand/beach soccer | `Beach Soccer` |
| only `Soccer`, with no usable surface evidence | `SPORT_VARIANT_UNRESOLVED` |
| indoor/gym/hard-court volleyball | `Indoor Volleyball` |
| sand/beach volleyball | `Beach Volleyball` |
| grass/outdoor-field volleyball | `Grass Volleyball` |
| only `Volleyball`, with no usable surface evidence | `SPORT_VARIANT_UNRESOLVED` |
| an evidenced sport family with no exact catalog entry | `SPORT_NOT_IN_CATALOG` |
| an exact blacklisted activity | `BLACKLISTED`; omit it from executable sports and preserve the evidence |

Do not treat the table as a keyword substitution map: context must establish the actual activity surface, and evidence for multiple offered surfaces produces multiple resolved canonical names.

Update `.agents/skills/review-affiliate-approvals/SKILL.md`, its `references/approval-contract.md`, and the runtime goal in `src/server/affiliateImports/codexApprovalGoal.ts` so reviewers first inspect `sportDeterminations` and the extended `sportQuality` report, and visually open every screenshot-only citation through its stored-artifact link before setting `storedEvidenceSufficient`. Missing or malformed determination evidence is `PACKAGE_VALIDATION_FAILED`; emitted values that disagree with an otherwise valid determination, a deterministically wrong variant, or a resolved determination whose evidence is actually generic are `SPORT_NAME_INVALID`; catalog drift is `SPORT_CATALOG_MISMATCH`. Those three use `PRODUCER_REPAIR`, and the corrected producer result may then emit the governed human-review result. Reviewers never invent a `VARIANT_UNRESOLVED`/`UNSUPPORTED` determination or choose a variant themselves.

Version `approvalResult.ts` for schema 2 and add `SPORT_CATALOG_MISMATCH` as a `PRODUCER_REPAIR` reason. Keep schema-version-1 `SPORT_NOT_IN_CATALOG` decisions parseable as history, but do not admit `SPORT_NOT_IN_CATALOG`, `SPORT_VARIANT_UNRESOLVED`, or `SPORT_BLACKLISTED` in new approval results: a review-ready mapping package cannot contain unresolved or unsupported determinations or consist only of exclusions, and those are mapping-completion/admin-queue outcomes rather than reviewer-authored product decisions. Zod enforces the version/category shape. After loading the mapping result, `completeAffiliateApproval` must still validate every schema-version-2 non-`APPROVE` sport disposition: catalog mismatch must equal a freshly computed hash mismatch, and `SPORT_NAME_INVALID` or `PACKAGE_VALIDATION_FAILED` cannot be used to turn a resolved package directly into an ungrounded human choice.
Version new `AffiliateApprovalResult` completions to schema 2 with `claimGeneration: { approvalJobId, reviewerId, claimedAt }`. The claim CLI and Codex approval goal must expose that immutable handle, and `complete-affiliate-approval.ts` plus `completeAffiliateApproval` must require it for every domain-policy or mapping decision; persisted schema-1 decisions remain parseable as history but cannot authorize a new completion. Every approval CAS and application permit compares the result's exact `claimedAt`, closing the same-reviewer-after-reclaim race.

Close the standalone live-application bypass. Extract the producer-commit execution and live safety postconditions from `scripts/apply-approved-affiliate-mapping-jobs.ts` into an internal, idempotent `applyVerifiedAffiliateMappingPackage` service. `completeAffiliateApproval` first validates the approval result, persisted mapping result, human decision, fresh catalog, exact approval `claimedAt`, reviewer ownership, and unexpired lease; a conditional update then extends that exact approval generation to two hours from the extension time, while the setup/scrape child process receives a hard 90-minute timeout. Only this preflight returns the application permit accepted by the internal service. Brand that permit with a module-private runtime `Symbol` and reject an object without the brand, so an arbitrary caller cannot reproduce it from a TypeScript shape or an `--approved-by` string. The service returns the applied source/mapping identities and enforces the existing unlisted/disabled/unvalidated/scrape postconditions, but it never changes either queue row to a terminal status. Factor the shared checks into `assertAffiliateMappingApprovalEligibility`, use them before application and again in a final transaction, and have that transaction atomically require the same unexpired approval generation, unchanged mapping-result hash, and `REVIEW_REQUIRED` mapping before it sets the mapping and approval rows `APPROVED`. A stale or timed-out attempt can leave only the existing safe unlisted live rows; it cannot grant approval, and retrying the same package must be idempotent. Delete `scripts/apply-approved-affiliate-mapping-jobs.ts` and remove the `affiliate:mapping:apply-approved-live` package command. A claimed approval row alone is not an approval decision, so no standalone CLI may execute or approve a package. Update `selectAffiliateMappingLiveApprovalCandidates`, focused tests, and runbooks to the canonical approval-completion path.

Domain-policy decisions use the same claim-generation gate, but unlike long-running package execution their effects are database-only and must be atomic. Refactor `applyAffiliateSourceDomainPolicy` and its intake/result/queue helpers to accept one transaction-scoped database adapter with no hidden global Prisma calls. `completeAffiliateApproval` validates the schema-2 result, then one transaction conditionally updates and locks the exact still-unexpired `{ approvalJobId, reviewerId, claimedAt }` generation, applies every policy, intake, discovery-result, and allowed-intake queue write through that adapter, and terminalizes the same approval row. A stale generation or any helper failure rolls back every policy side effect. An exact retry may observe the committed desired state, but a terminal row is idempotent only when the persisted decision hash matches the submitted result hash; same reviewer and same terminal status are insufficient.

Bind supplemental logo capture to that immutable approval generation too. Add `claimGeneration` to `CaptureAffiliateApprovalLogoEvidenceInput`, `scripts/capture-affiliate-approval-logo-evidence.ts`, and the Codex approval command. Before any page, run, artifact, fetch, or intake write, conditionally extend the matching, unexpired mapping-package approval generation. Persist the full generation in every supplemental run/artifact metadata object. At the successful end, a transaction rechecks the exact generation and lease before marking the run `SUCCEEDED` and changing `intake.lastRunId`; if ownership changed during capture, mark the run `FAILED` with `STALE_APPROVAL_CLAIM`, leave `lastRunId` unchanged, and never admit its artifacts as approval evidence. `completeAffiliateApproval` accepts supplemental evidence only from the same claim generation. Test a stale claim before capture and a same-reviewer reclaim during capture.

Expose the persisted determinations through `sourceMappingHumanReview.ts` and `src/app/admin/AdminAffiliateMappingReviewPanel.tsx`. Load the current catalog snapshot once per list request and return the claim/current hashes plus `catalogCurrent`; when they differ, classify the row as `SYSTEM`-owned with a requeue-on-fresh-claim recommendation before asking any product question. For every row with sport determinations, render a status badge, exact source labels, selected canonical names when any, rationale, excerpt/observation, page link, artifact hash, authenticated stored-artifact link using the existing `/api/admin/affiliate-intakes/[id]/artifacts/[artifactId]` route, and the stale-catalog warning when applicable. Rows without sport determinations keep their current layout.

Make those decisions actionable rather than informational. Add `resolveAffiliateMappingSportDecision` in `sourceMappingHumanReview.ts` and a Razumly-admin-only `POST /api/admin/affiliate-mapping-reviews/[jobId]/sport-resolution`. Parse a discriminated request: `{ action: 'REFRESH_CATALOG' }`, `{ action: 'SELECT_SPORTS', expectedCatalogSha256, resolutions: [{ determinationSha256, canonicalSportNames }], rationale }`, or `{ action: 'CONFIRM_EXCLUSIONS', determinationSha256s, rationale }`. `REFRESH_CATALOG` is allowed only when the preserved claim hash differs from a freshly loaded snapshot and appends the complete prior envelope to `sportCatalogRefreshHistory`. `SELECT_SPORTS` requires the expected hash to equal that fresh snapshot, a nonempty rationale, and exactly one resolution, keyed by `affiliateSportDeterminationSha256`, for every persisted `VARIANT_UNRESOLVED` or `UNSUPPORTED` determination; each resolution requires one or more exact nonblacklisted names from that snapshot. Derive source labels from the matched persisted determination rather than trusting the client. Preserve `BLACKLISTED` determinations as exclusions and reject an all-blacklisted result through `SELECT_SPORTS`. For refresh or selection, a transaction re-reads a still identity-less `HUMAN_REVIEW_REQUIRED` job whose substantive reason-code set (after ignoring `RETRY_LIMIT_EXCEEDED`) contains only `SPORT_VARIANT_UNRESOLVED`, `SPORT_NOT_IN_CATALOG`, and `SPORT_BLACKLISTED`, with at least one unresolved/unsupported code for selection; verifies that no active approval row or other active mapping job exists; and requeues that same job. A terminal approval row remains unchanged during this requeue; when a remapped job later produces `REVIEW_REQUIRED`, mapping completion archives and resets the unique row through the approval-cycle rule above. Reset the mapping job's lease/worker/attempt/package-repair fields as in the reconciliation cutover, set the intake to `READY_FOR_MAPPING`, preserve every existing audit-history array, and, for `SELECT_SPORTS`, store an active `{ schemaVersion: 1, state: 'PENDING', decidedAt, decidedByUserId, resolutions: [{ determinationSha256, sourceLabels, canonicalSportNames }], rationale, catalogSha256, priorResultSummarySha256 }` plus the archived prior envelope in `sportResolutionHistory`. The prior unsupported/unresolved evidence therefore remains auditable without recursively nesting it inside the active decision. `CONFIRM_EXCLUSIONS` requires a nonempty rationale and the exact hash set of an all-`BLACKLISTED` determination result whose labels still match current policy; it transactionally appends an `EXCLUSIONS_CONFIRMED` entry with actor, rationale, deterministic blacklist-policy hash, determination hashes, prior-result hash, and archived prior envelope while leaving the identity-less job terminal. An exact repeat against the same prior result and policy is idempotent; a later policy change is displayed as stale and requires the existing source retry workflow rather than silently changing the terminal decision. The list UI renders `Requeue on current catalog` for stale rows; otherwise each unresolved/unsupported determination gets a searchable multi-select, followed by a required rationale, `Requeue with decision`, and a link to `/admin/constants` for adding a fully configured sport before refreshing. An unconfirmed all-blacklisted row gets a required rationale and `Confirm exclusions`, never a sport selector; a valid confirmed row displays its actor/time/rationale and no action button.

Preserve `humanSportResolution`, `sportResolutionHistory`, `sportCatalogRefreshHistory`, `sportReconciliationHistory`, and `approvalCycleHistory` through the next claim and completion and include only a matching `PENDING` decision in Codex and model-agent contexts. A mapper may emit `resolutionBasis: 'USER_DECISION'` only when `resolvedFromDeterminationSha256`, its resolved source labels, and canonical names exactly match one recorded resolution and remain valid in the new claim snapshot; `SOURCE_EVIDENCE` must omit that field, and completion enforces one-to-one coverage of every resolution. In a successful review-ready terminal CAS whose `USER_DECISION` coverage passed, mark that active decision `CONSUMED`, add `consumedAt` and the resulting determination hashes, and retain it with the history; failed, retry, or human-review completions leave it pending. A changed/missing catalog name or changed source-label set returns the source for fresh human review instead of silently applying a stale decision. Reviewers see the authenticated decision provenance and verify the resulting package, but do not substitute their own sport choice.
Use one `archiveAffiliateMappingResultEnvelope` helper for catalog refresh, human resolution, reconciliation, approval-cycle, and approval/producer-repair history writes. To avoid recursively embedding ever-growing JSON, a “complete prior envelope” means every non-history field plus `{ historyPrefixes: [{ field, count, sha256 }] }`; the append-only history arrays themselves remain once at the top level and must match those prefix counts/hashes. This representation is lossless with the retained arrays, bounded per entry, and verifiable. No new history entry may contain another history array.

### 5. Requeue the historical sport backlog once, with provenance

Add `src/server/affiliateImports/affiliateSportReconciliation.ts` for pure eligibility, preview, and transactional apply behavior. Add `scripts/reconcile-affiliate-sport-review-backlog.ts` as its thin CLI and register `affiliate:mapping:sport-reconciliation` in `package.json`. Keep it separate from the generic rejected-package retry command.

Dry-run is the default. `--apply` performs a transaction per row; `--live` is required for production, with optional `--job=<id>`, `--limit=<n>`, and `--output=<json-path>`. Apply additionally requires `--expected-count=<n>` and `--expected-selection-sha256=<hash>` from a reviewed dry-run and refuses all writes if either differs. Selection is limited to `FAILED` or `HUMAN_REVIEW_REQUIRED` mapping jobs for which every present structured reason-code array is exactly `["SPORT_NOT_IN_CATALOG"]`, or for which no structured reason-code array exists and an allowlisted exact legacy error pattern identifies the same catalog rejection; whose intake still exists; whose `sourceId` and `mappingId` are both null; which have no active approval row; and whose intake has no other active mapping job. A second code in any structured array is an unconditional skip even if another field contains a matching legacy message. Never use a broad substring such as `ILIKE '%sport%'`. Terminal approval rows are allowed and remain untouched. The preview reports job/intake ids, stored source labels (or `sourceLabelsMissing: true`), current status, selection reason, current catalog hash, and the sorted terminal approval ids/statuses/decision hashes; package-bearing or active-approval-owned rows are explicitly skipped for the existing package-repair path.

The CLI output contract is `{ schemaVersion: 1, evaluatedAt, mode: 'DRY_RUN' | 'APPLY', catalogSha256, selectionSha256, eligibleCount, selectedCount, alreadyReconciledCount, skippedCounts, writeCount, rows }`. `selectionSha256` is `stableAgentArtifactSha256` over the catalog hash and the selected, job-id-sorted row inputs, including status, source labels, selection provenance, the `stableAgentArtifactSha256` of the complete prior result summary, and a deterministic hash of each sorted terminal approval's `id`, `status`, `reviewerId`, complete `decision` JSON hash, `errorMessage`, and `finishedAt`; it excludes the preview's `evaluatedAt`, mode, and apply outcomes. `alreadyReconciledCount` counts the revision marker across all job statuses, not only the current terminal selector. `eligibleCount` is computed before the limit, `rows` contains the selected cohort and each same-job requeue outcome, and `writeCount` counts successfully requeued rows rather than SQL statements; dry-run always reports zero. `--output` creates parent directories and writes this exact JSON in addition to the concise stdout summary.

Extract structured reasons only from `resultSummary.result.humanReviewRequired.reasonCodes`, `resultSummary.humanReviewRequired.reasonCodes`, `resultSummary.approvalReview.mappingDisposition.reasonCodes`, and `resultSummary.mappingRepairHistory[*].repairReasons`. Read source labels only from the corresponding `sourceSportLabels` fields and prior repair payloads. The legacy fallback may inspect only `job.errorMessage`, `resultSummary.errorMessage`, `resultSummary.result.errorMessage`, the two exact human-review `rationale`/`blockingIssues` locations, and `mappingRepairHistory[*].priorMappingErrorMessage`; it may match only anchored variants of the old validator messages “The sport … is not in the BracketIQ sports catalog” and “Unsupported source sports were preserved as evidence only”, and requires at least one stored source label. Keep those paths and patterns as exported constants with positive and false-positive tests. Select the whole eligible cohort by default up to a hard 5,000-row ceiling; refuse a larger cohort unless the operator supplies a positive `--limit` no greater than 5,000 and reviews each subsequent batch separately.

On apply, requeue the same terminal mapping job; do not create a second job, alter any terminal approval row, or alter package identity. In one transaction, re-read the exact terminal-approval-set hash from the preview, require that no active approval exists, and conditionally update the still-terminal, identity-less row to `QUEUED`; reset `attemptCount` to zero and `legacyIdentityMigrationEligible` to false; clear `claimedAt`, `leaseExpiresAt`, `workerId`, `branch`, `commit`, `errorMessage`, and `finishedAt`; set the intake to `READY_FOR_MAPPING`; archive the complete stale envelope with `archiveAffiliateMappingResultEnvelope`; preserve every existing top-level history array unchanged; and append `{ strategyRevision: 'sport-evidence-v1', queuedAt, priorStatus, priorErrorMessage, priorBranch, priorCommit, priorResultSummarySha256, terminalApprovalSetSha256, priorResultSummary: archivedPriorResultSummary }` to top-level `sportReconciliationHistory`. The archived prior summary omits all history arrays and carries their verified prefix counts/hashes, so the prior envelope remains fully auditable with the retained top-level histories but no history entry contains another history array. The replacement envelope has no current producer result and therefore cannot be mistaken for the new mapper result.

Each apply row reports `REQUEUED`, `SKIPPED_CONCURRENT`, `ALREADY_RECONCILED`, or `ERROR`. A status/active-job race is an expected skip; an unexpected error is recorded, the remaining independent rows may continue, the output file is still written, and the CLI exits nonzero. A rerun is safe because the same-job history marker and terminal-status predicate are checked transactionally.

The reconciliation command does not infer a sport from stored labels and does not write candidates. The normal claim/export/mapper/completion path performs the evidence-backed reassessment. This intentionally requeues both resolvable and genuinely unsupported historical rows once; the latter return to human review with the new explicit determination record.

No database migration is required: the catalog snapshot lives in the generated intake export, determinations live in the existing JSON result summary, and reconciliation provenance lives in the existing JSON repair history.

### 6. Verification and rollout

Add focused unit tests for catalog sorting/hash determinism, empty/duplicate rejection, determination/status/reason invariants, citation ownership, catalog drift, exact candidate/organization equality, and legacy result parse compatibility. Extend source export, mapper goal, package evidence, approval result/queue, human-review guidance, and mapping queue tests to cover the new fields and transitions.


Add `scripts/report-affiliate-sport-contract.ts` and package command `affiliate:mapping:sport-contract`. It imports the catalog, determination, shared claim-evidence service, guarded completion/CAS, live model-agent adapter, approval eligibility/application and supplemental-evidence services, coverage repair boundary, reviewer, and reconciliation modules; runs one pure representative contract fixture; and emits `{ schemaVersion: 1, contextContractVersion: 2, claimContractVersion: 1, completionCasVersion: 1, approvalResultVersion: 2, approvalCompletionCasVersion: 1, approvalEvidenceClaimVersion: 1, coverageRepairCasVersion: 1, standaloneLiveApplyEnabled: false, strategyRevision: 'sport-evidence-v1' }`. This is the fleet preflight: before restart, all thirteen Compose services and the digest-pinned model-controller image must run the command successfully. A missing module, surviving live-apply CLI, stale controller image, or lower contract version fails before any worker can claim work.

Add integration coverage that starts from a claimed intake with stored first-party evidence and proves:

- the same explicit outdoor soccer evidence emits `Grass Soccer` and reaches `REVIEW_REQUIRED` through both Codex and live model-agent adapters;
- a generic soccer source emits no package and reaches `HUMAN_REVIEW_REQUIRED` with `SPORT_VARIANT_UNRESOLVED`;
- an unsupported sport reaches human review with `SPORT_NOT_IN_CATALOG`, an all-blacklisted source reaches human review with `SPORT_BLACKLISTED`, and a non-sport review emits empty sport labels and no sport code;
- a mixed source can reach review with resolved supported sports while retaining a blacklisted determination as an explicit exclusion;
- a stale claim-time catalog and a stale claim generation are rejected before terminal state mutation;
- a reviewer disposition unsupported by persisted determinations, a stale domain-policy approval, stale supplemental logo evidence, and a standalone live-application attempt cannot mutate governed state;
- a same-agent coverage reclaim or concurrent mapping reclaim cannot create or requeue a mapping row, and lost coverage ownership cannot make manual evidence current; and
- the reconciliation command dry-runs deterministically, applies once, preserves history, and is idempotent.

Persist this approved plan as `docs/affiliate-sport-evidence-resolution-execplan.md` and keep its progress, discoveries, decisions, and outcomes current during implementation.

Add revision notes to `docs/affiliate-sport-catalog-validation-execplan.md`, `docs/add-team-sports-and-blacklist-execplan.md`, and `docs/affiliate-pipeline-reliability-execplan.md` explaining that exact-name validation now consumes an evidence-backed determination and injected live catalog while blacklist policy remains independent; no older plan may continue documenting the two-argument validator, compiled defaults, or discovery hints as live catalog authority. Update `docs/affiliate-source-mapping-slm-execplan.md` and `docs/affiliate-codex-luna-ingestion-goal-execplan.md` for the shared single-run claim service and version-2 catalog/determination worker contract. Update the executable mapper instructions in `docs/affiliate-source-rollout-agent-goal.md`, `.agents/skills/ingest-affiliate-intakes/SKILL.md`, and `.agents/skills/ingest-affiliate-intakes/references/completion-contract.md` for evidence-backed resolved, ambiguous-variant, unsupported, and blacklisted outcomes.

Update `docs/affiliate-luna-approval-agent-execplan.md`, `docs/affiliate-mapping-repair-and-logo-review-execplan.md`, and `docs/affiliate-producer-reviewer-handoff-execplan.md` where they describe the removed standalone live apply path: live execution now occurs only inside validated approval completion. Keep `.agents/skills/review-affiliate-approvals/SKILL.md` and its `references/approval-contract.md` aligned with the version-2 approval and human-resolution rules. Document the evidence display and human sport action in `docs/admin-affiliate-scrape-sources.md`; document reconciliation preview/apply/idempotency, the removed apply command, every queue-writer stop boundary, and the separate model-controller image cutover in `deploy/affiliate-agents/README.md` and `deploy/ai/README.md`.

## Milestones

### Milestone 1: A claimed job owns one catalog and one evidence run

Implement the catalog snapshot, exact intake/run export, claim-evidence service, immutable claim handle, and nonrecursive history helper. At the end, both live producer adapters can obtain a context only after the same job generation stores one selected run and one current catalog. The catalog and claim-evidence unit tests must pass, and a stale process must be unable to store, release, or complete against a reclaimed row.

### Milestone 2: Every producer emits evidence-backed determinations

Add the shared determination schemas and hashing, inject catalog names into every Codex and model-agent validation boundary, extend the mapper prompts and worker result, and remove runtime catalog authority from `DEFAULT_SPORTS`. At the end, explicit outdoor-soccer evidence resolves to `Grass Soccer`, generic soccer produces `VARIANT_UNRESOLVED`, and a name found only in compiled defaults fails. Prove both producer adapters with the focused integration fixtures.

### Milestone 3: Completion proves provenance and exact emitted sports

Refactor completion and `sportQuality.ts` to verify the live catalog, claimed run, stored bytes, textual excerpts or screenshot ownership, human decision coverage, disposable candidates, source organization, and emitted-sport union before the final mapping CAS. At the end, a valid package reaches `REVIEW_REQUIRED`; stale catalogs requeue for a fresh claim; wrong-run, stale-lease, tampered-citation, and extra-sport cases make no terminal write.

### Milestone 4: Review and human decisions are governed

Extend approval results to schema 2 with an approval claim generation, add reviewer evidence rules, bind domain-policy application and supplemental logo capture to that generation, make the admin sport decision route transactional, and move live package application behind approval completion. At the end, an administrator can resolve or confirm each evidence-backed row, an independent reviewer cannot invent a sport, and neither a stale approval result, a stale evidence capture, nor the removed standalone command can mutate governed state. Exercise the route and panel at desktop and narrow-mobile widths.

### Milestone 5: Historical false negatives are re-evaluated once

Implement the dry-run-first reconciliation selector and CLI. At the end, the preview explains every selected and skipped row without writes; guarded apply requeues only the exact reviewed cohort, retains hash-linked prior state, and a second apply writes nothing. Prove false-positive messages, package-owned rows, concurrent jobs, and count/hash mismatches remain untouched.

### Milestone 6: The whole fleet runs one contract

Update package commands, operational skills, older ExecPlans, admin documentation, and both deployment runbooks. Stop workers, merge the implementation into every mounted checkout without replacing producer history, cut over the digest-pinned model controller, run the exact contract command in all thirteen Compose services and the controller image, apply the reviewed reconciliation cohort, restart, and inspect representative outcomes. Completion of this milestone requires the focused suite, lint, type-check, whitespace check, reconciliation idempotency, browser workflow, and production monitoring described below.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`. Do not run a live command from a producer checkout until the fleet preflight in the validation section succeeds.

1. Add the catalog, determination, result-history, claim-evidence, live-application, and reconciliation modules named under `Interfaces and Dependencies`. Write their pure schema/hash/invariant tests first so later queue and UI code consume one contract rather than duplicating it.

2. Refactor `scripts/export-affiliate-source-intake.ts`, `src/server/affiliateImports/sourceIntakeExport.ts`, `scripts/claim-affiliate-source-mapping.ts`, and `src/server/affiliateImports/sourceMappingQueue.ts` to select an exact intake/run, store the catalog and claim handle, preserve all audit fields, and use claim-generation CAS for store, release, and completion. Update the loop and goal so a reservation made with `--no-export` cannot inspect evidence or finish.

3. Update the Codex result contract and `.agents/skills/ingest-affiliate-intakes/SKILL.md`. In the model-agent path, version context, worker, review, evaluation, gold, and training contracts to 2; pass the injected catalog through every executable validator; retain parse-only version-1 unions; and persist the full live worker envelope. Migrate every caller in the same change, with no default parameter or compatibility alias that restores `DEFAULT_SPORTS` as authority.

4. Refactor `src/server/affiliateImports/sportQuality.ts`, `scripts/report-affiliate-mapping-package-evidence.ts`, and `scripts/complete-affiliate-source-mapping.ts` to use the shared completion verifier and injected catalog. Make the final mapping mutation and intake mutation one transaction after one successful claim CAS.

5. Version `src/server/affiliateImports/approvalResult.ts` to schema 2 for new completions, update the approval goal and skill, bind domain-policy and supplemental-logo side effects to the exact approval generation, move live producer execution into `affiliateMappingLiveApplication.ts`, and delete the standalone apply script and package command. Make mapping and approval terminal state one final approval-generation CAS.

6. Add the authenticated admin decision service and route, then extend `AdminAffiliateMappingReviewPanel.tsx` without changing rows that have no sport determinations. Add focused server and component tests for selection, refresh, exclusion confirmation, stale data, authorization, evidence links, and audit preservation.

7. Add the reconciliation service, CLI, package command, and contract-report command. Make `coverageAgentQueue.ts` requeue mapping repairs only through exact coverage- and mapping-generation CAS. Keep reconciliation dry-run as the default and require both expected count and expected selection hash for apply. Add exact allowlist, false-positive, and concurrent-writer tests before any live preview.

8. Update every document and operational skill named in `Plan of Work`. In particular, remove all instructions that treat the deleted apply command or two-argument static sport validator as current authority.

9. Run the focused suite, lint, fleet contract, type-check, and whitespace commands under `Validation and Acceptance`. Fix failures at their source; do not weaken schemas, skip callers, or add fallbacks. Commit the validated implementation, land that exact commit on `main`, push it to `origin`, and wait for the push-triggered CI run for that commit to pass. Publish both the immutable `ghcr.io/camka14/mvp-site:<full-commit-sha>` application image and the digest-pinned model-controller image from that exact commit through protected workflows, then record the full 40-character commit and both image digests in `Artifacts and Notes` before touching either host.

10. Perform the two-host stopped-fleet production sequence exactly as written. Save both reconciliation JSON files, every checkout/controller contract result, the controller deployment-state evidence, and browser/queue observations. Keep workers stopped if any checkout or image reports a different contract or any preview row lacks the required source labels.

## Validation and Acceptance

### Behavioral acceptance

- Every claimed mapping job acquires a nonempty, deterministic current `Sports` snapshot before evidence inspection or generation. The selected intake run id and full validated catalog snapshot are persisted on the still-owned claim, and completion refuses a job without them.
- The Codex mapper and the former direct mapping-agent live path are retired.
  Governed Agent Gateway admission, claim, provider receipt, and terminal
  completion are the only live mapping workflow.
- Every terminal mapping update atomically matches the active job id, worker id, claim generation, and unexpired lease. A stale process—including the same worker id after reclaim—changes neither job nor intake.
- No live mapper path reads `DEFAULT_SPORTS` or treats discovery `sportHints` as canonical evidence.
- Every new sport-bearing completion requires the matching claim-time run id, claim/current catalog hash, and source-owned citations; a review-ready package additionally requires proof that the disposable candidate validator consumed that exact snapshot and that emitted sports equal the resolved determination union. Validation failure writes no terminal result: reparable output stays `CLAIMED`, while catalog drift alone uses the claim-generation CAS to return the job to `QUEUED` for a fresh claim.
- A review-ready package can contain only evidence-backed `RESOLVED` and explicitly excluded `BLACKLISTED` determinations, at least one resolved sport, exactly one source organization, candidate sports contained by that organization, and an emitted-sport union equal to the resolved determinations' exact current catalog names.
- Bare generic Soccer or Volleyball evidence cannot produce an arbitrary surface. It produces no package and one `HUMAN_REVIEW_REQUIRED` result with `SPORT_VARIANT_UNRESOLVED`.
- A genuinely unsupported evidenced activity produces no package and `SPORT_NOT_IN_CATALOG`; an all-blacklisted source produces no package and `SPORT_BLACKLISTED`; catalog drift produces `SPORT_CATALOG_MISMATCH` and returns to the producer, not the user.
- A non-sport human-review result can carry empty source-sport labels and no determinations without being mislabeled unsupported; sport-coded review remains strict.
- The admin queue can requeue a stale-catalog row without a product guess, submit one authenticated catalog-validated choice per unresolved/unsupported determination, or confirm an all-blacklisted exclusion set without overriding it. The next mapper and completion consume selected choices once, and every selection, refresh, exclusion confirmation, and prior envelope remains auditable.
- Live application is reachable only from a validated schema-version-2 approval completion bound to the exact approval claim generation. The standalone apply command is removed, both approve and non-approve sport dispositions are checked against the persisted result, and the mapping plus approval become terminal only in one final CAS; legacy/stale/tampered packages or approval results fail closed.
- Domain-policy application and supplemental logo capture require the same exact approval generation before their first side effect. A stale generation performs no policy mutation or network capture; a generation lost during capture cannot change `intake.lastRunId` or supply approval evidence.
- Every coverage path that can create or requeue a mapping job requires the immutable coverage claim generation. Manual evidence can become the intake's current run only while that generation still owns the coverage job; repair requeue additionally requires the exact mapping-row generation in one transaction. A concurrent reclaim writes no mapping or intake state.
- The backlog dry-run selects a structured row only when every present reason array is exactly `["SPORT_NOT_IN_CATALOG"]`, or an unstructured row only through an anchored allowlisted legacy message plus stored source labels. It reports why each row qualifies and performs no writes. Mixed-reason rows, package identities, and active approvals are skipped. Apply requeues each selected terminal job exactly once, losslessly preserves the complete prior envelope through its archived non-history fields plus retained top-level history arrays in `sportReconciliationHistory`, and carries that history through the new completion; reruns are idempotent.
- Existing schema-version-1 persisted mapper results remain parseable, but a legacy review-ready package without determinations cannot be newly approved and must re-enter producer repair. No Prisma schema change or migration is introduced.
- Every Compose worker checkout and the exact digest-pinned open-weight controller image emit the same fleet contract before queue processing resumes. A stale controller image or unproven controller deployment state blocks live requeue.

### Focused validation and rollout

Run every focused command from the repository root:

    cd /Users/elesesy/StudioProjects/mvp-site


Run the focused suite in one process:

    npx jest --runInBand \
      src/server/affiliateImports/__tests__/affiliateSportsCatalog.test.ts \
      src/server/affiliateImports/__tests__/affiliateSportDetermination.test.ts \
      src/server/affiliateImports/__tests__/affiliateMappingResultHistory.test.ts \
      src/server/affiliateImports/__tests__/affiliateSportReconciliation.test.ts \
      src/server/affiliateImports/__tests__/sourceMappingClaimEvidence.test.ts \
      src/server/affiliateImports/__tests__/affiliateMappingLiveApplication.test.ts \
      src/server/affiliateImports/__tests__/sourceIntakeExport.test.ts \
      src/server/affiliateImports/__tests__/sourceIntake.test.ts \
      src/server/affiliateImports/__tests__/sourceDiscovery.test.ts \
      src/server/affiliateImports/__tests__/affiliateSportMapping.test.ts \
      src/server/affiliateImports/__tests__/agentContracts.test.ts \
      src/server/affiliateImports/__tests__/agentJobContext.test.ts \
      src/server/affiliateImports/__tests__/agentModelClient.test.ts \
      src/server/affiliateImports/__tests__/agentRunner.test.ts \
      src/server/affiliateImports/__tests__/agentGenerator.test.ts \
      src/server/affiliateImports/__tests__/agentTooling.test.ts \
      src/server/affiliateImports/__tests__/agentReview.test.ts \
      src/server/affiliateImports/__tests__/agentEvaluation.test.ts \
      src/server/affiliateImports/__tests__/agentGoldDataset.test.ts \
      src/server/affiliateImports/__tests__/agentGoldMaterialization.test.ts \
      src/server/affiliateImports/__tests__/agentDataset.test.ts \
      src/server/affiliateImports/__tests__/agentTrainingRelease.test.ts \
      src/server/affiliateImports/__tests__/agentTrainingAcquisitionPlan.test.ts \
      src/server/affiliateImports/__tests__/codexIngestionResult.test.ts \
      src/server/affiliateImports/__tests__/sportQuality.test.ts \
      src/server/affiliateImports/__tests__/sourceMappingQueue.test.ts \
      src/server/affiliateImports/__tests__/sourceMappingHumanReview.test.ts \
      src/server/affiliateImports/__tests__/approvalResult.test.ts \
      src/server/affiliateImports/__tests__/approvalQueue.test.ts \
      src/server/affiliateImports/__tests__/approvalLogoEvidence.test.ts \
      src/server/affiliateImports/__tests__/coverageAgentQueue.test.ts \
      src/server/affiliateImports/__tests__/coverageAgentLoop.test.ts \
      src/server/affiliateImports/__tests__/codexCoverageGoal.test.ts \
      src/server/affiliateImports/__tests__/codexIngestionApproval.test.ts \
      src/server/affiliateImports/__tests__/mappingPackageRepair.test.ts \
      src/server/affiliateImports/__tests__/codexCliGoal.test.ts \
      src/server/affiliateImports/__tests__/codexApprovalGoal.test.ts \
      src/app/admin/__tests__/AdminAffiliateMappingReviewPanel.test.tsx \
      src/app/api/admin/affiliate-mapping-reviews/__tests__/route.test.ts \
      'src/app/api/admin/affiliate-mapping-reviews/[jobId]/sport-resolution/__tests__/route.test.ts'

Expect Jest to exit zero with every listed suite passing. Any updated snapshot, open handle, skipped suite, or test failure blocks rollout.

The new tests must include failure cases for a stale live catalog; a disposable `Sports` seed that lacks an otherwise valid injected name (and an assertion that it is never queried); a second live export or citation from the wrong run; a citation whose stored bytes or quoted excerpt do not match; duplicate/blank catalog names; a sport present only in compiled defaults; a sport present only in the injected snapshot; a blacklisted sport present in that snapshot; an executable draft without determinations; an emitted extra sport; unresolved/unsupported/blacklisted reason-code swaps; a non-sport human review with invented sport labels; an approval disposition unsupported by persisted determinations; an attempt to invoke standalone live application; an expired approval claim followed by same-reviewer re-claim, a mapping-result change during application, and an idempotent application retry; a stale domain-policy generation that never invokes the policy helper; a stale supplemental-evidence generation that performs no fetch or write; a same-reviewer reclaim during supplemental capture that cannot change `lastRunId`; a live model-agent attempt to bypass claim evidence or completion; an expired mapping claim followed by same-worker re-claim; a same-agent coverage reclaim, a concurrent mapping reclaim during coverage repair, and a coverage claim lost during manual evidence storage; an incomplete or tampered per-determination user resolution; an attempt to override an all-blacklisted source; a forged exclusion confirmation; an unauthorized resolution route call; an active approval present when a remapped package attempts completion; a terminal approval reset without its exact prior envelope in `approvalCycleHistory`; a history entry containing a nested history array or mismatched prefix hash; a false-positive legacy backlog message; a mixed structured reason array; an apply count/hash mismatch; a concurrent active-job insertion; and a second reconciliation apply.

Lint every changed TypeScript file, then type-check and check whitespace:

    npx eslint \
      src/server/affiliateImports/affiliateSportsCatalog.ts \
      src/server/affiliateImports/affiliateSportDetermination.ts \
      src/server/affiliateImports/affiliateMappingResultHistory.ts \
      src/server/affiliateImports/affiliateSportReconciliation.ts \
      src/server/affiliateImports/sourceMappingClaimEvidence.ts \
      src/server/affiliateImports/affiliateMappingLiveApplication.ts \
      src/server/affiliateImports/sourceIntakeExport.ts \
      src/server/affiliateImports/affiliateSportMapping.ts \
      src/server/affiliateImports/sourceIntake.ts \
      src/server/affiliateImports/sourceDiscovery.ts \
      src/server/affiliateImports/agentContracts.ts \
      src/server/affiliateImports/agentJobContext.ts \
      src/server/affiliateImports/agentModelClient.ts \
      src/server/affiliateImports/agentRunner.ts \
      src/server/affiliateImports/agentGenerator.ts \
      src/server/affiliateImports/agentTooling.ts \
      src/server/affiliateImports/agentReview.ts \
      src/server/affiliateImports/agentEvaluation.ts \
      src/server/affiliateImports/agentGoldDataset.ts \
      src/server/affiliateImports/agentGoldMaterialization.ts \
      src/server/affiliateImports/agentDataset.ts \
      src/server/affiliateImports/agentTrainingRelease.ts \
      src/server/affiliateImports/agentTrainingAcquisitionPlan.ts \
      src/server/affiliateImports/sourceMappingQueue.ts \
      src/server/affiliateImports/codexIngestionResult.ts \
      src/server/affiliateImports/sportQuality.ts \
      src/server/affiliateImports/codexCliGoal.ts \
      src/server/affiliateImports/codexApprovalGoal.ts \
      src/server/affiliateImports/approvalResult.ts \
      src/server/affiliateImports/approvalQueue.ts \
      src/server/affiliateImports/approvalLogoEvidence.ts \
      src/server/affiliateImports/coverageAgentContracts.ts \
      src/server/affiliateImports/coverageAgentQueue.ts \
      src/server/affiliateImports/coverageAgentLoop.ts \
      src/server/affiliateImports/codexCoverageGoal.ts \
      src/server/affiliateImports/codexIngestionApproval.ts \
      src/server/affiliateImports/mappingPackageRepair.ts \
      src/server/affiliateImports/sourceMappingHumanReview.ts \
      src/app/admin/AdminAffiliateMappingReviewPanel.tsx \
      src/app/api/admin/affiliate-mapping-reviews/route.ts \
      'src/app/api/admin/affiliate-mapping-reviews/[jobId]/sport-resolution/route.ts' \
      scripts/export-affiliate-source-intake.ts \
      scripts/claim-affiliate-source-mapping.ts \
      scripts/complete-affiliate-source-mapping.ts \
      scripts/run-affiliate-mapping-agent.ts \
      scripts/complete-affiliate-approval.ts \
      scripts/capture-affiliate-approval-logo-evidence.ts \
      scripts/claim-affiliate-coverage-agent-job.ts \
      scripts/complete-affiliate-coverage-agent-job.ts \
      scripts/run-affiliate-coverage-loop.ts \
      scripts/report-affiliate-mapping-package-evidence.ts \
      scripts/reconcile-affiliate-sport-review-backlog.ts \
      scripts/report-affiliate-sport-contract.ts \
      src/server/affiliateImports/__tests__/affiliateSportsCatalog.test.ts \
      src/server/affiliateImports/__tests__/affiliateSportDetermination.test.ts \
      src/server/affiliateImports/__tests__/affiliateMappingResultHistory.test.ts \
      src/server/affiliateImports/__tests__/affiliateSportReconciliation.test.ts \
      src/server/affiliateImports/__tests__/sourceMappingClaimEvidence.test.ts \
      src/server/affiliateImports/__tests__/affiliateMappingLiveApplication.test.ts \
      src/server/affiliateImports/__tests__/sourceIntakeExport.test.ts \
      src/server/affiliateImports/__tests__/affiliateSportMapping.test.ts \
      src/server/affiliateImports/__tests__/sourceIntake.test.ts \
      src/server/affiliateImports/__tests__/sourceDiscovery.test.ts \
      src/server/affiliateImports/__tests__/agentContracts.test.ts \
      src/server/affiliateImports/__tests__/agentJobContext.test.ts \
      src/server/affiliateImports/__tests__/agentModelClient.test.ts \
      src/server/affiliateImports/__tests__/agentRunner.test.ts \
      src/server/affiliateImports/__tests__/agentGenerator.test.ts \
      src/server/affiliateImports/__tests__/agentTooling.test.ts \
      src/server/affiliateImports/__tests__/agentReview.test.ts \
      src/server/affiliateImports/__tests__/agentEvaluation.test.ts \
      src/server/affiliateImports/__tests__/agentGoldDataset.test.ts \
      src/server/affiliateImports/__tests__/agentGoldMaterialization.test.ts \
      src/server/affiliateImports/__tests__/agentDataset.test.ts \
      src/server/affiliateImports/__tests__/agentTrainingRelease.test.ts \
      src/server/affiliateImports/__tests__/agentTrainingAcquisitionPlan.test.ts \
      src/server/affiliateImports/__tests__/codexIngestionResult.test.ts \
      src/server/affiliateImports/__tests__/sportQuality.test.ts \
      src/server/affiliateImports/__tests__/sourceMappingQueue.test.ts \
      src/server/affiliateImports/__tests__/sourceMappingHumanReview.test.ts \
      src/server/affiliateImports/__tests__/approvalResult.test.ts \
      src/server/affiliateImports/__tests__/approvalQueue.test.ts \
      src/server/affiliateImports/__tests__/approvalLogoEvidence.test.ts \
      src/server/affiliateImports/__tests__/coverageAgentQueue.test.ts \
      src/server/affiliateImports/__tests__/coverageAgentLoop.test.ts \
      src/server/affiliateImports/__tests__/codexCoverageGoal.test.ts \
      src/server/affiliateImports/__tests__/codexIngestionApproval.test.ts \
      src/server/affiliateImports/__tests__/mappingPackageRepair.test.ts \
      src/server/affiliateImports/__tests__/codexCliGoal.test.ts \
      src/server/affiliateImports/__tests__/codexApprovalGoal.test.ts \
      src/app/admin/__tests__/AdminAffiliateMappingReviewPanel.test.tsx \
      src/app/api/admin/affiliate-mapping-reviews/__tests__/route.test.ts \
      'src/app/api/admin/affiliate-mapping-reviews/[jobId]/sport-resolution/__tests__/route.test.ts'
    npm run affiliate:mapping:sport-contract
    npx tsc --noEmit
    git diff --check
    git diff --cached --check

Expect ESLint, TypeScript, `git diff --check`, and the staged `git diff --cached --check` to exit zero with no output other than normal command summaries. The contract command must emit the exact version object shown under `Artifacts and Notes`; any extra live-apply capability or lower contract version blocks rollout.


### Production smoke test

Run the host commands as `bracketiq` on `bracketiq-prod`. Replace the placeholder with the full implementation commit that already passed local validation and is reachable from `origin`.

The protected build must already have published both `ghcr.io/camka14/mvp-site:$IMPLEMENTATION_COMMIT` and a digest-pinned controller image built from that same commit. Before touching the database host, pause the separate model controller on its approved OVH host and record the host identity plus command output in `Artifacts and Notes`:

    sudo systemctl disable --now bracketiq-affiliate-controller.timer
    sudo systemctl stop bracketiq-affiliate-controller.service
    test "$(systemctl is-active bracketiq-affiliate-controller.timer || true)" = inactive
    test "$(systemctl is-active bracketiq-affiliate-controller.service || true)" = inactive

Do not continue until both the model controller and every database-host queue writer are inactive. If operations inventory proves that the optional OVH controller has never been provisioned, record `MODEL_CONTROLLER_NOT_DEPLOYED` instead; absence must be proven rather than assumed.

    cd /home/bracketiq/.config/bracketiq-affiliate-agents
    set -euo pipefail
    export IMPLEMENTATION_COMMIT=<full-40-character-implementation-commit>
    services='mapper-1 mapper-2 mapper-3 mapper-4 mapper-5 mapper-6 mapper-7 mapper-8 mapper-9 mapper-10 reviewer-1 reviewer-2 coverage'
    docker compose --env-file deployment.env -f compose.yml stop $services
    docker compose --env-file deployment.env -f compose.yml \
      run --rm --no-deps reviewer-1 \
      ./node_modules/.bin/tsx scripts/apply-approved-affiliate-mapping-jobs.ts --live

Before executing the remainder, require the legacy preview to report `approvable: 0`. This freezes a clean boundary: no package that already has a terminal approval is stranded when the old standalone command is deleted. If it is nonzero, keep every queue writer stopped and abort this rollout; do not invoke the old command with `--apply`, reinterpret an operator id as approval, or merge the new commit. Inspect and document the exact rows, then revise this ExecPlan with a claim-bound recovery path before a later rollout.


    checkouts='/home/bracketiq/mvp-site-codex-luna-test
    /home/bracketiq/mvp-site-codex-luna-worker-2
    /home/bracketiq/mvp-site-codex-luna-worker-3
    /home/bracketiq/mvp-site-codex-luna-worker-4
    /home/bracketiq/mvp-site-codex-luna-worker-5
    /home/bracketiq/mvp-site-codex-luna-worker-6
    /home/bracketiq/mvp-site-codex-luna-worker-7
    /home/bracketiq/mvp-site-codex-luna-worker-8
    /home/bracketiq/mvp-site-codex-luna-worker-9
    /home/bracketiq/mvp-site-codex-luna-worker-10
    /home/bracketiq/mvp-site-codex-approval-v2
    /home/bracketiq/mvp-site-codex-coverage'
    printf '%s\n' "$checkouts" | while IFS= read -r checkout; do
      test -n "$checkout" || continue
      test -z "$(git -C "$checkout" status --porcelain=v1)" || {
        printf 'dirty checkout: %s\n' "$checkout" >&2
        exit 1
      }
      git -C "$checkout" fetch origin
      git -C "$checkout" cat-file -e "$IMPLEMENTATION_COMMIT^{commit}"
      git -C "$checkout" merge --no-edit "$IMPLEMENTATION_COMMIT"
    done

    for service in $services; do
      docker compose --env-file deployment.env -f compose.yml \
        run --rm --no-deps "$service" npm run affiliate:mapping:sport-contract
    done

If any command fails, keep the services stopped. Do not use `git reset`, delete a branch, or replace a checkout to make the merge pass.

1. Stop all thirteen Compose queue writers plus the separate model controller. Preserve every current source-package commit, require each mounted checkout to be clean, fetch the deployed implementation commit, and merge that commit into all ten mapper checkouts, the shared reviewer checkout, and the coverage checkout; never reset, delete, or replace producer history.
2. Before any live mutation, require the Compose preflight above to return the exact contract—including `contextContractVersion: 2`, `completionCasVersion: 1`, `approvalResultVersion: 2`, `approvalCompletionCasVersion: 1`, `approvalEvidenceClaimVersion: 1`, `coverageRepairCasVersion: 1`, and `standaloneLiveApplyEnabled: false`—for every service. The local implementation checkout must already have returned the same object during focused validation, and `affiliate:mapping:apply-approved-live` must be absent from `package.json` in every mounted checkout.
3. Cut over the separate model controller while its timer remains disabled. On the approved OVH host, require `/opt/bracketiq-ai/repository` to be clean, fetch and fast-forward it to `IMPLEMENTATION_COMMIT`, update `CONTROLLER_BASE_COMMIT` and the digest-pinned `CONTROLLER_IMAGE` in the untracked `deploy/ai/deployment.env`, pull that image, and run the same contract command from the image:

       export IMPLEMENTATION_COMMIT=<same-full-40-character-implementation-commit>
       cd /opt/bracketiq-ai/repository
       test -z "$(git status --porcelain=v1)"
       git fetch origin
       git cat-file -e "$IMPLEMENTATION_COMMIT^{commit}"
       git merge --ff-only "$IMPLEMENTATION_COMMIT"
       cd deploy/ai
       docker compose --env-file deployment.env -f compose.yml pull controller
       docker compose --env-file deployment.env -f compose.yml \
         --profile controller run --rm --no-deps --entrypoint npm controller \
         run affiliate:mapping:sport-contract

Require the exact contract from step 2 and verify from resolved Compose configuration that `CONTROLLER_BASE_COMMIT` is the full implementation commit and `CONTROLLER_IMAGE` is the recorded digest, not a floating tag. If the controller is proven not deployed, retain the `MODEL_CONTROLLER_NOT_DEPLOYED` record and validate the published controller image with the same command in CI instead.
4. Deploy the same immutable commit to the production Next.js application so the authenticated API and admin UI exist before browser validation. The protected publish workflow and exact-commit CI must already have produced the image. This plan has no migration, so keep migrations disabled; the deploy script must report the new app healthy before continuing.

       cd /opt/bracketiq/deploy/vm
       RUN_MIGRATIONS=false ./bin/deploy.sh \
         ghcr.io/camka14/mvp-site:$IMPLEMENTATION_COMMIT
       cd /home/bracketiq/.config/bracketiq-affiliate-agents

5. Produce the live no-write preview through the reviewer checkout, then open `/home/bracketiq/mvp-site-codex-approval-v2/output/affiliate-sport-reconciliation/preview.json` and inspect `eligibleCount`, every selection reason, and `writeCount: 0`.

       docker compose --env-file deployment.env -f compose.yml \
         run --rm --no-deps reviewer-1 \
         npm run affiliate:mapping:sport-reconciliation -- \
         --live \
         --output=output/affiliate-sport-reconciliation/preview.json

6. Stop if any row has a non-sport selection reason or if a legacy-text fallback row lacks exact source labels. Otherwise substitute the reviewed `selectedCount` and `selectionSha256` from the saved preview and apply through the same checkout. Require a zero exit, `writeCount` equal to that batch's `selectedCount`, and no `ERROR` or `SKIPPED_CONCURRENT` outcome; a partial result requires a fresh preview after the cause is resolved. If a deliberate limit makes `selectedCount < eligibleCount`, save each later dry-run under a distinct filename, re-review it, and apply only its own count/hash; never reuse a prior batch hash.

       docker compose --env-file deployment.env -f compose.yml \
         run --rm --no-deps reviewer-1 \
         npm run affiliate:mapping:sport-reconciliation -- \
         --live --apply \
         --expected-count=<selectedCount> \
         --expected-selection-sha256=<selectionSha256> \
         --output=output/affiliate-sport-reconciliation/applied.json

7. Rerun the command from step 5. Require `eligibleCount: 0`, `alreadyReconciledCount` equal to the applied cohort, and `writeCount: 0`.

8. Obtain explicit operator authorization for the exact processors to resume; preflight all thirteen services, but never turn on coverage or model queue processing merely because it exists in Compose. If the model controller is deployed and separately approved for queue mode, keep the Codex services stopped, start its model and one-shot controller services manually, and require a clean one-job or no-work result before enabling its timer. For a selected job, inspect the emitted job id and require the normal claim-evidence and completion contracts in its stored result. A failure keeps all workers stopped. Then enable only the authorized timer and Compose service subset; if the controller is not deployed or not queue-authorized, leave its timer disabled. Monitor mapping and approval queues through the reviewer checkout. The requeued job ids in `applied.json` must progress without repeated generic retries; without authorization to run at least one mapper, leave the cohort queued and mark production acceptance incomplete.

       # On the approved model host, only when deployed and queue-authorized:
       sudo systemctl start bracketiq-affiliate-model.service
       sudo systemctl start bracketiq-affiliate-controller.service
       test "$(systemctl show -p Result --value bracketiq-affiliate-controller.service)" = success
       sudo systemctl enable --now bracketiq-affiliate-controller.timer

       # Back on bracketiq-prod:
       restart_services='<explicitly-authorized-space-separated-subset-of-services>'
       test -n "$restart_services"
       docker compose --env-file deployment.env -f compose.yml up -d $restart_services
       docker compose --env-file deployment.env -f compose.yml \
         run --rm --no-deps reviewer-1 \
         npm run affiliate:mapping:queue-status -- --live
       docker compose --env-file deployment.env -f compose.yml \
         run --rm --no-deps reviewer-1 \
         npm run affiliate:approvals:queue-status -- --live

9. Inspect at least one explicit-surface package, one generic-variant human-review result, and one unsupported result through the normal package-evidence/admin paths. Require each job's original terminal result to remain readable in `sportReconciliationHistory` after its new result completes.
10. Open the admin affiliate mapping-review panel in a real browser at desktop and narrow-mobile widths. Confirm unresolved and unsupported rows show readable determination evidence, working authenticated artifact links, stale-catalog refresh, and per-determination selectors without changing the existing agent/system row layout.
11. With an authenticated administrator, choose one evidence-reviewed generic-variant row, submit the governed selection, and monitor that same job through fresh claim and completion. Require the stored actor/rationale/prior envelope, exact `USER_DECISION` determination coverage, and no standalone approval mutation. If production has no appropriate row, exercise this action end to end against the focused local fixture and record that no production decision was made.
12. Confirm one all-blacklisted fixture through the authenticated admin action and require a persisted actor/rationale/policy check with no requeue, source creation, or mapping identity. Use production only if an appropriate row already exists; otherwise keep this check local.

## Idempotence and Recovery

The catalog builder, determination hashes, evidence verifier, and result-history helper are pure and deterministic for the same inputs. A claim-evidence write can be repeated only by the same job, worker, and `claimedAt`; a repeat in that generation returns the same selected run and snapshot. A newer generation archives the old context and captures a fresh one. Release and completion use the same handle, so an expired process cannot disturb a reclaim even when the stable worker id is reused.

A catalog mismatch never accepts a stale result. The completion adapter makes no terminal write and conditionally returns the job to `QUEUED`; a new claim exports the current catalog. Other repairable validation failures retain the active claim so the producer can correct its result. If a worker dies, the existing lease expiry makes the row claimable without manual deletion.

Admin refresh, selection, and exclusion confirmation re-read the terminal job inside a transaction and append hash-linked history. A selected decision remains `PENDING` through failed attempts and becomes `CONSUMED` only with a matching review-ready result. Repeating a stale request fails its status/hash predicate rather than appending twice.

Reconciliation is a dry-run unless `--apply` is present. Apply additionally requires the reviewed count and selection hash, rechecks every row under lock, inserts no second mapping job, and adds a strategy marker. A repeated apply reports `ALREADY_RECONCILED` and writes zero rows. Never use a broad substring query or hand-edit live JSON to recover a skipped row; correct the selector, save a new preview, and review its new hash.

Approval application extends the exact approval lease for a bounded interval, runs with a shorter child timeout, and is idempotent for the same package. Partial live rows remain unlisted, disabled, and unvalidated. They grant no approval. A retry reruns the same verified package; only the final transaction can mark both queues terminal.

Domain-policy application is idempotent for the same desired policy and result hash, but a changed or stale approval generation cannot call it. Supplemental capture may leave a failed, generation-tagged run and immutable artifacts after a claim is lost; it cannot make that run current or cite it in approval. A same-generation retry creates a new bounded run rather than rewriting evidence.

Coverage repair completion locks both ownership predicates. If either the coverage claim or mapping row changes, the transaction rolls back; the next coverage claimant can recompute the repair instead of inheriting a partial requeue.

There is no Prisma migration to roll back. During deployment, never reset or replace a producer checkout. If contract preflight or validation fails, leave every Compose worker and model-controller timer stopped, preserve the saved reconciliation preview and controller digest, fix the implementation, merge or rebuild the corrective commit in every checkout/image, and rerun both-host preflight before any apply or restart. Rollback means keeping queue processors disabled and redeploying a corrective immutable commit; it never means starting an old controller against new queue contracts.

## Artifacts and Notes

A successful claimed export contains `manifest.json`, `source-evidence.json`, the stored page/artifact files, `sports-catalog.json`, and `mapping-job-context.json` in one evidence directory. `manifest.json` contains the full catalog. `source-evidence.json` contains only `sportsCatalogSha256` because producers persist that compact object in source metadata. `mapping-job-context.json` binds the job id, worker id, `claimedAt`, intake id, evidence run id, catalog, and pending human decision.

The mapping job’s `resultSummary` retains `claimEvidenceContext`, `humanSportResolution`, `sportResolutionHistory`, `sportCatalogRefreshHistory`, `sportReconciliationHistory`, `approvalCycleHistory`, existing repair histories, and the current producer result. History entries contain non-history prior fields plus verified history-prefix counts and hashes; they never nest another history array.

The fleet contract command must print one JSON object with at least:

    {
      "schemaVersion": 1,
      "contextContractVersion": 2,
      "claimContractVersion": 1,
      "completionCasVersion": 1,
      "approvalResultVersion": 2,
      "approvalCompletionCasVersion": 1,
      "approvalEvidenceClaimVersion": 1,
      "coverageRepairCasVersion": 1,
      "standaloneLiveApplyEnabled": false,
      "strategyRevision": "sport-evidence-v1"
    }

The reconciliation preview and apply files contain `schemaVersion`, `evaluatedAt`, `mode`, `catalogSha256`, `selectionSha256`, `eligibleCount`, `selectedCount`, `alreadyReconciledCount`, `skippedCounts`, `writeCount`, and per-row reasons. The dry-run has `mode: "DRY_RUN"` and `writeCount: 0`. The immediate post-apply dry-run has `eligibleCount: 0`, the applied cohort in `alreadyReconciledCount`, and `writeCount: 0`.

No live identifiers or source labels are embedded in this planning revision. The 2026-08-10 read-only cutover query observed 601 `APPROVED` mapping-package approvals whose mapping jobs were also `APPROVED` and zero `APPROVED` approvals whose mapping jobs remained `REVIEW_REQUIRED`; this is not a substitute for the stopped-fleet preview. A separate read-only backlog query observed 423 pure structured `SPORT_NOT_IN_CATALOG` rows, 22 mixed-reason rows, and 523 failed rows without structured reasons. These are planning counts, not authorization to requeue: rollout must record the reviewed selector's exact `eligibleCount`, `selectedCount`, `selectionSha256`, controller deployment state/image digest, and post-apply values here and update `Progress`, `Surprises & Discoveries`, and `Outcomes & Retrospective`.

## Interfaces and Dependencies

Use the repository’s existing `zod`, Node `crypto`, Prisma client, `pg` client, `createId`, stored-artifact reader, HTML text parser, URL canonicalizer, policy constants, queue leases, and Razumly-admin authentication. Add no runtime dependency, browser framework, queue, database, or Prisma migration.

The following stable interfaces must exist after implementation. Exact database adapter types may follow existing repository conventions, but no call may make the catalog optional.

    type AffiliateSportsCatalogSnapshot = {
      schemaVersion: 1;
      capturedAt: string;
      sha256: string;
      sports: Array<{ id: string; name: string }>;
    };

    type AffiliateSourceMappingClaimHandle = {
      jobId: string;
      workerId: string;
      claimedAt: string;
    };

    type AffiliateSportDetermination = {
      sourceLabels: string[];
      status: 'RESOLVED' | 'VARIANT_UNRESOLVED' | 'UNSUPPORTED' | 'BLACKLISTED';
      resolutionBasis: 'SOURCE_EVIDENCE' | 'USER_DECISION';
      resolvedFromDeterminationSha256?: string;
      canonicalSportNames: string[];
      rationale: string;
      evidence: AffiliateSportCitation[];
    };

    type AffiliateHumanSportResolution = {
      schemaVersion: 1;
      state: 'PENDING' | 'CONSUMED';
      decidedAt: string;
      decidedByUserId: string;
      catalogSha256: string;
      priorResultSummarySha256: string;
      rationale: string;
      resolutions: Array<{
        determinationSha256: string;
        sourceLabels: string[];
        canonicalSportNames: string[];
      }>;
      consumedAt?: string;
      consumedDeterminationSha256s?: string[];
    };

    type AffiliateApprovalClaimGeneration = {
      approvalJobId: string;
      reviewerId: string;
      claimedAt: string;
    };

    type AffiliateCoverageClaimGeneration = {
      jobId: string;
      agentId: string;
      claimedAt: string;
    };


    buildAffiliateSportsCatalogSnapshot(rows, capturedAt): AffiliateSportsCatalogSnapshot
    loadAffiliateSportsCatalogSnapshot(queryable, capturedAt?): Promise<AffiliateSportsCatalogSnapshot>
    acquireAffiliateSourceMappingClaimEvidence(input, dependencies?): Promise<ClaimEvidenceResult | null>
    storeAffiliateSourceMappingClaimEvidenceContext({ claimHandle, context }, dependencies?): Promise<MappingJob>
    releaseAffiliateSourceMappingClaim({ claimHandle, reason }, dependencies?): Promise<MappingJob>
    verifyAffiliateSportCompletion(input, dependencies?): Promise<VerifiedSportCompletion>
    finishAffiliateSourceMappingClaim({ claimHandle, verifiedCompletion }, dependencies?): Promise<MappingJob>
    archiveAffiliateMappingResultEnvelope(envelope): ArchivedResultEnvelope
    resolveAffiliateMappingSportDecision(input, dependencies?): Promise<MappingJob>
    assertAffiliateMappingApprovalEligibility(input, dependencies?): Promise<ApprovalApplicationPermit>
    applyVerifiedAffiliateMappingPackage(permit, dependencies?): Promise<{ sourceId: string; mappingId: string }>
    completeAffiliateApproval(resultV2, dependencies?): Promise<ApprovalJob>
    captureAffiliateApprovalLogoEvidence(inputWithClaimGeneration, dependencies?): Promise<LogoEvidenceResult>
    completeAffiliateCoverageJob(resultWithClaimGeneration, dependencies?): Promise<CoverageJob>
    selectAffiliateSportReconciliationRows(input, dependencies?): Promise<ReconciliationPreview>
    applyAffiliateSportReconciliation(previewGuard, dependencies?): Promise<ReconciliationResult>

`affiliateSportDeterminationSchema`, `affiliateHumanSportResolutionSchema`, `affiliateSportsCatalogSnapshotSchema`, schema-version-2 worker/review contracts, and schema-version-2 approval results are strict Zod schemas. Persisted version-1 mapper, worker, review, training, and approval records remain parseable through explicit legacy unions but are never silently upgraded with current defaults or accepted as new approval authority.

### Primary implementation files

1. `src/server/affiliateImports/affiliateSportsCatalog.ts` — authoritative catalog loading, normalization, and stable snapshot hashing.
2. `src/server/affiliateImports/affiliateSportDetermination.ts` — determination/human-resolution invariants, citation ownership, catalog freshness, and resolved-name helpers.
3. `src/server/affiliateImports/affiliateSportMapping.ts` — injected-catalog validation for every Codex/model-agent draft boundary, with no `DEFAULT_SPORTS` authority.
4. `src/server/affiliateImports/sourceMappingClaimEvidence.ts` — one claim/export/context-store flow shared by Codex and model-agent workers.
5. `src/server/affiliateImports/sourceMappingQueue.ts` — claim-generation CAS, conditional evidence context, and audit-field preservation across completion.
6. `src/server/affiliateImports/affiliateMappingResultHistory.ts` — nonrecursive, hash-linked snapshots shared by every new JSON history writer.
7. `src/server/affiliateImports/affiliateMappingLiveApplication.ts` — internal, approval-gated producer commit execution and live postconditions; no standalone mutation CLI.
8. `src/server/affiliateImports/approvalQueue.ts` — approval-generation CAS, shared final eligibility, and persisted-determination checks for approve and non-approve decisions.
9. `src/server/affiliateImports/affiliateSportReconciliation.ts` — historical eligibility, dry-run output, transactional requeue, and idempotency.
10. `src/server/affiliateImports/approvalLogoEvidence.ts` — claim-generation-bound supplemental capture and final evidence admission.
11. `src/server/affiliateImports/coverageAgentQueue.ts` — coverage claim CAS and race-safe mapping-repair requeue.

The exporter, claim/completion/report/model-agent/coverage CLIs, `agentJobContext.ts`, `codexIngestionApproval.ts`, `sportQuality.ts`, coverage contracts/goal/loop, mapper/reviewer goals and skills, approval/admin routes, human-review UI, package scripts, `deploy/affiliate-agents/README.md`, `deploy/ai/README.md`, and focused tests are supporting call sites enumerated in the approach above.

Revision note (2026-08-10): Created and independently reviewed this ExecPlan against the repository's current mapper, model-agent, reviewer, approval, artifact, admin, and deployment contracts. The plan rejects static sport defaults and discovery hints as authority; adds a claim-time catalog snapshot, evidence-backed multi-sport determinations, actionable human resolution, claim-generation CAS, approval-only live application, and an idempotent historical repair queue; and introduces no Prisma migration.

Revision note (2026-08-10): Reorganized the independently reviewed design into the repository’s required ExecPlan structure, defined milestones, recovery behavior, artifacts, and stable interfaces, replaced nested Markdown fences with indented examples, and made approval claim generations plus nonrecursive audit history explicit.
