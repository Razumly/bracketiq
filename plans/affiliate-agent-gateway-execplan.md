# Define the affiliate Agent Gateway and executable role contracts

This ExecPlan is a living document. Keep the `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections current during the work.

Maintain this document in accordance with `PLANS.md` at the repository root. Run all commands from the paths that this plan gives. A future contributor must be able to resume the work from this file alone.

## Purpose / Big Picture

After this change, BracketIQ can give one affiliate-agent invocation one exact job without giving that invocation production authority. A persistent supervisor asks the internal Agent Gateway for one claim. The supervisor then starts one fresh `codex exec --ephemeral` process. The gateway selects the job, issues a short-lived claim token, serves only listed evidence, executes only typed commands, validates the result, and owns all production writes.

This change replaces prompt prose as the authority boundary. A role contract states what a Coverage Planner, Mapping Producer, Supply Reviewer, or Human-directed Executor can receive and submit. The gateway enforces that contract. A model cannot gain a capability by changing its prompt or output.

A developer can see the change work in three ways. Pure contract tests show stable hashes and deterministic prompts. PostgreSQL integration tests show that claims, receipts, generations, retries, and terminal writes are atomic. A single-claim smoke run completes one claim for each role and shows that forbidden credentials, commands, and direct database writes remain unavailable.

## Progress

- [x] (2026-08-20 17:39Z) Read `PLANS.md`, repository and site instructions, `CONTEXT.md`, ADR 0005, issue #67 and its retry decision comment, the current queue precedents, and the confirmed gateway slice design.
- [x] (2026-08-20 17:39Z) Recorded the fixed review base, confirmed module seams, exact three-attempt retry policy, scope limits, target files, and vertical test sequence in this plan.
- [x] (2026-08-20 18:19Z) Implemented Milestone 1. Added pure contract types, strict parsers, canonical hashes, all four role contracts, the Supply Contract, the deployment contract, typed subjects, commands, terminal results, and deterministic prompts.
- [x] (2026-08-20 18:19Z) Froze the public transactional gateway declarations and exact retry constants in `agentGateway.ts`. Kept invocation failures out of the pure contract module.
- [x] (2026-08-20 18:19Z) Completed 13 vertical red-to-green contract behaviors. The focused Jest file passes 13 tests. The TypeScript check passes. Prettier formatted only the three changed TypeScript files.
- [x] (2026-08-20 18:31Z) Resolved the Milestone 1 self-review findings with four vertical red-to-green tests. Added prompt-template contracts, the complete contract-bundle parser, version-1 capability enforcement, claim identity checks, and a truthful authority projection. The focused file passes 17 tests. TypeScript passes.
- [x] (2026-08-20 20:31Z) Implemented Milestone 2. Added the five additive gateway models, three enums, constraints, partial unique live-claim index, privilege boundary, production dependency adapters, and one Coverage Planner claim with a five-minute lease, 20-minute token/deadline, hashed HMAC capability, deterministic prompt, and immutable claim event.
- [x] (2026-08-20 20:31Z) Implemented Milestone 3. Added serializable 60-second heartbeat receipts and two-transaction manifest-only artifact reads. Artifact reads verify the stored SHA-256 hash, MIME type, byte count, URL safety, and eight-MiB bound before returning bytes. Transaction B reauthorizes the claim.
- [x] (2026-08-20 20:31Z) Implemented Milestone 4 for the confirmed slice. Added the closed transactional `RUN_DISCOVERY_QUERY` adapter path and one typed Coverage Planner terminal result. Terminal completion updates the job and claim by CAS, stores one result and receipt hash, appends one event, and invalidates the token atomically.
- [x] (2026-08-20 20:31Z) Implemented Milestone 5 for the confirmed slice. The operation-by-denial matrix covers claim, heartbeat, artifact, command, terminal result, and failure authorization across wrong identities, generations, token, contracts, lease, and deadline. The isolated PostgreSQL race used a query barrier and observed one winner. The database also rejected a second live claim and event mutation.
- [x] (2026-08-20 20:31Z) Implemented Milestone 6 for admitted slice operations. Claim, heartbeat, artifact, command, and terminal result use canonical request hashes and claim-scoped operation keys. Exact replays create no second receipt or event. Changed input is rejected. Only the identical terminal result can bypass token invalidation, while all five operation kinds reject the invalidated token.
- [x] (2026-08-20 20:18Z) Implemented Milestone 7. Added deterministic schema correction replay, all six invocation failure codes, fresh generation, invocation, and workspace values for each retry, and the exact initial, +5 minute, +15 minute, then `PIPELINE_BLOCKED` policy. The gateway schedules no +45 minute retry. Domain terminal results consume zero invocation failures.
- [x] (2026-08-20 20:18Z) Implemented Milestone 8 at the focused unit seam. External capture reserves one durable `externalOperationKey`. Restart reconciliation calls `recover` and never calls `start` twice. Unknown effects move the receipt, claim, and affected job to `RECONCILIATION_REQUIRED`. Impossible state halts all admission. Expired leases and hard deadlines use CAS and consume one failure once.
- [x] (2026-08-20 20:18Z) Implemented Milestone 9 at the injected #68 seam. A lost lifecycle response remains in one pending receipt. Restart reconciliation recovers and finalizes it without a second lifecycle execution. Lifecycle derivation remains outside this change.
- [x] (2026-08-20 20:18Z) Implemented Milestone 10. Supply Reviewer admission enforces different worker, invocation, and workspace identities. It requires a new read-only workspace and the exact evidence-only manifest.
- [x] (2026-08-20 20:18Z) Implemented Milestone 11. Mapping Producer, Supply Reviewer, and Human-directed Executor use the public gateway. The focused tests cover the complete command and disposition matrix, declarative mapping validation and commit, reviewer isolation, exact human decision matching, and dual human and agent identity events.
- [ ] Implement Milestone 12. Add the one-claim supervisor and credential/container denial checks. Prove that offline open-weight evaluation cannot claim work or publish executable code.
- [x] (2026-08-20 20:42Z) Ran the focused Milestones 2-6 contract/gateway unit file, isolated PostgreSQL integration file, TypeScript check, Prisma validation, Prisma generation, and generated-surface check. Recorded exact evidence below.
- [x] (2026-08-20 20:18Z) Ran the Milestones 7-11 focused unit file after each red and green cycle. The final file passes 50 tests. TypeScript passes. Prisma format, validation, generation, and generated-surface checks pass. Focused Prettier check passes.
- [ ] Add and run the Milestones 7-11 PostgreSQL restart, concurrent expiry, lifecycle response-loss, and hard-deadline integration cases. This continuation did not run the existing database integration file.
- [ ] Run the full site suite, production build, four-role smoke run, restart smoke, and container denial probes. Record exact output in this plan.
- [ ] Obtain separate Standards and Spec reviews against the fixed base `5aa180b721eff7e42eef86583a9f226caa2bb20f`. Resolve every finding. Re-run affected checks.
- [ ] Update all living sections and the acceptance-criterion evidence map. Record the final outcome without doing the #68 or #70 work.

## Surprises & Discoveries

- Observation: The issue body contained an ambiguous reference to retries at 5, 15, and 45 minutes, but the issue comment resolved it before planning began.
  Evidence: The 2026-08-20 issue comment permits three total invocation attempts. Attempt 1 is immediate. Invocation failure 1 admits attempt 2 after five minutes. Invocation failure 2 admits attempt 3 after 15 minutes. Invocation failure 3 blocks the pipeline immediately. The gateway schedules no 45-minute retry.

- Observation: The repository already has useful compare-and-set and transaction patterns, but no current queue is the new authority boundary.
  Evidence: `apps/site/src/server/affiliateImports/sourceMappingQueue.ts` and `coverageAgentQueue.ts` use `updateMany` compare-and-set writes. `sourceMappingQueue.ts` uses serializable transactions and handles Prisma `P2034`. `approvalQueue.ts` compares producer and reviewer identities. The new gateway must reuse these techniques without routing new authority through the old queues.

- Observation: The confirmed design has two different seams, not one large mixed module.
  Evidence: The user confirmed `agentGatewayContracts.ts` as the pure contract seam and `agentGateway.ts` as the public transactional gateway seam. Pure code must not import Prisma, storage, provider, process, clock, random, or environment modules.

- Observation: Invocation failure is transactional gateway state, not a pure role-result contract.
  Evidence: The user requires `AffiliateAgentInvocationFailureEnvelope` and retry policy to remain in `agentGateway.ts`. `agentGatewayContracts.ts` must not export or redefine that envelope.

- Observation: This issue can define the lifecycle adapter and prove receipt safety without defining lifecycle-stage rules.
  Evidence: Issue #68 owns lifecycle derivation. The gateway can pass an expected lifecycle generation, canonical input hash, and receipt ID to an injected lifecycle authority. Tests can use a deterministic in-memory authority. Production wiring must fail closed until #68 supplies its implementation.

- Observation: The isolated worktree did not have installed site dependencies.
  Evidence: The first focused command stopped with `sh: jest: command not found`. `npm ci` in the isolated `apps/site` directory added 1,459 packages. The next run reached the intended red failure because `agentGatewayContracts.ts` did not exist.

- Observation: The existing `stableAgentArtifactSha256` key ordering was useful, but its JSON behavior silently omitted `undefined`, converted non-finite numbers, and accepted non-plain objects.
  Evidence: The second red test expected `{ missing: undefined }` to fail, but the original-shaped implementation did not throw. The green implementation rejects values that canonical JSON cannot represent and rejects non-plain objects.

- Observation: The prompt cannot include the terminal command name in its authority projection and also contain that name exactly once as an instruction.
  Evidence: The authority projection includes only non-terminal commands. The final line contains the only occurrence of `SUBMIT_TERMINAL_RESULT`. The four-role prompt test observes one occurrence for every role.

- Observation: A valid self-hash proves contract integrity. It does not prove that a version-1 role has authorized capabilities.
  Evidence: Before the fix, the role parser accepted correctly rehashed changes to commands, dispositions, input schema, and forbidden effects. The parser now compares version-1 role capabilities with one registered four-role matrix.

- Observation: A self-valid deployment contract can still reference contracts outside the registry input.
  Evidence: The complete bundle parser now parses the Supply Contract, four role contracts, four prompt templates, and deployment contract together. It rejects recomputed deployment contracts with supply, role, or prompt references that differ from the parsed bundle.

- Observation: Filtering terminal commands from a displayed contract or claim makes the retained self-hash misleading.
  Evidence: The renderer now displays one named authority projection. It gives exact source hashes and a computed full claim-envelope hash. It does not display modified self-hashed objects.

- Observation: An already-authorized local PostgreSQL 16 server was healthy, so this slice could run the required real database proof without changing runtime state.
  Evidence: The dedicated `bracketiq_e2e_67_gateway` logical database was created on the existing server. All 195 migrations applied successfully. The focused integration test forced both workers past job selection with a query barrier, then observed one claim, one race winner, the partial unique-index rejection, durable heartbeat and terminal receipts, exact terminal replay, terminal token invalidation, and immutable-event rejection.

- Observation: Prisma query extensions provide a deterministic database race barrier without adding a production test hook.
  Evidence: The integration client pauses each transaction immediately after the eligible-job `findFirst` query. It releases both transactions only after the second selection. The gateway production interface and claim query remain free of test-only callbacks.

- Observation: The exact lease boundary must be exclusive.
  Evidence: A red denial-matrix run showed that a heartbeat at exactly `leaseExpiresAt` renewed the claim. Authorization now treats `leaseExpiresAt <= now` as expired, and the heartbeat CAS requires `leaseExpiresAt > now`.

- Observation: A durable operation key is sufficient to recover an external response loss only when the gateway separates reservation, provider start, and receipt finalization.
  Evidence: The focused restart test recreates the gateway over the same state. Reconciliation calls `recover(externalOperationKey)`, finalizes the receipt, and leaves the `start` call count at one. A second reconciliation reports zero examined receipts and zero transitions.

- Observation: An expired claim can consume the failure budget twice if claim expiry and job retry writes do not share one CAS transaction.
  Evidence: Reconciliation now selects only active expired claims. It compares the claim and job generations, updates the job failure count and claim status in one serializable transaction, and rolls back on either zero-row CAS result. The second focused reconcile reports zero examined claims and zero expired claims.

- Observation: A lost lifecycle response uses the same receipt pattern as an external command but uses the injected lifecycle receipt ID for recovery.
  Evidence: The focused test records one lifecycle execution, recreates the gateway, recovers by receipt ID, finalizes one success event, and observes no second lifecycle execution.

- Observation: A broad `P2002` handler can conceal token, event, or artifact identifier defects as an ordinary lost claim race.
  Evidence: Claim admission now retries only identity-key conflicts that can become exact replay and returns no work only for the live-job race constraints. An unrelated `tokenHash` unique violation returns `INTERNAL_ERROR`.

## Decision Log

- Decision: Use commit `5aa180b721eff7e42eef86583a9f226caa2bb20f` as the fixed review base for the complete implementation.
  Rationale: A fixed base prevents later movement of the branch base from changing review scope. Both independent reviews must inspect the same change set.
  Date/Author: 2026-08-20 / Codex plan writer

- Decision: Put all machine-readable contract values, schemas, canonical hashing, and prompt rendering in `apps/site/src/server/affiliateImports/agentGatewayContracts.ts`.
  Rationale: These operations are deterministic and have no production authority. Keeping them pure makes contract fixtures and hashes easy to verify.
  Date/Author: 2026-08-20 / Codex plan writer

- Decision: Put the public transactional interface, operation union, operation results, typed errors, `AffiliateAgentInvocationFailureEnvelope`, and retry constants in `apps/site/src/server/affiliateImports/agentGateway.ts`.
  Rationale: Invocation failures change claim, job, token, receipt, and retry state. They belong to the transactional authority seam, not to role-authored terminal results.
  Date/Author: 2026-08-20 / Codex plan writer

- Decision: Expose one `perform` method for heartbeat, artifact, command, result, and failure operations.
  Rationale: One discriminated method gives every operation one authorization, idempotency, receipt, and safe-error contract. It prevents separate public methods from drifting.
  Date/Author: 2026-08-20 / Codex plan writer

- Decision: Use three total invocation attempts with retry delays of five and 15 minutes only.
  Rationale: This is the exact decision in the issue comment. Domain results do not consume the budget. Schema corrections remain in one invocation. The third distinct invalid schema submission exhausts that invocation and counts as one invocation failure.
  Date/Author: 2026-08-20 / Codex plan writer

- Decision: Keep existing coverage, mapping, and approval queues live and unchanged.
  Rationale: Issue #70 owns migration, cutover, shutdown, and removal of the current fleet. This issue adds the gateway beside those queues and seeds its test jobs directly.
  Date/Author: 2026-08-20 / Codex plan writer

- Decision: Keep lifecycle derivation outside the gateway.
  Rationale: Issue #68 owns the rules that derive and apply Supply Source lifecycle transitions. This issue defines only the typed lifecycle-authority interface, generation check, receipt contract, and fail-closed production dependency.
  Date/Author: 2026-08-20 / Codex plan writer

- Decision: Store raw IDs and explicit generations without Prisma relation graphs.
  Rationale: This follows the repository ID-centric database model. Transactional compare-and-set conditions and SQL constraints enforce gateway invariants.
  Date/Author: 2026-08-20 / Codex plan writer

- Decision: Keep the Agent Gateway internal. Do not add a Next.js route in this issue.
  Rationale: The confirmed seam is a server module. A later internal transport can translate authenticated requests to `claim` and `perform`. It must call this module instead of copying authority checks.
  Date/Author: 2026-08-20 / Codex plan writer

- Decision: Treat the open-weight stack as offline evaluation only.
  Rationale: Production contract registries and role credential verifiers have no open-weight execution class. Mapping output is declarative data. No gateway command can submit a shell command, repository patch, or executable source.
  Date/Author: 2026-08-20 / Codex plan writer

- Decision: Preserve ordinary array order in canonical JSON and enforce sorting and uniqueness only in schemas for set-like arrays.
  Rationale: Some arrays, such as the six Supply Contract components, the four deployment role references, and the process command, have meaningful order. Sorting every array would change those contracts. Role permissions, dispositions, evidence references, and similar sets reject unsorted or duplicate values.
  Date/Author: 2026-08-20 / Codex Milestone 1 implementer

- Decision: Use strict Zod objects at every public contract level and verify contract hashes after parsing the self-hash-free preimage.
  Rationale: Strict parsing rejects unknown authority fields. Hashing the parsed preimage prevents object key order and an object's own hash from changing the result.
  Date/Author: 2026-08-20 / Codex Milestone 1 implementer

- Decision: Keep `SUBMIT_TERMINAL_RESULT` in the machine-readable role and claim contracts, but omit it from the rendered authority projection.
  Rationale: The authority projection computes its claim-envelope hash before it filters the command. The final completion instruction is the only byte occurrence of the terminal command name.
  Date/Author: 2026-08-20 / Codex Milestone 1 implementer

- Decision: Register one strict prompt-template contract for each role and parse registry input through one complete contract bundle.
  Rationale: The deployment contract self-hash protects its own bytes. The bundle parser also proves that every deployment reference names the exact parsed Supply Contract, role contract, and prompt template.
  Date/Author: 2026-08-20 / Codex Milestone 1 review fixer

- Decision: Enforce version-1 capabilities from one four-role capability matrix.
  Rationale: Recomputing a self-hash must not authorize a new command, disposition, input schema, forbidden-effect set, or retention rule.
  Date/Author: 2026-08-20 / Codex Milestone 1 review fixer

- Decision: Render one version-1 authority projection and one completion section.
  Rationale: The projection names each exact authority hash. It computes the claim-envelope hash from the full parsed claim before it filters the terminal command from the displayed non-terminal command list.
  Date/Author: 2026-08-20 / Codex Milestone 1 review fixer

- Decision: Implement only the Coverage Planner authority through terminal completion in Milestones 2 through 6.
  Rationale: The delegated slice explicitly excludes retry-failure admission, schema corrections, reconciliation, remaining roles, lifecycle derivation, supervisor logic, provider calls, routes, and fleet cutover. `RECORD_FAILURE` still performs full claim authorization before failing closed, so it participates in the stale-scope matrix without admitting retry state.
  Date/Author: 2026-08-20 / Codex Milestones 2-6 implementer

- Decision: Allow an exact successful terminal receipt to select the completed-claim authorization path.
  Rationale: The replay still verifies the token hash, expiry, lease, role, worker, job, invocation, generations, active Supply Contract, role contract, prompt contract, and exact canonical request hash. It bypasses only the invalidation and terminal-state consequences of the original committed result.
  Date/Author: 2026-08-20 / Codex Milestones 2-6 implementer

- Decision: Reconcile due receipts before expired claims and share one bounded request limit across both groups.
  Rationale: Receipt recovery must resolve a possible external or lifecycle effect before claim expiry changes the authoritative claim state. One shared limit bounds restart work.
  Date/Author: 2026-08-20 / Codex Milestones 7-11 implementer

- Decision: Halt only the affected lane for a recoverable unknown effect, and halt all claim admission for an impossible receipt, claim, or job relationship.
  Rationale: An unknown provider response affects one job lane. A contradictory authority relationship means the gateway cannot identify a safe mutation boundary.
  Date/Author: 2026-08-20 / Codex Milestones 7-11 implementer

- Decision: Convert lease and hard-deadline expiry into the same invocation-failure budget as an explicit `TIMEOUT`.
  Rationale: Expiry is one infrastructure failure. The shared CAS path gives failure one +5 retry, failure two +15, and failure three immediate `PIPELINE_BLOCKED`.
  Date/Author: 2026-08-20 / Codex Milestones 7-11 implementer

- Decision: Recover lifecycle response loss only through `AffiliateAgentLifecycleAuthority.recover(receiptId)`.
  Rationale: The gateway owns receipt safety. Issue #68 owns lifecycle derivation and the actual transition rules.
  Date/Author: 2026-08-20 / Codex Milestones 7-11 implementer

## Outcomes & Retrospective

Milestone 1 is complete. The pure contract seam now parses and hashes the Supply Contract, deployment contract, role contracts, evidence manifests, typed claims, closed commands, and typed terminal results. The renderer produces deterministic LF-only prompts with one terminal completion instruction. The transactional seam now declares the future gateway interface, safe results and errors, invocation-failure envelope, and the exact 60-second heartbeat, 300-second lease, 1,200-second deadline, three-correction, and three-attempt retry policy. The focused file passes 13 tests, and TypeScript passes. Milestones 2 through 12 remain. No Prisma model, persistence implementation, process launch, route, lifecycle derivation, fleet cutover, full suite, build, or database command was added or run.

The Milestone 1 self-review fixes are complete. The registry can now parse one complete, internally consistent contract bundle. Version-1 role contracts cannot authorize a capability change through a recomputed self-hash. Claims reject Supply Source mismatches and producer/reviewer identity reuse. Prompts display one truthful authority projection and one terminal completion instruction. The focused file now passes 17 tests, and TypeScript passes.

Milestones 2 through 6 are complete for the user-confirmed Coverage Planner slice. The gateway now owns one serializable claim, heartbeats, manifest-only artifact reads, one closed command, and one atomic terminal result. The database stores only the token hash, nonce, and key version; every claim operation rechecks the scoped capability and active contract bundle. A real PostgreSQL test proves the claim race, CAS generations, partial unique live-claim constraint, durable idempotency, atomic terminal completion, exact terminal replay, token invalidation, and immutable events. Failure admission and Milestones 7 through 12 remain intentionally outside this slice.

Milestones 7 through 11 are complete at the focused unit seam. The gateway now implements schema correction exhaustion, the exact three-attempt invocation policy, public external capture, lost-response recovery, bounded receipt and expiry reconciliation, hard-deadline expiry, impossible-state containment, lifecycle receipt recovery, reviewer isolation, declarative mapping validation and commit, and all four role contracts through the public interface. The final focused file passes 50 tests. TypeScript, Prisma checks, and focused formatting pass. This continuation did not run database integration, the full suite, the production build, four-role smoke, restart smoke, or containment probes. Milestone 12 supervisor and containment work remains.

## Context and Orientation

Work in the dedicated worktree `/Users/elesesy/StudioProjects/bracketiq-issue-67` on branch `issue/67-agent-gateway`. Do not edit `/Users/elesesy/StudioProjects/bracketiq`. Run site commands from `/Users/elesesy/StudioProjects/bracketiq-issue-67/apps/site`.

BracketIQ uses Next.js and TypeScript in `apps/site`. Prisma defines the PostgreSQL schema in `apps/site/prisma/schema.prisma`. The generated Prisma client lives under `apps/site/src/generated/prisma`. `apps/site/src/lib/prisma.ts` provides the application client.

The current affiliate system has three separate queue implementations. `apps/site/src/server/affiliateImports/coverageAgentQueue.ts` selects Coverage Planner work. `sourceMappingQueue.ts` selects Mapping Producer work. `approvalQueue.ts` selects reviewer work and contains an existing producer/reviewer identity comparison. These modules are precedents only. They do not become dependencies of the Agent Gateway. Issue #70 will later move production work from these queues to the new gateway.

An Agent Gateway is an internal server module that holds authority for agent work. An agent invocation asks it to read one listed artifact, run one typed command, or submit one result. The invocation never receives a general database, storage, provider, repository, backend, or admin credential.

A role contract is a versioned machine-readable object for one agent role. It defines typed input, permitted gateway commands, terminal dispositions, forbidden effects, and retention. Role contracts exist for `COVERAGE_PLANNER`, `MAPPING_PRODUCER`, `SUPPLY_REVIEWER`, and `HUMAN_DIRECTED_EXECUTOR`.

A Supply Contract is the active versioned policy aggregate for affiliate supply. It contains independently versioned and hashed components for coverage applicability, search strategies, supply targets and market tiers, freshness, mapping evidence, and lifecycle evidence. The aggregate hash covers the ordered component names, versions, hashes, and canonical payloads.

A deployment contract binds executable code to policy. It contains the gateway version, each role-contract version and hash, each prompt-template version and hash, the expected supervisor and invocation topology, and the active Supply Contract version and hash. A claim stops if any active value differs from the immutable deployment snapshot.

A claim envelope is immutable input for one invocation. It contains the queue and lane, gateway job ID, claim ID, optional Supply Source ID, claim generation, optional lifecycle generation, contract versions and hashes, worker and invocation identities, claim and expiry times, evidence manifest, subject, and permitted commands.

A claim generation is an integer that increases once for each successful claim of one job. A lifecycle generation is the version of the applicable Supply Source lifecycle. Every operation sends both values. A stale value cannot mutate state.

Compare-and-set, or CAS, means that a database update succeeds only if the row still has the values that the caller read. The gateway uses `updateMany` with the old status, active claim, generation, and eligibility time. A zero-row result loses the race.

An idempotency key names one request. The gateway stores a canonical request hash with that key. An exact replay returns the stored response and performs no second effect. Reuse of the same key with different input returns `IDEMPOTENCY_KEY_REUSED`.

An invocation failure is an infrastructure or protocol failure. It is not a business decision. The exact failure codes are `MALFORMED_OUTPUT`, `STALE_GENERATION`, `PROCESS_CRASH`, `TIMEOUT`, `TERMINAL_SUBMISSION_FAILURE`, and `SCHEMA_CORRECTIONS_EXHAUSTED`. Source incompatibility, reviewer rejection, empty-state failure, and contract gaps are domain results. Domain results do not consume the invocation retry budget.

A result token is an opaque capability string with the prefix `agw1`. A capability grants a narrow action. The token is valid only for one claim, generation pair, role, worker, invocation, active Supply Contract, evidence manifest, and permitted-command set. The database stores only its SHA-256 hash, random nonce, and signing-key version. The HMAC signing key stays outside the database and outside the model process.

A receipt is the durable record for one gateway operation. It stores request and response hashes, bounded safe output, status, and recovery data. It never stores a raw token, credential, provider secret, complete artifact body, or unbounded model log.

A schema correction is a non-terminal response to typed model output that does not match the role result schema. One invocation can make at most three distinct invalid submissions. The first and second return deterministic correction prompts. The third records `SCHEMA_CORRECTIONS_EXHAUSTED` as one invocation failure. An exact replay does not increment the count.

Reviewer isolation means more than comparing names. A Supply Reviewer must have a different worker ID, invocation ID, and workspace ID from the producer. The reviewer receives a new read-only workspace. Its manifest contains only the committed package, durable evidence, deterministic validation output, and active Supply Contract. It does not contain producer scratch files, prompts, logs, or a writable repository.

## Scope Boundaries

This plan implements issue #67 only. It defines executable contracts, authority checks, persistent gateway state, the Prisma gateway, dependency adapters, a one-claim supervisor, reconciliation, and proof for all four roles.

Issue #68 remains out of scope. Do not derive lifecycle stages in this change. Do not copy lifecycle rules into `prismaAgentGateway.ts`. Define `AffiliateAgentLifecycleAuthority` so #68 can supply a production implementation. The gateway passes an exact lifecycle generation, canonical input hash, and receipt ID. Production construction must fail closed when a claim needs lifecycle authority and #68 is not installed.

Issue #70 remains out of scope. Do not backfill jobs from `AffiliateCoverageAgentJobs`, `AffiliateSourceMappingJobs`, or `AffiliateApprovalJobs`. Do not change their workers, scripts, timers, or statuses. Do not route production traffic to the new gateway. Do not remove old Goal scripts, skills, queue code, tables, aliases, exports, or containers.

Do not add a public or admin HTTP route. Do not add a generic shell, URL fetch, storage operation, provider call, SQL operation, or repository-write command. Do not permit arbitrary executable mapping code.

## Plan of Work

Start with a red pure-contract test in `apps/site/src/server/affiliateImports/__tests__/agentGateway.test.ts`. Add `agentGatewayContracts.ts` without imports from Prisma or runtime services. Define independently versioned Supply Contract components, deployment contracts, four role contracts, claim and terminal envelopes, the closed command union, Zod parsers, canonical JSON hashing, and deterministic prompt rendering. Freeze representative fixtures in the test. Prove that object key order does not change a hash, one changed contract field does change it, and the same role contract plus claim produces byte-identical prompt text. Prove that the prompt has exactly one terminal completion command.

Next, add the public transactional types in `agentGateway.ts`. Define `AffiliateAgentInvocationFailureEnvelope` here. Define the retry constants here. Add the one `claim`, one `perform`, and one `reconcile` interface. Define conditional operation results and a safe typed error. Keep this file free of Prisma implementation details.

Add the adapter types in `agentGatewayAdapters.ts`. These types isolate clocks, identifiers, role credentials, workspace attestations, token signing, active contracts, artifacts, commands, lifecycle authority, and process launch. Keep adapters closed and typed. Do not provide a generic command adapter.

Add the five gateway models and three state enums to `apps/site/prisma/schema.prisma`. Create the additive migration `apps/site/prisma/migrations/20260820180000_add_affiliate_agent_gateway/migration.sql`. The migration creates the new tables, checks, indexes, and explicit privilege boundaries. It does not read or update old queue rows.

Implement `createPrismaAffiliateAgentGateway` in `prismaAgentGateway.ts` through vertical behavior slices. Make each slice red before production code. Use short serializable transactions for state changes. Retry only bounded Prisma `P2034` transaction conflicts. Never retry an unknown provider or lifecycle effect without reading its durable receipt.

Add `agentSupervisor.ts` last. It asks for one claim, creates one fresh workspace, starts one `codex exec --ephemeral`, sends heartbeats every 60 seconds, handles at most three schema corrections in that same process, submits one result or failure, destroys the workspace, and exits. It contains no queue selection, permission, retry, lifecycle, or reconciliation policy.

After focused checks pass, use the dedicated database described below for race, restart, receipt, grant, and denial checks. Then run the full site suite and build. Run one smoke claim for each role. Finish with two separate code reviews against the fixed base. One review checks repository standards. The other checks this issue and the acceptance map.

## Vertical TDD Milestones

### Milestone 1: Pure contracts and deterministic prompts

Write failing tests for the contract fixtures before adding contract implementation. At the end, all four role contracts have explicit versions, hashes, typed inputs, permitted commands, terminal dispositions, forbidden effects, and retention. Supply Contract components and the deployment contract have independent versions and hashes.

The prompt renderer takes exactly one active role contract and one parsed claim envelope. It uses fixed heading order, fixed line endings, canonical JSON, and the role prompt-template version. It reads no clock, random source, file, process environment, Goal prose, or repository skill. Its output ends with exactly one terminal completion instruction for `SUBMIT_TERMINAL_RESULT`. A repeated render is byte-identical.

Run the focused unit test. Expect the tests named `hashes canonical contract fixtures`, `changes a hash when a contract field changes`, `parses all four role fixtures`, `rejects a role-forbidden command`, `renders a byte-identical prompt`, and `renders exactly one terminal completion command` to pass.

### Milestone 2: One Coverage Planner claim

Write a failing gateway test for one eligible `COVERAGE_PLANNER` job. Add the database schema, token codec seam, and the smallest Prisma claim path that makes it pass. A claim request contains a globally unique idempotency key, one role-scoped credential, role, worker ID, invocation ID, and signed workspace attestation.

The claim transaction first verifies the role credential and workspace attestation. It then loads the active deployment and Supply Contract. In one serializable transaction, it selects one eligible job, verifies topology and contract hashes, increments `claimGeneration` from zero to one, creates the claim, creates its artifact scope, sets `activeClaimId`, and appends event sequence one. The transaction returns no raw token. The gateway mints the token only after commit.

Set `claimedAt` from the injected clock. Set the initial lease to the earlier of five minutes after claim or the hard deadline. Set both token expiry and hard deadline to 20 minutes after claim. Return a deterministic prompt, 60-second heartbeat interval, lease time, and deadline. Prove one claim event exists.

### Milestone 3: Heartbeat and one artifact

Write failing tests for a heartbeat at 60 seconds and one listed evidence artifact. An accepted heartbeat extends the lease to the earlier of five minutes after the heartbeat or the hard deadline. It stores one receipt and one event in one short transaction.

Artifact reads use two transactions. Transaction A validates the full claim scope, verifies the exact evidence reference, and reserves a receipt. The artifact adapter reads immutable `File`-backed content outside the transaction. It verifies the stored content hash, MIME type, byte count, URL safety, and byte limit. Transaction B rechecks the active claim and completes the receipt. If the claim became terminal or expired, return no bytes. Reject an artifact that is not in `AffiliateAgentGatewayArtifacts` for this claim.

### Milestone 4: One command and one terminal domain result

Write a failing test for one allowed Coverage Planner command and a valid terminal domain result. The command map must resolve a closed command name to either a transactional handler or an external handler. It must have no fallback handler.

A transactional command runs authorization, receipt reservation, typed adapter call, state write, receipt completion, and event append in one serializable transaction. An external provider or capture command uses transaction A to reserve a receipt and gateway-generated `externalOperationKey`. It invokes the provider outside the transaction. It stores returned evidence through the artifact adapter. Transaction B verifies the artifact, updates production projections, completes the receipt, and appends the event.

A terminal result transaction parses the envelope. It validates the exact role disposition, reason codes, evidence subset, payload, generations, token, and active contracts. It applies an allowed owned transactional command if required. It stores the terminal receipt and result hash, completes the job and claim, invalidates the token, clears `activeClaimId` by CAS, and appends events. After commit, every operation returns `TOKEN_INVALIDATED` except the one identical terminal replay described in Milestone 6.

### Milestone 5: Claim race and stale scope

Write the real PostgreSQL test before changing the claim query. Race two workers against one eligible job. Use a barrier so both requests enter selection before either finishes. The partial unique live-claim index and job CAS must leave exactly one active claim. The loser receives `null` when no other eligible work exists.

Use table-driven tests for claim, heartbeat, command, artifact, result, and failure operations. Each operation must reject the wrong role, worker, invocation, job, claim generation, lifecycle generation, expired token, stale Supply Contract, changed deployment contract, expired lease, and hard deadline. Also prove command and artifact scope denial. The error must contain a safe code and safe message. It must not contain raw database or provider text.

### Milestone 6: Idempotency and terminal replay

Write one exact replay and one changed-input test for claim, heartbeat, artifact, command, result, and failure. Canonicalize each input with the pure hash function. Scope operation keys to `(claimId, idempotencyKey)`. Store claim request identity globally as `claimRequestId` and `claimRequestHash`.

An exact claim replay returns the same grant and reconstructs the same token through the token codec. An exact operation replay returns the stored response and performs no new write. It does not increment schema-correction or failure counters. A changed operation kind or input under the same key returns `IDEMPOTENCY_KEY_REUSED`.

An identical terminal result replay can bypass only `TOKEN_INVALIDATED`. It must still pass token hash, token expiry, role, worker, job, invocation, generation, and active Supply Contract checks. No heartbeat, artifact, command, changed result, or failure can use an invalidated token.

### Milestone 7: Schema correction and invocation retry

Write tests with an injected UTC clock. Submit three distinct schema-invalid results in one invocation. The first invalid submission returns `SCHEMA_CORRECTION_REQUIRED` with submission number one, two remaining submissions, deterministic issues, and a deterministic correction prompt. The second returns submission number two and one remaining submission. The third does not offer a fourth submission. It atomically records the invocation failure code `SCHEMA_CORRECTIONS_EXHAUSTED`.

Apply the retry policy in the same terminal failure transaction. Attempt 1 starts as soon as the initial job has `nextAttemptAt <= now`. Invocation failure 1 sets count one, `RETRY_WAIT`, and `nextAttemptAt = failedAt + 5 minutes`. Invocation failure 2 sets count two, `RETRY_WAIT`, and `nextAttemptAt = failedAt + 15 minutes`. Invocation failure 3 sets count three, `PIPELINE_BLOCKED`, and `pipelineBlockedAt = failedAt`. It stores no next retry time. There is no +45 minute retry.

Prove that `MALFORMED_OUTPUT`, `STALE_GENERATION`, `PROCESS_CRASH`, `TIMEOUT`, `TERMINAL_SUBMISSION_FAILURE`, and `SCHEMA_CORRECTIONS_EXHAUSTED` use this budget. Prove that source incompatibility, review rejection, empty-state failure, contract gap, and every other role-valid terminal domain result do not increment `invocationFailureCount`. Keep the producer/reviewer bounded three-pass repair count outside this module.

### Milestone 8: Restart reconciliation

Write the pending external-receipt test before adding reconciliation. Stop the test after an external adapter reports a side effect but before transaction B completes. Recreate the gateway with the same database. `reconcile` reads the pending receipt and calls `recover(externalOperationKey)`. It then finalizes the stored result once. It never calls `start` again for the same key.

Process a bounded batch. Use one short transaction for each claim or receipt. Expired lease and hard-deadline reconciliation uses CAS before it records an invocation failure and retry admission. An external adapter that cannot determine whether an effect occurred sets receipt, claim, and job to `RECONCILIATION_REQUIRED`. It halts admission for the affected lane. A duplicate live claim or impossible lifecycle receipt halts global gateway admission with `GATEWAY_ADMISSION_HALTED`.

### Milestone 9: Lifecycle receipt safety without lifecycle derivation

Write a deterministic in-memory `AffiliateAgentLifecycleAuthority` for tests. It accepts only an exact expected lifecycle generation, canonical input hash, and gateway receipt ID. Simulate a lifecycle CAS that succeeds, followed by response loss. Recreate the gateway and reconcile. The gateway first reads the lifecycle receipt. It must return the existing result and must not apply the transition twice.

Do not define current or next lifecycle stages. Do not inspect Supply Source fields to derive a stage. Do not implement the production lifecycle authority. If production construction receives a deployment that permits a lifecycle command but no #68 authority is installed, fail construction or command admission with a safe closed error.

### Milestone 10: Reviewer isolation

Write a Mapping Producer result that commits one declarative package and its content hash. Try to claim its review with the same worker ID, then the same invocation ID, then the same workspace ID. Expect `PRODUCER_REVIEWER_IDENTITY_REUSED` or `REVIEW_WORKSPACE_INVALID` as applicable.

Claim with three distinct identities. Verify the signed workspace attestation says `READ_ONLY`. Verify the manifest has only the committed package, durable evidence, deterministic validation output, and active Supply Contract. Verify it excludes producer scratch files, prompt history, model logs, and repository files. Reject every package-edit, repository-write, shell, generic fetch, storage, and provider command. The database check `workspaceMode = 'READ_ONLY'` provides a second enforcement layer.

### Milestone 11: Remaining roles and capability matrix

Run a complete Mapping Producer, Supply Reviewer, and Human-directed Executor claim through the same `AffiliateAgentGateway` interface. A Mapping Producer can submit only a schema-valid declarative package, bounded repair, source incompatibility, or contract gap. The parser rejects functions, script fields, command strings, repository patches, and unknown executable fields. It cannot mutate a live mapping.

A Supply Reviewer can approve, activate, request producer repair, assess regression, assess exclusion, reject one exact target, or require Human Review. Its terminal payload must match that exact disposition. Reviewer and producer identities remain different.

A Human-directed Executor claim contains one case ID, one lifecycle generation, one recorded human decision, its canonical decision hash, reviewer evidence, and one permitted lifecycle command. The gateway checks the stored decision hash and permits only that command. It records both the human actor and executing agent identity.

Use a full role-by-command and role-by-disposition test matrix. Every allowed cell must succeed. Every forbidden cell must return `ROLE_NOT_ALLOWED`, `COMMAND_NOT_PERMITTED`, or `TERMINAL_DISPOSITION_NOT_PERMITTED` without calling an adapter.

### Milestone 12: One-claim supervisor and containment

Write supervisor tests before adding process logic. `runAffiliateAgentInvocation` requests at most one claim. It creates one unique workspace. It starts exactly `codex exec --ephemeral` with one rendered prompt. It never starts a nested Goal or a claim loop. It sends a heartbeat every 60 seconds until result or the 20-minute deadline. It handles at most three schema corrections inside the same process. It records one invocation failure for process crash or timeout. It always destroys the workspace.

Pass a strict child environment allowlist. The child may receive only its model credential, internal gateway address or supervisor channel, exact claim envelope, rendered prompt, and claim token. Remove `DATABASE_URL`, storage keys, provider keys, general backend secrets, admin credentials, repository credentials, SSH agent variables, and host repository paths. Mount reviewer evidence read-only. Do not mount `.git` or writable source.

Add an execution-class field to the signed workspace attestation. Production role contracts permit only the production Codex execution class. `OFFLINE_OPEN_WEIGHT_EVALUATION` has no production role credential verifier and no production command adapter. Its claim must fail before queue selection. Its output remains offline data. The declarative parser and command union make executable publication unavailable.

Use the isolated PostgreSQL role and the container probe in `Validation and Acceptance`. Prove that an agent identity cannot insert, update, or delete a gateway, affiliate, `File`, storage, provider, or lifecycle row. Then complete one exact claim through the supervisor/gateway path with the same restricted child environment.

## Exact Target Files

Hand-edit only the following implementation files unless a discovery requires a documented Decision Log revision before the edit:

- `apps/site/src/server/affiliateImports/agentGatewayContracts.ts` is new. It is the pure contract seam.
- `apps/site/src/server/affiliateImports/agentGateway.ts` is new. It is the public transactional gateway seam.
- `apps/site/src/server/affiliateImports/agentGatewayAdapters.ts` is new. It contains internal dependency adapter types and production dependency assembly. Do not re-export these types from `agentGateway.ts`.
- `apps/site/src/server/affiliateImports/prismaAgentGateway.ts` is new. It implements all Prisma CAS, transaction ordering, tokens, receipts, retry admission, and reconciliation.
- `apps/site/src/server/affiliateImports/agentSupervisor.ts` is new. It runs one claim and one fresh ephemeral Codex invocation.
- `apps/site/src/server/affiliateImports/__tests__/agentGateway.test.ts` is new. It contains pure contract, interface, supervisor, capability, and role-matrix behavior tests with internal fakes.
- `apps/site/src/server/affiliateImports/__tests__/agentGateway.database.integration.test.ts` is new. It contains real PostgreSQL claim-race, CAS, receipt, restart, grant, and lifecycle-receipt tests. Guard it with `RUN_DATABASE_INTEGRATION === '1'` like current database integration tests.
- `apps/site/prisma/schema.prisma` receives only additive gateway enums and models.
- `apps/site/prisma/migrations/20260820180000_add_affiliate_agent_gateway/migration.sql` is new. It receives only additive DDL, constraints, indexes, and privilege rules.

`npm run prisma:generate` will update generator-owned files under `apps/site/src/generated/prisma/**`. Do not hand-edit them. Review and retain only changes that the five new models and three enums require. No other hand-authored source, route, queue, script, skill, ADR, deployment, mobile, or package file is in scope. Update this ExecPlan as implementation evidence changes.

## Database Design and Isolation

Add these Prisma enums:

    enum AffiliateAgentGatewayJobStatus {
      QUEUED
      CLAIMED
      RETRY_WAIT
      COMPLETED
      PIPELINE_BLOCKED
      RECONCILIATION_REQUIRED
    }

    enum AffiliateAgentGatewayClaimStatus {
      ACTIVE
      COMPLETED
      FAILED
      EXPIRED
      REVOKED
      RECONCILIATION_REQUIRED
    }

    enum AffiliateAgentGatewayReceiptStatus {
      PENDING
      SUCCEEDED
      FAILED
      UNKNOWN
    }

Add `AffiliateAgentGatewayJobs` with the fields `id`, timestamps, unique `dedupeKey`, queue, lane, role, subject type and ID, optional Supply Source ID, optional expected lifecycle generation, status, priority, `nextAttemptAt`, `claimGeneration`, unique optional `activeClaimId`, optional `parentClaimId`, `invocationFailureCount`, `lastInvocationFailedAt`, `pipelineBlockedAt`, terminal disposition, result hash, result JSON, terminal receipt ID, `finishedAt`, and `eventSequence`. Index claim selection by role, lane, status, next attempt, priority, and creation time. Also index queue/status/next-attempt, Supply Source/status, and parent claim.

Add `AffiliateAgentGatewayClaims` with immutable job, parent, generation, queue, lane, role, worker, invocation, and workspace identity. Store workspace mode and attestation hash. Store claim status and global claim request ID/hash. Store claim, heartbeat, lease, hard-deadline, and terminal times. Store token nonce, token hash, token-key version, token expiry, and token invalidation. Store deployment, role, prompt, and Supply Contract versions and hashes. Store claim-envelope, evidence-manifest, and permitted-command hashes. Store permitted command names, schema correction count, terminal receipt, safe failure details, and diagnostic retention. Make `(jobId, claimGeneration)` unique. Make invocation ID, workspace ID, claim request ID, token hash, and terminal receipt ID unique where specified.

Add `AffiliateAgentGatewayArtifacts` with claim and generation, exact evidence reference, evidence kind, source artifact ID, `File` ID, content hash, MIME type, byte size, access mode, optional creating claim, retention class, retention deadline, and pin status. Make `(claimId, evidenceRef)` unique. Index claim/kind, source artifact, File, content hash, and retention.

Add `AffiliateAgentGatewayOperationReceipts` with claim, job, generation, idempotency key, operation kind, optional command name, request hash, receipt status, response hash and JSON, safe error code, optional unique external operation key, start and completion times, reconciliation time, retention class, and retention deadline. Make `(claimId, idempotencyKey)` unique. Index job/time, claim/operation/time, pending reconciliation, and retention.

Add `AffiliateAgentGatewayEvents` as an append-only audit record. Store unique event key, job, optional claim and receipt, sequence, event type, actor kind and ID, role, request/input/output hashes, reason codes, bounded payload, retention class, and retention deadline. Make `(jobId, sequence)` unique. Index claim/sequence, receipt, event type/time, and retention.

The SQL migration must add constraints that Prisma cannot express. Create a partial unique index on claims by `jobId` where `endedAt IS NULL`. Check `claimGeneration > 0`. Check that lifecycle generation is null or non-negative. Check invocation failures and schema corrections are each between zero and three. Check lease expiry is not after the hard deadline. Check token expiry equals the hard deadline. Check Supply Reviewer workspace mode is `READ_ONLY`. Check that terminal claim states have both `endedAt` and `tokenInvalidatedAt`.

The database role names are exact. `bracketiq_affiliate_gateway` is the internal gateway role. `bracketiq_affiliate_lifecycle` is the future #68 lifecycle role. `bracketiq_affiliate_agent` is the denied model-container role. This migration does not create production login roles. It uses conditional PostgreSQL blocks so deploys without provisioned roles still succeed. Revoke all privileges on the five gateway tables and their sequences from `PUBLIC` and `bracketiq_affiliate_agent` when that role exists. The agent role also receives no privilege on existing affiliate, `File`, storage, provider, or lifecycle tables. When the gateway role exists, grant it `SELECT, INSERT, UPDATE` on jobs, claims, and operation receipts; `SELECT, INSERT` on artifacts; and `INSERT` on events. Grant only required sequence use. Event repair is append-only. Do not grant `DELETE`, `TRUNCATE`, ownership, role membership, schema creation, or bypass-row-security privileges. Do not grant the future lifecycle role in this migration. Add the three role names to the deployment contract topology so configuration drift changes the deployment hash.

Use one authorized local PostgreSQL server. Run at most one copy of `apps/site/docker-compose.yml`. The issue database name must be exactly `bracketiq_e2e_67_gateway`, which follows `docs/agents/workstream-database-isolation.md`. Scope `DATABASE_URL` and `DIRECT_URL` to the dedicated worktree process.

Before any database command, parse both URLs. Stop unless the hostname is `127.0.0.1` or `localhost` and the database name is `bracketiq_e2e_67_gateway`. Do not start, stop, restart, or reconfigure PostgreSQL, Compose, or a container under this plan. If no authorized local PostgreSQL server is available, record the blocked verification and request explicit current authorization for the exact runtime before a state change.

For the repository Compose defaults on an already-running authorized server, create the logical issue database if it does not exist:

    PGPASSWORD=mvp_password createdb \
      --host=127.0.0.1 \
      --port="${POSTGRES_PORT:-5432}" \
      --username=mvp \
      bracketiq_e2e_67_gateway

Set the isolated URLs in the same shell:

    export DATABASE_URL="postgresql://mvp:mvp_password@127.0.0.1:${POSTGRES_PORT:-5432}/bracketiq_e2e_67_gateway?schema=public"
    export DIRECT_URL="$DATABASE_URL"
    export RUN_DATABASE_INTEGRATION=1

Apply the full migration chain with `npm run migrate:deploy`. Run `npx prisma migrate status` and continue only when it reports no pending migration. Tests must create rows with a unique test-run prefix and delete only rows with that prefix in reverse dependency order. Do not truncate shared tables. Recreate only `bracketiq_e2e_67_gateway` when migration histories diverge. Never repair an integration failure by editing data in another database.

## Interfaces and Exported Symbols

### Pure contract module

`apps/site/src/server/affiliateImports/agentGatewayContracts.ts` must export these stable public contract symbols:

    AffiliateAgentRole
    AffiliateAgentExecutionClass
    AffiliateAgentSupplyContractComponentName
    AffiliateAgentSupplyContractComponent
    AffiliateAgentSupplyContract
    AffiliateAgentDeploymentContract
    AffiliateAgentRoleContract
    AffiliateAgentPromptTemplate
    AffiliateAgentContractBundle
    AffiliateAgentPromptAuthorityProjection
    AffiliateAgentEvidenceManifestEntry
    AffiliateAgentEvidenceManifest
    AffiliateAgentSubject
    AffiliateAgentCommand
    AffiliateAgentTerminalDisposition
    AffiliateAgentTerminalResultEnvelope
    AffiliateAgentClaimEnvelope
    AffiliateAgentSchemaIssue
    AFFILIATE_AGENT_ROLE_CONTRACTS
    AFFILIATE_AGENT_PROMPT_TEMPLATES
    affiliateAgentSupplyContractSchema
    affiliateAgentDeploymentContractSchema
    affiliateAgentRoleContractSchema
    affiliateAgentPromptTemplateSchema
    affiliateAgentContractBundleSchema
    affiliateAgentClaimEnvelopeSchema
    affiliateAgentTerminalResultEnvelopeSchema
    canonicalizeAffiliateAgentValue
    hashAffiliateAgentValue
    projectAffiliateAgentPromptAuthority
    renderAffiliateAgentPrompt

`AffiliateAgentRole` is the exact union `COVERAGE_PLANNER | MAPPING_PRODUCER | SUPPLY_REVIEWER | HUMAN_DIRECTED_EXECUTOR`. `AffiliateAgentExecutionClass` is the exact union `PRODUCTION_CODEX | OFFLINE_OPEN_WEIGHT_EVALUATION`. Production role contracts permit only `PRODUCTION_CODEX`.

`AffiliateAgentSupplyContractComponentName` has the exact names `COVERAGE_APPLICABILITY`, `SEARCH_STRATEGIES`, `SUPPLY_TARGETS_AND_MARKET_TIERS`, `FRESHNESS`, `MAPPING_EVIDENCE`, and `LIFECYCLE_EVIDENCE`. Each component has a positive integer version, SHA-256 hash, and typed canonical payload. The aggregate lists each component once in that fixed order and has its own version and hash.

`AffiliateAgentDeploymentContract` contains a positive version, gateway version, active Supply Contract version and hash, all four role versions and hashes, all four prompt-template versions and hashes, and expected topology. Expected topology requires one claim, one fresh workspace, `codex exec --ephemeral`, no nested Goal, no claim loop, no context reuse, and the production execution class.

`AffiliateAgentRoleContract` contains role, positive version, contract hash, prompt-template version and hash, typed input schema identifier, permitted command names, terminal dispositions, forbidden effects, retention rules, and production execution class. Retention is exact. Authoritative result, lifecycle, human-decision, evidence, and idempotency receipts are retained indefinitely. Failed-invocation diagnostics and bounded logs are retained for 14 days. The child workspace is destroyed after terminal completion or failure.

`AffiliateAgentPromptTemplate` is a strict, independently hashed version-1 contract. Its heading order is `AUTHORITY_PROJECTION` and `COMPLETION`. `AffiliateAgentContractBundle` parses one Supply Contract, all four role contracts, all four prompt templates, and one deployment contract. It rejects every deployment reference that does not match the parsed bundle.

`AffiliateAgentPromptAuthorityProjection` names the exact role, deployment, Supply Contract, prompt-template, claim-envelope, and evidence-manifest hashes. It includes the claim identities, generations, subject, non-terminal commands, terminal dispositions, and forbidden effects. It has no retained generic `hash` field from a modified source object.

`AffiliateAgentCommand` is a closed discriminated union. It includes only typed claim-scoped capture/provider requests, declarative package parsing and validation, package commit, and exact lifecycle commands required by the four role contracts. Every member has a literal `type` and typed data. It has no arbitrary URL, path, SQL, shell, repository patch, source-code, provider-name, or storage-key member. `SUBMIT_TERMINAL_RESULT` exists as the terminal completion command in the claim and prompt. `AffiliateAgentClaimOperation` excludes it from `EXECUTE_COMMAND` and submits it through `SUBMIT_RESULT`.

`AffiliateAgentSubject` is an exact role-discriminated union. A Coverage Planner subject contains `coverageCellId` and `assessmentCycleId`. A Mapping Producer subject contains `supplySourceId`, `mappingJobId`, and pass number from one through three. A Supply Reviewer subject contains `supplySourceId`, producer claim ID, producer worker ID, producer invocation ID, producer workspace ID, committed package hash, and review pass from one through three. A Human-directed Executor subject contains `caseId`, recorded human actor ID, decision hash, reviewer claim ID, and one `lifecycleCommandRef`. The claim envelope adds the active contracts and evidence manifest. Do not accept a free-form subject object.

The `AffiliateAgentCommand` literal names and role permissions are exact:

- `RUN_DISCOVERY_QUERY` is permitted only for Coverage Planner. Its data contains claim-listed `strategyRef` and `queryRef`. The gateway resolves provider and query details.
- `CAPTURE_CLAIM_URL` is permitted only for Coverage Planner and Mapping Producer. Its data contains claim-listed `urlRef` and `captureProfileRef`. It never contains a raw caller-selected URL.
- `VALIDATE_DECLARATIVE_PACKAGE` is permitted only for Mapping Producer. Its data contains a schema-valid candidate package and the evidence-manifest hash.
- `COMMIT_DECLARATIVE_PACKAGE` is permitted only for Mapping Producer. Its data contains the validation receipt ID and validated package hash.
- `EXECUTE_RECORDED_LIFECYCLE_COMMAND` is permitted only for Human-directed Executor. Its data contains the claim subject's `caseId`, `decisionHash`, and `lifecycleCommandRef`. The gateway resolves the closed #68 command from the recorded case. The agent cannot name another command.
- `SUBMIT_TERMINAL_RESULT` is permitted for all four roles. It is represented by `SUBMIT_RESULT` at the transactional interface and is the one terminal completion command in the prompt.

Supply Reviewer has no non-terminal executable command. It reads its fixed manifest and submits one terminal review result. For `APPROVED`, `ACTIVATED`, repair, regression, exclusion, rejection, or Human Review dispositions, the gateway maps the validated terminal payload to the applicable typed lifecycle-authority request. This mapping selects from closed disposition-specific handlers. It is not a generic command runner.

The exact terminal dispositions are:

- Coverage Planner: `CAMPAIGN_PROPOSED`, `FAILED_CAPTURE_EVIDENCE_RECORDED`, `SOURCE_EXCLUSION_PROPOSED`, `CONTRACT_GAP`, and `NO_ACTION`.
- Mapping Producer: `PACKAGE_COMMITTED`, `BOUNDED_REPAIR_SUBMITTED`, `SOURCE_INCOMPATIBLE`, and `CONTRACT_GAP`.
- Supply Reviewer: `APPROVED`, `ACTIVATED`, `PRODUCER_REPAIR_REQUIRED`, `REGRESSION_ASSESSED`, `SOURCE_EXCLUSION_ASSESSED`, `EXACT_TARGET_REJECTED`, and `HUMAN_REVIEW_REQUIRED`.
- Human-directed Executor: `LIFECYCLE_COMMAND_EXECUTED` and `CONTRACT_GAP`.

Do not export `AffiliateAgentInvocationFailureEnvelope`, invocation retry constants, claim requests, token authorization, gateway operations, gateway results, or gateway errors from this pure module.

### Transactional gateway module

`apps/site/src/server/affiliateImports/agentGateway.ts` must import the role, claim, command, schema issue, and terminal result types from `agentGatewayContracts.ts`. It must export these symbols:

    AffiliateAgentWorkspaceAttestation
    AffiliateAgentClaimRequest
    AffiliateAgentClaimGrant
    AffiliateAgentClaimAuthorization
    AffiliateAgentInvocationFailureCode
    AffiliateAgentInvocationFailureEnvelope
    AffiliateAgentClaimOperation
    AffiliateAgentHeartbeatResult
    AffiliateAgentArtifactReadResult
    AffiliateAgentCommandResult
    AffiliateAgentSchemaCorrectionResult
    AffiliateAgentTerminalAcceptedResult
    AffiliateAgentInvocationFailedResult
    AffiliateAgentSubmitResultOutcome
    AffiliateAgentRecordFailureResult
    AffiliateAgentClaimOperationResult
    AffiliateAgentReconcileRequest
    AffiliateAgentReconcileReport
    AffiliateAgentGatewayErrorCode
    AffiliateAgentGatewayError
    AffiliateAgentGateway
    AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS
    AFFILIATE_AGENT_LEASE_SECONDS
    AFFILIATE_AGENT_HARD_DEADLINE_SECONDS
    AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS
    AFFILIATE_AGENT_MAX_INVOCATION_ATTEMPTS
    affiliateAgentRetryDelaySeconds

Use exact constants 60 heartbeat seconds, 300 lease seconds, 1,200 hard-deadline seconds, three schema corrections, and three total invocation attempts. `affiliateAgentRetryDelaySeconds` returns 300 after failure one, 900 after failure two, and `null` after failure three. It has no 2,700-second branch.

`AffiliateAgentInvocationFailureEnvelope` has schema version one, job ID, claim ID, claim generation, optional lifecycle generation, role, worker ID, invocation ID, Supply Contract hash, one `AffiliateAgentInvocationFailureCode`, occurrence time, permitted evidence references, and a bounded safe summary. Define it only in this module.

The main shapes are:

    export type AffiliateAgentClaimRequest = Readonly<{
      idempotencyKey: string;
      roleCredential: string;
      role: AffiliateAgentRole;
      workerId: string;
      invocationId: string;
      workspaceAttestation: AffiliateAgentWorkspaceAttestation;
    }>;

    export type AffiliateAgentClaimGrant = Readonly<{
      envelope: AffiliateAgentClaimEnvelope;
      prompt: string;
      token: string;
      heartbeatIntervalSeconds: 60;
      leaseExpiresAt: string;
      hardDeadlineAt: string;
    }>;

    export type AffiliateAgentClaimAuthorization = Readonly<{
      token: string;
      jobId: string;
      claimId: string;
      claimGeneration: number;
      lifecycleGeneration: number | null;
      role: AffiliateAgentRole;
      workerId: string;
      invocationId: string;
      supplyContractHash: string;
    }>;

    export type AffiliateAgentClaimOperation =
      | Readonly<{ kind: 'HEARTBEAT'; idempotencyKey: string; authorization: AffiliateAgentClaimAuthorization }>
      | Readonly<{ kind: 'READ_ARTIFACT'; idempotencyKey: string; authorization: AffiliateAgentClaimAuthorization; evidenceRef: string }>
      | Readonly<{ kind: 'EXECUTE_COMMAND'; idempotencyKey: string; authorization: AffiliateAgentClaimAuthorization; command: Exclude<AffiliateAgentCommand, { type: 'SUBMIT_TERMINAL_RESULT' }> }>
      | Readonly<{ kind: 'SUBMIT_RESULT'; idempotencyKey: string; authorization: AffiliateAgentClaimAuthorization; result: unknown }>
      | Readonly<{ kind: 'RECORD_FAILURE'; idempotencyKey: string; authorization: AffiliateAgentClaimAuthorization; failure: AffiliateAgentInvocationFailureEnvelope }>;

    export interface AffiliateAgentGateway {
      claim(input: AffiliateAgentClaimRequest): Promise<AffiliateAgentClaimGrant | null>;
      perform<T extends AffiliateAgentClaimOperation>(input: T): Promise<AffiliateAgentClaimOperationResult<T>>;
      reconcile(input?: AffiliateAgentReconcileRequest): Promise<AffiliateAgentReconcileReport>;
    }

`AffiliateAgentGatewayErrorCode` is the exact closed union below. Add no raw implementation errors to public responses.

    ROLE_CREDENTIAL_INVALID
    ROLE_NOT_ALLOWED
    WORKER_MISMATCH
    INVOCATION_MISMATCH
    JOB_MISMATCH
    CLAIM_NOT_FOUND
    CLAIM_NOT_ACTIVE
    CLAIM_GENERATION_STALE
    LIFECYCLE_GENERATION_STALE
    TOKEN_INVALID
    TOKEN_EXPIRED
    TOKEN_INVALIDATED
    LEASE_EXPIRED
    HARD_DEADLINE_EXCEEDED
    SUPPLY_CONTRACT_STALE
    DEPLOYMENT_CONTRACT_STALE
    COMMAND_NOT_PERMITTED
    ARTIFACT_NOT_PERMITTED
    ARTIFACT_INTEGRITY_FAILED
    RESULT_SCHEMA_INVALID
    SCHEMA_CORRECTIONS_EXHAUSTED
    TERMINAL_DISPOSITION_NOT_PERMITTED
    EVIDENCE_REFERENCE_NOT_PERMITTED
    IDEMPOTENCY_KEY_REUSED
    OPERATION_IN_PROGRESS
    RETRY_NOT_ELIGIBLE
    PIPELINE_BLOCKED
    PRODUCER_REVIEWER_IDENTITY_REUSED
    REVIEW_WORKSPACE_INVALID
    LIFECYCLE_TRANSITION_CONFLICT
    PARTIAL_COMMAND_UNRESOLVED
    DUPLICATE_LIVE_CLAIM
    GATEWAY_ADMISSION_HALTED
    INTERNAL_ERROR

`AffiliateAgentGatewayError` exposes `code`, `retryable`, `safeMessage`, and optional `receiptId`. `RESULT_SCHEMA_INVALID` is for input that cannot enter the correction contract. Normal role-output validation returns `AffiliateAgentSchemaCorrectionResult`. The third distinct correction returns `SCHEMA_CORRECTIONS_EXHAUSTED` and records one invocation failure.

### Adapter and implementation modules

`apps/site/src/server/affiliateImports/agentGatewayAdapters.ts` must export these internal symbols for direct imports by the implementation and supervisor. Do not re-export them from `agentGateway.ts`:

    AffiliateAgentGatewayClock
    AffiliateAgentGatewayIdentifiers
    AffiliateAgentRoleCredentialVerifier
    AffiliateAgentWorkspaceAttestationVerifier
    AffiliateAgentClaimTokenCodec
    AffiliateAgentActiveContractRegistry
    AffiliateAgentArtifactStore
    AffiliateAgentTransactionalCommandAdapter
    AffiliateAgentExternalCommandAdapter
    AffiliateAgentCommandAdapters
    AffiliateAgentLifecycleAuthority
    AffiliateAgentProcessLauncher
    AffiliateAgentWorkspaceManager
    AffiliateAgentGatewayDependencies
    AffiliateAgentSupervisorDependencies
    createProductionAffiliateAgentGatewayDependencies

`AffiliateAgentGatewayDependencies` contains `prisma`, `clock`, `identifiers`, `credentials`, `workspaces`, `tokens`, `contracts`, `artifacts`, `commands`, and `lifecycle`. The lifecycle member can represent fail-closed unavailability. It cannot silently fall back to an in-memory implementation.

Transactional command handlers receive the active Prisma transaction. External handlers implement `start(externalOperationKey, command)` and `recover(externalOperationKey)`. The artifact store addresses existing content by `fileId`, not by an agent path. The token codec owns the versioned HMAC key and constant-time token comparison.

`apps/site/src/server/affiliateImports/prismaAgentGateway.ts` must export only:

    createPrismaAffiliateAgentGateway

Its signature is:

    export function createPrismaAffiliateAgentGateway(
      dependencies: AffiliateAgentGatewayDependencies,
    ): AffiliateAgentGateway;

`apps/site/src/server/affiliateImports/agentSupervisor.ts` must export:

    AffiliateAgentSupervisorInput
    AffiliateAgentSupervisorOutcome
    runAffiliateAgentInvocation

The outcome is one of `NO_WORK`, `TERMINAL_ACCEPTED`, `INVOCATION_FAILED`, or `PIPELINE_BLOCKED`. The supervisor returns after one claim. It does not retry a failed invocation itself.

## Transaction and Token Rules

Claim uses one serializable transaction. Verify credentials and workspace attestation before it. Select and CAS one eligible job. Create claim and artifact rows. Append the event. Return the token after commit. Retry a Prisma `P2034` conflict with a small fixed bound. A loser searches for another eligible job or returns `null`.

Heartbeat uses one short transaction. Validate complete scope. Reserve or replay the receipt. CAS heartbeat and lease. Complete receipt and event in the same transaction.

Artifact reads use the two-transaction flow from Milestone 3. Do not hold a database transaction during storage I/O.

Transactional commands use one serializable transaction. Provider and capture commands use reserve, external effect, and finalize phases. Generate one durable external operation key before the effect. Reconciliation uses `recover` for a pending key.

Terminal result and failure each use one serializable transaction. Validate all immutable scope first. Store the receipt and bounded response. Update claim and job. Invalidate token. Clear active claim by job, claim, and generation CAS. Append events. Commit once.

The opaque token format is `agw1.<claimLookupId>.<capability>`. Generate a random 256-bit nonce. HMAC-SHA-256 covers claim ID, job ID, claim generation, lifecycle generation, role, worker ID, invocation ID, token expiry, evidence-manifest hash, permitted-command hash, and Supply Contract hash. Store only SHA-256 token hash, nonce, and key version. Never log the token. Compare hashes with `timingSafeEqual`.

Every operation checks token hash, expiry, invalidation, exact scope, lease, hard deadline, active deployment, active Supply Contract, and generations. For a Supply Source claim, ask the lifecycle adapter for current generation. A mismatch returns `LIFECYCLE_GENERATION_STALE`. It does not derive a lifecycle state.

## Idempotence and Recovery

All hashes use `canonicalizeAffiliateAgentValue` and `hashAffiliateAgentValue`. Do not use insertion-order `JSON.stringify` as a durable hash input.

A claim request uses its idempotency key as the global claim request ID. The same request ID and hash returns the same claim grant and reconstructed token. The same request ID with a different hash returns `IDEMPOTENCY_KEY_REUSED`.

Each operation reserves one receipt under `(claimId, idempotencyKey)`. The same kind and hash returns its stored response. A different kind or hash returns `IDEMPOTENCY_KEY_REUSED`. A `PENDING` receipt returns `OPERATION_IN_PROGRESS` unless `reconcileAfter` makes it eligible for recovery.

An exact terminal replay returns the original terminal response even though the token is invalidated. It must pass every other authorization check. A changed replay fails. This is the only invalidated-token exception.

A lifecycle command passes its receipt ID to #68 authority. On response loss, read that lifecycle receipt before any retry. A provider command passes its external operation key to `recover`. If recovery cannot prove success or failure, mark the receipt, claim, and job `RECONCILIATION_REQUIRED`. Do not guess and do not repeat the effect.

Expired claims use CAS before failure accounting. Restart reconciliation can run more than once. A completed receipt, completed claim, terminal job, or already-counted expiry remains unchanged. A partial unique index prevents two live claims even if application CAS has a defect.

Retain authoritative results, lifecycle receipts, human decisions, evidence, and event hashes indefinitely. Retain bounded failed-invocation diagnostics for 14 days. Destroy the child workspace after terminal completion or failure. A retention cleanup job is not part of this issue. Store retention timestamps now so later cleanup can be safe.

If a migration replay fails, destroy and recreate only `bracketiq_issue67_gateway_test`. Reapply all migrations. If a smoke claim stops after an external effect, do not delete its pending receipt. Restart the gateway and run reconciliation. If reconciliation returns unknown, preserve the rows and investigate the adapter by `externalOperationKey`.

## Concrete Steps

Use the dedicated worktree:

    cd /Users/elesesy/StudioProjects/bracketiq-issue-67/apps/site

Confirm the working branch and fixed base before edits:

    git branch --show-current
    git cat-file -e 5aa180b721eff7e42eef86583a9f226caa2bb20f^{commit}

Expected branch output is `issue/67-agent-gateway`. Do not replace the review base with a merge base.

Implement each milestone test first. Run only the focused unit file after each non-database slice:

    npm test -- --runInBand --runTestsByPath src/server/affiliateImports/__tests__/agentGateway.test.ts

After schema edits, use only repository-owned Prisma commands:

    npm run prisma:validate
    npm run prisma:generate
    node scripts/check-prisma-generated.mjs

Prepare the dedicated database exactly as described in `Database Design and Isolation`. Apply migrations. Then run only the database file:

    RUN_DATABASE_INTEGRATION=1 npm test -- --runInBand --runTestsByPath src/server/affiliateImports/__tests__/agentGateway.database.integration.test.ts

Run the TypeScript check after each complete public-interface change:

    npx tsc --noEmit --pretty false

After all focused checks pass, run the complete site verification in this order:

    npm run prisma:check
    npm run test:ci
    npx tsc --noEmit --pretty false
    npm run build

Do not run Jest commands concurrently in this worktree. Record the exact suite count, test count, coverage result, typecheck result, and build result in `Artifacts and Notes`.

Run the four-role smoke through a temporary TypeScript driver or the database integration harness without adding another production entry point. The smoke must call exported modules, seed four new gateway jobs with one test-run prefix, call `runAffiliateAgentInvocation` once per role with a deterministic process launcher, and clean only its prefixed rows. It must print one line per role with job ID, claim generation, terminal disposition, result hash, and token-invalidated status. Then reconstruct the gateway and run `reconcile` twice. The second report must contain zero new transitions.

Run the credential environment probe through the supervisor test. Capture the child process environment keys. The observed keys must be limited to model credential, gateway channel/address, claim token, claim envelope, prompt input, and minimal operating-system values. Assert that no key matches database, storage, provider, repository, admin, SSH, or general backend credential names.

Create a temporary no-privilege PostgreSQL login in the isolated database for the direct-denial probe. Use `psql` or a short test-owned PostgreSQL client process against the already-running authorized server. Attempt `INSERT`, `UPDATE`, and `DELETE` against a gateway table, an existing affiliate table, and `File`. Each attempt must fail with PostgreSQL `permission denied`. Drop only the temporary login after evidence is captured. Do not start another container. Do not perform this probe against any other database.

Run the offline open-weight denial in the focused test and smoke harness. Submit a signed attestation with execution class `OFFLINE_OPEN_WEIGHT_EVALUATION`. Expect `ROLE_CREDENTIAL_INVALID` or `ROLE_NOT_ALLOWED` before any job changes. Submit an executable mapping field. Expect schema rejection before any command adapter call.

Review the complete implementation against the fixed base:

    git diff --stat 5aa180b721eff7e42eef86583a9f226caa2bb20f
    git diff --name-only 5aa180b721eff7e42eef86583a9f226caa2bb20f
    git diff --check 5aa180b721eff7e42eef86583a9f226caa2bb20f

Use two fresh reviewers. The Standards reviewer reads `AGENTS.md`, `apps/site/AGENTS.md`, and `apps/site/CODING_STANDARDS.md`, then reviews only the fixed-base diff. The Spec reviewer reads issue #67 with comments and this ExecPlan, then reviews the same fixed-base diff. Do not give either reviewer the other review. Resolve both reports. Re-run every focused or full command affected by a fix.

## Validation and Acceptance

The implementation is accepted only when all evidence below exists. A compile-only result is not sufficient.

Contract fixture tests must prove stable independent hashes for the Supply Contract aggregate, each component, the deployment contract, every role contract, and every prompt template. They must prove deterministic prompt output and one terminal completion command.

The complete bundle fixture must reject correctly rehashed deployment supply, role, and prompt references that do not match the parsed bundle. Version-1 role fixtures must reject correctly rehashed capability changes. Claim fixtures must reject Supply Source mismatches and producer/reviewer identity reuse. Prompt fixtures must prove that the displayed authority projection uses exact source hashes and a computed full claim-envelope hash.

Gateway unit tests must prove every role input, permitted command, disposition, forbidden effect, and retention rule. They must prove one-claim supervisor behavior, three in-invocation schema corrections, the exact retry function, token scope, safe errors, terminal invalidation, exact replay, changed-input denial, reviewer isolation, credential allowlisting, and offline open-weight denial.

Database integration tests must prove one winner in a concurrent claim race, stale generation rejection, five-minute lease behavior, 20-minute hard deadline, durable idempotency receipts, atomic terminal result, token invalidation, exact terminal replay, retry transitions at +5 and +15 minutes, immediate block on failure three, no +45 timestamp, one provider effect after restart, one lifecycle receipt after response loss, one expiry transition, no duplicate live claim, and no repeated lifecycle transition.

The direct denial probe must prove that an agent database identity cannot write protected gateway, affiliate, or `File` rows. The child/container environment probe must prove that production database, storage, provider, repository, backend, and admin credentials are absent. The reviewer probe must prove a fresh read-only workspace and distinct producer/reviewer worker, invocation, and workspace identities.

The four-role smoke must produce one accepted terminal result for `COVERAGE_PLANNER`, `MAPPING_PRODUCER`, `SUPPLY_REVIEWER`, and `HUMAN_DIRECTED_EXECUTOR`. The #68 lifecycle adapter used in smoke must be a deterministic test authority, not production lifecycle derivation. Each smoke result must have one claim, one terminal receipt, one invalidated token, and no forbidden adapter call.

The full `npm run test:ci`, TypeScript check, Prisma check, and production build must pass. Record exact results. If an unrelated pre-existing failure occurs, prove it at the fixed base with the same command and record both outputs. Do not waive a failure introduced by this branch.

### Acceptance-criterion evidence map

1. Every role contract has a version, hash, typed inputs, permitted gateway commands, terminal dispositions, forbidden effects, and retention rule. Milestone 1 contract fixtures and the role capability matrix prove this. Record the four contract hashes.

2. Prompts are deterministically rendered from the role contract plus one claim envelope and include one terminal completion command. Milestone 1 byte comparison and completion-command count prove this. Record one prompt hash per role.

3. Claim, heartbeat, command, artifact, result, and failure operations reject wrong role, worker, job, claim generation, lifecycle generation, expired token, stale Supply Contract, and changed idempotent input. Milestones 5 and 6 use one operation-by-denial matrix. Invocation mismatch and deployment-contract mismatch are additional required rows.

4. A successful terminal submission makes the token unusable except for an identical idempotent replay. Milestones 4 and 6 prove terminal invalidation, denial of every non-terminal operation, changed-result denial, and exact stored-response replay.

5. Gateway restart reconciliation cannot create two live claims or repeat a lifecycle transition. Milestones 5, 8, and 9 prove the partial unique index, CAS, provider recovery, lifecycle receipt read, and idempotent second reconciliation.

6. Agent containers prove absence of production database, storage, provider, and repository credentials, and direct protected-table writes fail. Milestone 12, the child/container environment allowlist, and the isolated-database no-privilege probe provide this evidence.

7. Reviewer isolation is proven by different worker and invocation identities and a fresh read-only package workspace. Milestone 10 also requires a different workspace ID and an exact evidence-only manifest.

8. The retry ambiguity is resolved before coding. The issue comment and this plan fix the policy to initial, +5, +15, then immediate `PIPELINE_BLOCKED`, with no +45 retry. Milestone 7 proves exact timestamps.

9. Open-weight evaluation remains offline and cannot claim production work or publish executable code. Milestones 1, 11, and 12 prove execution-class denial, absence of a production role credential/adapter, a declarative-only mapping schema, and no shell or repository-write command.

The issue also requires contract/hash fixtures, claim-race tests, stale-generation tests, token-scope tests, idempotent replay tests, timeout, heartbeat, restart scenarios, credential denial, and one end-to-end claim for every role. The validation groups above map each required verification to at least one focused test or smoke observation.

## Security and Containment Checks

The model process receives the minimum environment. Treat variable names as sensitive even in tests. Record names only. Never record values. Scan receipts, events, errors, supervisor output, and test snapshots for raw token prefixes, known fixture secret values, database URLs, provider keys, storage keys, and artifact bodies.

Role credentials authenticate only one role and execution class. They are not user sessions or admin JWTs. A wrong role fails before queue selection. A result token is not a role credential and cannot claim more work.

Artifact authorization uses the exact artifact row. Reject caller-supplied paths, URLs, buckets, storage keys, and symlinks. Verify content hash and byte size before returning bytes. Release no bytes after claim invalidation.

Mapping packages are data. The schema allows only known declarative fields. Reject JavaScript, TypeScript, shell, executable templates, functions, commands, patches, and repository paths. The gateway does not write repository files.

Reviewer manifests are immutable and read-only. Reviewer commands cannot change package bytes. Approval or activation always names the committed package hash. An exact-target rejection names one target and does not cascade to siblings.

The Human-directed Executor checks the stored human decision hash. It executes one permitted lifecycle command. It records human and agent identities. It cannot substitute another case, generation, command, or decision.

The open-weight evaluation process has no production role credential and no production gateway adapter. Network and database topology keep it offline. Importing a TypeScript contract type does not grant authority.

## Artifacts and Notes

Before implementation, the required retry transcript is:

    admitted at T0 -> attempt 1
    invocation failure 1 at F1 -> attempt 2 eligible at F1 + 00:05:00
    invocation failure 2 at F2 -> attempt 3 eligible at F2 + 00:15:00
    invocation failure 3 at F3 -> PIPELINE_BLOCKED at F3
    automatic retry at +00:45:00 -> absent

Milestone 1 used this exact focused command after each red and green change:

    npm test -- --runInBand --runTestsByPath src/server/affiliateImports/__tests__/agentGateway.test.ts

The first command could not start because the isolated worktree had no Jest installation. This exact prerequisite command ran only in the isolated worktree:

    npm ci

It added 1,459 packages. The next focused run observed the first intended red failure:

    FAIL src/server/affiliateImports/__tests__/agentGateway.test.ts
    Cannot find module '../agentGatewayContracts'
    Test Suites: 1 failed, 1 total

The later red runs observed one failing behavior at a time. They covered unsupported canonical JSON values, Supply Contract parsing, four role fixtures, changed contract hashes, deployment parsing, four typed claim subjects, a role-forbidden command, closed command parsing, the terminal role matrix, deterministic prompts, the one terminal command, and the transactional retry seam. The green count increased from one through 13. The final focused result was:

    PASS src/server/affiliateImports/__tests__/agentGateway.test.ts
    Test Suites: 1 passed, 1 total
    Tests:       13 passed, 13 total
    Snapshots:   0 total
    Time:        0.496 s

The exported interfaces stabilized before this exact check:

    npx tsc --noEmit --pretty false

It exited with code 0 and no output. The same check ran after formatting. It again exited with code 0 and no output.

This exact focused formatter command ran:

    npx prettier --write src/server/affiliateImports/agentGatewayContracts.ts src/server/affiliateImports/agentGateway.ts src/server/affiliateImports/__tests__/agentGateway.test.ts

Prettier formatted all three named files. It emitted the existing `MODULE_TYPELESS_PACKAGE_JSON` warning for `prettier.config.js`. It did not report a formatting failure.

The Milestone 1 self-review used this focused command for each red and green cycle:

    npx jest src/server/affiliateImports/__tests__/agentGateway.test.ts --runInBand

The four red observations were:

    contract bundle: TypeError because AFFILIATE_AGENT_PROMPT_TEMPLATES was absent; 1 failed suite, 0 tests
    role capabilities: expected five false results; received true for the unauthorized rehashed capability changes; 1 failed, 14 passed
    claim identities: expected six false results; received true for the internal identity conflicts; 1 failed, 15 passed
    prompt projection: TypeError because the Authority Projection section was absent; 1 failed, 16 passed

After focused formatting, the final focused result was:

    Test Suites: 1 passed, 1 total
    Tests:       17 passed, 17 total
    Snapshots:   0 total
    Time:        0.527 s

The stabilized interface check ran before and after focused formatting:

    npx tsc --noEmit --pretty false

Both checks exited with code 0 and no output. The review fix formatter named only `agentGatewayContracts.ts` and `agentGateway.test.ts`.

The fixed aggregate hashes are:

    Supply Contract: fb7d336037f5dafbe4bfd37d4b21e369b12da6b328051744fe3fe28d8c9608c0
    Deployment contract: 3f12c0702667a7a32cd88a9465cf541a249fc463aadc1aa6c63b42051798d5ae

The fixed role-contract and prompt-template hashes are:

    COVERAGE_PLANNER role=381db9c28c2870b8a0a530110bd5931fd18a3675707fac4641d2e1fdaab70d72 prompt=9c0e6f32b1e935fd14c8872b8ea1ddad96cd25a7498858c4b810835cd38149fb
    MAPPING_PRODUCER role=1d1a18a7b25a084413dda5200409e236a2da465d2fa8ac062ec094d835c8cb05 prompt=8523e9a1d0377a45e5a4de03f5724ed4b07294f3b1ad623a55d064e6b872b45f
    SUPPLY_REVIEWER role=434df5725ec14b466768c656a538d2a917afc93a900e4eeb9ccfe5191606b56b prompt=f2a685039fac0dd4f261a645d3cfb9128f28dfbb0c86549e9d7866d858a32fe2
    HUMAN_DIRECTED_EXECUTOR role=4aae27af7110f5ad4e3141f4d11882825e4db90422f1021bb4d24ee36c68527f prompt=514fca00a373112dec2385a0b3b527975dec41d17b2288eb04e78ba7b98a72ec

The six component hashes, in required component order, are:

    f13a898bc1710efb2b926ed38da263437d44afcd0039dc684065142d3d451608
    0aa04cef3f1f03afb8359f17cece3fca596f5cae8fd4d95ca1ecdbd70378ca38
    0de164fdcc9a4b0cb731cc2dd659706c79d657f6d0512b25ca0027e3c3139c03
    69ff8f25c91412b3327058ed9daefee5b52cdfc784efd8294704c30adcb20340
    277dd86e998a419d93a1b4fe7045b90754979a73202e0e39f3600f71edd56d76
    db8e8c028ef8876ad00d5a7dea9ddbf89fc014c1991a7c690b2b21745db26d29

Database proof is now available for the Coverage Planner Milestones 2-6 slice. Lifecycle, supervisor, containment, remaining-role, full-suite, and build evidence remain for later milestones.

Milestones 2 through 6 used the focused unit command:

    npx jest src/server/affiliateImports/__tests__/agentGateway.test.ts --runInBand

The vertical red observations were:

    claim: missing ../agentGatewayAdapters; 1 failed suite, 0 tests
    heartbeat: operation unavailable; 1 failed, 18 passed
    artifact: operation unavailable; 1 failed, 19 passed
    command: operation unavailable; 1 failed, 20 passed
    terminal result: operation unavailable; 1 failed, 21 passed
    failure-operation scope: expected CLAIM_NOT_FOUND, received ROLE_NOT_ALLOWED; 1 failed, 22 passed
    terminal replay: received TOKEN_INVALIDATED; 1 failed, 23 passed
    exact lease boundary: heartbeat resolved at lease expiry; 1 failed, 28 passed

The initial stable-interface TypeScript check exposed four command-union narrowing diagnostics. Capturing the parsed discovery command before the transaction callback resolved them. The next `npx tsc --noEmit --pretty false` exited with code 0 and no output.

The local `pg_isready` executable was absent. The already-running authorized `mvp-site-db` container reported `127.0.0.1:5432 - accepting connections` from its own readiness executable. No PostgreSQL, Docker, or Compose runtime was started, stopped, restarted, enabled, disabled, or reconfigured.

The isolated database is `bracketiq_e2e_67_gateway`. `npx prisma migrate deploy` applied all 195 migrations, including `20260820180000_add_affiliate_agent_gateway`. The first database red run failed because the new integration fixture did not match the strict Supply Contract schema; both claim promises failed closed with `DEPLOYMENT_CONTRACT_STALE`. The corrected fixture produced:

    Test Suites: 1 passed, 1 total
    Tests:       1 passed, 1 total
    Snapshots:   0 total

That database test observed two selections behind the barrier, one claim winner, one persisted claim, two successful operation receipts, three immutable events, a completed job with no active claim, a completed claim with an invalidated token, exact terminal replay, `P2002` for a directly attempted second live claim, and rejection of an event update.

The final focused unit result after formatting was:

    Test Suites: 1 passed, 1 total
    Tests:       30 passed, 30 total
    Snapshots:   0 total
    Time:        0.721 s

The final isolated PostgreSQL result was:

    Test Suites: 1 passed, 1 total
    Tests:       1 passed, 1 total
    Snapshots:   0 total
    Time:        0.802 s

The final `npx tsc --noEmit --pretty false` exited with code 0 and no output. `npm run prisma:validate` reported a valid schema. `npm run prisma:generate` generated Prisma Client 7.8.0 and retained all generator-owned files. `node scripts/check-prisma-generated.mjs` reported that the canonical schema, generated client, and Prisma versions match.

The focused formatter named only the gateway adapters, Prisma gateway, two gateway test files, this ExecPlan, and the Prisma schema. Prettier completed for all named TypeScript and Markdown files with only the existing module-type warning. The first Prisma format call lacked the required local configuration environment and failed before changing the schema; the repeated scoped command loaded the Prisma config and formatted `prisma/schema.prisma` successfully.

Milestones 7 through 11 used this focused unit command:

    npx jest src/server/affiliateImports/__tests__/agentGateway.test.ts --runInBand

The continuation recorded these restart and reconciliation red observations:

    pending capture restart: Recovered capture finalization is not implemented; 1 failed, 44 passed
    expired lease: expected one examined and expired claim, received zero; 1 failed, 45 passed
    lifecycle response loss: expected PARTIAL_COMMAND_UNRESOLVED, received the raw simulated response-loss error; 1 failed, 47 passed
    impossible recovered state: expected the job to require reconciliation, received CLAIMED; 1 failed, 48 passed

The final focused result after formatting was:

    Test Suites: 1 passed, 1 total
    Tests:       50 passed, 50 total
    Snapshots:   0 total
    Time:        0.861 s

The final `npx tsc --noEmit --pretty false` exited with code 0 and no output. `npm run prisma:check` reported a valid schema, generated Prisma Client 7.8.0, and verified the canonical generated surface. The first Prisma format call failed before mutation because `DATABASE_URL` was absent. The repeated command used a non-secret local placeholder URL and passed. Focused Prettier write and check covered the gateway contract, interface, adapters, Prisma implementation, and two gateway test files. The final check reported that all named files use Prettier style. It emitted only the existing module-type warning.

Database and supervisor evidence remains. Add PostgreSQL tests for response-loss restart, one-winner expiry CAS, hard deadline, and lifecycle receipt recovery. Then implement Milestone 12. Do not treat the 50 focused unit tests as database, supervisor, smoke, full-suite, build, or containment proof.

Expected four-role smoke evidence has this form. Replace each value with the observed identifiers and hashes:

    COVERAGE_PLANNER claimGeneration=1 terminal=CAMPAIGN_PROPOSED tokenInvalidated=true
    MAPPING_PRODUCER claimGeneration=1 terminal=PACKAGE_COMMITTED tokenInvalidated=true
    SUPPLY_REVIEWER claimGeneration=1 terminal=APPROVED tokenInvalidated=true
    HUMAN_DIRECTED_EXECUTOR claimGeneration=1 terminal=LIFECYCLE_COMMAND_EXECUTED tokenInvalidated=true
    reconcile pass 1 recovered=1 transitions=1
    reconcile pass 2 recovered=0 transitions=0

Expected denial evidence has this form. Do not record credentials or tokens:

    child forbidden credential keys=[]
    protected gateway insert=permission denied
    protected affiliate update=permission denied
    protected File delete=permission denied
    reviewer writable package=false
    offline production claim=ROLE_NOT_ALLOWED

Record the fixed-base review results here. Include reviewer identity, fixed base, findings, resolutions, and the checks rerun after each resolution.

Plan revision note (2026-08-20 17:39Z): Created the initial self-contained execution plan for issue #67. It records the confirmed pure-contract and transactional-gateway seams, keeps invocation failure and retries in `agentGateway.ts`, fixes three attempts at initial, +5, and +15 minutes with immediate block after failure three, defines vertical TDD slices and exact files, isolates database proof, includes containment and reviewer checks, fixes the review base, and keeps #68 lifecycle derivation and #70 cutover outside this issue.

Plan revision note (2026-08-20): Corrected database isolation to use `bracketiq_e2e_67_gateway`. Removed instructions that would start an unapproved PostgreSQL container. The plan now uses one already-authorized local server and requires explicit current authorization before any runtime state change.

Plan revision note (2026-08-20 18:19Z): Completed Milestone 1. Recorded the pure contract and public transactional declarations, every focused red-to-green behavior, final test and typecheck results, focused formatting, fixed hashes, scope exclusions, and the remaining milestones.

Plan revision note (2026-08-20 18:31Z): Resolved the Milestone 1 self-review findings. Added the strict prompt-template and complete bundle contracts, one version-1 role capability matrix with parser enforcement, claim identity consistency checks, and the deterministic authority projection. Recorded all four red observations, the 17-test focused pass, two successful TypeScript checks, focused formatting, and the revised deployment, role, and prompt-template hashes.

Plan revision note (2026-08-20 20:31Z): Completed the user-confirmed Milestones 2-6 Coverage Planner authority slice. Added the adapters, Prisma schema and migration, production gateway, vertical unit behaviors, real PostgreSQL race/CAS/idempotency proof, full stale-scope matrix, artifact integrity checks, exact terminal replay, token invalidation, and explicit scope exclusions.

Plan revision note (2026-08-20 20:18Z): Completed Milestones 7-11 at the focused unit seam. Added exact retry and schema-correction behavior, all role paths, public capture and durable recovery, bounded idempotent reconciliation, expiry CAS, lifecycle response-loss safety, reviewer isolation, impossible-state containment, and scoped Prisma unique-conflict handling. Recorded 50 passing focused tests, TypeScript, Prisma, and format evidence. Database integration, Milestone 12 supervisor and containment, smoke, full suite, and build remain.
