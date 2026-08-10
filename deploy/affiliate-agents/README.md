# Affiliate Codex agent containers

This Compose project defines 10 persistent mapper-loop containers, two reviewer containers,
and one coverage container. Each mapper keeps its own Git workspace and Codex
state. The reviewers share the read-only producer workspaces, but each reviewer
has its own loop lock and Codex state directory.

The tracked defaults limit a mapper to 1.25 CPUs and 4 GiB. They limit each
reviewer and the coverage worker to 1 CPU and 2 GiB. The memory-swap limit is
equal to the memory limit. This setting prevents new agent swap use. The
limits are ceilings. They are not reserved memory.

Each mapper claims work with `scripts/claim-affiliate-source-mapping.ts
--no-export` before it starts a Codex goal. An empty queue makes the mapper
wait for `AFFILIATE_MAPPING_LOOP_INTERVAL_SECONDS` (300 seconds by default),
so an idle worker does not start Codex or consume agent usage.

## Prepare the host

Copy `deployment.env.example` to an untracked `deployment.env`. Keep the
restart policy set to `no` while the fleet is paused. Confirm that every path
in the file exists. The second reviewer needs a separate Codex state directory
with the same authenticated Codex CLI configuration as reviewer 1.

Validate the resolved configuration before changing containers:

    docker compose --env-file deployment.env -f compose.yml config --quiet

Create stopped containers with the configured limits:

    docker compose --env-file deployment.env -f compose.yml create

This command does not start the agents. Inspect the stopped containers and
confirm their commands, mounts, networks, restart policy, and resource limits.

## Start or stop the fleet

Change `AFFILIATE_AGENT_RESTART_POLICY` to `unless-stopped` before a persistent
run. Start only after an operator explicitly authorizes queue processing:

    docker compose --env-file deployment.env -f compose.yml up -d

Stop the fleet without deleting workspaces, Codex state, or queue rows:

    docker compose --env-file deployment.env -f compose.yml stop

Set the restart policy back to `no` before recreating a deliberately paused
fleet. Do not remove a mapper workspace until its branch and generated source
package are preserved.
## Sport-evidence cutover and fleet stop boundary (2026-08-10)

The mapper, reviewer, and coverage containers are queue writers. Before a
cutover, stop all ten `mapper-*` services, both `reviewer-*` services, and
`coverage`; also stop the separately deployed model-controller timer/service.
Do not infer safety from an empty mapper claim. Coverage can requeue mapping
jobs, and the model controller claims the same mapping queue.

Every checkout must expose the same fleet contract before restart:
`contextContractVersion: 2`, `claimContractVersion: 1`,
`completionCasVersion: 1`, `approvalResultVersion: 2`,
`approvalCompletionCasVersion: 1`, `approvalEvidenceClaimVersion: 1`,
`coverageRepairCasVersion: 1`, `standaloneLiveApplyEnabled: false`, and
`strategyRevision: "sport-evidence-v1"`. Run the no-write
`affiliate:mapping:sport-contract` preflight from each stopped service; a
missing module, old command, stale checkout, or model image mismatch blocks
restart.

The normal mapper and model-agent live paths must claim one exact intake/run,
persist the injected live `Sports` snapshot, and complete through the shared
claim-generation CAS. `DEFAULT_SPORTS`, discovery hints, and generic sport
labels are not authority. Reconciliation is dry-run-first and requires the
reviewed count and selection hash for apply; it requeues only the same
identity-less terminal job, never writes candidates, and is idempotent.
Live package application is only inside validated v2 approval completion; the
former standalone apply command is intentionally absent.

Revision note (2026-08-10): Added coverage/model-controller stop boundaries,
fleet contract preflight, reconciliation guards, and approval-only live
application while retaining the container topology and host procedures.
