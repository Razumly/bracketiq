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

The former `controller` service was a live queue writer and is retired. Its
systemd service, timer, launcher, and controller-only environment are included
in the governed legacy-retirement inventory. Do not install, enable, or run
those paths. The retained Compose stack contains only `model` and the
credential-isolated `evaluator`; neither can access the production database or
object storage.

## Build and pin the evaluator image

Build the evaluator image from the monorepo root through the approved registry
workflow. The image is retained for the private, credential-isolated model
bakeoff; it is not a queue worker:

    docker build -f apps/site/deploy/ai/Dockerfile.controller \
      -t ghcr.io/razumly/bracketiq-affiliate-agent:<40-character-commit> .

Resolve the registry digest and put the full `image@sha256:...` reference in
`deployment.env`. Do the same for the selected `llama.cpp` server image.
Floating tags are rejected by `bin/verify-host.sh`.

## Prepare the host

Create only the retained model and evaluation directories:

    /etc/bracketiq-ai/model-api-key
    /etc/bracketiq-ai/model-manifest.json
    /var/lib/bracketiq-ai/models
    /var/lib/bracketiq-ai/output

The API-key file contains one randomly generated key and must have mode `0600`.
Copy the selected local model artifact into the model directory, verify its
published hash independently, then record the exact filename and SHA-256 in
`deployment.env`. Copy and fully review `model-manifest.example.json` into the
manifest path; its tracked false approvals and zero hashes deliberately fail
host verification. Copy `deployment.env.example` to `deployment.env`; the real
file stays untracked. Set the completed manifest to mode `0600`.

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
The evaluator wrapper invokes the retained read-only
`scripts/evaluate-affiliate-mapping-agent.ts` entrypoint directly; it does not
depend on a removed package alias. Set its digest-pinned image through
`EVALUATOR_IMAGE`.

Unlike `controller`, `evaluator` receives no database or object-storage
environment and has only the internal model network. Fill
`runtime-observation.example.json` from measurements on the same run, then use
the repository bakeoff record and selection commands. Do not put the private
suite or its gold drafts in Git.

## Retired controller boundary

The former `controller` Compose profile, `CONTROLLER_MODE` settings, systemd
service, timer, launcher, and `controller.env` are retired. Do not install or
enable `bracketiq-affiliate-controller.service` or
`bracketiq-affiliate-controller.timer`, and do not invoke the removed
controller launcher. Live queue admission and completion belong exclusively to
the governed Agent Gateway deployment in
`apps/site/deploy/affiliate-governed/README.md`.

The retained model service may be started only for the read-only model
verification and private evaluator workflow above. It has no queue, database,
or object-storage credentials. Preserve model manifests, hashes, output
reports, and evaluation artifacts when removing the retired controller; never
restore an old queue writer beside the governed fleet.
The historical controller contract and sport-repair notes are retained in
repository history only. They do not authorize a live writer or override the
governed Agent Gateway cutover boundary.
