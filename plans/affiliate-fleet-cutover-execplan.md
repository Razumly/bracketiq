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
- [x] (2026-08-25) Run focused checks and the full site suite. The site suite passes and route coverage remains above its floors.
- [x] (2026-08-25 20:45Z) Include affiliate-backed Organization, Event, Team, and Facility rows in the stopped-fleet inventory and Last-Known-Good target projection.
- [x] (2026-08-25 21:07Z) Bind APPLY to a complete, hash-checked preflight report and the active Supply Contract. Normalize the governed Compose security anchor.
- [x] (2026-08-25 21:30Z) Restore the blocked-report APPLY gate, translate public candidate lineage, retain public targets per source root, and record canonical public rows as projection-only evidence with regression tests.
- [x] (2026-08-25 22:00Z) Block ambiguous source identities before APPLY, inherit Organization lineage into Event and Team projections, and add a reviewed legacy-manifest hash generator.
- [x] (2026-08-25 23:00Z) Add role-scoped downstream readiness, the required Spaces region, and a gateway-only egress network. Document the external model-relay network precondition.
- [x] (2026-08-25 23:30Z) Require exact Supply Source identity keys, quarantine unlinked path collisions, and batch preloaded roots before APPLY writes.
- [x] (2026-08-25 23:45Z) Add a session-bound rollback-drill CLI that loads the recorded governed cutover session, queries post-start database evidence, and persists a durable `ROLLBACK_DRILL` reconciliation record.
- [x] (2026-08-25 23:55Z) Keep the legacy intake timer disabled in production, reject production execution in the legacy script, and remove synthetic root-history backfill from the initial lifecycle migration.
- [x] (2026-08-25 23:59Z) Bind the reviewed process manifest to the independently captured process inventory artifact ID, canonical hash, and count. Require the same values in preflight, session, rollback, and reconciliation inputs.
- [x] (2026-08-29) Execute the session-bound pre-write and post-write rollback drills against the isolated local database `affiliate_rollback_drill_20260829_fix` using a temporary transaction wrapper around the byte-identical historical migration in the drill worktree; remove the wrapper afterward and restore the historical file byte-identically to base to honor immutable migration rules. Session `rollback-drill-session-20260829-fix` produced `BINARY_ROLLBACK_ALLOWED` before the local governed receipt and `FORWARD_ONLY` after it, with two durable `ROLLBACK_DRILL` rows. No production database or runtime was touched.
- [x] (2026-08-30) Verify a clean install from the repaired historical migration. Added explicit transaction boundaries around its `ON COMMIT DROP` staging table. From an empty isolated local PostgreSQL database, `DATABASE_URL=<redacted local URL ending in /affiliate_migration_clean_20260830_issue70> npx prisma migrate deploy` (Prisma 7.8) applied all 218 migrations successfully. No production database or runtime was touched.
- [x] (2026-08-30) Record static governed restart-policy and runbook verification with Compose config rendering and shell syntax checks. No runtime restart evidence was captured.
- [ ] Run the two-axis code review and commit the completed issue slice.

## Surprises & Discoveries

- Observation: Issue #68 supplied the dry-run reconciliation seam. Issue #70 extends it with governed APPLY and durable replay.
  Evidence: `apps/site/src/server/affiliateImports/affiliateSupplyPersistence.ts` now collects the full legacy evidence set, hashes the reviewed snapshot, and persists the report before APPLY.
- Observation: The old deployment still defines ten mapper services and invokes Goal-loop scripts.
  Evidence: `apps/site/deploy/affiliate-agents/compose.yml` defines `mapper-1` through `mapper-10` and uses `affiliate:intakes:codex-loop`; the new governed manifest must not use those commands.

- Observation: Gateway and lifecycle tests already prove most invocation, retry, stale-generation, provider, and idempotent replay behavior.
  Evidence: `apps/site/src/server/affiliateImports/__tests__/agentGateway.test.ts`, `agentGateway.database.integration.test.ts`, and `agentSupervisor.test.ts` cover those seams. Issue #70 adds the cutover-level inventory and reconciliation gates rather than duplicating gateway authority logic.
- Observation: APPLY can reach the durable replay lookup only after the current report passes the blocking-finding gate.
  Evidence: `affiliateSupplyPersistence.test.ts` covers a blocked apply and the stale-contract guard. The apply path checks `report.isApplySafe` before replay and rechecks the active Supply Contract inside the serializable transaction.

- Observation: Public canonical records can be shared by source rows that resolve to different Supply Source roots.
  Evidence: `affiliateSupplyPersistence.test.ts` covers one shared Organization and Facility projected once per source root. Canonical record IDs remain the public row IDs. A separate stable source-identity association key distinguishes each root.

- Observation: A planned root ID can differ from the persisted root ID after APPLY.
  Evidence: `affiliateSupplyPersistence.test.ts` covers root creation and asserts canonical evidence IDs and public target IDs remain stable across both snapshots.

- Observation: Discovery results can establish Organization lineage that Facility rows need later.
  Evidence: `affiliateSupplyPersistence.test.ts` covers discovery-to-Organization mapping before Facility projection and asserts the Facility has no missing-lineage finding.
- Observation: A self-consistent preflight hash is not enough when evidence collections are empty or incomplete.
  Evidence: `affiliateFleetCutover.test.ts` now blocks missing role and prompt hashes, missing stopped legacy-process inventory, missing governed worker IDs, and missing agent-container inspections.
- Observation: A stopped-fleet count does not prove that every old writer was inspected.
  Evidence: `affiliateFleetCutover.ts` now requires an exact reviewed legacy process ID and class manifest, rejects missing or unexpected rows, and rejects every non-`STOPPED` status. `affiliateFleetCutover.test.ts` covers missing and unverified legacy rows.
- Observation: Container count alone does not prove one inspection per governed supervisor.
  Evidence: Preflight now matches container IDs to governed process IDs and rejects duplicate or unmatched IDs. The focused test covers a duplicate container identity.
- Observation: Worker identity uniqueness must use the normalized value used by heartbeat persistence.
  Evidence: Preflight trims worker IDs before duplicate detection. The focused test covers `mapping-1` and `mapping-1` as one identity.
- Observation: Reconciliation records with the same kind and ID require the complete association key for deterministic ordering.
  Evidence: Report construction now uses `affiliateLegacyLineageRecordKey`, and the focused test proves permutation-invariant input, output, and report hashes.
- Observation: A reviewed process count is not an independent manifest review.
  Evidence: `affiliateFleetCutover.ts` now binds the reviewed manifest to the complete independent process inventory ID, canonical hash, and count. `hash-affiliate-cutover-manifest.ts` reads the inventory artifact and writes those values into the generated manifest. Preflight and rollback reject a missing or changed binding.
- Observation: Coverage Planner startup must wait for all downstream workers, not only for the gateway process.
  Evidence: The governed gateway exposes `/readiness`, which checks each expected worker ID and role for a healthy, unexpired lease. The Coverage Planner supervisor waits before claiming work.

- Observation: The gateway needs external routing for its reviewed Postgres and Spaces endpoints.
  Evidence: Governed Compose keeps workers on the internal network and attaches only the gateway to a separate non-internal egress network. The deployment example includes the required Spaces region.
- Observation: A path-only match can merge distinct canonical query variants.
  Evidence: Reconciliation now requires exact `identityKey` equality and blocks an unlinked root with the same `pathKey` under `CANONICAL_AMBIGUITY`. The regression test covers `?a=1` versus `?a=2`.
- Observation: A pure rollback decision is not an operational proof.
  Evidence: `decide-affiliate-cutover-rollback.ts` loads the durable cutover session, queries gateway receipts, lifecycle transitions, demand and wave rows, and Supply Source and Target updates after the recorded session start. It excludes immutable `DRY_RUN` and `ROLLBACK_DRILL` audit rows from authoritative-write evidence and persists the decision as `ROLLBACK_DRILL`.
- Observation: The historical `apps/site/prisma/migrations/20260822150000_enforce_replenishment_wave_cohort_admission/migration.sql` now wraps its `ON COMMIT DROP` staging table and all reconciliation statements in one explicit transaction.
  Evidence: The source fix adds only `BEGIN;` before the temporary loser table and `COMMIT;` after the unique index. The focused `replenishmentWaveCohortMigration.test.ts` checks that the staging table and index remain inside those boundaries.
- Observation: Clean-install verification now passes through the repaired historical migration and the later forward-only repair migrations; no later migration masks the historical failure.
  Evidence: On the isolated local database `affiliate_migration_clean_20260830_issue70`, `DATABASE_URL=<redacted local URL ending in /affiliate_migration_clean_20260830_issue70> npx prisma migrate deploy` (Prisma 7.8) applied all 218 migrations successfully, with no PostgreSQL `42P01`. No production database or runtime was touched.
- Observation: The legacy intake timer is a second writable control plane when enabled beside governed workers.
  Evidence: The production script rejects `NODE_ENV=production` and `--live`; the systemd guide requires the legacy timer to remain disabled and directs production work through gateway admission.

- Observation: The model relay is an external reviewed dependency.
  Evidence: The governed Compose does not invent a model image. The deployment README requires the relay to join the internal network with the configured `affiliate-model.internal` alias before workers start.
- Observation: Capture evidence must not retain deployment secrets.
  Evidence: The operator workflow now uses `umask 077`, a mode-0700 private capture directory, reviewed container IDs, redacted environment values and key names, and deletes temporary secret-bearing inspection files after comparison.

## Decision Log

- Decision: Keep the old deployment files as explicitly paused legacy artifacts until the governed cohort is proven, and add a separate governed deployment manifest.
  Rationale: Issue #70 requires legacy removal only after a clean cohort. Deleting the old files before that proof would remove the safe rollback reference and violate the forward-only boundary.
  Date/Author: 2026-08-25 / Codex.

- Decision: Use `DRY_RUN` by default. Require an operator ID, exact report hash, reviewed counts, a clean preflight, and an apply nonce for `APPLY`.
  Rationale: A boolean live switch is too easy to use against a changed database snapshot. The exact report and preflight bind the apply to reviewed evidence.
  Date/Author: 2026-08-25 / Codex.
- Decision: Persist each reconciliation report and its hashes, counts, findings, resolutions, contract metadata, operator, mode, and status in a dedicated reconciliation-run record.
  Rationale: The durable report is the replay and audit anchor. The APPLY transaction keeps source links, public targets, claim revocations, lifecycle transitions, and applied status consistent.
  Date/Author: 2026-08-25 / Codex.

- Decision: Block APPLY before replay or mutation when the reviewed report has any blocking finding. Resolve public `sourceId` values that point to import candidates, key target projections by source-root identity, and keep canonical public rows in the lifecycle evidence as projection-only records.
  Rationale: Public Events and Teams store candidate IDs, not scrape-source IDs. One public target can belong to more than one source root. Canonical public models have no Supply Source foreign key, so their IDs must remain explicit evidence instead of being silently dropped.
  Date/Author: 2026-08-25 / Codex.

- Decision: Use deterministic IDs for synthesized canonical and candidate public targets.
  Rationale: A replay must produce the same target identity after the first APPLY. A generated target ID would change the report and break idempotent replay.
  Date/Author: 2026-08-25 / Codex.
- Decision: Treat multiple legacy source rows with one normalized identity as a blocking ambiguity.
  Rationale: Applying a lexical winner would drop one source association. The operator must choose an explicit predecessor or successor before mutation.
  Date/Author: 2026-08-25 / Codex.

- Decision: Require exact identity-key equality for automatic root reuse.
  Rationale: A shared origin and path does not prove that query-bearing canonical URLs describe the same feed. An unlinked path collision is a blocking review item.
  Date/Author: 2026-08-25 / Codex.

- Decision: Record rollback drills as reconciliation-run records after querying authoritative database evidence.
  Rationale: Caller-supplied booleans cannot prove the pre-write boundary. A durable record must bind the operator, cohort, cutover time, evidence counts, decision, and hashes.
  Date/Author: 2026-08-25 / Codex.
- Decision: Bind both rollback drills to the durable governed cutover session.
  Rationale: The recorded session supplies the cutover start, cohort, reviewed manifest, independent process inventory, preflight, and deployment evidence; accepting caller-selected boundaries would allow a permissive result from incomplete evidence.
  Date/Author: 2026-08-27 / Codex.

- Decision: Retain only redacted deployment evidence.
  Rationale: Compose configuration and container inspection can expose credentials. Hashing and attaching only redacted metadata preserves the fields needed by preflight without retaining secret-bearing values.
  Date/Author: 2026-08-27 / Codex.

- Decision: Keep the legacy intake timer disabled and reject production execution until a governed admission path exists.
  Rationale: Direct replenishment and provider calls would create a second writable control plane beside the Gateway.
  Date/Author: 2026-08-25 / Codex.
- Decision: Gate Coverage Planner work on role-scoped downstream readiness.
  Rationale: A healthy gateway does not prove that Mapping Producers and Supply Reviewers can accept claims. Matching worker ID and role prevents a wrong-role heartbeat from opening the planner lane.
  Date/Author: 2026-08-25 / Codex.

- Decision: Keep the model relay outside the governed Compose project.
  Rationale: The relay image and credential contract are not defined by issue #70. Requiring its reviewed network attachment avoids an invented service and preserves the governed fleet boundary.
  Date/Author: 2026-08-25 / Codex.

## Outcomes & Retrospective

The issue-70 clean-install migration blocker is resolved. The implementation still has the remaining review and operator-run gates below. Focused cutover,
persistence, readiness, gateway, and supervisor tests pass; TypeScript and the
full site CI run passed as recorded below. Production cutover, deployment, and
rollback-drill execution remain operator-run and are not claimed by this plan.

The historical migration now starts an explicit transaction before the `ON COMMIT DROP` loser table and commits after the unique index. A fresh isolated local PostgreSQL database applied all 218 migrations successfully with `DATABASE_URL=<redacted local URL ending in /affiliate_migration_clean_20260830_issue70> npx prisma migrate deploy` (Prisma 7.8). No production database or runtime was touched.

The apply path re-reads and hashes the reviewed snapshot, rejects unsafe reports before replay or mutation, persists the report, links legacy rows, preserves public targets per source root, records observed canonical public evidence, and performs all mutable work in one transaction. A repeated apply replays the durable report without new writes. Deployment hashes and preflight evidence persist with the run.

The preflight CLI rejects incomplete or tampered reports. The apply path verifies the complete preflight hash and matches its Supply Contract version and hash to the active contract. Agent services inherit the reviewed internal gateway environment from the governed Compose anchor. Coverage Planner work remains paused until all four downstream worker-role leases are healthy and unexpired.
Before any restart or idempotent replay, the operator must bind the original
`APPLY` run to `CUTOVER_SESSION_ID`, open the server-enforced one-claim
`COVERAGE_PLANNER` lease with the reviewed role credential, and observe one
real due `EXECUTE_COMMAND` receipt (`CAPTURE_CLAIM_URL` or
`RUN_DISCOVERY_QUERY`) for that same active claim. Retain redacted evidence
containing the `CUTOVER_SESSION_ID`, `REPLAY_RUN_ID`, receipt ID, claim ID, job
ID, claim generation, idempotency key, external-operation key, request hash,
source, market, cohort, coverage cell, and assessment-cycle IDs. A missing or
mismatched canary keeps admission closed. The later replay must reuse that
durable in-flight receipt and exact lineage; it must not create a fresh
heartbeat, claim, generation, idempotency key, or synthetic success token.
Legacy retirement is a separate, post-cohort gate. The operator must provide
current authorization, complete production happy-path, retry, stale-generation,
provider, alert-delivery, exception-history, no-digest, dashboard, and Portland
evidence, then attach a reviewed removal manifest that names every legacy
launcher and service path. A missing or existing path blocks removal. No
retirement or removal evidence is observed in this worktree.

Targeted ESLint passes for the changed cutover and control-room modules. Static governed restart-policy verification, the final two-axis review, and commit remain; no runtime restart evidence is claimed.

The production/externally hosted rollback drill was not attempted: `DATABASE_URL` was unset and this task did not start, stop, enable, disable, or reconfigure any runtime, so no production durable pre-write or post-write records could be created. The local rollback proof is separate evidence against a temporary repaired fixture: a transaction wrapper was added only in the drill worktree around the byte-identical historical migration, then removed and the historical file restored to base. That fixture produced one `CUTOVER_SESSION` plus two durable `ROLLBACK_DRILL` rows on `mvp-site-db` database `affiliate_rollback_drill_20260829_fix` for session `rollback-drill-session-20260829-fix`, with pre-write `BINARY_ROLLBACK_ALLOWED` and post-write `FORWARD_ONLY`; it does not establish a clean 217-migration deployment from current history.

## Context and Orientation

`apps/site` is the backend source of truth. `apps/site/prisma/schema.prisma` stores affiliate queues, Gateway claims, Supply Sources, Supply Targets, and immutable lifecycle transitions. `affiliateSupplyLifecycle.ts` derives a Supply Source stage from evidence. `affiliateSupplyPersistence.ts` owns Prisma-backed source linking, target persistence, lifecycle transitions, and replenishment reconciliation. `agentGatewayContracts.ts` defines the active Supply Contract and deployment contract hashes. `agentSupervisor.ts` performs one disposable `codex exec --ephemeral` invocation and destroys its workspace.

The legacy fleet consists of the old intake/mapping, approval, coverage, and open-weight controller processes. A stopped-fleet reconciliation is evidence-only until an operator applies the reviewed report. A public target is a target already visible through an existing Event, Team, Facility, or Organization record. A Last-Known-Good target remains visible but contributes zero to fresh Supply Targets.

The pure module `apps/site/src/server/affiliateImports/affiliateFleetCutover.ts` defines stable report hashes, legacy record and claim inventories, preflight findings, topology checks, container-boundary checks, and pre/post-write rollback decisions. It does not import Prisma or start processes.

The rollback session is the durable `AffiliateSupplyReconciliationRuns` row identified by its `id`. It records the governed cutover start, rollout cohort, reviewed manifest, independent process inventory, preflight report, deployment contract, and deployment hashes that the rollback CLI must load instead of accepting caller-selected boundaries.
The actual governed deployment is the Compose project in
`apps/site/deploy/affiliate-governed`: `affiliate-gateway` joins the internal
`gateway_internal` network, the external production PostgreSQL
`production_backend` network, and the separate `gateway_egress` network. The
`affiliate-agent-runner` and all five supervisors join only
`gateway_internal`; no service in this project publishes a host port. The
governed replenishment controller uses the gateway image, joins only
`gateway_internal`, and runs `npm run affiliate:replenishment:controller` once
per protected interval. It receives only the dedicated
`AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN`, gateway address/prefix, and fixed
cadence settings; it has no operator token, database URL, provider key, model
credential, runner socket, or artifact volume. The gateway selects the reviewed
active contract cohort and owns persistence. The production Compose project
owns `production_backend` and its `postgres` service; the governed project does
not create a second database. The runner holds the model credential and uses
the separately deployed `affiliate-model.internal` relay; each supervisor
holds only its own role credential. The read-only control-room page is
`/admin?tab=affiliateOperations` and its projection comes from
`GET /api/admin/affiliate-operations`; it is not a writable cutover control
plane.

`HUMAN_DIRECTED_EXECUTOR` is on-demand only. The operator starts an ephemeral
supervisor with worker ID `human-directed-executor` and the reviewed
`AFFILIATE_HUMAN_DIRECTED_EXECUTOR_CREDENTIAL`; the gateway grants exactly one
bounded lease through the operator-authenticated `/admission/open` request.
The supervisor uses worker-authenticated `/reconcile/worker` and
`/admission/worker/status` calls and never receives the operator token. Do not
add an always-on human executor service to the Compose topology.

The persistent deterministic executor boundary is the governed supervisor
claim loop. `COVERAGE_PLANNER` uses `RUN_DISCOVERY_QUERY` and
`CAPTURE_CLAIM_URL`; `MAPPING_PRODUCER` uses `CAPTURE_CLAIM_URL`,
`VALIDATE_DECLARATIVE_PACKAGE`, and `COMMIT_DECLARATIVE_PACKAGE`; lifecycle
writes use `EXECUTE_RECORDED_LIFECYCLE_COMMAND` only through the
`HUMAN_DIRECTED_EXECUTOR` contract. Do not re-enable
`affiliate:discovery:run`, `affiliate:intakes:process`,
`affiliate:scrape:due`, or the legacy intake automation as production
writers.
Planner jobs use the strict subject contract `{ type, coverageCellId,
assessmentCycleId }` only. Readbacks must join a planner gateway job to its
persisted `AffiliateReplenishmentWaves` row, then to the wave's
`AffiliateReplenishmentDemands` row, coverage cell, assessment cycle, and
discovery campaign. Use the historical `wave.demandGeneration` value when
constructing the assessment-cycle key. Do not use a mutable current demand
generation or add lineage keys to `subjectJson`.

Role-window evidence must bind each claim to its successful role receipt and
the claim-authored lifecycle transition for `claimGeneration + 1`. A current
worker lease or a current source generation alone does not prove the reviewed
role action.
All `Observed` results below are code, test, or isolated-local evidence only;
they do not establish production deployment, startup, cohort, alert, or
retirement evidence. Leave the production evidence gates unchecked until an
authorized operator captures them on the target host and database.

## Plan of Work

First, add red tests for deterministic reconciliation, duplicate roots, missing lineage, active and expired leases, public-target preservation, and preflight failures. Add the pure cutover module and make the tests pass. The report sorts every collection and hashes canonical input and output without timestamps or generated IDs.

Next, add `LEGACY_RECONCILED` to the lifecycle command enum and add `AffiliateSupplyReconciliationRuns` to Prisma. Extend the supply database adapter with the report delegate. Replace the current dry-run-only legacy function with a batch collector that reads all legacy intake, capture, discovery, mapping, approval, source, run, candidate, target, Gateway claim, and old queue lease records. The collector must use collection reads and must not infer approval, review, scrape success, or human authority from timestamps.

Add the guarded apply path. It must reject a changed report hash, changed reviewed counts, active claims, duplicate roots, unresolved identity, contract mismatch, topology mismatch, or a non-stopped legacy process. It must create or reuse one Supply Source root, link every resolvable record with compare-and-set semantics, preserve existing targets, create missing public targets as Last-Known-Good, revoke expired claim tokens, and append one immutable `LEGACY_RECONCILED` transition per reconciled root. One database transaction owns the source links, target updates, claim revocations, lifecycle transitions, and applied report status.

Add `reconcile-affiliate-legacy-supply.ts` and `preflight-affiliate-cutover.ts`. Both default to read-only behavior and print JSON with schema version, counts, hashes, failed invariants, resolutions, and record IDs. The apply command requires explicit flags and never starts or stops a runtime. The preflight command accepts a saved process/container inventory and validates the active contract and deployment bundle hashes, topology, database roles, container credential boundary, and exact five governed supervisors.

Add a governed deployment manifest with two Mapping Producers, two Independent
Supply Reviewers, one Coverage Planner, and one protected replenishment
controller cadence service. Each supervisor invokes the existing one-claim
`agentSupervisor` runner. The controller is a gateway-mediated cadence client:
it authenticates with only the dedicated replenishment token and calls the
gateway replenishment route after the gateway and downstream readiness gates
pass. A command failure exits the cadence container, and only the reviewed
restart-policy transition may restart that exact container. The controller has
no production database, provider, model, runner, or storage authority. The
manifest has no Goal launcher, nested Goal, open-weight queue controller,
production database credential, or production storage credential in agent
containers. Keep the old manifest documented as paused legacy input until a
human records the clean cohort proof.

## Concrete Steps

Run all site commands from `apps/site`.

1. Run the focused pure test.

       npm test -- --runInBand src/server/affiliateImports/__tests__/affiliateFleetCutover.test.ts

   Expected: one suite passes with stable reconciliation and preflight hashes.
   Observed: one suite passed with 21 tests passed.

2. Validate the Prisma schema and generated client.

       npm run prisma:check

   Expected: schema validation, client generation, and generated-surface checks pass.
   Observed: with a temporary local `DATABASE_URL`, schema validation, generation, and surface verification passed.

Before any command emits evidence, create one private capture directory and
keep all evidence paths in that directory. Use a protected operator environment
for `OPERATOR_ID`; do not place an operator credential or database credential
in a command argument:

      umask 077
      CAPTURE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/affiliate-cutover-capture.XXXXXX")"
      chmod 700 "$CAPTURE_DIR"
      export CAPTURE_DIR
      export ROLLOUT_COHORT=DEFAULT
      : "${OPERATOR_ID:?Set OPERATOR_ID in the protected operator environment}"
      assert_non_placeholder_identity() {
        identity_value="${1:-}"
        identity_label="${2:-identity}"
        case "$identity_value" in
          ""|"REPLACE_WITH_"*|"<"*|*"PLACEHOLDER"*|*"placeholder"*|*"EXAMPLE"*|*"example.test"*)
            printf '%s\n' "$identity_label is empty or a placeholder." >&2
            return 1
            ;;
        esac
      }
      assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
      export OPERATOR_ID
      export CUTOVER_INVENTORY="$CAPTURE_DIR/reviewed-inventory.json"
      export REVIEWED_MANIFEST="$CAPTURE_DIR/reviewed-legacy-process-manifest.json"
      export REVIEWED_PROCESS_SOURCE="$CAPTURE_DIR/reviewed-affiliate-process-records.redacted.json"
      export REVIEWED_VALUES_SOURCE="$CAPTURE_DIR/reviewed-inventory-values.redacted.json"
      export REVIEWED_PROCESS_OUTPUT="$CAPTURE_DIR/reviewed-affiliate-processes.json"
      export MANIFEST_OUTPUT="$CAPTURE_DIR/reviewed-legacy-process-manifest.artifact.json"
      export PREFLIGHT_OUTPUT="$CAPTURE_DIR/affiliate-cutover-preflight.json"
      export DRY_RUN_OUTPUT="$CAPTURE_DIR/reconciliation-dry-run.json"
      export REVIEWED_COUNTS="$CAPTURE_DIR/reviewed-counts.json"
      export SESSION_OUTPUT="$CAPTURE_DIR/cutover-session.json"
      export PRE_WRITE_ROLLBACK_OUTPUT="$CAPTURE_DIR/rollback-drill-pre-write.json"
      export APPLY_OUTPUT="$CAPTURE_DIR/reconciliation-apply.json"
      export POST_WRITE_ROLLBACK_OUTPUT="$CAPTURE_DIR/rollback-drill-post-write.json"
      export ROLLBACK_DRILL_ROWS_OUTPUT="$CAPTURE_DIR/rollback-drill-rows.txt"
      export PROCESS_INVENTORY_ARTIFACT_ID="observed-cutover-process-inventory-$(date -u +%Y%m%dT%H%M%SZ)-$$"
      export OPERATOR_DATABASE_URL_FILE=/path/to/affiliate-governed-private/operator-database-url
      test ! -e "$OPERATOR_DATABASE_URL_FILE"
      if ! (
        umask 077
        set -o noclobber
        : > "$OPERATOR_DATABASE_URL_FILE"
      ); then
        printf '%s\n' "Refusing to overwrite the operator database URL file." >&2
        exit 1
      fi
      chmod 0600 "$OPERATOR_DATABASE_URL_FILE"
      test ! -L "$OPERATOR_DATABASE_URL_FILE"
      # Write the reviewed URL with the approved secret procedure; never echo it.
      test -s "$OPERATOR_DATABASE_URL_FILE"
      export DATABASE_URL="$(cat "$OPERATOR_DATABASE_URL_FILE")"
      test -n "$DATABASE_URL"
      export PGSERVICEFILE=/path/to/affiliate-governed-private/pg_service.conf
      export PGSERVICE=affiliate-cutover-inspection
      export PGPASSFILE=/path/to/affiliate-governed-private/pgpass
      test -r "$PGSERVICEFILE"
      test -r "$PGPASSFILE"
      test "$(stat -c '%a' "$PGSERVICEFILE")" = "600"
      test "$(stat -c '%a' "$PGPASSFILE")" = "600"
      export DATABASE_IDENTITY_OUTPUT="$CAPTURE_DIR/affiliate-database-identity.tsv"
      export DATABASE_RUNTIME_IDENTITY_OUTPUT="$CAPTURE_DIR/affiliate-database-runtime-identity.tsv"
      export DATABASE_PRIVILEGES_OUTPUT="$CAPTURE_DIR/affiliate-database-privileges.tsv"
      export SCHEMA_MIGRATION_OUTPUT="$CAPTURE_DIR/schema-migration-deploy.txt"
      export ACTIVE_CONTRACT_OUTPUT="$CAPTURE_DIR/active-supply-contract.tsv"
      export GATEWAY_DEPLOYMENT_OUTPUT="$CAPTURE_DIR/governed-deployment-images.txt"
      export LIVE_WORKER_OUTPUT="$CAPTURE_DIR/live-worker-health.tsv"
      export LIVE_PERMISSION_OUTPUT="$CAPTURE_DIR/live-database-permissions.tsv"
      export LIVE_RECEIPT_OUTPUT="$CAPTURE_DIR/live-gateway-receipts.tsv"
      export LIVE_ALERT_OUTPUT="$CAPTURE_DIR/live-alert-deliveries.tsv"
      export LIVE_EXCEPTION_OUTPUT="$CAPTURE_DIR/live-exception-events.tsv"
      export COHORT_OUTPUT="$CAPTURE_DIR/governed-cohort-evidence.tsv"
      export RETIREMENT_OUTPUT="$CAPTURE_DIR/legacy-retirement-evidence.json"
      export ADMIN_COOKIE_FILE=/path/to/affiliate-governed-private/admin-cookie.txt
      export DASHBOARD_BASE_URL=https://bracket-iq.com
      : "${CONTRACT_ACTIVATED_BY_USER_ID:?Set the approved human contract activator ID}"
      assert_non_placeholder_identity "$CONTRACT_ACTIVATED_BY_USER_ID" "CONTRACT_ACTIVATED_BY_USER_ID"
      : "${ADMIN_COOKIE_FILE:?Set a protected read-only admin cookie file}"
      : "${DASHBOARD_BASE_URL:?Set the reviewed dashboard origin}"
      : "${REVIEWED_DATABASE_NAME:?Set the reviewed current_database value}"
      : "${REVIEWED_DATABASE_ROLE:?Set the reviewed current_user value}"
      : "${REVIEWED_DATABASE_SERVER:?Set the reviewed database server identity}"
      assert_non_placeholder_identity "$REVIEWED_DATABASE_NAME" "REVIEWED_DATABASE_NAME"
      assert_non_placeholder_identity "$REVIEWED_DATABASE_ROLE" "REVIEWED_DATABASE_ROLE"
      assert_non_placeholder_identity "$REVIEWED_DATABASE_SERVER" "REVIEWED_DATABASE_SERVER"
      assert_reviewed_database_identity() {
        psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
          --tuples-only --no-align --field-separator="$(printf '\t')" \
          -c "select current_database(), current_user, coalesce(inet_server_addr()::text, 'local')" \
          > "$DATABASE_IDENTITY_OUTPUT"
        test "$(cat "$DATABASE_IDENTITY_OUTPUT")" = \
          "$(printf '%s\t%s\t%s' "$REVIEWED_DATABASE_NAME" "$REVIEWED_DATABASE_ROLE" "$REVIEWED_DATABASE_SERVER")"
        npx tsx --eval '
          import { prisma } from "./src/lib/prisma.ts";
          const main = async () => {
            const rows = await prisma.$queryRaw`select current_database() as database_name, current_user as role_name, coalesce(inet_server_addr()::text, $$local$$) as server_address`;
            const row = rows[0];
            if (!row) throw new Error("DATABASE_URL identity query returned no row.");
            process.stdout.write(`${row.database_name}\t${row.role_name}\t${row.server_address}\n`);
          };
          main().catch((error) => {
            console.error(error);
            process.exitCode = 1;
          }).finally(async () => {
            await prisma.$disconnect();
          });
        ' > "$DATABASE_RUNTIME_IDENTITY_OUTPUT"
        test "$(cat "$DATABASE_RUNTIME_IDENTITY_OUTPUT")" = \
          "$(printf '%s\t%s\t%s' "$REVIEWED_DATABASE_NAME" "$REVIEWED_DATABASE_ROLE" "$REVIEWED_DATABASE_SERVER")"
      }
      assert_reviewed_database_identity

   Keep `DATABASE_URL` only in this protected operator shell for the Node
   CLIs; `prismaConfig` does not read `PGSERVICEFILE`. Keep the service and
   password files outside the repository, mode `0600`, and use the same
   reviewed database identity in both. Never put a URL or password in a
   command argument, report, or shared log, and do not enable shell tracing.


   Before the dry-run persistence, obtain separate current authorization for
   the dry-run record and for gateway reconciliation. These authorizations are
   evidence values, not substitutes for database permissions:

      : "${DRY_RUN_PERSISTENCE_AUTHORIZATION_ID:?Set current dry-run persistence authorization}"
      : "${GATEWAY_RECONCILIATION_AUTHORIZATION_ID:?Set current gateway reconciliation authorization}"
      assert_non_placeholder_identity "$DRY_RUN_PERSISTENCE_AUTHORIZATION_ID" "DRY_RUN_PERSISTENCE_AUTHORIZATION_ID"
      assert_non_placeholder_identity "$GATEWAY_RECONCILIATION_AUTHORIZATION_ID" "GATEWAY_RECONCILIATION_AUTHORIZATION_ID"

   Run the identity query before this write and before every later writable
   command. Compare `current_database`, `current_user`, and
   `inet_server_addr()` with the separately reviewed identity. A mismatch
   stops the command. The Node CLI uses the protected `DATABASE_URL`; only
   read-only evidence queries use `psql --service` with the protected passfile.

3. Produce a dry-run report against a configured database. No legacy source, target, lifecycle, or claim row may change.

      assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
      assert_reviewed_database_identity
      npm run --silent affiliate:cutover:reconcile -- \
        --dry-run --rollout-cohort="$ROLLOUT_COHORT" \
        --operator="$OPERATOR_ID" \
        > "$DRY_RUN_OUTPUT"
      jq -e '.isDryRun == true and (.reportHash | type) == "string" and (.reportHash | length) == 64 and (.inputHash | type) == "string" and (.inputHash | length) == 64 and (.countsHash | type) == "string" and (.countsHash | length) == 64' \
        "$DRY_RUN_OUTPUT"
      jq -e '.report.counts' "$DRY_RUN_OUTPUT" > "$REVIEWED_COUNTS"
      test "$(jq -S -c -j . "$REVIEWED_COUNTS" | shasum -a 256 | cut -d " " -f1)" = "$(jq -er '.countsHash' "$DRY_RUN_OUTPUT")"

   Expected: protected JSON report with stable input, output, report, and counts hashes.
   Observed: the command stopped with `DATABASE_URL is not set`; no configured database was available.

4. Build the independent process/container inventory and run cutover preflight
   against the saved artifacts. The command must exit non-zero when a legacy
   process is running, an active lease exists, a hash differs, a forbidden
   credential is present, or the topology is not exactly two/two/one.

   The inventory file is a JSON object with the observed process, claim,
   permission, and container values. It must include the complete
   `processInventory`, its independent `processInventoryArtifactId`, its
   `processInventoryHash`, and its `processInventoryCount`. Keep the reviewed
   process manifest in a separate file.
   Use the private `CAPTURE_DIR` created above for all captures; do not create
   a second directory or reassign any evidence path. Run these commands from
   `apps/site` on the deployment host:


   Before any host capture, keep `CAPTURE_DIR` private for the entire comparison.
   Create the reviewed manifest source file with a second operator. It must
   list every old writer, include a unique `artifactId`, and include the
   reviewer and review time:

       {
         "schemaVersion": 1,
         "artifactId": "<unique-reviewed-manifest-artifact-id>",
         "reviewedAt": "<review-time-ISO-8601>",
         "reviewedBy": "<reviewer-id>",
         "processes": [
           {"id": "<legacy-process-id>", "processClass": "<PROCESS_CLASS>"}
         ],
         "systemdUnits": [
           {"processId": "<legacy-process-id>", "unitId": "<systemd-unit-id>"}
         ]
       }
After the manifest is reviewed, scope the inventory to the governed Compose
project only. This must include the gateway, runner, two Mapping Producers,
two Independent Supply Reviewers, Coverage Planner, downstream-readiness helper,
and the governed replenishment controller; never use an unconstrained host-wide
container listing:

       cd /path/to/repository/apps/site
       export REVIEWED_GOVERNED_SERVICES_JSON='[
         "affiliate-gateway",
         "affiliate-agent-runner",
         "mapping-producer-1",
         "mapping-producer-2",
         "supply-reviewer-1",
         "supply-reviewer-2",
         "coverage-planner",
         "affiliate-agent-downstream-ready",
         "affiliate-replenishment-controller"
       ]'
       docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
         --profile coverage-planner \
         -f deploy/affiliate-governed/compose.yml ps --all --format json \
         > "$CAPTURE_DIR/affiliate-container-candidates.json"
       test -s "$CAPTURE_DIR/affiliate-container-candidates.json"
       jq -s -e --argjson expected "$REVIEWED_GOVERNED_SERVICES_JSON" '
         (map(.Service) | sort) == ($expected | sort)
         and all(.[]; .ID | type == "string" and test("^[a-fA-F0-9]{64}$"))
       ' "$CAPTURE_DIR/affiliate-container-candidates.json"
       jq -s -er --argjson expected "$REVIEWED_GOVERNED_SERVICES_JSON" '
         . as $rows
         | ($expected[] as $service
             | $rows[] | select(.Service == $service) | .ID)
       ' "$CAPTURE_DIR/affiliate-container-candidates.json" \
         > "$CAPTURE_DIR/affiliate-container-candidate-ids.txt"
       test -s "$CAPTURE_DIR/affiliate-container-candidate-ids.txt"
       test "$(wc -l < "$CAPTURE_DIR/affiliate-container-candidate-ids.txt" | tr -d '[:space:]')" = "9"
       test "$(sort -u "$CAPTURE_DIR/affiliate-container-candidate-ids.txt" | wc -l | tr -d '[:space:]')" = "9"
       awk 'NF != 1 || $1 !~ /^[a-fA-F0-9]{64}$/ { exit 1 }' \
         "$CAPTURE_DIR/affiliate-container-candidate-ids.txt"

   Have the second operator compare the candidate service and container IDs
   with the reviewed deployment manifest. Have that operator write the
   approved nine container IDs to
   `$CAPTURE_DIR/reviewed-affiliate-container-ids.txt`. Inspect only IDs in
   that reviewed file:
       test -s "$CAPTURE_DIR/reviewed-affiliate-container-ids.txt"
       test "$(sort -u "$CAPTURE_DIR/reviewed-affiliate-container-ids.txt" | wc -l | tr -d '[:space:]')" = "9"
       awk 'NF != 1 || $1 !~ /^[a-fA-F0-9]{64}$/ { exit 1 }' \
         "$CAPTURE_DIR/reviewed-affiliate-container-ids.txt"

       test "$(comm -23 \
         <(sort "$CAPTURE_DIR/reviewed-affiliate-container-ids.txt") \
         <(sort "$CAPTURE_DIR/affiliate-container-candidate-ids.txt") \
         | wc -l | tr -d '[:space:]')" = "0"


       export REVIEWED_AGENT_IMAGE="$(
         sed -n 's/^AFFILIATE_AGENT_IMAGE=//p' \
           /path/to/affiliate-governed-private/deployment.env
       )"
       export REVIEWED_GATEWAY_IMAGE="$(
         sed -n 's/^AFFILIATE_GATEWAY_IMAGE=//p' \
           /path/to/affiliate-governed-private/deployment.env
       )"
       printf '%s\n' "$REVIEWED_AGENT_IMAGE" "$REVIEWED_GATEWAY_IMAGE" |
         grep -Eq '^.+@sha256:[A-Fa-f0-9]{64}$'
       test -s /path/to/affiliate-governed-private/reviewed-agent-image-id.txt
       test ! -L /path/to/affiliate-governed-private/reviewed-agent-image-id.txt
       test -s /path/to/affiliate-governed-private/reviewed-gateway-image-id.txt
       test ! -L /path/to/affiliate-governed-private/reviewed-gateway-image-id.txt
       export REVIEWED_AGENT_IMAGE_ID="$(
         cat /path/to/affiliate-governed-private/reviewed-agent-image-id.txt
       )"
       export REVIEWED_GATEWAY_IMAGE_ID="$(
         cat /path/to/affiliate-governed-private/reviewed-gateway-image-id.txt
       )"
       printf '%s\n' "$REVIEWED_AGENT_IMAGE_ID" "$REVIEWED_GATEWAY_IMAGE_ID" |
         grep -Eq '^sha256:[A-Fa-f0-9]{64}$'
       # IMAGE is the immutable registry reference; IMAGE_ID is the separately
       # reviewed local Docker image ID. Never derive one from the other.
       install -m 0600 /dev/null "$CAPTURE_DIR/reviewed-affiliate-containers.redacted.json"
       docker inspect $(paste -sd' ' "$CAPTURE_DIR/reviewed-affiliate-container-ids.txt") |
         jq -e 'map({
           id: .Id,
           name: (.Name | ltrimstr("/")),
           service: .Config.Labels["com.docker.compose.service"],
           image: .Config.Image,
           imageId: .Image,
           repoDigests: (.RepoDigests // []),
           command: (.Config.Cmd // []),
           user: (.Config.User // null),
           hasReadonlyRootFilesystem: (.HostConfig.ReadonlyRootfs // false),
           environment: ([.Config.Env[]? | (split("=")[0] + "=<redacted>")]),
           networks: ([.NetworkSettings.Networks // {} | keys[]]),
           restartPolicy: (.HostConfig.RestartPolicy.Name // "no"),
           capDrop: (.HostConfig.CapDrop // []),
           securityOptions: (.HostConfig.SecurityOpt // [])
         })' > "$CAPTURE_DIR/reviewed-affiliate-containers.redacted.json"
       test -s "$CAPTURE_DIR/reviewed-affiliate-containers.redacted.json"
       jq -e 'all(.[]; (.environment | type) == "array")' \
         "$CAPTURE_DIR/reviewed-affiliate-containers.redacted.json"
       jq -e '[.[]?.environment[]?] | all(test("^[^=]+=<redacted>$"))' \
         "$CAPTURE_DIR/reviewed-affiliate-containers.redacted.json"
       jq -e --arg agent "$REVIEWED_AGENT_IMAGE" \
         --arg agent_id "$REVIEWED_AGENT_IMAGE_ID" \
         --arg gateway "$REVIEWED_GATEWAY_IMAGE" \
         --arg gateway_id "$REVIEWED_GATEWAY_IMAGE_ID" '
         all(.[];
           .hasReadonlyRootFilesystem == true
           and .restartPolicy == "no"
           and (.image | test("@sha256:[A-Fa-f0-9]{64}$"))
           and (.imageId | test("^sha256:[A-Fa-f0-9]{64}$"))
           and (.repoDigests | type == "array")
           and (
             if .service == "affiliate-gateway"
               or .service == "affiliate-replenishment-controller" then
               .image == $gateway and .imageId == $gateway_id
               and (.repoDigests | index($gateway) != null)
             else
               .image == $agent and .imageId == $agent_id
               and (.repoDigests | index($agent) != null)
             end
           )
         )
       ' "$CAPTURE_DIR/reviewed-affiliate-containers.redacted.json"

   Capture the resolved Compose metadata without retaining its environment
   values:

       install -m 0600 /dev/null "$CAPTURE_DIR/governed-compose.redacted.json"
       docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
         --profile coverage-planner \
         -f deploy/affiliate-governed/compose.yml config --format json |
         jq '{
           name: .name,
           services: (.services | with_entries(.value |= {
             user: .user,
             stop_grace_period: .stop_grace_period,
             read_only: .read_only,
             environment: (
               (.environment // {}) |
               if type == "object" then keys | map(. + "=<redacted>")
               elif type == "array" then map(sub("=.*$"; "=<redacted>"))
               else []
               end
             ),
             networks: (
               (.networks // {}) |
               if type == "object" then keys else . end
             ),
             cap_drop: .cap_drop,
             security_opt: .security_opt
           }))
         }' > "$CAPTURE_DIR/governed-compose.redacted.json"

       jq -e '
         any(.[];
           .service == "affiliate-replenishment-controller"
           and .networks == ["gateway_internal"]
           and (.environment
             | index("AFFILIATE_AGENT_GATEWAY_ADDRESS=<redacted>") != null)
           and (.environment
             | index("AFFILIATE_AGENT_GATEWAY_PATH_PREFIX=<redacted>") != null)
           and (.environment
             | index("AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=<redacted>") != null)
           and (.environment
             | index("AFFILIATE_REPLENISHMENT_INTERVAL_SECONDS=<redacted>") != null)
           and ((.command | join("\n"))
             | contains("npm run affiliate:replenishment:controller"))
           and (all(.environment[];
             contains("AFFILIATE_GATEWAY_OPERATOR_TOKEN") | not))
           and (all(.environment[];
             contains("DATABASE_URL") | not))
           and (all(.environment[];
             contains("PRODUCTION_BACKEND") | not))
           and (all(.environment[];
             contains("AFFILIATE_SCRAPINGDOG_API_KEY") | not))
           and (all(.environment[];
             contains("AFFILIATE_FIRECRAWL_API_KEY") | not))
           and (all(.environment[];
             contains("AFFILIATE_AGENT_MODEL_CREDENTIAL") | not))
       ' "$CAPTURE_DIR/reviewed-affiliate-containers.redacted.json"
       jq -e '
         any(.[];
           .service == "affiliate-gateway"
           and (.environment
             | index("AFFILIATE_HUMAN_DIRECTED_EXECUTOR_CREDENTIAL=<redacted>") != null)
         )
       ' "$CAPTURE_DIR/reviewed-affiliate-containers.redacted.json"
       docker network inspect "$REVIEWED_AGENT_NETWORK" \
         | jq '.[0] | {id: .Id, name: .Name, internal: .Internal, containerIds: ((.Containers // {}) | keys | sort)}' \
         > "$CAPTURE_DIR/reviewed-agent-network.json"
       jq -e --arg expected "$REVIEWED_AGENT_NETWORK" \
         '.name == $expected and .internal == true and (.id | test("^[a-fA-F0-9]{64}$")) and (.containerIds | length) >= 8' \
         "$CAPTURE_DIR/reviewed-agent-network.json"
       jq -e '
         def grace_seconds:
           if type == "number" then .
           elif test("^[0-9]+s$") then tonumber
           elif test("^[0-9]+m[0-9]+s$") then (
             capture("^(?<minutes>[0-9]+)m(?<seconds>[0-9]+)s$") as $parts
             | ($parts.minutes | tonumber) * 60 + ($parts.seconds | tonumber)
           )
           elif test("^[0-9]+m$") then tonumber * 60
           else -1
           end;
         .services as $services
         | [
             $services["mapping-producer-1"].stop_grace_period,
             $services["mapping-producer-2"].stop_grace_period,
             $services["supply-reviewer-1"].stop_grace_period,
             $services["supply-reviewer-2"].stop_grace_period,
             $services["coverage-planner"].stop_grace_period,
             $services["affiliate-replenishment-controller"].stop_grace_period
           ]
         | length == 6 and all(.[]; grace_seconds > 1200)
       ' "$CAPTURE_DIR/governed-compose.redacted.json"

   Capture legacy service state without a raw command or argument vector that
   may contain credentials. The reviewed unit ID and its `MainPID` are
   temporary join keys; `comm` supplies the safe executable-basename identity:

       systemctl list-units --all 'bracketiq-affiliate-*' --no-legend --no-pager \
         > "$CAPTURE_DIR/affiliate-legacy-units.txt"
       systemctl show 'bracketiq-affiliate-*' \
         -p Id,MainPID,ActiveState,SubState,ExecMainStatus --no-pager \
         > "$CAPTURE_DIR/affiliate-legacy-unit-details.txt"
       ps -axo pid=,ppid=,user=,state=,comm= \
         | awk 'NF >= 5 { print $1 "\t" $2 "\t" $3 "\t" $4 "\t" $5 }' \
         > "$CAPTURE_DIR/affiliate-process-identities.tsv"
       test -s "$CAPTURE_DIR/affiliate-process-identities.tsv"
       awk -F '\t' 'NF != 5 || $1 !~ /^[0-9]+$/ || $2 !~ /^[0-9]+$/ || $3 == "" || $4 == "" || $5 == "" || seen[$1]++ { exit 1 }' \
         "$CAPTURE_DIR/affiliate-process-identities.tsv"

   Do not capture `args`, `cmd`, `ExecStart`, environment, or any arbitrary
   process argument vector. Do not copy a raw `command` value into evidence:
   `processInventory.command` is only the reviewed executable identity token.
   The second operator must join each reviewed systemd unit's `MainPID` to the
   safe table, verify an exact equality between its observed `comm` basename
   and the executable basename of the reviewed command identity, and reject a
   missing, duplicate, or ambiguous PID, unit, or executable match. Write only
   a unique process-inventory row with the schema fields `id`, `kind`,
   `command`, `status`, and any applicable `role`, `workerId`, and
   `processClass` to `$REVIEWED_PROCESS_SOURCE`; do not persist the temporary
   PID/unit join. For a legacy process, compare the safe `comm` executable
   basename with the reviewed command basename exactly; never infer identity
   from `node`, `npm`, `docker`, or another shared launcher name. The Docker
   parser requires exactly three tab-separated fields: full container ID,
   container name, and Compose service label. For a governed process, match
   the exact full container ID and require its service label to equal the
   reviewed worker ID; a missing, duplicate, or mismatched identity is not a
   running match. The rollback CLI's live process inspection is in-memory only:
   never redirect its process output or attach it as evidence.
   Before any conditional migration grants, a separate protected DBA service
   must provision the absent governed group roles
   (`bracketiq_affiliate_gateway`, `bracketiq_affiliate_lifecycle`, and
   `bracketiq_affiliate_agent`) as `NOLOGIN`, non-superuser, no-createdb, and
   no-createrole roles, then grant only the gateway group to `bracketiq_app`.
   Reject an existing role with broader attributes. Capture the role-provision
   result as supplemental evidence and verify the four reviewed roles before
   running the schema migration; the runtime login must never provision roles.

   The reviewed database URL identity must match the protected `PGSERVICE`
   tuple (`current_database()`, `current_user`, and non-null server address)
   before each migration, session, dry run, APPLY, replay, and rollback.

   assert_reviewed_database_identity


   Capture effective privileges for the exact contract roles and the actual
   `DATABASE_URL` runtime role. The reviewed roles are
   `bracketiq_affiliate_gateway` (gateway),
   `bracketiq_affiliate_lifecycle` (lifecycle authority),
   `bracketiq_affiliate_agent` (worker), and `bracketiq_app` (runtime login).
   Fail if any reviewed role is missing. The output contains only role names,
   object names, privilege names, and `true`/`false` results:

       install -m 0600 /dev/null "$DATABASE_PRIVILEGES_OUTPUT"
       psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
         --tuples-only --no-align --field-separator="$(printf '\t')" <<'SQL' \
         > "$DATABASE_PRIVILEGES_OUTPUT"
       DO $$
       DECLARE
         missing_role text;
       BEGIN
         SELECT expected.role_name
           INTO missing_role
           FROM (VALUES
             ('bracketiq_affiliate_gateway'),
             ('bracketiq_affiliate_lifecycle'),
             ('bracketiq_affiliate_agent'),
             ('bracketiq_app')
           ) AS expected(role_name)
           WHERE NOT EXISTS (
             SELECT 1 FROM pg_roles WHERE rolname = expected.role_name
           )
           LIMIT 1;
         IF missing_role IS NOT NULL THEN
           RAISE EXCEPTION 'Required reviewed role is missing: %', missing_role;
         END IF;
       END
       $$;
       WITH principals(role_name) AS (
         VALUES
           ('bracketiq_affiliate_gateway'::name),
           ('bracketiq_affiliate_lifecycle'::name),
           ('bracketiq_affiliate_agent'::name),
           ('bracketiq_app'::name)
       ),
       affiliate_tables(table_name) AS (
         VALUES
           ('AffiliateScrapeSources'::name),
           ('AffiliateScrapeMappings'::name),
           ('AffiliateScrapeRuns'::name),
           ('AffiliateSourceIntakes'::name),
           ('AffiliateSourceIntakePages'::name),
           ('AffiliateSourceIntakeRuns'::name),
           ('AffiliateSourceIntakeArtifacts'::name),
           ('AffiliateSourceDiscoveryCampaigns'::name),
           ('AffiliateAgentGatewayJobs'::name),
           ('AffiliateAgentGatewayClaims'::name),
           ('AffiliateAgentGatewayArtifacts'::name),
           ('AffiliateAgentGatewayOperationReceipts'::name),
           ('AffiliateAgentGatewayEvents'::name),
           ('AffiliateOperationalAlerts'::name),
           ('AffiliateOperationalAlertDeliveries'::name),
           ('AffiliateAgentWorkerHealth'::name),
           ('AffiliateCoverageAgentJobs'::name),
           ('AffiliateCoverageCities'::name),
           ('AffiliateCoverageCells'::name),
           ('AffiliateCoverageCellAssessments'::name),
           ('AffiliateSourceDiscoveryQueryExecutions'::name),
           ('AffiliateSourceDiscoveryRuns'::name),
           ('AffiliateSourceDiscoveryResults'::name),
           ('AffiliateSourceDomainPolicies'::name),
           ('AffiliateSourceMappingJobs'::name),
           ('AffiliateApprovalJobs'::name),
           ('AffiliateImportCandidates'::name),
           ('AffiliateSupplySources'::name),
           ('AffiliateSupplyContractManifests'::name),
           ('AffiliateSupplyLifecycleTransitions'::name),
           ('AffiliateSupplyReconciliationRuns'::name),
           ('AffiliateSupplyTargets'::name),
           ('AffiliateReplenishmentDemands'::name),
           ('AffiliateReplenishmentWaves'::name),
           ('File'::name)
       ),
       requested_table_privileges(privilege_name) AS (
         VALUES ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text)
       ),
       public_sequences AS (
         SELECT namespace.nspname::text AS schema_name, sequence.relname::text AS sequence_name
         FROM pg_class AS sequence
         JOIN pg_namespace AS namespace ON namespace.oid = sequence.relnamespace
         WHERE namespace.nspname = 'public' AND sequence.relkind = 'S'
       )
       SELECT 'pg_has_role'::text,
         member.role_name::text,
         target.role_name::text,
         'MEMBER'::text,
         pg_has_role(member.role_name, target.role_name, 'MEMBER')::text
       FROM principals AS member
       CROSS JOIN principals AS target
       WHERE member.role_name <> target.role_name
       UNION ALL
       SELECT 'pg_auth_members'::text,
         member.rolname::text,
         granted.rolname::text,
         'MEMBER'::text,
         'true'::text
       FROM pg_auth_members AS membership
       JOIN pg_roles AS member ON member.oid = membership.member
       JOIN pg_roles AS granted ON granted.oid = membership.roleid
       WHERE member.rolname IN (SELECT role_name FROM principals)
          OR granted.rolname IN (SELECT role_name FROM principals)
       UNION ALL
       SELECT 'database'::text,
         principal.role_name::text,
         current_database()::text,
         'CONNECT'::text,
         has_database_privilege(principal.role_name, current_database(), 'CONNECT')::text
       FROM principals AS principal
       UNION ALL
       SELECT 'schema'::text,
         principal.role_name::text,
         'public'::text,
         privilege_name,
         has_schema_privilege(principal.role_name, 'public', privilege_name)::text
       FROM principals AS principal
       CROSS JOIN (VALUES ('USAGE'::text), ('CREATE'::text)) AS schema_privileges(privilege_name)
       UNION ALL
       SELECT 'table'::text,
         principal.role_name::text,
         format('%I.%I', 'public', table_name),
         requested.privilege_name,
         has_table_privilege(
           principal.role_name,
           format('%I.%I', 'public', table_name),
           requested.privilege_name
         )::text
       FROM principals AS principal
       CROSS JOIN affiliate_tables
       CROSS JOIN requested_table_privileges AS requested
       UNION ALL
       SELECT 'sequence'::text,
         principal.role_name::text,
         format('%I.%I', sequences.schema_name, sequences.sequence_name),
         requested.privilege_name,
         has_sequence_privilege(
           principal.role_name,
           format('%I.%I', sequences.schema_name, sequences.sequence_name),
           requested.privilege_name
         )::text
       FROM principals AS principal
       CROSS JOIN public_sequences AS sequences
       CROSS JOIN (VALUES
         ('USAGE'::text),
         ('SELECT'::text),
         ('UPDATE'::text)
       ) AS requested(privilege_name)
       ORDER BY 1, 2, 3, 4;
       SQL
       test -s "$DATABASE_PRIVILEGES_OUTPUT"
   Review both effective `pg_has_role` rows and direct `pg_auth_members`
   rows. Bind `isGatewayAllowedToWriteProductionDatabase` to the
   `bracketiq_app` rows: the app role must have the reviewed gateway-role
   membership path and the required effective write privileges on the reviewed
   affiliate tables. Bind `isAgentAllowedToConnectProductionDatabase` to the
   worker role's database `CONNECT` row. Bind
   `isAgentAllowedToWriteProductionDatabase` to every worker-role table and
   sequence `INSERT`, `UPDATE`, `DELETE`, and write-sequence row; these agent
   results must be `false`. Do not derive these booleans from role flags. Use
   the redacted container evidence, not role flags, for object-storage and
   provider booleans. Derive all six `databasePermissions` values only from
   this privilege evidence and the redacted container checks.

   The Compose audit has nine reviewed identities, including the gateway,
   runner, downstream-readiness helper, and replenishment controller. The
   preflight input retains its strict contract shape:
   `controlPlaneProcesses` contains exactly those four process rows with
   observed statuses; `runnerContainer` is the runner; `containers` contains
   exactly the five non-runner governed supervisors (two Mapping Producers,
   two Supply Reviewers, and Coverage Planner); and `auxiliaryContainers`
   contains exactly the readiness-helper and replenishment-controller rows.
   Downstream-readiness helper, gateway, and controller inspection remains in
   the separate supplemental reviewed container artifact.

   Build the process and container portions of the cutover inventory only
   from the independent process source and these redacted captures. Use the
   reviewed manifest only to compare identities and classes; never populate
   inventory rows from it. Preserve no secret value in either JSON artifact.
   Preserve environment key names as `KEY=<redacted>` so
   `inspectAffiliateAgentContainer` can reject forbidden authority by key.
   Use the reviewed network capture for `isNetworkInternal`; do not copy a
   credential value from a shell, Compose file, or Docker inspection.

   The reviewed manifest is not a process inventory. From the redacted process
   and container captures, have the second operator write
   `$REVIEWED_PROCESS_SOURCE` as a JSON array. Each row must contain exactly the
   fields from `processInventoryRecordSchema`: `id`, `kind`, `command`, and
   `status`, plus only the optional `role`, `workerId`, and `processClass`.
   Do not copy process rows or command values from the manifest.

   From the reviewed contract/deployment values and the redacted captures, have
   the second operator write `$REVIEWED_VALUES_SOURCE` as a JSON object with
   exactly these top-level fields: `now`, `expected`, `observed`,
   `controlPlaneProcesses`, `legacyServiceUnits`, `legacyClaims`,
   `databasePermissions`, `reviewedAgentNetwork`, `runnerContainer`,
   `containers`, and `auxiliaryContainers`. `controlPlaneProcesses` must be an
   array of exactly four objects, each with only `id` and `status`, identifying
   `affiliate-gateway`, `affiliate-agent-runner`,
   `affiliate-agent-downstream-ready`, and
   `affiliate-replenishment-controller`. `auxiliaryContainers` must be an
   array of exactly two redacted container objects identifying
   `affiliate-agent-downstream-ready` and
   `affiliate-replenishment-controller`; the runner remains only in
   `runnerContainer`. Use the exact nested shapes in
   `preflight-affiliate-cutover.ts`. Every container environment entry must
   preserve only `KEY=<redacted>`; never put a secret value in either source
   file.
   After the second operator completes the comparison, remove every transient
   secret-bearing capture. Retain only the redacted values and key names needed
   for preflight:

       rm -f \
         "$CAPTURE_DIR/affiliate-container-candidates.json" \
         "$CAPTURE_DIR/affiliate-container-candidate-ids.txt" \
         "$CAPTURE_DIR/reviewed-affiliate-container-ids.txt"
       test ! -e "$CAPTURE_DIR/affiliate-container-candidates.json"
       test ! -e "$CAPTURE_DIR/affiliate-container-candidate-ids.txt"
       test ! -e "$CAPTURE_DIR/reviewed-affiliate-container-ids.txt"

   Validate both reviewed sources, compute the repository's canonical process
   inventory hash and count, and compose both output artifacts. The command
   rejects missing or unknown fields, manifest/process mismatches, and a
   process artifact ID equal to the manifest artifact ID:

       npx tsx --eval '
         import { readFile, writeFile } from "node:fs/promises";
         import { hashAffiliateCutoverProcessInventory } from "./src/server/affiliateImports/affiliateFleetCutover.ts";
         const main = async () => {

         const requiredPath = (name) => {
           const value = process.env[name]?.trim();
           if (!value) throw new Error(`Missing ${name}.`);
           return value;
         };
         const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
         const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
         const assertRecord = (value, label) => {
           if (!isRecord(value)) throw new Error(`${label} must be an object.`);
         };
         const assertKeys = (value, allowed, label) => {
           assertRecord(value, label);
           const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
           if (unknown.length) throw new Error(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
         };
         const assertExactKeys = (value, keys, label) => {
           assertKeys(value, keys, label);
           const missing = keys.filter((key) => !(key in value));
           if (missing.length) throw new Error(`${label} is missing required fields: ${missing.join(", ")}.`);
         };
         const assertRequiredKeys = (value, required, allowed, label) => {
           assertKeys(value, allowed, label);
           const missing = required.filter((key) => !(key in value));
           if (missing.length) throw new Error(`${label} is missing required fields: ${missing.join(", ")}.`);
         };
         const assertString = (value, label) => {
           if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
         };
         const manifestPath = requiredPath("REVIEWED_MANIFEST");
         const processSourcePath = requiredPath("REVIEWED_PROCESS_SOURCE");
         const valuesSourcePath = requiredPath("REVIEWED_VALUES_SOURCE");
         const processOutputPath = requiredPath("REVIEWED_PROCESS_OUTPUT");
         const inventoryOutputPath = requiredPath("CUTOVER_INVENTORY");
         const processArtifactId = requiredPath("PROCESS_INVENTORY_ARTIFACT_ID");
         const manifest = await readJson(manifestPath);
         assertExactKeys(manifest, ["schemaVersion", "artifactId", "reviewedAt", "reviewedBy", "processes", "systemdUnits"], "reviewed manifest");
         assertString(manifest.artifactId, "reviewed manifest artifactId");
         assertString(manifest.reviewedAt, "reviewed manifest reviewedAt");
         assertString(manifest.reviewedBy, "reviewed manifest reviewedBy");
         if (!Array.isArray(manifest.processes) || !Array.isArray(manifest.systemdUnits)) {
           throw new Error("reviewed manifest must contain processes and systemdUnits arrays.");
         }
         if (manifest.artifactId.trim() === processArtifactId) throw new Error("process and manifest artifact IDs must differ.");
         for (const row of manifest.processes) {
           assertExactKeys(row, ["id", "processClass"], "reviewed manifest process");
           assertString(row.id, "reviewed manifest process id");
           assertString(row.processClass, "reviewed manifest processClass");
         }
         for (const row of manifest.systemdUnits) {
           assertExactKeys(row, ["processId", "unitId"], "reviewed manifest systemd unit");
           assertString(row.processId, "reviewed manifest systemd unit processId");
           assertString(row.unitId, "reviewed manifest systemd unitId");
         }
         const processRows = await readJson(processSourcePath);
         if (!Array.isArray(processRows) || processRows.length === 0) throw new Error("reviewed process source must be a non-empty array.");
         const processAllowed = ["id", "kind", "role", "workerId", "processClass", "command", "status"];
         for (const [index, row] of processRows.entries()) {
           assertRequiredKeys(row, ["id", "kind", "command", "status"], processAllowed, `reviewed process row ${index + 1}`);
           for (const key of ["id", "command", "status"]) assertString(row[key], `reviewed process row ${index + 1} ${key}`);
           if (!["LEGACY", "GOVERNED"].includes(row.kind)) throw new Error(`reviewed process row ${index + 1} has an invalid kind.`);
           for (const key of ["role", "workerId", "processClass"]) {
             if (row[key] !== undefined) assertString(row[key], `reviewed process row ${index + 1} ${key}`);
           }
         }
         const manifestRows = new Map(manifest.processes.map((row) => [row.id, row]));
         for (const row of processRows.filter((candidate) => candidate.kind === "LEGACY")) {
           const expected = manifestRows.get(row.id);
           if (!expected || row.processClass?.trim().toUpperCase() !== String(expected.processClass).trim().toUpperCase() || row.status.trim().toUpperCase() !== "STOPPED") {
             throw new Error(`reviewed process row ${row.id} does not match the reviewed legacy manifest.`);
           }
         }
         for (const row of manifest.processes) {
           if (!processRows.some((candidate) => candidate.id === row.id && candidate.kind === "LEGACY" && candidate.processClass?.trim().toUpperCase() === String(row.processClass).trim().toUpperCase() && candidate.status.trim().toUpperCase() === "STOPPED")) {
             throw new Error(`reviewed manifest process ${row.id} is missing from the independent process source.`);
           }
         }
         const values = await readJson(valuesSourcePath);
         const valueKeys = ["now", "expected", "observed", "controlPlaneProcesses", "legacyServiceUnits", "legacyClaims", "databasePermissions", "reviewedAgentNetwork", "runnerContainer", "containers", "auxiliaryContainers"];
         assertExactKeys(values, valueKeys, "reviewed inventory values");
         for (const key of ["now", "reviewedAgentNetwork"]) assertString(values[key], `reviewed inventory values ${key}`);
         for (const key of ["expected", "observed", "databasePermissions"]) assertRecord(values[key], `reviewed inventory values ${key}`);
         for (const key of ["controlPlaneProcesses", "legacyServiceUnits", "legacyClaims", "containers", "auxiliaryContainers"]) {
           if (!Array.isArray(values[key])) throw new Error(`reviewed inventory values ${key} must be an array.`);
         }
         if (values.controlPlaneProcesses.length !== 4) throw new Error("reviewed inventory values controlPlaneProcesses must contain exactly four entries.");
         values.controlPlaneProcesses.forEach((process, index) => {
           assertExactKeys(process, ["id", "status"], `controlPlaneProcesses row ${index + 1}`);
           assertString(process.id, `controlPlaneProcesses row ${index + 1} id`);
           assertString(process.status, `controlPlaneProcesses row ${index + 1} status`);
         });
         const controlPlaneIds = values.controlPlaneProcesses.map((process) => String(process.id ?? "").trim()).sort();
         if (controlPlaneIds.join("\0") !== ["affiliate-agent-downstream-ready", "affiliate-agent-runner", "affiliate-gateway", "affiliate-replenishment-controller"].join("\0")) {
           throw new Error("reviewed inventory values controlPlaneProcesses must identify gateway, runner, readiness helper, and replenishment controller.");
         }
         if (values.auxiliaryContainers.length !== 2) throw new Error("reviewed inventory values auxiliaryContainers must contain exactly two entries.");
         const auxiliaryIds = values.auxiliaryContainers.map((container) => String(container.id ?? "").trim()).sort();
         if (auxiliaryIds.join("\0") !== ["affiliate-agent-downstream-ready", "affiliate-replenishment-controller"].join("\0")) {
           throw new Error("reviewed inventory values auxiliaryContainers must identify readiness and replenishment controller.");
         }
         const snapshotKeys = ["supplyContractVersion", "supplyContractHash", "deploymentContractVersion", "deploymentContractHash", "gatewayVersion", "roleContractHashes", "promptTemplateHashes"];
         for (const key of ["expected", "observed"]) {
           assertExactKeys(values[key], snapshotKeys, `reviewed inventory values ${key}`);
           assertRecord(values[key].promptTemplateHashes, `${key}.promptTemplateHashes`);
         }
         assertExactKeys(values.databasePermissions, ["isAgentAllowedToConnectProductionDatabase", "isAgentAllowedToWriteProductionDatabase", "isAgentAllowedToReadObjectStorage", "isAgentAllowedToWriteObjectStorage", "isAgentAllowedToCallProviders", "isGatewayAllowedToWriteProductionDatabase"], "databasePermissions");
         values.legacyServiceUnits.forEach((unit, index) => assertExactKeys(unit, ["id", "isEnabled", "isActive"], `legacyServiceUnits row ${index + 1}`));
         const containerAllowed = ["id", "name", "user", "hasReadonlyRootFilesystem", "privileged", "tmpfs", "environment", "networks", "isNetworkInternal", "capDrop", "capAdd", "groupAdd", "cgroupNamespace", "ipcMode", "cgroupRelativePath", "childUid", "childGid", "supervisorUid", "securityOptions"];
         values.legacyClaims.forEach((claim, index) => assertRequiredKeys(claim, ["kind", "id", "status"], ["kind", "id", "sourceId", "supplySourceId", "subjectId", "role", "workerId", "claimGeneration", "status", "leaseExpiresAt", "tokenExpiresAt"], `legacyClaims row ${index + 1}`));
         const assertRedactedContainer = (container, label) => {
           const required = ["id", "user", "hasReadonlyRootFilesystem", "privileged", "tmpfs", "environment", "networks", "isNetworkInternal", "capDrop", "capAdd", "groupAdd", "cgroupNamespace", "ipcMode", "securityOptions"];
           if (label === "runnerContainer") required.push("cgroupRelativePath", "childUid", "childGid", "supervisorUid");
           assertRequiredKeys(container, required, containerAllowed, label);
           assertString(container.id, `${label} id`);
           assertString(container.user, `${label} user`);
           for (const key of ["hasReadonlyRootFilesystem", "privileged", "isNetworkInternal"]) {
             if (typeof container[key] !== "boolean") throw new Error(`${label} ${key} must be boolean.`);
           }
           if (!isRecord(container.tmpfs) || Object.values(container.tmpfs).some((entry) => typeof entry !== "string")) {
             throw new Error(`${label} tmpfs must be a string map.`);
           }
           for (const key of ["networks", "capDrop", "capAdd", "groupAdd", "securityOptions"]) {
             if (!Array.isArray(container[key]) || container[key].some((entry) => typeof entry !== "string")) throw new Error(`${label} ${key} must be a string array.`);
           }
           if (container.cgroupNamespace !== null) assertString(container.cgroupNamespace, `${label} cgroupNamespace`);
           if (container.ipcMode !== null) assertString(container.ipcMode, `${label} ipcMode`);
           if (Array.isArray(container.environment)) {
             for (const entry of container.environment) {
               if (typeof entry !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*=<redacted>$/.test(entry)) throw new Error(`${label} environment must contain only KEY=<redacted> entries.`);
             }
           } else {
             assertRecord(container.environment, `${label} environment`);
             if (Object.values(container.environment).some((value) => value !== "<redacted>")) throw new Error(`${label} environment contains an unredacted value.`);
           }
           if (label === "runnerContainer") {
             assertString(container.cgroupRelativePath, `${label} cgroupRelativePath`);
             for (const key of ["childUid", "childGid", "supervisorUid"]) {
               if (!Number.isInteger(container[key]) || Number(container[key]) <= 0) throw new Error(`${label} ${key} must be a positive integer.`);
             }
           }
         };
         assertRedactedContainer(values.runnerContainer, "runnerContainer");
         values.containers.forEach((container, index) => assertRedactedContainer(container, `container ${index + 1}`));
         values.auxiliaryContainers.forEach((container, index) => assertRedactedContainer(container, `auxiliary container ${index + 1}`));
         const processInventoryHash = hashAffiliateCutoverProcessInventory(processRows);
         const processArtifact = {
           processInventoryArtifactId: processArtifactId,
           processInventoryHash,
           processInventoryCount: processRows.length,
           processInventory: processRows,
         };
         const inventory = {
           ...values,
           ...processArtifact,
         };
         await writeFile(processOutputPath, `${JSON.stringify(processArtifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
         await writeFile(inventoryOutputPath, `${JSON.stringify(inventory, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
         };
         main().catch((error) => {
           console.error(error);
           process.exitCode = 1;
         });

       '
   Generate the separate manifest artifact and use it with preflight:

       npm run --silent affiliate:cutover:manifest-hash -- \
         --manifest="$REVIEWED_MANIFEST" --inventory="$REVIEWED_PROCESS_OUTPUT" \
         --output="$MANIFEST_OUTPUT"
      # Refresh the exact stopped-unit evidence immediately before preflight.
      export LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT="$CAPTURE_DIR/legacy-unit-state.preflight.txt"
      test ! -e "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"
      if ! (
        umask 077
        set -o noclobber
        : > "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"
        while IFS= read -r unit_id; do
          test -n "$unit_id"
          systemctl show "$unit_id" -p Id -p UnitFileState -p ActiveState -p SubState --no-pager
        done < <(jq -er '.systemdUnits[].unitId' "$REVIEWED_MANIFEST") \
          >> "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"
      ); then
        rm -f "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"
        exit 1
      fi
      test -s "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"
      awk -F= '$1 == "ActiveState" && $2 != "inactive" { exit 1 }' \
        "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"
      awk -F= '$1 == "UnitFileState" && $2 !~ /^(disabled|masked)$/ { exit 1 }' \
        "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"

       npm run --silent affiliate:cutover:preflight -- \
         --inventory="$CUTOVER_INVENTORY" --manifest="$MANIFEST_OUTPUT" \
         > "$PREFLIGHT_OUTPUT"
       jq -e '.isReady == true and (.blockingFindings | length) == 0 and (.reviewedLegacyProcessManifestHash | length) == 64 and (.reviewedLegacyProcessManifestArtifactId | length) > 0 and (.processInventoryArtifactId | length) > 0 and (.processInventoryHash | length) == 64 and (.processInventoryCount | type) == "number"' "$PREFLIGHT_OUTPUT"
   No raw Docker or Compose capture is written. Each inspect/config stream goes
   directly through the redactor. Verify that forbidden raw paths are absent
   before hashing:

       for forbidden_path in \
         "$CAPTURE_DIR/governed-compose.raw.json" \
         "$CAPTURE_DIR/resolved-compose.raw.json" \
         "$CAPTURE_DIR/reviewed-affiliate-containers.raw.json"; do
         test ! -e "$forbidden_path"
       done

   Hash only redacted captures, the generated process artifact, and the
   complete inventory:
   Keep the evidence bundle limited to those redacted capture paths and their
   SHA-256 values. Do not attach or preserve any raw capture.

       shasum -a 256 \
         "$CUTOVER_INVENTORY" \
         "$REVIEWED_PROCESS_OUTPUT" \
         "$REVIEWED_PROCESS_SOURCE" \
         "$REVIEWED_VALUES_SOURCE" \
         "$CAPTURE_DIR/governed-compose.redacted.json" \
         "$CAPTURE_DIR/reviewed-affiliate-containers.redacted.json" \
         "$CAPTURE_DIR/reviewed-agent-network.json" \
         "$CAPTURE_DIR/affiliate-legacy-units.txt" \
         "$CAPTURE_DIR/affiliate-legacy-unit-details.txt" \
         "$CAPTURE_DIR/affiliate-database-runtime-identity.tsv" \
         "$CAPTURE_DIR/affiliate-database-identity.tsv" \
         "$CAPTURE_DIR/affiliate-database-privileges.tsv" \
         > "$CAPTURE_DIR/affiliate-cutover-redacted-source-hashes.txt"


   The second operator records the manifest reviewer and review time. Do not
   create the independent process inventory from the reviewed manifest.


   The manifest command reads the separately reviewed process list and the
   independent process inventory. It writes the process-list hash and the
   inventory artifact ID, canonical inventory hash, and count. Preflight
   compares those values with the observed inventory. A changed process,
   command, status, or inventory record invalidates the binding. The manifest
   `artifactId` and inventory `processInventoryArtifactId` must be different.


   The generated `reviewed-inventory.json` must use this exact preflight
   shape. The values below are illustrative placeholders only; replace them
   with the reviewed contract, process, claim, permission, network, and
   container evidence before running preflight:
      {
        "now": "2026-08-25T12:00:00.000Z",
        "processInventoryArtifactId": "observed-cutover-process-inventory-2026-08-25",
       "processInventoryHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
       "processInventoryCount": 21,
        "expected": {
           "supplyContractVersion": 4,
           "supplyContractHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
           "deploymentContractVersion": 2,
           "deploymentContractHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
           "gatewayVersion": 9,
           "roleContractHashes": {
             "COVERAGE_PLANNER": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
             "MAPPING_PRODUCER": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
             "SUPPLY_REVIEWER": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
             "HUMAN_DIRECTED_EXECUTOR": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
           },
           "promptTemplateHashes": {
             "COVERAGE_PLANNER": "1111111111111111111111111111111111111111111111111111111111111111",
             "MAPPING_PRODUCER": "2222222222222222222222222222222222222222222222222222222222222222",
             "SUPPLY_REVIEWER": "3333333333333333333333333333333333333333333333333333333333333333",
             "HUMAN_DIRECTED_EXECUTOR": "4444444444444444444444444444444444444444444444444444444444444444"
           }
         },
         "observed": {
           "supplyContractVersion": 4,
           "supplyContractHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
           "deploymentContractVersion": 2,
           "deploymentContractHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
           "gatewayVersion": 9,
           "roleContractHashes": {
             "COVERAGE_PLANNER": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
             "MAPPING_PRODUCER": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
             "SUPPLY_REVIEWER": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
             "HUMAN_DIRECTED_EXECUTOR": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
           },
           "promptTemplateHashes": {
             "COVERAGE_PLANNER": "1111111111111111111111111111111111111111111111111111111111111111",
             "MAPPING_PRODUCER": "2222222222222222222222222222222222222222222222222222222222222222",
             "SUPPLY_REVIEWER": "3333333333333333333333333333333333333333333333333333333333333333",
             "HUMAN_DIRECTED_EXECUTOR": "4444444444444444444444444444444444444444444444444444444444444444"
           }
         },
         "processInventory": [
           {"id": "legacy-mapping-1", "kind": "LEGACY", "processClass": "MAPPING", "command": "affiliate:legacy:mapping", "status": "STOPPED"},
           {"id": "legacy-mapping-2", "kind": "LEGACY", "processClass": "MAPPING", "command": "affiliate:legacy:mapping", "status": "STOPPED"},
           {"id": "legacy-mapping-3", "kind": "LEGACY", "processClass": "MAPPING", "command": "affiliate:legacy:mapping", "status": "STOPPED"},
           {"id": "legacy-mapping-4", "kind": "LEGACY", "processClass": "MAPPING", "command": "affiliate:legacy:mapping", "status": "STOPPED"},
           {"id": "legacy-mapping-5", "kind": "LEGACY", "processClass": "MAPPING", "command": "affiliate:legacy:mapping", "status": "STOPPED"},
           {"id": "legacy-mapping-6", "kind": "LEGACY", "processClass": "MAPPING", "command": "affiliate:legacy:mapping", "status": "STOPPED"},
           {"id": "legacy-mapping-7", "kind": "LEGACY", "processClass": "MAPPING", "command": "affiliate:legacy:mapping", "status": "STOPPED"},
           {"id": "legacy-mapping-8", "kind": "LEGACY", "processClass": "MAPPING", "command": "affiliate:legacy:mapping", "status": "STOPPED"},
           {"id": "legacy-mapping-9", "kind": "LEGACY", "processClass": "MAPPING", "command": "affiliate:legacy:mapping", "status": "STOPPED"},
           {"id": "legacy-mapping-10", "kind": "LEGACY", "processClass": "MAPPING", "command": "affiliate:legacy:mapping", "status": "STOPPED"},
           {"id": "legacy-approval-1", "kind": "LEGACY", "processClass": "APPROVAL", "command": "affiliate:legacy:approval", "status": "STOPPED"},
           {"id": "legacy-approval-2", "kind": "LEGACY", "processClass": "APPROVAL", "command": "affiliate:legacy:approval", "status": "STOPPED"},
           {"id": "legacy-coverage", "kind": "LEGACY", "processClass": "COVERAGE", "command": "affiliate:legacy:coverage", "status": "STOPPED"},
           {"id": "legacy-intake-automation", "kind": "LEGACY", "processClass": "INTAKE", "command": "affiliate:intake:automation", "status": "STOPPED"},
           {"id": "legacy-scrape-daily", "kind": "LEGACY", "processClass": "CAPTURE", "command": "affiliate:scrape:due", "status": "STOPPED"},
           {"id": "legacy-controller", "kind": "LEGACY", "processClass": "CONTROLLER", "command": "affiliate:legacy:controller", "status": "STOPPED"},
           {"id": "<reviewed-full-64-char-container-id-for-mapping-producer-1>", "kind": "GOVERNED", "role": "MAPPING_PRODUCER", "workerId": "mapping-producer-1", "command": "affiliate:agent:supervisor", "status": "STOPPED"},
           {"id": "<reviewed-full-64-char-container-id-for-mapping-producer-2>", "kind": "GOVERNED", "role": "MAPPING_PRODUCER", "workerId": "mapping-producer-2", "command": "affiliate:agent:supervisor", "status": "STOPPED"},
           {"id": "<reviewed-full-64-char-container-id-for-supply-reviewer-1>", "kind": "GOVERNED", "role": "SUPPLY_REVIEWER", "workerId": "supply-reviewer-1", "command": "affiliate:agent:supervisor", "status": "STOPPED"},
           {"id": "<reviewed-full-64-char-container-id-for-supply-reviewer-2>", "kind": "GOVERNED", "role": "SUPPLY_REVIEWER", "workerId": "supply-reviewer-2", "command": "affiliate:agent:supervisor", "status": "STOPPED"},
           {"id": "<reviewed-full-64-char-container-id-for-coverage-planner>", "kind": "GOVERNED", "role": "COVERAGE_PLANNER", "workerId": "coverage-planner", "command": "affiliate:agent:supervisor", "status": "STOPPED"}
         ],
         "controlPlaneProcesses": [
           {"id": "affiliate-gateway", "status": "STOPPED"},
           {"id": "affiliate-agent-runner", "status": "STOPPED"},
           {"id": "affiliate-agent-downstream-ready", "status": "STOPPED"},
           {"id": "affiliate-replenishment-controller", "status": "STOPPED"}
         ],
         "legacyServiceUnits": [
           {"id": "<reviewed-legacy-systemd-unit-id>", "isEnabled": "DISABLED", "isActive": "INACTIVE"}
         ],
         "legacyClaims": [
           {"kind": "MAPPING_JOB", "id": "<reviewed-legacy-claim-id>", "sourceId": "<reviewed-legacy-source-id>", "status": "REVOKED", "tokenExpiresAt": "<reviewed-expiry-ISO-8601>"}
         ],
        "databasePermissions": {
          "isAgentAllowedToConnectProductionDatabase": false,
          "isAgentAllowedToWriteProductionDatabase": false,
          "isAgentAllowedToReadObjectStorage": false,
          "isAgentAllowedToWriteObjectStorage": false,
          "isAgentAllowedToCallProviders": false,
          "isGatewayAllowedToWriteProductionDatabase": true
        },
       "reviewedAgentNetwork": "bracketiq_affiliate_gateway_internal",
       "runnerContainer": {
         "id": "<reviewed-runner-container-id>",
         "name": "<resolved-affiliate-agent-runner-container-name>",
         "user": "0:0",
         "hasReadonlyRootFilesystem": true,
         "privileged": false,
         "tmpfs": {"/tmp": "<reviewed-tmpfs-options>", "/dev/shm": "<reviewed-tmpfs-options>"},
         "environment": ["AFFILIATE_AGENT_UID=<redacted>", "AFFILIATE_AGENT_RUNNER_CHILD_UID=<redacted>", "AFFILIATE_AGENT_RUNNER_CHILD_GID=<redacted>", "AFFILIATE_AGENT_RUNNER_CGROUP_RELATIVE_PATH=<redacted>", "AFFILIATE_AGENT_GATEWAY_ADDRESS=<redacted>", "AFFILIATE_AGENT_MODEL_ADDRESS=<redacted>", "AFFILIATE_AGENT_MODEL_CREDENTIAL=<redacted>"],
         "networks": ["bracketiq_affiliate_gateway_internal"],
         "isNetworkInternal": true,
         "capDrop": ["ALL"],
         "capAdd": [],
         "groupAdd": [],
         "cgroupNamespace": "private",
         "ipcMode": "none",
         "cgroupRelativePath": "affiliate-agent-runner",
         "childUid": 1002,
         "childGid": 1001,
         "supervisorUid": 1001,
         "securityOptions": ["no-new-privileges:true", "writable-cgroups=true"]
       },
       "containers": [
         {"id": "<reviewed-mapping-producer-1-container-id>", "name": "<resolved-mapping-producer-1-container-name>", "user": "1001:1001", "hasReadonlyRootFilesystem": true, "privileged": false, "tmpfs": {}, "environment": ["AFFILIATE_AGENT_GATEWAY_ADDRESS=<redacted>", "AFFILIATE_AGENT_MODEL_ADDRESS=<redacted>"], "networks": ["bracketiq_affiliate_gateway_internal"], "isNetworkInternal": true, "capDrop": ["ALL"], "capAdd": [], "groupAdd": [], "cgroupNamespace": null, "ipcMode": "none", "securityOptions": ["no-new-privileges:true"]},
         {"id": "<reviewed-mapping-producer-2-container-id>", "name": "<resolved-mapping-producer-2-container-name>", "user": "1001:1001", "hasReadonlyRootFilesystem": true, "privileged": false, "tmpfs": {}, "environment": ["AFFILIATE_AGENT_GATEWAY_ADDRESS=<redacted>", "AFFILIATE_AGENT_MODEL_ADDRESS=<redacted>"], "networks": ["bracketiq_affiliate_gateway_internal"], "isNetworkInternal": true, "capDrop": ["ALL"], "capAdd": [], "groupAdd": [], "cgroupNamespace": null, "ipcMode": "none", "securityOptions": ["no-new-privileges:true"]},
         {"id": "<reviewed-supply-reviewer-1-container-id>", "name": "<resolved-supply-reviewer-1-container-name>", "user": "1001:1001", "hasReadonlyRootFilesystem": true, "privileged": false, "tmpfs": {}, "environment": ["AFFILIATE_AGENT_GATEWAY_ADDRESS=<redacted>", "AFFILIATE_AGENT_MODEL_ADDRESS=<redacted>"], "networks": ["bracketiq_affiliate_gateway_internal"], "isNetworkInternal": true, "capDrop": ["ALL"], "capAdd": [], "groupAdd": [], "cgroupNamespace": null, "ipcMode": "none", "securityOptions": ["no-new-privileges:true"]},
         {"id": "<reviewed-supply-reviewer-2-container-id>", "name": "<resolved-supply-reviewer-2-container-name>", "user": "1001:1001", "hasReadonlyRootFilesystem": true, "privileged": false, "tmpfs": {}, "environment": ["AFFILIATE_AGENT_GATEWAY_ADDRESS=<redacted>", "AFFILIATE_AGENT_MODEL_ADDRESS=<redacted>"], "networks": ["bracketiq_affiliate_gateway_internal"], "isNetworkInternal": true, "capDrop": ["ALL"], "capAdd": [], "groupAdd": [], "cgroupNamespace": null, "ipcMode": "none", "securityOptions": ["no-new-privileges:true"]},
         {"id": "<reviewed-coverage-planner-container-id>", "name": "<resolved-coverage-planner-container-name>", "user": "1001:1001", "hasReadonlyRootFilesystem": true, "privileged": false, "tmpfs": {}, "environment": ["AFFILIATE_AGENT_GATEWAY_ADDRESS=<redacted>", "AFFILIATE_AGENT_MODEL_ADDRESS=<redacted>"], "networks": ["bracketiq_affiliate_gateway_internal"], "isNetworkInternal": true, "capDrop": ["ALL"], "capAdd": [], "groupAdd": [], "cgroupNamespace": null, "ipcMode": "none", "securityOptions": ["no-new-privileges:true"]}
       ],
       "auxiliaryContainers": [
         {"id": "affiliate-agent-downstream-ready", "name": "<resolved-affiliate-agent-downstream-ready-container-name>", "user": "1001:1001", "hasReadonlyRootFilesystem": true, "privileged": false, "tmpfs": {}, "environment": ["AFFILIATE_AGENT_GATEWAY_ADDRESS=<redacted>"], "networks": ["bracketiq_affiliate_gateway_internal"], "isNetworkInternal": true, "capDrop": ["ALL"], "capAdd": [], "groupAdd": [], "cgroupNamespace": null, "ipcMode": "none", "securityOptions": ["no-new-privileges:true"]},
         {"id": "affiliate-replenishment-controller", "name": "<resolved-affiliate-replenishment-controller-container-name>", "user": "1001:1001", "hasReadonlyRootFilesystem": true, "privileged": false, "tmpfs": {}, "environment": ["AFFILIATE_AGENT_GATEWAY_ADDRESS=<redacted>", "AFFILIATE_AGENT_GATEWAY_PATH_PREFIX=<redacted>", "AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=<redacted>"], "networks": ["bracketiq_affiliate_gateway_internal"], "isNetworkInternal": true, "capDrop": ["ALL"], "capAdd": [], "groupAdd": [], "cgroupNamespace": null, "ipcMode": "none", "securityOptions": ["no-new-privileges:true"]}
       ]
       }

   Replace the example contract hashes with the reviewed values. Keep the
   expected and observed snapshots equal only after the deployed values match.
   Keep the reviewed manifest in its separate artifact file. The process
   manifest must list every old writer, and every matching `processInventory`
   row must have `kind: "LEGACY"`, the reviewed `processClass`, and
   `status: "STOPPED"`. Every governed row must use the exact reviewed full
   64-character container ID in `id`, keep its Compose worker identity in
   `workerId`, and pass the exact `comm` basename check described above:

       jq -e '[.processInventory[] | select(.kind == "GOVERNED")] | length == 5 and all(.[]; (.id | test("^[a-fA-F0-9]{64}$")) and (.workerId | type == "string" and length > 0) and .command == "affiliate:agent:supervisor" and .status == "STOPPED")' "$CUTOVER_INVENTORY"
       jq -e '([.controlPlaneProcesses[].id] | sort) == ["affiliate-agent-downstream-ready", "affiliate-agent-runner", "affiliate-gateway", "affiliate-replenishment-controller"] and ([.auxiliaryContainers[].id] | sort) == ["affiliate-agent-downstream-ready", "affiliate-replenishment-controller"]' "$CUTOVER_INVENTORY"

   Expected: `isReady: true`, zero failed invariants, exactly four control-plane
   process rows, exactly two auxiliary container rows, and counts for two
   Mapping Producers, two Supply Reviewers, one Coverage Planner, all stopped
   legacy processes in the reviewed process manifest, and zero unsafe
   containers. The readback must show five governed rows with reviewed full
   container IDs and exact worker labels.
   Observed (isolated local smoke fixture; not production evidence): the complete local smoke inventory returned `isReady: true`, report hash `3039abbde1732f4f1f33f3c0c8daeacccc8bc1e01605f9754742ef868cd24a5f`, manifest hash `8a48de1b370b36a0ca02e5eccdf93b4360c1f7b98764b4debb0b5dbe6aaed918`, manifest count `2`, zero failed invariants, the expected topology counts, and all two reviewed legacy processes stopped.

5. Record the durable governed cutover session before any rollback drill or
   governed write. Use the reviewed manifest artifact, independent process
   inventory, and intact preflight report produced above:

      if test -e "$SESSION_OUTPUT"; then
        test ! -L "$SESSION_OUTPUT"
        jq -e '.mode == "CUTOVER_SESSION" and (.sessionId | type) == "string" and (.sessionHash | type) == "string" and (.sessionHash | test("^[a-f0-9]{64}$"))' \
          "$SESSION_OUTPUT" >/dev/null
      else
        if ! (
          assert_reviewed_database_identity
          set -o noclobber
          npm run --silent affiliate:cutover:session -- \
            --manifest="$MANIFEST_OUTPUT" \
            --inventory="$CUTOVER_INVENTORY" \
            --preflight="$PREFLIGHT_OUTPUT" \
            --rollout-cohort="$ROLLOUT_COHORT" \
            > "$SESSION_OUTPUT"
        ); then
          printf '%s\n' "Could not create the durable session exclusively." >&2
          rm -f "$SESSION_OUTPUT"
          exit 1
        fi
      fi
      export CUTOVER_SESSION_ID="$(jq -er '.sessionId | select(type == "string" and length > 0)' "$SESSION_OUTPUT")"
      export CUTOVER_SESSION_HASH="$(jq -er '.sessionHash | select(type == "string" and test("^[a-f0-9]{64}$"))' "$SESSION_OUTPUT")"
      jq -e --arg cohort "$ROLLOUT_COHORT" \
        '.mode == "CUTOVER_SESSION" and .rolloutCohort == $cohort and (.recordedStartAt | type) == "string" and (.sessionId | length) > 0 and (.sessionHash | length) == 64' \
        "$SESSION_OUTPUT"

   Expected: one durable `CUTOVER_SESSION` row records the trusted start,
   rollout cohort, reviewed manifest, independent process inventory, preflight,
   deployment contract, and deployment hashes. Retain both the session ID and
   session hash for APPLY and retain the session ID for both rollback drills.

   Observed (local-only, not production evidence): a prior isolated fixture
   recorded a session and returned a session hash. No production session write
   or production database proof is established by this plan.

6. Run the pre-write rollback drill before any governed write. Use the durable
   session ID for the boundary and the authorized operator ID for the decision
   record:

      install -m 0600 /dev/null "$PRE_WRITE_ROLLBACK_OUTPUT"
      assert_reviewed_database_identity
      npm run --silent affiliate:cutover:rollback -- \
        --session-id="$CUTOVER_SESSION_ID" \
        --operator="$OPERATOR_ID" \
        > "$PRE_WRITE_ROLLBACK_OUTPUT"
      jq -e --arg session "$CUTOVER_SESSION_ID" \
        '.sessionId == $session and .decision.mode == "BINARY_ROLLBACK_ALLOWED" and (.record.sessionId == $session) and (.record.reportHash | type) == "string" and (.record.reportHash | length) == 64' \
        "$PRE_WRITE_ROLLBACK_OUTPUT"

   Do not pass `--since`, `--manifest`, `--evidence`, `--rollout-cohort`, or
   `--runtime-inventory`; the session-bound CLI rejects caller-selected
   boundaries and loads the recorded cohort, manifest, independent process
   inventory, preflight, and deployment evidence. Do not pass `--dry-run`;
   this drill must persist its result.

   Expected: the decision is `BINARY_ROLLBACK_ALLOWED`, the command returns a
   non-empty durable record hash, and the database contains one immutable
   `ROLLBACK_DRILL` record bound to `CUTOVER_SESSION_ID` and `OPERATOR_ID`.

      assert_reviewed_database_identity
      export LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT="$CAPTURE_DIR/legacy-unit-state.apply.wildcard.txt"
      export LEGACY_UNIT_STATE_APPLY_OUTPUT="$CAPTURE_DIR/legacy-unit-state.apply.txt"
      for unit_state_path in \
        "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT" \
        "$LEGACY_UNIT_STATE_APPLY_OUTPUT"; do
        test ! -e "$unit_state_path"
        test ! -L "$unit_state_path"
      done
      if ! (
        umask 077
        set -o noclobber
        systemctl show 'bracketiq-affiliate-*' \
          -p Id -p UnitFileState -p ActiveState -p SubState --no-pager \
          > "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT"
        while IFS= read -r unit_id; do
          test -n "$unit_id"
          systemctl show "$unit_id" \
            -p Id -p UnitFileState -p ActiveState -p SubState --no-pager
        done < <(jq -er '.systemdUnits[].unitId' "$REVIEWED_MANIFEST") \
          > "$LEGACY_UNIT_STATE_APPLY_OUTPUT"
      ); then
        rm -f "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT" "$LEGACY_UNIT_STATE_APPLY_OUTPUT"
        exit 1
      fi
      test -s "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT"
      test -s "$LEGACY_UNIT_STATE_APPLY_OUTPUT"
      export APPLY_WILDCARD_UNIT_IDS="$(
        awk -F= '
          /^Id=/ { id=$2 }
          /^SubState=/ {
            if (id == "") exit 1
            print id
            id=""
          }
        ' "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT" | sort -u
      )"
      export APPLY_REVIEWED_UNIT_IDS="$(
        jq -er '.systemdUnits[].unitId' "$REVIEWED_MANIFEST" | sort -u
      )"
      test -n "$APPLY_WILDCARD_UNIT_IDS"
      test "$APPLY_WILDCARD_UNIT_IDS" = "$APPLY_REVIEWED_UNIT_IDS"
      test "$(printf '%s\n' "$APPLY_WILDCARD_UNIT_IDS" | wc -l | tr -d '[:space:]')" = \
        "$(printf '%s\n' "$APPLY_REVIEWED_UNIT_IDS" | wc -l | tr -d '[:space:]')"
      for unit_state_path in \
        "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT" \
        "$LEGACY_UNIT_STATE_APPLY_OUTPUT"; do
        awk -F= '$1 == "ActiveState" && $2 != "inactive" { exit 1 }' \
          "$unit_state_path"
        awk -F= '$1 == "UnitFileState" && $2 !~ /^(disabled|masked)$/ { exit 1 }' \
          "$unit_state_path"
      done
      cmp "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT" "$LEGACY_UNIT_STATE_APPLY_OUTPUT"

      export REPORT_HASH="$(jq -er '.reportHash' "$DRY_RUN_OUTPUT")"
      export INPUT_HASH="$(jq -er '.inputHash' "$DRY_RUN_OUTPUT")"
      export COUNTS_HASH="$(jq -er '.countsHash' "$DRY_RUN_OUTPUT")"
      export APPLY_NONCE="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
      assert_reviewed_database_identity
      npm run --silent affiliate:cutover:reconcile -- --apply \
        --rollout-cohort="$ROLLOUT_COHORT" \
        --operator="$OPERATOR_ID" \
        --cutover-session-id="$CUTOVER_SESSION_ID" \
        --cutover-session-hash="$CUTOVER_SESSION_HASH" \
        --apply-nonce="$APPLY_NONCE" \
        --report-hash="$REPORT_HASH" \
        --input-hash="$INPUT_HASH" \
        --counts-json="$REVIEWED_COUNTS" \
        --counts-hash="$COUNTS_HASH" \
        --preflight="$PREFLIGHT_OUTPUT" \
        > "$APPLY_OUTPUT"
      jq -e --arg report "$REPORT_HASH" \
        '.isApplied == true and .reportHash == $report and (.report | type) == "object"' \
        "$APPLY_OUTPUT"

   When both counts flags are supplied, the CLI hashes the reviewed file and
   rejects a mismatched `--counts-hash`. A changed snapshot, active legacy
   claim, changed session, or changed session hash must block APPLY. One
   serializable transaction owns the report promotion and reconciliation writes.

   Expected: `isApplied: true` for the exact reviewed dry-run report, with the
   same durable session ID and session hash used for the pre-write drill.

   Observed (local-only, not production evidence): the reviewed report APPLY
   was not run in the isolated rollback fixture; no production APPLY result is
   claimed here.
8. Run the post-write rollback drill immediately after the first governed
   receipt or governed lifecycle/authoritative write is recorded for this
   session:

      install -m 0600 /dev/null "$POST_WRITE_ROLLBACK_OUTPUT"
      assert_reviewed_database_identity
      npm run --silent affiliate:cutover:rollback -- \
        --session-id="$CUTOVER_SESSION_ID" \
        --operator="$OPERATOR_ID" \
        > "$POST_WRITE_ROLLBACK_OUTPUT"
      jq -e --arg session "$CUTOVER_SESSION_ID" \
        '.sessionId == $session and .decision.mode == "FORWARD_ONLY" and (.record.sessionId == $session) and (.record.reportHash | type) == "string" and (.record.reportHash | length) == 64' \
        "$POST_WRITE_ROLLBACK_OUTPUT"
      psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
        --tuples-only --no-align --field-separator="," \
        -v session_id="$CUTOVER_SESSION_ID" \
        -v operator_id="$OPERATOR_ID" \
        -c "select coalesce(string_agg(status::text, ',' order by \"createdAt\"), '') from \"AffiliateSupplyReconciliationRuns\" where mode = 'ROLLBACK_DRILL' and \"reportJson\"->>'sessionId' = :'session_id' and \"reportJson\"->>'operatorId' = :'operator_id'" \
        > "$ROLLBACK_DRILL_ROWS_OUTPUT"
      test "$(tr -d '[:space:]' < "$ROLLBACK_DRILL_ROWS_OUTPUT")" = "BINARY_ROLLBACK_ALLOWED,FORWARD_ONLY"
   Expected: the decision is `FORWARD_ONLY`, the command returns a non-empty
   durable record hash, and the database contains a second immutable
   `ROLLBACK_DRILL` record bound to the same `CUTOVER_SESSION_ID` and
   `OPERATOR_ID`. Missing, incomplete, or mismatched session, manifest, process
   inventory, preflight, deployment, or runtime evidence must also produce
   `FORWARD_ONLY`.

   Observed (local-only, not production evidence): an isolated fixture
   returned `FORWARD_ONLY` after a local governed receipt. No production
   rollback-drill result is claimed here.

### Deployment evidence gates (operator runbook)

The deployment README is the authoritative executable sequence; this plan
records its non-negotiable ordering and evidence contract. Do not run a
runtime, Compose, `systemctl`, provider, dashboard, or production command
while editing or reviewing this plan. The operator must create the private
deployment environment and all capture files exclusively (`0600`, no
symlinks, no overwrite) and keep `DATABASE_URL` only in the protected
operator shell. Read-only SQL uses the protected `PGSERVICE`/passfile;
Node CLIs must be preceded by the reviewed `current_database`,
`current_user`, and `inet_server_addr()` identity check. Docker inspection
must stream directly through the redacting `jq` projection and must never
persist a raw inspect or resolved Compose environment.

Before APPLY, refresh the exact legacy-unit evidence and require every
reviewed unit to have both `ActiveState=inactive` and
`UnitFileState=disabled|masked`. Refresh the same evidence immediately
before APPLY and compare it byte-for-byte with the preflight capture. Use the
exact reviewed container IDs and service labels; do not use
`docker compose up`, `--force-recreate`, or any command that silently creates
or replaces a governed container. The governed topology remains exactly two
Mapping Producers, two Independent Supply Reviewers, one Coverage Planner, one
downstream-readiness helper, and one governed replenishment controller, with one
runner and one gateway. Each supervisor and the controller has a Compose
`stop_grace_period` above 1,200 seconds (`30m` in the governed file).
Containment stops the controller first, then all five supervisors and the runner,
and leaves the gateway last and available for forward repair. An intentional full
shutdown stops the controller, helper, five supervisors, runner, and gateway in
that order.
The post-APPLY `FORWARD_ONLY` rollback drill must complete and persist its
durable receipt before any startup, canary replay, or other runtime action.

For the canary, open a server-enforced one-claim Coverage Planner lease with
the reviewed role credential and an authenticated same-shell
`EXIT`/`INT`/`TERM` cleanup trap. Query only one real due `EXECUTE_COMMAND`
receipt in the bounded window (`CAPTURE_CLAIM_URL` or `RUN_DISCOVERY_QUERY`);
bind the receipt, external-operation key, request hash, claim, job, generation,
cutover session, replay run, and complete source/market/cohort/cell/cycle tuple
to the reviewed session. Replay that exact in-flight receipt through the
supported gateway reconciliation path after restart; do not create a fresh
heartbeat, claim, generation, idempotency key, or synthetic success token.
Close the bounded admission and verify its authenticated closed state before
running any read-only evidence query or moving to production evidence.

For production evidence, open four separate readiness-gated, authenticated
one-claim windows in order: `MAPPING_PRODUCER/mapping-producer-1`,
`MAPPING_PRODUCER/mapping-producer-2`, `SUPPLY_REVIEWER/supply-reviewer-1`,
and `SUPPLY_REVIEWER/supply-reviewer-2`. Each window must use the exact
reviewed role/worker/credential binding and the bounded POST shape
`(role,workerId,roleCredential,leaseSeconds)`. The gateway must report global
admission closed before each POST, readiness must be true, and the operator
must wait for one matching completed claim and successful receipt before
closing that lease in the failure-safe `EXIT`/`INT`/`TERM` trap. Do not open a
global window or reuse one worker's credential for another worker.
For a human-directed lifecycle command, start only the ephemeral
`human-directed-executor` supervisor with
`AFFILIATE_HUMAN_DIRECTED_EXECUTOR_CREDENTIAL`; never add an always-on human
service. Its worker-authenticated startup uses `/reconcile/worker` and
`/admission/worker/status`. After readiness, the operator opens one
`HUMAN_DIRECTED_EXECUTOR` lease with the same bounded fields and
`leaseSeconds <= 1,200`, captures the redacted lease output, waits for one
terminal receipt, interrupts the `--rm` supervisor, and closes admission. A
missing worker-auth response, bounded lease, receipt, or closed response blocks
the lifecycle command.


After those windows close, require the ordered gates for happy path, invocation
failure followed by a later terminal invocation success for the same job (with
the successful event and receipt sharing claim and generation), stale
generation, provider-specific failure (provider, operation key, provider error
code, exact alert ID/event key, and related reason codes), alert delivery plus
exception-rail history with exact IDs, and zero digest rows. Every gate must
bind the reviewed source, market, cohort, coverage cell, and assessment cycle.
The alert privilege inventory includes both `AffiliateOperationalAlerts` and
`AffiliateOperationalAlertDeliveries`. The authenticated dashboard must then
show the exact projection row and server-generated selected deep link for the
retry, stale-generation, provider, alert, and delivery scenarios. The lineage
bundle must join discovery, capture, mapping, independent review, activation,
and publication IDs from the same tuple, with producer and reviewer identities
distinct.
The cohort completion artifact must derive completion from the joined
gateway-job, replenishment-wave, lifecycle-transition, target, and published
target rows carrying the reviewed tuple. A lone reconciliation row or a
`reportJson` session field cannot satisfy completion; any session readback must
use the durable `cutoverSessionId` key consistently.

Complete and verify Portland before Seattle; a missing or placeholder
provider, alert, digest, regional, dashboard, or lineage result blocks the
cutover. Keep admission closed during all post-window SQL readbacks. Only
after all gates pass may the operator open another finite one-claim lease with
separate authorization; no unbounded admission is supported.

Retirement is a separate blocked-by-default gate. It requires existing,
non-symlink allowlist, canonical legacy-path inventory, and evidence files with
non-placeholder reviewer and authorization identities. The canonical inventory
must equal the allowlist exactly; `productionEvidencePaths` and
`productionEvidenceHashes` must be fixed, exhaustive maps, and each protected
artifact must be recomputed and match its recorded SHA-256 value.
The fixed retirement manifest's `paths` contain only files still eligible for
later removal. The package command removal and gold-capture migration are
`reviewedEdits` entries with exact file hashes, while
`affiliateIngestionSchemas.ts` and `affiliateMappingApproval.ts` are retained
shared support and are not retirement paths. Before removal, while every
allowlisted path still exists, build the canonical pre-removal input from the
allowlist, canonical inventory, stopped-unit evidence, separate removal
authorization evidence, and the protected production-artifact hashes. Hash
those inputs into `preRemovalInputHash`; never hash a self-referential
retirement evidence file or call it a pre-removal proof. Require a separate
reviewed `removalAuthorizationId`, remove only the exhaustive allowlist, write
separate post-removal evidence, then prove each path is absent, not a symlink,
and represented by an exact `D` entry in the repository diff.
must not stop/remove the legacy fleet, delete legacy columns, or claim
production completion. Browser and dashboard checks may report only observed
status and cannot substitute for provider, alert, digest, regional, lineage,
or retirement evidence.

9. Run the focused affiliate suites.

       npm test -- --runInBand src/server/affiliateImports/__tests__/affiliateFleetCutover.test.ts src/server/affiliateImports/__tests__/affiliateSupplyPersistence.test.ts src/server/affiliateImports/__tests__/agentGateway.test.ts src/server/affiliateImports/__tests__/agentSupervisor.test.ts

   Expected: all four suites pass.
   Observed: four suites passed with 168 tests passed.
   Observed (2026-08-29): `npm test -- --runInBand src/server/affiliateImports/__tests__/affiliateSupplyPersistence.test.ts -t rollback` passed with `Test Suites: 1 passed, 1 total; Tests: 53 skipped, 3 passed, 56 total; Snapshots: 0 total`. It exercised `persists rollback drill decisions bound to a durable cutover session`, `blocks rollback while the gateway or runner is still running`, and `fails clearly when the durable rollback session is missing`. The strict guard selection `-t 'blocks rollback|forces forward-only|treats evidence recorded exactly at'` also passed 6 tests (50 skipped), preserving `FORWARD_ONLY` for malformed session process evidence, manifest-hash mismatch, inventory-binding mismatch, post-boundary evidence, and the exact-boundary evidence.
   Durable local row inspection: `docker exec mvp-site-db psql -U mvp -d affiliate_rollback_drill_20260829_fix -Atc "SELECT \"id\" || E'|' || \"mode\" || E'|' || \"status\" || E'|' || \"reportHash\" || E'|' || (\"reportJson\"->>'sessionId') FROM \"AffiliateSupplyReconciliationRuns\" WHERE \"mode\" = 'ROLLBACK_DRILL' ORDER BY \"createdAt\""` returned exactly `ROLLBACK_DRILL|BINARY_ROLLBACK_ALLOWED` for row `9cc8d2f4-7460-49cf-8f8d-00e5b47f4816` and `ROLLBACK_DRILL|FORWARD_ONLY` for row `1909bdb7-00f0-4dec-809e-6cd004e33c15`; grouped counts were `CUTOVER_SESSION|1` and `ROLLBACK_DRILL|2`, and both rows carried session `rollback-drill-session-20260829-fix`.

10. Run the TypeScript check.

       npx tsc --noEmit

   Expected: the command exits with code 0.
   Observed: the command passed with no output.

11. Run the full site suite.

       npm run test:ci

   Expected: all site suites pass and route coverage remains above its configured floors.
   Observed: the final run reports 867 suites passed, four suites skipped, 5,289 tests passed, and 28 tests skipped. Route coverage passed for 331 files: statements 65.82% (floor 64%), branches 53.50% (floor 52%), functions 65.20% (floor 63%), and lines 66.92% (floor 65%).

## Validation and Acceptance

The pure tests prove that the same ordered snapshot produces the same input and output hashes; different records or counts change the hashes; the reviewed manifest is bound to the complete independent process inventory ID, canonical hash, and count; missing lineage, duplicate canonical roots, duplicate active claims, active leases, impossible cross-origin links, and unresolved targets produce explicit blocking findings; expired leases produce revoke actions; and a public target with no verifiable target row becomes Last-Known-Good without a successful-refresh timestamp.

The persistence tests prove that dry-run reads do not mutate source, target, claim, or lifecycle delegates; apply rejects an altered report; apply links all available records in one transaction; apply preserves existing public rows; apply creates only Last-Known-Good rows for unverified public targets; apply records `LEGACY_RECONCILED` with observed evidence; and a repeated exact apply replays the durable report without duplicate roots, targets, claims, or transitions.

The preflight tests prove that active Supply Contract, role-contract, prompt-template, gateway, and deployment hashes must match; the expected topology is exactly two Mapping Producers, two Independent Supply Reviewers, and one Coverage Planner, alongside one gateway and one protected replenishment-controller cadence service; all old Goal/controller processes must be stopped; agent container inspection rejects database, storage, provider, repository, and unrestricted backend secrets; and the session-bound rollback command plus durable `ROLLBACK_DRILL` records prove pre-write binary rollback and post-write forward-only containment. The preflight's role-scoped container input covers the seven agent-side containers; the controller is separately required by the deployment topology and redacted container gates. Missing, incomplete, or mismatched session, manifest, process inventory, preflight, or deployment evidence must not produce `BINARY_ROLLBACK_ALLOWED`.

Existing gateway and supervisor suites remain the proof for one happy path, invocation failure/retry, stale generation, provider failure, restart/idempotent replay, alert delivery, and exception-rail history. The full site suite and TypeScript check prove that the migration and control-room projections remain compatible.

## Idempotence and Recovery

Dry-run is read-only except for its immutable report artifact. It can run
repeatedly against an unchanged snapshot and returns the same hashes. Apply is
bound to one report hash, reviewed counts, operator, and nonce. A lost response
can be retried with the same values; immediately before the second APPLY replay,
run `assert_reviewed_database_identity` again and require the same reviewed
`current_database`, `current_user`, and `inet_server_addr()`. The transaction
replays the existing report and transition keys. A changed database snapshot
produces a new input hash and blocks the old apply.

Before the first governed lifecycle write, run the session-bound rollback command and persist a `ROLLBACK_DRILL` record with `BINARY_ROLLBACK_ALLOWED` while both fleets remain stopped. After the first governed receipt, lifecycle transition, demand/wave event, or authoritative write, run the same command and persist a second `ROLLBACK_DRILL` record with `FORWARD_ONLY`. The rollback command, not preflight, makes this decision from the recorded session start and evidence. Missing or mismatched session evidence is also `FORWARD_ONLY`. It never starts the old fleet, deletes public records, drops legacy columns, or rewrites completed lifecycle transitions.

## Artifacts and Notes

The implementation produces a durable reconciliation run with input hash, output hash, report hash, counts for each legacy record kind and claim state, failed invariants, resolution references, contract hashes, operator identity, and apply status. The CLI output is suitable for attachment to issue #70. The governed Compose manifest and redacted preflight captures provide the topology and credential-boundary evidence. The generated reviewed manifest retains the independent process inventory artifact ID, canonical hash, and count so preflight, session, reconciliation, and rollback use the same process evidence. Each drill output retains its session ID, decision, and durable record hash; the database retains both immutable `ROLLBACK_DRILL` records.

## Interfaces and Dependencies

In `apps/site/src/server/affiliateImports/affiliateFleetCutover.ts`, define pure functions named `buildAffiliateLegacyReconciliationReport`, `buildAffiliateCutoverPreflightReport`, `inspectAffiliateAgentContainer`, `hashAffiliateCutoverProcessInventory`, and `decideAffiliateCutoverRollback`. Each returns immutable JSON-compatible data with stable hashes.

In `apps/site/src/server/affiliateImports/affiliateSupplyPersistence.ts`, extend `reconcileLegacyAffiliateSupply` with `isDryRun`, `rolloutCohort`, `operatorId`, `expectedReportHash`, `expectedInputHash`, `expectedCounts`, `expectedCountsHash`, `applyNonce`, `preflight`, and `now` inputs. Keep the default dry-run behavior. Return `inputHash`, `outputHash`, `reportHash`, `counts`, `failedInvariants`, `resolutions`, and `isApplied`.

In `apps/site/prisma/schema.prisma`, add the `LEGACY_RECONCILED` lifecycle command and an `AffiliateSupplyReconciliationRuns` model that stores the report hashes, counts, findings, resolution references, contract and deployment hashes, operator, mode, and apply status. Store the session evidence in the durable run payload and use the row `id` as the cutover session ID. Add the matching migration and regenerate the Prisma client.

In `apps/site/scripts`, add `reconcile-affiliate-legacy-supply.ts`, `preflight-affiliate-cutover.ts`, and `hash-affiliate-cutover-manifest.ts`. The manifest hash command requires both the independently reviewed process-list file and the complete process-inventory file; it writes the process-list hash plus inventory artifact ID, canonical hash, and count. Add `decide-affiliate-cutover-rollback.ts` with the package script `affiliate:cutover:rollback`; it accepts `--session-id`, `--operator`, and optional `--dry-run`, loads the session's recorded start/cohort/manifest/process inventory/preflight/deployment evidence, queries authoritative rows after that boundary, and persists a `ROLLBACK_DRILL` record unless `--dry-run` is requested. Do not expose caller overrides for `--since`, `--manifest`, `--evidence`, or `--rollout-cohort`. Agent services must use the internal gateway address and role-scoped credentials only.

## Revision Note

2026-08-25: Added the blocked-APPLY regression gate, candidate-to-source lineage resolution, source-root target keys, deterministic synthesized target IDs, explicit projection-only canonical public evidence, complete legacy evidence collection, reviewed manifest hashing, lifecycle-stage reconciliation, and post-write snapshot verification. Updated the interface, command evidence, boolean names, and operator instructions to match the current implementation and repository rules.

2026-08-27: Hardened evidence capture with a private mode-0700 directory, restrictive umask, reviewed-container allowlisting, redacted preflight values, and deletion of temporary secret-bearing captures. Added ordered session-bound pre-write and post-write rollback drills that persist durable `ROLLBACK_DRILL` results, and replaced the incorrect preflight rollback claim with the rollback command's recorded decision.
2026-08-25: Bound the reviewed process manifest to the independent process inventory artifact ID, canonical process-record hash, and record count. Updated the manifest generator, preflight and session input validation, durable rollback parsing, focused regression coverage, deployment instructions, and the ExecPlan so an independently changed or incomplete process inventory cannot satisfy the stopped-fleet gate.
2026-08-29/30: The clean-install attempt after the byte-identical base restore failed at `20260822150000_enforce_replenishment_wave_cohort_admission` with PostgreSQL `42P01` because `_AffiliateReplenishmentWaveCohortLosers` disappeared before the later demand `UPDATE`. On 2026-08-30, the historical migration gained explicit `BEGIN;`/`COMMIT;` boundaries around the existing reconciliation statements, and the isolated clean install then applied all 218 migrations successfully.
2026-08-29: Added complete `legacyServiceUnits` to the rollback persistence fixture and fixed its case-normalized `isEnabled` comparison (`DISABLED`/`MASKED` after `upper()`) without weakening strict evidence requirements. The local rollback drill succeeded only after a transaction wrapper was temporarily added around the historical migration in the drill worktree; no clean 217-migration deployment was claimed before the 2026-08-30 migration repair, and no production database or runtime was touched.
2026-08-30: Added explicit transaction boundaries to `20260822150000_enforce_replenishment_wave_cohort_admission/migration.sql`, added focused static Jest coverage, and verified `DATABASE_URL=<redacted local URL ending in /affiliate_migration_clean_20260830_issue70> npx prisma migrate deploy` (Prisma 7.8) applied all 218 migrations successfully.
2026-08-30: Repaired the runbook's strict Coverage Planner replay, lineage, provider, alert, and Portland readbacks to bind only the planner subject's cell/cycle fields and persisted coverage, contract, and source rows; downstream readbacks now bind their persisted tuple without reading fields absent from role subjects. Static verification covered 110 fenced shell blocks, Compose rendering, and fixed manifest hashes. No production runtime or evidence was used.
2026-08-30: Added the protected gateway-mediated replenishment controller to
the governed Compose profile, fixed its safe cadence, image/network/credential
gates, ordered planner-to-controller startup, controller-first containment, and
full evidence-manifest paths. Added the on-demand `HUMAN_DIRECTED_EXECUTOR`
worker binding, exact bounded lease request, worker-authenticated
status/reconcile flow, and redacted lease evidence; corrected the retry
readback to compare sibling sequence fields ...

2026-08-30: Migrated the retained ingestion-result and approval support to
`affiliateIngestionSchemas.ts` and `affiliateMappingApproval.ts`, removed the
legacy Codex goal/loop modules and direct-writer entrypoints, and removed their
package command registrations after migrating the gold-capture caller to the
governed source-intake service. The retirement manifest now distinguishes
retained support from reviewed file edits and validates no-import/no-command
references. Local verification observed 120 runbook shell blocks with valid
`bash -n`, site TypeScript with `tsc --noEmit`, and 18 migrated schema/approval
and package-evidence tests passing; no production runtime or evidence was used.
