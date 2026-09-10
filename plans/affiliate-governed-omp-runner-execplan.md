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
