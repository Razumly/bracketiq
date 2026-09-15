# Replace the governed Codex CLI runner with OMP


This ExecPlan follows `PLANS.md`. Keep its progress, decisions, discoveries, and outcome current.

## Purpose / Big Picture


The operator selected OMP with two ChatGPT accounts. The governed affiliate workers must use those accounts without copying OAuth refresh tokens into each agent workspace. The BracketIQ Agent Gateway must retain control of claims, source evidence, package validation, terminal receipts, and independent review. A successful bounded canary must produce a recorded result for the already admitted mapping job. It must not enable publication, automatic scraping, coverage planning, or replenishment.

## Progress


- [x] (2026-09-07) Record the operator choice: two ChatGPT accounts through OMP's `openai-codex` provider.
- [x] (2026-09-07) Confirm OMP 18.1.13 is installed locally and published to npm. Its SDK requires Bun 1.3.14 or later.
- [x] (2026-09-07) Select a trusted SDK driver with an explicit tool allowlist and a fresh in-memory session for each claim.
- [x] (2026-09-07) Confirm broker profile isolation, account identity rules, native account ranking, and `pi-native` routing against installed OMP 18.1.13.
- [x] (2026-09-07) Replace the current Codex CLI execution contract and current callers with OMP.
- [x] (2026-09-07) Add private broker and model gateway deployment configuration with inspected credential, image, mount, network, and lifecycle evidence.
- [x] (2026-09-07) Construct a real restricted SDK session without a provider call. Both active and registered tools contain only `read_artifact`, `execute_command`, and `submit_result`. No session file, MCP connection, or model fallback exists.
- [x] (2026-09-07) Pass TypeScript and all 440 tests across 15 focused suites. Targeted ESLint and helper/wizard syntax checks pass.
- [x] Complete two direct device-code logins in the dedicated broker profile.
- [x] Verify two healthy distinct accounts, broker-managed refresh, exact Luna catalog entry, and one bounded native inference.
- [x] (2026-09-08) Verify the Linux workload runner and one completed OMP claim.
- [x] (2026-09-07) Record conditional `AUTH SETUP` approval: after source review/checks, publish governed affiliate OMP images and start only the broker, gateway, and two temporary login helpers; keep existing Gateway/workers unchanged and do not restart mapping claim, RootRunner, or workload.
- [x] Obtain explicit bounded workload approval for Gateway/runner replacement, Linux checks, mapper 1, and reviewer 1.
- [x] (2026-09-08) Deploy the approved images after a fresh preflight.
- [x] (2026-09-08) Run the one-job canary. Record its `CONTRACT_GAP` hold. No independent review job was created.
- [x] Integrate and push the source changes. Update Issue 70 with measured results.
- [x] Expose immutable artifact URL metadata through the Gateway and OMP reader.
- [x] Add URL-reference and sport-evidence instructions to the generated prompt.
- [x] Require structured evidence for every legacy producer contract gap.
- [x] Retain bounded, redacted command rejection diagnostics after successful claims.
- [x] Run focused regressions and the recorded-evidence replay before source delivery.
- [x] Add and verify the guarded completed-hold retry operation.
- [x] Publish and deploy the reviewed retry-capable correction.
- [x] Complete both linked repairs and independent review. Boomtown and Softball are approved; Softball used the explicitly authorized one-time continuation.
- [x] Verify final records, close admission, and stop trial workers.
- [x] Carry the stored mapping kind into new producer claims.
- [x] Preserve deterministic validation errors and server retryability.
- [x] Resolve authorized synthetic Supply Contract artifacts.
- [x] Use current mapping run and evidence lineage for independent review.
- [x] Retain bounded reviewer effect failure diagnostics.
- [x] Run focused regressions, source replays, and independent review.
## Current approval record

Conditional `AUTH SETUP` approval (recorded 2026-09-07): after source
review/checks pass, publish the governed affiliate OMP images and start **only**
`affiliate-model-auth-broker`, `affiliate-model-gateway`, and two temporary
login helpers. Existing BracketIQ Gateway and workers must stay unchanged. No
mapping claim, RootRunner, or workload restart is authorized by this approval.
Workload Linux/root-runner/canary deployment requires later separate approval.
This is not authorization to start anything before the source review/checks
pass.

The operator subsequently approved the bounded workload canary: replace the
governed affiliate Gateway and root runner with the published OMP images;
run Linux containment checks; start only `mapping-producer-1` and
`supply-reviewer-1` for Gateway job
`d7a1fe71-c76e-4191-a3f3-610c737d683e`; then close admission and stop the
canary workers. Preserve both prior failures and the legacy repair hold.
No new source, activation, publication, automatic scraping, coverage,
replenishment, site runtime, or mobile runtime change is authorized.

Before admission, read-only checks confirmed this job was the sole claimable
producer job. It was `RETRY_WAIT` with failure count 2 and no active claim.
The root was generation 1, `PRE_MAPPED`, and held. The current 24-sport catalog
matches the stored hash
`e4c4adada1e0b73f071ff367713e3c0d777cf22df846618edda81e9e01059c66`.

The published image's old probe used Bun as the privileged launcher. A real
Linux comparison showed that Bun 1.3.14 `spawnSync` ignored its UID/GID
options, while Node launched UID 1002/GID 1001 with zero capabilities.
The probe source now uses Node, matching the actual production runner.
The corrected probe was mounted read-only into disposable containers using
the published image. Both producer and reviewer checks passed with
`NoNewPrivs=1`, zero capabilities, sibling write denial, and reviewer-root
write denial. A real pinned SDK constructor also passed under UID 1002.
No sandbox policy was loosened. The published workload executables did not
change; only the diagnostic probe was corrected.

Prepared workload contract version 3 hashes to
`15c37807d319b38b1c8558bfb3b1b84a16e5a85e4734aaf861d2f1259e4a7679`.
The active Supply Contract remains version 1 with hash
`c808492a7d60741b508978987441a0a31f59602a5e5321789d9865823f6098cf`.
Preparation wrote private files only; it did not change the database or the
canonical deployment environment.


## Surprises & Discoveries


The existing Codex authentication cannot be reused. The recorded first-party refresh probe returned `refresh_token_reused`. Do not repeat the probe or copy that authentication into OMP.

OMP's `toolNames` option is not an allowlist by itself. The SDK requires `restrictToolNames: true`. Supplied custom tools also require `allowRestrictedCustomTools: true`, and each tool name must occur in `toolNames`. Disable ambient extensions, MCP, LSP, skills, rules, context files, commands, and prompt discovery. Use isolated settings and an in-memory session. Disable unrelated background model work.

The existing terminal protocol has two stages. The agent submits to the Gateway and can receive `SCHEMA_CORRECTION_REQUIRED`. After `TERMINAL_ACCEPTED`, the agent emits one bounded `TERMINAL_SUBMISSION` frame. The supervisor repeats that exact request with the same idempotency key to confirm the recorded result. Preserve this behavior. Do not replace it with unconfirmed model prose.

The current database migrations have no execution-class enum or check constraint. The cutover changes current application contracts to `PRODUCTION_OMP`. Historical failed claim JSON and applied migrations remain unchanged.

OMP 18.1.13 contains the Luna model. Its broker-backed discovery queries each account and combines the advertised models. The model gateway ignores client `models.yml` overrides. Require exact `openai-codex/gpt-5.6-luna` in authenticated `/v1/models` before a claim. Do not substitute another provider or model.

The initial focused tool checks were followed by the final integrated source gate. All 440 tests now pass, including pending-command idempotency, terminal deadline replay, full evidence context, and preflight capture boundaries.

The initial production status check showed the existing BracketIQ Gateway healthy and canary workers stopped. The approved auth setup later started only the OMP broker. The latest measured state is recorded in the Auth setup checkpoint below.

## Decision Log


Decision: Use the OMP SDK in a trusted Bun child process. Keep the root runner and supervisor on their existing Node runtime. Reason: the SDK exposes explicit tool control and session shutdown. It avoids forwarding large JSON event streams into the runner's bounded terminal channel. Date: 2026-09-07.

Decision: Use a private OMP auth broker and a separate private OMP model gateway. The broker owns the two OAuth logins and refresh-token writes. The model gateway holds provider access credentials and uses native account selection and cooldowns. The child receives only a model gateway bearer token. It must never receive broker or provider credentials. Date: 2026-09-07.

Decision: Inject model gateway configuration from the root runner, not from the signed supervisor launch payload. Reason: supervisors do not need model credentials. Preserve the existing small launch environment allowlist. Date: 2026-09-07.

Decision: Expose only claim-bound Gateway operations as model tools. The trusted driver binds authorization, claim identity, and idempotency keys. The model cannot choose an HTTP host, path, credential, worker identity, or execution command. The Gateway remains the final authorization and validation authority. Date: 2026-09-07.

Decision: Preserve the existing two failed invocations and retry counter. Do not reset the job to hide Codex failures. Validate OMP before consuming another claim attempt. Date: 2026-09-07.

Decision: Keep an invocation-local idempotency key for each identical operation. A declared schema correction releases only that terminal submission key. Reason: `OPERATION_IN_PROGRESS` must not cause a second external effect, while a new schema submission must not replay the previous correction. No automatic HTTP retry loop is added. Date: 2026-09-07.

Decision (2026-09-08): Correct the source without changing production runtime
state. The two-source diagnosis reproduced missing URL context and a false
Boomtown sport hold. Add required nullable provenance URLs to the current
artifact-read contract. Bump current role and prompt versions to 3. Preserve
old claims as history; do not rewrite their hashes or retry them.

Decision (2026-09-08): Require a structured sport assessment for every
`LEGACY_SPORT_REPAIR` producer contract gap, regardless of its free-text
description or generic reason code. A non-sport gap may carry verified resolved
sports. An unresolved sport assessment must use the existing human-review
verification rules. This avoids trying to classify free-form model prose.

Decision (2026-09-08): Keep the isolated session and explicit tool allowlist.
Put the relevant evidence rules in the generated production prompt rather than
loading arbitrary repository context. Forward only bounded allowlisted command
diagnostic fields from the child to the root runner's structured logger.
Container log retention is not a permanent database audit.

## Outcomes & Retrospective


The corrected version-4 runtime is deployed. Both linked producer attempts ran. Softball produced a verified sport assessment but no package because validation returned internal errors. Boomtown committed a validated version-2 mapping and reached independent review. The reviewer selected APPROVED, but its terminal effect is UNKNOWN and the review job requires reconciliation. This is partial repair progress, not a completed approval. Admission is closed; mapper 1, reviewer 1, and the root runner are stopped. Both model services and the Gateway remain healthy. Holds, private organization state, and all original job/claim/receipt rows remain preserved.

## Context and Orientation


The working tree is `/Users/elesesy/StudioProjects/bracketiq-affiliate-collection`, on `workstream/affiliate-legacy-admission`. The canonical repository is `Razumly/bracketiq`. `apps/site` owns the backend. Run npm and TypeScript commands from that directory. Do not change the mobile build graph.

`apps/site/scripts/run-affiliate-agent-runner.ts` is the privileged runner. It verifies signed Unix-socket requests, creates private per-invocation cgroups, drops to a child UID, bounds stdout and stderr, and proves process cleanup. Before this cutover, it seeded `.codex/auth.json` and started `codex exec`. The OMP source removes that path. Existing bounded diagnostic changes in this runner and `apps/site/scripts/__tests__/runAffiliateAgentRunnerDiagnostics.test.ts` remain.

`apps/site/src/server/affiliateImports/agentSupervisor.ts` builds the child launch request and confirms terminal submissions. `apps/site/scripts/run-affiliate-agent-supervisor.ts` implements the HTTP Gateway client and workspace ownership. The Gateway operation endpoint is the configured path prefix plus `/perform`. Its request has a fixed `kind`, trusted claim `authorization`, and operation-specific fields.

`apps/site/src/server/affiliateImports/agentGatewayContracts.ts` owns current role contracts, prompt hashes, claim schemas, terminal schemas, and execution classes. `apps/site/src/server/affiliateImports/affiliateFleetCutover.ts` and the preflight script verify the deployment. `apps/site/deploy/affiliate-governed/compose.yml` and its Dockerfiles define the private runtime. The existing Codex sandbox profiles enabled namespaces for bubblewrap. Reassess them for OMP; do not retain unnecessary namespace privileges only to preserve old hashes.

The admitted Gateway job is `d7a1fe71-c76e-4191-a3f3-610c737d683e`. Its legacy mapping job is `50957179-8e51-42f0-a0db-2fc4791bdc79`. Its Supply Source is `a8764a56-2da2-4382-82d1-eee317b05143`. The Gateway job is now `COMPLETED` with `CONTRACT_GAP` and two historical failures. The mapping job is `REVIEW_REQUIRED`. The root remains lifecycle generation 1, `PRE_MAPPED`, and held by `LEGACY_SPORT_REPAIR`. Admission is closed and canary workers are stopped. The prior admission report hash is `778e0233ecb85e4424c4238026511ef6f7bc6871fc8ffc045970ff1b345219b0`. Do not admit another source. Do not remove the hold.

Production access uses `ssh bracketiq-prod`. The private deployment file is `/home/bracketiq/.config/bracketiq-affiliate-agents/governed-deployment.env`. Never print it. The production database remains on its private Docker network. The OMP broker and model gateway must not join that network.

## Plan of Work


First pin the published SDK and Bun runtime. Read the pinned SDK declarations and implementation for isolated auth storage, native model gateway transport, custom tool schemas, sequential execution, and termination. Verify a real restricted session without simulating a provider. Keep native provider credentials outside the child. Use OMP's native `pi-native` gateway transport so the upstream provider identity remains explicit.

Add `apps/site/scripts/run-affiliate-omp-agent.ts` as the trusted child driver. Read the bounded prompt and claim data supplied by the runner. Register only evidence reads, commands allowed by the current claim, and terminal submission. Keep the token in the driver closure. Bind all result identity fields from the validated claim. Use the existing Gateway endpoint and contract validators. Return schema correction feedback to the same session. Emit the exact terminal frame immediately after accepted submission. Stop further tool calls. Dispose the session without a second model turn. Keep artifacts and model event streams off stdout.

Replace Codex seed handling, command metadata, workspace names, and active prompt instructions. Migrate every current execution-class caller and affected fixture. Remove obsolete seed tests and Codex-only runtime checks. Keep containment, no-new-privileges, bounded resources, signed launch requests, and cleanup behavior. Update preflight evidence to describe OMP rather than accepting an old Codex report.

Define `affiliate-model-auth-broker` and `affiliate-model-gateway` with separate private credentials and storage. The runner can reach the BracketIQ Gateway and model gateway, but not the auth broker or public provider endpoints. The broker and model gateway have only the external access required for OAuth refresh and inference. No service receives unrelated database, storage, SMTP, or role credentials. No service may start before source review/checks pass; the conditional `AUTH SETUP` approval names only the two model services and two temporary login helpers.

Prepare an ephemeral login wizard only for the two browser actions the operator must perform. Use a dedicated broker store. The first login adds account one. The second login must select a distinct account rather than refresh the first browser session. Verify two distinct active `openai-codex` identities without printing tokens or publishing account identifiers. Do not import personal OMP state or the stale Codex auth seed.

After source and sandbox verification, apply the recorded conditional `AUTH SETUP` approval only by publishing the governed affiliate OMP images and starting `affiliate-model-auth-broker`, `affiliate-model-gateway`, and two temporary login helpers. Leave the existing BracketIQ Gateway and workers unchanged; do not start or restart a mapping claim, RootRunner, or workload. Refresh runtime inventory and preflight after the approved setup. Workload Linux/root-runner/canary deployment requires later separate approval. Keep coverage and replenishment stopped.

## Concrete Steps


From `apps/site`, install the exact published SDK with npm so `package-lock.json` remains authoritative. Do not create a root npm workspace or a Bun lockfile for the site.

    npm install --save-exact @oh-my-pi/pi-coding-agent@18.1.13

After all concurrent edits finish, run the complete affected suites once and the site type check. Add exact focused suite names here as ownership is fixed. Do not mock OMP, OAuth, or provider responses. Use real SDK construction, credential-free containment checks, then approved account and canary checks for provider behavior.

    npx tsc --noEmit --pretty false

Build the reviewed Linux image with the pinned Bun runtime. Run the actual trusted driver in the production-equivalent UID, cgroup, read-only filesystem, tmpfs, and network layout. Confirm that forbidden filesystem, broker, provider, and backend access fails. Record the image digest, runtime versions, preflight hash, and safe results before deployment.

## Validation and Acceptance


A real restricted OMP session exposes only the claim's Gateway tools. It has no persistent conversation, ambient extension, shell, eval, browser, or task access. No OAuth credential appears in child environment, workspace, stdout, stderr, or source artifacts. The child can call the model gateway but cannot reach the auth broker or public provider endpoint.

An invalid terminal result receives bounded correction feedback in the same invocation. An accepted result produces exactly one terminal frame. The supervisor confirms the same durable result. Cancellation and hard timeout terminate the contained process and leave no workspace or child process. Existing meaningful Gateway authorization, idempotency, and stale-generation tests still pass.

The dedicated broker contains two distinct approved ChatGPT accounts. The model gateway uses the explicit `openai-codex` model and native account selection. Do not report successful account rotation from a single inference. Record only the selection behavior actually observed.

The bounded canary records a real producer result and the required independent review, or a precise evidence-backed terminal hold. The legacy repair hold remains. No organization becomes public and no automatic scrape is enabled. Admission closes after the bounded operation. Report a provider, contract, or authorization blocker as a blocker, not as operational success.

## Idempotence and Recovery


Do not overwrite an existing broker store or private credential file without inspecting ownership and obtaining the required approval. Generate private internal tokens without printing them. Keep refresh tokens in the broker's private persistent store. Do not back up live SQLite by copying only the main file while WAL writes can occur.

Fresh preflight is read-only. A failed check does not authorize a runtime restart. Preserve all existing invocation records. If OMP fails, stop only the authorized named canary runtime and close its admission under current authorization. Do not silently switch back to the expired Codex seed or reset the attempt counter.

## Artifacts and Notes


The previous bounded repair implementation and its historical verification remain in `plans/affiliate-governed-codex-luna-handoff-execplan.md`. This plan supersedes only its active Codex execution and authentication direction. Earlier test totals do not prove OMP behavior.

## Interfaces and Dependencies


Use `@oh-my-pi/pi-coding-agent@18.1.13` with Bun 1.3.14 or later. Import the supported SDK surface, not a copied agent loop. Keep the existing runner protocol and terminal frame shape. The new child executable is a trusted wrapper around `run-affiliate-omp-agent.ts`; no caller can select another program.

The root runner owns required `AFFILIATE_AGENT_MODEL_GATEWAY_ADDRESS`, `AFFILIATE_AGENT_MODEL_GATEWAY_TOKEN`, and `AFFILIATE_AGENT_OMP_MODEL` configuration. The selected upstream model remains `openai-codex/gpt-5.6-luna` unless real account metadata proves it unavailable and the operator selects a replacement. Never fall back silently to a different provider or model.

Revision note (2026-09-07): Created after the operator selected OMP and two ChatGPT accounts. The prior Codex refresh token is unusable. Preserve governance and failure history while replacing the execution runtime and credential ownership.

## Source review record


Review base: `3a522c2bf31eac08ea2366fbe5ad77279cef5cc2`.

Runtime section: Standards and specification review findings are fixed and re-reviewed. The fixes cover private directory ownership, full evidence context, spill-safe pages, disabled direct WebSocket prewarm, durable correction budgeting, exact failed/indeterminate terminal replay, and bounded receipt confirmation after deadline or shutdown. New late effects still fail normal authorization timing.

Deployment section: Standards and specification findings are fixed and re-reviewed. The capture instructions now derive the runner fingerprint from its actual environment, reject hidden model bearers, inspect every broker-volume consumer, bind every worker topology row to captured data, and retain complete fresh evidence during refresh. The final capture-only Standards and specification reviews both report no findings.

Credential isolation review found one model-service slot-binding defect. It is fixed and covered by preflight denial tests. The independent review found no other introduced exploitable credential or tool-escape path. Deployment review is complete. Actual image, account, and runtime checks remain separate gates.

The final unified source gate passed `npx tsc --noEmit --pretty false` and 440 tests across 15 suites. The command exited successfully. Expected simulated-failure diagnostics and Jest's post-run open-handle warning remain visible; no `--forceExit` was used. The earlier indefinite test hang was a fixture error: fake timers captured `queueMicrotask`, so the fake child never spawned. Keeping that scheduler real makes the isolated deadline test pass and exit in about one second.

A real isolated OMP 18.1.13 session on Bun 1.3.14 exposed exactly the three trusted tools. It included all three opaque evidence references from the fixture manifest. It had no session file, persistent artifacts, MCP manager, model fallback, or WebSocket preference. Native schema conversion accepted the declarative command and rejected arbitrary execution. No provider request was made.

The new bearer preparation module parses with the pinned Bun transpiler. Both shell entrypoints passed syntax checks. The wizard later failed before callback readiness and was retired at the operator's request. Direct `omp auth-broker login openai-codex-device` inside the broker container completed both logins without a callback tunnel. ShellCheck is not installed.

The repaired capture programs were exercised with credential-free transformation fixtures. They remove bearer text, retain the normalized fingerprint, distinguish internal from external networks, retain an unmanaged broker-volume consumer, reject a stale worker topology and forbidden model bearer environment, preserve a complete refreshed inventory, and reject relabeled stale process data. The updated evidence-path manifest includes the new capture artifacts and uses the documented newline-inclusive SHA-256 convention.

## Auth setup checkpoint


Source commit `146c58ccaa222035c75279d1c891367fdf2c77d8` is integrated and pushed
to `main`. Site CI completed successfully at
`https://github.com/Razumly/bracketiq/actions/runs/34179072169`.

The approved images were built on the Linux x86_64 VPS and published:

- Agent: `ghcr.io/razumly/bracketiq-affiliate-governed@sha256:fa224b1058cfefc0556e46dc23693630e63b4c162d3c2ed81e76c8a963497bb4`.
- Gateway: `ghcr.io/razumly/bracketiq-affiliate-gateway@sha256:6c056ebe1d8c1c27527eb8683d77c14dfc7850a9d4c11404d14c6e30b0d8ca38`.

Both image builds completed. npm reported 35 dependency advisories during
installation: 1 low, 18 moderate, and 16 high. No automatic dependency update
was applied. This count is not an exploitability assessment.

Two distinct generated internal bearer files now exist under the approved
private configuration directory. Their owner is `0:1003`, mode `0640`, and
each file is 65 bytes including its final newline. The shipped helper
verified regular-file identity, permissions, UTF-8 value, and distinct
normalized fingerprints without printing the values.

The auth-only environment is
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-auth-setup.146c58cca.env`.
It is mode `0600`. The canonical `governed-deployment.env` remains unchanged.
Only the two model containers were created. The broker was started and is
healthy. Its container ID is
`83dd08b3b5498f7d0c37ee09dcfa5569e4d9c663d931197d599870880712500a`.
It runs as `1003:1003` and reports Bun `1.3.14` and OMP `18.1.13`.
It now stores two active, distinct ChatGPT OAuth identities. The model gateway
was started under the existing auth-only approval and is healthy. Its ID is
`ddff3bf5ba780f7d75e301463473966e422ddf44d9316c91d48315b25617a10e`.

Actual Docker inspection confirmed the two internal model networks, separate
egress, no production database network intersection, no host-published
ports, read-only root filesystems, dropped capabilities, restart policy
`no`, and the expected private mounts. The broker is the only current
consumer of `bracketiq-affiliate-model-auth-broker-state`.

This Docker 29 containerd image store reports the container image ID as the
same manifest-list digest used by the image reference. Always capture the
Docker-reported ID. Do not substitute the image build's configuration digest
or assume that the two identifiers must differ.

The host has no `node` command. For the privileged bearer capture, a private
Bun binary was copied from the reviewed broker image to
`/home/bracketiq/.cache/affiliate-governed-builds/146c58ccaa222035c75279d1c891367fdf2c77d8/operator-bun`.
The source and copy both hash to
`a8f9ebd1770ddc8e55dab7a68d4ec1ec1eebf374bb97cc65cf2c3cb373fc6791`.
The copy is root-owned. It is not installed on the global PATH. Use this
reviewed runtime for the host capture helper instead of assuming Node is
installed.

The operator completed both logins through SSH with the native device flow:

    docker exec -it --user 1003:1003 bracketiq-affiliate-governed-affiliate-model-auth-broker-1 sh -c 'umask 077; exec /workspace/apps/site/node_modules/.bin/omp auth-broker login openai-codex-device'

Read-only broker inspection confirmed two active, distinct identities.
The model gateway's authenticated credential check returned HTTP 200 with
two healthy accounts, zero failed or unverified accounts, and broker-managed
refresh for both. Its authenticated catalog contains
`openai-codex/gpt-5.6-luna` with a 1,000,000-token context and 128,000-token
maximum output.

A no-tool operator connectivity probe used the real pinned SDK and
`pi-native` transport through the model gateway. It returned `OK`, stopped
normally, and reported 26 input tokens and 5 output tokens. The initial
probe was rejected before inference because its system prompt was a string;
the corrected probe used the native array-of-strings context contract.
One successful pool request does not prove rotation between both accounts.

At the auth-only checkpoint, the existing BracketIQ Gateway remained healthy.
Mapping workers, the root runner, coverage, and replenishment had not started.
The later bounded workload approval and its measured result follow.

## Bounded workload checkpoint — 2026-09-08

Fresh preflight passed at `2026-09-08T05:26:34.863Z`. It had no blockers
or warnings. It counted 20 stopped legacy processes, zero running legacy
processes, zero live claims, and zero unsafe containers. Its report hash is
`4a6a8311f14a4812622b7dd6808c6b0abb8097ac157dea2cd557d2aa7461966b`.
The private capture is in
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-workload-evidence-01`.

The bounded deployment uses
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-workload.146c58cca.env`.
The canonical `governed-deployment.env` remains unchanged. Only the Gateway,
root runner, mapper 1, and reviewer 1 were recreated. Both exact worker
readiness checks passed while admission was closed. The root runner reported
UID 1002/GID 1001 for its child, private cgroups, and clean startup recovery.

The operator opened one 300-second producer lease. It claimed only job
`d7a1fe71-c76e-4191-a3f3-610c737d683e`. Claim
`agw-claim-86a3a733-fd41-43b3-beb6-3583d6b5dfe5` ran from
`2026-09-08T05:32:18.535Z` to `2026-09-08T05:33:04.489Z`.
It used deployment contract 3, role contract 2, and prompt template 2.
Its status is `COMPLETED`. It has no failure code.

Two `READ_ARTIFACT` receipts succeeded. The terminal domain effect succeeded.
The `SUBMIT_RESULT` receipt is
`agw-receipt-88ab49ff-643d-46ab-ba36-878b6d2b7b4c`. The result hash is
`20ac1e9270df39816e38bfd1d8625ba8700ae67805b44cd7d47232fe76efb6e7`.
The result is `CONTRACT_GAP` in `MAPPING_EVIDENCE`. The stored evidence
describes track-and-field events. The model requested an approved canonical
sport mapping or an authenticated user decision. It also requested a
citable source page URL. No package was validated or committed.

No reviewer job was created, so no reviewer lease was opened. This verifies
the real producer evidence-read and terminal-hold path. It does not verify
package commit, independent package review, activation, or publication.
Those paths remain outside this measured result.

Final readback found zero active claims, zero supply targets, and an empty
runner workspace volume. Admission is closed. Mapper 1, reviewer 1, and the
root runner are stopped with restart policy `no`. The Gateway, model
gateway, and auth broker are healthy. Dormant mapper 2, reviewer 2, coverage,
readiness helper, and replenishment containers remain stopped on their
previous images. The source still has `autoScrapeEnabled=false`. The root
still has `isAutomationEnabled=false`, generation 1, and its repair hold.

Do not retry or reset the completed job to bypass this contract gap.
Resolve the sport decision and citation evidence through the governed
process. Any further workload run needs new authorization and fresh
preflight evidence. The corrected diagnostic probe passed real Linux
containment checks and `node --check`. It is a source correction; the
published image still contains the old diagnostic probe.

## Two-source repair trial — 2026-09-08

The operator approved a bounded trial for these existing mapping jobs:

- USA Softball Academy Chicago:
  `80d2c546-60dd-4773-80d5-bb73803884fd`.
- Boomtown Athletics:
  `9fdeacd3-1a91-416a-b0a7-9dfe940249aa`.

The approval permits fresh preflight, a Gateway configuration refresh, and
starting only the root runner, mapper 1, and reviewer 1. It permits mapping,
independent review, and bounded producer repair for these two sources.
Close admission and stop the trial workers and runner after the result.
Publication, automatic scraping, coverage, and replenishment remain disabled.
Do not change adjacent runtimes or the canonical deployment environment.

The scoped admission preview found two eligible jobs and no held job.
Both have stored HTML, Markdown, and source page URLs. No governed reviewer
job exists, so both must enter through the mapper before independent review.
The current model check found two healthy distinct accounts with broker-managed
refresh. The authenticated catalog still exposes the exact Luna model.
Private trial records use
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-two-source-run-01`.

The first fresh preflight correctly blocked the running Gateway. Main stopped
only that Gateway for the approved refresh and captured all evidence again.
The second capture passed with no blockers or warnings at
`2026-09-08T17:11:27.564Z`. Its report hash is
`9bd5e70ecd959fa3544b8ab98922d07f43a0530efe92731c4e62504643f5b4f8`.
Its private directory is `omp-two-source-evidence-02`. The Gateway restarted
healthy with this report. The workload contract and image digests did not change.

The exact scoped admission report is
`00e781d1278ad0bc2d9956f95a8ad35a04a9faba2368d4a92187f02b2a914195`.
Gateway apply admitted only the two approved jobs. It created these lineages:

- Softball: Gateway job `4ca0ad3c-b859-4640-8168-5978162591ff`,
  root `155b4ca8-4d4b-4003-8e62-120a979556ab`.
- Boomtown: Gateway job `a3e78509-c2e2-409c-80a3-02325359b290`,
  root `c9a05d4c-ed7a-4809-b3f6-39f1af8f806e`.

Both roots started at generation 1 with `LEGACY_SPORT_REPAIR` and automation
disabled. Both exact worker readiness checks passed before the first lease.
The baseline preserves each old sport value, candidate, approval, and repair
history. Softball has a historical promoted CLUB candidate, but its organization
is unlisted with both public surfaces disabled. The admission guard explicitly
permits that private draft; this trial must not make it public.

### Trial result

Both producer claims completed without invocation failures. Neither produced
a validated or committed package. No reviewer job was created, so no reviewer
lease or producer-repair loop ran.

Softball claim `agw-claim-c9ba2dd9-35cc-4306-a0f5-75d3b359d732` ran from
`2026-09-08T17:13:16.042Z` to `2026-09-08T17:17:56.013Z`.
Its `CONTRACT_GAP` receipt is
`agw-receipt-69c115cf-830b-4448-b86e-f40f9d84a409`.
Its result hash is
`e54a6dbf160c8d33f6104ed30454fb759021bf3a19130edbbb69674b670207ce`.
The model resolved `Softball` but reported a missing authorized `listUrlRef`
and capture profile.

Do not treat that report as proof of missing source data. Both referenced
stored artifacts retain the correct `sourceUrl` and `finalUrl`. The claim
contains their artifact references. The Gateway's package guard checks
`listUrlRef` against claim evidence references. Its production adapter resolves
the URL from the stored artifact metadata. The exact reason the model did
not use this path remains unproven. Investigate the prompt/tool contract and
the rejected package attempt before requesting another URL or a human sport
decision. The terminal summary is not independent validation evidence.

Boomtown claim `agw-claim-cb5d60b5-5022-4353-8665-af4d2aecc8be` ran from
`2026-09-08T17:18:26.440Z` to `2026-09-08T17:21:47.379Z`.
Its `CONTRACT_GAP` receipt is
`agw-receipt-a7745e85-e319-4f25-8156-435fe056affa`.
Its result hash is
`7ec1e9aae71cf80fe9c8dde2f2e2f340699248b19c9615ba38b8508e919b5109`.
The model reported that generic `Volleyball` evidence did not establish
Indoor, Grass, or Beach Volleyball. Its terminal result supplied no evidence
references. This is the model's hold decision, not an independent review.

The trial recorded four successful artifact reads, seven heartbeats, two
successful terminal domain effects, and two successful terminal submissions.
It recorded no package validation or commit receipt. Both invocation failure
counts remain zero.

Final readback proves that source/intake identities, organization values,
candidate values and counts, and all prior repair-history entries remain
unchanged. Each mapping job is now `REVIEW_REQUIRED`. Each new root remains
`PRE_MAPPED`, generation 1, with `LEGACY_SPORT_REPAIR`, automation disabled,
and zero supply targets. No public surface was enabled.

Admission is closed. Global active claims and claimable Gateway jobs are zero.
Mapper 1, reviewer 1, and the root runner are stopped. Their restart policy is
`no`. The runner workspace volume is empty. The Gateway, model gateway, and
auth broker remain healthy. Adjacent runtimes were not changed.

Private evidence includes `before-state.json`, `after-state.json`,
`before-after-comparison.json`, `terminal-state.json`, `final-runtime.json`,
and `softball-url-metadata.json`. The exact capture procedure is retained as
`capture-preflight.py` in the private trial directory, mode `0600`, SHA256
`d5004a550146492393227f6d19276863084d33c4d29e1744385e0cf3e39eef31`.
Its retained report is historical evidence, not permission for another run.

## Source correction milestones

First update `agentGateway.ts`, `prismaAgentGateway.ts`, the supervisor HTTP
decoder, and `affiliateOmpGatewayTools.ts` so an artifact read exposes
`sourceUrl` and `finalUrl` from immutable storage metadata. Both fields are
required nullable strings. Preserve them through cached pages and image
metadata without exceeding the existing serialized page limit. Missing
metadata remains null; do not derive authority from links in page text.

Next update the generated prompt and command schema descriptions in
`agentGatewayContracts.ts`. Explain that `listUrlRef` names an authorized
page artifact, not a raw URL, and that existing evidence does not require a
capture profile. Explain evidence-backed sport surfaces, including an explicit
indoor venue that hosts all of the source's volleyball. Do not use venue names
or generic sport labels alone as proof. Require citation-owned sport
assessments for legacy contract gaps. Keep role/prompt version changes aligned
with current fixtures and deployment hash generation.

Then close the generic-gap bypass in `verifyLegacySportRepairTerminal`.
Use the existing correction budget and exact claim generation. Invalid
assessments must not become completed results. Keep a valid non-sport gap
possible after the sport has been resolved and verified.

Finally add a narrow command-rejection diagnostic record for local schema
errors and typed Gateway errors. The child writes it outside terminal stdout.
The root validates field names, enum values, sizes, and record counts and
binds identity from its trusted invocation. It must discard arbitrary text and
never log input values, credentials, URLs, prompts, or raw error messages.
Record diagnostics even if the invocation later submits a successful hold.

Run focused Gateway, supervisor, OMP tool, and runner tests from `apps/site`.
Run TypeScript once after all concurrent edits complete. Replay the private
captured evidence through the actual updated OMP reader and require both
provenance URLs plus the complete Boomtown indoor-venue evidence. Verify the
legacy empty-evidence gap is rejected with correction feedback and a resolved
sport/non-sport gap remains valid. Verify diagnostic bounds and redaction
across split input chunks and successful child completion. Do not call a
provider, restart a runtime, publish an image, or mutate production data.

Revision note (2026-09-08): Extended this plan after source-correction approval.
The measured trial results above remain historical evidence, not fixed data.

## Source correction verification — 2026-09-08

The current source implements all four corrections. Current role and prompt
contracts are version 3. The generated instructions remain inside the existing
16-entry and 1,000-character-per-entry bounds. They include evidence-backed
surface rules and a complete sport-assessment shape without loading ambient
skills or context files.

The source passed 366 tests across 10 focused suites, TypeScript, and targeted
ESLint. These suites cover Gateway state transitions, artifact receipt replay,
generic-gap correction, wrong-owned evidence, catalog drift, resolved
non-sport gaps, HTTP transport, OMP paging, and runner diagnostic redaction,
bounds, split input, and successful completion. Database-backed integration
tests were not run; their fixtures were updated and type-checked.

The offline replay passed for the two real stored captures: four artifacts
across 13 bounded pages retained both provenance URLs and all original text.
The replay used the current contracts with offline authorization only. It
made zero provider calls and zero production writes. This proves the repaired
evidence interface, not a new successful production mapping decision.

Integration checks found and corrected an overfull prompt template, missing
fixture fields, and diagnostic typing/nullable parsing errors. The prompt
bounds were preserved rather than relaxed. Historical receipt fields may be
absent, but malformed stored URL values now fail integrity checks instead of
silently becoming null. Independent review records are attached to Issue 70.

No image was published, no runtime was restarted, and no completed job was
reset or retried during this source correction. Deployment requires separate
current authorization, matching version-3 contracts, and fresh preflight.

### Review findings and additional proof

The first independent review found four gaps. The final SDK wrapper now sends
malformed `execute_command` input to the bridge's strict validator without
changing its advertised schema. The root charges all diagnostic input before
parsing, so malformed stderr cannot bypass the input budget. Empty legacy
sport-determination arrays enter bounded correction. Package listing URLs
require stored provenance and cannot fall back to page-body links.

The real validation-to-commit regression found an additional source mismatch:
the persisted validation summary omitted the receipt ID that commit binding
requires. The source now persists that ID. Positive production-adapter
validation-to-commit and missing-provenance rejection cases pass without a
test-only summary patch.

The pinned SDK regression passed with the exact bundled Luna model and no
provider response. It checks the final wrapped AgentTool, unchanged schema,
local diagnostic delivery, and zero Gateway/provider/network calls. The
regression uses an empty required string because the SDK can coerce a numeric
value to a valid string before bridge validation.

    npm exec --yes --package=bun@1.3.14 -- bun scripts/test-affiliate-omp-agent-sdk-schema.ts

The focused suites also passed with `--detectOpenHandles`; that diagnostic
run reported no retained handle. The source and review-fix records remain on
Issue 70. Production records remain held and unchanged by this source work.

## Approved deployment and linked retry

The operator approved publication and deployment of the reviewed correction,
followed by a bounded retry of the same Softball and Boomtown records.
Publication and automatic scraping remain disabled. Main must close admission
and stop mapper 1, reviewer 1, and the root runner after the trial.

Read-only inspection found no supported Gateway operation for retrying a
completed hold. The operator's approved sequence includes fixing that missing
transition before running. Add an operator-only `/legacy-repair/retry` preview
and apply operation. It takes explicit parent Gateway job IDs, a bounded
reason, and a reviewed report hash for apply. It creates new child producer
jobs rather than resetting completed jobs.

The parent jobs are `4ca0ad3c-b859-4640-8168-5978162591ff` for Softball and
`a3e78509-c2e2-409c-80a3-02325359b290` for Boomtown. Both still have completed
`CONTRACT_GAP` results and zero invocation failures. Their mapping jobs are
`REVIEW_REQUIRED`; their intakes are `READY_FOR_MAPPING`. Their roots remain
`PRE_MAPPED`, generation 1, with `LEGACY_SPORT_REPAIR` and automation disabled.
Both organizations remain unlisted with public surfaces disabled.

The retry must bind each completed parent claim, result hash, terminal receipt,
mapping/source/intake identity, evidence run, current catalog, and unchanged
root generation. Require a changed deployment contract for the software
correction. Increment the existing mapping pass and keep its maximum of three.
Use one deduplicated child per parent. Preserve old Gateway jobs, claims,
receipts, and failure history without modification. Queue the existing legacy
mapping job and append retry audit history in the same serializable transaction
as child creation. Reject active descendants, public or unsafe state, stale
identity/evidence, exhausted passes, same deployment, and report drift.
An exact apply replay returns the existing children with zero writes.

Main will verify the new transition with focused regression tests and
independent review. The publication workflow requires clean integration into
`main` and successful site CI for the exact source commit. Publish that reviewed
commit, not an earlier image that lacks the retry operation.

Prepare a separate private deployment environment with the next deployment
version and current role/prompt contracts. Capture fresh complete preflight
evidence; do not restamp a historical report. Keep the canonical deployment
environment and dormant workers unchanged. Inspect model-service image parity
before runtime changes and obtain explicit approval for any additional named
runtime that the current bounded scope does not cover.

The image-parity check requires the auth broker and model gateway to use the
same reviewed agent image as the new workers. The operator explicitly approved
refreshing both named model services for this deployment. Preserve the existing
two-account store, broker volume, profile identities, and bearer files. This
does not authorize other workers, coverage, replenishment, publication, or
automatic scraping.

### Retry implementation verification

The new retry path passed 399 tests across 11 focused suites, TypeScript,
targeted ESLint, and the pinned SDK no-provider probe. A bundled read-only
preview also ran against the actual held records. PostgreSQL reported
`default_transaction_read_only=on` before the preview. Both parents were
eligible for pass 2; two successive previews produced the same report hash.
The preview made no application writes.

That check exposed two legacy-data assumptions before publication. Old
role/prompt-2 terminal gaps may lack `sportEvidence`; retry validation now
checks their historical identity/hash/receipt rather than applying new result
semantics retroactively. Captured runs and pages may have null root links
because the original admission pins the selected artifacts but does not
backfill every capture row. Null links remain valid through the verified
intake/run/pinned-artifact lineage. Non-null foreign roots still fail.

The new dedupe key is parent-stable. Versions, hashes, and reasons remain in
the reviewed report and audit history rather than allowing another sibling
under a different key. The version-4 contract derived from the actual existing
bundle and current exports hashes to
`613e2396cc076ac190405f286a7cf3125b0cffed1056b6988ddaf3ab05f8f68b`.
Publication now supplies an OCI revision label on both images so fresh
container evidence can bind the six refreshed services to the exact source
commit. The five dormant services remain stopped and unchanged.

The retry review required stronger historical identity and replay checks.
The source now binds all parent envelope/result identity and contract fields,
the child catalog to its audit, and root identity across ancestors. It resolves
original admission proof through the chain for a pass-3 retry. Replay requires
the actual audited child and permits normal later root progress. Any retained
active job pointer blocks apply, even without an ACTIVE claim row.

The compatibility fixture now uses authentic role/prompt-2 hashes and invokes
the real admission apply writer. Its audit shape reflects the original writer:
the stored selected row is `PROPOSED`, the report row is `APPLIED`, and a
`CREATE_ROOT` selected row has no root ID before creation. Validation binds
the deterministic hash fields and the resulting audit root rather than treating
these expected differences as corruption.

After these fixes, an enforced read-only preview against the actual two
parents again returned two eligible pass-2 attempts, no held rows, and a stable
report hash. Old parent rows remain unchanged. Independent re-review is the
remaining source gate before main integration and image publication.

The final historical checks also validate version-3 terminal sport evidence
against its frozen parent catalog, capture context, and retained artifact bytes.
Version-2 history remains exempt from the later assessment requirement. Every
non-root retry edge requires its own hash-verified incoming audit. Replay binds
immutable audit, parent, child, routing, catalog, manifest, and identity fields
back to the reviewed report row and proposed write, not only to each other.
The real read-only preview still selects both intended parents with no blockers
and a stable hash; no application rows changed during this verification.

Incoming retry audits now contain the final APPLY report, including the
created child IDs, selected scope, counts, and APPLIED outcomes. Validation
rejects a hash-equivalent PREVIEW snapshot or an unchanged-deployment audit.
Replay binds historical mapping IDs to the audit/report rather than to a
mapping pointer that normal successful descendant work can advance. The
actual incoming child dedupe key is checked against its parent-stable key.

Eligibility and incoming-audit validation use the same deployment and Supply
identity rules: both deployment version and hash must change, and the Supply
version/hash must match the parent. Immutable source and mapping-job IDs remain
bound even when the historical mapping pointer is permitted to advance.

### First version-4 deployment and replay ordering correction

Commit `cda1a1e88bd9e6088620cf800666417c73abd160` passed Site CI run
`34299836392`. Governed image publication run `34300445707` succeeded.
The worker image digest is
`sha256:9107033201c5dc8778f4144ecd7c54eab2dbb8f7424195d3e25d6052d70e0776`.
The Gateway image digest is
`sha256:6d07efc8594036b96d3239a14a2c1c97e2d437debdef4c85957584892bdfff7b`.
Both image revision labels match the reviewed commit.

The approved six services were refreshed. Both broker logins remained healthy
and distinct. The actual Linux worker image passed producer/reviewer containment
and the SDK no-provider probe. Fresh preflight passed with no findings:
`0d10b842721ec130cee67c0e11a1cd0f3c77039270497efcfb4ed3d47d431182`.
The version-4 environment is in
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v4-retry-cda1a1e88`.

The exact retry apply created Softball child
`91f4fbe2-7247-4277-a124-0cfb013bbb3c` and Boomtown child
`bbdb8376-2736-4e0a-b8b7-121cb398a1c5`. All 19 original job, claim, and
receipt row fingerprints remained unchanged.

An immediate replay safely returned `RETRY_STATE_DRIFT`. A read-only predicate
probe showed that the child identity and every audit check matched except one
artifact-ID comparison. Manifest entries use evidence-reference order, while
the approved write uses sorted unique artifact IDs. Real UUIDs exposed the
ordering difference that the original fixture names had hidden.

The source now compares the same sorted artifact-ID set. The fixture deliberately
reverses ID order relative to evidence kind. It reproduced the live failure
before the correction and passed afterward. Both focused suites passed
(78 tests), as did TypeScript and lint. A corrected replay against the actual
rows, with PostgreSQL writes forbidden, returned the same two child IDs and
zero writes. No child claim was consumed. Admission remains closed and the
idle trial workers/runner were stopped for the correction rollout.

### Corrected rollout and bounded retry outcome

The ordering fix `1f21c7a2193dd77f12cbb73ba515d106f0c35aaf` passed Site CI
`34307963777` and publication `34308977192`. The deployed worker/model digest is
`sha256:99a3feb33b6b9a2553da562e78c1410e91fe4b000c0dbd7179abfdf19ee6abc4`.
The Gateway digest is
`sha256:410dde0e7e027c943df8cc76c2aea5a29abe35254021927aaf0aab26af542b8c`.
The deployment contract remains version 4 with the same hash. Fresh preflight
passed with hash
`4899fd9b59527a75fb7f59314c4fd86b1d83024b8f3af8ade115a2781753ea54`.
The live exact retry replay returned the original two children with zero writes.

Softball child `91f4fbe2-7247-4277-a124-0cfb013bbb3c` completed as
`CONTRACT_GAP`, receipt `agw-receipt-b6831693-7ccb-40f4-b7db-9cfdc4c2cb92`.
It supplied a verified `RESOLVED` Softball determination and an owned Markdown
citation with the correct page URL. The root log retained one local schema
rejection and six Gateway `VALIDATE_DECLARATIVE_PACKAGE` internal errors.
No validation or commit receipt was produced. The model described EVENT
validation attempts; the existing source is CLUB. The exact cause of those
internal errors is not proven. Do not treat the model's layout explanation
as an authoritative backend diagnosis.

Boomtown child `bbdb8376-2736-4e0a-b8b7-121cb398a1c5` completed as
`BOUNDED_REPAIR_SUBMITTED`, receipt
`agw-receipt-b1a5c2b6-a012-413e-8851-02468358845d`.
Commit receipt `agw-receipt-e939a5e0-5f75-4eef-8739-f117c16a6781` records
package `60df90cb66416a314a2dc8a8f96260dcac414d91627785d472a8660a5e2fc4bf`.
It created mapping `agw-artifact-53fb238e-f15a-452f-a694-2bb4049ac7b5`,
version 2. The mapping carries verified Indoor Volleyball evidence, the
source page URL, venue/address selectors, and a registration action.
It remains inactive and has no `validatedAt`. Existing candidate values
and the private organization remain unchanged.

Independent reviewer job `d2489e87-490e-495f-9e76-fa38d97ef02f`, claim
`agw-claim-7d3e9235-39c9-451a-b2fe-efd66ebb04b7`, read the committed package,
deterministic validation, and durable evidence. Its `active-contract` read
failed. A separate read-only store probe confirmed zero File rows and
`NoSuchKey` for the supplied `supply-contract:<hash>` handle.

The reviewer selected APPROVED with source-backed rationale. The intended
result is retained in terminal-effect receipt
`agw-receipt-42ec1599-5b1a-4583-98d4-1e7e197ca45c`, but that receipt is
UNKNOWN with `PARTIAL_COMMAND_UNRESOLVED`. The job and claim are
`RECONCILIATION_REQUIRED`. No APPROVE lifecycle transition or successful
review terminal receipt exists. The root's stage named APPROVED, generation 2,
came from RECORD_MAPPING; it is not proof that this independent approval
completed. The exact terminal-effect failure cause remains unproven.

Main closed admission and stopped mapper 1, reviewer 1, and the root runner.
The workspace volume is empty. The Gateway and both model services are healthy.
There are zero ACTIVE claims and zero claimable jobs, but one unresolved
review claim pointer remains. Both roots retain `LEGACY_SPORT_REPAIR` with
automation disabled and zero supply targets. Both organizations remain
unlisted with public surfaces disabled; automatic scraping remains off.
All 19 original Gateway job, claim, and receipt row fingerprints are unchanged.
No direct database repair or forced completion was performed.

Private final evidence is under
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v4-retry-1f21c7a21/run`.
It includes the applied/replayed scope, old fingerprints, producer results,
retained diagnostics, committed mapping, reviewer intent/ledger, failed
active-contract read, final records, and final runtime state.

Further work must resolve the Softball validation failure, make the supplied
contract artifact readable through the governed path, and safely reconcile
the unknown reviewer effect. Do not reset the completed jobs, remove the
holds, or call a reviewer recommendation a recorded approval.

## Post-retry source corrections


The operator requested continued correction after the read-only diagnosis.
This authorizes source implementation and verification. It does not authorize
another deployment, worker start, retry, or production data repair.

The Softball source has target kind CLUB. Its producer claim omits that kind,
and the retained model result describes EVENT packages. A pure source probe
rejects that combination. The worker also changes an explicit non-retryable
Gateway error into a retryable error for HTTP 500. The exact failed package
requests were not retained, so the original six failures cannot be replayed.

The Boomtown read-only lifecycle replay rejects APPROVE. Its current version-2
mapping is paired with a version-1 scrape run. The assessment reports
LATEST_RUN_MAPPING_MISMATCH and REQUIRED_LIFECYCLE_EVIDENCE_MISSING.
It returns stage APPROVED with outcome REPAIR_REQUIRED, rather than MAPPED.
The reviewer effect discards the original exception before reconciliation.

The reviewer contract artifact is synthetic. The HTTP artifact reader sends
its handle to object storage, where no object exists. The adapter resolver
also compares a policy hash with the outer manifest hash. The stored values
differ. Both paths must resolve the same authorized canonical bytes.

### Plan of work and acceptance


Add required `subject.listingKind` to new mapping producer claims. Load it
from the stored source. Migrate current claim callers and fixtures. Do not
rewrite old claims or their hashes. Reject a package kind mismatch with a
fixed safe diagnostic. Honor explicit server retryability in the worker.

Resolve synthetic contracts through the authorized artifact-read path.
Validate the handle, canonical bytes, and claim manifest. Preserve integrity
failures for wrong hashes and invalid records.

Correct current-mapping evidence selection for replacement mappings. Keep
historical runs intact. Do not invent a successful scrape or erase a genuine
identity violation. A valid replacement package must reach independent review
with genuine bound validation and durable source evidence. Missing or
mismatched evidence must still block review. Approval must retain quarantine
and the existing automation hold.

Retain fixed, bounded reviewer failure codes with the existing operation
receipt or event structure. Do not retain arbitrary exception text, source
arguments, credentials, or stack traces. Preserve UNKNOWN when an effect
cannot be established safely.

Run the affected complete Jest suites from `apps/site` after concurrent edits
finish. Run TypeScript and targeted ESLint. Replay the demonstrated source
kind and retryability cases without providers. Exercise the contract read
and replacement-mapping approval through their application boundaries.
Run independent Standards and Spec review before source delivery.

Decision: Preserve prior production evidence and require separate operational
authorization. Source verification must not consume another claim or alter
the unresolved reviewer receipt.

Revision note: Added the source correction scope and the read-only findings
after the operator requested continued work.

The operator separately authorized Docker Desktop and the local PostgreSQL
service for isolated integration tests. Docker Desktop started. The existing
`mvp-site-db` container became healthy on local port 5433. A new
`bracketiq_e2e_70_gateway_retryfix` database received all 219 migrations.
Migration status reports that its schema is up to date. This approval does
not include any production runtime or data change.

## Independent correction review

The fixed-point correction review records independent findings separately
from the earlier production-read-only evidence. All identified findings moved
through `fixed -> re-reviewed -> verified` before this handoff:

- Gateway G1 (historical producer claim identity): **fixed, re-reviewed,
  verified**. Historical producer envelopes require non-null lifecycle
  generation, non-null outer Supply Source, and exact outer-to-subject Supply
  Source equality while retaining the historical absence of `listingKind`.
- Gateway G2 (reviewer terminal-effect diagnostics): **fixed, re-reviewed,
  verified**. EXECUTE and RECOVER diagnostics are persisted before
  recovery/finalization, bounded diagnostics merge into pending or UNKNOWN
  receipt state, and a late diagnostic after immutable `SUCCEEDED` is retained
  in a durable failure event without changing the succeeded response/hash.
- Lifecycle L1 (reviewer authority): **fixed, re-reviewed, verified**.
  Current Gateway proof is required; prior labels are compatibility evidence
  only rather than fresh approval.
- Lifecycle L2 (producer claim and artifact lineage): **fixed, re-reviewed,
  verified**. One current producer claim binds the mapping/job package and all
  artifacts by claim, generation, creating claim, source artifact, and
  content hash.
- Lifecycle L3 (bounded batch proof selection): **fixed, re-reviewed,
  verified**. Current mapping/job selection precedes proof IDs, large proof
  reads are chunked, and historical rows are limited to selection without
  truncating complete candidate/target identity.
- Lifecycle L4 (snapshot mapping/job fallback): **fixed, re-reviewed,
  verified**. Missing exact mapping/job identity no longer falls back to an
  arbitrary newest row; a pointed run is current only when it belongs to the
  exact current mapping lineage.
- Lifecycle reviewer-read recovery and future-writer integration: **fixed,
  re-reviewed, verified** against retained database metadata and strict
  read-only replay. Unavailable content bytes are not inferred.

Gateway Standards and Gateway Spec reviews both passed at the fixed point.
LifecycleFinalReview re-grounded the final source and reported no L1-L4,
admitted-reviewer, future-writer, pre-terminal `RECORD_MAPPING`, single/batch,
or loader findings.

Authorized local verification used Docker PostgreSQL `mvp-site-db` on
`127.0.0.1:5433`, isolated database
`bracketiq_e2e_70_gateway_retryfix`, with all 219 migrations applied. No
production database writes or runtime changes were made. The complete
affected verification finished with:

- `npx jest src/server/affiliateImports/__tests__/affiliateSupplyPersistence.test.ts --runInBand --coverage=false`:
  **88/88 passed**.
- The focused duplicate-reviewer recovery race in
  `agentGateway.test.ts`: **1 passed**.
- The exact 15-suite database run from
  `/tmp/issue70-fourth-correction-tests.json`: **15 suites, 505/505 tests
  passed**; result is saved at `/tmp/issue70-final-tests.json`.
- `npx tsc --noEmit`: **passed**.
- Targeted ESLint for the changed persistence and gateway test files:
  **passed** (only the existing Babel >500KB deoptimization note).
- `npm exec --yes --package=bun@1.3.14 -- bun scripts/test-affiliate-omp-agent-sdk-schema.ts`:
  **passed** with no provider call.

The strict production replay was read-only: the remote process set
`default_transaction_read_only=on` and exited 0 with empty stderr. It verified
the active contract artifact (`647` bytes,
SHA-256 `c808492a7d60741b508978987441a0a31f59602a5e5321789d9865823f6098cf`)
and assessed source
`c9a05d4c-ed7a-4809-b3f6-39f1af8f806e` at lifecycle generation 2 as
`MAPPED`, with `hasRequiredLifecycleEvidence: true`,
`reasonCodes: ["MAPPING_PACKAGE_VALID"]`, no invariant violations, and an
accepted `APPROVE` decision. Replay stdout is preserved at
`/tmp/issue70-final-readonly.jsonl`; the consolidated evidence is at
`/tmp/issue70-final-validation.json`.

This record does not authorize production deployment, retry, automation
enablement, writes, or UNKNOWN reconciliation. Those operational actions were
not performed.

## Authorized production completion


The operator confirmed that the goal remains repair of Softball Academy
Chicago and Boomtown Athletics. The operator then authorized integration,
deployment, and continued bounded repair and review for those two sources.
This approval permits the required governed Gateway, runner, mapper 1,
reviewer 1, and model-service image updates. It does not permit publication,
automatic scraping, coverage, replenishment, site, or mobile changes.
Close admission and stop the trial workers after the bounded operation.

Source commit `b0827c8a086f03dd583a591767c50eaf336295b2` was integrated
by fast-forward and pushed to canonical `main`. Site CI run `34392793823`
is the image-publication prerequisite.

Before deployment, read-only inspection confirmed zero active claims and
zero queued or retry-wait jobs. Softball pass two remains a completed
CONTRACT_GAP. Boomtown retains its committed replacement mapping and
RECONCILIATION_REQUIRED reviewer claim. Its original effect receipt remains
UNKNOWN with no response hash. Recovery must use an authorized, guarded
Gateway operation. Never reset that receipt or forge a new claim in SQL.

### Guarded reviewer-effect recovery prerequisite


The ordinary reconciler excludes UNKNOWN receipts and cannot resume this
reviewer claim. Add operator-only `POST /reviewer-effects/recover` with strict
PREVIEW and APPLY modes. Both require closed admission and exact receipt,
job, claim, and Supply Source IDs. APPLY requires the deterministic preview
hash. The server supplies the operator identity.

Limit this operation to retained APPROVED decisions for legacy sport repair.
Validate original envelope, result, receipt request, producer package, current
Supply Contract, current source generation, and bound evidence. Reject
unrelated active claims or claim pointers. PREVIEW must not write. APPLY
must preserve original state in a durable audit before a guarded resumption.
The old token stays invalidated. Reuse the original effect receipt as the
lifecycle idempotency key and retain safe failure diagnostics. Only a
verified actual effect can complete the reviewer claim and clear its pointer.
Exact replay must not repeat the lifecycle effect.

Recover Boomtown first. Its unresolved claim pointer blocks the producer
retry operation. After verified review completion, preview and apply one
pass-three retry for Softball job `91f4fbe2-7247-4277-a124-0cfb013bbb3c`.
Preserve its schema-one incoming audit and every completed producer row.
The operation has no authority to rerun Boomtown's completed producer.

Verify zero-write preview, stale report rejection, lineage and evidence
tamper rejection, failed recovery quarantine, concurrent replay, token
invalidation, and actual successful completion with isolated PostgreSQL.
Review the new operator boundary independently before publication.

## Final guarded recovery verification

- [x] (2026-09-09) Verify the source prerequisite at fixed base
  `b0827c8a086f03dd583a591767c50eaf336295b2`. Final Standards and Spec
  reviews both passed.
- [x] (2026-09-09) Complete the isolated database gates: core recovery
  integration **45/45**, HTTP recovery subset **55/55**, and the exact
  complete run of **15 suites / 531 tests**. TypeScript and targeted ESLint
  both passed.
- [x] (2026-09-09) Run the real production PREVIEW with a temporary process
  using `default_transaction_read_only=on`. The active source was eligible
  with `reasonCodes: ["ELIGIBLE"]`, `outcome: "PREVIEW"`, and `writeCount: 0`.
  Safe report is preserved at
  `/tmp/recovery-production-preview.safe.json`; report hash is
  `f4373cc8e3a9c84852dc8c327f8e407d3e4039c806118dae12ac944195bd4d20`.
- [x] Deploy the reviewed source and generated role-4/deployment-5 bundle.
- [x] Apply the guarded Boomtown recovery and verify the actual effect.
- [x] Preview and apply the authorized Softball pass-three retry.
- [x] Complete Softball repair and review through the separately authorized
  one-time continuation recorded below. The ordinary retry limit stayed intact.

The source prerequisite passed before deployment. The following record
describes the separately authorized production operation.

## Production result for deployment five


Commit `380c47c955f7aefaf569a743be7fb5c11bfb63b7` passed Site CI
`34406958561` and governed image publication `34407780513`. The worker image
is `ghcr.io/razumly/bracketiq-affiliate-governed@sha256:bb2a53757a8b6da0796c5015cc959220738c8d945c3e4452babc5604f31d70e2`.
The Gateway image is
`ghcr.io/razumly/bracketiq-affiliate-gateway@sha256:fadfb033f2d083aa4204f9fc92de1a57c14a82d5938c93e4cbca13dd30196f86`.
Both image revision labels matched the reviewed commit. The published worker
passed contract parsing, producer and reviewer containment, and the OMP SDK
probe with no provider call.

The deployment contract is version 5, hash
`fe2b850218d76be65a915321c0b46f38eaccf316522f10b48ce6abf1d2940d75`.
Fresh preflight passed with no blockers or warnings, report hash
`4960af117c7116eab1d6a5bc4646b9c311e15a4760ff876ca8f63fa7269d2a5d`.
Only the six authorized governed services were replaced. The canonical
deployment environment was not overwritten.

### Boomtown recorded approval


The deployed recovery PREVIEW was eligible with zero writes. Its report hash
was `8271b6b462dd49251ae566106c886ccd4dffa63472fd0aaafbe2d22df2cc5941`.
APPLY completed the original reviewer effect
`agw-receipt-42ec1599-5b1a-4583-98d4-1e7e197ca45c`. The original reviewer
job and claim are now COMPLETED. Terminal receipt
`agw-receipt-4e86d448-b8bd-49d4-811a-f4fa8b0a63a9` records APPROVED.
Lifecycle transition `6889492f-1aab-4ff5-a277-4323627828ba` records APPROVE
at generation 3 with the original effect receipt as its idempotency key.
Exact replay returned zero writes.

The authorization audit preserves the prior UNKNOWN receipt state, pending
response snapshot, hashes, claim status, deadlines, and invalidated token
time. The token remains invalidated at its original time. Mapping
`agw-artifact-53fb238e-f15a-452f-a694-2bb4049ac7b5`, version 2, remains
inactive and now has the recorded approval validation time. The root retains
LEGACY_SPORT_REPAIR and disabled automation. The organization remains UNLISTED
with public pages and widgets disabled.

### Softball pass-three blocker


The scoped retry created only Gateway job
`eabe21a7-a756-4957-9b25-f825a53f0e06`, linked to the completed pass-two
claim. Its retry report hash was
`e75498b0f173d98427b3b6806a582a8430ee811f44047bf628f601848105fd0d`.
Exact retry replay returned the same child and zero writes. The new claim
`agw-claim-c2cc5d79-3187-4c6e-9c4b-cc8b11b50482` carried listingKind CLUB,
role and prompt version 4, and deployment version 5.

The producer completed as CONTRACT_GAP, terminal receipt
`agw-receipt-c00f70fb-c8b2-4b56-8de3-1375adbb26b9`. It supplied a verified
Softball determination but produced no validation receipt, package commit,
or independent review job. Retained diagnostics show two local schema
rejections, three EVIDENCE_REFERENCE_NOT_PERMITTED validation errors, and
three INTERNAL_ERROR validation errors. All were non-retryable.

The model attributed failure to the Markdown evidence reference. That is
not a proven backend diagnosis: the evidence code also covers legacy sport
verification, and exact rejected package arguments were not retained.
The old version-1 mapping remains unchanged. A read-only retry preview for
the completed pass-three job returned RETRY_PASS_EXHAUSTED, no selected jobs,
and zero writes. No fourth attempt or forced reset was made.

### Final safety state and evidence


Admission is closed. Mapper 1, reviewer 1, and the root runner are stopped.
The Gateway and both model services remain healthy with restart policy no.
There are zero active claims, zero queued or retry-wait jobs, and zero
unresolved claim pointers. The workspace volume is empty. Both roots retain
LEGACY_SPORT_REPAIR and zero supply contribution. Both organizations remain
UNLISTED with public surfaces and automatic scraping disabled.

All 39 pre-operation fingerprints for the four completed producer jobs and
their claims and receipts are unchanged. Prior evidence remains intact.
Private operation evidence is retained at
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v5-recovery-380c47c95/run`.
It includes deployment and preflight metadata, image probes, recovery
preview/apply/replay, the preserved recovery audit, Softball retry evidence,
command diagnostics, final safety records, and workspace/history checks.

At the deployment-five checkpoint, Boomtown's mapped repair and approval
were complete and Softball was not repaired. Further production work required
a diagnosed validation correction and an
explicitly approved bounded continuation. Do not raise the retry limit or
rewrite completed attempts merely to clear the queue.

## Softball validation contract correction


The operator requested continued diagnosis after the pass-three blocker.
This step changes source and runs offline verification only. It does not
authorize a fourth claim, a retry-limit change, deployment, or runtime restart.

The exact rejected command arguments were not retained. The investigation
therefore used reconstructed packages against the actual claim and
hash-verified stored artifacts, not a claimed replay of the model's requests.
The production read used PostgreSQL `default_transaction_read_only=on`.
No new page capture or production write occurred.

The unmodified production preparation function accepted the stored HTML,
its evidenceRef, an h1 title selector, the stored registration-link selector,
a CONSTANT Softball field, and the verified Markdown sport citation. It
produced one candidate with the correct registration URL. Replacing only the
listing artifact with Markdown produced a generic no-candidates error.
Removing only the extracted sport field produced the misleading generic
EVIDENCE_REFERENCE_NOT_PERMITTED error. Missing sportEvidence and use of an
artifact ID instead of an evidenceRef also produced generic internal errors.

These probes establish two contract defects, but do not prove every failed
historical request. The generated instructions advertised Markdown as CSS
listing input even though the extractor parses HTML. Sport-output mismatch
was also reported as if the citation itself was unavailable.

The correction requires PAGE_HTML for declarative CSS listing input in
validation, commit, and reviewer re-extraction. PAGE_MARKDOWN remains valid
for reading and citations. The producer instructions now require
candidatePackage.sportEvidence and an extracted canonical sport field.
Current role and prompt contracts advance from version 4 to version 5.
A future deployment must bind those hashes in a new deployment contract.
Historical claim and result records are unchanged.

Deterministic package errors now return non-retryable, fixed safe messages.
Bounded diagnostic reason codes distinguish HTML input, selector syntax,
empty extraction, required fields, missing sport evidence, citation
references, catalog/run drift, and sport-output mismatch. Unknown sport
verification failures remain fail-closed and never expose arbitrary error
text. No evidence check or retry cap is relaxed.

The regression loop is `npx jest --runInBand --runTestsByPath
src/server/affiliateImports/__tests__/agentGatewayAdapters.test.ts
scripts/__tests__/runAffiliateAgentRunnerDiagnostics.test.ts` from `apps/site`.
The new Markdown-input and sport-output regressions failed before the
correction. They pass afterward. The two complete suites passed 48 tests.
The real-evidence probe also passes for HTML with the Markdown citation and
returns the distinct safe failures for the invalid package variants.
The complete affected run passed 538 tests across 15 suites, including both
isolated PostgreSQL integration suites. TypeScript, targeted ESLint, and the
pinned Bun 1.3.14 OMP SDK no-provider probe passed. Independent Standards and
Spec reviews both returned PASS with no findings.

Decision: Require the actual HTML format at the CSS extraction boundary
rather than add a Markdown conversion path with different selector
semantics. Preserve Markdown as valid citation evidence. Keep every
verification failure fail-closed, but report a fixed safe message that
identifies the input the producer can correct.

Outcome: The demonstrated source contract defects are corrected. A valid
minimal Softball extraction works against the retained source evidence.
This does not prove the exact contents of the failed model requests and
does not repair the production record by itself. Production remained
PRE_MAPPED for Softball and APPROVED for Boomtown, with both legacy holds,
disabled automation, zero active claims, and zero queued jobs.

Verification evidence is recorded in `/tmp/softball-validation-report.json`
and `/tmp/softball-validation-tests.json`. Temporary copied source evidence
and the throwaway probe are removed after this record is saved. The original
production artifacts and completed attempts remain unchanged. This
correction is source-only; a new deployment and an explicitly approved,
bounded Softball recovery are still required before further production work.

## Authorized one-time Softball continuation


The operator explicitly authorized a scoped continuation after the ordinary
three-pass limit. The scope permits implementation and verification of the
audited operation, integration and image publication, replacement of only
the governed Gateway, runner, mapper 1, reviewer 1, model gateway, and auth
broker, and at most one producer claim and one independent reviewer claim.
Preserve all completed attempts. Keep publication and automatic scraping
disabled. Do not change Boomtown's data. Stop the trial workers afterward.

This is a separate authorization, not an ordinary retry. Its producer job
retains pass 3 as the bounded repair-stage value and uses the unique
`legacy-sport-repair-continuation:<rootId>` key. The audit identifies the
exhausted parent, exact retained hashes, current deployment and evidence,
operator, reason, and single producer/reviewer limits. The global pass and
invocation retry limits remain unchanged. A root can receive this one-time
grant only once; a continuation cannot recursively authorize another grant.

Use operator-only `POST /legacy-repair/continuation` with strict PREVIEW and
APPLY modes and one Gateway parent job ID. PREVIEW must not write. APPLY
requires the deterministic reviewed hash and closed admission. Reuse the
existing legacy retry eligibility and immutable audit checks, including the
complete historical pass chain, rather than create a weaker admission path.
Exact replay returns the same child with zero writes after normal progress.

The Gateway derives `executionBudget: SINGLE_CLAIM` in the signed claim from
the trusted continuation job key. A consumed job cannot receive another
claim. The common failure and expiry transition blocks after the first
actual failed invocation, with an honest failure count of one. Do not seed
fake failures. The generated reviewer job has its own single-claim key.
If that reviewer requests producer repair, record the request and hold the
source without creating another producer job.

Verify zero-write preview, stale and tampered report rejection, one child
under concurrent apply, replay after source progress, recursive grant denial,
single-claim failure and expiry for both roles, and no producer follow-up
after the one-time review. Run the complete affected suites and independent
Standards/Spec review before integration. Preview the exact production scope
before its authorized apply. Use a fresh deployment-6 bundle with the
reviewed role/prompt-5 source; preserve every production safety hold.

## Exact continuation source gate (2026-09-10)

The authorized one-time continuation source gate passed without production
writes. The exact scoped admission controller now carries an optional,
normalized job ID through the bounded lease, freezes that scope across
serialization retries, filters claims by the exact job plus role and queue,
excludes continuation markers from unscoped claims, and rejects mismatched
replays and grants. The HTTP admission boundary accepts and returns the
normalized job scope while retaining strict unknown-field and value checks.

Verification completed against the local prepared PostgreSQL database
`bracketiq_e2e_70_recovery_final` on `mvp-site-db` port 5433:

- `npx tsc --noEmit`: passed.
- The pinned 15-suite set: **15 suites / 558 tests passed**.
- Targeted ESLint over every changed TypeScript file: passed.
- `npx --yes bun@1.3.14 run scripts/test-affiliate-omp-agent-sdk-schema.ts`:
  passed with no provider call.
- `/tmp/softball-continuation-preview-build.cjs`: rebuilt successfully.

The focused admission proofs cover exact lower-priority producer and reviewer
selection, unscoped continuation denial, active-lease retarget rejection,
same-request replay without a second claim, scope changes during a
serialization retry, and lease expiry without fallback to unrelated work.

## Completed one-time Softball repair (2026-09-10)


Source `7a7eccc1b4151a2036bd43207ff533bb2fda736c` passed Site CI
`34422065517` and image publication `34422584140`. Deployment 6 uses role
and prompt version 5 and contract hash
`19ec0cd180edb887e246b42f54b16e5f69e81559b9f39726517996a2945b5c0f`.
The worker image is
`ghcr.io/razumly/bracketiq-affiliate-governed@sha256:369bb467e3be8bdf639a5e71043dac55c1044dc5d4ef58a03a9b8a55f546f3b9`.
The Gateway image is
`ghcr.io/razumly/bracketiq-affiliate-gateway@sha256:d4f5b7a669bc76fead45b2106362a713a2a6bd66a1e4288cbac545cc52ab2bf5`.
Both revision labels matched the reviewed source. Published-image bundle,
producer/reviewer containment, and single-claim SDK probes passed.
Fresh preflight passed without blockers or warnings, report hash
`9c356c6c9723074c2ee955fe1721481a6a45baacad94ab14198bb32ef95bf882`.

The deployed continuation PREVIEW was eligible for only parent
`eabe21a7-a756-4957-9b25-f825a53f0e06`, with one producer and one reviewer
claim permitted. Its hash was
`9d508ba5db25a7ff5cda6bb0c7a6657d5ec0939c1f32eac59c53ff6e3388f2c1`.
APPLY created producer job `de8c0c9a-75b0-4bee-bc9a-878a58f21ead`.
Exact replay before claims and after approval returned that same child with
zero writes. Neither the global retry limit nor prior attempts changed.

The producer lease named that exact job ID. Claim
`agw-claim-0d67b8d1-9096-4d9a-95a8-dd433265268f` had SINGLE_CLAIM budget,
listingKind CLUB, role/prompt 5, and deployment 6. It validated and committed
package `7c7afc0f0a256cac1683019901f8cf5ee9d45ee93a2d5e872d6920f52736b6e1`.
Validation receipt `agw-receipt-72d5f79c-f1f2-447e-8ddb-1258f7f8e635`
and commit receipt `agw-receipt-e8b8d450-4060-4649-9e4d-88c0703ea056`
both succeeded. Terminal receipt
`agw-receipt-0e0819f5-9b72-454b-b285-be1d0197c549` records PACKAGE_COMMITTED.
The producer corrected two local schema errors. No Gateway validation error
occurred during the successful continuation.

The generated reviewer job was `0bcbfa5f-002e-43e9-8506-057ed35fdf3f`.
Its lease also named the exact job ID. Claim
`agw-claim-d26a8a83-7b4e-424a-888a-af72cf8c8b06` had SINGLE_CLAIM budget
and a different worker, invocation, and workspace from the producer. It read
all four reviewer artifacts successfully and approved the package. Effect
receipt `agw-receipt-1b4eee42-758c-40be-8c17-14e29403e3d7` and terminal
receipt `agw-receipt-90f0a6b5-460a-401b-bb89-ccfde8f15f03` succeeded.
APPROVE transition `01f6c70c-829c-4410-9723-4ece52cc6a62` records generation 3.

Softball now uses mapping `agw-artifact-a9dece4d-7f8d-40a2-a83b-136347645c4c`,
version 2. The validated output contains Chicago Softball Camp, canonical
Softball, the source-backed North Park University Helwig Rec Center address,
the canonical source URL, and the camp's specific registration URL.
The mapping remains inactive, with its approval validation time recorded.
Its organization remains UNLISTED with public pages and widgets disabled.

Exactly one producer claim and one reviewer claim were issued; both completed
and their tokens are invalidated. Both source roots are APPROVED at generation
3, with LEGACY_SPORT_REPAIR and disabled automation. No activation, public
publication, or automatic scrape was performed.

All 50 prior producer job, claim, and receipt fingerprints are unchanged.
All seven captured Boomtown source, root, mapping, organization, candidate,
and approval fingerprints are unchanged. Admission is closed. Mapper 1,
reviewer 1, and the root runner are stopped. The workspace is empty. The
Gateway and both model services remain healthy with restart policy no.
There are zero active claims, zero queued/retry-wait jobs, and zero unresolved
claim pointers. Dormant workers, coverage, replenishment, site, and mobile
runtimes were not changed.

Private evidence is retained in
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v6-continuation-7a7eccc1b/run`.
It includes deployment/preflight probes, the audited continuation, exact-job
leases, completed producer/reviewer results, final mapping and safety state,
post-approval replay, and preservation checks. Temporary local monitor and
preview programs were removed.

Outcome: both requested mapped repairs and independent approvals are complete.
Issue 70's broader fleet cutover and activation/publication scope remain
separate from this bounded repair.

## Authorized three-source batch (2026-09-10)


The operator authorized Mission Valley CYO League, TPH Academy Austin, and
Ultimate Chicago as a small sequential repair batch. Use mapper 1, reviewer
1, and the root runner with exact-job leases. Keep public surfaces and
automatic scraping disabled. Preserve Softball and Boomtown. Stop at an
unexpected failure.

The operator separately approved refreshing only the internal Gateway to
install fresh preflight. The same reviewed deployment-6 images and contracts
were used. A stopped-Gateway preflight passed with hash
`cd906810eaa799f5db656ceae581cd7cc9978b567647dab6d2ccaf5c5ac0492f`.
No model, site, coverage, or secondary-worker runtime was changed.

Closed-admission apply created the three exact queued producer jobs:
Mission Valley `bb453a27-f14b-4e0e-8737-bc4ad2cb6a2c`, TPH
`0ec7d3d8-eb20-4a51-989c-6bf59ec05974`, and Ultimate
`2be12acf-1995-4ea5-a36c-3011e42aecaf`. Mission's retry replay returned
zero writes. Initial-admission replay for TPH and Ultimate returned
ADMISSION_REPORT_DRIFT. The batch stopped before any worker claim.

Read-only diagnosis proved that the initial-admission writer omitted
listingKind from both new queue subjects, while its replay checker used the
strict current subject schema. Both stored sources and roots were correctly
CLUB and had matching generation 1. The queued-subject decoder accepted
both rows; strict subject parsing rejected only the missing listingKind.
This was a replay contract mismatch, not a duplicate claim or root change.

The operator authorized a reviewed correction and image-parity update of the
six governed services, followed by resumption of these same queued jobs.
Do not create replacement jobs or rewrite their existing audits.

The correction adds the source-validated listingKind to new typed queue
subjects and rejects unsupported source kinds before admission. Replay uses
the existing queued-subject schema for historical omissions and rejects an
explicit kind mismatch or a source/root kind conflict. It does not add
listingKind to stored historical rows.

The new initial-admission replay regressions failed before the correction
and passed afterward. The complete admission suite passed 47 tests; the
complete affected run passed 565 tests across 15 suites, including isolated
PostgreSQL integration tests. TypeScript and targeted ESLint passed.
A temporary process using the corrected source and PostgreSQL
default_transaction_read_only=on replayed the exact production admission
hash `6730164e83b919fbd1b8708dc3215b098b07f95fc6014e43a77e1f58689ba23f`
with replayed true and writeCount zero.

Review found that the added queue and lane checks needed both fields in
the Prisma snapshot query. The query now selects both fields. The test
delegate now applies the selected fields. The complete test run and the
exact production read-only replay passed after this correction.

The existing deployment-6/role-5 contract remains unchanged: this correction
fulfills the current required subject schema and fixes only replay handling.
A fresh reviewed image and preflight are required before resumption.
The three jobs remain queued, claimGeneration zero, with admission closed.
Private batch evidence is in
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v6-small-batch-20260910T032130340Z/run`.

### Corrected-image batch resume

Both review axes passed after the query correction. Source commit
`7acce0ace76ecf8fb40004193c141030cfc839f0` was integrated into main.
Site CI passed in run `34436431139`. The authorized image publish passed
in run `34436996618`.

The six authorized services use these immutable images:

- Worker: `ghcr.io/razumly/bracketiq-affiliate-governed@sha256:28368c56575dc06d04c45a7a6d7ce0cf0594e999790368bdc710d4e729e0cb81`.
- Gateway: `ghcr.io/razumly/bracketiq-affiliate-gateway@sha256:c9ae2f21f11dca3ab0ac611ff699a3b8ce82b7bbf71dc673255fbeacb49789f8`.

Both image revision labels matched the source commit. Bundle parsing,
producer containment, reviewer containment, and the SDK probe passed.
The SDK probe made no provider call. The deployment contract remains
version 6, with role and prompt version 5.

Fresh preflight passed without findings. Its report hash is
`c34203dcd228cc51dbe6f9c2fa60f69f4f9ce1e4c3074fb1825321e0edcd26ca`.
Its evidence is in `preflight-replay-01` under the private batch directory.
The deployed Gateway replayed both the original TPH/Ultimate admission and
the Mission retry with replayed true and writeCount zero. All 99 protected
history and data fingerprints were unchanged before claims.

The producer readiness rule requires a healthy reviewer. Both selected
workers were started. Admission still permits only one exact job and one
claim at a time. Mission producer claim
`agw-claim-8e772917-cfb4-4dff-b4d4-b5ed0d22f1fd` started against the same
queued job. Its signed subject is CLUB, pass 2, with deployment 6 and role
and prompt 5. Admission was closed after that claim.

### Batch stopped after Mission Valley

Mission Valley's one producer claim failed at `2026-09-10T04:49:02.915Z`
with `SCHEMA_CORRECTIONS_EXHAUSTED`. Its job is RETRY_WAIT with claim
generation 1. The failed claim and all prior attempts remain in the audit.
No second claim was admitted.

The worker read the listed HTML and Markdown artifacts. It then made three
CONTRACT_GAP result submissions. The first two responses requested corrections
to `payload.sportEvidence` and `evidenceRefs`. The third response exhausted
the correction limit and failed the claim. The terminal receipt is
`agw-receipt-71166605-c098-4eef-8ed4-9b8d7eca913f`.

No mapping command ran. No mapping was validated or committed. No reviewer
job was created. TPH and Ultimate remain in their same QUEUED jobs with
claim generation 0. The stop-on-failure rule stopped the complete batch.

The current `terminalResultCorrectionIssuesFor` helper returns the same two
sport-evidence issues for any invalid legacy CONTRACT_GAP. Both envelope
schema failures and sport-evidence verification failures use that helper.
The retained receipts do not distinguish those failure branches. They do
not retain the rejected field values. The workspace is empty. Thus the
exact invalid value is not established by this run. Do not increase the
correction limit or claim that a specific sport citation was missing.

Final read-only safety checks passed:

- Admission is closed. Active claims and unresolved claim pointers are zero.
- Mapper 1, reviewer 1, and the root runner are stopped.
- The Gateway, model gateway, and auth broker are healthy with restart `no`.
- All five dormant service identities and states are unchanged.
- All 99 prior history and protected data fingerprints are unchanged.
- The three roots remain PRE_MAPPED at generation 1 with LEGACY_SPORT_REPAIR.
- Root automation and source automatic scraping remain disabled.
- The three organizations remain UNLISTED with public pages and widgets disabled.
- Existing version-1 mapping active flags are unchanged. This batch did not
  activate a mapping or publish data.

The exact final proof is `run/small-batch-final-safety.json` under the private
batch directory. Another claim needs a new bounded recovery decision.

### Authorized terminal feedback correction

The operator selected "Fix feedback and retry." This authorizes precise,
safe terminal-validation feedback, review, the six-service image update,
and one more Mission producer claim. Continue the batch only after the
schema-correction failure is resolved. Keep all claim limits, evidence
checks, holds, and publication controls unchanged.

A new Gateway regression reproduced the feedback defect. A result with an
invalid `reasonCodes[0]` received only the generic sport-evidence issues.
The actual terminal union error already identifies `reasonCodes[0]` in
the registered MAPPING_PRODUCER/CONTRACT_GAP branch. The Gateway discards
that detail. The sport verifier also replaces distinct evidence failures
with a generic error.

Use the existing terminal schemas to select and report safe field paths.
Use schema-owned expected values and fixed messages. Do not report submitted
values, unknown object keys, source URLs, excerpts, or credentials. Preserve
typed field paths for sport verification failures. Test correction, error
redaction, receipt replay, and the unchanged exhaustion limit through the
Gateway interface before publication.

The implementation selects the registered terminal schema branch and retains
safe parser field issues. Sport verification errors carry typed field paths.
The existing failed-claim summary retains the final safe issue text within
its unchanged 2,000-character limit. Unknown keys, submitted values, source
URLs, excerpts, and arbitrary error messages are not copied into feedback.

The complete affected gate passed 632 tests in 22 suites. TypeScript and
targeted ESLint passed. The original field-error regression is green.
Tests cover citation URL/hash/excerpt errors, unsupported-sport reason
codes, unknown-key redaction, exact receipt replay, diagnostic bounds, and
failure on the third invalid submission.

Both review axes found one shared issue: the new adapter helper default
hid specific public messages from existing one-argument reviewer calls.
The helper's original signature and behavior are restored. New field
errors use the typed constructor directly. The public ACTIVATED adapter
smoke returned the original legacy activation prohibition with zero
database or provider access. All 632 tests passed again after the fix.
Both focused re-reviews passed. The shared finding is fixed, re-reviewed,
and verified. Standards and Spec have no remaining blockers.

### Terminal feedback deployment and Mission retry

Source commit `919ff733af99929ddb179dc6744e48d3fbaee8b4` was integrated
into main. Site CI run `34445035567` and the authorized image publish
run `34445663657` passed.

The six authorized services use:

- Worker: `ghcr.io/razumly/bracketiq-affiliate-governed@sha256:01ddc0a9af7150a8d9bd3a51635764ba2060e8540224a8ba7d265ca33665a4fb`.
- Gateway: `ghcr.io/razumly/bracketiq-affiliate-gateway@sha256:6aa94a56c13835e00222c6cf74c83f12b05782e11bfa546136989c74b5527d05`.

Published-image bundle, producer/reviewer containment, SDK no-provider,
and reviewer public-message probes passed. Fresh preflight passed without
findings, with report hash
`88a840ad03f186e68044267579f445aa9b2ffd9065245c58f717db754a06de58`.
Evidence is in `preflight-terminal-01` under the same private batch directory.
The initial TPH/Ultimate admission still replayed with zero writes.
All five dormant services remained unchanged.

The one authorized additional Mission claim started at
`2026-09-10T06:46:04.181Z`. Claim
`agw-claim-66c8facf-d718-4336-a826-18ef93c45702` is generation 2 of
the existing job `bb453a27-f14b-4e0e-8737-bc4ad2cb6a2c`.
Its signed subject remains CLUB, pass 2, with deployment 6 and role/prompt 5.
Admission was closed after the claim. All 16 audit and artifact records
from its first failed claim remained unchanged.

### Mission retry result and final stop

The authorized retry failed at `2026-09-10T06:47:54.550Z` with
SCHEMA_CORRECTIONS_EXHAUSTED. The new feedback worked on the real claim:

1. Submission 1 identified `reasonCodes[1]`: the set-like array was not sorted
   and unique.
2. Submission 2 passed envelope parsing. It identified
   `payload.sportEvidence.sportDeterminations[0].evidence[0].excerpt`:
   the excerpt was not present in the stored artifact.
3. Submission 3 failed the same excerpt check. The failed claim retained
   that exact safe field path and reason in its summary.

The terminal receipt is `agw-receipt-f9d03c9e-5eee-4838-95c7-0b33eb64f469`.
The job remains RETRY_WAIT at claim generation 2 and invocation failure
count 2. No further Mission claim was authorized or admitted.

No mapping command ran during the retry. No package was validated or
committed. No reviewer job was created. TPH and Ultimate remain QUEUED
with claim generation 0. The complete batch stopped because the approved
condition for continuation was not met.

Final read-only checks proved closed admission, zero active claims, zero
unresolved claim pointers, stopped mapper 1/reviewer 1/root runner, and an
empty workspace. The Gateway and both model services are healthy.
All five dormant services are unchanged. All 99 original protected data
and history fingerprints are unchanged. All 16 records from Mission's
first failed claim are also unchanged.

The three roots, source settings, mappings, and organization safety fields
are unchanged from before this run. Root automation and automatic scraping
remain disabled. Public pages and widgets remain disabled. Existing
version-1 mapping active flags were preserved; this run activated nothing.

Private final evidence is `run/terminal-feedback-final-safety.json`.
The result sequence is in `run/mission-feedback-retry-result.json`.
The feedback correction is deployed and verified. Mission's excerpt
mismatch remains unresolved. The rejected excerpt value was not retained,
so this run does not establish whether the remaining cause is the worker's
quote or the stored-text interpretation. Another claim needs a new bounded
decision.

## Claim-scoped agent self-repair

The operator asked for agents to identify and repair these errors themselves.
Do not grant database credentials, storage credentials, arbitrary file access,
unrestricted browsing, approval authority, or permission to change the catalog.
This source work does not authorize another production claim or runtime change.
Keep the stopped batch held until a new bounded production trial is approved.

Read-only inspection recovered the exact Mission HTML and Markdown. Both
matched their claim manifest hashes. A local call to the real sport verifier
reproduced a defect: `Track Records` passed against Markdown but failed against
HTML containing `Track&nbsp;Records`. An exact event-line quote passed against
the same HTML. This proves a text interpretation defect, not an access denial.
The failed claim's rejected value is still unknown.

Use the existing inert HTML parser to decode entities and extract citation
text. Share that text interpretation between the verifier and the worker's
claim-scoped artifact view. Preserve raw evidence and its hashes.

Add a read-only `check_result` tool in the trusted worker bridge. It must use
the same terminal schema diagnostics and sport verification rules. It may
read only evidence already permitted by the claim. It must not submit a
terminal result, consume a terminal correction, execute a command, write a
package, publish data, or change authority. Mark its result as a local check
against the claim snapshot; the Gateway still checks live authority,
freshness, ownership, receipts, and lifecycle state at submission.

Add a citation-text view to `read_artifact` with the existing paging and byte
limits. Keep raw reads available. Update the role/prompt contracts so the
agent checks its draft, repairs reported fields from stored evidence, and
submits only after local checks pass. Unsupported or ambiguous source facts
still require an evidence-backed human-review result, not a guessed mapping.

The citation interpreter now uses the existing inert DOM parser after a
linear complexity gate. The exact stored Mission HTML accepts `Track Records`,
as its Markdown already did. Attribute text, comments, scripts, and styles
do not become citation text. The shared formatter preserves safe field
diagnostics for both local checks and authoritative Gateway corrections.

The bridge exposes `check_result` and the `CITATION_TEXT` view.
`submit_result` also checks a draft before any terminal Gateway operation.
Invalid local drafts remain repairable in the same invocation. The existing
terminal body limit, claim deadline, sandbox limits, and three authoritative
correction attempts are unchanged.

A local replay used Mission's exact stored evidence to repair a reason-code
ordering error and a deliberately invalid quote. It copied `Track Records`
from the citation view and reached DRAFT_VALID with one permitted artifact
read, zero Gateway effects, and zero terminal frames. This replay made no
production calls and did not create a new claim.

The final affected gate passed 650 tests in 22 suites, including isolated
PostgreSQL tests. TypeScript, targeted ESLint, and all three real OMP SDK
no-provider scenarios passed.
Role and prompt contracts are version 6. This source requires a new reviewed
deployment bundle and fresh preflight before production use. The current
production deployment and all stopped workers remain unchanged.

Review found four corrections before release: the reviewer prompt still
listed the old tools; top-level draft errors bypassed safe formatting;
citation viewing used SOURCE's strict decoder first; and full DOM parsing
could exceed the worker memory limit.

The reviewer list now includes check_result. Both terminal tools use the
shared safe formatter for input-schema failures. Citation viewing goes
directly through the verifier's decoder and does not use SOURCE MIME gates.

Streaming parser prototypes exposed differences in noscript and foreign
element handling. They were removed. The existing JSDOM parser now uses
an inert, detached HTML document after a linear preflight scan. The scan
retains the 8 MiB artifact ceiling and bounds markup and possible attribute
work before DOM allocation. Text output and the four-entry cache are bounded.
The empty parser window can close without recursively detaching a deep
source document. Over-budget parsing returns a fixed, repairable limit.
Experimental dependencies and Jest transforms were removed.

The earlier streaming stress result is superseded. The final parser rejects
the 8 MiB, 2,097,152-tag case before DOM creation. A 256 MiB heap smoke also
parsed the allowed 8,192-markup boundary, including a deep document, without
recursive cleanup failure. Peak RSS was 223,728 KiB. These are local resource
observations, not production timing guarantees.

Real SDK testing showed that it may repair syntax, including removal of an
undeclared key, before the bridge runs. The driver now delegates unrepaired
arguments for execute_command, check_result, and submit_result to the strict
bridge validators. All three SDK scenarios passed with no Gateway or provider
call. Terminal scenarios used an unrepairable disposition and proved bounded,
redacted DRAFT_INVALID feedback. Final Gateway authority remains unchanged.

Final Standards and Spec/access re-reviews passed. All reported parser,
MIME, decoding, prompt, redaction, and SDK-dispatch findings are fixed,
re-reviewed, and verified. The recorded Mission source also completes the
local repair loop without a Gateway effect or terminal submission.

This source change is not a production deployment. The existing production
Gateway remains on source 919ff733a with role/prompt 5. Mission remains
RETRY_WAIT at claim generation 2. TPH and Ultimate remain unclaimed.
Admission is closed, all trial workers are stopped, and the 99 original
protected records remain unchanged.

## Authorized role-6 Mission repair trial

The operator approved the next repair-only steps: deploy the reviewed
self-repair tooling, run one controlled Mission repair attempt, and
independently review a resulting package. This authorizes the six named
governed services only. It does not authorize publication, automatic
scraping, a wider fleet start, or claims for TPH or Ultimate.

Use source `229576c2a0e8c5a6c24fb9eeec7f3630d03e5a92`. Its Site CI
run `34526237893` passed. Prepare deployment contract 7 from the existing
deployment-6 bundle and the source-exported role/prompt-6 contracts.
Install fresh preflight before admission.

Use the existing Mission job `bb453a27-f14b-4e0e-8737-bc4ad2cb6a2c`.
The one producer claim must be generation 3. Preserve both failed claims
and their receipts, artifacts, and events. Use an exact-job, one-claim lease.
Close admission after the claim. Admit one independent reviewer only if
the producer commits a reviewable package. Stop on an unexpected failure.
Keep TPH and Ultimate held throughout this trial.

### Deployment and claim evidence

Authorized image publish run `34528732002` passed. The immutable images are:

- Worker: `ghcr.io/razumly/bracketiq-affiliate-governed@sha256:be46ae7cd9ae71edec769fb2a8f91f68b9eb77aeaec54bca454e4a276803216f`.
- Gateway: `ghcr.io/razumly/bracketiq-affiliate-gateway@sha256:6ec299e234f3ad4fe660fdcb48dd9094de86c86cc4b2e3596fdbc42820c0970f`.

Both revision labels match the reviewed source. Bundle parsing,
producer/reviewer containment, all three SDK scenarios, the reviewer
public-message check, and the recorded Mission repair loop passed.
The recorded loop passed in both shipped Node and Bun runtimes with no
Gateway effect or provider call.

Deployment contract 7 has hash
`103ccf422ed092b1bd6fb1419358cd492d189d9e37cf0e1082af84463538cf4b`.
Fresh preflight passed without findings, with hash
`adbe3503c7af55831c3957e841da1b71d66b7875425540d0ff36dd06f74b48ee`.
Private evidence is under
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v7-mission-repair-229576c2a`.
The five dormant services and all 99 original protected records were
unchanged after the six-service refresh.

Mission claim `agw-claim-ec059250-8b60-438a-8d38-2e8d1e59cc9d`
started at `2026-09-10T21:08:57.330Z`. It is claim generation 3 of the
same job. Its subject remains CLUB, pass 2, with deployment 7 and
role/prompt 6. Admission was closed after the claim. All 32 records from
the two prior failed attempts remained unchanged.

### Successful bounded outcome

The Mission claim completed at `2026-09-10T21:10:46.294Z`.
The Gateway accepted CONTRACT_GAP with reason SPORT_NOT_IN_CATALOG.
There were zero authoritative schema corrections and no invocation failure.
The terminal receipt is `agw-receipt-67e0d71d-633e-479e-b188-3f2216e2a7c9`.
The result hash is
`a627b7f6a4f41c1d48c12295cd0ba89c5aebdc2fb36214cb70e31b86c4d0c8d6`.

The accepted result cites the stored HTML and Markdown order of running
events and the statement about field events. It identifies Track and Field
as unsupported because no exact catalog name exists. It leaves canonical
sport names empty and requests an authenticated catalog decision.
The source is not mapped or approved by this result.

One terminal submission and its governed domain effect completed.
No package validation or commit command ran. No reviewer job was created;
the terminal effect records reviewerJobId null. The conditional independent
review step was therefore not applicable. The legacy mapping job records
REVIEW_REQUIRED with the accepted Gateway terminal result.

Final read-only checks passed. Admission is closed. Active claims and
unresolved claim pointers are zero. Mapper 1, reviewer 1, and the root runner
are stopped. The workspace is empty. The Gateway and both model services
are healthy with restart policy no.

All 99 original protected records and all 32 records from the two previous
failed attempts are unchanged. All five dormant services are unchanged.
The three roots, source settings, mappings, and organization safety fields
are unchanged. Automation, automatic scraping, public pages, and public
widgets remain disabled. Existing legacy mapping active flags were preserved.
TPH and Ultimate remain QUEUED with claim generation zero.

Private final proof is `run/final-safety.json` under the version-7 trial
directory. The accepted result is `run/mission-producer-result.json`.
The tooling and bounded repair trial are complete. Mission now needs a
human catalog decision, not another blind retry. No additional claim or
publication was authorized.

## Affiliate blacklist and source descriptions

The operator directed that Track and Field remain blacklisted and be removed.
The operator also required event and organization descriptions to use the
first-party site's wording, not an explanation of what an agent found.
This direction supersedes the catalog-addition recommendation in the role-6
Mission result. The historical result and its evidence remain unchanged.

Source role/prompt version 7 now states the blacklist and description rules.
Current completion rejects blacklisted labels classified as UNSUPPORTED or
resolved to another sport. Blacklisted activities require BLACKLISTED and
SPORT_BLACKLISTED. Separate supported determinations may remain executable.
Legacy repair and organization sport merging cannot reintroduce a blacklist
member, even when an injected catalog contains that name.

Governed EVENT and CLUB packages now support a required description selector.
The Gateway checks every extracted description before saving validation
evidence. Missing prose and discovery narration fail validation. Authored
description constants and URL conversion are not permitted. Source wording
takes precedence over title-restatement style advice. The independent reviewer
must compare the selected prose with first-party evidence.

Unclaimed affiliate organization descriptions now prefer new mapped source
prose over stale generated copy. Owner-managed copy remains protected.
Schedule and status notes are no longer organization description fallbacks.
The description and publicIntroText use the same selected text.

### Local proof and production hold

The recorded Mission smoke check passed against the new source. It read and
hashed the original role-6 result without changing it. Current completion
rejected UNSUPPORTED. A local BLACKLISTED draft passed both original HTML and
Markdown citations and produced no executable sports. A source-prose fixture
preserved first-person wording and decoded HTML entities. No production write
ran during this check.

Read-only production inventory found no Track and Field catalog row,
organization sport value, event sport value, or Supply Target. One candidate
remains: `90296c9e-c325-4fd7-b361-560bd87a65a0`, in NEEDS_REVIEW for Mission.
Its organization remains UNLISTED with public pages and widgets disabled.
Its source remains REVIEW_REQUIRED with automatic scraping disabled.

The held candidate is not removed. A governed source exclusion requires
independent reviewer evidence and a recorded human lifecycle decision.
Mission has no eligible exclusion claim. The legacy admin deletion route
would bypass that process and does not record source exclusion. Do not use it
as a substitute. Deployment of role/prompt 7 and any new worker start require
separate current authorization.

### Review record

The review fixed point is `7db3cb7ebe9d782c36e97125b1224cc0e94547de`.
The initial Standards and Spec reviews found the following defects.
Three focused regressions reproduced R1 and R2 before their source fixes.
The production exclusion remains blocked independently of the source review.

| Finding | Axis | Correction | State |
| --- | --- | --- | --- |
| R1 | Sport Standards and Spec | Restore the RESOLVED catalog and canonical blacklist check. | Fixed, re-reviewed, verified |
| R2 | Sport Spec | Reject extracted blacklist members for normal Gateway packages too. | Fixed, re-reviewed, verified |
| R3 | Description Spec | Check description quality on every supply-backed scrape before persistence. | Fixed, re-reviewed, verified |
| R4 | Description Standards and Spec | Distinguish subject discovery from participation prose. | Fixed, re-reviewed, verified |
| R5 | Description Standards and Spec | Reject URL attributes and URL-only description values. | Fixed, re-reviewed, verified |
| R6 | Description Standards and Spec | Align the mandatory approval reference with source wording. | Fixed, re-reviewed, verified |
| R7 | Description Standards and Spec | Remove the obsolete title-restatement report claim. | Fixed, re-reviewed, verified |
| R8 | Sport consumer follow-up | Block blacklist replacement/refresh loops; preserve valid exclusion confirmations. | Fixed, re-reviewed, verified |
| R9 | Description Standards and Spec | Stop inferring producer defects from obsolete title/name repetition evidence. | Fixed, re-reviewed, verified |

Standards and Spec re-reviews passed for both sections. All nine findings are
closed. The text checks cover recognized narration forms. The independent
reviewer remains responsible for source fidelity and subject relevance.

### Verification evidence

The pre-review local gate passed 774 tests in 27 suites. This includes the Gateway
and lifecycle PostgreSQL integration suites. The fresh isolated database
`bracketiq_e2e_70_policy` received all 219 migrations before the tests.
Prisma reported that its schema was up to date.

The full TypeScript check and targeted ESLint check passed. The real OMP SDK
probe passed execute_command, check_result, and submit_result under the pinned
Bun 1.3.14 runtime. It made no provider call. The recorded Mission smoke passed
under Node. All 99 protected production records still matched their baseline.

The post-fix gate passed 790 tests in the same 27 suites. It includes the
retained missing, narrative, and URL-only refresh regressions. The first
post-fix run exposed clause-leading `Listed by` narration. The source check
was corrected without changing that fixture. TypeScript, ESLint, the recorded
Mission smoke, and all three SDK scenarios also passed after integration of
the review fixes.

The expanded final gate passed 815 tests in 28 suites. TypeScript, targeted
ESLint, the recorded Mission smoke, and all three SDK scenarios passed.
The last terminal-agent narration correction passed another 128 tests in the
three affected suites and targeted ESLint. No production image was published.
No production runtime or record changed for this policy update.

### Integration and cleanup

Source commit `78854c462` was fast-forwarded into canonical main.
The integrated gate passed 853 tests in 32 suites, including four additional
sport-diagnostic consumers. It used a fresh
`bracketiq_e2e_70_policy_integrated` database with all 219 migrations.

The canonical checkout lacked installed SDK and PDF dependencies.
`npm ci --ignore-scripts` restored the locked dependency set. The integrated
TypeScript check then passed. No dependency declaration changed.

Both policy test databases and the temporary Mission smoke files were removed.
The local Postgres server was not stopped. All 99 protected production records
still matched the baseline after cleanup. Production removal of the held
Mission candidate remains incomplete and requires the governed exclusion path.

## Package-free source exclusion handoff

This continuation completes the missing governed handoff for a held source
whose producer could not create a package because its activities are
blacklisted. The operator can preview and admit one independent source
reviewer. A verified exclusion result executes the existing EXCLUDE_SOURCE
lifecycle command. It does not require a fabricated mapping package, target,
producer identity, or approval record.

The work starts from `47f6975b23ecf9974e3f4400fa392151f50e1bdf` on
`workstream/affiliate-exclusion-handoff`. Maintain this section under PLANS.md.
Mission's root is `a8764a56-2da2-4382-82d1-eee317b05143`. Its completed producer
job is `bb453a27-f14b-4e0e-8737-bc4ad2cb6a2c`. Its original result calls Track
and Field UNSUPPORTED. That historical result remains unchanged. The new
reviewer must make and cite its own current-policy determination.

### Progress

- [x] Read the existing reviewer, operator, and lifecycle interfaces.
- [x] Confirm that EXCLUDE_SOURCE already permits SUPPLY_REVIEWER authority.
- [x] Implement package-free reviewer claims and bounded operator admission.
- [x] Verify preview, admission, exclusion, replay, and denied side effects.
- [x] Complete independent Standards and Spec review.
- [x] Obtain separate authorization for the exact production deployment and workers.
- [x] Execute one governed Mission exclusion.
- [x] Run the bounded TPH and Ultimate trial; TPH held, Ultimate independently approved.

### Discoveries and decisions

The existing SUPPLY_REVIEWER subject requires a committed package hash and
target identity. It cannot represent Mission's real hold without false fields.
Add a distinct SOURCE_EXCLUSION_REVIEW subject under the same reviewer role.
Keep the real producer claim, worker, invocation, workspace, result hash, and
intake/run lineage. Capture a fresh catalog for the new reviewer request.
Do not change historical package reviewer records or parent catalog data.

EXCLUDE_SOURCE already permits SUPPLY_REVIEWER and HUMAN_DIRECTED_EXECUTOR.
The latter is mandatory only for EXECUTE_RECORDED_LIFECYCLE_COMMAND. Use the
existing reviewer terminal-effect interface instead. The reviewer retains
read-only tools. The trusted Gateway executes the lifecycle command after
verification. No new agent command or production credential is added.

The old SOURCE_EXCLUSION_ASSESSED effect uses RECONCILE. That path can derive
an excluded root but does not set excludedAt or disable automatic scraping.
The new source-only EXCLUDE path must execute EXCLUDE_SOURCE, which records
the explicit transition and updates those fields. Non-exclusion decisions
must leave the source held and must not activate, publish, or resume work.

### Implementation and interface

In apps/site/src/server/affiliateImports/agentGatewayContracts.ts, add the
source-only subject, source-only terminal scope, and a dedicated SINGLE_CLAIM
dedupe prefix. Advance role and prompt contracts to version 8. The source-only
subject has no package hash or target fields. The reviewer result carries its
own sportEvidence. An EXCLUDE recommendation requires nonempty all-BLACKLISTED
determinations, no canonical sport names, SPORT_BLACKLISTED, and exact
claim-owned source citations. The current catalog and blacklist remain
authoritative. Historical UNSUPPORTED findings are evidence context only.

Add apps/site/src/server/affiliateImports/affiliateSourceExclusionAdmission.ts
with preview and apply functions. Expose them through an operator-only
POST /v1/affiliate-agent/source-exclusion/admission interface. Its strict body
contains mode PREVIEW or APPLY, one gatewayJobId, a bounded reason, and an
expectedReportHash for APPLY. Bind the operator identity inside the Gateway;
never accept it from the body.

PREVIEW must make no writes. Its deterministic hash binds the exact completed
producer hold, source and intake identity, root generation, original claim
and result hashes, pinned page artifacts, current catalog, active contracts,
and requested reason. The parent may contain a historical UNSUPPORTED label
that is blacklisted under current policy. It must have no resolved sports.
The independent review, not that old classification, authorizes exclusion.

APPLY requires closed admission, fresh preflight, no active claims or retained
claim pointers, and the exact reviewed hash. Re-read the snapshot in a
Serializable transaction. Create only one parent-linked reviewer job and its
operator audit event. Preserve every original producer record, source,
mapping, organization, candidate, and target. Exact replay returns the same
job with zero writes, including after normal reviewer progress. A changed
request or altered immutable child identity must fail. Ordinary queue polling
must not claim the new single-claim prefix; admission needs the exact job ID.

In prismaAgentGateway.ts, admit the new subject only with matching completed
producer history and original page evidence. Preserve worker, invocation,
workspace, source, generation, and contract checks. Restrict the source-only
claim to source assessment or human review. It cannot approve a package,
activate a source, reject a target, or enqueue producer repair.

In affiliateAgentTerminalValidation.ts and agentGatewayAdapters.ts, verify the
reviewer's current assessment and citations before an exclusion effect.
Repeat authoritative checks at the effect transaction. Reuse the existing
EXCLUDE_SOURCE transaction, idempotency key, receipt, and transition storage.
No source or target write occurs when verification fails.

### Validation and operational limits

Use a fresh bracketiq_e2e_ database on the existing local Postgres server.
Apply migrations and confirm migration status before database tests. Exercise
the actual preview-to-claim-to-terminal workflow against that database.
Prove one EXCLUDE_SOURCE transition, isExcluded true, excludedAt populated,
source status EXCLUDED, and automatic scraping false. Prove no package,
publication, target, or original-history mutation. Test exact replay,
stale hashes and generations, foreign evidence, mixed sports, forged parent
identity, and forbidden source-only dispositions.

Run the affected complete Jest suites, TypeScript, targeted ESLint, and the
pinned Bun SDK smoke after implementation. Run a read-only preview against
Mission's retained production state. Record review findings and their
corrections before deployment.

This continuation starts with implementation and verification. It does not
silently authorize an image publication, production deployment, or worker
start. Obtain current authorization for the exact runtime scope after the
source handoff is reviewed. Keep publication, automatic scraping, and the
wider fleet held. After the authorized Mission exclusion, process TPH and
Ultimate one at a time with independent review.

### Outcome

The source-only database workflow passed. It produced one EXCLUDE_SOURCE
transition, populated excludedAt, disabled automatic scraping, preserved the
mapping, targets, and producer history, and replayed without another write.
Seven affected suites passed 343 tests. TypeScript and the pinned SDK probe
also passed. Independent review is in progress.

The real Mission preview ran twice with PostgreSQL
default_transaction_read_only=on. Both results were eligible with no blockers,
zero writes, and stable prospective report hash
`58ca94593c35ba960150307113bf64acef04a03512b1220c2598f8582b8ad849`.
This is read-only preview evidence, not an APPLY authorization. It uses a
prospective deployment-8 bundle; obtain a fresh report for the final deployed
bundle before any mutation.

The first preview correctly exposed three implementation assumptions that did
not fit the retained records. Retry parents are real history, not malformed
parents. The claim's pinned capture is not required to be the intake's latest
supplemental run. A link to an unlisted canonical CLUB organization is not
public supply. The source checks now validate those facts without rewriting
the original rows.

No production state changed in this continuation. Deployment and worker
operations remain dependent on a reviewed release and separate authorization.

### Review record

The fixed review base is `47f6975b23ecf9974e3f4400fa392151f50e1bdf`.
The first Admission and Execution reviews found these defects. All are accepted.
The happy-path proof remains valid, but it is not sufficient for release.

| Finding | Correction | State |
| --- | --- | --- |
| E1 | Recheck mutable held/publication state before a new claim or first effect. | Fixed, re-reviewed, verified |
| E2 | Bind source canonical identity and all source/root back-links. | Fixed, re-reviewed, verified |
| E3 | Require complete hashed producer terminal receipts. | Fixed, re-reviewed, verified |
| E4 | Bind all producer and ancestor routing, generation, and subject fields. | Fixed, re-reviewed, verified |
| E5 | Require pinned artifact kind, URL, File, and citation provenance. | Fixed, re-reviewed, verified |
| E6 | Validate immutable zero-write replay before mutable admission gates. | Fixed, re-reviewed, verified |
| E7 | Return invalid exclusion evidence as a correction before effect reservation. | Fixed, re-reviewed, verified |
| E8 | Restore exact-target validation for existing package reviewers. | Fixed, re-reviewed, verified |
| E9 | Add guarded recovery for ambiguous source-only terminal effects. | Fixed, re-reviewed, verified |
| E10 | Include sport reason codes in the rendered reviewer completion contract. | Fixed, re-reviewed, verified |
| E11 | Require evidence for every authoritative source-only outcome. | Fixed, re-reviewed, verified |
| E12 | Reject a nonnull active mapping when the parent mapping is null. | Fixed, re-reviewed, verified |

The admission fixes also validate malformed row identities and exact audit
shape. The execution fixes add direct Gateway denial and non-exclusion tests.
Keep an already committed transition's replay separate from fresh safety and
catalog validation.

The hardened gate passed 871 tests in 33 suites, including both PostgreSQL
suites. TypeScript and targeted ESLint passed. The source workflow now
exercises a rejected quote with no effect receipt, a corrected submission,
exact APPLY replay while the reviewer is active, private organization and
candidate preservation, evidence-free and forbidden-disposition denial,
KEEP/HUMAN held-state outcomes, and guarded UNKNOWN recovery after a committed
exclusion response is lost. Recovery creates no second lifecycle transition.

The hardened real Mission PREVIEW remained eligible in two enforced
read-only runs. The new prospective report hash is
`2b3893b8a92a8724de76990f48555827f84908384de2a8d862c801ad54e4ad3a`.
Both runs reported zero writes and no blockers. All Admission and Execution
Standards and Spec re-reviews passed.

The E12 PostgreSQL regression failed before the fix: a validated active mapping
with null parent/candidate mapping links returned eligible true. The shared
safety predicate now requires exact source active-mapping equality, including
null. The final gate passed 872 tests in 33 suites. TypeScript, targeted
ESLint, and all three real pinned-Bun SDK probes passed. The final real Mission
PREVIEW kept the same eligible, zero-write hash shown above. All 99 protected
production records still matched their baseline.

### Source delivery

Code commit `575f20151` was fast-forwarded into canonical main.
The integrated gate passed 872 tests in 33 suites against a fresh isolated
database with all 219 migrations. The integrated TypeScript check and the
three pinned-Bun SDK scenarios also passed.

The temporary read-only preview bundle and both exclusion test databases
were removed. The local Postgres server remains running. No production image
was published. No production service, claim, source, candidate, or target was
changed. Mission's actual exclusion and the two supported-source trials still
require the separately authorized production rollout.

## Authorized Mission exclusion rollout

The operator authorized the next bounded rollout. Use reviewed source
`c0364064825c5a5f57e681b86077dfda08ec5902`. Its Site CI run
`34555355451` passed. Publish the matching immutable worker and Gateway images.
Refresh only affiliate-gateway, affiliate-agent-runner, mapping-producer-1,
supply-reviewer-1, affiliate-model-auth-broker, and affiliate-model-gateway.
Keep the broker volume, both logins, bearer files, security profiles, networks,
and restart policy unchanged.

Prepare deployment contract 8 with the source-exported role/prompt 8
contracts. Keep admission closed during deployment. Run fresh preflight.
After the exact Mission PREVIEW/APPLY, start only the root runner and
reviewer 1 for one SOURCE_EXCLUSION_REVIEW claim. Close admission after the
claim. Stop the runner and reviewer after its result. The producer stays
stopped. TPH, Ultimate, publication, automatic scraping, coverage,
replenishment, the five dormant services, site, and mobile remain out of scope.

The initial read-only checks found closed admission, zero active claims and
zero retained claim pointers. Mission remains PRE_MAPPED at generation 1.
Its source is REVIEW_REQUIRED and its organization is UNLISTED with public
pages and widgets disabled. TPH and Ultimate remain QUEUED at claim generation
zero. Both distinct model accounts passed the health check with broker-managed
refresh. All 99 original protected fingerprints matched.

This rollout also captures 272 preexisting Gateway/history and selected
domain/evidence fingerprints. Keep those records unchanged. The only permitted
domain change is Mission's reviewed source exclusion and its new governed
claim, receipts, audit events, and EXCLUDE_SOURCE transition.

Private rollout files will be stored under
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v8-mission-exclusion-c03640648`.
The reviewed source export is under
`/home/bracketiq/.cache/affiliate-governed-builds/c0364064825c5a5f57e681b86077dfda08ec5902/apps/site`.
The image publication run is `34559475479`.

### Deployment and bounded claim evidence

The authorized image publication completed successfully. GitHub's production
environment gate required operator approval before the build could start.
The approval applied only to this exact reviewed release.

The immutable worker image is
`ghcr.io/razumly/bracketiq-affiliate-governed@sha256:afaedf0accbebc81a1a40e9996f8cb6ae4433a2c8ee75bc4dc62b6314bc40946`.
The immutable Gateway image is
`ghcr.io/razumly/bracketiq-affiliate-gateway@sha256:db5c63dd6d1dba4340991850a05d241d7c6df60d8e9522e2f3822a3e08fff14f`.
Both revision labels and shipped contract exports match the reviewed source.
Producer/reviewer containment and the three real SDK scenarios passed in the
published worker image.

Deployment contract 8 has hash
`079f8d488c89cf600809fd9d0a73a3a70b0bcadfccc7d7a50e26086cc00c0f5a`.
Fresh preflight passed without blockers or warnings at
`2026-09-11T04:08:40.903Z`, with report hash
`47d68746d876b91dada0b07aff504329c8f385159e6bd87e5767825a8e97f420`.
The five dormant services and all 272 preexisting protected rows were
unchanged after the refresh. Both model accounts retained their identities
and passed their health checks.

The deployed Gateway returned the same eligible Mission PREVIEW twice with
report hash
`2b3893b8a92a8724de76990f48555827f84908384de2a8d862c801ad54e4ad3a`.
APPLY created reviewer job `7da3401d-ace6-49ce-9f8d-857b7fafcb18`.
Exact APPLY replay returned the same job with zero writes.

One 300-second exact-job reviewer lease was opened. Claim
`agw-claim-fcc228f5-4b03-4e07-bebe-94fb65f3df55` is generation 1, has
SOURCE_EXCLUSION_REVIEW, and uses SINGLE_CLAIM. The safety monitor closed
admission after the claim. Only the runner and reviewer 1 were started.
The producer remains stopped. No TPH or Ultimate claim was admitted.

### Completed exclusion and final safety

The independent reviewer ran from `2026-09-11T04:12:52.850Z` to
`2026-09-11T04:14:28.858Z`. It returned SOURCE_EXCLUSION_ASSESSED with
recommendation EXCLUDE. Its own current-policy assessment identifies Track and
Field as BLACKLISTED, cites the stored HTML running and field-event schedule,
and leaves canonical sport names empty. The original UNSUPPORTED producer
result remains unchanged.

The Gateway accepted the result with zero authoritative schema corrections
and no invocation failure. The result hash is
`dd3b5c0163b6596db385b990c5778c288eadbe2a664a92647014d11c78bcf077`.
The succeeded terminal-effect receipt is
`agw-receipt-9701c022-0a9d-4c1d-b697-143d701386e6`.
The terminal receipt is
`agw-receipt-e0b72fb5-5f26-447f-9203-ac8cf191254b`.

EXCLUDE_SOURCE transition `956a8057-a326-4dab-bb47-7347c08fae0d` records
SUPPLY_REVIEWER authority and generation 2. Mission now has isExcluded true,
excludedAt `2026-09-11T04:14:28.472Z`, stage SOURCE_EXCLUDED, and outcome
SOURCE_EXCLUDED. Its scrape source status is EXCLUDED. Automatic scraping and
root automation are disabled. Supply Target count remains zero.

Exactly one reviewer claim ran. Its five receipts all succeeded: two artifact
reads, one heartbeat, one terminal effect, and one terminal submission.
No producer, mapping-package, approval, publication, or capture command ran.
Exact post-completion admission APPLY replay returned the same reviewer job
with zero writes.

Admission is closed. The runner and reviewer 1 are stopped, and the producer
was never started. Active claims and unresolved claim pointers are zero. The
workspace is empty. The Gateway and both model services are healthy with
restart policy no. Both model accounts remain distinct and healthy.

All 272 preexisting fingerprints and all 99 original protected fingerprints
remain unchanged. The original producer history, pinned artifacts, intake,
mapping job, mapping, organization, and candidate are retained. TPH and
Ultimate remain QUEUED at claim generation zero. Their roots and source
settings are unchanged. All five dormant service identities and states are
unchanged. The prior workload environment and canonical governed-deployment
environment retain their original hashes.

The private `run/final-safety.json`, `run/reviewer-outcome.json`,
`run/post-completion-replay.json`, and `run/environment-preservation.json`
contain the final proof. The monitor exited normally and created no temporary
script file. The private deployment helpers and source export remain as
reproducible operational evidence.

The authorized Mission exclusion is complete. The next separate bounded
operation is TPH Academy Austin, followed by Ultimate Chicago, with an
independent reviewer for each resulting package. No broader work is authorized
by this completion record.

## Authorized TPH and Ultimate trial

The operator authorized one bounded session for TPH Academy Austin, followed by
Ultimate Chicago. Each source gets one producer claim and one independent
reviewer claim if a package is committed. Stop on an unexpected pipeline
failure. Do not admit automatic retries or producer-repair follow-up jobs.
Publication, automatic scraping, and the wider fleet remain held.

Use the existing deployment-8 services and reviewed source
`c0364064825c5a5f57e681b86077dfda08ec5902`. No image publication, Gateway
replacement, or model-service restart is needed. Current live contract checks
passed. Both queued jobs retain the current catalog hash, valid HTML/Markdown
manifests, exact source roots, and claim generation zero. The deployed Gateway
supplies the authoritative CLUB listing kind when each claim is created.

TPH's Gateway job is `0ec7d3d8-eb20-4a51-989c-6bf59ec05974`, with root
`9c6942b2-d546-489d-b0f6-2d63bcdb36a8`. Ultimate's Gateway job is
`2be12acf-1995-4ea5-a36c-3011e42aecaf`, with root
`43c8211c-ff87-453d-9037-d768651d65c0`. Both sources remain private and retain
LEGACY_SPORT_REPAIR. Mission remains SOURCE_EXCLUDED at generation 2.

Start only affiliate-agent-runner, mapping-producer-1, and supply-reviewer-1.
Keep admission closed until all required readiness checks pass. Open an
exact-job, one-claim lease for each authorized invocation. Close it after the
claim. Keep the other source unclaimed until the current source's outcome is
recorded. Stop these three services at session completion or pipeline failure.

The baseline captures 286 protected preexisting records. The only preexisting
queue rows permitted to change are the two named producer jobs and their two
mapping jobs. Original mapping, organization, candidate, and historical
evidence rows remain protected. New mapped packages and independent review
records must use their own audit lineage.

Both model accounts passed current health checks. Admission is closed, active
claims and retained pointers are zero, and the workspace is empty. The private
evidence directory is
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v8-tph-ultimate-20260911T153559781Z`.

### TPH producer hold

TPH claim `agw-claim-e76e9306-3b8d-48d5-95e3-8babe66ffc73` ran from
`2026-09-11T15:38:47.083Z` to `2026-09-11T15:50:15.495Z`. It completed
CONTRACT_GAP with SPORT_BLACKLISTED and SPORT_NOT_IN_CATALOG. Its terminal
receipt is `agw-receipt-eb0e0729-3b38-4344-840e-3af76fa4feb0`, and its result
hash is `9c078635573e982e0a4c2de2be351023c1c449b5540f5e183e253f3be7caf1a4`.

The producer cited gallery descriptions for Dance and Martial Arts. It did not
validate or commit a package. No reviewer job was created, so the conditional
independent review did not run. TPH remains PRE_MAPPED at generation 1 with
LEGACY_SPORT_REPAIR. The source status is REVIEW_REQUIRED.

This is a producer hold, not an independently approved activity inventory.
Read-only inspection found that the same stored page also has gallery
references to catalog-supported sports. The actual program scope needs
evidence review before any catalog addition or new mapping attempt. Do not
blindly retry the same claim or treat these gallery captions as approval to
add Martial Arts to the catalog.

### Ultimate package and independent approval

Ultimate producer claim `agw-claim-2c26e4d4-301e-4536-bb41-69d27b6fd380`
ran from `2026-09-11T15:52:46.150Z` to `2026-09-11T15:54:48.118Z`.
It completed BOUNDED_REPAIR_SUBMITTED. Validation receipt
`agw-receipt-3f491bf4-e68f-4eac-b37a-695bc3e9a7b2` and commit receipt
`agw-receipt-3d388f25-c843-4c5d-ae51-5aca066b1dfa` succeeded.
The package hash is
`7dab6c53cb9b4299fcf07e5365bff75365e806b762afeb7bee3c07acf8d02820`.

The package produces one CLUB candidate titled Ultimate Chicago, with canonical
sport Ultimate Frisbee, first-party organization metadata as its description,
and the official homepage action URL. The validation output retains a literal
`&ldquo;` entity. No public rendering was exercised in this session; inspect
presentation before activation or publication.

The producer corrected one local package-schema rejection and one Gateway
PACKAGE_NO_CANDIDATES rejection within the same invocation. It then validated
and committed successfully. No deployment or extra producer claim was needed.

Independent reviewer job `42a92800-d72f-4202-a6fd-5638444e861e` used claim
`agw-claim-07791fa6-3843-4185-9a7e-53461336acaa`, from
`2026-09-11T15:55:48.635Z` to `2026-09-11T15:56:47.662Z`.
Its worker, invocation, and workspace identities differ from the producer.
It read all four review artifacts and returned APPROVED.

Reviewer effect receipt `agw-receipt-aec283cf-0480-4255-ae4c-9eb2d29dff24`
and terminal receipt `agw-receipt-84e02769-54d0-45d4-842f-03d0aba090fb`
succeeded. The result hash is
`29aefefe2249149dd38d6bdcc7ad3c416015b0270ae03b6f929fde59bb2b8c0f`.
APPROVE transition `4866f39e-6c60-40e7-aca3-a924dec13a78` records generation 3.
Mapping `agw-artifact-9342d8d8-d737-4d2c-ba3d-8e3669090e3c` is version 2.
It has an approval validation timestamp but remains inactive. The source
points to this new mapping. LEGACY_SPORT_REPAIR and disabled automation remain.
No activation or producer-repair follow-up job was created.

### Session result and safety

The bounded session is complete: two producer claims and one independent
reviewer claim. All three completed with zero terminal schema corrections and
zero invocation failures. TPH is not repaired or independently approved.
Ultimate is repaired and independently approved, but not activated or published.

Admission is closed. The runner, producer 1, and reviewer 1 are stopped.
Active claims, unresolved pointers, and queued Gateway jobs are zero. The
workspace is empty. The Gateway and both model services remain healthy.
All six container IDs and images are unchanged from session start; no
deployment or Gateway/model restart occurred. The five dormant services are
unchanged.

All 286 protected preexisting fingerprints and all 99 original protected
fingerprints match. Mission's root, source, and exclusion transitions are
unchanged. Existing mappings, organizations, candidates, and evidence remain
intact. All three organization public pages and widgets remain disabled.
Automatic scraping is disabled and the two trial roots have zero Supply Targets.

Private evidence includes both producer outcomes, the Ultimate reviewer outcome,
the extracted source description, TPH source-scope excerpts, all three monitor
logs, the bounded rejection diagnostics, and `run/final-safety.json`.
The monitors exited normally and created no temporary script files.

These trials do not authorize more retries or fleet expansion. The next
decision is how to resolve or retain TPH's evidence hold, followed by a
controlled repair batch. Full activation/publication proof remains a separate
rollout gate.

### User review decisions

The user reviewed the retained TPH and Ultimate evidence.

For TPH, the user approved the other valid sports and directed that Martial
Arts and Dance not be added. Treat this as a source-specific inclusion scope:
omit those two activities from the TPH mapping, retain source-supported
catalog sports, and do not block or exclude the entire organization because
of the omitted activities. Do not add a Martial Arts catalog row or infer a
new global blacklist policy from this decision. Soccer and Volleyball still
use exact, source-supported catalog variants; do not invent generic aliases.

This decision resolves the human activity-scope question. A future governed
repair must carry the decision in its claim context and map the retained
sports. Preserve the completed producer hold and its evidence. The decision
does not itself create a package or change TPH's current database hold.

The user also approved Ultimate's reviewed content. No content decision
remains open for that package. Preserve its first-party wording and meaning.
The encoded quote and public rendering remain presentation checks before
activation; the stored Open Graph description already contains the actual
quotation mark. Do not rewrite the description as discovery narration.

These are recorded content decisions only. No catalog, mapping, source,
candidate, publication, queue, or runtime state changed. Ultimate remains
independently approved and unpublished. Another claim or activation requires
the separately authorized governed operation.

## Source-specific sport scope repair

The user directed that TPH retain its valid sports while omitting Dance and
Martial Arts. Ultimate's content is approved and is not part of this repair.
This work starts from `6e23ff11e896e05e3b1e8e64c3c0594d75ae3856` on
`workstream/affiliate-sport-scope`. Maintain this section under PLANS.md.

The goal is a governed producer claim that can apply the recorded source
scope and create one multi-sport CLUB package. A source scope selects which
activities belong in this mapping. It is not a catalog addition, a global
blacklist change, or a human selection of a canonical sport variant.

### Progress

- [x] Identify the missing claim scope and plural sport package field.
- [x] Carry the authenticated source scope through the existing retry audit.
- [x] Validate the retained sport union and reject excluded activities.
- [x] Prove a multi-sport TPH package against the retained source evidence.
- [x] Complete independent Standards and Spec review.
- [x] Integrate the verified source change on main.
- [x] Identify the next bounded activation/publication operation.

### Design decisions

Extend the existing operator-only legacy repair retry interface. Do not add a
second queue writer or a new source-exclusion system. PREVIEW/APPLY can carry
an optional sorted excludedSourceLabels list for one exact completed producer
hold. The operator identity comes from the authenticated Gateway, not request
JSON. Each added label must cover a whole unresolved, unsupported, or
blacklisted determination in that exact parent result. Retain prior exclusions
with their original authority. Explicit and inherited scopes require one parent.

Build a self-hashed sourceSportScope containing source root, intake, evidence
run, parent Gateway job, parent result hash, excluded labels, operator actor,
and reason. Place it in the new producer repairContext and the existing retry
audit. Bind it in report hashing, replay, claim admission, reviewer lineage,
validation, and committed mapping metadata. Do not rewrite the old producer
result or its citations.

A newly approved scope is a meaningful changed input. It can authorize an
otherwise eligible bounded retry without another code deployment once the
new interface is deployed. An unchanged scope cannot bypass the existing
same-deployment retry guard. The pass cap, one-child dedupe rule, closed
admission, active-claim checks, fresh preflight, and publication holds remain.

The producer omits excluded activities from the retained sport determinations
and executable fields. The scope record preserves the exclusions and their
parent evidence. It must not reinterpret an excluded activity as another
canonical sport. Retained names still require SOURCE_EVIDENCE and exact
catalog values. Soccer and Volleyball variants still need explicit source
surface evidence. Prioritize program/About text over incidental gallery text.

Add a sportNames selector field and a closed CONSTANT sportNames field with
a sorted unique values array to the governed package schema. Keep the
existing sportName field for single-sport packages. A package cannot contain
both fields. Reuse the importer's existing pipe-delimited literal conversion
and candidate sportNames handling. Require every emitted name to equal the
verified retained sport union. No mobile HTTP contract changes are needed.

The package includes sourceSportScopeHash when its claim has a scope. Reject
an absent or different hash, or a scope hash supplied for an unscoped claim.
The model can acknowledge the scope but cannot invent or change it.
Advance the role and prompt contracts to version 9 for these changes.

### Implementation and verification

The affected modules are agentGatewayContracts.ts, affiliateSportDetermination.ts,
affiliateLegacyRepairAdmission.ts, prismaAgentGateway.ts,
agentGatewayAdapters.ts, affiliateAgentTerminalValidation.ts, and the
operator HTTP interface in scripts/run-affiliate-agent-gateway.ts.
The server modules are under `apps/site/src/server/affiliateImports/`.
The same change updates `service.ts` and `affiliateAgentCommandDiagnostics.ts`.
Use their existing schemas, evidence verifier, retry audit, and transaction
patterns. Preserve current and historical unscoped records without defaults
that would change their hashes.

Verify forged or changed scopes, excluded sport reintroduction, same-deployment
unchanged input, exact replay, and two retained canonical sports through real
package validation and extraction. Run the affected complete Jest suites,
TypeScript, targeted lint, and the pinned SDK probe after the implementation.
Run a read-only TPH retry PREVIEW and a retained-evidence extraction smoke.
No production claim, image publication, service restart, activation, or
publication is authorized by this source implementation.

### Outcome

Source commit `802f8ed3bc28af36c89c569f148da34bff61dc5b` is integrated on main.
The post-integration 540-test batch and site TypeScript check passed. No
production state changed. TPH's existing hold and Ultimate's approved package
were not modified. The next operational gate is the reviewed release and one
bounded TPH producer/reviewer run. Full fleet expansion still requires one
complete lifecycle proof inside the active Supply Contract.

### Source and activation findings

The retained TPH Markdown lists sand volleyball courts, regulation NHL ice
rinks, pickleball courts, and a baseball training center. Its campus image
text explicitly describes indoor soccer with a TPH player. The source smoke
therefore uses Baseball, Beach Volleyball, Hockey, Indoor Soccer, and Pickleball.
It does not substitute Indoor Volleyball or infer Grass Soccer from an
unassigned outdoor turf field. An independent producer and reviewer must
still assess the complete stored source.

The current production Supply Contract is version 1 with hash
`c808492a7d60741b508978987441a0a31f59602a5e5321789d9865823f6098cf`.
Its three target rows are EVENT supply in `portland-vancouver` for Beach
Soccer, Grass Soccer, and Indoor Soccer. It has no CLUB target or CLUB
freshness window. TPH Austin and Ultimate Chicago are repair examples, not
the current target cohort.

The legacy repair reviewer deliberately stops after approval.
`enqueueProductionApprovalActivation` is not called for a legacy repair,
and its ACTIVATE command is rejected. Approval also preserves
`LEGACY_SPORT_REPAIR` in the source metadata. A full-loop proof must use
an approved in-contract source with a valid activation handoff, or first
receive a separate reviewed Supply Contract change and an exact authorized
hold-release/activation handoff. An approved package alone is not permission
to enable scraping or publish it.

### Independent review and verification record

Review base: `6e23ff11e896e05e3b1e8e64c3c0594d75ae3856`.
`ScopePackageStandards`, `ScopePackageSpec`, `ScopeAdmissionStandards`, and
`ScopeAdmissionSpec` returned PASS. All accepted correction findings reached
fixed, re-reviewed, and verified status.

The prompt corrections preserve the original evidence shape, exact citation
rules, validation receipt, and listing-kind rules within the existing row and
character limits. The rendered appendix now supports plural sport fields.
No prompt limit was raised.

The admission corrections bind each scope introduction to its exact parent
result, operator, reason, complete new-label selection, and source identity.
Inherited scopes keep their exact original record. Retry and continuation
edges retain deployment, disposition, pass, batch, and dedupe rules. The
lineage ends at the verified unscoped pass-one admission. Historical unscoped
v1 and v2 reports remain supported without changing their hashes. Immutable
parent claims detect removed scopes and bind reviewer repair identity,
context, package, and evidence. Ordinary parentless unscoped claims still work.

The package corrections reject excluded activities after Unicode, whitespace,
and case normalization. Errors identify editable package fields. Validation
and commit preserve the exact retained union and scope hash. The CLUB importer
keeps the full persisted sport array. EVENT, TEAM, and RENTAL multiplicity rules
remain unchanged. Tests no longer pin copied metadata, read counts, or exact
diagnostic sentences.

The real TPH preview found one additional compatibility defect. The queued
role-8 job has no listingKind, while its immutable claim has CLUB. The retry
reader now accepts that documented enrichment. A supplied queued kind must
match the immutable claim, and the claim kind must match the current source.
The regression and real preview passed without changing production rows.

The final complete affected batch passed 540 tests across 14 suites. This
includes the 52 admission tests, 124 Gateway tests, and 50 adapter tests; those
counts are not added again. The same complete batch passed with
`--detectOpenHandles` and reported no retained handle. Expected simulated
failure logs remain visible in the tests.

Site TypeScript and targeted ESLint on all 16 changed TypeScript files passed.
The pinned OMP 18.1.13/Bun 1.3.14 SDK probe passed execute_command, check_result,
and submit_result schema checks with no provider call. Database-backed
integration suites were not run.

Run these checks from `apps/site`:

    npm exec jest -- --runInBand --detectOpenHandles \
      src/server/affiliateImports/__tests__/affiliateLegacyRepairAdmission.test.ts \
      src/server/affiliateImports/__tests__/agentGateway.test.ts \
      src/server/affiliateImports/__tests__/runAffiliateAgentGateway.test.ts \
      src/server/affiliateImports/__tests__/agentGatewayAdapters.test.ts \
      src/server/affiliateImports/__tests__/affiliateOmpGatewayTools.test.ts \
      src/server/affiliateImports/__tests__/affiliateSportDetermination.test.ts \
      src/server/affiliateImports/__tests__/service.test.ts \
      src/server/affiliateImports/__tests__/affiliateOperationalAlerts.test.ts \
      src/server/affiliateImports/__tests__/affiliateSourceExclusionAdmission.test.ts \
      src/server/affiliateImports/__tests__/affiliateAgentRunnerBoundary.test.ts \
      src/server/affiliateImports/__tests__/affiliateAgentRunnerProtocol.test.ts \
      src/server/affiliateImports/__tests__/agentSupervisor.test.ts \
      src/server/affiliateImports/__tests__/agentDeployment.test.ts \
      src/server/affiliateImports/__tests__/affiliateFleetReadiness.test.ts
    npm exec tsc -- --noEmit --pretty false
    npm exec --yes --package=bun@1.3.14 -- bun scripts/test-affiliate-omp-agent-sdk-schema.ts

Two real TPH PREVIEW runs used verified PostgreSQL read-only sessions and the
same retained HTML/Markdown. Both selected pass 2 for parent Gateway job
`0ec7d3d8-eb20-4a51-989c-6bf59ec05974`, with no hold reason and zero writes.
The proposed deployment is version 9 with hash
`1cacbcf4e73edc12475ab4f57d7ebf196b4d102aaebe4f3d8ae490605adfbab8`.
It is a proposal, not an active deployment.

Both preview hashes were
`24fa919b16a20176742ca98c88ac90c6afa99b93a107325ba0f6ac8c95561e8e`.
Both source-scope hashes were
`1732c9b999626c3af1b367d1419f106ea532ff65a8479b542648817b814a854c`.
The real production validation adapter accepted Baseball, Beach Volleyball,
Hockey, Indoor Soccer, and Pickleball while omitting Dance and Martial Arts.
The probe stopped at the first database mutation. Both validation artifact
hashes were
`d1b1b8d108e11e36d3ace137d77e9a40259eefbb2aa0a0b20199ddfc13e6fc37`.
Each run used 12 read-only batches and 21 read operations. Database writes,
storage writes, and provider calls were all zero. No claim or APPLY ran.

The disposable probe was corrected to use proposedWrites rather than row.write,
restore the observed catalog timestamp from the report row, and follow the
existing nullable selector-attribute schema. Those were harness corrections,
not production contract changes.

Accepted boundary: operator retry after a reviewer-created producer repair
ends in a new CONTRACT_GAP remains outside the existing retry admission
contract. This change does not add that parent kind. It does preserve scope
for reviewer-created producer claims that the existing workflow supports.

Accepted replay decision: an omitted exclusion list and an explicitly
identical normalized list are equivalent only when the parent already carries
that scope. Both preserve its exact record. Neither creates a new selection
or changes authority. A first introduction still requires its explicit list.
Changed labels, scope data, current operator, or current reason remain drift.
No request-presence flag is needed.

Revision note: this section records the source-scope repair, the complete
multi-sport CLUB path, independent review, and read-only production evidence.
Image publication, deployment, new claims, activation, and publication still
require separate current authorization.

Integration and cleanup note: main advanced by fast-forward from the review
base to `802f8ed3bc28af36c89c569f148da34bff61dc5b`. Post-integration checks used
the identical isolated worktree revision. The complete 14-suite,
540-test open-handle check and site TypeScript check passed. The temporary
TPH probe scripts, exported bytes, and local report copies were removed after
their evidence hashes were recorded above. No production image was published
and no runtime was changed.

## Authorized TPH source-scope trial

The user authorized continuation of the stated next step: the reviewed
version-9 deployment and one bounded TPH producer/reviewer run. Use source
`59e8b3bbff8a300254140c75d503249c1f69c76d`. Its exact Site CI run
`34661715889` passed. Do not publish a different source revision.

Refresh only affiliate-gateway, affiliate-agent-runner, mapping-producer-1,
supply-reviewer-1, affiliate-model-auth-broker, and affiliate-model-gateway.
The model services use the shared worker image and require image parity.
Preserve the broker volume, both account identities, bearer files, security
profiles, networks, and restart policy no. Keep the five dormant services,
site, database, mobile, coverage, and replenishment unchanged.

Keep claim admission closed during release preparation and deployment.
Compile role/prompt 9 into deployment contract 9. Keep the active Supply
Contract unchanged. Capture fresh preflight evidence before opening a lease.
Use a new protected workload environment; do not overwrite the canonical or
previous workload environment files.

The only retry parent is `0ec7d3d8-eb20-4a51-989c-6bf59ec05974`.
Its mapping job is `bca6ba9f-fdf6-4024-a254-88c052307972`, and its root is
`9c6942b2-d546-489d-b0f6-2d63bcdb36a8`. Submit the exact source exclusions
Dance and Martial Arts through the operator-only retry PREVIEW/APPLY route.
Review two stable previews. Apply only the reviewed report hash. Verify exact
replay without a second write. Keep the original parent, claim, result,
receipts, citations, and catalog history unchanged.

Start only the root runner, producer 1, and reviewer 1 for this workload.
Open one exact-job producer lease. Close admission after the claim. Admit one
independent reviewer only if that producer commits a package. Do not admit
automatic retries, producer-repair follow-up jobs, or another source.
Stop these three services after completion or an unexpected pipeline failure.
Keep the Gateway and model services healthy for inspection.

This trial does not authorize activation, publication, automatic scraping,
catalog additions, global blacklist changes, or fleet expansion. Ultimate's
approved package and Mission's completed exclusion remain unchanged.

### Progress

- [x] Verify reviewed source and exact-commit CI.
- [x] Verify closed admission, no active claims, and no retained pointers.
- [x] Verify both model accounts and an empty runner workspace.
- [x] Publish and verify the exact immutable images.
- [x] Deploy the six named services with fresh preflight.
- [x] Admit and run the exact scoped TPH producer and its reviewer.
- [x] Close admission, stop the workload services, and verify preservation.
- [x] Record the result and the separate lifecycle gate.

### Baseline and verification

Before any release change, TPH is PRE_MAPPED at generation 1 with
LEGACY_SPORT_REPAIR. Its mapping job is held for review, and its original
Gateway parent is completed with CONTRACT_GAP. Ultimate is APPROVED at
generation 3 with its inactive version-2 mapping and automation hold. Mission
is SOURCE_EXCLUDED at generation 2. All three organizations are unlisted with
public pages and widgets disabled. Automatic scraping is disabled.

The Gateway and both model services are healthy on the reviewed version-8
images. The runner, producer 1, and reviewer 1 are stopped. The five dormant
container identities and states are captured for exact comparison. Both
distinct model accounts pass health checks with broker-managed refresh.
The runner workspace is empty. Active claims and retained claim pointers are
zero, and GET /admission returns closed.

Preservation checks must retain all preexisting Gateway history, the original
protected cohort, old mappings, organizations, candidates, and pinned source
evidence. Only the TPH mapping job, source/root lifecycle state, and new
governed retry/package/reviewer records may change through the authorized
Gateway. Record the exact before/after fingerprints and terminal receipts.

### Outcome

The bounded trial is complete. TPH is independently APPROVED at generation 3.
Its new version-2 mapping remains inactive under LEGACY_SPORT_REPAIR. Admission
is closed, the workload services are stopped, and no publication or automatic
scraping was enabled. Ultimate's approval and Mission's exclusion are unchanged.

### Deployment and admitted producer evidence

Publication run `34777437493` passed after the exact production-environment
approval. The worker image is
`ghcr.io/razumly/bracketiq-affiliate-governed@sha256:6661cd72a0924cc7fd131540fd0a67ecb432c0b9b6de41d38ed0b912c14da804`.
The Gateway image is
`ghcr.io/razumly/bracketiq-affiliate-gateway@sha256:6d18c4d2c41756281def988a865f7c085e690dfd3cc32317bac65430f1468aba`.
Both local image identities, RepoDigests, and OCI revision labels match the
reviewed source. The shipped contract exports match role/prompt 9. Producer
and reviewer containment probes and the three pinned SDK scenarios passed.
The SDK test script was mounted read-only from the exact reviewed source;
test scripts are excluded from the production image.

The reviewed source archive SHA-256 is
`3a8ad3a92cc88a3ce21a861414ee867fb03ca23d493bc47ce0eafdad8767aac1`.
The exact source export is
`/home/bracketiq/.cache/affiliate-governed-builds/59e8b3bbff8a300254140c75d503249c1f69c76d/apps/site`.
Private version-9 helpers are under
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v9-tph-tools-59e8b3bbf`.
They retain the reviewed v8 checks and change only the version transition and
output labels. A truncated local helper copy was recovered and checked against
the complete original SHA-256 before use. Python syntax checks passed.

The new protected workload environment and operational evidence are under
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v9-tph-scope-59e8b3bbf`.
Preparation changed only the two image references, deployment contract JSON,
and preflight report field. All other environment values and all nine distinct
credentials were preserved. The environment mode is 0600. Model volume,
secret-file mount, and network identities matched before replacement.

The Docker host passed the existing Linux, cgroup-v2, and security checks.
The six selected containers were recreated without starting dependencies.
Docker Compose uses `up --no-start --no-deps` for that step; `create` does not
support `--no-deps`. Both model services were then started and became healthy.
The five dormant container identities remained unchanged.

Fresh preflight passed at `2026-09-13T19:59:23.603Z` with no blocker or warning.
Its report hash is
`6dddd67c28c27a9d26fed6268d84c592381941b9069054c3f104b7f68cfd7ea6`.
It found 20 stopped legacy processes. The report was installed after 58 seconds.
The Gateway was recreated with that report and became healthy with admission
closed. The runner and both selected supervisors then passed readiness.
Both distinct model account identities and broker-managed refresh remained
healthy after replacement.

Two deployed PREVIEW requests returned the reviewed hash
`24fa919b16a20176742ca98c88ac90c6afa99b93a107325ba0f6ac8c95561e8e`.
APPLY created only producer job `d6a4b4a7-b33f-43ab-ba67-6e1cf8bef6bd`.
Exact APPLY replay returned that job with zero writes. Its pass is 2, and its
source-scope hash is
`1732c9b999626c3af1b367d1419f106ea532ff65a8479b542648817b814a854c`.

One 300-second exact-job lease admitted producer claim
`agw-claim-82963e2e-5e31-41fd-b69c-09b0bf01780d` at
`2026-09-13T20:08:55.257Z`. The stored claim carries role/prompt/deployment 9
and the exact approved exclusions. The monitor closed admission after the claim.
All 181,683 protected preexisting row fingerprints still matched after deployment
and claim admission. The original 99-record protected cohort also matched before
deployment. Final comparison remains required after the producer/reviewer result.

### Producer package and independent approval

The producer completed at `2026-09-13T20:21:28.209Z` with
BOUNDED_REPAIR_SUBMITTED and zero invocation failures. Its terminal result hash
is `c8d1a1d9863c3467fbd5d6c03ab2322b96d0232d78f17a803783ea3677d52456`.
The validation receipt is `agw-receipt-be7d16be-540e-4a60-b68f-3d47059b14e6`.
The commit receipt is `agw-receipt-11724c76-70e9-4f2a-b32a-17c0d57acf28`.
The terminal receipt is `agw-receipt-3f70520e-9037-465a-ba9f-2d6d1830d526`.

The committed package hash is
`159c24ade064f8001fe9c8305a6aed543a4e6b6c5aadfc96c6e00c44ca56c960`.
It contains one CLUB candidate with Baseball, Beach Volleyball, Hockey,
Indoor Soccer, and Pickleball. Dance and Martial Arts remain outside the
retained union. The description selects the site's complete Austin program
paragraph without discovery narration. The official action link is
`https://tphacademy.com/austin/#connect`, and the source URL is
`https://tphacademy.com/austin/`.

The producer created only reviewer job
`67dba499-7dde-415f-8bd9-aa52dbcb9f45`. One exact-job reviewer lease admitted
claim `agw-claim-9427904e-889c-48f7-8b94-ef4e63c7f064` at
`2026-09-13T20:26:26.848Z`. It used a separate reviewer worker, invocation,
and workspace. The reviewer independently returned APPROVED at
`2026-09-13T20:27:32.931Z`, with result hash
`0b37d14f3f092301edd2dd30c5b9119ca2b057328001325505f50b6af0d90354`.

The succeeded reviewer effect receipt is
`agw-receipt-b10fe774-be72-488a-a140-5f23b7f5d4d3`.
The terminal receipt is `agw-receipt-1ac04c62-c4fb-4a76-86c5-3132d0ab6e5a`.
APPROVE transition `44218ce1-dc66-460d-9609-2cc93d02f887` records generation 3.
The effect explicitly returns activationHeld true and
holdReason LEGACY_SPORT_REPAIR. No activation or producer-repair job was created.

The new mapping is `agw-artifact-09f2b226-55d3-4e16-ac25-82a85ace410b`,
version 2, isActive false, with validatedAt
`2026-09-13T20:27:32.722Z`. The authoritative root is APPROVED with
AUTOMATION_HOLD. The source row retains its legacy REVIEW_REQUIRED status;
that status was not rewritten to fabricate activation.

### Final safety and handoff

Exactly two new Gateway jobs and two claims ran: the one admitted producer
and its one independent reviewer. All 25 operation receipts succeeded.
Both invocation failure counts are zero. New records consist only of nine
Gateway artifacts, two claims, 27 Gateway events, two Gateway jobs, 25 receipts,
one approval, one mapping, and two lifecycle transitions. No source capture
run, intake, public target, or unrelated record was added by this trial.

All 181,683 protected preexisting row fingerprints match. All 99 original
protected fingerprints also match. This includes the original TPH parent and
its evidence/history, old mappings and organizations, Ultimate's approved
package, and Mission's completed exclusion. TPH has zero Supply Targets.
All three organizations remain unlisted with public pages and widgets disabled.
Automatic scraping and root automation remain disabled.

Admission is closed. Active claims, retained claim pointers, and queued
Gateway jobs are zero. The runner, producer 1, and reviewer 1 are stopped.
The runner workspace is empty. The Gateway and both model services are healthy
on the reviewed version-9 images. The five dormant container identities,
states, images, and restart policies are unchanged. Both distinct model
accounts remain healthy with their original identities and broker-managed
refresh. The canonical, v7, and v8 environment file hashes are unchanged.

Private evidence includes run/final-safety.json, delivery-record.json,
completion-check.json, producer-outcome.json, reviewer-outcome.json, both
monitor logs, and the exact admission/replay receipts. The source export,
versioned deployment helpers, and redacted preflight artifacts remain as
operational evidence. Local temporary helper copies were removed.

The next separate operation is one complete discovery/capture-to-publication
proof for Portland–Vancouver soccer EVENT supply under the active Supply
Contract. TPH and Ultimate are approved repair examples, not authority to
publish outside that cohort or to start the full fleet. Any hold release,
activation, publication, or broader admission requires current authorization.
Issue 70 remains open for those operational acceptance gates.

## Existing-data repair before new collection

The user changed the next priority. Review and repair the complete existing
mapping and data backlog before new-source discovery or collection. This
supersedes the proposed next Portland discovery-to-publication trial above.
TPH and Ultimate remain approved and held. Mission remains excluded.

### Progress

- [x] Inventory all mapping, approval, intake, source, candidate, and Gateway states.
- [x] Classify the recorded concerns and check stored artifact/identity availability.
- [x] Run the current governed admission PREVIEW without writes.
- [x] Set the existing-source refresh boundary with the user.
- [ ] Implement and review the governed path missing from the current backlog.
- [ ] Run bounded producer and independent reviewer repair batches.
- [ ] Verify candidate/source updates and preserve current public content.
- [ ] Report every remaining human, policy, identity, or evidence blocker.

### Inventory

The live census found 402 HUMAN_REVIEW_REQUIRED mapping jobs, 453 QUEUED jobs,
523 FAILED jobs, one REVIEW_REQUIRED job, 601 legacy APPROVED jobs, four
COMPLETED governed repairs, and 79 EXPANDED jobs. These are mapping-job counts,
not source counts.

The 402 human-review jobs are the same jobs behind 228 deferred and 174
rejected mapping-package approvals. The 301 sport-requeued jobs account for
another 301 rejected approvals. Four old rejected approvals belong to the
now-completed governed repairs. Those historical rows must not be retried.
The sole REVIEW_REQUIRED mapping job belongs to the excluded Mission source.
Do not add approval and mapping counts together.

All 402 human-review jobs lack sourceId, mappingId, supplySourceId, a current
claim catalog, and parsed sport determinations. Their old sport review labels
are unrecorded. They must be reassessed from evidence before a new human sport
decision is requested. The existing guidance provisionally assigns 15 to
MAPPING_AGENT, 151 to SYSTEM/handoff repair, and 236 to USER. These are triage
labels, not fresh independent review decisions.

Stored PAGE_HTML and PAGE_MARKDOWN artifacts with File records exist for all
402 human-review and 453 queued jobs, plus 514 of the 523 failed jobs. Nine
failed jobs lack that paired metadata. This does not prove every stored byte
is readable or that every page contains sufficient source evidence; the
repair admission must verify both.

For human-review jobs, exact source-key/provenance joins find one source for
205 jobs, two for one job, and none for 196 jobs. No identity is assigned by
this census. The failed and queued sets also need source identity work.
The stored capture range is July 16 through August 15, 2026. Mapping repair
alone cannot prove that current schedules, links, or prices are fresh.

There are 168 NEEDS_REVIEW candidates: 97 CLUB, 46 EVENT, and 25 RENTAL.
All carry the noncanonical sport warning. Some also lack event location or
division evidence. Source mapping approval does not itself repair these
persisted candidate rows. There are 2,821 legacy PUBLISHED candidates whose
visible content must remain protected during repair.

### Current execution barrier

The deployed Gateway's legacy admission PREVIEW scanned its 306-job
sport-reconciliation cohort and selected zero eligible jobs. Report hash:
`a844dfb71ab1a7c131fb488ec112184e013d50d29ce1529dfced23bb057083f0`.
Among the 301 remaining queued jobs, 237 fail source/mapping identity checks
and 64 have published or validated state that the private-trial route rejects.
The five prior trial jobs are already completed or excluded.

The existing Gateway is not a generic backlog repair interface. The human
review endpoint supports only exact sport decisions and displays at most
250 rows, with no cursor. Old direct requeue/repair scripts are not a safe
replacement for governed admission. Do not reset statuses, invent source
identity, treat old NOT_IN_CATALOG labels as current policy, or restart the
retired Goal fleet.

### Repair order and safety

Use a governed existing-data repair path with exact reviewed job/source lists.
Begin with recoverable package/handoff defects and evidence-backed sport
reassessment. Reconstruct identity only from verified source and capture
lineage. Hold ambiguous merges, policy exclusions, and unsupported sports for
the proper independent or human decision. Rebuild from original artifacts
when an old producer workspace or commit is unavailable.

Store repaired mappings as reviewable versions. Preserve current public
records and their working mapping while a replacement is under review.
Apply source/candidate corrections only through a reviewed, atomic,
idempotent Gateway transition. Keep new-source discovery, fleet expansion,
and automatic publication outside this repair program.

The user selected Refresh existing sources. The repair program may selectively
recapture already-known source URLs to verify current data. New-source
discovery remains off. Corrections are staged for independent review while
current public records stay protected. No capture or runtime state change
has occurred during this census. Admission is closed and the workloads are stopped.

### Evidence and outcome

The complete read-only census, 402-row human-review inventory, relationship
and artifact metadata, and full governed PREVIEW are stored under
`/home/bracketiq/.config/bracketiq-affiliate-agents/existing-data-repair-inventory-20260913`.
No production row was changed. The refresh boundary is approved. The next
implementation must add governed repair admission and public-safe staging;
restarting the current queue cannot perform that work.

### Governed repair implementation contract

Use a new operator-only existing-data repair admission, not a relaxed legacy
sport admission. PREVIEW/APPLY names exact existing mapping job IDs or source
IDs, with a combined limit of 20. The report binds selection, current records,
source evidence, actor, reason, and current contracts. APPLY is atomic,
idempotent, closed-admission-only, and rejects active ownership or state drift.
Preserve old attempts and result history. A new repair cycle does not erase
old failures or approvals.

The Mapping Producer and reviewer carry an EXISTING_DATA_REPAIR context.
It contains intake/run/catalog identity, exact source identity, admission hash,
working mapping identity, protected source-state hash, public-replacement flag,
all recorded repair reasons, and any existing authenticated sport scope.
The Gateway derives these fields. The model cannot invent preservation
authority or relax source restrictions.

For a known intake with no source row, create a real private source and root
from one exact owned page identity. Do not choose an arbitrary artifact or
merge ambiguous identities. The source has no organization or active mapping,
and automation stays disabled. Unresolved kind is explicitly UNCLASSIFIED.
Its source/root metadata and claim carry the same source-kind assessment and
supported kind allowlist. Absent hints allow CLUB, EVENT, and RENTAL as possible
kinds, not as facts. Multiple hints are not reduced to the first one. Explicit
TEAM or unsupported hints remain held.

The producer chooses a concrete package kind from evidence within that
allowlist. Successful commit classifies only the private UNCLASSIFIED source
and root through one compare-and-set transaction. Invalid validation leaves
them unclassified. Existing concrete sources retain their authoritative kind.
All current claims still require a kind except this explicit assessment case.
Old claim formats and hashes remain readable.

A public replacement uses one server-written pending-mapping pointer, with
the candidate mapping/package/candidate/evidence hashes and a snapshot of
the protected working source, mapping, and organization state. Commit and
RECORD_MAPPING do not switch the working mapping. Independent approval
validates the pending package and records its approval without changing
public organization fields, current source automation, candidates, or targets.
The working snapshot remains the public assessment. A trusted, database-derived
staged-review proof permits approval of the pending mapping; the model cannot
supply that proof. The producer lineage must point to the new candidate,
not silently return to the working mapping.

Fresh capture has a separate operator PREVIEW/APPLY/PROCESS interface for
exact existing intake/page IDs. The capture intent is persisted in the run
summary and is checked before processing. Evidence-only mode preserves
existing mapping/intake state, performs no discovered-page persistence or
successor-root creation, and creates no legacy mapping job. It records final
URL provenance; redirect identity drift remains held for review. Only the
reviewed run is processed. Existing ordinary capture behavior stays unchanged.

The Gateway exposes these operator-only POST routes under its configured path
prefix: `/existing-repair/admission`, `/existing-repair/capture`, and
`/existing-repair/capture/process`. All three require closed claim admission.
The admission and capture routes accept PREVIEW or APPLY. APPLY requires the
exact PREVIEW report hash. The caller cannot supply an operator identity,
source kind, preservation flag, or new URL.

Admission can select current evidence with `evidenceSelections`. Each selection
names one existing mapping job, run, and primary page. It can name at most two
supporting pages from that same intake and run. Source creation requires a
listing page. An existing source can use its exact known page identity.
The Gateway verifies page ownership, policy, paired HTML/Markdown, and stored
bytes. It includes verified supporting pages in the claim. This
lets a producer use program and About evidence without a new-source search.
The report hash binds this evidence selection. A fresh evidence-only run does
not replace the intake's old `lastRunId`; select its exact new run ID.

Most legacy scrape sources have no Supply Source root. PREVIEW binds their
actual state with a null root. A missing referenced root is still an error.
APPLY can create and link one verified exact root in its transaction. It then
captures the admitted working-state hash. It must not change public content,
the working mapping pointer, or source automation during that link.

For an UNCLASSIFIED source, commit records both the original admitted state
hash and the exact state hash after the authorized kind change. The immutable
claim keeps its original context. Later operations must verify the pending
mapping's server-written provenance before accepting that changed state.
An unrelated state change remains a conflict.

Keep the original repair context through bounded reviewer-requested repairs.
Each `mapping-repair:` child must trace to a completed reviewer request and
its completed producer. Check the exact source, package, pass, manifest union,
and immutable claim/result hashes. Stop at the original operator admission.
Reject a cycle, an unrelated parent, or a pass above three. Additional reviewer
artifacts do not replace the original first-party evidence.

The working-state hash does not include the root's lifecycle generation,
derived stage, or derived outcome. Those fields record workflow progress.
The Gateway still checks the separate lifecycle-generation compare-and-set.
Keep all source content, identity, working mapping, organization, and automation
fields in the protected state. A valid reviewer-created child can replace the
pending mapping. It cannot change the working mapping or commit twice in one
claim. A private provisional kind can change only within the original allowed
kinds and through a validated child commit.

Producer completion must keep the legacy mapping job linked to the pending
mapping, not the working mapping. A producer gap leaves that job in
HUMAN_REVIEW_REQUIRED and records its evidence. It must not change the working
source's status or automation. Independent approval rechecks the current
sports catalog and the original artifact citations.

Capture processing checks the reviewed marker hash after it acquires the run.
It checks the loaded intake and page snapshot again before provider access.
This prevents a late page-URL edit from changing the reviewed capture scope.
Generic intake workers cannot use the evidence-only marker as authorization.
Capture PREVIEW and PROCESS also hold excluded, replaced, ambiguous, or
policy-blocked source records. An expired recorded domain policy requires
review before a fresh request.

Reuse the existing importer fields for date, time, location, division, price,
capacity, and status extraction. Keep source-wording description checks and
exact catalog sport evidence. An unsupported extraction capability or genuinely
missing evidence must be reported; no placeholder value or generic sport may
make a package pass.

Advance role/prompt contracts to version 10 for these interface changes.
The deployed version-9 fleet remains unchanged while source work is implemented
and reviewed. Publication, deployment, and opening the backlog workload need
their own current, exact operational authorization after the source gate.

### Verification status after existing-data repair review

The review fixes are implemented in the Gateway and the retained PostgreSQL
regression. The Gateway now derives reviewer pass from the authenticated
producer subject, namespaces newly generated reviewer references by producer
claim and generation, preserves the pass on `PACKAGE_COMMITTED`, and rejects
an exhausted `PRODUCER_REPAIR_REQUIRED` result before any terminal effect.

Operator recovery now has an existing-data repair branch. It checks the
server-owned repair context, pending mapping content hash, producer and
reviewer lineage, reviewer manifest, contract snapshot, catalog, protected
working/public state, receipt, and lifecycle transition. An exact persisted
approval transition completes the quarantined Gateway result without invoking
the approval adapter or changing working data. The legacy recovery branch is
unchanged.

The database regression now exercises two reviewer rejections, derives child
decisions from each server-authored `repairDirective`, checks pass three
exhaustion after `PACKAGE_COMMITTED`, and rejects an altered pending mapping.
It retains the existing assertions for working source, mapping, organization,
public projections, evidence-gap holds, and zero active claims.

The final source gate passed on 2026-09-14. Both review axes are complete.
The gate ran `npx tsc --noEmit`, targeted ESLint, 14 unit/API suites with
517 tests, and three PostgreSQL suites with 61 tests. All checks passed.
ESLint printed two Babel file-size notices. It reported no lint failures.

Admission now rejects snapshot overflow instead of using incomplete evidence
or ownership rows. It checks active sibling jobs separately. Each selected
source ID applies only to its own mapping jobs. The baseline includes the
resolved root before a source backlink is added. Current policy, evidence
selection, deployment, source state, actor, and reason bind the admission.

The admission identity also binds the current catalog, kind assessment, sport
scope, and complete repair-reason set. A prior admission counts as current only
when its stored authority context, exact evidence selection, and manifest match.
Admission's own source/root links do not force a duplicate cycle. A changed
catalog, working state, or authority can permit a new reviewed cycle.
PREVIEW rejects a reason set that exceeds the claim schema. It does not remove
recorded human guidance to fit the limit.

Capture always runs the server's source, root, and policy checks after claim.
An optional callback cannot replace them. A policy can expire without a row
change. Such a policy blocks the provider request. An ordinary queue request
cannot reuse a governed run that appears between its ownership reads.
The ordinary queue decision and run creation use one Serializable transaction.
Policy review and its optional queue use that same transaction. A queue
conflict rolls back the complete policy save. The admin API returns HTTP 409.

Capture replay follows persisted recovery links, not run ID order. Recovery
keeps each predecessor link through repeated stale-worker replacements.
An incomplete or branched recorded request is an error, not a new capture.
Multiple selected page roots are valid only when each root belongs to the
same intake and has no conflicting live source.

The retained PostgreSQL scenario now includes two stale capture recoveries,
an ambiguous terminal branch, and approval recovery before the first lifecycle
write. The final gate must run these cases before production authorization.

Ordinary full and lightweight source activity use one shared PostgreSQL
advisory lease. The lease covers provider access, identity reconciliation, and
later writes. Existing-data admission APPLY and pending-mapping COMMIT use the
matching exclusive transaction lock. A busy lock blocks the operation.
The lease uses one global key and permits concurrent shared activity.
It does not keep a Prisma transaction open during a provider request.
Every session lease releases its connection in `finally`.

Manual scrape success still returns a non-null run. A pending repair throws
the typed hold; the admin API returns HTTP 409 and the scheduler reports
SKIPPED. A source with a pending repair also blocks organization relisting
through another source that shares that organization.

The PostgreSQL gate proved the forced ordinary/governed queue race, complete
policy rollback, both advisory lock directions, release after failure,
oversized-history rejection, and new cycles after catalog or working-state
changes. It also proved retryable COMMIT contention and approval recovery both
before and after a lifecycle write. The interrupted pre-write case uses real
Gateway reconciliation to quarantine the claim before operator recovery.

The deterministic database proof replaces the redundant transaction-wiring
unit fixture. The temporary smoke script and check configuration are removed.
The source contains no temporary repair debug logging.

This source work made no production changes or provider requests.
The version-10 image publication, deployment, and bounded producer/reviewer
execution still require separate current authorization. Discovery remains
outside the repair scope.

## Authorized first existing-data repair batch

On 2026-09-14, the user selected `First 20 jobs`. This authorizes publication
and deployment of version-10 images, followed by at most 20 existing mapping
jobs and their bounded producer/reviewer repair passes. The reviewed source is
`ef097891a2fe6134b251bf96c54a2f3496707a70`. It passed the source gate in the
workstream and canonical `main` worktrees. It is now pushed for the required
Site CI gate. Do not publish images until that exact CI run succeeds.

The authorized runtime set is:

- `site`, which is service `app` in project `bracketiq-production`;
- `affiliate-model-auth-broker`;
- `affiliate-model-gateway`;
- `affiliate-gateway`;
- `affiliate-agent-runner`;
- `mapping-producer-1`;
- `supply-reviewer-1`.

The six affiliate services remain in project `bracketiq-affiliate-governed`.
Do not expand the fleet. Preserve the five dormant governed containers,
retired legacy containers, PostgreSQL, Redis, Caddy, and unrelated timers.
No database migration is part of this source change.

Keep claim admission closed during preparation and deployment. Compile
role/prompt 10 into deployment contract 10. Keep the active Supply Contract,
model routing, account identities, credentials, mounts, and security profiles
unchanged. Use a new protected workload environment and new evidence folder.
Do not overwrite a canonical or previous workload environment.

Use current allowed policy and exact stored evidence before admission.
Refresh only existing intake/page URLs when needed. Do not discover or enqueue
new sources. Select eligible human-review mapping jobs first. Do not bypass
identity, policy, evidence, public-state, or active-owner holds to fill the
20-job limit. Count bounded child repair passes under their original job.

Independent review can approve the staged pending mapping. It must not
activate working mappings, publish listings, or enable automation. Preserve
current public and working data. After this batch, close claim admission and
stop `mapping-producer-1`, `supply-reviewer-1`, and `affiliate-agent-runner`.
Leave the site and control/model services in their deployed state.

### Version-10 production deployment and first-batch admission

Site CI run `34859085776` passed for
`ef097891a2fe6134b251bf96c54a2f3496707a70`. Governed image publication run
`34860487770` and site image publication run `34860488082` passed under the
user's production authorization.

The deployed immutable images are:

- Worker/model:
  `ghcr.io/razumly/bracketiq-affiliate-governed@sha256:1d55608f1b12dbbe3d07c79aee6b69fe8ceaab5969e9464c082db1cc491319f1`.
- Gateway:
  `ghcr.io/razumly/bracketiq-affiliate-gateway@sha256:a5a06595871b987308ab8d02d3a913e3db7acb838a7b9fbd680510a2611e3765`.
- Site:
  `ghcr.io/razumly/bracketiq-site@sha256:3f4bb677ebbcf310911de936ece139df0006196757773e2c5770534fc21999a3`.

Both governed images exported the exact reviewed role/prompt objects. The
deployment contract is version 10 with hash
`e5f92758ad708e415ffd86f03b1400373813100690b45f053db52962e0e2fa36`.
The active Supply Contract remains version 1 with hash
`c808492a7d60741b508978987441a0a31f59602a5e5321789d9865823f6098cf`.

The new protected workload is
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v10-existing-repair-first20-ef097891a`.
The private helper and evidence directory is
`/home/bracketiq/.config/bracketiq-affiliate-agents/omp-v10-repair-tools-ef097891a`.
Only image references, deployment contract, and preflight report changed in
the workload environment. Other environment values, routing, mounts, and
security settings matched the prior configuration.

The six affiliate containers were recreated without starting writers. Both
model services became healthy. The two model-account identity hashes stayed
unchanged, both access credentials were fresh, and broker refresh stayed
enabled. The site update replaced only `bracketiq-production/app`.
Internal and public database-readiness checks passed. The homepage and
onboarding surface rendered. The raw application icon loaded; its optimized
onboarding image did not load in the browser smoke check.

All 219 migration names were applied, with no unfinished migration. Twenty-three
historical checksums differ from the repository. Their files match the already
deployed Gateway, and the version-9 to version-10 source has no Prisma change.
No migration or migration-ledger change was performed.

The user paused after the site/model deployment. Gateway, runner, and repair
supervisors stayed stopped. The user then requested continuation. Fresh
preflight passed with no findings. Gateway started with admission closed.
Producer and reviewer containment probes passed with disposable workspaces.
Only the selected runner and two supervisors started and passed scoped
readiness. Unselected runtime identities and disabled legacy timers stayed
unchanged.

The initial human-review selection needed explicit existing page/run bindings.
Forty such jobs produced 28 eligible PREVIEW rows. Twenty were selected for
known-source refresh. The capture admission created exactly 20 marked runs.
The 15-minute preflight window expired after four requests. The remaining
16 runs stayed queued. Stopped-fleet evidence was renewed before processing
them. No safety check was weakened.

Refresh ended with seven SUCCEEDED, twelve PARTIAL, and one FAILED run.
Eighteen runs had the required fresh HTML/Markdown pair. Queensborough CC
(January Sessions) failed the rendered-content quality gate. The Austin Labor
Day Cup URL returned HTTP 404. Those two mapping jobs stayed held.

Capture preservation checks matched all selected intake, page, and mapping-job
hashes. All 2,821 published candidate rows and the empty Supply Target set
also matched. The Gateway then admitted the 18 freshly supported mapping jobs.
An exact-root controller runs only their producer/reviewer descendants with
one bounded lease per claim. It closes admission and stops the three repair
worker services when the batch ends.

The batch produced fourteen independently approved pending mappings. One
basketball description was rejected because it contained only a time range.
The producer repaired it in a bounded child claim, and the new reviewer
approved the corrected source description. One Hockey Camp reviewer process
ended without an accepted terminal result. The Gateway retained PROCESS_CRASH
and RETRY_WAIT. A fresh invocation on that same job succeeded under the
server's existing retry policy. The failed claim remains in the audit.

### Data-quality stop and correction boundary

An operator spot check found one false approval. Mapping job
`c4798a36-2a90-4b1b-b47c-1b8a3392d6f2` produced a CLUB candidate titled
`California, Georgia Tech, LBSU, and UCLA Add Flag Football Club Teams`.
Its description is a news article about four separate schools. Its action
URL is another article about Rutgers and Valparaiso, not an official club
action. It is not a valid single-club package.

The source is `e158d6c6-4a22-4d37-b424-126ffb166160`. Its pending mapping is
`agw-artifact-712b3c7d-fa6e-4f00-ab01-07f8cc659f05`. The completed reviewer
approval was not rewritten. The mapping remains inactive. An operator quality
hold is stored in `quality-hold-article.json` in the protected helper directory
and in `first20-batch.json`. The controller now refuses startup while that hold
exists. This is an operator hold, not a fabricated database review decision.

The controller drained the active review, closed admission, and stopped the
producer, reviewer, and runner. The current first-20 outcome is:

- Fourteen pending mappings are agent-approved and inactive. This count includes
  the invalid article package; do not treat all fourteen as accepted data.
- Football & Cheer Registration is human-held. Its producer reported an
  unsupported official-logo repair field and a locality extraction gap.
- Athletics, Buffs Bash, and the Play Big League Sports Ultimate Frisbee job
  remain admitted but unprocessed.
- Queensborough CC and Austin Labor Day Cup remain held after refresh.

The read-only preservation proof passed for all eighteen admitted source/root
pairs. Current source state matches the stored post-commit proof. Working
mapping and organization hashes are unchanged. Both protected public
replacements retain their working state. The 2,821 published candidate rows
retain hash `858274b7dec7d070f8d2f1665e672b22`, and there are still no Supply
Targets. Active claims and active job pointers are zero.

Current Gateway routes cannot correct the false approval safely. Existing-data
admission returns PENDING_REPAIR_PRESENT for the approved pending package.
Source-exclusion admission returns PARENT_RESULT_INVALID because that route
requires a supported producer-gap parent, not this completed package.
Do not bypass these gates or change production rows directly.

Further execution is blocked on a stronger entity/action review contract and
an audited post-approval correction path. The site, Gateway, and model services
remain deployed. Repair workers remain stopped. No listing was published and
no new-source discovery ran.

## Authorized version-11 quality correction


### Purpose and current state


The user selected `Fix gate and resume batch`. This authorizes a new reviewed
contract version, image publication, and deployment to the same seven named
runtimes. It also authorizes re-review of the fourteen staged packages and
completion of the three unprocessed jobs in the same first-20 selection.
Discovery, activation, and listing publication remain prohibited. Keep the
repair workers stopped until the version-11 source and deployment gates pass.

The code base is commit `7e4d9685b` on local main. The application source in
production is `ef097891a2fe6134b251bf96c54a2f3496707a70`. Use workstream
`workstream/existing-data-repair-quality`. Current pending mappings and review
results must remain immutable historical evidence; do not rewrite an old
approval to make it look as if the reviewer rejected it.

### Progress


- [x] Capture the invalid article package and its exact stored HTML.
- [x] Stop workers, close admission, and verify public/working preservation.
- [x] Obtain authorization for the revised contract and same-batch correction.
- [x] Add deterministic entity/action quality analysis and regression coverage.
- [x] Add audited operator correction admission and a protected correction hold.
- [x] Integrate validation, commit, approval, and version-11 role instructions.
- [x] Pass source tests and both independent code-review axes.
- [ ] Publish and deploy the revised images with fresh stopped-fleet evidence.
- [ ] Re-run the fourteen prior pending packages and the three unprocessed jobs.
- [ ] Stop workers and record final state and remaining human holds.

### Surprises and discoveries


The false CLUB package uses a page with explicit `og:type=article` and
JSON-LD `Article` metadata. Its candidate title names four colleges. Its
selected action anchor points to an unrelated news article. Current validation
checks non-empty title/action URL, source description, and sport evidence, but
does not check the document entity or the action's purpose.

The exact source HTML has SHA-256
`711296bca92f2ae5653b83dcd102036b2ccd2a87af25a6eb5d025bafed3f2f11`.
The local handoff is `local://quality-article-source.html`, with mapping data
at `local://quality-article-mapping.json`. Use a small stored-HTML regression
that preserves these structural signals. Do not make a new provider request.

### Decision log


Use a small deterministic entity/action analysis module. Reuse the DOM and
field-selection rules in `mappingExtractor.ts`; do not introduce a second
selector convention. Reject an explicitly identified primary news/article
document as a CLUB source. Do not infer source identity from a domain name or
a title keyword. Validate that each candidate's action comes from its own
evidenced link or canonical official page, not navigation or a related-story
link. Keep valid registration, membership, booking, and official-information
paths. Missing SEO metadata alone does not reject a plain club page. An
unevidenced action or contradictory document metadata remains a hold.

Use explicit work limits before expensive analysis. Allow at most 1000
candidates. Limit each analyzed title and action label to 512 UTF-16 code
units. Limit contextual evidence to 128 inspected DOM nodes and 1024 text
code units. An exceeded limit must produce a specific invalid quality report.
Do not truncate input and then accept it. Direct action evidence must not
trigger an unnecessary contextual scan. Context must label the selected link.
It must not come from another link or override a conflicting local label.

Put the server-produced quality report into the immutable validation evidence.
Recompute it at commit and independent approval. Update both producer and
reviewer instructions so they check one real entity and an appropriate action,
not just catalog sport and syntactic package validity. Advance role and prompt
versions to 11. Keep the active Supply Contract unchanged.

Use a separate operator correction admission, not a relaxed normal admission.
The correction starts a fresh bounded producer/reviewer cycle under the current
contract. This gives each of the fourteen prior packages current validation and
independent review. It can also renew the three never-claimed version-10 jobs.
Original mapping IDs still define the user's first-20 limit.

Correction must archive the exact old pending pointer and context in an
immutable operator audit. It must keep old mapping JSON, validation evidence,
producer results, and reviewer decisions unchanged. It may cancel only scoped,
non-active queued/retry-wait Gateway jobs, with an append-only cancellation
event. It must not cancel an active or unresolved effect.

Retire the old pending pointer only in the same transaction that installs
`existingDataRepairCorrectionHold` on both source and root and creates the new
admission. Every ordinary source activity and capture path must hold on that
metadata, including malformed or one-sided values. A valid new pending commit
removes the correction hold atomically while it installs the new pending
pointer. A producer gap leaves the correction hold in place. No working
mapping, organization, candidate, target, source identity, or automation field
may change during correction admission.

### Plan of work and interfaces


Add `apps/site/src/server/affiliateImports/entityActionQuality.ts` with
`analyzeAffiliateEntityActionQuality({ page, mapping, candidates })`. It returns
a versioned report with `isValid`, the observed document kind, and bounded
candidate-specific issues. It performs no network or database operation.
Use the existing `ScrapedPage`, `AffiliateScrapeMapping`, and
`AffiliateCandidateInput` types. Reuse the current public-action vocabulary
where it applies. Keep diagnostic labels separate from public descriptions.

Integrate that module in `agentGatewayAdapters.ts` at validation, commit, and
independent approval. The report must be derived from claim-owned HTML and the
same selected elements as extraction. Do not trust a producer-supplied boolean.
The article regression must fail even when the package has valid sport evidence,
valid source prose, and a syntactically valid absolute URL.

Extend `affiliateExistingDataRepairAdmission.ts` with
`previewAffiliateExistingDataRepairCorrection` and
`applyAffiliateExistingDataRepairCorrection`. They use the current admission
input and result shape. Correction reports add `operation: CORRECTION`,
`supersededMappingIds`, and `supersededGatewayJobIds`; those fields and complete
prior-state fingerprints bind the report hash. Normal admission remains strict.
Expose the pair only through operator POST `/existing-repair/correction`.
Require closed admission, exact selectors, current policy/catalog/contracts,
no active claims/pointers/effects, and an exact PREVIEW hash for APPLY.

Reuse the existing serializable admission transaction and exclusive activity
lock. Extend the current claim/audit proof rather than inventing a parallel
job-assignment path. Store the correction-hold key and its shape in
`affiliateExistingDataRepairState.ts`. The protected state hash excludes this
server-owned metadata, but actual hold identity and audit hashes remain
separately verified. A normal admission or capture may not bypass the hold.
The immutable context adds `correction.priorAdmissionHash` and
`correction.priorPendingMappingHash`. Historical contexts omit this field.
The current claim requires either the matching correction hold or the new
pending pointer from a valid current-contract commit. The existing pending
transition proof still checks the mapping, evidence, and protected state.

### Validation and acceptance


Run site commands from `apps/site`. The real article regression must reject the
old CLUB mapping. Direct club pages and proper official action links must still
pass. A related-story, navigation, wrong-candidate, or unevidenced URL must fail
with a specific quality issue.

Use the isolated PostgreSQL database for a complete correction workflow.
Begin with a version-10 approved inactive pending package. Correction PREVIEW
must make zero writes. APPLY must preserve the original approval and mapping,
hold source activity, and create a current-contract producer job atomically.
A stale pointer, active claim, unresolved effect, changed working state, or
replayed intent with changed actor/reason must make zero writes. Exact replay
must not create a second cycle. Prove that a never-claimed old-contract job is
superseded without deleting its history.

Prove a valid new producer commit and independent approval under version 11.
Also prove that the article cannot produce a valid CLUB package and stays
held without publishing or changing working data. Run the affected unit,
HTTP, and PostgreSQL suites, `npx tsc --noEmit`, targeted ESLint, and independent
Standards and Spec reviews from the fixed workstream base.

After deployment, use only governed correction admission for the exact
fourteen prior pending packages and three unprocessed jobs. Preserve the two
capture holds and the separate Football & Cheer contract gap unless supported
evidence and the authorized contract resolve them. Record every outcome.

### Idempotence, recovery, and outcome


Never clear the operator quality hold merely to restart the old controller.
Keep the hold until the revised correction route has superseded the flagged
pending package through its reviewed transaction. Use new immutable workload
and preflight artifacts for the next deployment. Do not overwrite the version-10
files. Close admission and stop the three repair-worker services at completion.
The site, Gateway, and model services stay in the final deployed state.

The first source gate passed on 2026-09-15. TypeScript and seven unit/API
suites passed with 334 tests. The PostgreSQL workflow passed against
`bracketiq_e2e_71_quality_correction` on the existing local database runtime.
All 219 migrations are current. The workflow checks a concrete club, an
UNCLASSIFIED predecessor, and a new article capture. It proves old approval
preservation, a stale-pointer rejection, actor-bound replay, a held article,
and valid new commits with independent review. The old queued job uses
`PIPELINE_BLOCKED` with `CORRECTION_SUPERSEDED`; its immutable subject and
evidence remain unchanged.

The earlier local test database contained orphaned CLAIMED jobs from old
smoke runs. The correction guard rejected that state. The new isolated
database avoids those rows without deleting them. Each fixture now uses a
unique policy domain. This prevents an expired policy from another run from
changing its result.

The temporary claim-binding probe is removed. The source gate found and fixed
the hold-to-pending transition for reviewer claims. A later gate passed 11
unit/API suites with 401 tests, three PostgreSQL suites with 61 tests, source
TypeScript, and targeted ESLint. The new and migrated test contracts passed a
focused Jest type check. The full Jest type project is not clean: the unchanged
base has 927 diagnostics in 206 files. Two added nullable-result diagnostics
were fixed. Do not report that broader type project as passing.

Independent review found further boundary cases. Fix the sibling-link and
conflicting-label context leaks, bounded text work, URL-resolved source holds,
verified redirect holds, and complete historical audit binding. Re-review
these fixes before publication. The database workflow now also proves a
limit-one mixed correction, a claimable admitted member, a retained evidence
gap, and exact replay after an unselected member becomes eligible.

The seventeen intended correction members still have their original refreshed
evidence. Fourteen have APPROVED inactive pending mappings. Three remain
UNCLASSIFIED and never claimed. Read-only production checks found zero active
claims, active pointers, unresolved jobs/claims/receipts, or running captures.
Use the exact pinned run/page selections in
`local://v11-correction-preview-request.json`, not an older intake lastRunId.

Local operator helpers are prepared under
`/var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/bracketiq-repair-v11.txRjV2KU2U`.
All eleven Python files pass a syntax check. An offline manifest smoke check
proved the seventeen-member scope, article-first order, replay with null row
Gateway IDs, unchanged original bytes, and cross-source rejection. The smoke
inputs and outputs are removed. No runtime operation ran during this check.
The live release config must use real published image digests and the observed
site image ID. Its source export must contain role/prompt version 11.

For first startup, use direct `preflight-v11.py` while Gateway is stopped.
Then use `start-v11-gateway.py` with the config and fresh report. The renewal
helper first closes admission on a running Gateway; use it only for a later
renewal. Correction report contractVersion/contractHash identify the active
Supply Contract, not deployment version 11. The controller separately checks
the current deployment hash and every live root's source/context binding.

Production correction and image publication remain pending. The deployed
version-10 repair workers remain stopped. Discovery, activation, and listing
publication remain prohibited.

The final reviewed source gate passed on 2026-09-15. All fifteen affected
suites passed with 491 tests, including the three real PostgreSQL suites.
Source TypeScript, the focused new/migrated Jest contracts, and targeted
ESLint passed. Both review axes have no remaining source findings. The
coherent pending-package mismatch failed before the immutable producer hash
comparison was added and passed after it. The exact stored article remains
invalid as a CLUB; its large unsupported action context also remains held.

Contextual action authority now uses only one unambiguous adjacent text label.
Container attributes and competing labels cannot authorize another link.
The selected anchor's own attributes remain direct evidence. URL hold checks
match identityKey, canonicalUrl, and the persistence pathKey fallback. The
verified redirect target is checked before deferred provider work and before
identity/link mutations. Existing hold metadata is not replaced.

The final live correction PREVIEW freshness scenario belongs to the controlled
rollout smoke. Exercise stale rejection before a fresh preflight renewal.
Then require a fresh zero-write PREVIEW before correction APPLY. No version-11
production job has been admitted or processed at this checkpoint.
