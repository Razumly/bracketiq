# BracketIQ affiliate mapping model VM

This directory deploys the open-weight affiliate mapping worker on a separate
OVH host. It does not deploy the BracketIQ web application and it does not
enable a live controller by default.

The steady-state target from the ExecPlan is one OVH VPS-4 with 8 vCores,
24 GB RAM, 200 GB NVMe, and 8 to 16 GB of emergency swap. Record the actual
order details in the local `deployment.env`; the tracked example deliberately
contains placeholders and is not purchasing authority.

## Security boundary

`model` runs the digest-pinned `llama.cpp` server with one slot, an 8,192-token
context, quantized KV cache, no Web UI, no built-in agent tools, and offline
mode. Its only network is an internal Compose network. Port 8080 is additionally
bound to host loopback for operator health checks. The model receives a
read-only model directory and one API-key file. It receives no database,
object-storage, Git, Codex, discovery-provider, email, or deployment credential.

`controller` is the trusted queue client. It can reach the model on the private
network and the approved database/storage endpoints on a separate egress
network. It mounts only `.git`, output, and worktree directories from the host.
Generated work remains in a detached worktree for review. The controller stops
at `REVIEW_REQUIRED`; it does not push, approve a mapping, enable schedules, or
publish candidates.

## Build and pin the controller

Build from the monorepo root at the exact commit that will be written to
`CONTROLLER_BASE_COMMIT`:

    docker build -f apps/site/deploy/ai/Dockerfile.controller \
      -t ghcr.io/razumly/bracketiq-affiliate-agent:<40-character-commit> .

Push it through the approved registry workflow, resolve the registry digest,
and put the full `image@sha256:...` reference in `deployment.env`. Do the same
for the selected `llama.cpp` server image. Floating tags are rejected by
`bin/verify-host.sh`.

## Prepare the host

Clone `Razumly/bracketiq` at the exact controller commit into `/opt/bracketiq-ai/repository`. Set `REPOSITORY_GIT_DIRECTORY` to that checkout's `.git` directory. Create:

    /etc/bracketiq-ai/model-api-key
    /etc/bracketiq-ai/model-manifest.json
    /var/lib/bracketiq-ai/models
    /var/lib/bracketiq-ai/output
    /var/lib/bracketiq-ai/worktrees

The API-key file contains one randomly generated key and must have mode `0600`.
Copy the selected local model artifact into the model directory, verify its
published hash independently, then record the exact filename and SHA-256 in
`deployment.env`. Copy and fully review `model-manifest.example.json` into the
manifest path; its tracked false approvals and zero hashes deliberately fail
host verification. Copy `deployment.env.example` to `deployment.env` and
`controller.env.example` to `controller.env`; both real files stay untracked.
Set `controller.env` and the completed manifest to mode `0600`.

The operator must also record the OVH order id, order date, region, image id,
monthly price, renewal price, tax, and backup inclusion before starting the
service. This makes the budget decision auditable instead of relying on the
dated advertised price in the plan.

Run the read-only checks:

    ./bin/verify-host.sh
    docker compose --env-file deployment.env -f compose.yml up -d model
    ./bin/verify-model.sh

`verify-model.sh` sends a deterministic blocked-policy JSON prompt and writes a
report with llama.cpp prompt/output throughput under
`/var/lib/bracketiq-ai/output/model-verification`. The full
base-model bakeoff still must measure representative prompt/output throughput,
peak resident memory, and job completion time. A model fails the plan's
capacity gate if it exceeds 22 GB resident memory, sustains more than 512 MB
swap, leaves less than 1 GB available memory, or needs more than 90 minutes for
a representative source.

For the real held-out evaluation, place the private suite below the mounted
output directory and run the credential-isolated evaluator profile:

    docker compose --env-file deployment.env -f compose.yml \
      --profile evaluator run --rm evaluator \
      --suite=/workspace/apps/site/output/private/held-out-v1.json \
      --output=/workspace/apps/site/output/bakeoff/<candidate>/evaluation.json

Unlike `controller`, `evaluator` receives no database or object-storage
environment and has only the internal model network. Fill
`runtime-observation.example.json` from measurements on the same run, then use
the repository bakeoff record and selection commands. Do not put the private
suite or its gold drafts in Git.

## Controller modes

`CONTROLLER_MODE=disabled` is the default and refuses to run.

Use `dry-run` first, with
`AFFILIATE_MAPPING_DRY_RUN_SOURCE_KEY` in `controller.env`. Dry-run exports
evidence without claiming a queue job. `AFFILIATE_MAPPING_REVIEW_SCRAPE=true`
is accepted only in dry-run mode and only with a disposable local database.

Use `queue` only after the model bakeoff and explicit live-evidence
authorization. One invocation claims at most one job and exits. Install the
systemd units only after a manual dry-run succeeds:

    sudo install -m 0644 systemd/bracketiq-affiliate-model.service /etc/systemd/system/
    sudo install -m 0644 systemd/bracketiq-affiliate-controller.service /etc/systemd/system/
    sudo install -m 0644 systemd/bracketiq-affiliate-controller.timer /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now bracketiq-affiliate-model.service
    sudo systemctl enable --now bracketiq-affiliate-controller.timer

Disable the timer to pause queue processing without affecting intake, the web
application, existing source mappings, or manual Codex mapping:

    sudo systemctl disable --now bracketiq-affiliate-controller.timer

Removing this stack is reversible. Stop the timer and model service, retain the
model manifest, hashes, output reports, and job worktrees, then remove only the
containers. Do not delete queue rows or training artifacts to roll back.
## Current controller contract and stopped-fleet boundary (2026-08-10)

The separate model controller is a live mapping-queue writer, not merely a
model container. Keep `CONTROLLER_MODE=disabled` and the systemd timer stopped
while mapper/reviewer/coverage cutovers or reconciliation are in progress.
Before enabling it, update the repository and digest-pinned controller image
from the exact implementation commit and run the no-write
`affiliate:mapping:sport-contract` command inside the image. Its output must
match the Compose fleet contract: context v2, claim/completion CAS versions,
approval result/completion/evidence versions, coverage repair CAS version,
`standaloneLiveApplyEnabled: false`, and strategy revision
`sport-evidence-v1`.

Queue mode must use the shared claim/export/context/completion service. It
persists one exact intake/run and injected live `Sports` snapshot before model
execution, emits v2 evidence-backed determinations, and cannot use
`DEFAULT_SPORTS`, discovery hints, or generic labels as authority. A stale
catalog or claim generation fails closed. The controller cannot approve,
publish, enable recurring scraping, or invoke a standalone live-apply path;
live package execution occurs only inside validated v2 approval completion.

Historical sport repair is a separate dry-run-first reconciliation command.
Require the reviewed selection hash and expected count for each apply, requeue
only eligible same-job terminal rows, and verify a zero-write idempotent
rerun. Stop and preflight all Compose mapper/reviewer services and `coverage`
as well as this controller before any apply or queue restart. Preserve model
manifests, output, worktrees, and reconciliation reports when rolling back;
never start an old controller against new queue contracts.

Revision note (2026-08-10): Added digest-pinned controller preflight, shared
claim contract, approval-only execution, reconciliation, and full stopped-fleet
rules without removing prior model security and capacity guidance.
