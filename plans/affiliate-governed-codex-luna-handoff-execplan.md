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
- [ ] Run governed preflight and one bounded mapping canary. The fleet passed preflight. The canary opened admission but found no claimable governed mapping job.
- [ ] Verify terminal result and review state. Blocked because no governed claim ran.

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

## Change Note

Created after correcting the model execution assumption. The current production agents use Codex CLI with Luna authentication. The earlier open-weight model VM interpretation was removed from the active rollout path.
