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
- [ ] Obtain two fresh interactive account logins into the dedicated broker store.
- [ ] Verify both accounts and the production-equivalent runtime before another claim.
- [x] (2026-09-07) Record conditional `AUTH SETUP` approval: after source review/checks, publish governed affiliate OMP images and start only the broker, gateway, and two temporary login helpers; keep existing Gateway/workers unchanged and do not restart mapping claim, RootRunner, or workload.
- [ ] Obtain later separate approval for workload Linux/root-runner/canary deployment.
- [ ] Deploy the approved images after a fresh preflight.
- [ ] Run the one-job mapping and independent review canary. Preserve its receipts and hold.
- [ ] Integrate and push the source changes. Update Issue 70 with measured results.
## Current approval record

Conditional `AUTH SETUP` approval (recorded 2026-09-07): after source
review/checks pass, publish the governed affiliate OMP images and start **only**
`affiliate-model-auth-broker`, `affiliate-model-gateway`, and two temporary
login helpers. Existing BracketIQ Gateway and workers must stay unchanged. No
mapping claim, RootRunner, or workload restart is authorized by this approval.
Workload Linux/root-runner/canary deployment requires later separate approval.
This is not authorization to start anything before the source review/checks
pass.


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

## Outcomes & Retrospective


The source is implemented, verified, reviewed, and pushed. The approved images are published, and the OMP auth broker is healthy. Two browser logins, model-gateway startup, and model checks remain pending. The workload runtime and canary still require separate approval. No runtime change is authorized by this plan alone; only the explicit approval record permits the completed auth setup operations.

## Context and Orientation


The working tree is `/Users/elesesy/StudioProjects/bracketiq-affiliate-collection`, on `workstream/affiliate-legacy-admission`. The canonical repository is `Razumly/bracketiq`. `apps/site` owns the backend. Run npm and TypeScript commands from that directory. Do not change the mobile build graph.

`apps/site/scripts/run-affiliate-agent-runner.ts` is the privileged runner. It verifies signed Unix-socket requests, creates private per-invocation cgroups, drops to a child UID, bounds stdout and stderr, and proves process cleanup. Before this cutover, it seeded `.codex/auth.json` and started `codex exec`. The OMP source removes that path. Existing bounded diagnostic changes in this runner and `apps/site/scripts/__tests__/runAffiliateAgentRunnerDiagnostics.test.ts` remain.

`apps/site/src/server/affiliateImports/agentSupervisor.ts` builds the child launch request and confirms terminal submissions. `apps/site/scripts/run-affiliate-agent-supervisor.ts` implements the HTTP Gateway client and workspace ownership. The Gateway operation endpoint is the configured path prefix plus `/perform`. Its request has a fixed `kind`, trusted claim `authorization`, and operation-specific fields.

`apps/site/src/server/affiliateImports/agentGatewayContracts.ts` owns current role contracts, prompt hashes, claim schemas, terminal schemas, and execution classes. `apps/site/src/server/affiliateImports/affiliateFleetCutover.ts` and the preflight script verify the deployment. `apps/site/deploy/affiliate-governed/compose.yml` and its Dockerfiles define the private runtime. The existing Codex sandbox profiles enabled namespaces for bubblewrap. Reassess them for OMP; do not retain unnecessary namespace privileges only to preserve old hashes.

The already admitted Gateway job is `d7a1fe71-c76e-4191-a3f3-610c737d683e`. Its legacy mapping job is `50957179-8e51-42f0-a0db-2fc4791bdc79`. Its Supply Source is `a8764a56-2da2-4382-82d1-eee317b05143`. The last recorded state is `RETRY_WAIT`, with two failed invocations, lifecycle generation 1, `PRE_MAPPED`, and `LEGACY_SPORT_REPAIR`. Admission is closed and canary workers are stopped. The prior admission report hash is `778e0233ecb85e4424c4238026511ef6f7bc6871fc8ffc045970ff1b345219b0`. Do not admit another source. Do not remove the hold.

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

The new bearer preparation module parses with the pinned Bun transpiler. Both shell entrypoints pass syntax checks. The two-account wizard is `/tmp/issue70-omp-login.sh`, mode `0700`; it has not been executed. ShellCheck is not installed. These source checks ran before the approved image publication and broker startup recorded below.

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
It runs as `1003:1003`, reports Bun `1.3.14` and OMP `18.1.13`, and has zero
stored ChatGPT accounts. The model gateway remains `created`, not running;
its ID is `ddff3bf5ba780f7d75e301463473966e422ddf44d9316c91d48315b25617a10e`.

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

The operator must now run the local `/tmp/issue70-omp-login.sh` wizard with
the exact agent image, broker container ID, and broker volume above. Both
browser logins are still pending. Start the model gateway only after those
logins complete, then verify account health and the exact Luna model.
The existing BracketIQ Gateway remains healthy. Mapping workers, the root
runner, coverage, and replenishment were not started or reconfigured.
No new mapping claim ran.
