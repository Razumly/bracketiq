# Migrate the affiliate fleet with stopped-fleet reconciliation and rollback

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must remain current. Follow the repository rules in `AGENTS.md` and the format rules in `PLANS.md`.

## Purpose / Big Picture

After this change, an operator can produce a deterministic, read-only reconciliation report for the old affiliate fleet, review every source and public target, and apply that exact report through one guarded transaction. The report preserves public targets, records missing lineage and duplicate authority as blocking findings, and records only observed legacy evidence. A cutover preflight checks the active Supply Contract, deployment hashes, expected five-supervisor topology, stopped legacy processes, container boundaries, and live claims before any apply.

The implementation does not start or stop a production process. The repository provides the checks, report persistence, guarded apply path, deployment manifest, and rollback decision model. An operator can exercise the safe path against a production-like database with the site scripts.

## Progress

- [x] (2026-08-25) Read issue #70, comments on issues #67–#69, repository rules, the gateway, lifecycle, control-room, deployment, schema, and test conventions.
- [x] (2026-08-25) Chose a pure report seam before persistence edits. The report hash excludes evaluation time and generated IDs.
- [x] (2026-08-25) Add pure legacy reconciliation and cutover preflight contracts with red tests.
- [x] (2026-08-25) Add durable reconciliation-run persistence and the guarded dry-run/apply workflow.
- [x] (2026-08-25) Add operator scripts and the governed five-supervisor deployment manifest.
- [x] (2026-08-25) Run focused checks and the full site suite.
- [x] (2026-08-25 20:45Z) Include affiliate-backed Organization, Event, Team, and Facility rows in the stopped-fleet inventory and Last-Known-Good target projection.
- [x] (2026-08-25 21:07Z) Bind APPLY to a complete, hash-checked preflight report and the active Supply Contract. Normalize the governed Compose security anchor.
- [ ] Run the two-axis code review and commit the completed issue slice.

## Surprises & Discoveries

- Observation: Issue #68 already exposes `reconcileLegacyAffiliateSupply`, but it is dry-run-only and inspects only unlinked live scrape sources, candidates, and targets.
  Evidence: `apps/site/src/server/affiliateImports/affiliateSupplyPersistence.ts` currently rejects `dryRun: false` and returns no input/output hash, claim inventory, record counts, or durable report.

- Observation: The old deployment still defines ten mapper services and invokes Goal-loop scripts.
  Evidence: `apps/site/deploy/affiliate-agents/compose.yml` defines `mapper-1` through `mapper-10` and uses `affiliate:intakes:codex-loop`; the new governed manifest must not use those commands.

- Observation: Gateway and lifecycle tests already prove most invocation, retry, stale-generation, provider, and idempotent replay behavior.
  Evidence: `apps/site/src/server/affiliateImports/__tests__/agentGateway.test.ts`, `agentGateway.database.integration.test.ts`, and `agentSupervisor.test.ts` cover those seams. Issue #70 adds the cutover-level inventory and reconciliation gates rather than duplicating gateway authority logic.

## Decision Log

- Decision: Keep the old deployment files as explicitly paused legacy artifacts until the governed cohort is proven, and add a separate governed deployment manifest.
  Rationale: Issue #70 requires legacy removal only after a clean cohort. Deleting the old files before that proof would remove the safe rollback reference and violate the forward-only boundary.
  Date/Author: 2026-08-25 / Codex.

- Decision: Use `DRY_RUN` by default. Require an operator ID, exact report hash, reviewed counts, a clean preflight, and an apply nonce for `APPLY`.
  Rationale: A boolean live switch is too easy to use against a changed database snapshot. The exact report and preflight bind the apply to reviewed evidence.
  Date/Author: 2026-08-25 / Codex.

- Decision: Store report hashes and counts in a dedicated reconciliation-run record while keeping the source and lifecycle writes in one apply transaction.
  Rationale: The operator needs durable evidence without treating a dry-run report as a lifecycle fact. The report record is an audit artifact; `LEGACY_RECONCILED` transitions contain observed facts only.
  Date/Author: 2026-08-25 / Codex.

## Outcomes & Retrospective

The implementation is complete. Focused cutover and persistence tests pass, with 41 tests passing. TypeScript passes. The full site CI passes with 866 suites and 5,263 tests, with 28 tests skipped. Route coverage passes its configured floors.

The apply path re-reads and hashes the reviewed snapshot, persists the report, links legacy rows, preserves public targets, records observed `LEGACY_RECONCILED` evidence, and performs all mutable work in one transaction. A repeated apply replays the durable report without new writes. Deployment hashes and preflight evidence persist with the run.

The preflight CLI rejects incomplete or tampered reports. The apply path verifies the complete preflight hash and matches its Supply Contract version and hash to the active contract. Agent services inherit the reviewed internal gateway environment from the governed Compose anchor.

Lint reports only pre-existing warnings outside the changed cutover files. The final two-axis review and commit remain.

## Context and Orientation

`apps/site` is the backend source of truth. `apps/site/prisma/schema.prisma` stores affiliate queues, Gateway claims, Supply Sources, Supply Targets, and immutable lifecycle transitions. `affiliateSupplyLifecycle.ts` derives a Supply Source stage from evidence. `affiliateSupplyPersistence.ts` owns Prisma-backed source linking, target persistence, lifecycle transitions, and replenishment reconciliation. `agentGatewayContracts.ts` defines the active Supply Contract and deployment contract hashes. `agentSupervisor.ts` performs one disposable `codex exec --ephemeral` invocation and destroys its workspace.

The legacy fleet consists of the old intake/mapping, approval, coverage, and open-weight controller processes. A stopped-fleet reconciliation is evidence-only until an operator applies the reviewed report. A public target is a target already visible through an existing Event, Team, Facility, or Organization record. A Last-Known-Good target remains visible but contributes zero to fresh Supply Targets.

The new pure module `apps/site/src/server/affiliateImports/affiliateFleetCutover.ts` will define stable report hashes, legacy record and claim inventories, preflight findings, topology checks, container-boundary checks, and pre/post-write rollback decisions. It will not import Prisma or start processes.

## Plan of Work

First, add red tests for deterministic reconciliation, duplicate roots, missing lineage, active and expired leases, public-target preservation, and preflight failures. Add the pure cutover module and make the tests pass. The report sorts every collection and hashes canonical input and output without timestamps or generated IDs.

Next, add `LEGACY_RECONCILED` to the lifecycle command enum and add `AffiliateSupplyReconciliationRuns` to Prisma. Extend the supply database adapter with the report delegate. Replace the current dry-run-only legacy function with a batch collector that reads all legacy intake, capture, discovery, mapping, approval, source, run, candidate, target, Gateway claim, and old queue lease records. The collector must use collection reads and must not infer approval, review, scrape success, or human authority from timestamps.

Add the guarded apply path. It must reject a changed report hash, changed reviewed counts, active claims, duplicate roots, unresolved identity, contract mismatch, topology mismatch, or a non-stopped legacy process. It must create or reuse one Supply Source root, link every resolvable record with compare-and-set semantics, preserve existing targets, create missing public targets as Last-Known-Good, revoke expired claim tokens, and append one immutable `LEGACY_RECONCILED` transition per reconciled root. One database transaction owns the source links, target updates, claim revocations, lifecycle transitions, and applied report status.

Add `reconcile-affiliate-legacy-supply.ts` and `preflight-affiliate-cutover.ts`. Both default to read-only behavior and print JSON with schema version, counts, hashes, failed invariants, resolutions, and record IDs. The apply command requires explicit flags and never starts or stops a runtime. The preflight command accepts a saved process/container inventory and validates the active contract and deployment bundle hashes, topology, database roles, container credential boundary, and exact five governed supervisors.

Add a governed deployment manifest with two Mapping Producers, two Independent Supply Reviewers, and one Coverage Planner. Each supervisor invokes the existing one-claim `agentSupervisor` runner. The manifest has no Goal launcher, nested Goal, open-weight queue controller, production database credential, or production storage credential in agent containers. Keep the old manifest documented as paused legacy input until a human records the clean cohort proof.

## Concrete Steps

Run all site commands from `apps/site`.

1. Run the new focused pure test before implementation. It must fail on missing exports and then pass after the pure module is added.

       npm test -- --runInBand src/server/affiliateImports/__tests__/affiliateFleetCutover.test.ts

2. Validate the Prisma schema and generated client after the schema migration.

       npm run prisma:check

3. Produce a dry-run report against a configured database. No legacy source, target, lifecycle, or claim row may change.

       npm run affiliate:cutover:reconcile -- --dry-run --rollout-cohort=DEFAULT

4. Run cutover preflight against the saved inventory. The command must exit non-zero when a legacy process is running, an active lease exists, a hash differs, a forbidden credential is present, or the topology is not exactly two/two/one.

       npm run affiliate:cutover:preflight -- --inventory=/path/to/inventory.json
   The inventory file is a JSON object with these fields. The contract snapshots contain the expected and observed version and hash values.

       {
         "now": "2026-08-25T12:00:00.000Z",
         "expected": {
           "supplyContractVersion": 1,
           "supplyContractHash": "<sha256>",
           "deploymentContractVersion": 2,
           "deploymentContractHash": "<sha256>",
           "gatewayVersion": 1,
           "roleContractHashes": {"MAPPING_PRODUCER": "<sha256>", "SUPPLY_REVIEWER": "<sha256>", "COVERAGE_PLANNER": "<sha256>"},
           "promptTemplateHashes": {"MAPPING_PRODUCER": "<sha256>", "SUPPLY_REVIEWER": "<sha256>", "COVERAGE_PLANNER": "<sha256>"}
         },
         "observed": {
           "supplyContractVersion": 1,
           "supplyContractHash": "<sha256>",
           "deploymentContractVersion": 2,
           "deploymentContractHash": "<sha256>",
           "gatewayVersion": 1,
           "roleContractHashes": {"MAPPING_PRODUCER": "<sha256>", "SUPPLY_REVIEWER": "<sha256>", "COVERAGE_PLANNER": "<sha256>"},
           "promptTemplateHashes": {"MAPPING_PRODUCER": "<sha256>", "SUPPLY_REVIEWER": "<sha256>", "COVERAGE_PLANNER": "<sha256>"}
         },
         "processInventory": [],
         "legacyClaims": [],
         "databasePermissions": {
           "agentCanConnectProductionDatabase": false,
           "agentCanWriteProductionDatabase": false,
           "agentCanReadObjectStorage": false,
           "agentCanWriteObjectStorage": false,
           "agentCanCallProviders": false,
           "gatewayCanWriteProductionDatabase": true
         },
         "containers": []
       }

   Replace each placeholder with the reviewed value. Add stopped legacy processes and governed workers to `processInventory`, and add the observed legacy claims and container inspections before running preflight.

5. Apply only the reviewed report. The operator supplies the exact report hash, reviewed counts, operator ID, apply nonce, and a clean preflight report.

       npm run affiliate:cutover:reconcile -- --apply --report-hash=<sha256> --input-hash=<sha256> --counts-hash=<sha256> --counts-json=/path/to/reviewed-counts.json --operator=<operator-id> --apply-nonce=<nonce> --preflight=/path/to/preflight.json

6. Run the focused affiliate suites, then the full site suite once at the end.

       npm test -- --runInBand src/server/affiliateImports/__tests__/affiliateFleetCutover.test.ts src/server/affiliateImports/__tests__/affiliateSupplyPersistence.test.ts src/server/affiliateImports/__tests__/agentGateway.test.ts src/server/affiliateImports/__tests__/agentSupervisor.test.ts
       npx tsc --noEmit
       npm run test:ci

## Validation and Acceptance

The pure tests prove that the same ordered snapshot produces the same input and output hashes; different records or counts change the hashes; missing lineage, duplicate canonical roots, duplicate active claims, active leases, impossible cross-origin links, and unresolved targets produce explicit blocking findings; expired leases produce revoke actions; and a public target with no verifiable target row becomes Last-Known-Good without a successful-refresh timestamp.

The persistence tests prove that dry-run reads do not mutate source, target, claim, or lifecycle delegates; apply rejects an altered report; apply links all available records in one transaction; apply preserves existing public rows; apply creates only Last-Known-Good rows for unverified public targets; apply records `LEGACY_RECONCILED` with observed evidence; and a repeated exact apply replays the durable report without duplicate roots, targets, claims, or transitions.

The preflight tests prove that active Supply Contract, role-contract, prompt-template, gateway, and deployment hashes must match; the expected topology is exactly two Mapping Producers, two Independent Supply Reviewers, and one Coverage Planner; all old Goal/controller processes must be stopped; agent container inspection rejects database, storage, provider, repository, and unrestricted backend secrets; and a post-write rollback decision is forward-only while a pre-write decision permits binary rollback with the old fleet still stopped.

Existing gateway and supervisor suites remain the proof for one happy path, invocation failure/retry, stale generation, provider failure, restart/idempotent replay, alert delivery, and exception-rail history. The full site suite and TypeScript check prove that the migration and control-room projections remain compatible.

## Idempotence and Recovery

Dry-run is read-only except for its immutable report artifact. It can run repeatedly against an unchanged snapshot and returns the same hashes. Apply is bound to one report hash, reviewed counts, operator, and nonce. A lost response can be retried with the same values; the transaction replays the existing report and transition keys. A changed database snapshot produces a new input hash and blocks the old apply.

Before the first governed lifecycle write, the operator can roll back the governed binaries while both fleets remain stopped. After the first governed receipt or transition, the preflight report marks rollback as forward-only. It never starts the old fleet, deletes public records, drops legacy columns, or rewrites completed lifecycle transitions.

## Artifacts and Notes

The implementation produces a durable reconciliation run with input hash, output hash, report hash, counts for each legacy record kind and claim state, failed invariants, resolution references, contract hashes, operator identity, and apply status. The CLI output is suitable for attachment to issue #70. The governed Compose manifest and preflight JSON provide the topology and credential-boundary evidence.

## Interfaces and Dependencies

In `apps/site/src/server/affiliateImports/affiliateFleetCutover.ts`, define pure functions named `buildAffiliateLegacyReconciliationReport`, `buildAffiliateCutoverPreflightReport`, `inspectAffiliateAgentContainer`, and `decideAffiliateCutoverRollback`. Each returns immutable JSON-compatible data with stable hashes.

In `apps/site/src/server/affiliateImports/affiliateSupplyPersistence.ts`, extend `reconcileLegacyAffiliateSupply` with `mode: 'DRY_RUN' | 'APPLY'`, `expectedReportHash`, `expectedCounts`, `operatorId`, `applyNonce`, `preflight`, and `now` inputs while keeping the default dry-run behavior. Return `inputHash`, `outputHash`, `reportHash`, `counts`, `failedInvariants`, `resolutions`, and `applied` fields.

In `apps/site/prisma/schema.prisma`, add the `LEGACY_RECONCILED` lifecycle command and an `AffiliateSupplyReconciliationRuns` model that stores the report hashes, counts, findings, resolution references, contract and deployment hashes, operator, mode, and apply status. Add the matching migration and regenerate the Prisma client.

In `apps/site/scripts`, add `reconcile-affiliate-legacy-supply.ts` and `preflight-affiliate-cutover.ts`, and add package scripts with the same names. In `apps/site/deploy/affiliate-governed`, add the governed Compose file, environment example, and operator README. Agent services must use the internal gateway address and role-scoped credentials only.
