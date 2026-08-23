# Implement evidence-derived affiliate supply lifecycle and replenishment

This ExecPlan is a living document. Keep the `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections current during the work.

Maintain this document in accordance with `PLANS.md` at the repository root. Run site commands from `apps/site`.

## Purpose / Big Picture

After this change, affiliate supply has one durable identity and one evidence-derived lifecycle. A source cannot become public or enable recurring imports because a job status says that work is complete. A lifecycle command checks the active Supply Contract, rebuilds the current assessment from stored evidence, writes all related state in one transaction, and records an immutable attributable transition. Fresh Published Supply is the only supply that satisfies a Supply Target.

After this change, the pipeline can pull work from downstream need. A fifteen-minute reconciliation computes mapping and review buffers, pauses admission when review capacity or reviewer health is unsafe, opens and prioritizes Replenishment Demand for unmet fresh supply, and runs at most one bounded campaign wave before it reconciles again. The controller is deterministic and idempotent.

The change is visible through focused unit tests for lifecycle matrices, immutable command behavior, contract activation impact, identity successors, and replenishment scenarios. PostgreSQL integration tests prove generation compare-and-set, atomic rollback, immutable transitions, active-contract uniqueness, and durable demand state.

## Progress

- [x] (2026-08-22 19:32Z) Read issue #68, issue #67, the parent specification, repository rules, ADRs 0005–0007, the existing gateway contracts, current affiliate intake, mapping, scrape, publication, and coverage modules, and the test commands.
- [x] (2026-08-22 19:32Z) Claimed issue #68 and set the BracketIQ project item to `In progress` on the current workstream branch.
- [x] Add the durable Supply Source, Supply Contract manifest, lifecycle transition, target, Replenishment Demand, and wave persistence models and migration.
- [x] Add pure contract parsing, identity normalization, lifecycle assessment, transition planning, contract impact reporting, and replenishment planning.
- [x] Add the Prisma-backed lifecycle command authority and reconciliation controller. Keep the gateway as the authority seam for agent execution.
- [x] Link existing intake, capture, mapping, source, mapping, run, candidate, and target records to Supply Source identities without fabricating legacy approval or scrape evidence.
- [x] Add focused unit coverage for reachable lifecycle and replenishment scenarios.
- [x] Run typechecking and focused tests during implementation.
- [ ] Add PostgreSQL integration coverage for all reachable issue acceptance scenarios.
- [ ] Run the full site suite once after implementation and review.
- [ ] Run the two-axis code review against the issue specification and address every finding.
- [ ] Commit the completed issue on the current branch.

## Surprises & Discoveries

- Observation: Issue #67 already provides a typed `AffiliateAgentLifecycleAuthority` seam, but it intentionally leaves lifecycle derivation unavailable.
  Evidence: `apps/site/src/server/affiliateImports/agentGatewayAdapters.ts` accepts `currentGeneration`, `resolveRecordedCommand`, `execute`, and `recover`; production construction defaults to `UNAVAILABLE`.

- Observation: Existing affiliate records store lifecycle hints in mutable status fields and JSON metadata, with no Supply Source root or immutable transition table.
  Evidence: `AffiliateScrapeSources`, `AffiliateScrapeMappings`, `AffiliateScrapeRuns`, `AffiliateSourceIntakes`, `AffiliateSourceMappingJobs`, `AffiliateImportCandidates`, and `AffiliateApprovalJobs` have no shared lifecycle identity.

- Observation: Existing URL canonicalization removes fragments, default ports, tracking parameters, and trailing slashes, but it does not record whether a canonical redirect was machine verified or whether a redirect changed origin.
  Evidence: `sourceIntakeUrlSafety.ts` exports `canonicalizeAffiliateIntakeUrl` and `affiliateIntakeUrlKey`; the new identity seam must add redirect evidence instead of changing the existing helper's behavior.

- Observation: The current declarative agent mapping package has no empty-state declaration.
  Evidence: `agentGatewayContracts.ts` defines listing kind, selectors, fields, and evidence references only. The lifecycle package extension will be optional so existing package hashes remain valid.

- Observation: A fresh issue-isolated PostgreSQL database could not reach the lifecycle migration because the existing `20260821070000_repair_document_evidence_and_version_guards` migration references `_document_evidence_repair` after its temporary table is unavailable.
  Evidence: `npm run migrate:deploy` against `bracketiq_e2e_68_main` failed with PostgreSQL `42P01` before `20260822120000_add_affiliate_supply_lifecycle`; PostgreSQL integration coverage remains unrun.

## Decision Log

- Decision: Add one new `affiliateSupplyLifecycle.ts` module for pure lifecycle types, evidence normalization, assessment derivation, command preconditions, identity normalization, and replenishment planning.
  Rationale: Pure decisions must be testable without Prisma, clocks, provider clients, or network access. This prevents business state from leaking back into job status code.
  Date/Author: 2026-08-22 / Codex

- Decision: Add one Prisma-backed `prismaAffiliateSupplyLifecycle.ts` module for transactions, generation compare-and-set, immutable transitions, Supply Contract activation, target refresh, and demand reconciliation.
  Rationale: The gateway already separates pure contracts from transactional authority. Keeping persistence in one module gives every lifecycle command one atomic seam and leaves existing provider-specific mapping code usable as an injected effect.
  Date/Author: 2026-08-22 / Codex

- Decision: Store immutable Supply Contract manifests as canonical JSON with component versions and hashes, plus one partial unique active index per rollout cohort.
  Rationale: The existing gateway contract already defines six independently hashed components. Persisting the exact parsed contract preserves historical decisions and lets activation report impact before changing the active manifest.
  Date/Author: 2026-08-22 / Codex

- Decision: Store lifecycle stage and contribution as rebuildable projections on the Supply Source, while transition rows remain the immutable history.
  Rationale: Queue and dashboard queries need efficient current values, but no projection may authorize a write. Commands rebuild evidence in the same transaction before they update the projection.
  Date/Author: 2026-08-22 / Codex

- Decision: Use `PRE_MAPPED`, `MAPPED`, `APPROVED`, `ACTIVATED`, and `PUBLISHED` as machine stage values, with separate outcome codes for `SOURCE_EXCLUDED`, `HUMAN_REVIEW_REQUIRED`, `TARGET_REJECTED`, `AUTOMATION_HOLD`, and repair outcomes.
  Rationale: Exclusion, review, rejection, and holds are not ordinary forward stages. Separate outcome codes preserve the lifecycle matrix and keep source exclusion from hiding existing targets.
  Date/Author: 2026-08-22 / Codex

- Decision: Keep existing public target rows unchanged during lifecycle assessment. Link them through new Supply Target evidence rows and mark stale rows as Last-Known-Good rather than deleting or unpublishing them.
  Rationale: The issue and parent specification require legacy content preservation and zero Target contribution for stale content.
  Date/Author: 2026-08-22 / Codex

- Decision: Use the active contract's target, freshness, and search component payloads as the only inputs to demand priority and eligibility. Provider failures are explicit retry outcomes and never zero Marginal Yield.
  Rationale: Queue completion and raw provider result counts are not product outcomes. Contract-driven inputs make reconciliation deterministic and auditable.

- Decision: Route supply-backed manual target publication through the lifecycle command seam.
  Rationale: Publication must validate the active contract, generation, evidence, authority, and stage before it writes the domain target. The target writer runs inside the lifecycle transaction and the command records the resulting target evidence and transition.
  Date/Author: 2026-08-22 / Codex

- Decision: Keep verified same-origin canonical redirects on the existing root and revalidate them.
  Rationale: The issue requires generation increment and revalidation for same-origin canonical changes. Cross-origin or operator-domain changes use the existing successor path without transferring approval or automation.
  Date/Author: 2026-08-22 / Codex

- Decision: Keep replenishment provider execution behind the injected bounded-wave callback.
  Rationale: The issue assigns provider-specific mapping content to deterministic injected code. The existing #67 gateway remains the authority seam for agent lifecycle commands and is not copied into provider-specific mapping code.
  Date/Author: 2026-08-22 / Codex
  Date/Author: 2026-08-22 / Codex

## Outcomes & Retrospective

Implementation is not complete. Add an entry here after each major milestone and at completion. The final entry must compare the delivered behavior with every issue acceptance criterion and name any criterion deferred to issue #70 or #69.

## Context and Orientation

`apps/site` is the backend source of truth. Prisma schema changes live in `apps/site/prisma/schema.prisma` and one timestamped directory under `apps/site/prisma/migrations`. The existing affiliate models are near the end of the schema: intake and capture records, live scrape sources and mappings, scrape runs, discovery records, Mapping Jobs, approval jobs, and import candidates are all separate records with string IDs and limited relation declarations.

`apps/site/src/server/affiliateImports/agentGatewayContracts.ts` defines the machine-readable Supply Contract used by issue #67. It has six independently versioned and hashed components: coverage applicability, search strategies, supply targets and market tiers, freshness, mapping evidence, and lifecycle evidence. `agentGatewayAdapters.ts` defines the lifecycle authority interface. `prismaAgentGateway.ts` calls that interface only after gateway authorization and receipt reservation.

`apps/site/src/server/affiliateImports/sourceIntake.ts` creates and captures intake evidence. `sourceMappingQueue.ts` claims and completes Mapping Jobs. `service.ts` creates live sources, scrapes mappings, creates candidates, and publishes Events, Facilities, Teams, or Organizations. `automationBaseline.ts` computes the reviewed mapping baseline and drift reasons. `scheduledScrapes.ts` currently selects due sources by interval. The new reconciliation controller must be additive and must not use those mutable statuses as lifecycle authority.

A Supply Source is one evidence-backed official public source path. The root stores the canonical identity, current lifecycle generation, active contract snapshot, and rebuildable assessment projection. Existing records receive an optional Supply Source ID. An intake can produce child roots; a normalized same-origin canonical change stays on one root; an origin or operator change creates a successor and does not transfer approval or automation.

A lifecycle assessment is a pure result. It includes the derived stage, freshness status, Target contribution, repair priority, automation state, holds, reason codes, evidence references, and invariant violations. A lifecycle command accepts an expected generation and an idempotency key. It rechecks the active contract and evidence, writes related records atomically, increments the generation once, and appends one immutable transition.

Replenishment Demand is one durable deficit for one contract target. It remains open until that exact contract target is restored. A wave is one bounded discovery or coverage attempt attached to that demand. Reconciliation may retain valid overshoot, but it must not start another wave before the current wave becomes terminal or materializes Mapping Jobs.

## Plan of Work

First, add the persistence vocabulary. Add machine enums or constrained text fields for lifecycle stages, lifecycle outcomes, contract manifest statuses, target statuses, demand statuses, and wave statuses. Add `AffiliateSupplySources`, `AffiliateSupplyContractManifests`, `AffiliateSupplyLifecycleTransitions`, `AffiliateSupplyTargets`, `AffiliateReplenishmentDemands`, and `AffiliateReplenishmentWaves`. Add optional `supplySourceId` and source identity fields to existing intake, capture, mapping, source, mapping, run, and candidate records where direct traceability is required. Add partial unique indexes for one active contract per rollout cohort and one open demand per target and contract generation. Add database checks for nonnegative generations and immutable transition identity. Do not delete or rewrite public target rows.

Next, extend the declarative mapping package with an optional, validated public empty-state condition. Keep the field absent by default so the current package fixtures and hashes remain unchanged. Add a pure `affiliateSupplyContractManifestSchema` wrapper that validates a complete existing Supply Contract plus rollout cohort and compatible component references. Add canonical hashing helpers for identity keys, evidence references, command requests, and results.

Then implement pure lifecycle assessment. Normalize source URLs and compare verified redirect evidence. Resolve the stage from source, intake, mapping package, approval decision, baseline, scrape outcome, target evidence, and holds. Detect impossible roots, mismatched source or mapping IDs, invalid baselines, missing required lifecycle evidence, stale freshness, unexplained zero results, drift, source exclusions, exact target rejection, and successor boundaries. Return a stable sorted evidence and reason-code list. Derive Fresh Published Supply only when the source is activated, automatic refresh is enabled, at least one exact target is currently valid, the latest successful refresh is within the active freshness window, and no hold or exclusion applies.

Implement pure lifecycle command validation and replenishment planning. Commands include root creation or resolution, mapping completion, approval, activation, successful refresh, empty refresh, failed refresh, source exclusion, exact target rejection, successor creation, and reconciliation. Each command has explicit authority and preconditions. The planning function computes waiting Mapping and Review buffers, applies review backpressure and missing-reviewer pauses, orders demands by restore/repair/activation/captured/new-discovery priority, honors Search Saturation dates, and returns at most one wave admission per reconciliation.

Add the Prisma authority. Use one serializable transaction per lifecycle command. Lock or compare-and-set the Supply Source by ID and expected generation. Load all related evidence in the transaction. Call the pure assessment. Reject stale generations and changed active contracts before any write. Apply only the command-specific writes, then update the projection and append one transition with actor, executing agent, hashes, reason codes, and evidence references. On a repeated idempotency key, return the original result only when the canonical request hash matches. Never mutate a transition row. Use the same authority to implement the gateway's `AffiliateAgentLifecycleAuthority`, including recoverable receipt execution.

Add contract activation and impact reporting. Validate a draft manifest, compute impacted rollout cohorts and Supply Sources, count stage regressions, newly due searches, repair work, automation stops, and Target Met changes, and return the report without changing active state. Require an explicit human activation call. Activate one manifest per cohort in a transaction and retire the prior active manifest only after the new manifest is valid.

Add identity linking and refresh integration. Provide an `ensureAffiliateSupplySource` function that resolves canonical query and fragment variants to the existing root, increments generation only for a verified same-origin canonical change, and creates a successor for cross-origin or operator-domain changes. Link intake, capture, Mapping Job, live source, mapping, run, candidate, and target writes when their source identity is known. Add a reconciliation function that links existing records only when durable evidence proves the relationship; otherwise leave the record Last-Known-Good or unresolved and record an invariant instead of inventing approval or scrape success.

Add demand persistence and the fifteen-minute controller. Reconcile open demands from fresh target contribution, reconcile active waves and orphan claims, compute waiting buffers from healthy worker capacity, pause admission at review limit or missing reviewer, select the highest-priority eligible demand, reuse an eligible campaign or create one Coverage Planning Job, and run one bounded wave through injected provider code. Store the wave result and demand linkage atomically. Provider errors record retryable provider failure and keep Marginal Yield unknown. A dry-run returns the same decisions without writes. A repeated reconciliation with no evidence change produces no new transition, demand, or wave.

Finally, add focused tests. Pure tests cover the lifecycle transition matrix, assessment invariants, freshness, empty state, zero-result failure, source identity and successor behavior, target rejection, contract impact, demand priority, backpressure, overshoot, provider failure, and Search Saturation. Prisma integration tests cover active contract uniqueness, generation races, idempotent replay, rollback after failed activation, immutable transitions, exact target rejection, demand closure, and dry-run idempotency. Add a stopped-fleet reconciliation dry-run fixture that preserves existing public target IDs and marks unverifiable targets Last-Known-Good without fabricating history.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/bracketiq-affiliate-collection/apps/site`.

1. Add the Prisma models and migration. Run `npm run prisma:validate` and `npm run prisma:generate`. The schema must validate and the generated client must expose every new model.
2. Add the pure lifecycle and replenishment tests first. Run `npx jest src/server/affiliateImports/__tests__/affiliateSupplyLifecycle.test.ts --runInBand` and observe the expected red assertions before implementation.
3. Implement pure contracts and assessment. Rerun the focused file until it passes. Run `npx tsc --noEmit` after each stable interface change.
4. Add the Prisma authority and integration fixtures. Set a dedicated test `DATABASE_URL` before applying migrations. Run `npm run migrate:deploy`, then `npx prisma migrate status`; proceed only when no migrations are pending.
5. Run `npx jest src/server/affiliateImports/__tests__/affiliateSupplyLifecycle.database.integration.test.ts --runInBand` and observe generation, rollback, idempotency, and immutable-transition assertions.
6. Run all changed affiliate files with one focused command, then run `npx tsc --noEmit` again. Do not run multiple Jest suites concurrently.
7. Run `npm run test:ci` once at the end from `apps/site`. Expect the full Jest suite and route coverage to pass. If an unrelated generated-value test fails, rerun its file alone and record the evidence in this plan.
8. Run the two-axis code review against the fixed branch base and issue #68. Address all findings, rerun affected checks, update this plan, and commit the final changes.

## Validation and Acceptance

A pure assessment with a valid mapped package and no independent approval returns `MAPPED`. The same evidence with an approved independent decision returns `APPROVED`. Approval alone never enables recurring imports or publishes a target. Activation fails and rolls back when package validation or reviewed target publication fails. A successful activation with one reviewed valid target returns `PUBLISHED` and enables automation only after the target and mapping validation writes succeed.

A successful refresh that produces current targets returns `PUBLISHED` and contributes those targets to the active contract target. Natural target expiry returns `ACTIVATED`, keeps automation enabled, and contributes zero. A declared and evidence-matched public empty state returns `ACTIVATED` with a valid empty refresh. An unexplained zero, provider failure, parse failure, inaccessible page, baseline mismatch, or mapping drift returns `APPROVED`, disables automation, and records repair evidence. Source Exclusion contributes zero without changing existing target visibility. Exact Published Target Rejection changes only that target.

Equivalent URL query and fragment forms resolve to one root. A machine-verified same-origin canonical redirect keeps the root and increments lifecycle generation. A cross-origin or operator-domain change creates a linked successor with no transferred approval or automation. Every linked intake, capture, Mapping Job, source, mapping, run, candidate, and target can be followed to one root or an explicit predecessor/successor link.

Two concurrent commands for one generation produce one transition; the loser returns a stale-generation error. Replaying the same idempotency key and request returns the original assessment without a second transition. Reusing the key with another request is rejected. An activation failure leaves no partial Organization, mapping, target, automation, or transition write.

A reconciliation with two active producers targets four waiting Mapping Jobs, and a reconciliation with two healthy reviewers targets four waiting Review Jobs. Active claims do not consume waiting slots. A review limit or missing reviewer pauses new Mapping claims and campaign replenishment. Valid overshoot stays in the queue. A provider failure follows its retry schedule and does not create zero Marginal Yield. Search Saturation blocks a demand until its earliest eligibility date. An open demand closes only when the same active contract target reaches its fresh minimum.

The full proof is the focused unit and integration output plus the final `npm run test:ci` output. The code review must report no unresolved standards or specification findings.

## Idempotence and Recovery

All command and reconciliation writes use explicit idempotency keys and canonical request hashes. Retrying after a transaction conflict is safe because the command rechecks generation and the unique transition key. A lost gateway lifecycle response is recovered by the existing operation receipt and the lifecycle authority's `recover` method; it never executes the same receipt twice. A lost replenishment response leaves the wave active and is reconciled from durable wave and provider operation keys.

Legacy reconciliation is dry-run by default. It links only records with exact durable source evidence. It does not create historical approval, baseline, successful scrape, or lifecycle transition rows. Existing public target records are never deleted. Raw artifacts may be retained or cleaned by their existing retention process, but decision-referenced evidence remains pinned through the new evidence references.

## Artifacts and Notes

The expected artifacts are:

    plans/affiliate-supply-lifecycle-execplan.md
    apps/site/src/server/affiliateImports/affiliateSupplyLifecycle.ts
    apps/site/src/server/affiliateImports/prismaAffiliateSupplyLifecycle.ts
    apps/site/src/server/affiliateImports/__tests__/affiliateSupplyLifecycle.test.ts
    apps/site/src/server/affiliateImports/__tests__/affiliateSupplyLifecycle.database.integration.test.ts
    apps/site/prisma/schema.prisma
    apps/site/prisma/migrations/<timestamp>_add_affiliate_supply_lifecycle/migration.sql

Keep test output concise in this plan. Record only lines that prove a gate passed or failed.

## Interfaces and Dependencies

The pure module must export stage, outcome, contract, assessment, command, and replenishment types. Its main declarations are:

    deriveAffiliateSupplyAssessment(input: AffiliateSupplyEvidenceSnapshot): AffiliateSupplyAssessment
    validateAffiliateSupplyCommand(input: AffiliateSupplyCommandInput): AffiliateSupplyCommandDecision
    normalizeAffiliateSupplyIdentity(input: AffiliateSupplyIdentityInput): AffiliateSupplyIdentity
    buildAffiliateSupplyContractImpactReport(input: AffiliateSupplyContractImpactInput): AffiliateSupplyContractImpactReport
    planAffiliateReplenishment(input: AffiliateReplenishmentPlanningInput): AffiliateReplenishmentPlan

The Prisma module must export:

    createPrismaAffiliateSupplyLifecycleAuthority(input?: { db?: unknown; clock?: AffiliateSupplyClock }): AffiliateSupplyLifecycleAuthority
    ensureAffiliateSupplySource(input: EnsureAffiliateSupplySourceInput): Promise<AffiliateSupplySourceRecord>
    executeAffiliateSupplyLifecycleCommand(input: ExecuteAffiliateSupplyLifecycleCommandInput): Promise<AffiliateSupplyLifecycleCommandResult>
    activateAffiliateSupplyContract(input: ActivateAffiliateSupplyContractInput): Promise<AffiliateSupplyContractImpactReport>
    reconcileAffiliateReplenishment(input?: ReconcileAffiliateReplenishmentInput): Promise<AffiliateReplenishmentReconciliationResult>

Use the existing `AffiliateAgentLifecycleAuthority` shape from `agentGatewayAdapters.ts` for the gateway adapter. Use the existing Prisma singleton from `src/lib/prisma.ts` by default. Inject `db`, clock, provider, and gateway dependencies in tests. Do not import Prisma or runtime services into the pure module.

Plan revision note (2026-08-22): Created this plan after reading issue #68, the parent specification, blocker issue #67, repository guidance, current affiliate persistence and queue modules, and the existing gateway lifecycle seam. The plan records the initial implementation boundary and will be updated with evidence as each milestone changes.