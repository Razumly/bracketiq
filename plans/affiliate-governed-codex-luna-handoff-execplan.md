# Wire Codex Luna authentication into the governed affiliate runner

This ExecPlan is a living document. It follows `PLANS.md` and records the implementation and deployment of the governed Codex CLI authentication handoff.

## Purpose / Big Picture

The affiliate mapping agents must use the existing Codex CLI and Luna model family. The current governed runner launches Codex in a fresh per-invocation `CODEX_HOME`, so it cannot use the existing Codex authentication stored on the production host. This change will seed a reviewed Codex authentication file into each isolated invocation, select the Luna model explicitly, retain gateway claims and runner containment, and allow one bounded mapping canary for the 306 requeued sport-review jobs.

## Progress

- [x] (2026-09-01) Confirmed the existing Codex authentication mode is ChatGPT-style and the model cache contains `gpt-5.6-luna`.
- [x] (2026-09-01) Confirmed the governed runner used an OpenAI-compatible handoff before this change; it now uses seeded Codex ChatGPT auth.
- [x] (2026-09-01) Requeued 306 sport-only terminal mapping jobs through the reviewed live reconciliation path.
- [x] Define and implement the Codex auth seed and explicit model handoff.
- [x] Add focused runner, fleet, schema, and Compose contract tests.
- [x] Build the changed governed agent image locally.
- [x] Publish the changed governed agent image.
- [x] Install the reviewed Codex auth seed on the production host without printing values.
- [x] Create the private governed deployment environment and run governed preflight.
- [x] Implement bounded legacy admission and claim-bound sport validation.
- [x] Verify TypeScript and 501 tests across 14 focused suites.
- [x] Complete Standards and specification reviews with no remaining known findings.
- [x] Provision and verify governed database roles after separate operator approval.
- [x] Verify a stable live read-only preview and exact stored artifact bytes.
- [ ] Complete the bounded mapping canary. One job is admitted; the first invocation failed and the verified runtime fixes are ready for deployment.
- [ ] Verify a productive terminal result and independent review state.

## Surprises & Discoveries

- The repository contains an optional `apps/site/deploy/ai` open-weight `llama.cpp` plan. That plan is not the current Luna Codex execution path.
- Existing legacy Codex homes contain `auth.json` with `auth_mode: chatgpt`; the model cache contains `gpt-5.6-luna`.
- The legacy Compose fleet is retired and its launchers exit with the legacy-retirement status. It cannot be used as the governed canary.
- The governed runner must join the reviewed egress network because Codex CLI uses its ChatGPT authentication path, not a local model relay.
- The 306 requeued legacy mapping jobs are not governed gateway jobs. The current
  458 `QUEUED` rows have null `supplySourceId`, `sourceId`, and `mappingId`.
  The governed claim path requires a queued `AffiliateAgentGatewayJobs` row with
  supply lineage and evidence. The bounded canary therefore opened admission but
  produced no claim. Do not synthesize lineage; define and review a migration or
  enqueue contract first.
- The continuation read-only inventory found zero Supply Source roots. Of the
  306 sport-requeued jobs, 79 reference a source and mapping that still exist.
  Only 56 also match the intake source key. All 306 have stored HTML rows.
- The active policy targets Portland–Vancouver soccer events. The operator
  selected backlog repair first. This does not authorize national publication
  or automatic scraping.

## Decision Log

- Decision: Use the existing Codex CLI authentication path rather than provision a local model server.
  Rationale: The production agents use Codex CLI and Luna. The open-weight model VM is unrelated to this execution path.
  Date/Author: 2026-09-01 / Main agent.
- Decision: Keep the governed gateway, supervisor, runner, claim, and workspace controls.
  Rationale: The legacy path gives workers direct production database and provider access. The rollout must not revert to that path.
  Date/Author: 2026-09-01 / Main agent.
- Decision: Seed auth into the isolated invocation workspace and pass an explicit model name to Codex.
  Rationale: The current runner creates a fresh `CODEX_HOME`; a read-only host auth mount cannot be used by the child without a controlled per-invocation copy. Explicit model selection prevents a default-model drift.
- Decision: Give only the root runner reviewed egress access for Codex CLI.
  Rationale: ChatGPT-authenticated Codex CLI must reach its hosted model service. The runner still has no production backend network, provider keys, or role credentials. Supervisors remain internal-only.
  Date/Author: 2026-09-01 / Main agent.
- Decision: Repair the 306-job backlog through a bounded, preview-first gateway
  operation. Admit only an exact existing source, mapping, intake, and evidence
  run. Hold missing or conflicting identities. Preserve all archived results.
  Rationale: Existing reconciliation is global and does not recover package
  identity or enqueue producer jobs. A worker restart cannot fix this.
- Decision: Carry the current sport catalog and stored run into repair claims.
  Verify source citations and resolved sport output before package commit.
  Hold activation and publication for these repair jobs.
  Rationale: The current governed selector package lacks the legacy sport
  evidence checks. Starting it unchanged would bypass the sport repair contract.

The runner, Compose, preflight schema, and contract tests now use the existing
Codex CLI ChatGPT authentication path. The changed runner image and gateway
image are published to GHCR with immutable digests. The gateway now uses the
existing reviewed production SMTP and admin-email path for operational alerts;
a mobile alert channel remains future work. Independent runtime inventory and
legacy-process manifest artifacts passed preflight. The gateway was verified
healthy. A bounded mapping admission opened successfully, but no governed
gateway mapping job was queued because the requeued legacy mapping rows have
no supply lineage. Admission was closed and the canary workers were stopped.

## Context and Orientation

`apps/site/scripts/run-affiliate-agent-runner.ts` is the root runner. It creates an isolated workspace, starts `codex exec`, and limits the child environment. It now requires `AFFILIATE_AGENT_CODEX_AUTH_SEED` and `AFFILIATE_AGENT_CODEX_MODEL`. It validates the reviewed ChatGPT auth shape, copies `auth.json` into the workspace, and starts Codex with the explicit model.

`apps/site/deploy/affiliate-governed/compose.yml` defines the governed runner and supervisors. The runner has no production database network. It joins the internal gateway network and the reviewed egress network. It receives the read-only auth seed mount and model setting. The supervisors authenticate to the Agent Gateway with role credentials and runner protocol keys.

## Plan of Work

Add a runner configuration value for the read-only Codex auth seed path and a required explicit Codex model name. Validate that the auth seed is a regular file, is not a symlink, is readable by the root runner, and is copied into the invocation-owned `.codex/auth.json` with mode `0600`. Do not copy unrelated Codex state, caches, sessions, or logs.

Replace the child OpenAI-compatible model environment handoff with the Codex auth seed and explicit `--model` argument. Preserve the existing allowlist for gateway claim variables and the existing process containment. Keep one child per invocation.

Update the governed Compose file and deployment example. Mount the private auth seed into the runner as read-only. Use the existing reviewed production SMTP and admin-email path for gateway operational alerts until a dedicated webhook or mobile channel is approved. Do not mount alert credentials into supervisors, the runner, the Codex child, or legacy workers. Remove obsolete model-relay requirements from the governed Compose contract if the implementation no longer uses them.

Add focused tests for auth-file validation, mode and copy behavior, child `CODEX_HOME`, explicit model argument, and rejection of symlink or missing auth seeds. Do not run provider calls in unit tests.
Build the governed image locally, then publish it by immutable digest when a
registry credential with `packages:write` is available. Install the private
Codex auth seed and generated internal credentials on the production host
through the private environment procedure. Keep the legacy Compose project
stopped and its timers disabled.
Run the governed gateway and worker preflight with admission closed. Start one mapping producer and open one bounded claim. The current legacy mapping queue cannot satisfy the governed claim contract: its requeued rows have no supply source, source, or mapping identity, and no `AffiliateAgentGatewayJobs` rows exist. Record this blocker, close admission, and stop the canary workers. Do not enable coverage or replenishment services.

## Concrete Steps

Run source tests and type checks from `apps/site` after the implementation. Build the governed image and publish it by immutable digest. Resolve the governed Compose configuration with redacted output and verify that only the runner receives the auth seed mount and that workers receive role credentials and runner protocol keys.

On the production host, create a private auth seed copy from the existing approved Codex home. Verify file ownership and mode without printing contents. Generate internal role and runner credentials only when the private deployment environment is ready to consume them.

Run the gateway health and readiness checks. Open exactly one mapping-producer admission lease. The observed canary had no claim because the governed gateway job queue was empty. Close admission and stop the canary workers. A reviewed migration or enqueue contract is required before a terminal receipt can be produced.

## Validation and Acceptance

The runner unit tests must prove that a valid auth seed is copied into the invocation-owned `.codex/auth.json`, that the child receives `CODEX_HOME` pointing to that directory, and that the child command contains the explicit Luna model. Tests must prove that missing, symlinked, or unreadable seed files fail closed.


The production preflight showed the changed immutable agent image, the reviewed deployment contract, healthy gateway, fresh report, and no legacy worker. The bounded canary opened admission but produced no gateway job or claim. The 458 legacy `QUEUED` mapping rows, including the 306 requeued rows, have null `supplySourceId`, `sourceId`, and `mappingId`. No unapproved candidate or event was published.

## Idempotence and Recovery

Auth seed installation is exclusive and must refuse to overwrite an existing reviewed file. Re-running preflight is read-only. Admission close is safe to repeat. If the canary fails, keep workers stopped, preserve the gateway receipt and runner cleanup evidence, and retry only after a fresh preflight. Do not requeue the 306 jobs again; the sport reconciliation marker makes that operation idempotent.

- The complete current site source was transferred to the production operator
  checkout before the final image build. This avoids building from the older
  operator checkout revision.
- The runner image is published as
  `ghcr.io/razumly/bracketiq-affiliate-governed@sha256:13ec32f5a9f442040f095d1b0f38c4ea2963e7e9d38c15813fd9614d652c2034`.
- The gateway image is published as
  `ghcr.io/razumly/bracketiq-affiliate-gateway@sha256:c8cf41e461490123d01d17871b88b8122d90c0935cfd85037537175936ec5ffa`.
- The production host has the reviewed auth seed at
  `/home/bracketiq/.config/bracketiq-affiliate-agents/codex-auth.json` with
  mode `0600`.
- A private governed deployment environment exists at
  `/home/bracketiq/.config/bracketiq-affiliate-agents/governed-deployment.env`
  with mode `0600`. It uses the existing production SMTP path and the default
  admin notification recipient for operational alerts. The Compose project
  created the governed fleet. Gateway was healthy during the canary; the
  mapping producer, supply reviewer, and runner were stopped after the bounded
  canary found no claimable governed job.
- The sport reconciliation artifacts are stored on the production operator
  checkout under `apps/site/output/affiliate-sport-reconciliation/preview.json`,
  `applied.json`, and `post-apply.json`. The apply result contains 306 writes,
  and the post-apply preview reports zero eligible rows and 306 already
  reconciled rows.

## Interfaces and Dependencies

The runner configuration must expose one explicit model name and one private auth seed path. The runner must keep the existing Unix-socket protocol, signed runner requests, cgroup containment, workspace ownership, and terminal submission framing.

The governed Compose file must mount the auth seed read-only into the runner only. Supervisors must continue to use the Agent Gateway role credential and runner protocol private key. The gateway remains the only service with production database and provider credentials.

## Continuation milestones

First, add a bounded legacy repair admission module. Preview must be read-only.
It must classify all sport-requeued rows and hash the proposed writes. Apply
must require the reviewed hash, a bounded job selection, active contracts,
closed admission, no active claims, and a fresh preflight. It must repeat the
identity checks in one transaction. It may create a PRE_MAPPED root and exact
links, but must not infer approval from the historical result. It must create
one deduplicated gateway job with real stored artifact keys and hashes.

Second, add sport evidence to backlog repair claims and packages. Use the
existing catalog snapshot and sport-determination validators. Reject stale
catalogs, missing citations, and sport output that differs from resolved
determinations. Keep ordinary producer history readable. A repair job must not
reach activation or publication.

Third, verify the new behavior locally. Produce a real preview on the VPS.
Review the exact proposed changes before apply. Start one producer and one
independent reviewer only for the bounded canary. Record terminal receipts and
close admission. Missing identities remain held with explicit reasons.

## Outcomes & Retrospective

The prior image rollout proved runtime health but not mapping execution.
The continuation must prove identity recovery, claim admission, sport
validation, and independent review before it reports operational success.

Continuation note: The operator selected backlog repair over the Portland
discovery canary. Keep the active publication cohort unchanged.

## Continuation review record

Review base: `a877f70c849298c1eb1f0362209a7ff2c4badbfd`.
Standards and specification reviews run separately for admission and sport
validation. Production apply remains prohibited while a finding is open.

The first real read-only preview reached all 306 sport-requeued jobs. It exposed
a false live-state check: an active mapping pointer is not proof of publication
or validation. Of 79 linked mappings, only six have `validatedAt`; only two
sources have automatic scraping enabled. The corrected checks use actual public
surfaces and preserve private, unlisted CLUB drafts.

All reported findings are fixed, re-reviewed, and verified. These include sport
reason codes, durable repair holds, atomic approval catalog checks, exact intake
and artifact ownership, scoped replay, global active-claim exclusion, preserved
root metadata, and legacy claim exclusion. TypeScript and 465 tests pass.

The current read-only preview has five eligible jobs and 301 held jobs. The
reviewed report hash is
`778e0233ecb85e4424c4238026511ef6f7bc6871fc8ffc045970ff1b345219b0`.
It selects mapping job `50957179-8e51-42f0-a0db-2fc4791bdc79` for Mission Valley
CYO League. Its source and mapping already exist. Both selected artifacts match
their stored byte hashes, sizes, intake, and capture run.

The operator authorized publication of the verified governed images, deployment
contract version 2 with hash
`44361110db17d73ab9d70cf0b827d4c51e85f085f7538c3db2afc469be28ec39`,
and this one-job apply and canary. The application, coverage, publication, and
automatic scraping remain outside that operation.

The actual database audit found the governed group roles missing. After separate
approval, the DBA transaction created the three non-login roles and preserved
existing login access before removing PUBLIC connection and schema usage.
The agent role has no effective connection, schema usage, table writes, or role
memberships. The application login still connects. Evidence is stored under
`/home/bracketiq/.config/bracketiq-affiliate-agents/issue70-provision-roles.sql`
and `issue70-role-provision-output.txt`, both mode 0600. Do not use the old
fixed-boolean inventory as proof of permissions.

The complete stopped-fleet inventory contains 25 processes, including 20 legacy
container or systemd entries. It found one abandoned discovery run,
`aa588b87-115d-4192-9397-f2b01c8ef0e1`, still RUNNING since 2026-08-15.
The operator separately authorized scoped stale-run recovery without changing
the campaign schedule, and resetting only the recorded failure of the disabled
intake service. The service is now disabled, inactive, and has MainPID zero.
The recovery module accepts an exact `runId` with `requeueCampaign: false`.
Recovery uses ownership/state compare-and-set and one transaction.

The protected pre-apply database backup is
`/home/bracketiq/.config/bracketiq-affiliate-agents/pre-legacy-repair-336c08594.dump`.
Its SHA-256 is
`3f29a00cc609465cc9f8a76fa433d3018abf582439063d1af19d2f9d4919a092`.
Do not omit the abandoned run from preflight evidence before recovery.

## Runtime compatibility findings

The first admitted gateway job is `d7a1fe71-c76e-4191-a3f3-610c737d683e`.
It references mapping job `50957179-8e51-42f0-a0db-2fc4791bdc79` and held Supply
Source `a8764a56-2da2-4382-82d1-eee317b05143`. An exact admission replay returned
zero writes and the original report hash. No second job was admitted.

Claim `agw-claim-08d33de3-2b68-4734-ad19-89e0a3b60a81` failed with PROCESS_CRASH.
The job remains RETRY_WAIT with one recorded invocation failure. Preserve this
history. Admission is closed and the canary workers are stopped during repair.

A real HTTP decoder regression reproduced an extra `receiptId` in the gateway
reconciliation response. The server now returns exactly the declared
reconciliation result. The stored receipt still retains its ID.

The pinned Codex sandbox failed to create namespaces under Docker defaults.
After separate operator approval, task agents prepared runner-only seccomp and
AppArmor profiles. Independent security review found no actionable issue in the
reviewed delta. Seccomp retains the exported Docker baseline and adds exact
namespace clone/unshare flags plus namespace mount setup. AppArmor retains the
proc/sys and socket protections. No SYS_ADMIN, privileged mode, unconfined
profile, or global kernel setting was added.

The approved canonical seccomp hash is
`624a3cdf758efb74cd6de9c956ac344d99bf2255a5fc1e4bdf8df91a3550bf7a`.
The AppArmor file hash is
`19d5f94168ee26a8107fb75e391fe08003457734c2394829c4b6c25bc63f28ee`.
Both are bound by preflight. The named AppArmor profile is enforcing.

The credential-free sandbox smoke passes with the production noexec/0710
workspace mount, CPU/memory/PID limits, UID separation, and capabilities. It
proves workspace writes, denial of a DAC-writable sibling, NoNewPrivs=1, and
zero effective child capabilities. Reviewer mode also proves root write denial
and private temporary writes. The supervisor prepares read-only policy mount
targets before locking reviewer roots. The CLI excludes the global /tmp path.

Task-authored diagnostics retain only an 8 KiB stderr tail in memory. Logs
contain fixed failure signals and bounded counts, never stdout/stderr contents,
tokens, or token hashes. TypeScript and all 501 focused tests pass.

## Change Note

Created after correcting the model execution assumption. The current production agents use Codex CLI with Luna authentication. The earlier open-weight model VM interpretation was removed from the active rollout path.
