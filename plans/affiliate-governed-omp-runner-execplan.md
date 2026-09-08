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


The approved OMP runtime completed the initial canary and the later two-source trial without invocation failures. All three results were `CONTRACT_GAP`. No mapping package or independent reviewer job was produced. The two-source trial did not repair the records. Its old organization values and candidates remain unchanged. Admission is closed. Both trial workers and the root runner are stopped. The Gateway, model gateway, and auth broker remain healthy. Repair holds and prior history remain intact. Two accounts passed health checks; account rotation was not measured.

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
