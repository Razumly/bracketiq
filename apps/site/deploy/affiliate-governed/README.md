# Governed affiliate fleet

This Compose project defines the reviewed five-worker topology plus one
protected replenishment-controller cadence client:

- Two Mapping Producers.
- Two Supply Reviewers.
- One Coverage Planner.
- One replenishment cadence client that can only invoke the gateway's
  authenticated replenishment operation.

Each worker uses one claim through the governed supervisor command. Supervisors
attach only to `gateway_internal`. The root runner also joins
`model_client_internal`. It has no public egress or production backend route.
Supervisors and the runner receive no production database, object-storage,
capture-provider, repository, or OAuth credential.

The runner permits one active invocation. It owns the private socket and
cgroup cleanup. It starts the fixed `affiliate-omp-agent` executable as
`1002:1001`. The child receives one claim token and an OMP model gateway bearer.
It receives no supervisor, operator, auth broker, or provider credential.
The trusted OMP SDK driver exposes only claim-bound Gateway tools.

The BracketIQ Agent Gateway joins three networks: `gateway_internal` for worker and cadence
client traffic, `production_backend` for the reviewed PostgreSQL service, and
the separate `gateway_egress` network for reviewed object-storage and provider
endpoints. The production Compose project owns `production_backend` as an
internal network named `bracketiq-production_backend`; only the gateway
attaches to that backend network. The replenishment cadence client attaches
only to `gateway_internal` and has no database route. No governed worker joins
the backend. No gateway port is published to the host; `expose: 8080` is
container-network visibility only. No service in this project publishes a host
port.
Obtain separate, current authorization from an authorized human immediately
before each production state change. This includes each image publication,
legacy-fleet stop, durable session or rollback record, APPLY, OMP service
setup, admission open or close, Compose start, stop, restart, or
restart-policy transition. Do not reuse an earlier authorization for a later
command. Use the assigned operator ID.
Do not put credentials in commands, reports, or shared logs.
This document defines commands only. It does not prove a production deployment.
Do not use local tests, local rollback drills, or example output as production
evidence. Capture and review evidence from the target host and database.


This runbook uses one governed production supply control plane: the gateway
authorizes bounded worker operations and owns all production database writes.
The replenishment controller is only an authenticated gateway cadence client.
Keep the legacy intake and mapped-source timers disabled and inactive. Do not
run `npm run affiliate:scrape:due` or `npm run affiliate:intake:automation`
against a production database.

## Bounded legacy sport repair

Use `POST /v1/affiliate-agent/legacy-repair/admission` inside the gateway network.
Authenticate with `x-affiliate-gateway-operator-token`. Do not put the token in
shell history or a report. The route has no host-published port.

Send `{"mode":"PREVIEW","limit":1}` to inspect the sport-requeued cohort.
Preview does not write application rows. Optional `jobIds` selects an exact
subset. The limit is one by default and must be between one and twenty.
Review `counts`, `rows`, `proposedWrites`, and `reportHash`. Missing identities,
ambiguous roots, conflicting capture provenance, active authority, and public
targets remain held. An active mapping pointer alone is not public authority.
A promoted CLUB draft is private only when its exact source organization is
unlisted and both public surface flags are false.

After separate approval of the exact report, send the same selection with
`"mode":"APPLY"` and `"expectedReportHash":"<reviewed SHA-256>"`.
Do not send `operatorId`. The authenticated operator token records the fixed
service actor `affiliate-gateway-operator`; it does not authenticate an arbitrary
human account supplied in JSON.

Apply requires closed admission, no active claims, the active contract, and a
fresh verified preflight. It repeats the report checks in one serializable
transaction. It links only existing source, mapping, and intake identities.
It may create a held PRE_MAPPED Supply Source. It pins the selected stored
artifacts and creates one deduplicated gateway producer job per selected row.
It preserves prior result history. An exact retry returns the persisted report
with `replayed: true` and `writeCount: 0`. A changed report returns HTTP 409 with
`ADMISSION_REPORT_DRIFT`; obtain a new preview instead of retrying the old hash.

Repair claims carry a fresh sports catalog and an exact intake/run context.
Evidence handles use `intake-artifact:<artifact-row-id>` so shared file bytes
cannot substitute another capture run's provenance. The gateway verifies
actual bytes, both captured URLs, run ownership, and catalog freshness.
Every legacy producer `CONTRACT_GAP` requires at least one verified sport
determination in `sportEvidence` and each citation's manifest evidenceRef, even
with generic reason codes. Unresolved assessments require matching sport codes. A
non-sport gap may carry verified resolved sports. Invalid assessments enter
the bounded schema-correction path; they do not complete the job.
Package validation and commit require the exact resolved sport union.

Independent approval rechecks the committed evidence and catalog in the same
transaction as approval. `LEGACY_SPORT_REPAIR` remains an automation hold.
Approval does not enqueue activation. Activation and publication are denied
for these repair claims. Run one bounded producer lease, then one bounded
reviewer lease only when a reviewer job exists. Close admission and stop the
canary workers after the result. Do not start coverage or replenishment.

Capture effective database permissions. Fixed booleans in an inventory are not
denial evidence. If group roles were absent when migrations ran, provision the
roles and apply the migration's conditional grants before the canary.

### Linked retries after a runtime correction

Use `POST /v1/affiliate-agent/legacy-repair/retry` with the same operator
authentication. The request is explicit:

    {"mode":"PREVIEW","gatewayJobIds":["<completed parent Gateway job ID>"],"reason":"<reviewed correction reason>"}

The list contains one to twenty unique parent IDs. There is no queue-wide
default selection. Review the complete report, then send the same IDs and
reason with `"mode":"APPLY"` and its `expectedReportHash`.

Only completed legacy producer `CONTRACT_GAP` parents are eligible. The
parent claim, result hash, receipt, mapping/source/intake identity, capture
run, pinned artifacts, root generation, and safety state must agree.
Both the deployment contract version and hash must differ from the parent's.
The current Supply Contract version and hash must still match the parent.
The new mapping pass is the parent's pass plus one, with a maximum of three.
Historical results are not revalidated under newer sport-result semantics.
Legacy null run/page root links are permitted only through the verified
intake/run/pinned-artifact lineage; a non-null foreign root is rejected.

Apply requires closed admission, no live claims, and fresh preflight.
Every requested parent must be eligible. The single transaction creates new
child Gateway jobs, queues the existing mapping jobs, and appends retry audit
history. Old Gateway jobs, claims, results, receipts, and failure counts are
not reset. Holds, publication flags, and scraping settings remain unchanged.

The dedupe key is stable per parent Gateway job. A different deployment or
reason cannot create another sibling. An exact apply replay returns the same
child IDs in `appliedGatewayJobIds` with `writeCount: 0`. A later authorized
retry must name the latest completed child, not reuse its ancestor.
This route does not open a worker lease or start a service.


## Current OMP runtime

Use `@oh-my-pi/pi-coding-agent@18.1.13` with the pinned Bun runtime in the
governed Dockerfile. The production execution class is `PRODUCTION_OMP`.
Current source role and prompt contracts use version 3. Deploy matching
Gateway, supervisor, and runner code together with newly compiled contracts
and fresh preflight evidence. Old reports do not authorize this correction.

`affiliate-model-auth-broker` owns the private OAuth store for two ChatGPT
accounts. Its exact container/service ID is `affiliate-model-auth-broker`; it
runs as `1003:1003` on `model_auth_internal` and `model_egress`.
`affiliate-model-gateway` has the exact ID `affiliate-model-gateway` and runs
as `1004:1004` on the auth, model-client, and model-egress networks. Neither
model service joins the reviewed production-backend network or publishes a
host port. The broker state volume is a dedicated persistent volume with
exactly one writable `/var/lib/omp` attachment by the broker's actual
full-container ID. The gateway keeps `/var/lib/omp` on a `512m` private
`uid=1004,gid=1004,mode=0700` tmpfs; both services use bounded
`rw,noexec,nosuid,nodev` `/tmp` tmpfs.

The reviewed inventory binds both model services to the same full
`image@sha256:<64-hex>` registry reference and independently records the
Docker config ID as `sha256:<64-hex>`. These are separate facts: never derive
the config ID from the image reference or compare it with an OCI repository
digest. Capture the actual production-backend network name separately from
the three model network names.

The two internal bearer source records must be distinct. Provision their host
sources as `root:1003`, mode `0640`, regular non-symlink files, and capture
their bounded `stat` sizes plus SHA-256 fingerprints of the effective UTF-8
value after JavaScript `String.prototype.trim()`. A source containing only
Unicode whitespace is unusable. Two files such as `shared-token\n` and
`shared-token` have the same effective value and must be rejected as equal
even though their raw bytes differ. The model gateway has supplementary group
`1003`. Compose mounts these files under `/run/secrets`.
The role-specific `/usr/local/bin/prepare-omp-service broker|gateway`
entrypoint delegates validation and copying to the trusted Bun helper, which
applies the same JavaScript trim semantics before copying only these internal
bearer files into the owned OMP profile with mode `0600`. Do not rely on
Compose file-secret UID or mode remapping. Do not copy OAuth tokens into
runner workspaces or retain raw bearer values in inventory.

The root runner requires the exact endpoint
`http://affiliate-model-gateway:4000`, a redacted bearer handoff, and
`AFFILIATE_AGENT_OMP_MODEL=openai-codex/gpt-5.6-luna`. Bind the recorded
runner bearer SHA-256 to the gateway source fingerprint, never the broker
fingerprint. Supervisors do not receive this bearer. The child uses
`pi-native` transport and must find the exact qualified model in authenticated
`/v1/models` before it sends a prompt. Model services use `OMP_PROFILE` and
`PI_CONFIG_DIR`; do not add a `PI_PROFILE` compatibility alias.

Use two fresh browser logins in the dedicated broker profile. Do not import
the expired Codex seed or a personal OMP profile. Use a separate browser
session for the second account. Verify two distinct, healthy
`openai-codex` identities without printing tokens or publishing account
identifiers. Native OMP account selection and cooldowns remain in the model
gateway. Account-pool files are routing filters, not authorization controls.

The driver creates a new in-memory session for each claim. It disables
ambient tools, extensions, context discovery, MCP, LSP, memory, and unrelated
background model work. Both active and registered tools must match the
claim's tool set. `read_artifact` returns verified text pages or image
evidence. `check_result` performs a read-only local draft check.
`execute_command` exists only when the role permits a non-terminal command.
`submit_result` binds claim identity and authorization in trusted code.
It repeats the local draft check before it sends a result to the Gateway.
A `DRAFT_INVALID` response keeps the invocation open and spends no terminal
correction. Actual terminal submissions retain the existing Gateway
correction limit, size limit, deadline, and idempotent supervisor replay.

Artifact reads include required nullable `sourceUrl` and `finalUrl` fields.
They come from stored capture metadata and remain fixed on receipt replay.
The OMP reader preserves them in text pages, cached pages, and image metadata.
The text-page limit still includes all serialized metadata. Missing historical
URL metadata remains null; the reader does not invent it from page links.
For a declarative package, `listUrlRef` is the authorized page artifact's
evidenceRef. It is not a raw URL or artifactId. Existing stored evidence does
not require a new capture profile.

Use `read_artifact` with `view: "CITATION_TEXT"` to inspect the text used by
the sport citation verifier. The existing inert DOM parser decodes HTML
entities with scripting disabled. A linear byte and syntax-complexity check
runs before DOM construction. Output and cache budgets remain bounded.
Script, style, template, attribute, and comment content is not citation text.
Raw bytes and their hashes do not change. An over-budget view returns
`CITATION_TEXT_LIMIT` without closing the invocation. Use another permitted
artifact, such as Markdown; do not raise limits or request an unapproved capture.
`CITATION_TEXT` uses the verifier's replacement decoding for invalid UTF-8.
The default `SOURCE` view retains its strict UTF-8 decoding. Each view has
its own UTF-16 offsets. Continue with
the returned `nextOffset` and the same view. The citation view also returns
the claim artifact identifier, hash, kind, and stored provenance URL.

`check_result` checks the terminal schema and claim identity. Legacy
Mapping Producer contract gaps also use the shared sport and citation
verifier against the claim snapshot. The tool can read only claim-permitted
evidence. It does not submit a result, execute a command, validate a package,
approve work, publish data, or change the catalog. `DRAFT_VALID` is explicitly
non-authoritative. The Gateway still checks current authority, live catalog
freshness, evidence ownership, receipts, and lifecycle state at submission.
Malformed terminal-tool input that reaches the bridge returns bounded
`DRAFT_INVALID` issues without copying submitted values or undeclared keys.

Package validation and commit require at least one stored provenance URL.
They never use a page-body link as a substitute listing URL.

The isolated worker does not load repository skills, rules, or context files.
Its generated prompt contains the applicable URL-reference and sport-evidence
rules. Change that prompt contract when those production rules change.
An explicit indoor venue and a source-backed link between that venue and the
volleyball activity can establish Indoor Volleyball without a literal
canonical label. A venue name or generic sport word alone cannot.

Command rejections produce `affiliate-agent-command-rejection` records in
the root runner's structured logs. The child reports only allowlisted stages,
commands, reason/error codes, issue codes, and field paths. The root binds
worker and invocation identity from its trusted launch state. It enforces
4 KiB per record, at most 32 records, and 16 KiB of child diagnostic frames.
It also inspects at most 16 KiB of stderr input per child before decoding and
parsing; malformed and oversized input consumes this budget too. After that,
diagnostic parsing stops while stdout and cleanup continue. The root does not
forward raw stderr, input values, URLs, credentials, prompts, or raw error
messages. Records survive workspace cleanup, including successful terminal
completion. Retention follows the configured container log policy; this is
not a permanent database audit.

After SDK tool activation, the driver sets `lenientArgValidation` on the final
`execute_command`, `check_result`, and `submit_result` wrappers. The SDK may
repair simple syntax first. Unrepaired arguments reach the trusted bridge's
strict validators. Command failures use the existing diagnostic callback.
Terminal draft failures return safe `DRAFT_INVALID` results.
Advertised schemas and Gateway validation stay unchanged. Other tools retain
normal SDK validation. Set these flags on the final wrappers; OMP 18.1.13
drops the property during conversion from the earlier CustomTool definition.

Run the real SDK boundary regression from `apps/site`:

    npm exec --yes --package=bun@1.3.14 -- bun scripts/test-affiliate-omp-agent-sdk-schema.ts

This probe uses a fresh isolated session and an unpaired malformed call for
each delegated tool. It checks safe handling of unrepairable terminal input.
Throwing network and provider guards prove no Gateway or provider call occurs.

The OMP runner does not use Bubblewrap. The shipped runner profiles remove
the Codex-specific namespace and mount allowances. Keep the private cgroup,
fixed UID/GID, no-new-privileges, resource limits, read-only root filesystem,
and bounded temporary filesystems. Run `verify-runner-sandbox.mjs` in both
producer and `--reviewer` modes with the exact reviewed image and profiles
before an approved canary. A reviewer root must remain read-only.

Preflight requires independent model-service inventory slots with exact IDs,
full container IDs, image reference/config-ID binding, effective allowlisted
environment (`HOME`, `NODE_ENV`, `NODE_VERSION`, `OMP_PROFILE`, `PATH`,
`PI_CONFIG_DIR`, and `YARN_VERSION`), role-specific entrypoint/Cmd,
structured mount records, bearer-source records, lifecycle status, health,
and `restartPolicy=no`. The explicitly reviewed model-service state is
`STOPPED` (created/exited) or `RUNNING` (running and healthy); both require
`restartPolicy=no`. Auth setup may be approved and running before business
preflight, so do not infer a required stopped auth state from stopped
business writers. Missing or swapped model-service evidence fails closed.
Do not add fixed permission booleans as a substitute for inspection.

Build from `apps/site`. Use the two governed Dockerfiles. Publish only after
current release approval. Start only the named services covered by that
approval. Keep coverage, replenishment, publication, and automatic scraping
held during the one-job backlog repair canary.

The live execution plan is
`plans/affiliate-governed-omp-runner-execplan.md` at the repository root.
It records the exact admitted job, verification, login steps, and current
authorization state. Source configuration is not production proof.

## Historical Codex commissioning reference

The remaining command examples record the earlier Codex commissioning and
cutover work. They are historical reference, not an OMP startup procedure.
Do not execute them to configure or start the current fleet. Their old
inventory shapes and authentication settings do not satisfy OMP preflight.

The reviewed Linux x86 runner uses the pinned Codex CLI with Bubblewrap.
Install `runner-seccomp.json` and the named `runner.apparmor` profile only after
current operator authorization. These files permit the namespace-local mount
setup needed by Bubblewrap. They do not add `SYS_ADMIN`, privileged mode, or
global kernel changes. The AppArmor profile requires ABI 5 support.

```text
sudo install -D -o root -g root -m 0644 \
  deploy/affiliate-governed/runner-seccomp.json \
  /etc/docker/seccomp/bracketiq-affiliate-runner.json
sudo install -D -o root -g root -m 0644 \
  deploy/affiliate-governed/runner.apparmor \
  /etc/apparmor.d/bracketiq-affiliate-runner
sudo apparmor_parser -r /etc/apparmor.d/bracketiq-affiliate-runner
```

Before attaching the profiles to production, run the credential-free smoke
below. Do not mount the production workspace volume or auth file. Do not pass a
production environment file. The probe first proves the sibling directory is
writable by the child without Codex. It then requires a sandboxed workspace
write, sibling denial, `NoNewPrivs=1`, and zero effective child capabilities.

```text
docker run --rm --network none --user 0:0 --read-only --ipc none \
  --cgroupns private --cpus 1 --memory 2g --pids-limit 512 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,uid=0,gid=0,mode=0755 \
  --tmpfs /workspaces:rw,noexec,nosuid,nodev,size=64m,uid=1001,gid=1001,mode=0710 \
  --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
  --cap-add KILL --cap-add SETGID --cap-add SETUID \
  --security-opt no-new-privileges:true \
  --security-opt writable-cgroups=true \
  --security-opt seccomp=/etc/docker/seccomp/bracketiq-affiliate-runner.json \
  --security-opt apparmor=bracketiq-affiliate-runner \
  --entrypoint node "${AFFILIATE_AGENT_IMAGE:?Set the reviewed immutable image}" \
  /usr/local/libexec/verify-runner-sandbox.mjs
```

The runner keeps `workspace-write` and sets
`sandbox_workspace_write.exclude_slash_tmp=true`. Its writable temporary
directory is inside the invocation workspace; the global `/tmp` remains
root-owned. Do not replace this with `danger-full-access` or an unconfined
security profile.

Preflight binds the canonical seccomp JSON hash and the exact AppArmor file
bytes to the approved constants in `affiliateFleetCutover.ts`. Record the
actual Docker security options and the independent `apparmorProfileSha256`.
Recheck both profiles after a Docker, kernel, or Codex version change.

Repeat the same smoke command with `--reviewer` after the script path.
This mode also requires a denied write to the reviewer root while allowing
its private temporary directory. The supervisor creates empty `.git` and
`.agents` policy mount targets before locking that root. It creates no Git
history and does not make the reviewer workspace writable.

Run the build from `apps/site`:

```text
docker build --file deploy/affiliate-governed/Dockerfile \
  --tag bracketiq-affiliate-governed:reviewed .
```

Before this image publication, obtain separate current authorization from the
authorized release owner. Publish the reviewed image to the approved registry.
Set its immutable digest in `deployment.env`. The image contains the governed
supervisor and runner executables and the generated Prisma client. It does not
contain credentials.

## Build the gateway image

Run the build from `apps/site`:

```text
docker build --file deploy/affiliate-governed/Dockerfile.gateway \
  --tag bracketiq-affiliate-gateway:reviewed .
```

Before this gateway image publication, obtain separate current authorization
from the authorized release owner. Publish the reviewed image to the approved
registry. Set its immutable digest in `deployment.env`. The gateway is the only
fleet service with the operator, object-storage, provider, or production
database credentials. It also receives the dedicated supervisor-halt
credential; that value is shared only with the governed supervisor services
and is never passed to the runner, Codex child, or cadence client.

The gateway exposes `GET <configured-prefix>/healthz`,
`GET <configured-prefix>/readiness?role=...&workerId=...`,
`POST <configured-prefix>/claim`, `POST <configured-prefix>/perform`, and
authenticated `POST <configured-prefix>/replenishment` on the internal network,
where
`<configured-prefix>` is the normalized
`AFFILIATE_AGENT_GATEWAY_PATH_PREFIX` (default `/v1/affiliate-agent`). At
startup it validates the reviewed deployment contract, active Supply Contract,
and a fresh (15-minute) apply-safe preflight report. After startup,
`<configured-prefix>/healthz` is a liveness check for the gateway's database
and active contract bundle; it does not age out a running gateway when the
one-time preflight report expires. A readiness request must include the exact
`role` and `workerId` query parameters. `<configured-prefix>/readiness?role=...&workerId=...`
returns `503` until that worker reports a healthy, recent heartbeat with an
unexpired lease. The profiled helper checks all four Mapping Producer and
Supply Reviewer identities before it exits successfully. `POST
<configured-prefix>/reconcile` requires the operator token. Workers cannot
call the reconciliation route.

`POST <configured-prefix>/replenishment` requires only the dedicated
`x-affiliate-gateway-replenishment-token` header and rejects the gateway
operator token. It runs the fixed reviewed cohort through the gateway-owned
persistence boundary. The cadence client has no `DATABASE_URL`,
production-backend network, or Prisma authority; it only calls this route.

The gateway also exposes authenticated admission controls under
`AFFILIATE_AGENT_GATEWAY_PATH_PREFIX` (default `/v1/affiliate-agent`):
`GET /admission` returns only the safe state shape
`{"status":"open"|"closed","open":true|false}`. It never returns an operator
token or role credential. `POST /admission/open` requires the operator token and
a reviewed role credential to open one finite, server-enforced lease for exactly
one claim belonging to the requested role and worker after downstream readiness.
The successful POST response includes only safe lease metadata
(`role`, `workerId`, `expiresAt`, `remainingClaims`); validate that response
instead of expecting lease metadata from GET. `POST /admission/close` closes
claims and invalidates the open lease. `POST /admission/supervisor/close` is a
separate protected halt control and requires the
`x-affiliate-gateway-supervisor-halt-credential` header. Only the gateway and
governed supervisor services receive the corresponding
`AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL`; the runner and Codex child do not
receive it and must not call this route. `/admission/open` and
`/admission/close` require the `x-affiliate-gateway-operator-token` header. Run
these requests inside the gateway container as shown in **Staged startup** and
**Rollback boundary**.

The Compose file launches one runner sidecar. The runner starts Codex CLI with
the reviewed model `gpt-5.6-luna` and no role or supervisor-halt credential.
The runner receives a read-only host mount for the reviewed ChatGPT Codex
`auth.json`. It copies that file into each fresh invocation `CODEX_HOME` with
mode `0600`. The runner joins the internal gateway network and the reviewed
egress network. Supervisors keep only their role and supervisor-halt
credentials and cannot access the Codex auth seed.

## Prepare the manifest

Run the Compose commands from the governed deployment directory:

```text
cd /path/to/repository/apps/site/deploy/affiliate-governed
```

1. Create a private directory for the manifest and all resolved evidence:

```text
install -d -m 0700 /path/to/affiliate-governed-private
```

The runner and supervisors share a named local volume mounted at
`/workspaces`. Compose creates it as a bounded `tmpfs` volume with size `2g`,
`noexec`, `nosuid`, `nodev`, owner `1001:1001`, and mode `0710`. Do not use a
host bind mount or write workspace data outside this volume. The root-only
runner control process writes `/workspaces/.runner.sock`; supervisors use that
socket.

The runner's control UID is `0`. The socket is owned by `1001:0` with mode
`0600`, so supervisors can connect as the owner while the Codex child UID/GID
`1002:1001` cannot read, write, create, replace, or unlink it. The runner drops
every capability except `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `KILL`, `SETGID`, and
`SETUID` and receives only the reviewed agent GID as a supplementary group. It
does not receive `SYS_ADMIN` or `NET_ADMIN`.

```text
export HOST_WORKSPACE_AGENT_UID=1001
export HOST_WORKSPACE_RUNNER_UID=1002
export HOST_WORKSPACE_GID=1001
export REVIEWED_WORKSPACE_VOLUME=bracketiq-affiliate-governed-workspaces
test "$HOST_WORKSPACE_AGENT_UID" -gt 0
test "$HOST_WORKSPACE_RUNNER_UID" -gt 0
test "$HOST_WORKSPACE_RUNNER_UID" != "$HOST_WORKSPACE_AGENT_UID"
test "$HOST_WORKSPACE_GID" -gt 0
test -n "$REVIEWED_WORKSPACE_VOLUME"
if docker volume inspect "$REVIEWED_WORKSPACE_VOLUME" >/dev/null 2>&1; then
  printf '%s\n' "Refusing to reuse a pre-existing governed workspace volume." >&2
  exit 1
fi
```

The shared root inside the volume is supervisor-owned with mode `0710`: the
supervisor owner has `rwx`, while the child group has execute-only traversal.
The child can enter only the assigned workspace path and cannot create,
replace, or unlink a sibling workspace or `/workspaces/.runner.sock`.
Per-assigned workspace modes remain role-specific: a producer may receive child
write access, while a reviewer receives only the reviewed read-only producer
output. Never generalize an assigned workspace mode to the shared root.

At runner `TERMINATED`, the root control process performs bounded permission
normalization inside the assigned workspace without following symlinks. It
changes only entries owned by the reviewed runner UID `0`, child UID `1002`, or
supervisor UID `1001` to `0660`/`0770`; it fails closed on a foreign owner and
never deletes the shared `/workspaces` root. The supervisor is authoritative for
destroying the assigned child workspace after normalization and the
`TERMINATED` message. It waits for bounded destruction and any late cleanup to
settle before releasing the claim and runner reservation. A destroy failure or
unsettled late cleanup halts admission. Verify ownership/mode normalization,
supervisor destruction, and late-cleanup settlement in the reviewed evidence.

The runner creates the socket only after its singleton startup gate. It chowns
the socket to `1001:0` and mode `0600` before supervisors connect. Before
starting supervisors, inspect the created volume and assert its driver and
bounded mount options. Do not create a host socket file or make the shared
root world-writable.

2. Copy the example with a private file mode. The creation is exclusive. It
   must fail when the destination already exists:

```text
export DEPLOYMENT_ENV=/path/to/affiliate-governed-private/deployment.env
test ! -e "$DEPLOYMENT_ENV"
if ! (
  umask 077
  set -o noclobber
  cat deployment.env.example > "$DEPLOYMENT_ENV"
); then
  printf '%s\n' "Refusing to overwrite an existing private deployment.env." >&2
  exit 1
fi
chmod 0600 "$DEPLOYMENT_ENV"
test ! -L "$DEPLOYMENT_ENV"
test "$(stat -c '%a' "$DEPLOYMENT_ENV")" = "600"
test "$(grep -c '^AFFILIATE_GATEWAY_UID=' "$DEPLOYMENT_ENV")" = "1"
test "$(grep -c '^AFFILIATE_GATEWAY_GID=' "$DEPLOYMENT_ENV")" = "1"
test "$(grep -c '^AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL=' "$DEPLOYMENT_ENV")" = "1"
test "$(grep -c '^AFFILIATE_AGENT_RUNNER_CHILD_UID=' "$DEPLOYMENT_ENV")" = "1"
test "$(grep -c '^AFFILIATE_AGENT_RUNNER_CHILD_GID=' "$DEPLOYMENT_ENV")" = "1"
test "$(grep -c '^AFFILIATE_AGENT_RUNNER_CGROUP_RELATIVE_PATH=' "$DEPLOYMENT_ENV")" = "1"
export REVIEWED_RUNNER_CHILD_UID="$(sed -n 's/^AFFILIATE_AGENT_RUNNER_CHILD_UID=//p' "$DEPLOYMENT_ENV")"
export REVIEWED_RUNNER_CHILD_GID="$(sed -n 's/^AFFILIATE_AGENT_RUNNER_CHILD_GID=//p' "$DEPLOYMENT_ENV")"
export REVIEWED_RUNNER_CGROUP_RELATIVE_PATH="$(sed -n 's/^AFFILIATE_AGENT_RUNNER_CGROUP_RELATIVE_PATH=//p' "$DEPLOYMENT_ENV")"
test "$REVIEWED_RUNNER_CGROUP_RELATIVE_PATH" = "affiliate-agent-runner"
export REVIEWED_GATEWAY_UID="$(sed -n 's/^AFFILIATE_GATEWAY_UID=//p' "$DEPLOYMENT_ENV")"
export REVIEWED_GATEWAY_GID="$(sed -n 's/^AFFILIATE_GATEWAY_GID=//p' "$DEPLOYMENT_ENV")"
printf '%s\n' "$REVIEWED_GATEWAY_UID" \
  | grep -Eq '^[1-9][0-9]*$'
printf '%s\n' "$REVIEWED_GATEWAY_GID" \
  | grep -Eq '^[1-9][0-9]*$'
export REVIEWED_GATEWAY_USER="$REVIEWED_GATEWAY_UID:$REVIEWED_GATEWAY_GID"
test "$(sed -n 's/^AFFILIATE_AGENT_UID=//p' "$DEPLOYMENT_ENV")" = "$HOST_WORKSPACE_AGENT_UID"
test "$REVIEWED_RUNNER_CHILD_UID" = "$HOST_WORKSPACE_RUNNER_UID"
test "$REVIEWED_RUNNER_CHILD_UID" != \
  "$(sed -n 's/^AFFILIATE_AGENT_UID=//p' "$DEPLOYMENT_ENV")"
test "$REVIEWED_RUNNER_CHILD_GID" = "$HOST_WORKSPACE_GID"
printf '%s\n' "$REVIEWED_RUNNER_CHILD_UID" \
  | grep -Eq '^[1-9][0-9]*$'
printf '%s\n' "$REVIEWED_RUNNER_CHILD_GID" \
  | grep -Eq '^[1-9][0-9]*$'
test "$(sed -n 's/^AFFILIATE_AGENT_GID=//p' "$DEPLOYMENT_ENV")" = "$HOST_WORKSPACE_GID"
```

Use `deployment.env.example` as the source when creating the file; the
resulting `deployment.env` is ignored by git. Set the immutable gateway and
worker image digests, operator token, dedicated supervisor-halt credential,
token-signing/workspace keys, deployment contract JSON, token key version,
preflight report JSON, Spaces settings, the reviewed OMP image reference and
independent Docker config ID, the two distinct private model bearer source
files, all five role credentials, and the existing workspace root. Keep
`AFFILIATE_GATEWAY_DATABASE_URL` pointed at the reviewed
`postgres` service on `bracketiq-production_backend`, with the URL-encoded
runtime password and database name `bracketiq`. Keep
`AFFILIATE_AGENT_PRODUCTION_BACKEND_NETWORK=bracketiq-production_backend`
and `AFFILIATE_AGENT_GATEWAY_EGRESS_NETWORK=bracketiq_affiliate_gateway_egress`
unchanged unless the corresponding reviewed networks are renamed together. Set
`AFFILIATE_AGENT_GATEWAY_NETWORK` to the reviewed gateway network name derived
from the redacted Compose output below. Do not use a hard-coded gateway network
name.
Set `AFFILIATE_AGENT_RUNNER_CGROUP_RELATIVE_PATH` to the exact namespace-relative
path `affiliate-agent-runner`. The runner derives its absolute path beneath
the `/sys/fs/cgroup` cgroup2 mount. Compose gives the runner a private cgroup v2
namespace, requests `writable-cgroups=true` on Docker Engine 28+, and does not
bind any host cgroup path. After startup acquires its singleton lock, the root
controller creates this target as a descendant of its own cgroup, verifies the
writable cgroup2 mount and required controls, and fails closed if the target is
absent, read-only, or outside the runner cgroup.

Before any Compose command, replace the public operator-token,
replenishment-token, and supervisor-halt sentinels in the private file through
the approved secret procedure. The replenishment token is dedicated to the
cadence client and must be distinct from the operator, supervisor-halt, and
every role credential. During rotation, update the gateway and cadence client
together, re-resolve the redacted Compose topology, and obtain separate
authorization before restarting those services. Retire the old value only
after the new value is active on both sides. Never load this credential into
the runner or Codex child, put it in a command argument, or print it:

```text
gateway_operator_token="$(sed -n 's/^AFFILIATE_GATEWAY_OPERATOR_TOKEN=//p' \
  /path/to/affiliate-governed-private/deployment.env)"
test -n "$gateway_operator_token"
test "$gateway_operator_token" != "__REPLACE_WITH_PRIVATE_REVIEWED_GATEWAY_OPERATOR_TOKEN__"
gateway_replenishment_token="$(sed -n 's/^AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=//p' \
  /path/to/affiliate-governed-private/deployment.env)"
test -n "$gateway_replenishment_token"
test "$gateway_replenishment_token" != "__REPLACE_WITH_PRIVATE_REVIEWED_GATEWAY_REPLENISHMENT_TOKEN__"
supervisor_halt_credential="$(sed -n 's/^AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL=//p' \
  /path/to/affiliate-governed-private/deployment.env)"
test -n "$supervisor_halt_credential"
supervisor_halt_credential_bytes="$(LC_ALL=C printf '%s' "$supervisor_halt_credential" \
  | wc -c | tr -d '[:space:]')"
test "$supervisor_halt_credential_bytes" -ge 32
case "$supervisor_halt_credential" in
  *"REVIEWED_"*|*"__REPLACE_WITH_"*|*"REPLACE_WITH_"*|*"PLACEHOLDER"*|*"placeholder"*|*"EXAMPLE"*|*"example.test"*)
    printf '%s\n' "AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL is not a reviewed private value." >&2
    exit 1
    ;;
esac
test "$supervisor_halt_credential" != "$gateway_operator_token"
test "$gateway_replenishment_token" != "$gateway_operator_token"
test "$gateway_replenishment_token" != "$supervisor_halt_credential"
for credential_env_name in \
  AFFILIATE_MAPPING_PRODUCER_1_CREDENTIAL \
  AFFILIATE_MAPPING_PRODUCER_2_CREDENTIAL \
  AFFILIATE_SUPPLY_REVIEWER_1_CREDENTIAL \
  AFFILIATE_SUPPLY_REVIEWER_2_CREDENTIAL \
  AFFILIATE_COVERAGE_PLANNER_CREDENTIAL \
  AFFILIATE_HUMAN_DIRECTED_EXECUTOR_CREDENTIAL; do
  credential_value="$(sed -n "s/^${credential_env_name}=//p" \
    /path/to/affiliate-governed-private/deployment.env)"
  test -n "$credential_value"
  test "$supervisor_halt_credential" != "$credential_value"
  test "$gateway_replenishment_token" != "$credential_value"
  unset credential_value
done
unset credential_env_name supervisor_halt_credential_bytes supervisor_halt_credential gateway_replenishment_token gateway_operator_token
```

Reject every unresolved public credential or image sentinel before resolving
Compose. Inspect only variable names and never print values:

```text
while IFS='=' read -r env_name env_value; do
  case "$env_value" in
    *"REVIEWED_"*|*"__REPLACE_WITH_"*|*"REPLACE_WITH_"*|*"PLACEHOLDER"*|*"placeholder"*|*"EXAMPLE"*|*"example.test"*)
      printf '%s\n' "$env_name still contains a public sentinel." >&2
      exit 1
      ;;
  esac
done < <(sed '/^[[:space:]]*#/d;/^[[:space:]]*$/d' \
  /path/to/affiliate-governed-private/deployment.env)
```

This gate covers the operator, dedicated supervisor-halt, signing, storage,
provider, model, runner, workspace, and every role credential. It must pass
before `docker compose config`, `create`, or `up`; a non-empty value is not
evidence that a secret was reviewed.

The governed runner is Linux-only. Before resolving Compose, reject macOS,
Docker Desktop, Docker Engine versions older than 28, rootless/userns-remap
daemons, and any unsupported host. The runner's private cgroup v2 namespace
must have a writable cgroup2 mount. Compose must set `cgroup: private`,
`security_opt: writable-cgroups=true`, and the exact namespace-relative target
below; do not substitute a host bind, normal directory, cgroup root, or
fallback:

```text
set -Eeuo pipefail
case "$(uname -s)" in
  Linux) ;;
  *)
    printf '%s\n' "Refusing governed runner: private cgroup v2 requires Linux." >&2
    exit 1
    ;;
esac
export DOCKER_SERVER_VERSION="$(docker version --format '{{.Server.Version}}')"
printf '%s\n' "$DOCKER_SERVER_VERSION" | awk -F. '
  NF < 2 || $1 !~ /^[0-9]+$/ || ($1 + 0) < 28 { exit 1 }
'
test "$(docker info --format '{{.CgroupVersion}}')" = "2"
case "$(docker info --format '{{.OperatingSystem}}')" in
  *Docker\ Desktop*)
    printf '%s\n' "Refusing Docker Desktop for governed cgroup delegation." >&2
    exit 1
    ;;
esac
export DOCKER_SECURITY_OPTIONS_JSON="$(docker info --format '{{json .SecurityOptions}}')"
printf '%s' "$DOCKER_SECURITY_OPTIONS_JSON" |
  jq -e '
    type == "array"
    and all(.[]; (test("rootless|userns|unconfined"; "i") | not))
  ' >/dev/null
unset DOCKER_SECURITY_OPTIONS_JSON DOCKER_SERVER_VERSION
test "$REVIEWED_RUNNER_CGROUP_RELATIVE_PATH" = "affiliate-agent-runner"
```

This host check is necessary but not sufficient: startup first acquires an atomic
singleton lock and creates/chowns the private runner socket. If either the lock
or socket ownership fails, startup stops; a second runner cannot perform cleanup.
It then resolves the configured path with realpath inside its private namespace
and uses its own v2 path from `/proc/self/cgroup` to reject a target outside the
runner cgroup or behind a symlink/`..` escape. It verifies `pids`,
`cgroup.procs`, and `cgroup.kill`, gates required health and gateway/model
connections, and only then sweeps stale workspace and direct
`invocation-<uuid>` cgroup children. It kills each stale child, waits for an
empty `cgroup.procs`, and removes it. A matching symlink, non-directory, failed
kill, or timeout stops startup; it never deletes a non-invocation subtree.
Only after that bounded sweep does it emit clean containment evidence and accept
`RESERVE`. The event records the effective `cpu.max`, `memory.max`, and
`pids.max` values, every found ID in `staleInvocationIds` and
`staleInvocationCleanup`, and an empty `staleInvocationResidualIds`;
`cleanupStatus: "clean"` proves no stale invocation subtree remained.

Before this assertion, a second operator must independently inspect the pulled
immutable references with Docker and write exactly one local image ID per image
to `reviewed-agent-image-id.txt` and `reviewed-gateway-image-id.txt` using an
exclusive protected procedure. The files are reviewed evidence, not values
derived from the registry digest. A missing, symlinked, or changed local ID
blocks every container inspection.

Before any container creation, assert that both reviewed image values are
immutable digests. Do not use a tag as a gateway, worker, or readiness-helper
artifact:

```text
export REVIEWED_AGENT_IMAGE="$(
  sed -n 's/^AFFILIATE_AGENT_IMAGE=//p' \
    /path/to/affiliate-governed-private/deployment.env
)"
printf '%s\n' "$REVIEWED_AGENT_IMAGE" \
  | grep -Eq '^.+@sha256:[a-fA-F0-9]{64}$'
export REVIEWED_AGENT_REPO_DIGEST="$REVIEWED_AGENT_IMAGE"
test -s /path/to/affiliate-governed-private/reviewed-agent-image-id.txt
test ! -L /path/to/affiliate-governed-private/reviewed-agent-image-id.txt
export REVIEWED_AGENT_IMAGE_ID="$(
  cat /path/to/affiliate-governed-private/reviewed-agent-image-id.txt
)"
printf '%s\n' "$REVIEWED_AGENT_IMAGE_ID" \
  | grep -Eq '^sha256:[a-fA-F0-9]{64}$'
docker image inspect "$REVIEWED_AGENT_IMAGE" |
  jq -e --arg expectedId "$REVIEWED_AGENT_IMAGE_ID" \
    --arg expectedDigest "$REVIEWED_AGENT_REPO_DIGEST" '
    length == 1
    and .[0].Id == $expectedId
    and ((.[0].RepoDigests // []) | index($expectedDigest) != null)
  ' >/dev/null
```


Before any container creation, assert that the private gateway image value is an
immutable digest. Do not use a tag as the gateway artifact:

```text
export REVIEWED_GATEWAY_IMAGE="$(
  sed -n 's/^AFFILIATE_GATEWAY_IMAGE=//p' \
    /path/to/affiliate-governed-private/deployment.env
)"
printf '%s\n' "$REVIEWED_GATEWAY_IMAGE" \
  | grep -Eq '^.+@sha256:[a-fA-F0-9]{64}$'
export REVIEWED_GATEWAY_REPO_DIGEST="$REVIEWED_GATEWAY_IMAGE"
test -s /path/to/affiliate-governed-private/reviewed-gateway-image-id.txt
test ! -L /path/to/affiliate-governed-private/reviewed-gateway-image-id.txt
export REVIEWED_GATEWAY_IMAGE_ID="$(
  cat /path/to/affiliate-governed-private/reviewed-gateway-image-id.txt
)"
printf '%s\n' "$REVIEWED_GATEWAY_IMAGE_ID" \
  | grep -Eq '^sha256:[a-fA-F0-9]{64}$'
docker image inspect "$REVIEWED_GATEWAY_IMAGE" |
  jq -e --arg expectedId "$REVIEWED_GATEWAY_IMAGE_ID" \
    --arg expectedDigest "$REVIEWED_GATEWAY_REPO_DIGEST" '
    length == 1
    and .[0].Id == $expectedId
    and ((.[0].RepoDigests // []) | index($expectedDigest) != null)
  ' >/dev/null
```

The redacted Compose output must contain these same image values for the
gateway and every agent-image service. A missing, tag-only, or changed image
value blocks container creation.
`REVIEWED_*_REPO_DIGEST` is the registry digest from the immutable image
reference. `REVIEWED_*_IMAGE_ID` is the local Docker image ID captured by the
second operator; it is a separate identity and must not be derived from the
registry digest. Every inspected container must carry both the expected local
ID and the expected registry digest in `.RepoDigests`.




The reviewed restart-policy contract has two explicit phases for the governed
business services. Keep `AFFILIATE_AGENT_RESTART_POLICY=no` in the private
`deployment.env` for stopped container creation and inspection. Change it to
`unless-stopped` only after gateway health, worker readiness, and separate
authorization; that value is applied to the BracketIQ `affiliate-gateway`,
root runner, all five supervisors, and governed replenishment controller. The
profiled `affiliate-agent-downstream-ready` helper is one-shot and remains
`no`. Both OMP model services are explicitly pinned to `restart: "no"` and
are never changed by this transition. Only `no` and `unless-stopped` are
reviewed values; do not substitute `always`, `on-failure`, or another restart
policy.
The production PostgreSQL Compose project must already have its healthy
`postgres` service on the private `bracketiq-production_backend` network. Do
not add a PostgreSQL service or a published gateway port to this Compose
project.

3. Resolve every service, including the profiled readiness gate, Coverage
Planner, and governed replenishment controller, without starting a service.
Stream the Compose output directly into the redactor. Do not create or retain
a raw resolved Compose file:

```text
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/governed-compose.redacted.json
set -o pipefail
if ! docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner config --format json |
  jq -e '
    .services["affiliate-replenishment-controller"].environment as $environment
    | if ($environment | type) == "object" then
        $environment.AFFILIATE_REPLENISHMENT_INTERVAL_SECONDS == "900"
      elif ($environment | type) == "array" then
        any($environment[];
          . == "AFFILIATE_REPLENISHMENT_INTERVAL_SECONDS=900")
      else false
      end
  ' >/dev/null
then
  printf '%s\n' "Resolved replenishment interval is not the reviewed 900 seconds." >&2
  set +o pipefail
  exit 1
fi
if ! docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner config --format json \
  | jq '{
    name: .name,
    services: (.services | with_entries(.value |= {
      image: .image,
      user: .user,
      stop_grace_period: .stop_grace_period,
      restart: .restart,
      read_only: .read_only,
      privileged: .privileged,
      cgroup: .cgroup,
      ipc: .ipc,
      tmpfs: .tmpfs,
      command: .command,
      environment: (
        (.environment // {}) |
        if type == "object" then keys | map(. + "=<redacted>")
        elif type == "array" then map(sub("=.*$"; "=<redacted>"))
        else []
        end
      ),
      networks: (
        (.networks // {}) |
        if type == "object" then keys else . end
      ),
      cap_drop: .cap_drop,
      cap_add: .cap_add,
      group_add: .group_add,
      security_opt: .security_opt,
      cpus: .cpus,
      mem_limit: .mem_limit,
      memswap_limit: .memswap_limit,
      pids_limit: .pids_limit,
      volumes: (
        (.volumes // []) |
        if type == "array" then map(
          select(type == "object") |
          {
            type: .type,
            source: .source,
            target: .target,
            read_only: (.read_only // false)
          }
        ) else [] end
      )
    })),
    volumes: ((.volumes // {}) | with_entries(.value |= {
      name: .name,
      driver: .driver,
      driver_opts: .driver_opts
    })),
    networks: ((.networks // {}) | with_entries(.value |= {
      name: .name,
      internal: (.internal // false)
    }))
  }' > /path/to/affiliate-governed-private/governed-compose.redacted.json
then
  rm -f /path/to/affiliate-governed-private/governed-compose.redacted.json
  set +o pipefail
  exit 1
fi
set +o pipefail
```

The redacted inventory must contain one gateway, one runner sidecar, two
independent `MAPPING_PRODUCER` workers, two independent `SUPPLY_REVIEWER`
workers, the readiness gate helper, one `COVERAGE_PLANNER` worker, and one
replenishment cadence client. Supervisors, runner, and cadence client must list
only `gateway_internal`. Only the gateway may list `production_backend`; it
also lists `gateway_egress`. The gateway must have `expose: 8080` but no
`ports` entry.
```text
jq -e --arg expected "$REVIEWED_GATEWAY_USER" '
  .services as $services
  | $services["affiliate-gateway"].user == $expected
  and $services["affiliate-replenishment-controller"].user == $expected
  and ($expected | test("^[1-9][0-9]*:[1-9][0-9]*$"))
' /path/to/affiliate-governed-private/governed-compose.redacted.json
```text
jq -e '
  .services["affiliate-gateway"].environment
  | if type != "array" then false
    else any(. == "AFFILIATE_OPERATIONAL_ALERT_EMAIL_TO=<redacted>")
      and any(. == "SMTP_HOST=<redacted>")
      and any(. == "SMTP_PASS=<redacted>")
      and any(. == "AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL=<redacted>")
    end
' /path/to/affiliate-governed-private/governed-compose.redacted.json
```
```text
jq -e '
  .services as $services
  | (
      [
        "affiliate-gateway",
        "mapping-producer-1",
        "mapping-producer-2",
        "supply-reviewer-1",
        "supply-reviewer-2",
        "coverage-planner"
      ]
      | all(.[]; (($services[.].environment // [])
        | index("AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL=<redacted>")) != null)
    )
  and (
      [
        "affiliate-agent-runner",
        "affiliate-agent-downstream-ready",
        "affiliate-replenishment-controller"
      ]
      | all(.[]; (($services[.].environment // [])
        | index("AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL=<redacted>")) == null)
    )
' /path/to/affiliate-governed-private/governed-compose.redacted.json
jq -e --arg runner_group "$HOST_WORKSPACE_GID" '
  .services["affiliate-agent-runner"] as $runner
  | $runner.cgroup == "private"
  and $runner.privileged == false
  and $runner.ipc == "none"
  and ((($runner.tmpfs // []) | sort)
    == ([
      "/dev/shm:rw,noexec,nosuid,nodev,size=64m,uid=0,gid=0,mode=0755",
      "/tmp:rw,noexec,nosuid,nodev,size=256m,uid=0,gid=0,mode=0755"
    ] | sort))
  and (($runner.security_opt // []) | sort
    == ["no-new-privileges:true", "writable-cgroups=true"])
  and (($runner.cap_drop // []) == ["ALL"])
  and ((($runner.cap_add // []) | sort)
    == ["CHOWN", "DAC_OVERRIDE", "FOWNER", "KILL", "SETGID", "SETUID"])
  and (($runner.group_add // []) == [$runner_group])
  and (($runner.environment // [])
    | index("AFFILIATE_AGENT_RUNNER_CGROUP_RELATIVE_PATH=<redacted>") != null)
  and (($runner.volumes // [])
    | all(.[]; ((.target // "") | startswith("/sys/fs/cgroup") | not)))
  and (($runner.volumes // [])
    | any(.[]; .type == "volume"
      and .source == "affiliate-governed-workspaces"
      and .target == "/workspaces"
      and .read_only == false))
' /path/to/affiliate-governed-private/governed-compose.redacted.json
jq -e --arg reviewed_volume "$(
  sed -n 's/^AFFILIATE_GOVERNED_WORKSPACE_VOLUME=//p' \
    /path/to/affiliate-governed-private/deployment.env
)" '
  .services as $services
  | .volumes["affiliate-governed-workspaces"] as $workspace
  | $workspace.name == $reviewed_volume
  and $workspace.driver == "local"
  and $workspace.driver_opts.type == "tmpfs"
  and $workspace.driver_opts.device == "tmpfs"
  and (($workspace.driver_opts.o | split(",") | sort) == ([
    "rw", "noexec", "nosuid", "nodev", "size=2g", "uid=1001", "gid=1001", "mode=0710"
  ] | sort))
  and all([
    "affiliate-agent-runner",
    "mapping-producer-1",
    "mapping-producer-2",
    "supply-reviewer-1",
    "supply-reviewer-2",
    "affiliate-agent-downstream-ready",
    "coverage-planner"
  ][]; any(($services[.].volumes // [])[];
    .type == "volume"
    and .source == "affiliate-governed-workspaces"
    and .target == "/workspaces"
    and .read_only == false
  ))
' /path/to/affiliate-governed-private/governed-compose.redacted.json
# Every governed agent process has a fixed Docker CPU, memory, swap, and PID
# boundary in addition to the runner's delegated per-child cgroup.
jq -e '
  .services as $services
  | [
      $services["affiliate-gateway"],
      $services["affiliate-agent-runner"],
      $services["mapping-producer-1"],
      $services["mapping-producer-2"],
      $services["supply-reviewer-1"],
      $services["supply-reviewer-2"],
      $services["coverage-planner"],
      $services["affiliate-agent-downstream-ready"],
      $services["affiliate-replenishment-controller"]
    ]
  | length == 9
    and all(.[];
      .cpus == 1
      and .mem_limit == "2147483648"
      and .memswap_limit == "2147483648"
      and .pids_limit == 512)
' /path/to/affiliate-governed-private/governed-compose.redacted.json
# The initial restart readback must show no for the gateway, runner, all five
# supervisors, the one-shot readiness helper, and the replenishment controller.

jq -e '
  .services as $services
  | [
      $services["affiliate-gateway"].restart,
      $services["affiliate-agent-runner"].restart,
      $services["mapping-producer-1"].restart,
      $services["mapping-producer-2"].restart,
      $services["supply-reviewer-1"].restart,
      $services["supply-reviewer-2"].restart,
      $services["coverage-planner"].restart,
      $services["affiliate-agent-downstream-ready"].restart,
      $services["affiliate-replenishment-controller"].restart
    ]
  | all(.[]; . == "no")
' /path/to/affiliate-governed-private/governed-compose.redacted.json
# The runner and every supervisor need more than the bounded TERM/KILL cleanup
# window before Docker may hard-kill the process.
jq -e '
  def grace_seconds:
    if type == "number" then .
    elif test("^[0-9]+s$") then (tonumber / 1)
    elif test("^[0-9]+m[0-9]+s$") then (
      capture("^(?<minutes>[0-9]+)m(?<seconds>[0-9]+)s$") as $parts
      | ($parts.minutes | tonumber) * 60 + ($parts.seconds | tonumber)
    )
    elif test("^[0-9]+m$") then (tonumber * 60)
    elif test("^[0-9]+h$") then (tonumber * 3600)
    else -1
    end;
  .services as $services
  | [
      $services["affiliate-agent-runner"].stop_grace_period,
      $services["mapping-producer-1"].stop_grace_period,
      $services["mapping-producer-2"].stop_grace_period,
      $services["supply-reviewer-1"].stop_grace_period,
      $services["supply-reviewer-2"].stop_grace_period,
      $services["coverage-planner"].stop_grace_period,
      $services["affiliate-replenishment-controller"].stop_grace_period
    ]
  | length == 7
    and all(.[]; grace_seconds > 1200)
' /path/to/affiliate-governed-private/governed-compose.redacted.json
```
The redaction keeps environment names and removes every environment value. It
keeps only reviewed network names and their internal flags. The validation must
succeed. The gateway environment check proves the required operational email,
SMTP, human-directed, and dedicated supervisor-halt names remain present in
redacted form; the following placement check proves the halt name is absent
from the runner, its Codex child environment, and the non-supervisor helpers.
Do not copy SMTP values or any other secret from the raw stream into another
artifact. Use the redacted file for topology review. The runner's private
cgroup mode and namespace-relative target are retained; no host cgroup source
or bind path is retained or accepted.
```text
jq -e --arg expected "$REVIEWED_GATEWAY_IMAGE" \
  '.services["affiliate-gateway"].image == $expected
   and (.services["affiliate-gateway"].image | test("@sha256:[a-f0-9]{64}$"; "i"))
   and .services["affiliate-replenishment-controller"].image == $expected
   and (.services["affiliate-replenishment-controller"].image
     | test("@sha256:[a-f0-9]{64}$"; "i"))' \
  /path/to/affiliate-governed-private/governed-compose.redacted.json
```
```text
jq -e --arg expected "$REVIEWED_AGENT_IMAGE" '
  .services as $services
  | [
      $services["affiliate-agent-runner"],
      $services["mapping-producer-1"],
      $services["mapping-producer-2"],
      $services["supply-reviewer-1"],
      $services["supply-reviewer-2"],
      $services["affiliate-agent-downstream-ready"],
      $services["coverage-planner"]
    ]
  | all(.[]; .image == $expected and (.image | test("@sha256:[a-f0-9]{64}$"; "i")))
' /path/to/affiliate-governed-private/governed-compose.redacted.json
```
```text
jq -e '
  .services["affiliate-replenishment-controller"] as $controller
  | ($controller.environment | index("AFFILIATE_AGENT_GATEWAY_ADDRESS=<redacted>") != null)
  and ($controller.environment | index("AFFILIATE_AGENT_GATEWAY_PATH_PREFIX=<redacted>") != null)
  and ($controller.environment | index("AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=<redacted>") != null)
  and ($controller.environment | index("AFFILIATE_REPLENISHMENT_INTERVAL_SECONDS=<redacted>") != null)
  and (($controller.command | join("\n"))
    | contains("npm run affiliate:replenishment:controller"))
  and ($controller.networks == ["gateway_internal"])
  and (($controller.command | join("\n")) | contains("INTERVAL_SECONDS=900"))
  and (all($controller.environment[];
    contains("AFFILIATE_GATEWAY_OPERATOR_TOKEN") | not))
' /path/to/affiliate-governed-private/governed-compose.redacted.json
```
The replenishment token is a dedicated, replenishment-only credential. It is
not the gateway operator token and must never be accepted in its place.
The redacted artifact intentionally hides the interval value. The pre-redaction
Compose check above resolves and validates it; any override other than the
reviewed 900-second cadence blocks creation.

The controller uses the gateway image only as a protected cadence client. The
shell loop starts one authenticated gateway request per protected interval and
exits on a request error or invalid interval; the reviewed restart policy then
determines whether Docker restarts the exact container. It has no database URL,
production-backend network, provider key, Codex auth seed, runner socket, or
artifact volume. The gateway selects the reviewed active contract cohort and
performs the persistence operation.
```text
jq -e '
  .services["affiliate-replenishment-controller"].environment
  | any(.[]; contains("AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=<redacted>"))
  and all(.[]; contains("AFFILIATE_GATEWAY_OPERATOR_TOKEN") | not)
  and all(.[]; contains("DATABASE_URL") | not)
  and all(.[]; contains("PRODUCTION_BACKEND") | not)
  and all(.[]; contains("AFFILIATE_SCRAPINGDOG_API_KEY") | not)
  and all(.[]; contains("AFFILIATE_FIRECRAWL_API_KEY") | not)
  and all(.[]; contains("AFFILIATE_AGENT_CODEX") | not)
' /path/to/affiliate-governed-private/governed-compose.redacted.json
```

## On-demand human-directed executor

`HUMAN_DIRECTED_EXECUTOR` is an on-demand role, not an always-on Compose
service. Do not add it to the governed topology or leave its supervisor
running between approved lifecycle commands. The gateway's reviewed role map
binds worker ID `human-directed-executor` to
`AFFILIATE_HUMAN_DIRECTED_EXECUTOR_CREDENTIAL`. Keep that credential in the
private deployment environment and never print it, put it in a command
argument, or include it in a redacted artifact.

The human-directed supervisor has its own runner protocol key pair. Never reuse
`AFFILIATE_MAPPING_PRODUCER_1_RUNNER_PROTOCOL_PRIVATE_KEY`. Generate the pair
before the runner starts, and add only the public key to the reviewed runner
key map through the approved private deployment-environment procedure. The map
must retain the five always-on worker entries and also contain
`"human-directed-executor"` with this public key. If the runner is already
running without that entry, stop and recreate it only after the reviewed map
has been updated and separately authorized.

```text
export HUMAN_EXECUTOR_RUNNER_KEY_DIR=/path/to/affiliate-governed-private/human-executor-runner-key
test ! -e "$HUMAN_EXECUTOR_RUNNER_KEY_DIR"
install -d -m 0700 "$HUMAN_EXECUTOR_RUNNER_KEY_DIR"
export HUMAN_EXECUTOR_RUNNER_PRIVATE_DER="$HUMAN_EXECUTOR_RUNNER_KEY_DIR/private.der"
export HUMAN_EXECUTOR_RUNNER_PUBLIC_DER="$HUMAN_EXECUTOR_RUNNER_KEY_DIR/public.der"
openssl genpkey -algorithm Ed25519 -outform DER \
  -out "$HUMAN_EXECUTOR_RUNNER_PRIVATE_DER"
openssl pkey -inform DER -in "$HUMAN_EXECUTOR_RUNNER_PRIVATE_DER" \
  -pubout -outform DER -out "$HUMAN_EXECUTOR_RUNNER_PUBLIC_DER"
chmod 0600 "$HUMAN_EXECUTOR_RUNNER_PRIVATE_DER"
chmod 0644 "$HUMAN_EXECUTOR_RUNNER_PUBLIC_DER"
export AFFILIATE_HUMAN_DIRECTED_EXECUTOR_RUNNER_PROTOCOL_PRIVATE_KEY="$(
  base64 -w 0 "$HUMAN_EXECUTOR_RUNNER_PRIVATE_DER"
)"
export AFFILIATE_HUMAN_DIRECTED_EXECUTOR_RUNNER_PROTOCOL_PUBLIC_KEY="$(
  base64 -w 0 "$HUMAN_EXECUTOR_RUNNER_PUBLIC_DER"
)"
test -n "$AFFILIATE_HUMAN_DIRECTED_EXECUTOR_RUNNER_PROTOCOL_PRIVATE_KEY"
test -n "$AFFILIATE_HUMAN_DIRECTED_EXECUTOR_RUNNER_PROTOCOL_PUBLIC_KEY"
```

Set the reviewed map through the approved private deployment-environment
procedure before starting the runner. For a protected shell that already has
the reviewed five-entry map loaded, this produces the six-entry map without
printing either key:

```text
export AFFILIATE_AGENT_RUNNER_PROTOCOL_PUBLIC_KEYS="$(
  jq -ce --arg public \
    "$AFFILIATE_HUMAN_DIRECTED_EXECUTOR_RUNNER_PROTOCOL_PUBLIC_KEY" '
    if type == "object" and .["human-directed-executor"]? == null
    then . + {"human-directed-executor": $public}
    else error("runner public-key map already contains human-directed-executor or is not an object")
    end
  ' <<< "$AFFILIATE_AGENT_RUNNER_PROTOCOL_PUBLIC_KEYS"
)"
jq -e --arg public \
  "$AFFILIATE_HUMAN_DIRECTED_EXECUTOR_RUNNER_PROTOCOL_PUBLIC_KEY" '
  type == "object"
  and (.["human-directed-executor"] // "") == $public
  and (keys | length) == 6
' <<< "$AFFILIATE_AGENT_RUNNER_PROTOCOL_PUBLIC_KEYS" >/dev/null
```

Start the supervisor in a separate protected terminal while global admission is
closed. It uses the existing agent image and workspace/runner boundary as an
ephemeral `--rm` container; the only changed role values are the safe role and
worker ID. Load the reviewed human credential into the protected shell without
echoing it:

```text
: "${AFFILIATE_HUMAN_DIRECTED_EXECUTOR_CREDENTIAL:?Load the reviewed human-directed executor credential into the protected shell}"
export AFFILIATE_AGENT_ROLE_CREDENTIAL="$AFFILIATE_HUMAN_DIRECTED_EXECUTOR_CREDENTIAL"
export AFFILIATE_AGENT_RUNNER_PROTOCOL_PRIVATE_KEY="$AFFILIATE_HUMAN_DIRECTED_EXECUTOR_RUNNER_PROTOCOL_PRIVATE_KEY"
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml run --rm --no-deps \
  -e AFFILIATE_AGENT_ROLE=HUMAN_DIRECTED_EXECUTOR \
  -e AFFILIATE_AGENT_WORKER_ID=human-directed-executor \
  -e AFFILIATE_AGENT_RUNNER_PROTOCOL_PRIVATE_KEY \
  -e AFFILIATE_AGENT_ROLE_CREDENTIAL \
  mapping-producer-1 \
  /usr/local/bin/affiliate-agent-supervisor \
  --role=HUMAN_DIRECTED_EXECUTOR \
  --worker-id=human-directed-executor
unset AFFILIATE_AGENT_ROLE_CREDENTIAL AFFILIATE_AGENT_RUNNER_PROTOCOL_PRIVATE_KEY
```

The on-demand supervisor startup calls the worker-authenticated
`POST /v1/affiliate-agent/reconcile/worker` with
`{role:"HUMAN_DIRECTED_EXECUTOR",workerId:"human-directed-executor",roleCredential:<credential>}`,
then uses worker-authenticated `POST
/v1/affiliate-agent/admission/worker/status` while it waits. It has no
operator token. Wait for its exact worker heartbeat/readiness before opening
the bounded lease below. If the worker-auth request is rejected, stop the
ephemeral supervisor and do not substitute the operator token.

In a second authorized operator terminal, open exactly one bounded lease after
the human worker is ready. Use the gateway-container pattern from
**Bounded canary admission** with this exact body and no credential in the
shell command:

```text
export HUMAN_EXECUTOR_ADMISSION_OUTPUT=/path/to/affiliate-governed-private/human-executor-admission.redacted.json
test ! -e "$HUMAN_EXECUTOR_ADMISSION_OUTPUT"
install -m 0600 /dev/null "$HUMAN_EXECUTOR_ADMISSION_OUTPUT"
set -Eeuo pipefail
export HUMAN_EXECUTOR_RECEIPT_SINCE="$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')"
export HUMAN_EXECUTOR_RECEIPT_OUTPUT=/path/to/affiliate-governed-private/human-executor-terminal-receipt.json
export HUMAN_EXECUTOR_CLOSE_OUTPUT=/path/to/affiliate-governed-private/human-executor-admission-close.redacted.json
for human_output in "$HUMAN_EXECUTOR_RECEIPT_OUTPUT" "$HUMAN_EXECUTOR_CLOSE_OUTPUT"; do
  test ! -e "$human_output"
  test ! -L "$human_output"
  install -m 0600 /dev/null "$human_output"
done
HUMAN_EXECUTOR_LEASE_OPEN=0
close_human_executor_admission() {
  if test "${HUMAN_EXECUTOR_LEASE_OPEN:-0}" != 1; then
    return 0
  fi
  if ! docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/admission/close", {
  method: "POST",
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "closed" || body.open !== false) {
    throw new Error(JSON.stringify(body));
  }
  console.log(JSON.stringify({status: body.status, open: body.open}));
}).catch((error) => { console.error(error); process.exitCode = 1; });
' > "$HUMAN_EXECUTOR_CLOSE_OUTPUT"; then
    return 1
  fi
  if ! jq -e '.status == "closed" and .open == false' "$HUMAN_EXECUTOR_CLOSE_OUTPUT" >/dev/null; then
    return 1
  fi
  HUMAN_EXECUTOR_LEASE_OPEN=0
}
on_human_executor_exit() {
  human_exit_status=$?
  if ! close_human_executor_admission; then
    human_exit_status=1
  fi
  exit "$human_exit_status"
}
trap on_human_executor_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
const roleCredential = process.env.AFFILIATE_HUMAN_DIRECTED_EXECUTOR_CREDENTIAL;
if (!roleCredential) throw new Error("The reviewed human-directed executor credential is unavailable.");
fetch("http://127.0.0.1:8080" + prefix + "/admission/open", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN
  },
  body: JSON.stringify({
    role: "HUMAN_DIRECTED_EXECUTOR",
    workerId: "human-directed-executor",
    roleCredential,
    leaseSeconds: 300
  })
}).then(async (response) => {
  const body = await response.json();
  const lease = body.lease;
  if (!response.ok || body.status !== "open" || body.open !== true
      || !lease || lease.role !== "HUMAN_DIRECTED_EXECUTOR"
      || lease.workerId !== "human-directed-executor"
      || lease.remainingClaims !== 1
      || Date.parse(lease.expiresAt || "") <= Date.now()) {
    throw new Error(JSON.stringify(body));
  }
  console.log(JSON.stringify({
    status: body.status,
    open: body.open,
    lease: {
      role: lease.role,
      workerId: lease.workerId,
      expiresAt: lease.expiresAt,
      remainingClaims: lease.remainingClaims
    }
  }));
}).catch((error) => { console.error(error); process.exitCode = 1; });
' > "$HUMAN_EXECUTOR_ADMISSION_OUTPUT"
jq -e '
  .status == "open"
  and .open == true
  and .lease.role == "HUMAN_DIRECTED_EXECUTOR"
  and .lease.workerId == "human-directed-executor"
  and .lease.remainingClaims == 1
  and (.lease.expiresAt | type == "string" and length > 0)
' "$HUMAN_EXECUTOR_ADMISSION_OUTPUT"
HUMAN_EXECUTOR_LEASE_OPEN=1
shasum -a 256 "$HUMAN_EXECUTOR_ADMISSION_OUTPUT" \
  >> "$DEPLOYMENT_EVIDENCE_HASH"
# After the supervisor has produced its one terminal operation, capture the
# durable receipt joined to the exact human claim and worker. Do not accept a
# receipt copied from another role, worker, or earlier lease.
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  --tuples-only --no-align -v since="$HUMAN_EXECUTOR_RECEIPT_SINCE" -Atc "
SELECT COALESCE(json_agg(json_build_object(
  'receiptId', receipt.\"id\",
  'claimId', receipt.\"claimId\",
  'jobId', receipt.\"jobId\",
  'claimGeneration', receipt.\"claimGeneration\",
  'role', claim.\"role\",
  'workerId', claim.\"workerId\",
  'operationKind', receipt.\"operationKind\",
  'status', receipt.\"status\",
  'safeErrorCode', receipt.\"safeErrorCode\",
  'startedAt', receipt.\"startedAt\",
  'completedAt', receipt.\"completedAt\"
) ORDER BY receipt.\"createdAt\" DESC), '[]'::json)
FROM \"AffiliateAgentGatewayOperationReceipts\" receipt
JOIN \"AffiliateAgentGatewayClaims\" claim ON claim.\"id\" = receipt.\"claimId\"
WHERE claim.\"role\" = 'HUMAN_DIRECTED_EXECUTOR'
  AND claim.\"workerId\" = 'human-directed-executor'
  AND receipt.\"createdAt\" >= :'since'::timestamptz
  AND receipt.\"status\" <> 'PENDING';" \
  > "$HUMAN_EXECUTOR_RECEIPT_OUTPUT"
jq -e '
  type == "array"
  and length == 1
  and .[0].receiptId != null
  and .[0].claimId != null
  and .[0].jobId != null
  and .[0].role == "HUMAN_DIRECTED_EXECUTOR"
  and .[0].workerId == "human-directed-executor"
  and .[0].claimGeneration != null
  and .[0].status != "PENDING"
' "$HUMAN_EXECUTOR_RECEIPT_OUTPUT"
close_human_executor_admission
jq -e '.status == "closed" and .open == false' "$HUMAN_EXECUTOR_CLOSE_OUTPUT"
trap - EXIT INT TERM
shasum -a 256 \
  "$HUMAN_EXECUTOR_RECEIPT_OUTPUT" \
  "$HUMAN_EXECUTOR_CLOSE_OUTPUT" \
  >> "$DEPLOYMENT_EVIDENCE_HASH"
```

The bounded operator lease is the only admission-opening path. Do not call
`/admission/open` from the supervisor, do not grant an unbounded lease, and do
not run a second human supervisor. After the one approved terminal receipt,
interrupt the ephemeral supervisor and close admission using the authenticated
operator close step. Require the safe closed response before retaining the
lease artifact in the reviewed evidence bundle. A missing worker-auth
response, readiness result, bounded lease, terminal receipt, or closed response
halts the lifecycle command.

## Run writable cutover CLIs from reviewed code

Run `affiliate:cutover:session`, `affiliate:cutover:reconcile`, and
`affiliate:cutover:rollback` from a dedicated operator runtime. Do not run
these commands from a production application checkout or an unverified
worktree. If an approved operator service or image exists, use one that
contains these cutover scripts and pin it to its approved immutable image
digest. The governed worker and gateway images in this directory do not
contain the cutover CLI. Do not use them as the operator runtime.

If no approved operator image is available, prepare a dedicated Node 22
runtime from the exact reviewed commit:

```text
export OPERATOR_CHECKOUT=/srv/bracketiq/affiliate-governed/operator-checkout
export REVIEWED_CODE_COMMIT=REPLACE_WITH_REVIEWED_COMMIT_SHA
export OPERATOR_CLI_DIR="$OPERATOR_CHECKOUT/apps/site"
test -d "$OPERATOR_CHECKOUT/.git"
test -z "$(git -C "$OPERATOR_CHECKOUT" status --porcelain)"
test "$(git -C "$OPERATOR_CHECKOUT" rev-parse HEAD)" = "$REVIEWED_CODE_COMMIT"
test "$(node -p 'process.versions.node.split(".")[0]')" = "22"
cd "$OPERATOR_CLI_DIR"
npm ci
test -z "$(git -C "$OPERATOR_CHECKOUT" status --porcelain)"
test "$(git -C "$OPERATOR_CHECKOUT" rev-parse HEAD)" = "$REVIEWED_CODE_COMMIT"
```

For an approved operator image, set `OPERATOR_CLI_DIR` to its reviewed
`apps/site` directory instead. Keep the operator shell in that directory for
all commands below.

Create the protected operator database URL file through the approved secret
procedure. Use an exclusive create. Refuse to overwrite an existing file:

```text
export OPERATOR_DATABASE_URL_FILE=/path/to/affiliate-governed-private/operator-database-url
test ! -e "$OPERATOR_DATABASE_URL_FILE"
if ! (
  umask 077
  set -o noclobber
  : > "$OPERATOR_DATABASE_URL_FILE"
); then
  printf '%s\n' "Refusing to overwrite the operator database URL file." >&2
  exit 1
fi
chmod 0600 "$OPERATOR_DATABASE_URL_FILE"
test ! -L "$OPERATOR_DATABASE_URL_FILE"
# Write the reviewed DATABASE_URL value with the approved secret procedure.
test -s "$OPERATOR_DATABASE_URL_FILE"
export DATABASE_URL="$(cat "$OPERATOR_DATABASE_URL_FILE")"
test -n "$DATABASE_URL"
```

Reject placeholder identities before any durable write. Keep this function in
the protected operator shell:

```text
assert_non_placeholder_identity() {
  identity_value="${1:-}"
  identity_label="${2:-identity}"
  case "$identity_value" in
    ""|"REPLACE_WITH_"*|"<"*|*"PLACEHOLDER"*|*"placeholder"*|*"EXAMPLE"*|*"example.test"*)
      printf '%s\n' "$identity_label is empty or a placeholder." >&2
      return 1
      ;;
  esac
}
```

Keep `DATABASE_URL` in the protected operator shell. `prismaConfig` requires
this variable. Do not replace it with `AFFILIATE_GATEWAY_DATABASE_URL` or
`PGSERVICEFILE`; those variables do not configure the Prisma CLI. Use this
runtime and shell for every writable session, APPLY, and rollback command.

Use `umask 077` in the shell that creates local evidence files:

```text
umask 077
```


1. Before this production state change, obtain separate current authorization.
   Stop the legacy fleet by the approved operator procedure. Do not start the
   governed fleet yet.

2. Verify that the legacy writers remain disabled and inactive. Run these
   commands on the production host and capture the result in the independent
   process inventory:

```text
export LEGACY_UNITS_OUTPUT=/path/to/affiliate-governed-private/affiliate-legacy-units.txt
install -m 0600 /dev/null "$LEGACY_UNITS_OUTPUT"
intake_enabled="$(systemctl is-enabled bracketiq-affiliate-intake-automation.timer 2>/dev/null || true)"
intake_active="$(systemctl is-active bracketiq-affiliate-intake-automation.timer 2>/dev/null || true)"
printf '%s enabled=%s active=%s\n' \
  bracketiq-affiliate-intake-automation.timer "$intake_enabled" "$intake_active" \
  > "$LEGACY_UNITS_OUTPUT"
case "$intake_enabled" in
  disabled|masked) ;;
  *) exit 1 ;;
esac
test "$intake_active" = inactive

scrape_enabled="$(systemctl is-enabled bracketiq-affiliate-scrape-daily.timer 2>/dev/null || true)"
scrape_active="$(systemctl is-active bracketiq-affiliate-scrape-daily.timer 2>/dev/null || true)"
printf '%s enabled=%s active=%s\n' \
  bracketiq-affiliate-scrape-daily.timer "$scrape_enabled" "$scrape_active" \
  >> "$LEGACY_UNITS_OUTPUT"
case "$scrape_enabled" in
  disabled|masked)
    test "$scrape_active" = inactive
    ;;
  not-found|unknown|UNKNOWN)
    case "$scrape_active" in
      inactive|not-found|unknown|UNKNOWN) ;;
      *) exit 1 ;;
    esac
    ;;
  *) exit 1 ;;
esac
for controller_unit in \
  bracketiq-affiliate-controller.service \
  bracketiq-affiliate-controller.timer; do
  controller_enabled="$(systemctl is-enabled "$controller_unit" 2>/dev/null || true)"
  controller_active="$(systemctl is-active "$controller_unit" 2>/dev/null || true)"
  printf '%s enabled=%s active=%s\n' \
    "$controller_unit" "$controller_enabled" "$controller_active" \
    >> "$LEGACY_UNITS_OUTPUT"
  case "$controller_enabled" in
    disabled|masked) ;;
    *) exit 1 ;;
  esac
  test "$controller_active" = inactive
done
```

Preserve the exact systemd unit-file state and active state in a separate
protected artifact. `UnitFileState` is the source for the inventory
`isEnabled` field. `ActiveState` is the source for `isActive`; do not replace
either value with a guessed boolean:

```text
export LEGACY_UNIT_STATE_OUTPUT=/path/to/affiliate-governed-private/affiliate-legacy-unit-state.initial.txt
test ! -e "$LEGACY_UNIT_STATE_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  systemctl show 'bracketiq-affiliate-*' \
    -p Id -p UnitFileState -p ActiveState -p SubState --no-pager \
    > "$LEGACY_UNIT_STATE_OUTPUT"
); then
  rm -f "$LEGACY_UNIT_STATE_OUTPUT"
  exit 1
fi
test -s "$LEGACY_UNIT_STATE_OUTPUT"
awk -F= '
  /^Id=/ { id=$2 }
  /^UnitFileState=/ { enabled=$2 }
  /^ActiveState=/ { active=$2 }
  /^SubState=/ {
    substate=$2
    if (id == "" || enabled == "" || active == "" || substate == "") exit 1
    if (enabled !~ /^(disabled|masked)$/) exit 1
    if (active != "inactive") exit 1
    id=""; enabled=""; active=""; substate=""
  }
' "$LEGACY_UNIT_STATE_OUTPUT"
```

For each reviewed stopped writer, copy the exact `UnitFileState` and
`ActiveState` values into `legacyServiceUnits` as `isEnabled` and `isActive`.
Keep `SubState` in the sidecar evidence. A missing unit, missing state, active
unit, or changed state is a blocking finding.


The reviewed legacy process manifest requires the intake timer and both
open-weight controller units (`bracketiq-affiliate-controller.service` and
`.timer`) to be installed but disabled or masked and inactive before removal.
The mapped-source scrape timer is optional: an absent unit is recorded as
`not-found` or `UNKNOWN`, while an installed unit must report `disabled` or
`masked` and `inactive`. These absent/unknown states are accepted only for the
mapped-source scrape timer; never treat an enabled or active writer as safe. Do
not run a legacy writer, open-weight controller, or retired package command
to produce inventory data in production.


## Post-legacy-stop production gates

Keep admission closed. Do not start a governed container until all gates in
this section pass. Do not treat a local result as production evidence.

Set the operator identity in the protected environment before any durable
database write. Replace the example value through the approved operator
procedure. The placeholder check must pass:

```text
export OPERATOR_ID=REPLACE_WITH_AUTHORIZED_OPERATOR_ID
assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
```

Prepare a protected PostgreSQL service definition and password file with the
approved operator secret procedure. The service definition must point to the
reviewed database. Do not put either file in the repository or shared logs:

```text
export PGSERVICEFILE=/path/to/affiliate-governed-private/pg_service.conf
export PGSERVICE=bracketiq-affiliate-inspection
export PGPASSFILE=/path/to/affiliate-governed-private/pgpass
test -r "$PGSERVICEFILE"
test -r "$PGPASSFILE"
test ! -L "$PGSERVICEFILE"
test ! -L "$PGPASSFILE"
test "$(stat -c '%a' "$PGSERVICEFILE")" = "600"
test "$(stat -c '%a' "$PGPASSFILE")" = "600"
```

Verify the database identity and effective role permissions. Role attributes
such as `rolsuper` and `rolcanlogin` do not prove effective access. Use the
protected service and password files. Do not put a URL, password, or secret
option in the `psql` command:

```text
: "${REVIEWED_DATABASE_NAME:?Set reviewed current_database value}"
: "${REVIEWED_DATABASE_ROLE:?Set reviewed current_user value}"
: "${REVIEWED_DATABASE_SERVER:?Set reviewed database server identity}"
assert_non_placeholder_identity "$REVIEWED_DATABASE_NAME" "REVIEWED_DATABASE_NAME"
assert_non_placeholder_identity "$REVIEWED_DATABASE_ROLE" "REVIEWED_DATABASE_ROLE"
assert_non_placeholder_identity "$REVIEWED_DATABASE_SERVER" "REVIEWED_DATABASE_SERVER"
export DATABASE_IDENTITY_OUTPUT=/path/to/affiliate-governed-private/affiliate-database-identity.tsv
export DATABASE_URL_IDENTITY_OUTPUT=/path/to/affiliate-governed-private/affiliate-database-url-identity.tsv
install -m 0600 /dev/null "$DATABASE_IDENTITY_OUTPUT"
install -m 0600 /dev/null "$DATABASE_URL_IDENTITY_OUTPUT"
assert_reviewed_database_identity() {
  psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
    --tuples-only --no-align --field-separator="$(printf '\t')" \
    -c "select current_database(), current_user, coalesce(inet_server_addr()::text, 'local')" \
    > "$DATABASE_IDENTITY_OUTPUT"
  test "$(cut -f1 "$DATABASE_IDENTITY_OUTPUT")" = "$REVIEWED_DATABASE_NAME"
  test "$(cut -f2 "$DATABASE_IDENTITY_OUTPUT")" = "$REVIEWED_DATABASE_ROLE"
  test "$(cut -f3 "$DATABASE_IDENTITY_OUTPUT")" = "$REVIEWED_DATABASE_SERVER"
  (
    cd "$OPERATOR_CLI_DIR"
    ./node_modules/.bin/tsx -e '
      import { prisma } from "./src/lib/prisma";
      (async () => {
        const rows = await prisma.$queryRaw`select current_database() as database_name, current_user as role_name, coalesce(inet_server_addr()::text, $$local$$) as server_address`;
        const row = rows[0] as Record<string, unknown> | undefined;
        if (!row) throw new Error("DATABASE_URL identity query returned no row.");
        process.stdout.write(`${row.database_name}\t${row.role_name}\t${row.server_address}\n`);
      })().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      }).finally(async () => {
        await prisma.$disconnect();
      });
    '
  ) > "$DATABASE_URL_IDENTITY_OUTPUT"
  test "$(cut -f1 "$DATABASE_URL_IDENTITY_OUTPUT")" = "$REVIEWED_DATABASE_NAME"
  test "$(cut -f2 "$DATABASE_URL_IDENTITY_OUTPUT")" = "$REVIEWED_DATABASE_ROLE"
  test "$(cut -f3 "$DATABASE_URL_IDENTITY_OUTPUT")" = "$REVIEWED_DATABASE_SERVER"
  cmp -s "$DATABASE_IDENTITY_OUTPUT" "$DATABASE_URL_IDENTITY_OUTPUT"
}
assert_reviewed_database_identity
export GATEWAY_DATABASE_IDENTITY_OUTPUT=/path/to/affiliate-governed-private/gateway-database-identity.json
capture_container_database_identity() {
  local container_id="$1"
  local output="$2"
  test ! -e "$output"
  test ! -L "$output"
  if ! (
    umask 077
    set -o noclobber
    docker exec "$container_id" node -e '
const { PrismaClient } = require("@prisma/client");
const url = process.env.AFFILIATE_GATEWAY_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Container database URL is missing.");
const client = new PrismaClient({ datasources: { db: { url } } });
(async () => {
  const rows = await client.$queryRawUnsafe(
    "select current_database() as database_name, current_user as role_name, coalesce(inet_server_addr()::text, $$local$$) as server_address",
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Container identity query returned no unique row.");
  process.stdout.write(JSON.stringify(rows[0]));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await client.$disconnect();
});
' > "$output"
  ); then
    rm -f "$output"
    return 1
  fi
  jq -e --arg database "$REVIEWED_DATABASE_NAME" \
    --arg role "$REVIEWED_DATABASE_ROLE" \
    --arg server "$REVIEWED_DATABASE_SERVER" '
    .database_name == $database
    and .role_name == $role
    and .server_address == $server
  ' "$output" >/dev/null
}
```
After the gateway starts, call `capture_container_database_identity` with the
exact gateway container ID. The redacted identity object must match the
reviewed `current_database()`, `current_user`, and `inet_server_addr()` tuple.
The replenishment controller is a gateway-only cadence client and has no
database identity to capture; retain its gateway-network and
replenishment-only-credential checks in the redacted container evidence.
Do not copy a database URL or password into any artifact.
Before running this migration, provision the three governed database group roles
from a separate, protected DBA service. Do not let the runtime
`bracketiq_app` login create roles, and do not put a role password in this
runbook. The role provisioning is idempotent only for absent roles; an
existing role with login, superuser, createdb, or createrole authority is a
blocking mismatch. The gateway login is granted only the gateway group role.

```text
export PGADMIN_SERVICE=bracketiq-affiliate-admin
export REVIEWED_DATABASE_ADMIN_ROLE=REPLACE_WITH_REVIEWED_DBA_ROLE
export DATABASE_ROLE_PROVISION_OUTPUT=/path/to/affiliate-governed-private/affiliate-database-role-provision.txt
assert_non_placeholder_identity "$REVIEWED_DATABASE_ADMIN_ROLE" "REVIEWED_DATABASE_ADMIN_ROLE"
test "$PGADMIN_SERVICE" != "$PGSERVICE"
install -m 0600 /dev/null "$DATABASE_ROLE_PROVISION_OUTPUT"
psql --service="$PGADMIN_SERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  --tuples-only --no-align --field-separator="$(printf '\t')" <<'SQL' \
  > "$DATABASE_ROLE_PROVISION_OUTPUT"
DO $$
DECLARE
  governed_role text;
  login_role record;
BEGIN
  FOREACH governed_role IN ARRAY ARRAY[
    'bracketiq_affiliate_gateway',
    'bracketiq_affiliate_lifecycle',
    'bracketiq_affiliate_agent'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = governed_role) THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
        governed_role
      );
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname IN (
      'bracketiq_affiliate_gateway',
      'bracketiq_affiliate_lifecycle',
      'bracketiq_affiliate_agent'
    )
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit)
  ) THEN
    RAISE EXCEPTION 'A governed group role has unsafe role attributes.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'bracketiq_app'
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND rolinherit
  ) THEN
    RAISE EXCEPTION 'The reviewed runtime role bracketiq_app is missing or unsafe.';
  END IF;
  -- Preserve effective access for existing logins before removing PUBLIC access.
  FOR login_role IN
    SELECT rolname,
      has_database_privilege(rolname, current_database(), 'CONNECT') AS can_connect,
      has_schema_privilege(rolname, 'public', 'USAGE') AS can_use_schema
    FROM pg_roles WHERE rolcanlogin
  LOOP
    IF login_role.can_connect THEN
      EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), login_role.rolname);
    END IF;
    IF login_role.can_use_schema THEN
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', login_role.rolname);
    END IF;
  END LOOP;
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', current_database());
  REVOKE USAGE ON SCHEMA public FROM PUBLIC;
  GRANT USAGE ON SCHEMA public TO bracketiq_affiliate_gateway;
  -- Restore conditional grants when the gateway schema predates the roles.
  IF to_regclass('"AffiliateAgentGatewayJobs"') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE
      "AffiliateAgentGatewayJobs", "AffiliateAgentGatewayClaims",
      "AffiliateAgentGatewayOperationReceipts" TO bracketiq_affiliate_gateway;
    GRANT SELECT, INSERT ON TABLE
      "AffiliateAgentGatewayArtifacts", "AffiliateAgentGatewayEvents"
      TO bracketiq_affiliate_gateway;
  END IF;
  GRANT bracketiq_affiliate_gateway TO bracketiq_app;
END
$$;
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit
FROM pg_roles
WHERE rolname IN (
  'bracketiq_affiliate_gateway',
  'bracketiq_affiliate_lifecycle',
  'bracketiq_affiliate_agent',
  'bracketiq_app'
)
ORDER BY rolname;
SQL
test -s "$DATABASE_ROLE_PROVISION_OUTPUT"
awk -F '\t' '
  NF != 6 || $1 == "" || $2 == "" || $3 == "" || $4 == "" || $5 == "" || $6 == "" { exit 1 }
  if ($1 != "bracketiq_app" && ($2 != "f" || $3 != "f" || $4 != "f" || $5 != "f" || $6 != "f")) exit 1
  if ($1 == "bracketiq_app" && ($2 != "t" || $3 != "f" || $4 != "f" || $5 != "f" || $6 != "t")) exit 1
  count += 1
  END { exit count == 4 ? 0 : 1 }
' "$DATABASE_ROLE_PROVISION_OUTPUT"
```

The role-provisioning artifact is supplemental evidence and is not part of the
strict cutover inventory. If the role check fails, stop before migration or
any conditional grant. Capture the artifact hash with the other database
evidence.
Before the schema migration, obtain separate current authorization for this
production state change. Provision an owner-only migration credential through
the approved secret procedure. Use it only in the temporary
`SCHEMA_MIGRATION_DATABASE_URL` environment below; never reuse the gateway
runtime `bracketiq_app` URL and never print either credential:

```text
export SCHEMA_MIGRATION_DATABASE_URL_FILE=/path/to/affiliate-governed-private/schema-migration-database-url
test ! -e "$SCHEMA_MIGRATION_DATABASE_URL_FILE"
if ! (
  umask 077
  set -o noclobber
  : > "$SCHEMA_MIGRATION_DATABASE_URL_FILE"
); then
  printf '%s\n' "Refusing to overwrite the schema migration credential file." >&2
  exit 1
fi
chmod 0600 "$SCHEMA_MIGRATION_DATABASE_URL_FILE"
test ! -L "$SCHEMA_MIGRATION_DATABASE_URL_FILE"
# Write the reviewed owner-only migration DATABASE_URL with the approved secret procedure.
test -s "$SCHEMA_MIGRATION_DATABASE_URL_FILE"
export SCHEMA_MIGRATION_DATABASE_URL="$(cat "$SCHEMA_MIGRATION_DATABASE_URL_FILE")"
test -n "$SCHEMA_MIGRATION_DATABASE_URL"
test "$SCHEMA_MIGRATION_DATABASE_URL" != "$DATABASE_URL"
assert_reviewed_database_identity
export SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT=/path/to/affiliate-governed-private/schema-migration-database-identity.tsv
test ! -e "$SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT"
install -m 0600 /dev/null "$SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT"
(
  cd "$OPERATOR_CLI_DIR"
  DATABASE_URL="$SCHEMA_MIGRATION_DATABASE_URL" \
    ./node_modules/.bin/tsx -e '
      import { prisma } from "./src/lib/prisma";
      (async () => {
        const rows = await prisma.$queryRaw`select current_database() as database_name, current_user as role_name, coalesce(inet_server_addr()::text, $$local$$) as server_address`;
        const row = rows[0] as Record<string, unknown> | undefined;
        if (!row) throw new Error("SCHEMA_MIGRATION_DATABASE_URL identity query returned no row.");
        process.stdout.write(`${row.database_name}\t${row.role_name}\t${row.server_address}\n`);
      })().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      }).finally(async () => {
        await prisma.$disconnect();
      });
    '
) > "$SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT"
test "$(wc -l < "$SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT" | tr -d '[:space:]')" = "1"
test -n "$(cut -f1 "$SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT")"
test -n "$(cut -f2 "$SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT")"
test -n "$(cut -f3 "$SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT")"
test "$(cut -f1 "$SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT")" = \
  "$(cut -f1 "$DATABASE_URL_IDENTITY_OUTPUT")"
test "$(cut -f3 "$SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT")" = \
  "$(cut -f3 "$DATABASE_URL_IDENTITY_OUTPUT")"
test "$(cut -f2 "$SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT")" != \
  "$(cut -f2 "$DATABASE_URL_IDENTITY_OUTPUT")"
test "$(cut -f2 "$SCHEMA_MIGRATION_DATABASE_IDENTITY_OUTPUT")" != \
  "$REVIEWED_DATABASE_ROLE"
export SCHEMA_MIGRATION_DEPLOY_OUTPUT=/path/to/affiliate-governed-private/schema-migration-deploy.txt
export SCHEMA_MIGRATION_STATUS_OUTPUT=/path/to/affiliate-governed-private/schema-migration-status.txt
install -m 0600 /dev/null "$SCHEMA_MIGRATION_DEPLOY_OUTPUT"
install -m 0600 /dev/null "$SCHEMA_MIGRATION_STATUS_OUTPUT"
DATABASE_URL="$SCHEMA_MIGRATION_DATABASE_URL" npm run --silent migrate:deploy \
  > "$SCHEMA_MIGRATION_DEPLOY_OUTPUT"
test -s "$SCHEMA_MIGRATION_DEPLOY_OUTPUT"
DATABASE_URL="$SCHEMA_MIGRATION_DATABASE_URL" \
  npx prisma migrate status --schema prisma/schema.prisma \
  > "$SCHEMA_MIGRATION_STATUS_OUTPUT"
test -s "$SCHEMA_MIGRATION_STATUS_OUTPUT"
grep -Fq "Database schema is up to date" "$SCHEMA_MIGRATION_STATUS_OUTPUT"
unset SCHEMA_MIGRATION_DATABASE_URL
```

Stop if the migration command fails or the status output does not confirm that
the schema is up to date. Do not continue to manifest generation or session

```text
export CONTRACT_MANIFEST=/path/to/affiliate-governed-private/reviewed-supply-contract-manifest.json
export CONTRACT_IMPACT_REPORT=/path/to/affiliate-governed-private/reviewed-supply-contract-impact-report.json
export CONTRACT_ACTIVATED_BY_USER_ID=REPLACE_WITH_AUTHORIZED_CONTRACT_ACTIVATOR_ID
test -s "$CONTRACT_MANIFEST"
test -s "$CONTRACT_IMPACT_REPORT"
assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
assert_non_placeholder_identity "$CONTRACT_ACTIVATED_BY_USER_ID" "CONTRACT_ACTIVATED_BY_USER_ID"
assert_reviewed_database_identity
cd "$OPERATOR_CLI_DIR"
./node_modules/.bin/tsx -e '
  (async () => {
    const { readFile } = await import("node:fs/promises");
    const { activateAffiliateSupplyContract } = await import(
      "./src/server/affiliateImports/affiliateSupplyPersistence"
    );
    const manifestPath = process.env.CONTRACT_MANIFEST;
    const impactPath = process.env.CONTRACT_IMPACT_REPORT;
    const userId = process.env.CONTRACT_ACTIVATED_BY_USER_ID;
    if (!manifestPath || !impactPath || !userId) throw new Error("Contract activation inputs are missing.");
    await activateAffiliateSupplyContract({
      manifest: JSON.parse(await readFile(manifestPath, "utf8")),
      impactReport: JSON.parse(await readFile(impactPath, "utf8")),
      userId,
    });
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
'
```

The activation function validates the immutable manifest and impact-report
hashes. It retires an older active version in the same transaction. Do not
continue if this command fails.

Read back the active manifest from the reviewed database. Retain only the
manifest metadata and hashes:

```text
export ACTIVE_SUPPLY_CONTRACT_OUTPUT=/path/to/affiliate-governed-private/active-supply-contract.json
install -m 0600 /dev/null "$ACTIVE_SUPPLY_CONTRACT_OUTPUT"
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  --tuples-only --no-align <<'SQL' > "$ACTIVE_SUPPLY_CONTRACT_OUTPUT"
SELECT COALESCE(
  json_agg(
    json_build_object(
      'rolloutCohort', "rolloutCohort",
      'version', version,
      'status', status,
      'contractHash', "contractHash",
      'componentHashes', "componentHashes",
      'activatedByUserId', "activatedByUserId",
      'activatedAt', "activatedAt"
    )
    ORDER BY version DESC
  ),
  '[]'::json
)
FROM "AffiliateSupplyContractManifests"
WHERE "rolloutCohort" = 'DEFAULT'
  AND status = 'ACTIVE';
SQL
jq -e --arg activator "$CONTRACT_ACTIVATED_BY_USER_ID" '
  length == 1
  and .[0].rolloutCohort == "DEFAULT"
  and .[0].status == "ACTIVE"
  and (.[0].contractHash | test("^[a-f0-9]{64}$"; "i"))
  and (.[0].componentHashes
    | type == "array"
    and length == 6
    and all(.[]; type == "string" and test("^[a-f0-9]{64}$"; "i")))
  and .[0].activatedByUserId == $activator
  and (.[0].activatedAt | type == "string")
' "$ACTIVE_SUPPLY_CONTRACT_OUTPUT"
export ACTIVE_SUPPLY_CONTRACT_VERSION="$(jq -er \
  '.[0].version | select(type == "number" and floor == . and . > 0)' \
  "$ACTIVE_SUPPLY_CONTRACT_OUTPUT")"
```

The read-back must show one active `DEFAULT` manifest, its contract hash, all
six component hashes, the authorized activator, and an activation timestamp.
Stop on a missing, duplicate, stale, or mismatched row.

Before reconciliation review, capture a read-only operations projection. Use a
protected admin cookie file. This `GET` route does not change production state:

```text
export DASHBOARD_BASE_URL=https://bracket-iq.com
export ADMIN_COOKIE_FILE=/path/to/affiliate-governed-private/admin-cookie.txt
export DASHBOARD_OUTPUT=/path/to/affiliate-governed-private/affiliate-operations-dashboard.json
test -r "$ADMIN_COOKIE_FILE"
install -m 0600 /dev/null "$DASHBOARD_OUTPUT"
curl --fail --silent --show-error \
  --cookie "$ADMIN_COOKIE_FILE" \
  "$DASHBOARD_BASE_URL/api/admin/affiliate-operations?view=cutover&page=1&pageSize=50&rolloutCohort=DEFAULT" \
  > "$DASHBOARD_OUTPUT"
jq -e '
  .schemaVersion == 2
  and .view == "cutover"
  and (.contract.rolloutCohort == "DEFAULT")
  and (.cutover | type == "object")
' "$DASHBOARD_OUTPUT"
```

Review this artifact before APPLY. It is a read-only projection, not proof of
deployment. Do not use a write route or a caller-selected projection as the
cutover evidence.

3. Create a separate reviewed manifest file. The open-weight controller remains an offline/evaluation-only process; it must never be enabled or used as a production queue writer. The manifest must list every old writer:

```json
{
  "schemaVersion": 1,
  "artifactId": "reviewed-legacy-process-manifest-2026-08-25",
  "reviewedAt": "2026-08-25T11:30:00.000Z",
  "reviewedBy": "<reviewer-id>",
  "processes": [
    {"id": "legacy-goal", "processClass": "GOAL"},
    {"id": "legacy-loop", "processClass": "MAPPING"},
    {"id": "legacy-open-weight-controller-service", "processClass": "CONTROLLER"},
    {"id": "legacy-open-weight-controller-timer", "processClass": "CONTROLLER"}
  ],
  "systemdUnits": [
    {
      "processId": "legacy-goal",
      "unitId": "bracketiq-affiliate-intake-automation.timer"
    },
    {
      "processId": "legacy-open-weight-controller-service",
      "unitId": "bracketiq-affiliate-controller.service"
    },
    {
      "processId": "legacy-open-weight-controller-timer",
      "unitId": "bracketiq-affiliate-controller.timer"
    }
  ]
}
```

4. Have a second operator review the IDs and process classes against the
   deployment inventory. Keep the signed manifest file as cutover evidence.
5. Prepare the process, claim, permission, and container inventory. Do not put
   the reviewed process list in this inventory file. The inventory JSON must
   include `processInventoryArtifactId`, `processInventory`, and the matching
   `processInventoryHash` and `processInventoryCount` values.

Before this production state change, obtain separate current authorization.
Before the initial container creation, set
`AFFILIATE_AGENT_RESTART_POLICY=no` in the private `deployment.env` and review
the value:

```text
test "$(sed -n 's/^AFFILIATE_AGENT_RESTART_POLICY=//p' \
  /path/to/affiliate-governed-private/deployment.env)" = "no"
```

Do not create containers when this check fails.
Create only the seven agent-side containers and the governed replenishment
controller in the stopped state for inspection. The gateway is deliberately
excluded until its startup preflight is generated, bound, and verified below:

```text
export GOVERNED_EXISTING_CONTAINER_IDS="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f /path/to/repository/apps/site/deploy/affiliate-governed/compose.yml \
    --profile coverage-planner ps -aq \
    affiliate-agent-runner mapping-producer-1 mapping-producer-2 \
    supply-reviewer-1 supply-reviewer-2 coverage-planner \
    affiliate-agent-downstream-ready affiliate-replenishment-controller
)"
if test -n "$GOVERNED_EXISTING_CONTAINER_IDS"; then
  printf '%s\n' 'stale governed agent/controller containers exist; refusing --no-recreate' >&2
  exit 1
fi
```

```text
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f /path/to/repository/apps/site/deploy/affiliate-governed/compose.yml \
  --profile coverage-planner up --no-start --no-deps --no-recreate \
  affiliate-agent-runner mapping-producer-1 mapping-producer-2 \
  supply-reviewer-1 supply-reviewer-2 coverage-planner \
  affiliate-agent-downstream-ready affiliate-replenishment-controller
```

The `up --no-start --no-deps --no-recreate` command creates only these stopped
agent-side and controller containers. It does not start or enable any service
and does not create the gateway. Do not use `create` or an unconstrained `up`
command for this inspection step.

Capture the eight governed non-gateway IDs without printing inspection data.
Compose emits one JSON object per line for `ps --format json`; extract each
record as a stream:

```text
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f /path/to/repository/apps/site/deploy/affiliate-governed/compose.yml \
  ps --all --format json affiliate-agent-runner mapping-producer-1 \
  mapping-producer-2 supply-reviewer-1 supply-reviewer-2 coverage-planner \
  affiliate-agent-downstream-ready affiliate-replenishment-controller \
  > /path/to/affiliate-governed-private/affiliate-container-candidates.json
jq -r 'select(type == "object") | .ID // empty' \
  /path/to/affiliate-governed-private/affiliate-container-candidates.json \
  > /path/to/affiliate-governed-private/affiliate-container-candidate-ids.txt
test "$(wc -l < /path/to/affiliate-governed-private/affiliate-container-candidate-ids.txt | tr -d '[:space:]')" = "8"
test "$(sort -u /path/to/affiliate-governed-private/affiliate-container-candidate-ids.txt | wc -l | tr -d '[:space:]')" = "8"
awk 'NF != 1 || $1 !~ /^[a-fA-F0-9]{64}$/ { exit 1 }' \
  /path/to/affiliate-governed-private/affiliate-container-candidate-ids.txt
test -s /path/to/affiliate-governed-private/affiliate-container-candidate-ids.txt
```

Have the second operator compare these eight governed non-gateway service and
container IDs with the reviewed deployment manifest. Have that operator write
only the approved seven agent-worker IDs, one per line, to:

```text
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/reviewed-affiliate-worker-container-ids.txt
```

Inspect only the approved worker IDs:

```text
test -s /path/to/affiliate-governed-private/reviewed-affiliate-worker-container-ids.txt
REVIEWED_WORKER_CONTAINER_IDS="$(paste -sd' ' \
  /path/to/affiliate-governed-private/reviewed-affiliate-worker-container-ids.txt)"
test -n "$REVIEWED_WORKER_CONTAINER_IDS"
printf '%s\n' "$REVIEWED_WORKER_CONTAINER_IDS" | awk '
  {
    for (field_index = 1; field_index <= NF; field_index += 1) {
      if (length($field_index) != 64 || $field_index !~ /^[a-fA-F0-9]+$/) exit 1
      count += 1
    }
  }
  END { exit count == 7 ? 0 : 1 }
'
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
export REVIEWED_WORKER_IMAGE_EVIDENCE=/path/to/affiliate-governed-private/reviewed-affiliate-worker-images.json
test ! -e "$REVIEWED_WORKER_IMAGE_EVIDENCE"
REVIEWED_WORKER_IMAGE_IDS="$(
  docker inspect $REVIEWED_WORKER_CONTAINER_IDS |
    jq -r '.[].Image' | sort -u | paste -sd' '
)"
printf '%s\n' "$REVIEWED_WORKER_IMAGE_IDS" | awk '
  {
    for (field_index = 1; field_index <= NF; field_index += 1) {
      if ($field_index !~ /^sha256:[a-fA-F0-9]{64}$/) exit 1
      count += 1
    }
  }
  END { exit count == 1 ? 0 : 1 }
'
docker image inspect $REVIEWED_WORKER_IMAGE_IDS |
  jq -e 'map({imageId: .Id, repoDigests: (.RepoDigests // [])})' \
  > "$REVIEWED_WORKER_IMAGE_EVIDENCE"
test -s "$REVIEWED_WORKER_IMAGE_EVIDENCE"
export REVIEWED_WORKER_NETWORK_EVIDENCE=/path/to/affiliate-governed-private/reviewed-affiliate-worker-networks.json
test ! -e "$REVIEWED_WORKER_NETWORK_EVIDENCE"
REVIEWED_WORKER_NETWORK_IDS="$(
  docker inspect $REVIEWED_WORKER_CONTAINER_IDS |
    jq -r '.[].NetworkSettings.Networks[]?.NetworkID' | sort -u | paste -sd' '
)"
test -n "$REVIEWED_WORKER_NETWORK_IDS"
docker network inspect $REVIEWED_WORKER_NETWORK_IDS |
  jq -e 'map({id: .Id, name: .Name, internal: .Internal})' \
  > "$REVIEWED_WORKER_NETWORK_EVIDENCE"
docker inspect $REVIEWED_WORKER_CONTAINER_IDS |
node -e '
  const { createHash } = require("node:crypto");
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => {
    input += chunk;
    if (Buffer.byteLength(input, "utf8") > 16777216) throw new Error("Container capture is too large.");
  });
  process.stdin.on("end", () => {
    const rows = JSON.parse(input);
    for (const row of rows) {
      if (row.Config.Labels?.["com.docker.compose.service"] !== "affiliate-agent-runner") continue;
      const prefix = "AFFILIATE_AGENT_MODEL_GATEWAY_TOKEN=";
      const values = row.Config.Env.filter(entry => entry.startsWith(prefix));
      if (values.length !== 1 || !values[0].slice(prefix.length).trim()) throw new Error("Runner bearer capture is invalid.");
      row.modelGatewayBearerSha256 = createHash("sha256").update(values[0].slice(prefix.length).trim(), "utf8").digest("hex");
      row.Config.Env = row.Config.Env.map(entry => entry.startsWith(prefix) ? prefix + "<redacted>" : entry);
    }
    process.stdout.write(JSON.stringify(rows));
  });
' |
jq --slurpfile image_evidence "$REVIEWED_WORKER_IMAGE_EVIDENCE" \
  --slurpfile network_evidence "$REVIEWED_WORKER_NETWORK_EVIDENCE" \
  '($image_evidence[0] | map({key: .imageId, value: .repoDigests}) | from_entries) as $repoDigestsByImageId
| ($network_evidence[0] | map({key: .id, value: .internal}) | from_entries) as $internalById
| map({
  id: .Id,
  name: (.Name | ltrimstr("/")),
  service: .Config.Labels["com.docker.compose.service"],
  image: .Config.Image,
  imageId: .Image,
  repoDigests: ($repoDigestsByImageId[.Image] // []),
  modelGatewayBearerSha256: (.modelGatewayBearerSha256 // null),
  hasReadonlyRootFilesystem: .HostConfig.ReadonlyRootfs,
  privileged: (.HostConfig.Privileged // false),
  user: (.Config.User // null),
  cgroupNamespace: (.HostConfig.CgroupnsMode // null),
  ipcMode: (.HostConfig.IpcMode // null),
  tmpfs: (.HostConfig.Tmpfs // {}),
  mounts: [
    .Mounts[]?
    | {
        source: (
          if ((.Type // "") | ascii_downcase) == "volume"
          then (.Name // "")
          else (.Source // "")
          end
        ),
        type: ((.Type // "") | ascii_downcase),
        target: (.Destination // ""),
        readOnly: ((.RW // true) | not)
      }
  ],
  restartPolicy: (.HostConfig.RestartPolicy.Name // "no"),
  environment: ([
    . as $container
    | ($container.Config.Labels["com.docker.compose.service"] // "") as $service
    | $container.Config.Env[]?
    | split("=")[0] as $key
    | if $service == "affiliate-agent-runner"
      and ($key == "AFFILIATE_AGENT_MODEL_GATEWAY_ADDRESS"
        or $key == "AFFILIATE_AGENT_OMP_MODEL")
      then .
      else ($key + "=<redacted>")
      end
  ]),
  childUid: ([.Config.Env[]?
    | select(startswith("AFFILIATE_AGENT_RUNNER_CHILD_UID="))
    | split("=")[1] | tonumber] | .[0] // null),
  childGid: ([.Config.Env[]?
    | select(startswith("AFFILIATE_AGENT_RUNNER_CHILD_GID="))
    | split("=")[1] | tonumber] | .[0] // null),
  supervisorUid: ([.Config.Env[]?
    | select(startswith("AFFILIATE_AGENT_UID="))
    | split("=")[1] | tonumber] | .[0] // null),
  cgroupRelativePath: ([.Config.Env[]?
    | select(startswith("AFFILIATE_AGENT_RUNNER_CGROUP_RELATIVE_PATH="))
    | split("=")[1]] | .[0] // null),
  networks: ([.NetworkSettings.Networks // {} | keys[]]),
  networkAttachments: ([
    .NetworkSettings.Networks // {}
    | to_entries[]
    | {name: .key, id: .value.NetworkID}
  ]),
  isNetworkInternal: (
    [.NetworkSettings.Networks[]?.NetworkID] as $ids
    | ($ids | length) > 0 and all($ids[]; $internalById[.] == true)
  ),
  capDrop: (.HostConfig.CapDrop // []),
  capAdd: (.HostConfig.CapAdd // []),
  groupAdd: (.HostConfig.GroupAdd // []),
  securityOptions: (.HostConfig.SecurityOpt // [])
} | if .service == "affiliate-agent-runner"
    then .
    else del(.childUid, .childGid, .supervisorUid, .cgroupRelativePath)
    end)' \
  > /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
test -s /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
jq -e --arg agent_user "$HOST_WORKSPACE_AGENT_UID:$HOST_WORKSPACE_GID" \
  --arg runner_user "0:0" '
  length == 7
  and ([.[].service] | sort) == [
    "affiliate-agent-downstream-ready",
    "affiliate-agent-runner",
    "coverage-planner",
    "mapping-producer-1",
    "mapping-producer-2",
    "supply-reviewer-1",
    "supply-reviewer-2"
  ]
  and all(.[];
    if .service == "affiliate-agent-runner"
    then .user == $runner_user
    else .user == $agent_user
    end)
  and all(.[];
    .privileged == false
    and (.capDrop | type) == "array"
    and (.capAdd | type) == "array"
    and (.groupAdd | type) == "array")
' /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
jq -e --arg runner_group "$HOST_WORKSPACE_GID" '
  .[]
  | select(.service == "affiliate-agent-runner")
  | .user == "0:0"
    and .capDrop == ["ALL"]
    and ((.capAdd | sort)
      == ["CHOWN", "DAC_OVERRIDE", "FOWNER", "KILL", "SETGID", "SETUID"])
    and (.groupAdd == [$runner_group])
    and ((.securityOptions | sort)
      == ["no-new-privileges:true", "writable-cgroups=true"])
    and .privileged == false
    and .cgroupNamespace == "private"
    and .cgroupRelativePath == "affiliate-agent-runner"
    and .childUid == 1002
    and .childGid == 1001
    and .supervisorUid == 1001
    and (.environment
      | index("AFFILIATE_AGENT_RUNNER_CHILD_UID=<redacted>") != null)
    and (.environment
      | index("AFFILIATE_AGENT_RUNNER_CHILD_GID=<redacted>") != null)
    and (.environment
      | index("AFFILIATE_AGENT_UID=<redacted>") != null)
' /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
jq -e '
def exact_tmpfs($path; $options):
  ((.tmpfs[$path] // "")
    | split(",")
    | map((gsub("^\\s+|\\s+$"; "") | ascii_downcase | sub("^mode=0+"; "mode=")))
    | sort) == ($options | sort);
.[] | select(.service == "affiliate-agent-runner")
| .ipcMode == "none"
  and exact_tmpfs("/tmp"; ["mode=755", "nodev", "noexec", "nosuid", "rw", "size=256m", "uid=0", "gid=0"])
  and exact_tmpfs("/dev/shm"; ["mode=755", "nodev", "noexec", "nosuid", "rw", "size=64m", "uid=0", "gid=0"])
' /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
jq -e 'all(.[]; (.environment | type) == "array")' \
  /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
jq -e '[.[]?.environment[]?] | all(
  test("^[^=]+=<redacted>$")
  or . == "AFFILIATE_AGENT_MODEL_GATEWAY_ADDRESS=http://affiliate-model-gateway:4000"
  or . == "AFFILIATE_AGENT_OMP_MODEL=openai-codex/gpt-5.6-luna"
)' /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
export REVIEWED_WORKSPACE_VOLUME="$(
  sed -n 's/^AFFILIATE_GOVERNED_WORKSPACE_VOLUME=//p' \
    /path/to/affiliate-governed-private/deployment.env
)"
test -n "$REVIEWED_WORKSPACE_VOLUME"
jq -e --arg workspace_volume "$REVIEWED_WORKSPACE_VOLUME" '
  [.[] | select(.service == "affiliate-agent-runner")] | length == 1
  and (.[0].environment
    | index("AFFILIATE_AGENT_MODEL_GATEWAY_ADDRESS=http://affiliate-model-gateway:4000") != null)
  and (.[0].environment
    | index("AFFILIATE_AGENT_OMP_MODEL=openai-codex/gpt-5.6-luna") != null)
  and (.[0].environment
    | index("AFFILIATE_AGENT_MODEL_GATEWAY_TOKEN=<redacted>") != null)
  and (.[0].mounts | length == 1)
  and ((.[0].mounts[0] | keys | sort)
    == ["readOnly", "source", "target", "type"])
  and .[0].mounts[0].source == $workspace_volume
  and .[0].mounts[0].type == "volume"
  and .[0].mounts[0].target == "/workspaces"
  and .[0].mounts[0].readOnly == false
' /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
jq -e '
  all(.[]; (.service == "affiliate-agent-runner")
    or all(.environment[]?;
      (startswith("AFFILIATE_AGENT_MODEL_GATEWAY_TOKEN=") | not)
      and (startswith("AFFILIATE_AGENT_MODEL_AUTH_BROKER_TOKEN=") | not)))
' /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
jq -e 'all(.[]; .restartPolicy == "no")' \
  /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
jq -e --arg expected "$REVIEWED_AGENT_IMAGE" \
  --arg expectedId "$REVIEWED_AGENT_IMAGE_ID" \
  --arg expectedRepoDigest "$REVIEWED_AGENT_REPO_DIGEST" '
  all(.[];
    .image == $expected
    and .imageId == $expectedId
    and (.repoDigests | type == "array")
    and (.repoDigests | index($expectedRepoDigest) != null)
    and .hasReadonlyRootFilesystem == true
  )
' /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
```
Have the second operator also approve the governed replenishment controller
ID. Write exactly one full container ID to:

```text
export REVIEWED_REPLENISHMENT_CONTAINER_ID_FILE=/path/to/affiliate-governed-private/reviewed-affiliate-replenishment-container-id.txt
install -m 0600 /dev/null "$REVIEWED_REPLENISHMENT_CONTAINER_ID_FILE"
```

Inspect that approved ID without retaining raw environment values:

```text
test -s "$REVIEWED_REPLENISHMENT_CONTAINER_ID_FILE"
REPLENISHMENT_CONTAINER_ID="$(cat "$REVIEWED_REPLENISHMENT_CONTAINER_ID_FILE")"
printf '%s\n' "$REPLENISHMENT_CONTAINER_ID" | awk '
  NF != 1 || length($1) != 64 || $1 !~ /^[a-fA-F0-9]+$/ { exit 1 }
  { count++ }
  END { exit count == 1 ? 0 : 1 }
'
export AFFILIATE_AGENT_GATEWAY_NETWORK="$(
  jq -er '.networks.gateway_internal.name // empty' \
    /path/to/affiliate-governed-private/governed-compose.redacted.json
)"
test -n "$AFFILIATE_AGENT_GATEWAY_NETWORK"
export REPLENISHMENT_IMAGE_OBJECT_ID="$(docker inspect -f '{{.Image}}' "$REPLENISHMENT_CONTAINER_ID")"
printf '%s\n' "$REPLENISHMENT_IMAGE_OBJECT_ID" \
  | grep -Eq '^sha256:[a-fA-F0-9]{64}$'
export REPLENISHMENT_IMAGE_EVIDENCE=/path/to/affiliate-governed-private/replenishment-image.json
test ! -e "$REPLENISHMENT_IMAGE_EVIDENCE"
docker image inspect "$REPLENISHMENT_IMAGE_OBJECT_ID" |
  jq -e --arg expectedId "$REVIEWED_GATEWAY_IMAGE_ID" \
    --arg expectedDigest "$REVIEWED_GATEWAY_REPO_DIGEST" '
    if length == 1
      and .[0].Id == $expectedId
      and ((.[0].RepoDigests // []) | index($expectedDigest) != null)
    then
      [{imageId: .[0].Id, repoDigests: (.[0].RepoDigests // [])}]
    else
      error("invalid replenishment image evidence")
    end
  ' \
  > "$REPLENISHMENT_IMAGE_EVIDENCE"
test -s "$REPLENISHMENT_IMAGE_EVIDENCE"
docker inspect "$REPLENISHMENT_CONTAINER_ID" |
  jq -e --slurpfile image_evidence "$REPLENISHMENT_IMAGE_EVIDENCE" \
    --arg id "$REPLENISHMENT_CONTAINER_ID" \
    --arg expected_network "$AFFILIATE_AGENT_GATEWAY_NETWORK" \
    --arg image "$REVIEWED_GATEWAY_IMAGE" \
    --arg image_id "$REVIEWED_GATEWAY_IMAGE_ID" \
    --arg digest "$REVIEWED_GATEWAY_REPO_DIGEST" \
    --arg expected_user "$REVIEWED_GATEWAY_USER" '
    map(select(
      ($image_evidence[0][0]) as $image_object
      | .Id == $id
      and .Config.Labels["com.docker.compose.service"] == "affiliate-replenishment-controller"
      and .Config.User == $expected_user
      and .Config.Image == $image
      and .Image == $image_id
      and ($image_object.imageId == .Image)
      and (($image_object.repoDigests | type) == "array")
      and (($image_object.repoDigests | index($digest)) != null)
      and .HostConfig.ReadonlyRootfs == true
      and (.HostConfig.RestartPolicy.Name // "no") == "no"
      and ((.NetworkSettings.Networks // {}) | keys) == [$expected_network]
      and ((.Config.Env // []) | any(startswith("AFFILIATE_AGENT_GATEWAY_ADDRESS=")))
      and ((.Config.Env // []) | any(startswith("AFFILIATE_AGENT_GATEWAY_PATH_PREFIX=")))
      and ((.Config.Env // []) | any(startswith("AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=")))
      and ((.Config.Env // []) | any(. == "AFFILIATE_REPLENISHMENT_INTERVAL_SECONDS=900"))
      and ((.Config.Cmd // []) | join("\n") | contains("INTERVAL_SECONDS=900"))
      and ((.Config.Env // []) | all(
        (startswith("AFFILIATE_GATEWAY_OPERATOR_TOKEN=")
          or startswith("DATABASE_URL=")
          or startswith("AFFILIATE_GATEWAY_DATABASE_URL=")
          or startswith("AFFILIATE_SCRAPINGDOG_API_KEY=")
          or startswith("AFFILIATE_FIRECRAWL_API_KEY=")
          or startswith("AFFILIATE_AGENT_CODEX_")) | not
      ))
    ))
    | length == 1
  ' >/dev/null
export REVIEWED_REPLENISHMENT_CAPTURE=/path/to/affiliate-governed-private/reviewed-affiliate-replenishment.redacted.json
test ! -e "$REVIEWED_REPLENISHMENT_CAPTURE"
docker inspect "$REPLENISHMENT_CONTAINER_ID" |
  jq --slurpfile network_evidence "$REVIEWED_WORKER_NETWORK_EVIDENCE" '
    ($network_evidence[0] | map({key: .id, value: .internal}) | from_entries) as $internalById
    | map({
        id: .Id,
        name: (.Name | ltrimstr("/")),
        service: .Config.Labels["com.docker.compose.service"],
        user: .Config.User,
        privileged: (.HostConfig.Privileged // false),
        hasReadonlyRootFilesystem: .HostConfig.ReadonlyRootfs,
        cgroupNamespace: (.HostConfig.CgroupnsMode // null),
        ipcMode: (.HostConfig.IpcMode // null),
        tmpfs: (.HostConfig.Tmpfs // {}),
        environment: [.Config.Env[]? | split("=")[0] + "=<redacted>"],
        mounts: [.Mounts[]? | {
          source: (if .Type == "volume" then (.Name // "") else (.Source // "") end),
          type: .Type, target: .Destination, readOnly: (.RW | not)
        }],
        networks: [.NetworkSettings.Networks // {} | keys[]],
        networkAttachments: [.NetworkSettings.Networks // {} | to_entries[] | {name: .key, id: .value.NetworkID}],
        isNetworkInternal: ([.NetworkSettings.Networks[]?.NetworkID] as $ids
          | ($ids | length) > 0 and all($ids[]; $internalById[.] == true)),
        capDrop: (.HostConfig.CapDrop // []),
        capAdd: (.HostConfig.CapAdd // []),
        groupAdd: (.HostConfig.GroupAdd // []),
        securityOptions: (.HostConfig.SecurityOpt // [])
      })
  ' > "$REVIEWED_REPLENISHMENT_CAPTURE"
test -s "$REVIEWED_REPLENISHMENT_CAPTURE"
test ! -L "$REVIEWED_REPLENISHMENT_CAPTURE"
```

Retain this approved ID until the final all-container inspection. Remove it
only after the ID is copied into the final reviewed container list.


Capture the reviewed gateway network without retaining the full inspection. Use
the network name from the resolved Compose output preserved in the redacted
artifact:

```text
export REVIEWED_AGENT_NETWORK="$(
  jq -er '.networks.gateway_internal.name // empty' \
    /path/to/affiliate-governed-private/governed-compose.redacted.json
)"
test -n "$REVIEWED_AGENT_NETWORK"
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/reviewed-agent-network.json
docker network inspect "$REVIEWED_AGENT_NETWORK" \
  | jq '.[0] | {name: .Name, internal: .Internal}' \
  > /path/to/affiliate-governed-private/reviewed-agent-network.json
jq -e --arg expected "$REVIEWED_AGENT_NETWORK" \
  '.name == $expected and .internal == true' \
  /path/to/affiliate-governed-private/reviewed-agent-network.json
```

Capture the legacy service and process state without running a legacy writer:

```text
systemctl list-units --all 'bracketiq-affiliate-*' --no-legend --no-pager \
  > /path/to/affiliate-governed-private/affiliate-legacy-units.txt
systemctl show 'bracketiq-affiliate-*' \
  -p Id,MainPID,ActiveState,SubState,ExecMainStatus --no-pager \
  > /path/to/affiliate-governed-private/affiliate-legacy-unit-details.txt
ps -axo pid=,ppid=,user=,state=,comm= \
  | awk 'NF >= 5 { print $1 "\t" $2 "\t" $3 "\t" $4 "\t" $5 }' \
  > /path/to/affiliate-governed-private/affiliate-process-identities.tsv
test -s /path/to/affiliate-governed-private/affiliate-legacy-units.txt
test -s /path/to/affiliate-governed-private/affiliate-legacy-unit-details.txt
test -s /path/to/affiliate-governed-private/affiliate-process-identities.tsv
awk -F '\t' 'NF != 5 || $1 !~ /^[0-9]+$/ || $2 !~ /^[0-9]+$/ || $3 == "" || $4 == "" || $5 == "" || seen[$1]++ { exit 1 }' \
  /path/to/affiliate-governed-private/affiliate-process-identities.tsv
```

The unit ID and its `MainPID` are the stable host identity. The `comm` field
is only an allowlisted executable hint. It is not the complete process
identity. The second operator must join each reviewed systemd unit's
`MainPID` to this safe table and write only unique
`(unitId, pid, processId, processClass, command, status)` identity rows into
the reviewed process evidence. Use the reviewed, allowlisted command identity.
Reject a missing, duplicate, or ambiguous PID, unit, or process identity.
For governed containers, use the full container ID, Compose service label, and
exact command identity as the corresponding tuple.
Do not capture `args`, `command`, `cmd`, `ExecStart`, environment, or any
arbitrary process argument vector. Do not run a legacy writer to create
evidence.


The current deployment example uses database `bracketiq` and runtime role
`bracketiq_app`. The service query and the `DATABASE_URL` Prisma query must
match on `current_database()`, `current_user`, and the non-null
`inet_server_addr()` value. Stop if any value differs. This binds every
writable Node CLI to the reviewed `DATABASE_URL` identity; `PGSERVICE` is
only the protected `psql` evidence path. Repeat
`assert_reviewed_database_identity` immediately before the session, dry-run
persistence, APPLY, replay, and each rollback command. Keep the output in the
protected evidence directory.

Capture effective privileges for the exact contract roles and the actual
`DATABASE_URL` runtime role. The contract roles are
`bracketiq_affiliate_gateway` (gateway), `bracketiq_affiliate_lifecycle`
(lifecycle authority), and `bracketiq_affiliate_agent` (worker). The current
gateway URL uses `bracketiq_app`; it is the gateway process login. The SQL
fails if one of these reviewed roles is missing:

```text
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/affiliate-database-privileges.tsv
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  --tuples-only --no-align --field-separator="$(printf '\t')" <<'SQL' \
  > /path/to/affiliate-governed-private/affiliate-database-privileges.tsv
DO $$
DECLARE
  missing_role text;
BEGIN
  SELECT expected.role_name
    INTO missing_role
    FROM (VALUES
      ('bracketiq_affiliate_gateway'),
      ('bracketiq_affiliate_lifecycle'),
      ('bracketiq_affiliate_agent'),
      ('bracketiq_app')
    ) AS expected(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = expected.role_name
    )
    LIMIT 1;
  IF missing_role IS NOT NULL THEN
    RAISE EXCEPTION 'Required reviewed role is missing: %', missing_role;
  END IF;
END
$$;
WITH principals(role_name) AS (
  VALUES
    ('bracketiq_affiliate_gateway'::name),
    ('bracketiq_affiliate_lifecycle'::name),
    ('bracketiq_affiliate_agent'::name),
    ('bracketiq_app'::name)
),
affiliate_tables(table_name) AS (
  VALUES
    ('AffiliateScrapeSources'::name),
    ('AffiliateScrapeMappings'::name),
    ('AffiliateScrapeRuns'::name),
    ('AffiliateSourceIntakes'::name),
    ('AffiliateSourceIntakePages'::name),
    ('AffiliateSourceIntakeRuns'::name),
    ('AffiliateSourceIntakeArtifacts'::name),
    ('AffiliateSourceDiscoveryCampaigns'::name),
    ('AffiliateAgentGatewayJobs'::name),
    ('AffiliateAgentGatewayClaims'::name),
    ('AffiliateAgentGatewayArtifacts'::name),
    ('AffiliateAgentGatewayOperationReceipts'::name),
    ('AffiliateAgentGatewayEvents'::name),
    ('AffiliateAgentWorkerHealth'::name),
    ('AffiliateOperationalAlerts'::name),
    ('AffiliateOperationalAlertDeliveries'::name),
    ('AffiliateCoverageAgentJobs'::name),
    ('AffiliateCoverageCities'::name),
    ('AffiliateCoverageCells'::name),
    ('AffiliateCoverageCellAssessments'::name),
    ('AffiliateSourceDiscoveryQueryExecutions'::name),
    ('AffiliateSourceDiscoveryRuns'::name),
    ('AffiliateSourceDiscoveryResults'::name),
    ('AffiliateSourceDomainPolicies'::name),
    ('AffiliateSourceMappingJobs'::name),
    ('AffiliateApprovalJobs'::name),
    ('AffiliateImportCandidates'::name),
    ('AffiliateSupplySources'::name),
    ('AffiliateSupplyContractManifests'::name),
    ('AffiliateSupplyLifecycleTransitions'::name),
    ('AffiliateSupplyReconciliationRuns'::name),
    ('AffiliateSupplyTargets'::name),
    ('AffiliateReplenishmentDemands'::name),
    ('AffiliateReplenishmentWaves'::name),
    ('File'::name)
),
requested_table_privileges(privilege_name) AS (
  VALUES ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text)
),
public_sequences AS (
  SELECT namespace.nspname::text AS schema_name, sequence.relname::text AS sequence_name
  FROM pg_class AS sequence
  JOIN pg_namespace AS namespace ON namespace.oid = sequence.relnamespace
  WHERE namespace.nspname = 'public' AND sequence.relkind = 'S'
)
SELECT 'pg_has_role'::text,
  member.role_name::text,
  target.role_name::text,
  'MEMBER'::text,
  pg_has_role(member.role_name, target.role_name, 'MEMBER')::text
FROM principals AS member
CROSS JOIN principals AS target
WHERE member.role_name <> target.role_name
UNION ALL
SELECT 'pg_auth_members'::text,
  member.rolname::text,
  granted.rolname::text,
  'MEMBER'::text,
  'true'::text
FROM pg_auth_members AS membership
JOIN pg_roles AS member ON member.oid = membership.member
JOIN pg_roles AS granted ON granted.oid = membership.roleid
WHERE member.rolname IN (SELECT role_name FROM principals)
   OR granted.rolname IN (SELECT role_name FROM principals)
UNION ALL
SELECT 'database'::text,
  principal.role_name::text,
  current_database()::text,
  'CONNECT'::text,
  has_database_privilege(principal.role_name, current_database(), 'CONNECT')::text
FROM principals AS principal
UNION ALL
SELECT 'schema'::text,
  principal.role_name::text,
  'public'::text,
  privilege_name,
  has_schema_privilege(principal.role_name, 'public', privilege_name)::text
FROM principals AS principal
CROSS JOIN (VALUES ('USAGE'::text), ('CREATE'::text)) AS schema_privileges(privilege_name)
UNION ALL
SELECT 'table'::text,
  principal.role_name::text,
  format('%I.%I', 'public', table_name),
  requested.privilege_name,
  has_table_privilege(
    principal.role_name,
    format('%I.%I', 'public', table_name),
    requested.privilege_name
  )::text
FROM principals AS principal
CROSS JOIN affiliate_tables
CROSS JOIN requested_table_privileges AS requested
UNION ALL
SELECT 'sequence'::text,
  principal.role_name::text,
  format('%I.%I', sequences.schema_name, sequences.sequence_name),
  requested.privilege_name,
  has_sequence_privilege(
    principal.role_name,
    format('%I.%I', sequences.schema_name, sequences.sequence_name),
    requested.privilege_name
  )::text
FROM principals AS principal
CROSS JOIN public_sequences AS sequences
CROSS JOIN (VALUES
  ('USAGE'::text),
  ('SELECT'::text),
  ('UPDATE'::text)
) AS requested(privilege_name)
ORDER BY 1, 2, 3, 4;
SQL
test -s /path/to/affiliate-governed-private/affiliate-database-privileges.tsv
```

The output contains only role names, object names, privilege names, and
`true`/`false` results. It contains no URL or credential. Review both the
effective `pg_has_role` rows and the direct `pg_auth_members` rows. Bind
`isGatewayAllowedToWriteProductionDatabase` to the `bracketiq_app` rows. The
app role must have the reviewed gateway-role membership path and the required
effective write privileges on the reviewed gateway tables. The gateway flag is
the matrix requires all 17 reviewed `bracketiq_app` rows inherited from
`bracketiq_affiliate_gateway` (`SELECT/INSERT/UPDATE` on Jobs, Claims, and
OperationReceipts, plus `SELECT/INSERT` on Artifacts, Events, OperationalAlerts,
and OperationalAlertDeliveries), with the membership row also true.
Bind `isAgentAllowedToConnectProductionDatabase` to the worker role's database
`CONNECT` row. Bind `isAgentAllowedToWriteProductionDatabase` to every worker
role table and sequence `INSERT`, `UPDATE`, `DELETE`, and write-sequence row.
These agent results must be `false`. Do not derive these booleans from role
flags. Use the redacted container evidence, not role flags, for the
object-storage and provider booleans. Derive all six
`databasePermissions` values only from this privilege evidence and the
redacted container checks.

Derive the six preflight permission flags from the captured rows and redacted
container evidence; do not hand-edit these booleans:

```text
test -s /path/to/affiliate-governed-private/affiliate-database-privileges.tsv
export AGENT_CONNECT_ALLOWED="$(
  awk -F '\t' '
    $1 == "database" &&
      $2 == "bracketiq_affiliate_agent" &&
      $4 == "CONNECT" &&
      $5 == "true" { agent_database_connect = 1 }
    $1 == "schema" &&
      $2 == "bracketiq_affiliate_agent" &&
      $3 == "public" &&
      $4 == "USAGE" &&
      $5 == "true" { agent_schema_usage = 1 }
    END {
      print (agent_database_connect && agent_schema_usage ? "true" : "false")
    }
  ' /path/to/affiliate-governed-private/affiliate-database-privileges.tsv
)"
export AGENT_WRITE_ALLOWED="$(
  awk -F '\t' '
    $2 == "bracketiq_affiliate_agent" &&
      ($1 == "table" || $1 == "sequence") &&
      $4 ~ /^(INSERT|UPDATE|DELETE)$/ &&
      $5 == "true" { found = 1 }
    END { print (found ? "true" : "false") }
  ' /path/to/affiliate-governed-private/affiliate-database-privileges.tsv
)"
export GATEWAY_WRITE_ALLOWED="$(
  awk -F '\t' '
    BEGIN {
      required["public.\"AffiliateAgentGatewayJobs\"|SELECT"] = 1
      required["public.\"AffiliateAgentGatewayJobs\"|INSERT"] = 1
      required["public.\"AffiliateAgentGatewayJobs\"|UPDATE"] = 1
      required["public.\"AffiliateAgentGatewayClaims\"|SELECT"] = 1
      required["public.\"AffiliateAgentGatewayClaims\"|INSERT"] = 1
      required["public.\"AffiliateAgentGatewayClaims\"|UPDATE"] = 1
      required["public.\"AffiliateAgentGatewayOperationReceipts\"|SELECT"] = 1
      required["public.\"AffiliateAgentGatewayOperationReceipts\"|INSERT"] = 1
      required["public.\"AffiliateAgentGatewayOperationReceipts\"|UPDATE"] = 1
      required["public.\"AffiliateAgentGatewayArtifacts\"|SELECT"] = 1
      required["public.\"AffiliateAgentGatewayArtifacts\"|INSERT"] = 1
      required["public.\"AffiliateAgentGatewayEvents\"|SELECT"] = 1
      required["public.\"AffiliateAgentGatewayEvents\"|INSERT"] = 1
      required["public.\"AffiliateOperationalAlerts\"|SELECT"] = 1
      required["public.\"AffiliateOperationalAlerts\"|INSERT"] = 1
      required["public.\"AffiliateOperationalAlertDeliveries\"|SELECT"] = 1
      required["public.\"AffiliateOperationalAlertDeliveries\"|INSERT"] = 1
    }
    $1 == "pg_has_role" &&
      $2 == "bracketiq_app" &&
      $3 == "bracketiq_affiliate_gateway" &&
      $4 == "MEMBER" &&
      $5 == "true" { gateway_member = 1 }
    $1 == "database" &&
      $2 == "bracketiq_app" &&
      $4 == "CONNECT" &&
      $5 == "true" { gateway_database_connect = 1 }
    $1 == "schema" &&
      $2 == "bracketiq_app" &&
      $3 == "public" &&
      $4 == "USAGE" &&
      $5 == "true" { gateway_schema_usage = 1 }
    $1 == "table" && $2 == "bracketiq_app" {
      matrix_key = $3 "|" $4
      if (matrix_key in required) {
        matrix_rows++
        if ($5 == "true") {
          matrix_true++
          seen[matrix_key]++
        } else {
          matrix_failed = 1
        }
      }
    }
    END {
      for (matrix_key in required) {
        if (seen[matrix_key] != 1) matrix_failed = 1
      }
      print ((gateway_member && gateway_database_connect && gateway_schema_usage &&
        matrix_rows == 17 && matrix_true == 17 && !matrix_failed) ? "true" : "false")
    }
  ' /path/to/affiliate-governed-private/affiliate-database-privileges.tsv
)"
if jq -e '
  [.[].environment[]?]
  | any(. == "DO_SPACES_KEY=<redacted>" or . == "DO_SPACES_SECRET=<redacted>")
' /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json \
  >/dev/null; then
  export AGENT_OBJECT_STORAGE_ALLOWED=true
else
  export AGENT_OBJECT_STORAGE_ALLOWED=false
fi
if jq -e '
  [.[].environment[]?]
  | any(. == "SCRAPINGDOG_API_KEY=<redacted>" or . == "FIRECRAWL_API_KEY=<redacted>")
' /path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json \
  >/dev/null; then
  export AGENT_PROVIDER_ALLOWED=true
else
  export AGENT_PROVIDER_ALLOWED=false
fi
export DATABASE_PERMISSION_FLAGS_OUTPUT=/path/to/affiliate-governed-private/database-permission-flags.json
test ! -e "$DATABASE_PERMISSION_FLAGS_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  jq -n \
    --argjson agentConnect "$AGENT_CONNECT_ALLOWED" \
    --argjson agentWrite "$AGENT_WRITE_ALLOWED" \
    --argjson objectStorage "$AGENT_OBJECT_STORAGE_ALLOWED" \
    --argjson provider "$AGENT_PROVIDER_ALLOWED" \
    --argjson gatewayWrite "$GATEWAY_WRITE_ALLOWED" \
    '{
      isAgentAllowedToConnectProductionDatabase: $agentConnect,
      isAgentAllowedToWriteProductionDatabase: $agentWrite,
      isAgentAllowedToReadObjectStorage: $objectStorage,
      isAgentAllowedToWriteObjectStorage: $objectStorage,
      isAgentAllowedToCallProviders: $provider,
      isGatewayAllowedToWriteProductionDatabase: $gatewayWrite
    }' > "$DATABASE_PERMISSION_FLAGS_OUTPUT"
); then
  rm -f "$DATABASE_PERMISSION_FLAGS_OUTPUT"
  exit 1
fi
jq -e '
  (keys | sort) == [
    "isAgentAllowedToCallProviders",
    "isAgentAllowedToConnectProductionDatabase",
    "isAgentAllowedToReadObjectStorage",
    "isAgentAllowedToWriteObjectStorage",
    "isAgentAllowedToWriteProductionDatabase",
    "isGatewayAllowedToWriteProductionDatabase"
  ]
  and (.isAgentAllowedToConnectProductionDatabase | type == "boolean")
  and (.isAgentAllowedToWriteProductionDatabase | type == "boolean")
  and (.isAgentAllowedToReadObjectStorage | type == "boolean")
  and (.isAgentAllowedToWriteObjectStorage | type == "boolean")
  and (.isAgentAllowedToCallProviders | type == "boolean")
  and (.isGatewayAllowedToWriteProductionDatabase | type == "boolean")
' "$DATABASE_PERMISSION_FLAGS_OUTPUT"
```
Capture the production Postgres container's actual network graph from the same
Docker daemon used for the model and worker inspections. Do not derive this
evidence from `AFFILIATE_AGENT_PRODUCTION_BACKEND_NETWORK` or another
configured name. The `postgres` Compose service label must resolve to exactly
one full container ID:

```text
export OMP_PRODUCTION_DATABASE_CONTAINER_ID="$(
  docker ps --no-trunc \
    --filter label=com.docker.compose.service=postgres \
    --format '{{.ID}}'
)"
test -n "$OMP_PRODUCTION_DATABASE_CONTAINER_ID"
test "$(printf '%s\n' "$OMP_PRODUCTION_DATABASE_CONTAINER_ID" | awk 'NF { count += 1 } END { print count + 0 }')" = "1"
printf '%s\n' "$OMP_PRODUCTION_DATABASE_CONTAINER_ID" |
  awk 'NF == 1 && length($1) == 64 && $1 !~ /[^a-fA-F0-9]/ { found = 1 } END { exit found ? 0 : 1 }'
export OMP_PRODUCTION_DATABASE_NETWORK_EVIDENCE=/path/to/affiliate-governed-private/production-database-network-evidence.json
test ! -e "$OMP_PRODUCTION_DATABASE_NETWORK_EVIDENCE"
docker inspect "$OMP_PRODUCTION_DATABASE_CONTAINER_ID" |
  jq -e '
    if length != 1 then error("expected one production Postgres inspection")
    else .[0]
    | {
        containerId: .Id,
        networks: [
          .NetworkSettings.Networks // {}
          | to_entries[]
          | {name: .key, id: .value.NetworkID}
        ]
      }
    | if (.containerId | test("^[a-fA-F0-9]{64}$"))
      and (.networks | length > 0)
      and all(.networks[]; (.name | type) == "string" and (.name | length) > 0)
      and all(.networks[]; (.id | test("^[a-fA-F0-9]{64}$")))
      and (([.networks[].name] | length) == ([.networks[].name] | unique | length))
      and (([.networks[].id] | length) == ([.networks[].id] | unique | length))
      then .
      else error("invalid production Postgres network evidence")
      end
    end
  ' > "$OMP_PRODUCTION_DATABASE_NETWORK_EVIDENCE"
test -s "$OMP_PRODUCTION_DATABASE_NETWORK_EVIDENCE"
test ! -L "$OMP_PRODUCTION_DATABASE_NETWORK_EVIDENCE"
```

Use the captured `containerId` and every `{name,id}` network attachment as
`productionDatabaseNetworkEvidence`. Bind
`reviewedProductionBackendNetwork` and
`reviewedProductionBackendNetworkId` to one of those exact rows. The preflight
also compares both names and IDs against each model, runner, and worker
attachment, so stale names or a shared Docker network are blocking findings.

Build `cutover-inventory.json` from the independent process source and the
redacted host, database, contract, OMP model-service, and container captures
before binding the permission flags. Do not populate process rows from the
reviewed legacy manifest. Have the second operator write:

- `reviewed-process-source.json`: a non-empty JSON array with exactly
  `id`, `kind`, `command`, and `status`, plus optional `role`, `workerId`, and
  `processClass` fields for each process;
- `reviewed-inventory-values.json`: an object with exactly `now`, `expected`,
  `observed`, `controlPlaneProcesses`, `legacyServiceUnits`, `legacyClaims`,
  `databasePermissions`, `reviewedAgentNetwork`,
  `reviewedProductionBackendNetwork`, `reviewedProductionBackendNetworkId`,
  `productionDatabaseNetworkEvidence`, `reviewedModelAuthNetwork`,
  `reviewedModelClientNetwork`, `reviewedModelEgressNetwork`,
  `reviewedAgentImage`, `reviewedAgentImageId`, `reviewedBrokerStateVolume`,
  `runnerModelGatewayBearerSha256`,
  `reviewedWorkspaceVolume`, `brokerStateVolumeAttachments`,
  `modelAuthBrokerBearerSource`, `modelGatewayBearerSource`,
  `reviewedModelServiceState`, `modelAuthBrokerContainer`,
  `modelGatewayContainer`, `runnerContainer`, `containers`, and
  `auxiliaryContainers`.
  The model slots must contain the exact IDs `affiliate-model-auth-broker` and
  `affiliate-model-gateway`; capture their full Docker container IDs,
  immutable image reference, independent Docker config ID, effective
  allowlisted environment, role-specific entrypoint/Cmd, structured
  source/type/target/readOnly mounts, lifecycle status/health, and
  `restartPolicy=no`. Record `STOPPED` only for created/exited services or
  `RUNNING` only for running and healthy services. Auth setup may be running
  before business preflight when separately approved; do not infer an auth
  stop requirement from stopped business writers.
  `reviewedAgentImage` is the full registry `image@sha256:<64-hex>` reference;
  `reviewedAgentImageId` is the separate Docker `sha256:<64-hex>` config ID.
  `brokerStateVolumeAttachments` must contain exactly one writable
  `/var/lib/omp` attachment by the actual broker container ID. The
  `productionDatabaseNetworkEvidence` object must contain the full production
  Postgres container ID and every attached `{name,id}` pair captured from
  Docker. Bind the reviewed production-backend name and ID to one exact pair,
  and keep the evidence separate from all three model network names and IDs.
  Each bearer source record contains only path, regular/no-symlink booleans,
  uid/gid, mode `0640`, bounded size, and SHA-256; the broker and gateway
  source paths and fingerprints must differ. The runner model bearer SHA must
  equal the gateway source SHA.
  `controlPlaneProcesses` must contain exactly the four control-plane IDs
  `affiliate-gateway`, `affiliate-agent-runner`,
  `affiliate-agent-downstream-ready`, and
  `affiliate-replenishment-controller`, each with its observed status.
  `auxiliaryContainers` must contain exactly one readiness-helper row and one
  replenishment-controller row; the runner remains in `runnerContainer`.
  The auxiliary IDs are `affiliate-agent-downstream-ready` and
  `affiliate-replenishment-controller`.

`tmpfs` options are read from `.HostConfig.Tmpfs`, and every actual `.Mounts`
row is retained in the structured mount list, including engine-reported tmpfs
rows. A legacy Compose capture may provide the required tmpfs map without
duplicate rows; when Docker reports tmpfs rows, they must reconcile exactly
with that map's required targets. Reject unknown, duplicate, conflicting, or
shadowing tmpfs rows rather than filtering them out.
Capture the model-service records independently before writing
`reviewed-inventory-values.json`; do not infer them from Compose YAML. The
following read-only capture shape retains the actual IDs, effective image
configuration, lifecycle, and structured mounts while excluding bearer
contents:

```text
export OMP_AUTH_BROKER_CONTAINER_ID="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml ps -aq affiliate-model-auth-broker
)"
export OMP_MODEL_GATEWAY_CONTAINER_ID="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml ps -aq affiliate-model-gateway
)"
test -n "$OMP_AUTH_BROKER_CONTAINER_ID"
test -n "$OMP_MODEL_GATEWAY_CONTAINER_ID"
test "$OMP_AUTH_BROKER_CONTAINER_ID" != "$OMP_MODEL_GATEWAY_CONTAINER_ID"
export OMP_MODEL_SERVICE_CAPTURE=/path/to/affiliate-governed-private/omp-model-services.redacted.json
test ! -e "$OMP_MODEL_SERVICE_CAPTURE"
export OMP_MODEL_AUTH_NETWORK="$(
  sed -n 's/^AFFILIATE_AGENT_MODEL_AUTH_NETWORK=//p' \
    /path/to/affiliate-governed-private/deployment.env
)"
export OMP_MODEL_CLIENT_NETWORK="$(
  sed -n 's/^AFFILIATE_AGENT_MODEL_CLIENT_NETWORK=//p' \
    /path/to/affiliate-governed-private/deployment.env
)"
export OMP_MODEL_EGRESS_NETWORK="$(
  sed -n 's/^AFFILIATE_AGENT_MODEL_EGRESS_NETWORK=//p' \
    /path/to/affiliate-governed-private/deployment.env
)"
test -n "$OMP_MODEL_AUTH_NETWORK"
test -n "$OMP_MODEL_CLIENT_NETWORK"
test -n "$OMP_MODEL_EGRESS_NETWORK"
export OMP_MODEL_INTERNAL_NETWORKS="$(
  docker network inspect \
    "$OMP_MODEL_AUTH_NETWORK" "$OMP_MODEL_CLIENT_NETWORK" "$OMP_MODEL_EGRESS_NETWORK" |
    jq -c '[.[] | select(.Internal == true) | .Name]'
)"
test -n "$OMP_MODEL_INTERNAL_NETWORKS"
test -s "$OMP_PRODUCTION_DATABASE_NETWORK_EVIDENCE"
test ! -L "$OMP_PRODUCTION_DATABASE_NETWORK_EVIDENCE"
docker inspect "$OMP_AUTH_BROKER_CONTAINER_ID" "$OMP_MODEL_GATEWAY_CONTAINER_ID" |
  jq --slurpfile productionNetworkEvidence "$OMP_PRODUCTION_DATABASE_NETWORK_EVIDENCE" \
    --argjson internalNetworks "$OMP_MODEL_INTERNAL_NETWORKS" '
  map({
    id: (.Config.Labels["com.docker.compose.service"] // ""),
    containerId: .Id,
    image: .Config.Image,
    imageId: .Image,
    user: (.Config.User // ""),
    hasReadonlyRootFilesystem: (.HostConfig.ReadonlyRootfs // false),
    privileged: (.HostConfig.Privileged // false),
    tmpfs: (.HostConfig.Tmpfs // {}),
    environment: [
      .Config.Env[]?
    ],
    entrypoint: (.Config.Entrypoint // []),
    command: (.Config.Cmd // []),
    mounts: [
      .Mounts[]?
      | {
          source: (
            if ((.Type // "") | ascii_downcase) == "volume"
            then (.Name // "")
            else (.Source // "")
            end
          ),
          type: ((.Type // "") | ascii_downcase),
          target: (.Destination // ""),
          readOnly: ((.RW // true) | not)
        }
    ],
    networkAttachments: ([
      .NetworkSettings.Networks // {}
      | to_entries[]
      | {name: .key, id: .value.NetworkID}
    ]),
    networks: ([.NetworkSettings.Networks // {} | keys[]]),
    internalNetworks: (
      [.NetworkSettings.Networks // {} | keys[]]
      | map(select(. as $network | $internalNetworks | index($network) != null))
    ),
    exposedPorts: ([.Config.ExposedPorts // {} | keys[] | sub("/tcp$"; "")]),
    publishedPorts: ([.HostConfig.PortBindings // {} | keys[]]),
    capDrop: (.HostConfig.CapDrop // []),
    capAdd: (.HostConfig.CapAdd // []),
    groupAdd: (.HostConfig.GroupAdd // []),
    securityOptions: (.HostConfig.SecurityOpt // []),
    status: (.State.Status // "unknown"),
    healthStatus: (.State.Health.Status // "none"),
    restartPolicy: (.HostConfig.RestartPolicy.Name // "no"),
    hasProductionBackendAccess: (
      ([.NetworkSettings.Networks // {} | to_entries[] | {name: .key, id: .value.NetworkID}] as $attachments
        | any($attachments[]; .name as $name | .id as $id
          | any($productionNetworkEvidence[0].networks[]?;
            .name == $name or .id == $id)))
    )
  })
  | if length == 2
    and ([.[].id] | sort) == ["affiliate-model-auth-broker", "affiliate-model-gateway"]
    and all(.[].environment[]?;
      (split("=")[0]) as $key
      | [
          "HOME",
          "NODE_ENV",
          "NODE_VERSION",
          "OMP_PROFILE",
          "PATH",
          "PI_CONFIG_DIR",
          "YARN_VERSION",
          "OMP_AUTH_BROKER_URL"
        ] | index($key) != null)
    and all(.[].environment[]?; test("^[A-Za-z_][A-Za-z0-9_]*=[^<\\r\\n]*$"))
    and all(.[].image; test("^.+@sha256:[a-fA-F0-9]{64}$"))
    and all(.[].imageId; test("^sha256:[a-fA-F0-9]{64}$"))
    then .
    else error("invalid OMP model-service capture")
    end
  ' > "$OMP_MODEL_SERVICE_CAPTURE"
test -s "$OMP_MODEL_SERVICE_CAPTURE"
test ! -L "$OMP_MODEL_SERVICE_CAPTURE"
```

For each source path in `AFFILIATE_MODEL_AUTH_BROKER_TOKEN_FILE` and
`AFFILIATE_MODEL_GATEWAY_TOKEN_FILE`, use the host Node preparation helper's
same source checks: `stat` uid/gid/mode, regular non-symlink identity, bounded
byte size, valid UTF-8, and a nonempty JavaScript `String.prototype.trim()`
value. Record only the source metadata and SHA-256 of that normalized
effective UTF-8 value, never the raw file hash or bearer text. Reject equal
paths or equal normalized values before any profile copy, including a
`shared-token\n` source paired with a `shared-token` source and any
Unicode-whitespace-only source. Capture all consumers of
`AFFILIATE_MODEL_AUTH_BROKER_STATE_VOLUME` with actual full container IDs;
retain exactly the broker's writable `/var/lib/omp` attachment and no shared
workspace consumer. Copy the resulting model rows and source metadata into
the two model slots and fields listed above without copying raw bearer
contents.
Capture the two redacted source records with the same helper before writing
the values file. The helper prints only metadata and the normalized-value
fingerprint; it never prints bearer bytes. Pass source paths as arguments, not
token contents:
The host process must have read permission for the root-owned `0640` source
files (normally run this capture as root via `sudo -n`); source paths are the
only command-line arguments and bearer values must never appear in argv or
logs.

Set `OMP_OPERATOR_JS_RUNTIME` to a verified Node 20+ or Bun 1.3.14+ executable
on the operator host. The runtime inside a Docker image does not imply that
the host has one. The current VPS uses a private Bun copy from the reviewed
broker image; its source/copy fingerprints and exact path are recorded in the
OMP ExecPlan. Verify the copy before privileged use. Do not silently install
a global runtime or change the host PATH.

```text
export OMP_BEARER_SOURCE_CAPTURE=/path/to/affiliate-governed-private/omp-bearer-sources.redacted.json
export OMP_BEARER_PREPARATION_HELPER=/path/to/repository/apps/site/deploy/affiliate-governed/prepare-omp-bearers.mjs
export OMP_OPERATOR_JS_RUNTIME=/path/to/verified/operator-runtime
test -x "$OMP_OPERATOR_JS_RUNTIME"
export OMP_AUTH_BROKER_TOKEN_SOURCE="$(
  sed -n 's/^AFFILIATE_MODEL_AUTH_BROKER_TOKEN_FILE=//p' \
    /path/to/affiliate-governed-private/deployment.env
)"
export OMP_MODEL_GATEWAY_TOKEN_SOURCE="$(
  sed -n 's/^AFFILIATE_MODEL_GATEWAY_TOKEN_FILE=//p' \
    /path/to/affiliate-governed-private/deployment.env
)"
test -n "$OMP_AUTH_BROKER_TOKEN_SOURCE"
test -n "$OMP_MODEL_GATEWAY_TOKEN_SOURCE"
test ! -e "$OMP_BEARER_SOURCE_CAPTURE"
(umask 077; sudo -n "$OMP_OPERATOR_JS_RUNTIME" "$OMP_BEARER_PREPARATION_HELPER" capture \
  "$OMP_AUTH_BROKER_TOKEN_SOURCE" "$OMP_MODEL_GATEWAY_TOKEN_SOURCE" \
  > "$OMP_BEARER_SOURCE_CAPTURE")
test -s "$OMP_BEARER_SOURCE_CAPTURE"
test ! -L "$OMP_BEARER_SOURCE_CAPTURE"
```

Capture every container that references the broker volume, including stopped
containers and containers outside this Compose project. Do not author the
attachment list from only the two model-service rows.

```text
export OMP_BROKER_VOLUME_CAPTURE=/path/to/affiliate-governed-private/omp-broker-volume-attachments.redacted.json
OMP_BROKER_STATE_VOLUME="$(
  sed -n 's/^AFFILIATE_MODEL_AUTH_BROKER_STATE_VOLUME=//p' \
    /path/to/affiliate-governed-private/deployment.env
)"
test -n "$OMP_BROKER_STATE_VOLUME"
test ! -e "$OMP_BROKER_VOLUME_CAPTURE"
OMP_BROKER_VOLUME_CONSUMERS="$(
  docker ps -aq --no-trunc --filter "volume=$OMP_BROKER_STATE_VOLUME" | paste -sd' '
)"
test -n "$OMP_BROKER_VOLUME_CONSUMERS"
docker inspect $OMP_BROKER_VOLUME_CONSUMERS |
  jq --arg volume "$OMP_BROKER_STATE_VOLUME" '
    [.[] as $container
      | $container.Mounts[]?
      | select(.Type == "volume" and .Name == $volume)
      | {
          volumeName: .Name,
          containerId: $container.Id,
          serviceId: ($container.Config.Labels["com.docker.compose.service"] // "UNMANAGED"),
          target: .Destination,
          readOnly: (.RW | not)
        }]
    | sort_by(.containerId, .target)
  ' > "$OMP_BROKER_VOLUME_CAPTURE"
test -s "$OMP_BROKER_VOLUME_CAPTURE"
test ! -L "$OMP_BROKER_VOLUME_CAPTURE"
```


Use the exact nested shapes in `preflight-affiliate-cutover.ts`. Preserve
only safe effective model environment entries and
`KEY=<redacted>` entries for every other container value; never put a raw
secret or bearer in either source. The process source must contain every
legacy process in the reviewed manifest with `kind: "LEGACY"`, matching
`processClass`, and `status: "STOPPED"`, but must also be independently
captured and reviewed.
Give the process source an artifact ID different from the manifest artifact ID.
The command below validates the source boundaries, computes the canonical
process hash and count, and creates the independent process artifact and
session-bound inventory before any manifest or preflight command reads it:

```text
export REVIEWED_MANIFEST=/path/to/affiliate-governed-private/reviewed-legacy-process-manifest.json
export REVIEWED_PROCESS_SOURCE=/path/to/affiliate-governed-private/reviewed-process-source.json
export REVIEWED_VALUES_SOURCE=/path/to/affiliate-governed-private/reviewed-inventory-values.json
export REVIEWED_PROCESS_OUTPUT=/path/to/affiliate-governed-private/reviewed-process-inventory.json
export CUTOVER_INVENTORY=/path/to/affiliate-governed-private/cutover-inventory.json
export REVIEWED_WORKER_CAPTURE=/path/to/affiliate-governed-private/reviewed-affiliate-workers.redacted.json
export PROCESS_INVENTORY_ARTIFACT_ID=observed-cutover-process-inventory-$(date -u '+%Y%m%dT%H%M%SZ')-$$
for source_path in "$REVIEWED_MANIFEST" "$REVIEWED_PROCESS_SOURCE" "$REVIEWED_VALUES_SOURCE" \
  "$REVIEWED_WORKER_CAPTURE" "$REVIEWED_REPLENISHMENT_CAPTURE" "$OMP_MODEL_SERVICE_CAPTURE" \
  "$OMP_BEARER_SOURCE_CAPTURE" "$OMP_BROKER_VOLUME_CAPTURE" \
  "$OMP_PRODUCTION_DATABASE_NETWORK_EVIDENCE"; do
  test -s "$source_path"
  test ! -L "$source_path"
done
test ! -e "$REVIEWED_PROCESS_OUTPUT"
test ! -e "$CUTOVER_INVENTORY"
test "$PROCESS_INVENTORY_ARTIFACT_ID" != "$(jq -er '.artifactId' "$REVIEWED_MANIFEST")"
if ! (
  cd "$OPERATOR_CLI_DIR"
  ./node_modules/.bin/tsx -e '
    import { readFile, writeFile } from "node:fs/promises";
    import { hashAffiliateCutoverProcessInventory } from "./src/server/affiliateImports/affiliateFleetCutover";
    import { canonicalizeAffiliateAgentValue } from "./src/server/affiliateImports/agentGatewayContracts";

    const requiredPath = (name: string): string => {
      const value = process.env[name]?.trim();
      if (!value) throw new Error(`Missing ${name}.`);
      return value;
    };
    const readJson = async (path: string): Promise<unknown> =>
      JSON.parse(await readFile(path, "utf8"));
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value);
    const assertExactKeys = (
      value: unknown,
      keys: readonly string[],
      label: string,
    ): void => {
      if (!isRecord(value)) throw new Error(`${label} must be an object.`);
      const actual = Object.keys(value).sort();
      const expected = [...keys].sort();
      if (actual.join("\0") !== expected.join("\0")) {
        throw new Error(`${label} must contain exactly: ${keys.join(", ")}.`);
      }
    };
    const assertRequiredKeys = (
      value: unknown,
      required: readonly string[],
      allowed: readonly string[],
      label: string,
    ): void => {
      if (!isRecord(value)) throw new Error(`${label} must be an object.`);
      const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
      const missing = required.filter((key) => !(key in value));
      if (unknown.length || missing.length) {
        throw new Error(`${label} has unknown or missing fields.`);
      }
    };
    const assertString = (value: unknown, label: string): void => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${label} must be a non-empty string.`);
      }
    };
    const manifest = await readJson(requiredPath("REVIEWED_MANIFEST"));
    if (!isRecord(manifest)) throw new Error("Reviewed manifest must be an object.");
    assertString(manifest.artifactId, "Reviewed manifest artifactId");
    if (!Array.isArray(manifest.processes) || !Array.isArray(manifest.systemdUnits)) {
      throw new Error("Reviewed manifest must contain processes and systemdUnits arrays.");
    }
    const processArtifactId = requiredPath("PROCESS_INVENTORY_ARTIFACT_ID");
    if (manifest.artifactId.trim() === processArtifactId) {
      throw new Error("Process and manifest artifact IDs must differ.");
    }
    for (const row of manifest.processes) {
      assertExactKeys(row, ["id", "processClass"], "Reviewed manifest process");
      assertString(row.id, "Reviewed manifest process id");
      assertString(row.processClass, "Reviewed manifest processClass");
    }
    for (const row of manifest.systemdUnits) {
      assertExactKeys(row, ["processId", "unitId"], "Reviewed manifest systemd unit");
      assertString(row.processId, "Reviewed manifest systemd unit processId");
      assertString(row.unitId, "Reviewed manifest systemd unitId");
    }
    const processRows = await readJson(requiredPath("REVIEWED_PROCESS_SOURCE"));
    if (!Array.isArray(processRows) || processRows.length === 0) {
      throw new Error("Reviewed process source must be a non-empty array.");
    }
    const processAllowed = ["id", "kind", "role", "workerId", "processClass", "command", "status"];
    for (const [index, row] of processRows.entries()) {
      assertRequiredKeys(
        row,
        ["id", "kind", "command", "status"],
        processAllowed,
        `Reviewed process row ${index + 1}`,
      );
      for (const key of ["id", "command", "status"]) {
        assertString(row[key], `Reviewed process row ${index + 1} ${key}`);
      }
      if (!["LEGACY", "GOVERNED"].includes(row.kind)) {
        throw new Error(`Reviewed process row ${index + 1} has an invalid kind.`);
      }
      for (const key of ["role", "workerId", "processClass"]) {
        if (row[key] !== undefined) {
          assertString(row[key], `Reviewed process row ${index + 1} ${key}`);
        }
      }
    }
    const manifestRows = new Map(
      manifest.processes.map((row) => [String(row.id).trim(), row]),
    );
    for (const row of processRows.filter(
      (candidate): candidate is Record<string, unknown> =>
        isRecord(candidate) && candidate.kind === "LEGACY",
    )) {
      const expected = manifestRows.get(String(row.id).trim());
      if (
        !expected
        || String(row.processClass ?? "").trim().toUpperCase()
          !== String(expected.processClass).trim().toUpperCase()
        || String(row.status).trim().toUpperCase() !== "STOPPED"
      ) {
        throw new Error(`Reviewed process row ${row.id} does not match the legacy manifest.`);
      }
    }
    for (const row of manifest.processes) {
      if (!processRows.some(
        (candidate) => isRecord(candidate)
          && candidate.kind === "LEGACY"
          && String(candidate.id).trim() === String(row.id).trim()
          && String(candidate.processClass ?? "").trim().toUpperCase()
            === String(row.processClass).trim().toUpperCase()
          && String(candidate.status).trim().toUpperCase() === "STOPPED",
      )) {
        throw new Error(`Reviewed manifest process ${row.id} is missing from the process source.`);
      }
    }
    const values = await readJson(requiredPath("REVIEWED_VALUES_SOURCE"));
    const valueKeys = [
      "now",
      "expected",
      "observed",
      "controlPlaneProcesses",
      "legacyServiceUnits",
      "legacyClaims",
      "databasePermissions",
      "reviewedAgentNetwork",
      "reviewedProductionBackendNetwork",
      "reviewedProductionBackendNetworkId",
      "productionDatabaseNetworkEvidence",
      "reviewedModelAuthNetwork",
      "reviewedModelClientNetwork",
      "reviewedModelEgressNetwork",
      "reviewedAgentImage",
      "reviewedAgentImageId",
      "reviewedBrokerStateVolume",
      "brokerStateVolumeAttachments",
      "reviewedWorkspaceVolume",
      "modelAuthBrokerBearerSource",
      "modelGatewayBearerSource",
      "runnerModelGatewayBearerSha256",
      "reviewedModelServiceState",
      "modelAuthBrokerContainer",
      "modelGatewayContainer",
      "runnerContainer",
      "containers",
      "auxiliaryContainers",
    ];
    assertExactKeys(values, valueKeys, "Reviewed inventory values");
    const workerCapture = await readJson(requiredPath("REVIEWED_WORKER_CAPTURE"));
    if (!Array.isArray(workerCapture)) throw new Error("Worker capture must be an array.");
    const capturedRunners = workerCapture.filter((row) => isRecord(row) && row.service === "affiliate-agent-runner");
    if (capturedRunners.length !== 1 || !isRecord(capturedRunners[0])) throw new Error("Exactly one captured runner is required.");
    if (values.runnerModelGatewayBearerSha256 !== capturedRunners[0].modelGatewayBearerSha256) {
      throw new Error("Runner bearer fingerprint must come from its actual effective environment.");
    }
    const modelCapture = await readJson(requiredPath("OMP_MODEL_SERVICE_CAPTURE"));
    const bearerCapture = await readJson(requiredPath("OMP_BEARER_SOURCE_CAPTURE"));
    const volumeCapture = await readJson(requiredPath("OMP_BROKER_VOLUME_CAPTURE"));
    const databaseCapture = await readJson(requiredPath("OMP_PRODUCTION_DATABASE_NETWORK_EVIDENCE"));
    if (!Array.isArray(modelCapture) || !Array.isArray(bearerCapture) || bearerCapture.length !== 2 || !Array.isArray(volumeCapture)) {
      throw new Error("Complete independent model, bearer, and volume captures are required.");
    }
    const sameCapture = (left: unknown, right: unknown): boolean =>
      canonicalizeAffiliateAgentValue(left) === canonicalizeAffiliateAgentValue(right);
    for (const [field, id] of [
      ["modelAuthBrokerContainer", "affiliate-model-auth-broker"],
      ["modelGatewayContainer", "affiliate-model-gateway"],
    ]) {
      const rows = modelCapture.filter((row) => isRecord(row) && row.id === id);
      if (rows.length !== 1 || !sameCapture(values[field], rows[0])) throw new Error(`${field} must match its actual capture.`);
    }
    if (!sameCapture(values.modelAuthBrokerBearerSource, bearerCapture[0])
      || !sameCapture(values.modelGatewayBearerSource, bearerCapture[1])
      || !sameCapture(values.productionDatabaseNetworkEvidence, databaseCapture)
      || !sameCapture(
        (values.brokerStateVolumeAttachments as unknown[]).map(canonicalizeAffiliateAgentValue).sort(),
        volumeCapture.map(canonicalizeAffiliateAgentValue).sort(),
      )) throw new Error("Reviewed OMP evidence must match every independent capture.");
    const replenishmentCapture = await readJson(requiredPath("REVIEWED_REPLENISHMENT_CAPTURE"));
    if (!Array.isArray(replenishmentCapture) || replenishmentCapture.length !== 1) {
      throw new Error("Exactly one independent replenishment capture is required.");
    }
    const capturedContainers = [...workerCapture, ...replenishmentCapture];
    const capturedByService = new Map<string, Record<string, unknown>>();
    for (const row of capturedContainers) {
      if (!isRecord(row) || typeof row.service !== "string" || capturedByService.has(row.service)) {
        throw new Error("Captured container services must be present and unique.");
      }
      capturedByService.set(row.service, row);
    }
    const inspectedFields = [
      "name", "user", "hasReadonlyRootFilesystem", "privileged", "tmpfs",
      "environment", "mounts", "networks", "networkAttachments", "isNetworkInternal",
      "capDrop", "capAdd", "groupAdd", "cgroupNamespace", "ipcMode", "securityOptions",
    ];
    const fieldCapture = (value: unknown): string => Array.isArray(value)
      ? JSON.stringify(value.map(canonicalizeAffiliateAgentValue).sort())
      : canonicalizeAffiliateAgentValue(value ?? null);
    const bindCapturedContainer = (candidate: unknown, service: string): void => {
      const captured = capturedByService.get(service);
      if (!isRecord(candidate) || candidate.id !== service || !captured) {
        throw new Error(`Missing exact captured service ${service}.`);
      }
      const fields = service === "affiliate-agent-runner"
        ? [...inspectedFields, "cgroupRelativePath", "childUid", "childGid", "supervisorUid"]
        : inspectedFields;
      for (const field of fields) {
        if (fieldCapture(candidate[field]) !== fieldCapture(captured[field])) {
          throw new Error(`${service} ${field} must match the actual capture.`);
        }
      }
    };
    bindCapturedContainer(values.runnerContainer, "affiliate-agent-runner");
    const workerServices = ["mapping-producer-1", "mapping-producer-2", "supply-reviewer-1", "supply-reviewer-2", "coverage-planner"];
    const auxiliaryServices = ["affiliate-agent-downstream-ready", "affiliate-replenishment-controller"];
    for (const [rows, services] of [
      [values.containers, workerServices],
      [values.auxiliaryContainers, auxiliaryServices],
    ] as const) {
      if (!Array.isArray(rows) || rows.length !== services.length) throw new Error("Captured container inventory is incomplete.");
      for (const service of services) {
        const matches = rows.filter((row) => isRecord(row) && row.id === service);
        if (matches.length !== 1) throw new Error(`Missing or duplicate ${service}.`);
        bindCapturedContainer(matches[0], service);
      }
    }
    assertString(values.now, "Reviewed inventory values now");
    assertString(values.reviewedAgentNetwork, "Reviewed inventory values reviewedAgentNetwork");
    for (const key of ["expected", "observed", "databasePermissions"]) {
      if (!isRecord(values[key])) throw new Error(`Reviewed inventory values ${key} must be an object.`);
    }
    for (const key of [
      "reviewedAgentNetwork",
      "reviewedProductionBackendNetwork",
      "reviewedProductionBackendNetworkId",
      "reviewedModelAuthNetwork",
      "reviewedModelClientNetwork",
      "reviewedModelEgressNetwork",
      "reviewedAgentImage",
      "reviewedAgentImageId",
      "reviewedBrokerStateVolume",
      "reviewedWorkspaceVolume",
      "runnerModelGatewayBearerSha256",
      "reviewedModelServiceState",
    ]) {
      assertString(values[key], `Reviewed inventory values ${key}`);
    }
    const productionNetworkEvidence = values.productionDatabaseNetworkEvidence;
    if (
      !isRecord(productionNetworkEvidence)
      || Object.keys(productionNetworkEvidence).sort().join("\0") !== ["containerId", "networks"].join("\0")
      || typeof productionNetworkEvidence.containerId !== "string"
      || !/^[a-fA-F0-9]{64}$/.test(productionNetworkEvidence.containerId)
      || !Array.isArray(productionNetworkEvidence.networks)
      || productionNetworkEvidence.networks.length === 0
      || productionNetworkEvidence.networks.some((network) => (
        !isRecord(network)
        || Object.keys(network).sort().join("\0") !== ["id", "name"].join("\0")
        || typeof network.name !== "string"
        || !network.name.trim()
        || typeof network.id !== "string"
        || !/^[a-fA-F0-9]{64}$/.test(network.id)
      ))
    ) {
      throw new Error("productionDatabaseNetworkEvidence must contain the actual Postgres container and network name/ID records.");
    }
    const productionNetworkNames = productionNetworkEvidence.networks
      .map((network) => String((network as Record<string, unknown>).name));
    const productionNetworkIds = productionNetworkEvidence.networks
      .map((network) => String((network as Record<string, unknown>).id));
    if (
      new Set(productionNetworkNames).size !== productionNetworkNames.length
      || new Set(productionNetworkIds).size !== productionNetworkIds.length
      || productionNetworkEvidence.networks.filter((network) => (
        (network as Record<string, unknown>).name === values.reviewedProductionBackendNetwork
        && (network as Record<string, unknown>).id === values.reviewedProductionBackendNetworkId
      )).length !== 1
    ) {
      throw new Error("The reviewed production-backend name and ID must identify exactly one captured Postgres network attachment.");
    }
    for (const key of [
      "modelAuthBrokerBearerSource",
      "modelGatewayBearerSource",
      "modelAuthBrokerContainer",
      "modelGatewayContainer",
    ]) {
      if (!isRecord(values[key])) throw new Error(`Reviewed inventory values ${key} must be an object.`);
    }
    if (!Array.isArray(values.brokerStateVolumeAttachments)) {
      throw new Error("Reviewed inventory values brokerStateVolumeAttachments must be an array.");
    }
    for (const key of ["controlPlaneProcesses", "legacyServiceUnits", "legacyClaims", "containers", "auxiliaryContainers"]) {
      if (!Array.isArray(values[key])) throw new Error(`Reviewed inventory values ${key} must be an array.`);
    }
    if (values.controlPlaneProcesses.length !== 4) {
      throw new Error("Reviewed inventory values controlPlaneProcesses must contain exactly four entries.");
    }
    values.controlPlaneProcesses.forEach((process, index) => {
      assertExactKeys(process, ["id", "status"], `controlPlaneProcesses row ${index + 1}`);
      assertString(process.id, `controlPlaneProcesses row ${index + 1} id`);
      assertString(process.status, `controlPlaneProcesses row ${index + 1} status`);
    });
    const controlPlaneIds = values.controlPlaneProcesses
      .map((process) => isRecord(process) ? String(process.id ?? "").trim() : "")
      .sort();
    if (controlPlaneIds.some((id) => !id) || controlPlaneIds.join("\0")
      !== ["affiliate-agent-downstream-ready", "affiliate-agent-runner", "affiliate-gateway", "affiliate-replenishment-controller"].join("\0")) {
      throw new Error("Reviewed inventory values controlPlaneProcesses must identify gateway, runner, readiness helper, and replenishment controller.");
    }
    const snapshotKeys = [
      "supplyContractVersion",
      "supplyContractHash",
      "deploymentContractVersion",
      "deploymentContractHash",
      "gatewayVersion",
      "roleContractHashes",
      "promptTemplateHashes",
    ];
    for (const key of ["expected", "observed"]) {
      assertExactKeys(values[key], snapshotKeys, `Reviewed inventory values ${key}`);
      if (!isRecord(values[key].roleContractHashes) || !isRecord(values[key].promptTemplateHashes)) {
        throw new Error(`${key} contract hashes must be objects.`);
      }
    }
    const modelBearerAllowed = [
      "path",
      "isRegularFile",
      "isSymlink",
      "uid",
      "gid",
      "mode",
      "sizeBytes",
      "sha256",
    ];
    const assertModelBearerSource = (value: unknown, label: string): void => {
      assertRequiredKeys(value, modelBearerAllowed, modelBearerAllowed, label);
      if (!isRecord(value)) throw new Error(`${label} must be an object.`);
      if (
        typeof value.path !== "string"
        || value.isRegularFile !== true
        || value.isSymlink !== false
        || value.uid !== 0
        || value.gid !== 1003
        || !/^0?640$/.test(String(value.mode))
        || !Number.isInteger(value.sizeBytes)
        || Number(value.sizeBytes) < 1
        || Number(value.sizeBytes) > 64 * 1024
        || !/^[a-fA-F0-9]{64}$/.test(String(value.sha256))
      ) {
        throw new Error(`${label} must prove a root:1003 regular non-symlink 0640 file with bounded metadata and a SHA-256 fingerprint of its normalized effective UTF-8 value.`);
      }
    };
    const modelContainerAllowed = [
      "id",
      "containerId",
      "image",
      "imageId",
      "user",
      "hasReadonlyRootFilesystem",
      "privileged",
      "tmpfs",
      "environment",
      "entrypoint",
      "command",
      "mounts",
      "networks",
      "networkAttachments",
      "internalNetworks",
      "exposedPorts",
      "publishedPorts",
      "capDrop",
      "capAdd",
      "groupAdd",
      "securityOptions",
      "status",
      "healthStatus",
      "restartPolicy",
      "hasProductionBackendAccess",
    ];
    const assertNetworkAttachments = (value: Record<string, unknown>, label: string): void => {
      if (!Array.isArray(value.networkAttachments) || value.networkAttachments.some((attachment) => (
        !isRecord(attachment)
        || Object.keys(attachment).sort().join("\0") !== ["id", "name"].join("\0")
        || typeof attachment.name !== "string"
        || !attachment.name.trim()
        || typeof attachment.id !== "string"
        || !/^[a-fA-F0-9]{64}$/.test(attachment.id)
      ))) {
        throw new Error(`${label} networkAttachments must contain actual name/id records.`);
      }
      const attachmentNames = value.networkAttachments.map((attachment) => (
        String((attachment as Record<string, unknown>).name)
      )).sort();
      const attachmentIds = value.networkAttachments.map((attachment) => (
        String((attachment as Record<string, unknown>).id)
      ));
      const networkNames = (value.networks as unknown[]).map(String).sort();
      if (
        new Set(attachmentNames).size !== attachmentNames.length
        || new Set(attachmentIds).size !== attachmentIds.length
        || JSON.stringify(attachmentNames) !== JSON.stringify(networkNames)
      ) {
        throw new Error(`${label} networkAttachments must match every captured network name exactly once.`);
      }
    };
    const assertModelContainer = (
      value: unknown,
      label: string,
      expectedId: string,
    ): void => {
      assertRequiredKeys(value, modelContainerAllowed, modelContainerAllowed, label);
      if (!isRecord(value)) throw new Error(`${label} must be an object.`);
      if (value.id !== expectedId) throw new Error(`${label} must identify ${expectedId}.`);
      if (!/^[a-fA-F0-9]{64}$/.test(String(value.containerId))) {
        throw new Error(`${label} must include its full Docker container ID.`);
      }
      if (
        typeof value.image !== "string"
        || !/^.+@sha256:[a-fA-F0-9]{64}$/.test(value.image)
        || !/^sha256:[a-fA-F0-9]{64}$/.test(String(value.imageId))
      ) {
        throw new Error(`${label} must include an immutable image reference and separate Docker config ID.`);
      }
      if (typeof value.user !== "string" || value.hasReadonlyRootFilesystem !== true || value.privileged !== false) {
        throw new Error(`${label} must prove the reviewed non-root read-only boundary.`);
      }
      if (!isRecord(value.tmpfs) || Object.values(value.tmpfs).some((entry) => typeof entry !== "string")) {
        throw new Error(`${label} tmpfs must be a string map.`);
      }
      if (!Array.isArray(value.environment) || value.environment.some(
        (entry) => typeof entry !== "string"
          || !/^[A-Za-z_][A-Za-z0-9_]*=[^<\r\n]*$/.test(entry)
          || /^(?:AFFILIATE_AGENT_MODEL_GATEWAY_TOKEN|AFFILIATE_AGENT_MODEL_AUTH_BROKER_TOKEN|OMP_AUTH_BROKER_TOKEN)=/.test(entry),
      )) {
        throw new Error(`${label} environment must contain safe effective entries and no bearer value.`);
      }
      for (const key of ["entrypoint", "command", "networks", "internalNetworks", "exposedPorts", "publishedPorts", "capDrop", "capAdd", "groupAdd", "securityOptions"]) {
        if (!Array.isArray(value[key]) || value[key].some((entry) => typeof entry !== "string")) {
          throw new Error(`${label} ${key} must be a string array.`);
        }
      }
      assertNetworkAttachments(value, label);
      if (!Array.isArray(value.mounts) || value.mounts.some((mount) => (
        !isRecord(mount)
        || Object.keys(mount).sort().join("\0") !== ["readOnly", "source", "target", "type"].join("\0")
        || typeof mount.source !== "string"
        || !["bind", "volume", "tmpfs"].includes(String(mount.type))
        || typeof mount.target !== "string"
        || typeof mount.readOnly !== "boolean"
      ))) {
        throw new Error(`${label} mounts must contain structured source/type/target/readOnly records.`);
      }
      if (
        typeof value.status !== "string"
        || typeof value.healthStatus !== "string"
        || value.restartPolicy !== "no"
        || typeof value.hasProductionBackendAccess !== "boolean"
      ) {
        throw new Error(`${label} must include lifecycle and restart evidence.`);
      }
    };
    assertModelContainer(values.modelAuthBrokerContainer, "modelAuthBrokerContainer", "affiliate-model-auth-broker");
    assertModelContainer(values.modelGatewayContainer, "modelGatewayContainer", "affiliate-model-gateway");
    if (
      values.modelAuthBrokerBearerSource.path === values.modelGatewayBearerSource.path
      || values.modelAuthBrokerBearerSource.sha256 === values.modelGatewayBearerSource.sha256
      || values.runnerModelGatewayBearerSha256 !== values.modelGatewayBearerSource.sha256
      || values.reviewedWorkspaceVolume === values.reviewedBrokerStateVolume
      || !["STOPPED", "RUNNING"].includes(values.reviewedModelServiceState)
      || values.modelAuthBrokerContainer.hasProductionBackendAccess !== false
      || values.modelGatewayContainer.hasProductionBackendAccess !== false
    ) {
      throw new Error("OMP model slots must use distinct bearer evidence and workspace/state volumes, gateway-bound runner SHA, explicit lifecycle, and no backend access.");
    }
    assertExactKeys(
      values.brokerStateVolumeAttachments[0],
      ["volumeName", "containerId", "serviceId", "target", "readOnly"],
      "brokerStateVolumeAttachments row 1",
    );
    if (
      values.brokerStateVolumeAttachments.length !== 1
      || values.brokerStateVolumeAttachments[0].volumeName !== values.reviewedBrokerStateVolume
      || values.brokerStateVolumeAttachments[0].containerId !== values.modelAuthBrokerContainer.containerId
      || values.brokerStateVolumeAttachments[0].serviceId !== "affiliate-model-auth-broker"
      || values.brokerStateVolumeAttachments[0].target !== "/var/lib/omp"
      || values.brokerStateVolumeAttachments[0].readOnly !== false
    ) {
      throw new Error("The dedicated broker state volume must have exactly one writable attachment by the actual broker container ID.");
    }
    if (new Set([
      values.reviewedModelAuthNetwork,
      values.reviewedModelClientNetwork,
      values.reviewedModelEgressNetwork,
      values.reviewedProductionBackendNetwork,
    ]).size !== 4) {
      throw new Error("The three model networks and actual production-backend network must be distinct.");
    }
    const containerAllowed = [
      "id",
      "name",
      "user",
      "hasReadonlyRootFilesystem",
      "privileged",
      "tmpfs",
      "environment",
      "mounts",
      "networks",
      "networkAttachments",
      "isNetworkInternal",
      "capDrop",
      "capAdd",
      "groupAdd",
      "cgroupNamespace",
      "ipcMode",
      "cgroupRelativePath",
      "childUid",
      "childGid",
      "supervisorUid",
      "securityOptions",
    ];
    const assertRedactedContainer = (value: unknown, label: string): void => {
      const required = [
        "id",
        "user",
        "hasReadonlyRootFilesystem",
        "privileged",
        "tmpfs",
        "environment",
        "networks",
        "networkAttachments",
        "isNetworkInternal",
        "capDrop",
        "capAdd",
        "groupAdd",
        "cgroupNamespace",
        "ipcMode",
        "securityOptions",
      ];
      if (label === "runnerContainer") {
        required.push("cgroupRelativePath", "childUid", "childGid", "supervisorUid", "mounts");
      }
      assertRequiredKeys(value, required, containerAllowed, label);
      if (!isRecord(value)) throw new Error(`${label} must be an object.`);
      assertString(value.id, `${label} id`);
      assertString(value.user, `${label} user`);
      for (const key of ["hasReadonlyRootFilesystem", "privileged", "isNetworkInternal"]) {
        if (typeof value[key] !== "boolean") {
          throw new Error(`${label} ${key} must be boolean.`);
        }
      }
      if (!isRecord(value.tmpfs) || Object.values(value.tmpfs).some(
        (entry) => typeof entry !== "string",
      )) {
        throw new Error(`${label} tmpfs must be a string map.`);
      }
      for (const key of ["networks", "capDrop", "capAdd", "groupAdd", "securityOptions"]) {
        if (!Array.isArray(value[key]) || value[key].some((entry) => typeof entry !== "string")) {
          throw new Error(`${label} ${key} must be a string array.`);
        }
      }
      assertNetworkAttachments(value, label);
      if (value.cgroupNamespace !== null) assertString(value.cgroupNamespace, `${label} cgroupNamespace`);
      if (value.ipcMode !== null) assertString(value.ipcMode, `${label} ipcMode`);
      const safeRunnerEnvironment = [
        "AFFILIATE_AGENT_MODEL_GATEWAY_ADDRESS=http://affiliate-model-gateway:4000",
        "AFFILIATE_AGENT_OMP_MODEL=openai-codex/gpt-5.6-luna",
      ];
      if (!Array.isArray(value.environment) || value.environment.some(
        (entry) => typeof entry !== "string"
          || (!/^[A-Za-z_][A-Za-z0-9_]*=<redacted>$/.test(entry)
            && !(label === "runnerContainer" && safeRunnerEnvironment.includes(entry))),
      )) {
        throw new Error(`${label} environment must contain redacted entries and only the reviewed runner endpoint/model values.`);
      }
      if (value.mounts !== undefined && (!Array.isArray(value.mounts) || value.mounts.some((mount) => (
        !isRecord(mount)
        || Object.keys(mount).sort().join("\0") !== ["readOnly", "source", "target", "type"].join("\0")
        || typeof mount.source !== "string"
        || !["bind", "volume", "tmpfs"].includes(mount.type)
        || typeof mount.target !== "string"
        || typeof mount.readOnly !== "boolean"
      )))) {
        throw new Error(`${label} mounts must contain structured source/type/target/readOnly records.`);
      }
      if (label === "runnerContainer" && (
        !Array.isArray(value.mounts)
        || value.mounts.length !== 1
        || value.mounts[0].source !== values.reviewedWorkspaceVolume
        || value.mounts[0].type !== "volume"
        || value.mounts[0].target !== "/workspaces"
        || value.mounts[0].readOnly !== false
      )) {
        throw new Error("runnerContainer must contain only the reviewed writable workspace volume at /workspaces.");
      }
      if (label === "runnerContainer") {
        assertString(value.cgroupRelativePath, `${label} cgroupRelativePath`);
        for (const key of ["childUid", "childGid", "supervisorUid"]) {
          if (!Number.isInteger(value[key]) || Number(value[key]) <= 0) {
            throw new Error(`${label} ${key} must be a positive integer.`);
          }
        }
      }
    };
    assertRedactedContainer(values.runnerContainer, "runnerContainer");
    values.containers.forEach((container, index) => {
      assertRedactedContainer(container, `container ${index + 1}`);
    });
    if (values.auxiliaryContainers.length !== 2) {
      throw new Error("Reviewed inventory values auxiliaryContainers must contain exactly two entries.");
    }
    const auxiliaryIds = values.auxiliaryContainers
      .map((container) => isRecord(container) ? String(container.id ?? "").trim() : "")
      .sort();
    if (auxiliaryIds.some((id) => !id) || auxiliaryIds.join("\0")
      !== ["affiliate-agent-downstream-ready", "affiliate-replenishment-controller"].join("\0")) {
      throw new Error("Reviewed inventory values auxiliaryContainers must identify readiness and replenishment controller.");
    }
    values.auxiliaryContainers.forEach((container, index) => {
      assertRedactedContainer(container, `auxiliary container ${index + 1}`);
    });
    const processArtifact = {
      processInventoryArtifactId: processArtifactId,
      processInventoryHash: hashAffiliateCutoverProcessInventory(processRows),
      processInventoryCount: processRows.length,
      processInventory: processRows,
    };
    const inventory = { ...values, ...processArtifact };
    await writeFile(
      requiredPath("REVIEWED_PROCESS_OUTPUT"),
      `${JSON.stringify(processArtifact, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      requiredPath("CUTOVER_INVENTORY"),
      `${JSON.stringify(inventory, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  '
); then
  rm -f "$REVIEWED_PROCESS_OUTPUT" "$CUTOVER_INVENTORY"
  exit 1
fi
test -s "$REVIEWED_PROCESS_OUTPUT"
test -s "$CUTOVER_INVENTORY"
test ! -L "$REVIEWED_PROCESS_OUTPUT"
test ! -L "$CUTOVER_INVENTORY"
```

Bind the generated permission-flags artifact into the inventory before any
manifest or preflight hash is produced. Do not hand-copy these booleans:

```text
export CUTOVER_INVENTORY_WITH_PERMISSIONS=/path/to/affiliate-governed-private/cutover-inventory.with-permissions.json
test ! -e "$CUTOVER_INVENTORY_WITH_PERMISSIONS"
if ! (
  umask 077
  set -o noclobber
  jq --slurpfile permissionFlags "$DATABASE_PERMISSION_FLAGS_OUTPUT" \
    '.databasePermissions = $permissionFlags[0]' \
    /path/to/affiliate-governed-private/cutover-inventory.json \
    > "$CUTOVER_INVENTORY_WITH_PERMISSIONS"
); then
  rm -f "$CUTOVER_INVENTORY_WITH_PERMISSIONS"
  exit 1
fi
mv "$CUTOVER_INVENTORY_WITH_PERMISSIONS" \
  /path/to/affiliate-governed-private/cutover-inventory.json
jq -e --slurpfile permissionFlags "$DATABASE_PERMISSION_FLAGS_OUTPUT" \
  '.databasePermissions == $permissionFlags[0]' \
  /path/to/affiliate-governed-private/cutover-inventory.json
```

The construction command consumed only the independently reviewed process,
contract, host, database, and redacted container evidence. The resulting
inventory contains no secret values; the permission flags below replace only
the six derived booleans.

Before manifest generation, add the canonical process-inventory hash and count
to `cutover-inventory.json`:

```text
export PROCESS_INVENTORY_HASH="$(
  ./node_modules/.bin/tsx -e '
    import { readFileSync } from "node:fs";
    import { hashAffiliateCutoverProcessInventory } from "./src/server/affiliateImports/affiliateFleetCutover";
    const inventory = JSON.parse(readFileSync("/path/to/affiliate-governed-private/cutover-inventory.json", "utf8"));
    process.stdout.write(hashAffiliateCutoverProcessInventory(inventory.processInventory));
  '
)"
export PROCESS_INVENTORY_COUNT="$(jq -er '.processInventory | length' \
  /path/to/affiliate-governed-private/cutover-inventory.json)"
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/cutover-inventory.with-hash.json
jq --arg processHash "$PROCESS_INVENTORY_HASH" \
  --argjson processCount "$PROCESS_INVENTORY_COUNT" \
  '.processInventoryHash = $processHash | .processInventoryCount = $processCount' \
  /path/to/affiliate-governed-private/cutover-inventory.json \
  > /path/to/affiliate-governed-private/cutover-inventory.with-hash.json
mv /path/to/affiliate-governed-private/cutover-inventory.with-hash.json \
  /path/to/affiliate-governed-private/cutover-inventory.json
jq -e --arg processHash "$PROCESS_INVENTORY_HASH" \
  --argjson processCount "$PROCESS_INVENTORY_COUNT" \
  '.processInventoryHash == $processHash and .processInventoryCount == $processCount' \
  /path/to/affiliate-governed-private/cutover-inventory.json
```

The TypeScript helper calls the exact implementation hash. Do not hash only
the `processInventory` array. The final inventory must pass this check before
you run `affiliate:cutover:manifest-hash`.

```text
export REVIEWED_PROCESS_MANIFEST_REVIEWED_BY="$(
  jq -er '.reviewedBy' \
    /path/to/affiliate-governed-private/reviewed-legacy-process-manifest.json
)"
assert_non_placeholder_identity \
  "$REVIEWED_PROCESS_MANIFEST_REVIEWED_BY" \
  "REVIEWED_PROCESS_MANIFEST_REVIEWED_BY"
```
6. Generate the immutable manifest artifact:

```text
npm run --silent affiliate:cutover:manifest-hash -- \
  --manifest=/path/to/affiliate-governed-private/reviewed-legacy-process-manifest.json \
  --inventory=/path/to/affiliate-governed-private/cutover-inventory.json \
  --output=/path/to/affiliate-governed-private/reviewed-legacy-process-manifest.artifact.json
```
The generated manifest copies the independent inventory artifact ID and
records its canonical process-inventory hash and count. Preflight compares
all three values with the inventory file. A changed process, status, command,
or inventory order produces a different canonical hash.

7. Create a protected preflight report file:

```text
install -m 0600 /dev/null /path/to/affiliate-governed-private/preflight-report.json
```

8. Run preflight with the independent manifest and inventory files. Save JSON
   output only in the protected directory:


Refresh the stopped-unit evidence immediately before preflight. Do not reuse
the initial unit artifact:

```text
export LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT=/path/to/affiliate-governed-private/affiliate-legacy-unit-state.preflight.txt
test ! -e "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  systemctl show 'bracketiq-affiliate-*' \
    -p Id -p UnitFileState -p ActiveState -p SubState --no-pager \
    > "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"
); then
  rm -f "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"
  exit 1
fi
test -s "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"
awk -F= '
  /^UnitFileState=/ && $2 !~ /^(disabled|masked)$/ { exit 1 }
  /^ActiveState=/ && $2 != "inactive" { exit 1 }
' "$LEGACY_UNIT_STATE_PREFLIGHT_OUTPUT"
```

Copy these exact `UnitFileState` and `ActiveState` values into the fresh
`legacyServiceUnits` inventory fields. Recompute its canonical process hash and
count. Preflight must consume that refreshed inventory. A mismatch is a
blocking finding.
```text
npm run --silent affiliate:cutover:preflight -- \
  --inventory=/path/to/affiliate-governed-private/cutover-inventory.json \
  --manifest=/path/to/affiliate-governed-private/reviewed-legacy-process-manifest.artifact.json \
  > /path/to/affiliate-governed-private/preflight-report.json
```

The gateway must not already exist when this fresh startup artifact is generated.
Inspect only; do not create, start, recreate, or mutate the gateway in this
check:

```text
GATEWAY_EXISTING_IDS="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml ps -aq affiliate-gateway
)"
test -z "$GATEWAY_EXISTING_IDS"
```

Create a separate protected gateway-startup inventory and preflight artifact
before the gateway container exists. Use a unique UTC/PID suffix for every
startup attempt. For the first startup, copy the reviewed cutover inventory.
For a later refresh, rebuild only the gateway-startup inventory from fresh
evidence. Never modify the session-bound `cutover-inventory.json`:

```text
export GATEWAY_STARTUP_TAG="$(date -u '+%Y%m%dT%H%M%SZ')-$$"
export GATEWAY_STARTUP_INVENTORY="/path/to/affiliate-governed-private/gateway-startup-inventory.${GATEWAY_STARTUP_TAG}.json"
export GATEWAY_STARTUP_MANIFEST="/path/to/affiliate-governed-private/gateway-startup-process-manifest.${GATEWAY_STARTUP_TAG}.artifact.json"
export GATEWAY_STARTUP_PREFLIGHT="/path/to/affiliate-governed-private/gateway-startup-preflight.${GATEWAY_STARTUP_TAG}.json"
for startup_path in \
  "$GATEWAY_STARTUP_INVENTORY" \
  "$GATEWAY_STARTUP_MANIFEST" \
  "$GATEWAY_STARTUP_PREFLIGHT"; do
  test ! -e "$startup_path"
  test ! -L "$startup_path"
done
if ! (
  umask 077
  set -o noclobber
  cat /path/to/affiliate-governed-private/cutover-inventory.json \
    > "$GATEWAY_STARTUP_INVENTORY"
); then
  rm -f "$GATEWAY_STARTUP_INVENTORY"
  exit 1
fi
npm run --silent affiliate:cutover:manifest-hash -- \
  --manifest=/path/to/affiliate-governed-private/reviewed-legacy-process-manifest.json \
  --inventory="$GATEWAY_STARTUP_INVENTORY" \
  --output="$GATEWAY_STARTUP_MANIFEST"
test -s "$GATEWAY_STARTUP_MANIFEST"
npm run --silent affiliate:cutover:preflight -- \
  --inventory="$GATEWAY_STARTUP_INVENTORY" \
  --manifest="$GATEWAY_STARTUP_MANIFEST" \
  > "$GATEWAY_STARTUP_PREFLIGHT"
test -s "$GATEWAY_STARTUP_PREFLIGHT"
```

The manifest-hash command writes `$GATEWAY_STARTUP_MANIFEST` with an exclusive
create. Every startup attempt must use a new `$GATEWAY_STARTUP_TAG`. If any
startup artifact path exists, stop and use a new protected suffix in every
later reference and hash append.
Retain only redacted deployment evidence. Before retention, replace every
container environment value with `KEY=<redacted>`. After the second operator
completes the comparison and redaction, create the initial evidence hash.
Include only artifacts that exist before the durable session, rollback, dry-run,
and APPLY writes. Do not include canary, replay, retry, alert, cohort, or
shutdown artifacts in this initial hash:

```text
export DEPLOYMENT_EVIDENCE_HASH=/path/to/affiliate-governed-private/deployment-evidence.sha256
test ! -e "$DEPLOYMENT_EVIDENCE_HASH"
test ! -L "$DEPLOYMENT_EVIDENCE_HASH"
if ! (
  umask 077
  set -o noclobber
  cd /path/to/affiliate-governed-private
  shasum -a 256 \
    governed-compose.redacted.json \
    schema-migration-deploy.txt \
    schema-migration-status.txt \
    schema-migration-database-identity.tsv \
    active-supply-contract.json \
    reviewed-supply-contract-manifest.json \
    reviewed-supply-contract-impact-report.json \
    affiliate-operations-dashboard.json \
    reviewed-affiliate-workers.redacted.json \
    reviewed-affiliate-worker-images.json \
    reviewed-affiliate-worker-container-ids.txt \
    reviewed-agent-network.json \
    affiliate-legacy-units.txt \
    affiliate-legacy-unit-state.initial.txt \
    affiliate-legacy-unit-state.preflight.txt \
    affiliate-legacy-unit-details.txt \
    affiliate-database-identity.tsv \
    affiliate-database-url-identity.tsv \
    affiliate-database-role-provision.txt \
    affiliate-database-privileges.tsv \
    database-permission-flags.json \
    reviewed-legacy-process-manifest.json \
    reviewed-legacy-process-manifest.artifact.json \
    "$GATEWAY_STARTUP_MANIFEST" \
    cutover-inventory.json \
    "$GATEWAY_STARTUP_INVENTORY" \
    preflight-report.json \
    "$GATEWAY_STARTUP_PREFLIGHT" \
    > "$DEPLOYMENT_EVIDENCE_HASH"
); then
  printf '%s\n' "Refusing to overwrite an existing evidence hash." >&2
  exit 1
fi
chmod 0600 "$DEPLOYMENT_EVIDENCE_HASH"
test ! -L "$DEPLOYMENT_EVIDENCE_HASH"
test "$(stat -c '%a' "$DEPLOYMENT_EVIDENCE_HASH")" = "600"
```

This initial evidence hash is created exclusively before APPLY and is never
replaced or truncated. Append later redacted evidence only after the
corresponding ordered gate passes, using the same protected hash path.

The initial evidence hash file records only redacted or independently created
evidence. Do not hash or retain a raw capture. Remove every raw Compose and
Docker inspection artifact. In particular, remove the secret-bearing resolved
Compose file and prove that it is absent:
```text
rm -f /path/to/affiliate-governed-private/governed-compose.raw.json \
  /path/to/affiliate-governed-private/resolved-compose.raw.json \
  /path/to/affiliate-governed-private/resolved-compose.json \
  /path/to/affiliate-governed-private/reviewed-affiliate-containers.raw.json \
  /path/to/affiliate-governed-private/affiliate-container-candidates.json \
  /path/to/affiliate-governed-private/affiliate-container-candidate-ids.txt
test ! -e /path/to/affiliate-governed-private/governed-compose.raw.json
test ! -e /path/to/affiliate-governed-private/resolved-compose.raw.json
test ! -e /path/to/affiliate-governed-private/resolved-compose.json
test ! -e /path/to/affiliate-governed-private/reviewed-affiliate-containers.raw.json
test ! -e /path/to/affiliate-governed-private/affiliate-container-candidates.json
test ! -e /path/to/affiliate-governed-private/affiliate-container-candidate-ids.txt
```

Never paste raw captures into a shared log.

9. Review every blocking finding.
10. Before this durable session write, obtain separate current authorization
    for the authorized production database operation. Record the session:

```text
export CUTOVER_SESSION_OUTPUT=/path/to/affiliate-governed-private/cutover-session.json
assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
if test -e "$CUTOVER_SESSION_OUTPUT"; then
  test ! -L "$CUTOVER_SESSION_OUTPUT"
  jq -e '.mode == "CUTOVER_SESSION" and (.sessionId | type) == "string" and (.sessionHash | type) == "string"' \
    "$CUTOVER_SESSION_OUTPUT" >/dev/null
else
  assert_reviewed_database_identity
  if ! (
    umask 077
    set -o noclobber
    npm run --silent affiliate:cutover:session -- \
      --manifest=/path/to/affiliate-governed-private/reviewed-legacy-process-manifest.artifact.json \
      --inventory=/path/to/affiliate-governed-private/cutover-inventory.json \
      --preflight=/path/to/affiliate-governed-private/preflight-report.json \
      --rollout-cohort=DEFAULT \
      > "$CUTOVER_SESSION_OUTPUT"
  ); then
    rm -f "$CUTOVER_SESSION_OUTPUT"
    exit 1
  fi
fi
export CUTOVER_SESSION_ID="$(jq -er '.sessionId' "$CUTOVER_SESSION_OUTPUT")"
export CUTOVER_SESSION_HASH="$(jq -er '.sessionHash' "$CUTOVER_SESSION_OUTPUT")"
test -n "$CUTOVER_SESSION_ID"
printf '%s\n' "$CUTOVER_SESSION_ID" | grep -Eq '^[^[:space:]]+$'
printf '%s\n' "$CUTOVER_SESSION_HASH" | grep -Eq '^[a-fA-F0-9]{64}$'
export CUTOVER_SESSION_START="$(jq -er \
  '.recordedStartAt | select(type == "string" and length > 0)' \
  "$CUTOVER_SESSION_OUTPUT")"
shasum -a 256 "$CUTOVER_SESSION_OUTPUT" >> "$DEPLOYMENT_EVIDENCE_HASH"
```

The session ID and session hash are durable values. The session ID is the
trusted pre-write rollback boundary. Keep both values for APPLY. Keep the
session ID for both rollback drills. Replace
`REPLACE_WITH_AUTHORIZED_OPERATOR_ID` with the authorized operator identity
before running a command.

After the first governed receipt, lifecycle transition, demand or wave event,
or authoritative write, do not record a new cutover session. A new session
cannot restore binary rollback. Keep using the original durable session ID and
hash for evidence and forward-only containment.

11. Before this durable pre-write rollback-drill write, obtain separate
    current authorization. The command uses only the durable session ID and
    operator ID:

```text
assert_reviewed_database_identity
npm run --silent affiliate:cutover:rollback -- \
  --session-id="$CUTOVER_SESSION_ID" \
  --operator="$OPERATOR_ID" \
  > /path/to/affiliate-governed-private/rollback-drill-pre-write.json
jq -e '.decision.mode == "BINARY_ROLLBACK_ALLOWED" and (.record.reportHash | type) == "string" and (.record.reportHash | length) == 64' \
  /path/to/affiliate-governed-private/rollback-drill-pre-write.json
```

The pre-write drill must return `BINARY_ROLLBACK_ALLOWED`. Do not pass
`--since`, `--manifest`, `--evidence`, `--rollout-cohort`, or
`--runtime-inventory`. The rollback command loads these values from the
durable session.

Before this durable dry-run persistence write, obtain a separate current
authorization from the reconciliation reviewer. This authorization is not the
APPLY or gateway-reconciliation authorization:

```text
export DRY_RUN_PERSISTENCE_AUTHORIZATION_ID=REPLACE_WITH_CURRENT_DRY_RUN_AUTHORIZATION_ID
assert_non_placeholder_identity "$DRY_RUN_PERSISTENCE_AUTHORIZATION_ID" "DRY_RUN_PERSISTENCE_AUTHORIZATION_ID"
export DRY_RUN_PERSISTENCE_AUTHORIZATION_OUTPUT=/path/to/affiliate-governed-private/dry-run-persistence-authorization.txt
test ! -e "$DRY_RUN_PERSISTENCE_AUTHORIZATION_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  printf 'authorizationId=%s\n' "$DRY_RUN_PERSISTENCE_AUTHORIZATION_ID" \
    > "$DRY_RUN_PERSISTENCE_AUTHORIZATION_OUTPUT"
); then
  printf '%s\n' "Refusing to overwrite dry-run authorization evidence." >&2
  exit 1
fi
```

The dry-run command persists a `DRY_RUN` reconciliation record. Pass the
non-placeholder operator identity and verify the database identity immediately
before this write:

12. Create a protected dry-run report file:

```text
install -m 0600 /dev/null /path/to/affiliate-governed-private/reconciliation-dry-run.json
assert_reviewed_database_identity
npm run --silent affiliate:cutover:reconcile -- \
  --dry-run \
  --rollout-cohort=DEFAULT \
  --operator="$OPERATOR_ID" \
  > /path/to/affiliate-governed-private/reconciliation-dry-run.json
test -s /path/to/affiliate-governed-private/reconciliation-dry-run.json
```

14. Create a protected reviewed counts file from the dry-run report:

```text
install -m 0600 /dev/null /path/to/affiliate-governed-private/reviewed-counts.json
jq -e '.report.counts' /path/to/affiliate-governed-private/reconciliation-dry-run.json \
  > /path/to/affiliate-governed-private/reviewed-counts.json
jq -e 'type == "object"' \
  /path/to/affiliate-governed-private/reviewed-counts.json
export COUNTS_HASH="$(
  jq -er '.countsHash' \
    /path/to/affiliate-governed-private/reconciliation-dry-run.json
)"
export COMPUTED_COUNTS_HASH="$(
  jq -S -c -j . /path/to/affiliate-governed-private/reviewed-counts.json \
    | shasum -a 256 \
    | cut -d " " -f1
)"
test "$COUNTS_HASH" = "$COMPUTED_COUNTS_HASH"
jq -e --arg expected "$COUNTS_HASH" \
  '.countsHash == $expected and ($expected | test("^[a-f0-9]{64}$"))' \
  /path/to/affiliate-governed-private/reconciliation-dry-run.json
```

The CLI emits `countsHash` as the SHA-256 hash of the canonical counts
object. `jq -S -c` sorts the counts object keys and emits compact JSON. This
matches the CLI canonical hash for this numeric counts object. Stop if the
hash check fails. Do not APPLY.

15. Review the report hash, input hash, counts, count hash, targets, claims,
    and resolutions.
16. Before this APPLY database state change, obtain separate current
    authorization. Apply only that reviewed report with the operator ID:
```text
export LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT=/path/to/affiliate-governed-private/affiliate-legacy-unit-state.apply.wildcard.txt
export LEGACY_UNIT_STATE_APPLY_OUTPUT=/path/to/affiliate-governed-private/affiliate-legacy-unit-state.apply.txt
for unit_state_path in \
  "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT" \
  "$LEGACY_UNIT_STATE_APPLY_OUTPUT"; do
  test ! -e "$unit_state_path"
  test ! -L "$unit_state_path"
done
if ! (
  umask 077
  set -o noclobber
  systemctl show 'bracketiq-affiliate-*' \
    -p Id -p UnitFileState -p ActiveState -p SubState --no-pager \
    > "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT"
  while IFS= read -r unit_id; do
    test -n "$unit_id"
    systemctl show "$unit_id" \
      -p Id -p UnitFileState -p ActiveState -p SubState --no-pager
  done < <(jq -r '.legacyServiceUnits[] | .id' \
    /path/to/affiliate-governed-private/preflight-report.json) \
    > "$LEGACY_UNIT_STATE_APPLY_OUTPUT"
); then
  rm -f "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT" "$LEGACY_UNIT_STATE_APPLY_OUTPUT"
  exit 1
fi
test -s "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT"
test -s "$LEGACY_UNIT_STATE_APPLY_OUTPUT"
export APPLY_WILDCARD_UNIT_IDS="$(
  awk -F= '
    /^Id=/ { id=$2 }
    /^SubState=/ {
      if (id == "") exit 1
      print id
      id=""
    }
  ' "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT" | sort -u
)"
export APPLY_REVIEWED_UNIT_IDS="$(
  jq -r '.legacyServiceUnits[] | .id' \
    /path/to/affiliate-governed-private/preflight-report.json | sort -u
)"
test -n "$APPLY_WILDCARD_UNIT_IDS"
test "$APPLY_WILDCARD_UNIT_IDS" = "$APPLY_REVIEWED_UNIT_IDS"
test "$(printf '%s\n' "$APPLY_WILDCARD_UNIT_IDS" | wc -l | tr -d '[:space:]')" = \
  "$(printf '%s\n' "$APPLY_REVIEWED_UNIT_IDS" | wc -l | tr -d '[:space:]')"
for unit_state_path in \
  "$LEGACY_UNIT_STATE_APPLY_WILDCARD_OUTPUT" \
  "$LEGACY_UNIT_STATE_APPLY_OUTPUT"; do
  awk -F= '
    /^UnitFileState=/ && $2 !~ /^(disabled|masked)$/ { exit 1 }
    /^ActiveState=/ && $2 != "inactive" { exit 1 }
  ' "$unit_state_path"
done
test -s "$LEGACY_UNIT_STATE_APPLY_OUTPUT"
awk -F= '
  /^UnitFileState=/ && $2 !~ /^(disabled|masked)$/ { exit 1 }
  /^ActiveState=/ && $2 != "inactive" { exit 1 }
' "$LEGACY_UNIT_STATE_APPLY_OUTPUT"
if ! cmp -s \
  <(jq -r '.legacyServiceUnits[] | [.id, (.isEnabled | ascii_upcase), (.isActive | ascii_upcase)] | @tsv' \
    /path/to/affiliate-governed-private/preflight-report.json | sort) \
  <(awk -F= '
    /^Id=/ { id=$2 }
    /^UnitFileState=/ { enabled=$2 }
    /^ActiveState=/ { active=$2 }
    /^SubState=/ {
      if (id == "" || enabled == "" || active == "" || $2 == "") exit 1
      print id "\t" toupper(enabled) "\t" toupper(active)
      id=""; enabled=""; active=""
    }
  ' "$LEGACY_UNIT_STATE_APPLY_OUTPUT" | sort)
then
  printf '%s\n' "The stopped-unit state changed after preflight." >&2
  exit 1
fi
assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
assert_reviewed_database_identity
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/reconciliation-apply.json
export APPLY_NONCE="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
export APPLY_NONCE_FILE=/path/to/affiliate-governed-private/reconciliation-apply-nonce.txt
install -m 0600 /dev/null "$APPLY_NONCE_FILE"
printf '%s\n' "$APPLY_NONCE" > "$APPLY_NONCE_FILE"
test "$(cat "$APPLY_NONCE_FILE")" = "$APPLY_NONCE"

export REPORT_HASH="$(jq -er '.reportHash' \
  /path/to/affiliate-governed-private/reconciliation-dry-run.json)"
export INPUT_HASH="$(jq -er '.inputHash' \
  /path/to/affiliate-governed-private/reconciliation-dry-run.json)"
npm run --silent affiliate:cutover:reconcile -- --apply \
  --rollout-cohort=DEFAULT \
  --operator="$OPERATOR_ID" \
  --cutover-session-id="$CUTOVER_SESSION_ID" \
  --cutover-session-hash="$CUTOVER_SESSION_HASH" \
  --apply-nonce="$APPLY_NONCE" \
  --report-hash="$REPORT_HASH" \
  --input-hash="$INPUT_HASH" \
  --counts-json=/path/to/affiliate-governed-private/reviewed-counts.json \
  --counts-hash="$COUNTS_HASH" \
  --preflight=/path/to/affiliate-governed-private/preflight-report.json \
  > /path/to/affiliate-governed-private/reconciliation-apply.json
jq -e --arg expected "$COUNTS_HASH" \
  '.isApplied == true and .countsHash == $expected' \
  /path/to/affiliate-governed-private/reconciliation-apply.json
```

Immediately after a successful APPLY, perform the post-write rollback drill
before any gateway or worker startup. This is a durable rollback-decision write.
Use the same session ID and operator identity. Do not create a new session:

```text
assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
assert_reviewed_database_identity
npm run --silent affiliate:cutover:rollback -- \
  --session-id="$CUTOVER_SESSION_ID" \
  --operator="$OPERATOR_ID" \
  > /path/to/affiliate-governed-private/rollback-drill-post-write.json
jq -e '.decision.mode == "FORWARD_ONLY" and (.record.reportHash | type) == "string" and (.record.reportHash | length) == 64' \
  /path/to/affiliate-governed-private/rollback-drill-post-write.json
```

The post-write drill must return `FORWARD_ONLY`. A `BINARY_ROLLBACK_ALLOWED`
result after APPLY is a failed gate. Do not start the gateway, runner, or
supervisor while this drill is pending.

Before startup, read the durable `APPLY` run once and bind its ID to the
original cutover session. This read is required before the canary so the
canary evidence can carry both durable IDs:

```text
export APPLY_RUN_OUTPUT=/path/to/affiliate-governed-private/reconciliation-apply-run.redacted.json
test ! -e "$APPLY_RUN_OUTPUT"
assert_reviewed_database_identity
if ! (
  umask 077
  set -o noclobber
  psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 -Atc \
    -v session_id="$CUTOVER_SESSION_ID" \
    -v report_hash="$REPORT_HASH" \
    -v input_hash="$INPUT_HASH" \
    "SELECT json_build_object(
      'id', \"id\",
      'cutoverSessionId', \"reportJson\"->>'cutoverSessionId',
      'reportHash', \"reportHash\",
      'inputHash', \"inputHash\",
      'status', \"status\"
    )
    FROM \"AffiliateSupplyReconciliationRuns\"
    WHERE \"mode\" = 'APPLY'
      AND \"status\" = 'APPLIED'
      AND \"reportHash\" = :'report_hash'
      AND \"inputHash\" = :'input_hash'
      AND \"reportJson\"->>'cutoverSessionId' = :'session_id'
    ORDER BY \"createdAt\" DESC
    LIMIT 1;" > "$APPLY_RUN_OUTPUT"
); then
  rm -f "$APPLY_RUN_OUTPUT"
  exit 1
fi
jq -e --arg session "$CUTOVER_SESSION_ID" --arg report "$REPORT_HASH" \
  --arg input "$INPUT_HASH" '
  (.id | type == "string" and length > 0)
  and .cutoverSessionId == $session
  and .reportHash == $report
  and .inputHash == $input
  and .status == "APPLIED"
' "$APPLY_RUN_OUTPUT"
export REPLAY_RUN_ID="$(jq -er '.id' "$APPLY_RUN_OUTPUT")"
```

Do not continue if this query returns no row or a different session. Keep the
file redacted and immutable. The later replay readback must return the same
`REPLAY_RUN_ID`; it must not replace this value.

The reconciliation command does not start or stop a runtime. It uses one
serializable database transaction for an apply. A changed snapshot, an active
legacy claim, a changed session, or a changed session hash blocks the apply.

Verify retained evidence:

```text
jq -e '[.runnerContainer.environment[], .containers[].environment[]] | all(test("^[^=]+=<redacted>$"))' \
  /path/to/affiliate-governed-private/cutover-inventory.json
test ! -e /path/to/affiliate-governed-private/resolved-compose.json
test ! -e /path/to/affiliate-governed-private/governed-compose.raw.json
test ! -e /path/to/affiliate-governed-private/resolved-compose.raw.json
test ! -e /path/to/affiliate-governed-private/reviewed-affiliate-containers.raw.json
```

## Staged startup

Run these actions in order. Do not use one `docker compose up` command for the
whole project. The gateway starts with admission closed. Coverage Planner is
admitted only after the downstream readiness gate succeeds and an authorized
operator opens admission.

1. Before this production state change, obtain separate current authorization.
   Generate and validate the unique gateway-startup preflight before creating
   the gateway container. Create it with the exact reviewed preflight JSON,
   bind the created container to that value, hash the redacted binding, and
   start only the exact reviewed gateway ID.

Before the gateway start, verify and bind the separate gateway-startup
preflight report in the same shell:

```text
test -s "$GATEWAY_STARTUP_PREFLIGHT"
export AFFILIATE_AGENT_STARTUP_PREFLIGHT_PATH="$GATEWAY_STARTUP_PREFLIGHT"
cd "$OPERATOR_CLI_DIR"
./node_modules/.bin/tsx -e '
  import { readFileSync } from "node:fs";
  import {
    isAffiliateCutoverPreflightFresh,
    isAffiliateCutoverPreflightReportIntact,
  } from "./src/server/affiliateImports/affiliateFleetCutover";
  const preflightPath = process.env.AFFILIATE_AGENT_STARTUP_PREFLIGHT_PATH;
  if (!preflightPath) throw new Error("The startup preflight path is missing.");
  const report = JSON.parse(readFileSync(preflightPath, "utf8"));
  if (
    !isAffiliateCutoverPreflightReportIntact(report)
    || !isAffiliateCutoverPreflightFresh(report, new Date())
  ) {
    throw new Error("The startup preflight report is invalid, has a bad hash, or is older than 15 minutes.");
  }
'
export AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON="$(
  jq -c . "$GATEWAY_STARTUP_PREFLIGHT"
)"
test -n "$AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON"
test "$AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON" = "$(
  jq -c . "$GATEWAY_STARTUP_PREFLIGHT"
)"
cd /path/to/repository/apps/site/deploy/affiliate-governed
```

The gateway reads compact JSON from `AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON`.
It does not read a file path. The shell export overrides the placeholder in
`deployment.env`. Keep this export in the same shell as the Compose command.
Do not enable shell tracing. The session-bound `preflight-report.json` is not
overwritten. If the gateway-startup report is older than 15 minutes before
startup, do not rerun only the preflight command. Recapture process, unit,
claim, permission, and gateway-set/worker/auxiliary container evidence into
uniquely named supplemental files. Before gateway creation, the gateway set is
the explicitly empty set described below. Have the second operator rebuild a
fresh strict inventory from those captures using only the accepted schema
fields; the supplemental captures must not be embedded as extra inventory
keys. Never modify the session-bound `cutover-inventory.json`. Set the startup
inventory `now` to the
current UTC capture time and recompute the process hash and count. If process
facts changed, update the reviewed manifest source and generate a separate
startup manifest artifact from the startup inventory. Rerun startup preflight
with the matching startup manifest, the evidence hash block, and this
verification and export:

For this pre-create refresh, the gateway set is intentionally empty because
the gateway container does not exist yet. Inspect three disjoint non-gateway
sets: exactly one `affiliate-agent-runner`, exactly five supervisors
(`mapping-producer-1`, `mapping-producer-2`, `supply-reviewer-1`,
`supply-reviewer-2`, and `coverage-planner`), and exactly two
auxiliary/control-plane services (`affiliate-agent-downstream-ready` and
`affiliate-replenishment-controller`). The seven reviewed worker rows are not
a source for any other set; the runner and both auxiliary rows are captured
from their own inspections, then projected into their dedicated inventory
fields. The absent gateway is represented as a STOPPED control-plane process,
not as a container row.

This refresh must rebuild the complete inventory. Repeat the independent
worker/network, model-service, normalized bearer-source, all-volume-consumer,
and production-database network captures above with fresh uniquely named
paths. Rebuild the reviewed values and the complete inventory through the
same capture-binding builder. Preserve all structured mounts and network
attachments. Do not copy OMP fields from the previous inventory or advance
only its timestamp.

Use `GATEWAY_REFRESH_COMPLETE_INVENTORY` as that builder's output. Use
`GATEWAY_REFRESH_PROCESS_INVENTORY_OUTPUT` as its reviewed process source.
Set its process artifact ID to `GATEWAY_REFRESH_PROCESS_INVENTORY_ARTIFACT_ID`.
Its process hash and count must match the independently captured refresh
values; changing only the artifact ID is not sufficient.
The final step below accepts only this complete new output and fresh capture
files. It does not merge selected fields into the old inventory.


```text
export GATEWAY_REFRESH_TAG="$(date -u '+%Y%m%dT%H%M%SZ')-$$"
export GATEWAY_REFRESH_CAPTURE_STARTED_AT="$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')"
export GATEWAY_REFRESH_COMPLETE_INVENTORY="/path/to/affiliate-governed-private/complete-cutover-inventory.${GATEWAY_REFRESH_TAG}.json"
export GATEWAY_REFRESH_INVENTORY="/path/to/affiliate-governed-private/gateway-startup-inventory.${GATEWAY_REFRESH_TAG}.json"
export GATEWAY_REFRESH_MANIFEST="/path/to/affiliate-governed-private/gateway-startup-process-manifest.${GATEWAY_REFRESH_TAG}.artifact.json"
export GATEWAY_REFRESH_PREFLIGHT="/path/to/affiliate-governed-private/gateway-startup-preflight.${GATEWAY_REFRESH_TAG}.json"
export GATEWAY_REFRESH_PROCESS_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-process.${GATEWAY_REFRESH_TAG}.tsv"
export GATEWAY_REFRESH_PROCESS_INVENTORY_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-process-inventory.${GATEWAY_REFRESH_TAG}.json"
export GATEWAY_REFRESH_UNIT_VALUES_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-unit-values.${GATEWAY_REFRESH_TAG}.json"
export GATEWAY_REFRESH_CLAIMS_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-claims.${GATEWAY_REFRESH_TAG}.json"
export GATEWAY_REFRESH_GATEWAY_CLAIMS_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-gateway-claims.${GATEWAY_REFRESH_TAG}.json"
export GATEWAY_REFRESH_LEGACY_CLAIMS_SOURCE="/path/to/affiliate-governed-private/gateway-refresh-legacy-claims.${GATEWAY_REFRESH_TAG}.reviewed.json"
export GATEWAY_REFRESH_PERMISSION_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-permissions.${GATEWAY_REFRESH_TAG}.tsv"
export GATEWAY_REFRESH_UNITS_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-units.${GATEWAY_REFRESH_TAG}.txt"
export GATEWAY_REFRESH_PERMISSION_FLAGS_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-permission-flags.${GATEWAY_REFRESH_TAG}.json"
export GATEWAY_REFRESH_GATEWAY_CONTAINER_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-gateway-container.${GATEWAY_REFRESH_TAG}.redacted.json"
export GATEWAY_REFRESH_RUNNER_CONTAINER_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-runner-container.${GATEWAY_REFRESH_TAG}.redacted.json"
export GATEWAY_REFRESH_SUPERVISOR_CONTAINER_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-supervisor-containers.${GATEWAY_REFRESH_TAG}.redacted.json"
export GATEWAY_REFRESH_AUXILIARY_CONTAINER_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-auxiliary-containers.${GATEWAY_REFRESH_TAG}.redacted.json"
export GATEWAY_REFRESH_CONTAINERS_OUTPUT="/path/to/affiliate-governed-private/gateway-refresh-containers.${GATEWAY_REFRESH_TAG}.redacted.json"
for startup_path in \
  "$GATEWAY_REFRESH_INVENTORY" \
  "$GATEWAY_REFRESH_MANIFEST" \
  "$GATEWAY_REFRESH_PREFLIGHT" \
  "$GATEWAY_REFRESH_PROCESS_OUTPUT" \
  "$GATEWAY_REFRESH_CLAIMS_OUTPUT" \
  "$GATEWAY_REFRESH_GATEWAY_CLAIMS_OUTPUT" \
  "$GATEWAY_REFRESH_PERMISSION_FLAGS_OUTPUT" \
  "$GATEWAY_REFRESH_UNITS_OUTPUT" \
  "$GATEWAY_REFRESH_PROCESS_INVENTORY_OUTPUT" \
  "$GATEWAY_REFRESH_UNIT_VALUES_OUTPUT" \
  "$GATEWAY_REFRESH_GATEWAY_CONTAINER_OUTPUT" \
  "$GATEWAY_REFRESH_RUNNER_CONTAINER_OUTPUT" \
  "$GATEWAY_REFRESH_SUPERVISOR_CONTAINER_OUTPUT" \
  "$GATEWAY_REFRESH_AUXILIARY_CONTAINER_OUTPUT" \
  "$GATEWAY_REFRESH_CONTAINERS_OUTPUT"; do
  test ! -e "$startup_path"
  test ! -L "$startup_path"
done
test -s "$GATEWAY_STARTUP_INVENTORY"
ps -axo pid=,ppid=,user=,state=,comm= > "$GATEWAY_REFRESH_PROCESS_OUTPUT"
test -s "$GATEWAY_REFRESH_PROCESS_OUTPUT"
systemctl show 'bracketiq-affiliate-*' \
  -p Id -p UnitFileState -p ActiveState -p SubState --no-pager \
  > "$GATEWAY_REFRESH_UNITS_OUTPUT"
test -s "$GATEWAY_REFRESH_UNITS_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  awk -F= '
    function emit() {
      if (id != "") printf "%s\t%s\t%s\n", id, unit_state, active_state
    }
    /^Id=/ { emit(); id = $2; unit_state = ""; active_state = ""; next }
    /^UnitFileState=/ { unit_state = $2; next }
    /^ActiveState=/ { active_state = $2; next }
    END { emit() }
  ' "$GATEWAY_REFRESH_UNITS_OUTPUT" |
    jq -Rn '
      [inputs | split("\t") | select(length == 3) |
        {id: .[0], isEnabled: .[1], isActive: .[2]}]
    ' > "$GATEWAY_REFRESH_UNIT_VALUES_OUTPUT"
); then
  rm -f "$GATEWAY_REFRESH_UNIT_VALUES_OUTPUT"
  exit 1
fi
jq -e --slurpfile startup "$GATEWAY_STARTUP_PREFLIGHT" '
  (map(.id) | sort) ==
    ($startup[0].reviewedSystemdUnits | map(.unitId) | sort)
  and all(.[]; .isEnabled | test("^(disabled|masked)$"))
  and all(.[]; .isActive == "inactive")
' "$GATEWAY_REFRESH_UNIT_VALUES_OUTPUT"
# A second operator must write the independently reviewed process inventory
# source from the new process capture before this copy step. The source must
# contain every reviewed legacy and governed row and must not be a symlink.
export GATEWAY_REFRESH_PROCESS_INVENTORY_SOURCE="/path/to/affiliate-governed-private/gateway-refresh-process-inventory.${GATEWAY_REFRESH_TAG}.reviewed.json"
test -e "$GATEWAY_REFRESH_PROCESS_INVENTORY_SOURCE"
test ! -L "$GATEWAY_REFRESH_PROCESS_INVENTORY_SOURCE"
test -s "$GATEWAY_REFRESH_PROCESS_INVENTORY_SOURCE"
if ! (
  umask 077
  set -o noclobber
  cat "$GATEWAY_REFRESH_PROCESS_INVENTORY_SOURCE" > "$GATEWAY_REFRESH_PROCESS_INVENTORY_OUTPUT"
); then
  rm -f "$GATEWAY_REFRESH_PROCESS_INVENTORY_OUTPUT"
  exit 1
fi
test -s "$GATEWAY_REFRESH_PROCESS_INVENTORY_OUTPUT"
# Validate only after the reviewed handoff has created the fresh output.
jq -e '
  type == "array"
  and length > 0
  and ([.[] | select(.kind == "GOVERNED")] | length == 5)
  and all(.[]; (keys - [
    "id", "kind", "role", "workerId", "processClass", "command", "status"
  ] | length == 0)
    and (.id | type == "string" and length > 0)
    and (.kind == "LEGACY" or .kind == "GOVERNED")
    and (.command | type == "string" and length > 0)
    and (.status | type == "string" and length > 0)
    and (.kind != "GOVERNED" or (
      (.id | test("^[a-fA-F0-9]{64}$"))
      and (.role | type == "string" and length > 0)
      and (.workerId | type == "string" and length > 0)
    )))
' "$GATEWAY_REFRESH_PROCESS_INVENTORY_OUTPUT"
export GATEWAY_REFRESH_PROCESS_INVENTORY_ARTIFACT_ID="gateway-refresh-process-inventory-${GATEWAY_REFRESH_TAG}"
export GATEWAY_REFRESH_PROCESS_INVENTORY_COUNT="$(
  jq -er 'length' "$GATEWAY_REFRESH_PROCESS_INVENTORY_OUTPUT"
)"
export GATEWAY_REFRESH_PROCESS_INVENTORY_HASH="$(
  cd "$OPERATOR_CLI_DIR"
  ./node_modules/.bin/tsx -e '
    import { readFileSync } from "node:fs";
    import { hashAffiliateCutoverProcessInventory } from "./src/server/affiliateImports/affiliateFleetCutover";
    const path = process.env.GATEWAY_REFRESH_PROCESS_INVENTORY_OUTPUT;
    if (!path) throw new Error("The fresh process inventory path is missing.");
    const rows = JSON.parse(readFileSync(path, "utf8"));
    process.stdout.write(hashAffiliateCutoverProcessInventory(rows));
  '
)"
assert_reviewed_database_identity
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 -Atc "
  SELECT COALESCE(json_agg(json_build_object(
    'kind', 'GATEWAY_CLAIM',
    'id', c.\"id\",
    'supplySourceId', j.\"supplySourceId\",
    'subjectId', j.\"subjectJson\"->>'coverageCellId',
    'role', c.\"role\",
    'workerId', c.\"workerId\",
    'claimGeneration', c.\"claimGeneration\",
    'status', c.\"status\",
    'leaseExpiresAt', c.\"leaseExpiresAt\",
    'endedAt', c.\"endedAt\"
  ) ORDER BY c.\"id\"), '[]'::json)
  FROM \"AffiliateAgentGatewayClaims\" c
  JOIN \"AffiliateAgentGatewayJobs\" j ON j.\"id\" = c.\"jobId\";" \
  > "$GATEWAY_REFRESH_GATEWAY_CLAIMS_OUTPUT"
test -e "$GATEWAY_REFRESH_LEGACY_CLAIMS_SOURCE"
test ! -L "$GATEWAY_REFRESH_LEGACY_CLAIMS_SOURCE"
test -s "$GATEWAY_REFRESH_LEGACY_CLAIMS_SOURCE"
jq -e '
  type == "array"
  and all(.[] as $claim;
    ($claim.kind | type == "string")
    and ([
      "INTAKE",
      "CAPTURE_PAGE",
      "CAPTURE_RUN",
      "CAPTURE_ARTIFACT",
      "DISCOVERY_RESULT",
      "SOURCE",
      "MAPPING",
      "SCRAPE_RUN",
      "MAPPING_JOB",
      "APPROVAL_JOB",
      "CANDIDATE",
      "PUBLIC_TARGET",
      "ORGANIZATION",
      "EVENT",
      "TEAM",
      "FACILITY",
      "DISCOVERY_RUN",
      "INTAKE_RUN",
      "COVERAGE_JOB"
    ] | index($claim.kind)) != null
    and ($claim.id | type == "string" and length > 0)
  )
' "$GATEWAY_REFRESH_LEGACY_CLAIMS_SOURCE"
if ! (
  umask 077
  set -o noclobber
  jq -n \
    --slurpfile gateway "$GATEWAY_REFRESH_GATEWAY_CLAIMS_OUTPUT" \
    --slurpfile legacy "$GATEWAY_REFRESH_LEGACY_CLAIMS_SOURCE" '
    ($legacy[0] + $gateway[0]) as $rows
    | if (($rows | map(.id) | length) != ($rows | map(.id) | unique | length))
      then error("fresh claim capture contains duplicate ids")
      else $rows
      end
  ' > "$GATEWAY_REFRESH_CLAIMS_OUTPUT"
); then
  rm -f "$GATEWAY_REFRESH_CLAIMS_OUTPUT"
  exit 1
fi
jq -e 'type == "array" and all(.[]; .id | type == "string" and length > 0)' \
  "$GATEWAY_REFRESH_CLAIMS_OUTPUT"
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  --tuples-only --no-align --field-separator="$(printf '\t')" <<'SQL' \
  > "$GATEWAY_REFRESH_PERMISSION_OUTPUT"
WITH principals(role_name) AS (
  VALUES
    ('bracketiq_affiliate_gateway'::name),
    ('bracketiq_affiliate_lifecycle'::name),
    ('bracketiq_affiliate_agent'::name),
    ('bracketiq_app'::name)
),
affiliate_tables(table_name) AS (
  VALUES
    ('AffiliateScrapeSources'::name),
    ('AffiliateScrapeMappings'::name),
    ('AffiliateScrapeRuns'::name),
    ('AffiliateSourceIntakes'::name),
    ('AffiliateSourceIntakePages'::name),
    ('AffiliateSourceIntakeRuns'::name),
    ('AffiliateSourceIntakeArtifacts'::name),
    ('AffiliateSourceDiscoveryCampaigns'::name),
    ('AffiliateAgentGatewayJobs'::name),
    ('AffiliateAgentGatewayClaims'::name),
    ('AffiliateAgentGatewayArtifacts'::name),
    ('AffiliateAgentGatewayOperationReceipts'::name),
    ('AffiliateAgentGatewayEvents'::name),
    ('AffiliateAgentWorkerHealth'::name),
    ('AffiliateOperationalAlerts'::name),
    ('AffiliateOperationalAlertDeliveries'::name),
    ('AffiliateCoverageAgentJobs'::name),
    ('AffiliateCoverageCities'::name),
    ('AffiliateCoverageCells'::name),
    ('AffiliateCoverageCellAssessments'::name),
    ('AffiliateSourceDiscoveryQueryExecutions'::name),
    ('AffiliateSourceDiscoveryRuns'::name),
    ('AffiliateSourceDiscoveryResults'::name),
    ('AffiliateSourceDomainPolicies'::name),
    ('AffiliateSourceMappingJobs'::name),
    ('AffiliateApprovalJobs'::name),
    ('AffiliateImportCandidates'::name),
    ('AffiliateSupplySources'::name),
    ('AffiliateSupplyContractManifests'::name),
    ('AffiliateSupplyLifecycleTransitions'::name),
    ('AffiliateSupplyReconciliationRuns'::name),
    ('AffiliateSupplyTargets'::name),
    ('AffiliateReplenishmentDemands'::name),
    ('AffiliateReplenishmentWaves'::name),
    ('File'::name)
),
requested_table_privileges(privilege_name) AS (
  VALUES ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text)
),
public_sequences AS (
  SELECT namespace.nspname::text AS schema_name, sequence.relname::text AS sequence_name
  FROM pg_class AS sequence
  JOIN pg_namespace AS namespace ON namespace.oid = sequence.relnamespace
  WHERE namespace.nspname = 'public' AND sequence.relkind = 'S'
)
SELECT 'pg_has_role'::text,
  member.role_name::text,
  target.role_name::text,
  'MEMBER'::text,
  pg_has_role(member.role_name, target.role_name, 'MEMBER')::text
FROM principals AS member
CROSS JOIN principals AS target
WHERE member.role_name <> target.role_name
UNION ALL
SELECT 'pg_auth_members'::text,
  member.rolname::text,
  granted.rolname::text,
  'MEMBER'::text,
  'true'::text
FROM pg_auth_members AS membership
JOIN pg_roles AS member ON member.oid = membership.member
JOIN pg_roles AS granted ON granted.oid = membership.roleid
WHERE member.rolname IN (SELECT role_name FROM principals)
   OR granted.rolname IN (SELECT role_name FROM principals)
UNION ALL
SELECT 'database'::text,
  principal.role_name::text,
  current_database()::text,
  'CONNECT'::text,
  has_database_privilege(principal.role_name, current_database(), 'CONNECT')::text
FROM principals AS principal
UNION ALL
SELECT 'schema'::text,
  principal.role_name::text,
  'public'::text,
  privilege_name,
  has_schema_privilege(principal.role_name, 'public', privilege_name)::text
FROM principals AS principal
CROSS JOIN (VALUES ('USAGE'::text), ('CREATE'::text)) AS schema_privileges(privilege_name)
UNION ALL
SELECT 'table'::text,
  principal.role_name::text,
  format('%I.%I', 'public', table_name),
  requested.privilege_name,
  has_table_privilege(
    principal.role_name,
    format('%I.%I', 'public', table_name),
    requested.privilege_name
  )::text
FROM principals AS principal
CROSS JOIN affiliate_tables
CROSS JOIN requested_table_privileges AS requested
UNION ALL
SELECT 'sequence'::text,
  principal.role_name::text,
  format('%I.%I', sequences.schema_name, sequences.sequence_name),
  requested.privilege_name,
  has_sequence_privilege(
    principal.role_name,
    format('%I.%I', sequences.schema_name, sequences.sequence_name),
    requested.privilege_name
  )::text
FROM principals AS principal
CROSS JOIN public_sequences AS sequences
CROSS JOIN (VALUES
  ('USAGE'::text),
  ('SELECT'::text),
  ('UPDATE'::text)
) AS requested(privilege_name)
ORDER BY 1, 2, 3, 4;
SQL
test -s "$GATEWAY_REFRESH_PERMISSION_OUTPUT"
export GATEWAY_REFRESH_GATEWAY_CONTAINER_IDS=""
test -z "$GATEWAY_REFRESH_GATEWAY_CONTAINER_IDS"
GATEWAY_REFRESH_RUNNER_CONTAINER_ID="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml ps -aq affiliate-agent-runner
)"
GATEWAY_REFRESH_SUPERVISOR_CONTAINER_IDS="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml --profile coverage-planner ps -aq \
    mapping-producer-1 mapping-producer-2 supply-reviewer-1 supply-reviewer-2 \
    coverage-planner
)"
GATEWAY_REFRESH_AUXILIARY_CONTAINER_IDS="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml --profile coverage-planner ps -aq \
    affiliate-agent-downstream-ready affiliate-replenishment-controller
)"
gateway_refresh_assert_ids() {
  if test "$2" = "0"; then
    test -z "$1"
    return
  fi
  printf '%s\n' "$1" | awk -v expected="$2" '
    NF != 1 || length($1) != 64 || $1 !~ /^[a-fA-F0-9]+$/ || seen[$1]++ {
      exit 1
    }
    { count++ }
    END { exit count == expected ? 0 : 1 }
  '
}
gateway_refresh_assert_ids "$GATEWAY_REFRESH_GATEWAY_CONTAINER_IDS" 0
gateway_refresh_assert_ids "$GATEWAY_REFRESH_RUNNER_CONTAINER_ID" 1
gateway_refresh_assert_ids "$GATEWAY_REFRESH_SUPERVISOR_CONTAINER_IDS" 5
gateway_refresh_assert_ids "$GATEWAY_REFRESH_AUXILIARY_CONTAINER_IDS" 2
if test "$(printf '%s\n' \
  "$GATEWAY_REFRESH_RUNNER_CONTAINER_ID" \
  "$GATEWAY_REFRESH_SUPERVISOR_CONTAINER_IDS" \
  "$GATEWAY_REFRESH_AUXILIARY_CONTAINER_IDS" |
  sort -u | wc -l | tr -d '[:space:]')" != "8"; then
  printf '%s\n' "runner, supervisor, and auxiliary container identities must be distinct." >&2
  exit 1
fi
if ! (
  umask 077
  set -o noclobber
  printf '%s\n' '[]' > "$GATEWAY_REFRESH_GATEWAY_CONTAINER_OUTPUT"
); then
  rm -f "$GATEWAY_REFRESH_GATEWAY_CONTAINER_OUTPUT"
  exit 1
fi
gateway_refresh_inspect_set() {
  local image_ids image_evidence inspect_status
  image_ids="$(
    docker inspect "$@" |
      jq -r '.[].Image' | sort -u | paste -sd' '
  )"
  printf '%s\n' "$image_ids" | awk '
    {
      for (field_index = 1; field_index <= NF; field_index += 1) {
        if ($field_index !~ /^sha256:[a-fA-F0-9]{64}$/) exit 1
        count += 1
      }
    }
    END { exit count > 0 ? 0 : 1 }
  '
  image_evidence="$(mktemp)"
  chmod 0600 "$image_evidence"
  if ! docker image inspect $image_ids |
    jq -e 'map({
      imageId: .Id,
      repoDigests: (.RepoDigests // [])
    }) | if all(.[]; (.imageId | test("^sha256:[a-fA-F0-9]{64}$"))
      and (.repoDigests | type == "array")) then . else error("invalid image evidence") end' \
    > "$image_evidence"; then
    rm -f "$image_evidence"
    return 1
  fi
  if docker inspect "$@" |
    jq --slurpfile image_evidence "$image_evidence" \
      --arg reviewed_network "$(
        sed -n 's/^AFFILIATE_AGENT_GATEWAY_NETWORK=//p' \
          /path/to/affiliate-governed-private/deployment.env
      )" '($image_evidence[0] | map({key: .imageId, value: .repoDigests}) | from_entries) as $repoDigestsByImageId
      | map({
        id: .Id,
        name: (.Name | ltrimstr("/")),
        service: .Config.Labels["com.docker.compose.service"],
        status: (.State.Status // "unknown"),
        image: .Config.Image,
        imageId: .Image,
        repoDigests: ($repoDigestsByImageId[.Image] // []),
        hasReadonlyRootFilesystem: .HostConfig.ReadonlyRootfs,
        privileged: (.HostConfig.Privileged // false),
        user: (.Config.User // null),
        cgroupNamespace: (.HostConfig.CgroupnsMode // null),
        tmpfs: (.HostConfig.Tmpfs // {}),
        mounts: [
          .Mounts[]?
          | {
              source: (
                if ((.Type // "") | ascii_downcase) == "volume"
                then (.Name // "")
                else (.Source // "")
                end
              ),
              type: ((.Type // "") | ascii_downcase),
              target: (.Destination // ""),
              readOnly: ((.RW // true) | not)
            }
        ],
        environment: (
          . as $container
          | ($container.Config.Labels["com.docker.compose.service"] // "") as $service
          | [$container.Config.Env[]?
            | split("=")[0] as $key
            | if $service == "affiliate-agent-runner"
              and ($key == "AFFILIATE_AGENT_MODEL_GATEWAY_ADDRESS"
                or $key == "AFFILIATE_AGENT_OMP_MODEL")
              then .
              else ($key + "=<redacted>")
              end]
        ),
        childUid: ([.Config.Env[]?
          | select(startswith("AFFILIATE_AGENT_RUNNER_CHILD_UID="))
          | split("=")[1] | tonumber] | .[0] // null),
        childGid: ([.Config.Env[]?
          | select(startswith("AFFILIATE_AGENT_RUNNER_CHILD_GID="))
          | split("=")[1] | tonumber] | .[0] // null),
        supervisorUid: ([.Config.Env[]?
          | select(startswith("AFFILIATE_AGENT_UID="))
          | split("=")[1] | tonumber] | .[0] // null),
        cgroupRelativePath: ([.Config.Env[]?
          | select(startswith("AFFILIATE_AGENT_RUNNER_CGROUP_RELATIVE_PATH="))
          | split("=")[1]] | .[0] // null),
        ipcMode: (.HostConfig.IpcMode // null),
        networks: ([.NetworkSettings.Networks // {} | keys[]]),
        networkAttachments: ([
          .NetworkSettings.Networks // {}
          | to_entries[]
          | {name: .key, id: .value.NetworkID}
        ]),
        isNetworkInternal: (([.NetworkSettings.Networks // {} | keys[]] | sort)
          == [$reviewed_network]),
        capDrop: (.HostConfig.CapDrop // []),
        capAdd: (.HostConfig.CapAdd // []),
        groupAdd: (.HostConfig.GroupAdd // []),
        securityOptions: (.HostConfig.SecurityOpt // [])
        } | if .service == "affiliate-agent-runner"
            then .
            else del(.childUid, .childGid, .supervisorUid, .cgroupRelativePath)
            end)'
    then
    inspect_status=0
  else
    inspect_status=$?
  fi
  rm -f "$image_evidence"
  return "$inspect_status"
}
gateway_refresh_inspect_set "$GATEWAY_REFRESH_RUNNER_CONTAINER_ID" \
  > "$GATEWAY_REFRESH_RUNNER_CONTAINER_OUTPUT"
gateway_refresh_inspect_set $GATEWAY_REFRESH_SUPERVISOR_CONTAINER_IDS \
  > "$GATEWAY_REFRESH_SUPERVISOR_CONTAINER_OUTPUT"
gateway_refresh_inspect_set $GATEWAY_REFRESH_AUXILIARY_CONTAINER_IDS \
  > "$GATEWAY_REFRESH_AUXILIARY_CONTAINER_OUTPUT"
unset -f gateway_refresh_inspect_set gateway_refresh_assert_ids
test -s "$GATEWAY_REFRESH_GATEWAY_CONTAINER_OUTPUT"
jq -e 'type == "array" and length == 0' \
  "$GATEWAY_REFRESH_GATEWAY_CONTAINER_OUTPUT"
jq -e '
  length == 1
  and .[0].service == "affiliate-agent-runner"
  and (.[0].status | type == "string" and length > 0)
' "$GATEWAY_REFRESH_RUNNER_CONTAINER_OUTPUT"
jq -e '
  length == 5
  and ([.[].service] | sort) == [
    "coverage-planner",
    "mapping-producer-1",
    "mapping-producer-2",
    "supply-reviewer-1",
    "supply-reviewer-2"
  ]
  and all(.[].status; type == "string" and length > 0)
' "$GATEWAY_REFRESH_SUPERVISOR_CONTAINER_OUTPUT"
jq -e '
  length == 2
  and ([.[].service] | sort) == [
    "affiliate-agent-downstream-ready",
    "affiliate-replenishment-controller"
  ]
  and all(.[].status; type == "string" and length > 0)
' "$GATEWAY_REFRESH_AUXILIARY_CONTAINER_OUTPUT"
jq -e \
  --arg expected "$REVIEWED_AGENT_IMAGE" \
  --arg expectedId "$REVIEWED_AGENT_IMAGE_ID" \
  --arg expectedRepoDigest "$REVIEWED_AGENT_REPO_DIGEST" '
  length == 1
  and all(.[];
    .service == "affiliate-agent-runner"
    and .image == $expected
    and .imageId == $expectedId
    and (.repoDigests | type == "array")
    and (.repoDigests | index($expectedRepoDigest) != null)
    and .hasReadonlyRootFilesystem == true
    and .privileged == false
  )
' "$GATEWAY_REFRESH_RUNNER_CONTAINER_OUTPUT"
export GATEWAY_REFRESH_WORKSPACE_VOLUME="$(
  sed -n 's/^AFFILIATE_GOVERNED_WORKSPACE_VOLUME=//p' \
    /path/to/affiliate-governed-private/deployment.env
)"
test -n "$GATEWAY_REFRESH_WORKSPACE_VOLUME"
jq -e --arg workspace_volume "$GATEWAY_REFRESH_WORKSPACE_VOLUME" '
  length == 1
  and (.[0].environment
    | index("AFFILIATE_AGENT_MODEL_GATEWAY_ADDRESS=http://affiliate-model-gateway:4000") != null)
  and (.[0].environment
    | index("AFFILIATE_AGENT_OMP_MODEL=openai-codex/gpt-5.6-luna") != null)
  and (.[0].environment
    | index("AFFILIATE_AGENT_MODEL_GATEWAY_TOKEN=<redacted>") != null)
  and (.[0].mounts | length == 1)
  and ((.[0].mounts[0] | keys | sort)
    == ["readOnly", "source", "target", "type"])
  and .[0].mounts[0].source == $workspace_volume
  and .[0].mounts[0].type == "volume"
  and .[0].mounts[0].target == "/workspaces"
  and .[0].mounts[0].readOnly == false
' "$GATEWAY_REFRESH_RUNNER_CONTAINER_OUTPUT"
jq -e -s '
  all(add[]; all(.environment[]?;
    (startswith("AFFILIATE_AGENT_MODEL_GATEWAY_TOKEN=") | not)
    and (startswith("AFFILIATE_AGENT_MODEL_AUTH_BROKER_TOKEN=") | not)))
' "$GATEWAY_REFRESH_SUPERVISOR_CONTAINER_OUTPUT" \
  "$GATEWAY_REFRESH_AUXILIARY_CONTAINER_OUTPUT"
jq -e \
  --arg agent "$REVIEWED_AGENT_IMAGE" \
  --arg agentId "$REVIEWED_AGENT_IMAGE_ID" \
  --arg agentDigest "$REVIEWED_AGENT_REPO_DIGEST" \
  --arg gateway "$REVIEWED_GATEWAY_IMAGE" \
  --arg gatewayId "$REVIEWED_GATEWAY_IMAGE_ID" \
  --arg gatewayDigest "$REVIEWED_GATEWAY_REPO_DIGEST" '
  length == 2
  and all(.[];
    if .service == "affiliate-replenishment-controller" then
      .image == $gateway
      and .imageId == $gatewayId
      and (.repoDigests | type == "array")
      and (.repoDigests | index($gatewayDigest) != null)
    else
      .image == $agent
      and .imageId == $agentId
      and (.repoDigests | type == "array")
      and (.repoDigests | index($agentDigest) != null)
    end
    and .hasReadonlyRootFilesystem == true
    and .privileged == false
  )
' "$GATEWAY_REFRESH_AUXILIARY_CONTAINER_OUTPUT"
jq -e \
  --arg expected "$REVIEWED_AGENT_IMAGE" \
  --arg expectedId "$REVIEWED_AGENT_IMAGE_ID" \
  --arg expectedRepoDigest "$REVIEWED_AGENT_REPO_DIGEST" '
  length == 5
  and all(.[];
    .image == $expected
    and .imageId == $expectedId
    and (.repoDigests | type == "array")
    and (.repoDigests | index($expectedRepoDigest) != null)
    and .hasReadonlyRootFilesystem == true
    and .privileged == false
    and (.capDrop | type) == "array"
    and (.capAdd | type) == "array"
    and (.groupAdd | type) == "array"
  )
' "$GATEWAY_REFRESH_SUPERVISOR_CONTAINER_OUTPUT"
jq -e '
def exact_tmpfs($path; $options):
  ((.tmpfs[$path] // "")
    | split(",")
    | map((gsub("^\\s+|\\s+$"; "") | ascii_downcase | sub("^mode=0+"; "mode=")))
    | sort) == ($options | sort);
.[] | .service == "affiliate-agent-runner"
| .ipcMode == "none"
  and exact_tmpfs("/tmp"; ["mode=755", "nodev", "noexec", "nosuid", "rw", "size=256m", "uid=0", "gid=0"])
  and exact_tmpfs("/dev/shm"; ["mode=755", "nodev", "noexec", "nosuid", "rw", "size=64m", "uid=0", "gid=0"])
' "$GATEWAY_REFRESH_RUNNER_CONTAINER_OUTPUT"
jq 'map({
  id, name, user, privileged, hasReadonlyRootFilesystem,
  cgroupNamespace, ipcMode, tmpfs, isNetworkInternal,
  environment, networks, capDrop, capAdd, groupAdd, securityOptions
} | with_entries(select(.value != null)))' \
  "$GATEWAY_REFRESH_SUPERVISOR_CONTAINER_OUTPUT" \
  > "$GATEWAY_REFRESH_CONTAINERS_OUTPUT"
test -s "$GATEWAY_REFRESH_CONTAINERS_OUTPUT"
export GATEWAY_REFRESH_AGENT_CONNECT_ALLOWED="$(
  awk -F '\t' '
    $1 == "database" &&
      $2 == "bracketiq_affiliate_agent" &&
      $4 == "CONNECT" &&
      $5 == "true" { agent_database_connect = 1 }
    $1 == "schema" &&
      $2 == "bracketiq_affiliate_agent" &&
      $3 == "public" &&
      $4 == "USAGE" &&
      $5 == "true" { agent_schema_usage = 1 }
    END {
      print (agent_database_connect && agent_schema_usage ? "true" : "false")
    }
  ' "$GATEWAY_REFRESH_PERMISSION_OUTPUT"
)"
export GATEWAY_REFRESH_AGENT_WRITE_ALLOWED="$(
  awk -F '\t' '
    $2 == "bracketiq_affiliate_agent" &&
      ($1 == "table" || $1 == "sequence") &&
      $4 ~ /^(INSERT|UPDATE|DELETE)$/ &&
      $5 == "true" { found = 1 }
    END { print (found ? "true" : "false") }
  ' "$GATEWAY_REFRESH_PERMISSION_OUTPUT"
)"
export GATEWAY_REFRESH_GATEWAY_WRITE_ALLOWED="$(
  awk -F '\t' '
    BEGIN {
      required["public.\"AffiliateAgentGatewayJobs\"|SELECT"] = 1
      required["public.\"AffiliateAgentGatewayJobs\"|INSERT"] = 1
      required["public.\"AffiliateAgentGatewayJobs\"|UPDATE"] = 1
      required["public.\"AffiliateAgentGatewayClaims\"|SELECT"] = 1
      required["public.\"AffiliateAgentGatewayClaims\"|INSERT"] = 1
      required["public.\"AffiliateAgentGatewayClaims\"|UPDATE"] = 1
      required["public.\"AffiliateAgentGatewayOperationReceipts\"|SELECT"] = 1
      required["public.\"AffiliateAgentGatewayOperationReceipts\"|INSERT"] = 1
      required["public.\"AffiliateAgentGatewayOperationReceipts\"|UPDATE"] = 1
      required["public.\"AffiliateAgentGatewayArtifacts\"|SELECT"] = 1
      required["public.\"AffiliateAgentGatewayArtifacts\"|INSERT"] = 1
      required["public.\"AffiliateAgentGatewayEvents\"|SELECT"] = 1
      required["public.\"AffiliateAgentGatewayEvents\"|INSERT"] = 1
      required["public.\"AffiliateOperationalAlerts\"|SELECT"] = 1
      required["public.\"AffiliateOperationalAlerts\"|INSERT"] = 1
      required["public.\"AffiliateOperationalAlertDeliveries\"|SELECT"] = 1
      required["public.\"AffiliateOperationalAlertDeliveries\"|INSERT"] = 1
    }
    $1 == "pg_has_role" &&
      $2 == "bracketiq_app" &&
      $3 == "bracketiq_affiliate_gateway" &&
      $4 == "MEMBER" &&
      $5 == "true" { gateway_member = 1 }
    $1 == "database" &&
      $2 == "bracketiq_app" &&
      $4 == "CONNECT" &&
      $5 == "true" { gateway_database_connect = 1 }
    $1 == "schema" &&
      $2 == "bracketiq_app" &&
      $3 == "public" &&
      $4 == "USAGE" &&
      $5 == "true" { gateway_schema_usage = 1 }
    $1 == "table" && $2 == "bracketiq_app" {
      matrix_key = $3 "|" $4
      if (matrix_key in required) {
        matrix_rows += 1
        if ($5 == "true") {
          matrix_true += 1
          seen[matrix_key] += 1
        } else {
          matrix_failed = 1
        }
      }
    }
    END {
      for (matrix_key in required) {
        if (seen[matrix_key] != 1) matrix_failed = 1
      }
      print ((gateway_member && gateway_database_connect && gateway_schema_usage &&
        matrix_rows == 17 && matrix_true == 17 && !matrix_failed) ? "true" : "false")
    }
  ' "$GATEWAY_REFRESH_PERMISSION_OUTPUT"
)"
if jq -e '
  [.[].environment[]?]
  | any(. == "DO_SPACES_KEY=<redacted>" or . == "DO_SPACES_SECRET=<redacted>")
' "$GATEWAY_REFRESH_CONTAINERS_OUTPUT" >/dev/null; then
  export GATEWAY_REFRESH_OBJECT_STORAGE_ALLOWED=true
else
  export GATEWAY_REFRESH_OBJECT_STORAGE_ALLOWED=false
fi
if jq -e '
  [.[].environment[]?]
  | any(. == "SCRAPINGDOG_API_KEY=<redacted>" or . == "FIRECRAWL_API_KEY=<redacted>")
' "$GATEWAY_REFRESH_CONTAINERS_OUTPUT" >/dev/null; then
  export GATEWAY_REFRESH_PROVIDER_ALLOWED=true
else
  export GATEWAY_REFRESH_PROVIDER_ALLOWED=false
fi
if ! (
  umask 077
  set -o noclobber
  jq -n \
    --argjson agentConnect "$GATEWAY_REFRESH_AGENT_CONNECT_ALLOWED" \
    --argjson agentWrite "$GATEWAY_REFRESH_AGENT_WRITE_ALLOWED" \
    --argjson objectStorage "$GATEWAY_REFRESH_OBJECT_STORAGE_ALLOWED" \
    --argjson provider "$GATEWAY_REFRESH_PROVIDER_ALLOWED" \
    --argjson gatewayWrite "$GATEWAY_REFRESH_GATEWAY_WRITE_ALLOWED" \
    '{
      isAgentAllowedToConnectProductionDatabase: $agentConnect,
      isAgentAllowedToWriteProductionDatabase: $agentWrite,
      isAgentAllowedToReadObjectStorage: $objectStorage,
      isAgentAllowedToWriteObjectStorage: $objectStorage,
      isAgentAllowedToCallProviders: $provider,
      isGatewayAllowedToWriteProductionDatabase: $gatewayWrite
    }' > "$GATEWAY_REFRESH_PERMISSION_FLAGS_OUTPUT"
); then
  rm -f "$GATEWAY_REFRESH_PERMISSION_FLAGS_OUTPUT"
  exit 1
fi
jq -e '
  (keys | sort) == [
    "isAgentAllowedToCallProviders",
    "isAgentAllowedToConnectProductionDatabase",
    "isAgentAllowedToReadObjectStorage",
    "isAgentAllowedToWriteObjectStorage",
    "isAgentAllowedToWriteProductionDatabase",
    "isGatewayAllowedToWriteProductionDatabase"
  ]
  and all([
    .isAgentAllowedToConnectProductionDatabase,
    .isAgentAllowedToWriteProductionDatabase,
    .isAgentAllowedToReadObjectStorage,
    .isAgentAllowedToWriteObjectStorage,
    .isAgentAllowedToCallProviders,
    .isGatewayAllowedToWriteProductionDatabase
  ][]; type == "boolean")
' "$GATEWAY_REFRESH_PERMISSION_FLAGS_OUTPUT"
# First repeat the complete capture and capture-binding builder above using
# fresh paths. Its output is GATEWAY_REFRESH_COMPLETE_INVENTORY.
node -e '
  const { readFileSync, lstatSync, copyFileSync, constants } = require("node:fs");
  const required = name => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}.`);
    return value;
  };
  const startedAt = Date.parse(required("GATEWAY_REFRESH_CAPTURE_STARTED_AT"));
  if (!Number.isFinite(startedAt)) throw new Error("Invalid refresh start time.");
  for (const name of [
    "REVIEWED_WORKER_CAPTURE",
    "REVIEWED_WORKER_NETWORK_EVIDENCE",
    "REVIEWED_REPLENISHMENT_CAPTURE",
    "OMP_MODEL_SERVICE_CAPTURE",
    "OMP_BEARER_SOURCE_CAPTURE",
    "OMP_BROKER_VOLUME_CAPTURE",
    "OMP_PRODUCTION_DATABASE_NETWORK_EVIDENCE",
    "REVIEWED_VALUES_SOURCE",
    "GATEWAY_REFRESH_PROCESS_INVENTORY_OUTPUT",
    "GATEWAY_REFRESH_COMPLETE_INVENTORY",
  ]) {
    const stat = lstatSync(required(name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.mtimeMs < startedAt) {
      throw new Error(`${name} is not a fresh independent capture.`);
    }
  }
  const source = required("GATEWAY_REFRESH_COMPLETE_INVENTORY");
  const inventory = JSON.parse(readFileSync(source, "utf8"));
  const capturedAt = Date.parse(inventory.now);
  if (!Number.isFinite(capturedAt) || capturedAt < startedAt || capturedAt > Date.now()
    || inventory.processInventoryArtifactId !== required("GATEWAY_REFRESH_PROCESS_INVENTORY_ARTIFACT_ID")
    || inventory.processInventoryHash !== required("GATEWAY_REFRESH_PROCESS_INVENTORY_HASH")
    || inventory.processInventoryCount !== Number(required("GATEWAY_REFRESH_PROCESS_INVENTORY_COUNT"))) {
    throw new Error("The complete refresh inventory has stale or mismatched provenance.");
  }
  copyFileSync(source, required("GATEWAY_REFRESH_INVENTORY"), constants.COPYFILE_EXCL);
'
npm run --silent affiliate:cutover:manifest-hash -- \
  --manifest=/path/to/affiliate-governed-private/reviewed-legacy-process-manifest.json \
  --inventory="$GATEWAY_REFRESH_INVENTORY" \
  --output="$GATEWAY_REFRESH_MANIFEST"
test -s "$GATEWAY_REFRESH_MANIFEST"
npm run --silent affiliate:cutover:preflight -- \
  --inventory="$GATEWAY_REFRESH_INVENTORY" \
  --manifest="$GATEWAY_REFRESH_MANIFEST" \
  > "$GATEWAY_REFRESH_PREFLIGHT"
test -s "$GATEWAY_REFRESH_PREFLIGHT"
export GATEWAY_STARTUP_TAG="$GATEWAY_REFRESH_TAG"
export GATEWAY_STARTUP_INVENTORY="$GATEWAY_REFRESH_INVENTORY"
export GATEWAY_STARTUP_MANIFEST="$GATEWAY_REFRESH_MANIFEST"
export GATEWAY_STARTUP_PREFLIGHT="$GATEWAY_REFRESH_PREFLIGHT"
(
  cd /path/to/affiliate-governed-private
  shasum -a 256 \
    "$GATEWAY_REFRESH_PROCESS_OUTPUT" \
    "$GATEWAY_REFRESH_PROCESS_INVENTORY_OUTPUT" \
    "$GATEWAY_REFRESH_UNIT_VALUES_OUTPUT" \
    "$GATEWAY_REFRESH_CLAIMS_OUTPUT" \
    "$GATEWAY_REFRESH_PERMISSION_OUTPUT" \
    "$GATEWAY_REFRESH_PERMISSION_FLAGS_OUTPUT" \
    "$GATEWAY_REFRESH_UNITS_OUTPUT" \
    "$GATEWAY_REFRESH_GATEWAY_CONTAINER_OUTPUT" \
    "$GATEWAY_REFRESH_RUNNER_CONTAINER_OUTPUT" \
    "$GATEWAY_REFRESH_SUPERVISOR_CONTAINER_OUTPUT" \
    "$GATEWAY_REFRESH_AUXILIARY_CONTAINER_OUTPUT" \
    "$GATEWAY_REFRESH_CONTAINERS_OUTPUT" \
    "$GATEWAY_STARTUP_INVENTORY" \
    "$GATEWAY_STARTUP_MANIFEST" \
    "$GATEWAY_STARTUP_PREFLIGHT"
) >> "$DEPLOYMENT_EVIDENCE_HASH"

```
If the session-bound report expires before APPLY, stop. Do not rerun preflight
against the unchanged cutover inventory. Do not overwrite the old inventory,
manifest, preflight report, session, or drill output. Recapture fresh process,
claim, permission, and container evidence into uniquely named cutover files,
set their `now` field to a current, non-future ISO timestamp, and recompute the
process hash and count. Generate a matching manifest artifact and preflight
report with unique names. Record a new durable session with those paths. Then
rerun the pre-write rollback drill and dry run before APPLY. Preserve the old
session and all of its evidence. Use the new session ID and session hash for
APPLY. A running gateway does not age out its startup report. Repeat this step
after a stop or recreation.

```text
: "${AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON:?Set the exact generated gateway preflight report JSON}"
test "$AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON" != "REPLACE_WITH_GATEWAY_PREFLIGHT_REPORT_JSON"
test "$AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON" != "REVIEWED_CUTOVER_PREFLIGHT_REPORT_JSON"

GATEWAY_EXISTING_CONTAINER_IDS="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml ps -aq affiliate-gateway
)"
test -z "$GATEWAY_EXISTING_CONTAINER_IDS"
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml create --no-recreate affiliate-gateway
GATEWAY_CONTAINER_ID="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml ps -aq affiliate-gateway
)"
test -n "$GATEWAY_CONTAINER_ID"
printf '%s\n' "$GATEWAY_CONTAINER_ID" | awk '
  NF != 1 || length($1) != 64 || $1 !~ /^[a-fA-F0-9]+$/ { exit 1 }
  { count++ }
  END { exit count == 1 ? 0 : 1 }
'
REPLENISHMENT_CONTAINER_ID="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml --profile coverage-planner ps -aq affiliate-replenishment-controller
)"
printf '%s\n' "$REPLENISHMENT_CONTAINER_ID" | awk '
  NF != 1 || length($1) != 64 || $1 !~ /^[a-fA-F0-9]+$/ { exit 1 }
  { count++ }
  END { exit count == 1 ? 0 : 1 }
'
grep -Fx "$REPLENISHMENT_CONTAINER_ID" \
  "$REVIEWED_REPLENISHMENT_CONTAINER_ID_FILE"
export REVIEWED_CONTAINER_IDS_FILE=/path/to/affiliate-governed-private/reviewed-affiliate-container-ids.txt
test ! -e "$REVIEWED_CONTAINER_IDS_FILE"
if ! (
  umask 077
  set -o noclobber
  cat /path/to/affiliate-governed-private/reviewed-affiliate-worker-container-ids.txt
  printf '%s\n' "$GATEWAY_CONTAINER_ID" "$REPLENISHMENT_CONTAINER_ID"
) > "$REVIEWED_CONTAINER_IDS_FILE"; then
  rm -f "$REVIEWED_CONTAINER_IDS_FILE"
  exit 1
fi
REVIEWED_CONTAINER_IDS="$(paste -sd' ' "$REVIEWED_CONTAINER_IDS_FILE")"
test -n "$REVIEWED_CONTAINER_IDS"
printf '%s\n' "$REVIEWED_CONTAINER_IDS" | awk '
  {
    for (field_index = 1; field_index <= NF; field_index += 1) {
      if (length($field_index) != 64 || $field_index !~ /^[a-fA-F0-9]+$/) exit 1
      count += 1
    }
  }
  END { exit count == 9 ? 0 : 1 }
'
test "$(sort -u "$REVIEWED_CONTAINER_IDS_FILE" | wc -l | tr -d '[:space:]')" = "9"
export REVIEWED_CONTAINER_IMAGE_EVIDENCE=/path/to/affiliate-governed-private/reviewed-affiliate-container-images.json
test ! -e "$REVIEWED_CONTAINER_IMAGE_EVIDENCE"
test ! -L "$REVIEWED_CONTAINER_IMAGE_EVIDENCE"
REVIEWED_CONTAINER_IMAGE_IDS="$(
  docker inspect $REVIEWED_CONTAINER_IDS |
    jq -r '.[].Image' | sort -u | paste -sd' '
)"
printf '%s\n' "$REVIEWED_CONTAINER_IMAGE_IDS" | awk '
  {
    for (field_index = 1; field_index <= NF; field_index += 1) {
      if (length($field_index) != 71 || $field_index !~ /^sha256:[a-fA-F0-9]{64}$/) exit 1
      count += 1
    }
  }
  END { exit count == 2 ? 0 : 1 }
'
docker image inspect $REVIEWED_CONTAINER_IMAGE_IDS |
  jq -e 'map({
    imageId: .Id,
    repoDigests: (.RepoDigests // [])
  }) | if length == 2
    and all(.[]; (.imageId | test("^sha256:[a-fA-F0-9]{64}$"))
      and (.repoDigests | type == "array"))
    then .
    else error("invalid image evidence")
    end' \
  > "$REVIEWED_CONTAINER_IMAGE_EVIDENCE"
test -s "$REVIEWED_CONTAINER_IMAGE_EVIDENCE"
export REVIEWED_CONTAINERS_OUTPUT=/path/to/affiliate-governed-private/reviewed-affiliate-containers.redacted.json
test ! -e "$REVIEWED_CONTAINERS_OUTPUT"
test ! -L "$REVIEWED_CONTAINERS_OUTPUT"
install -m 0600 /dev/null "$REVIEWED_CONTAINERS_OUTPUT"
docker inspect $REVIEWED_CONTAINER_IDS |
jq --slurpfile image_evidence "$REVIEWED_CONTAINER_IMAGE_EVIDENCE" \
  --arg reviewed_network "$(
  sed -n 's/^AFFILIATE_AGENT_GATEWAY_NETWORK=//p' \
    /path/to/affiliate-governed-private/deployment.env
)" '($image_evidence[0] | map({key: .imageId, value: .repoDigests}) | from_entries) as $repoDigestsByImageId
| map({
  id: .Id,
  name: (.Name | ltrimstr("/")),
  service: .Config.Labels["com.docker.compose.service"],
  status: (.State.Status // "unknown"),
  image: .Config.Image,
  imageId: .Image,
  networks: ([.NetworkSettings.Networks // {} | keys[]]),
  networkAttachments: ([
    .NetworkSettings.Networks // {}
    | to_entries[]
    | {name: .key, id: .value.NetworkID}
  ]),
  isNetworkInternal: (([.NetworkSettings.Networks // {} | keys[]] | sort)
    == [$reviewed_network]),
  ipcMode: (.HostConfig.IpcMode // "private"),
  tmpfs: (.HostConfig.Tmpfs // {}),
  privileged: (.HostConfig.Privileged // false),
  user: (.Config.User // null),
  restartPolicy: (.HostConfig.RestartPolicy.Name // "no"),
  environment: ([.Config.Env[]? | (split("=")[0] + "=<redacted>")]),
  childUid: ([.Config.Env[]?
    | select(startswith("AFFILIATE_AGENT_RUNNER_CHILD_UID="))
    | split("=")[1] | tonumber] | .[0] // null),
  childGid: ([.Config.Env[]?
    | select(startswith("AFFILIATE_AGENT_RUNNER_CHILD_GID="))
    | split("=")[1] | tonumber] | .[0] // null),
  supervisorUid: ([.Config.Env[]?
    | select(startswith("AFFILIATE_AGENT_UID="))
    | split("=")[1] | tonumber] | .[0] // null),
  cgroupRelativePath: ([.Config.Env[]?
    | select(startswith("AFFILIATE_AGENT_RUNNER_CGROUP_RELATIVE_PATH="))
    | split("=")[1]] | .[0] // null),
  capDrop: (.HostConfig.CapDrop // []),
  capAdd: (.HostConfig.CapAdd // []),
  groupAdd: (.HostConfig.GroupAdd // []),
  securityOptions: (.HostConfig.SecurityOpt // [])
} | if .service == "affiliate-agent-runner"
    then .
    else del(.childUid, .childGid, .supervisorUid, .cgroupRelativePath)
    end)' \
  > "$REVIEWED_CONTAINERS_OUTPUT"
test -s "$REVIEWED_CONTAINERS_OUTPUT"
jq -e '
  length == 9
  and ([.[].service] | sort) == [
    "affiliate-agent-downstream-ready",
    "affiliate-agent-runner",
    "affiliate-gateway",
    "affiliate-replenishment-controller",
    "coverage-planner",
    "mapping-producer-1",
    "mapping-producer-2",
    "supply-reviewer-1",
    "supply-reviewer-2"
  ]
  and all(.[]; (.environment | type) == "array")
  and all(.[];
    .privileged == false
    and (.capDrop | type) == "array"
    and (.capAdd | type) == "array"
    and (.groupAdd | type) == "array")
  and ([.[]?.environment[]?] | all(test("^[^=]+=<redacted>$")))
' "$REVIEWED_CONTAINERS_OUTPUT"
jq -e \
  --arg agent "$REVIEWED_AGENT_IMAGE" \
  --arg agentId "$REVIEWED_AGENT_IMAGE_ID" \
  --arg agentDigest "$REVIEWED_AGENT_REPO_DIGEST" \
  --arg gateway "$REVIEWED_GATEWAY_IMAGE" \
  --arg gatewayId "$REVIEWED_GATEWAY_IMAGE_ID" \
  --arg gatewayDigest "$REVIEWED_GATEWAY_REPO_DIGEST" \
  --arg gatewayUser "$REVIEWED_GATEWAY_USER" '
  all(.[];
    if .service == "affiliate-gateway"
      or .service == "affiliate-replenishment-controller" then
      .image == $gateway
      and .imageId == $gatewayId
      and .user == $gatewayUser
      and (.repoDigests | type == "array")
      and (.repoDigests | index($gatewayDigest) != null)
      and .hasReadonlyRootFilesystem == true
    else
      .image == $agent
      and .imageId == $agentId
      and (.repoDigests | type == "array")
      and (.repoDigests | index($agentDigest) != null)
      and .hasReadonlyRootFilesystem == true
    end
  )
' "$REVIEWED_CONTAINERS_OUTPUT"
jq -e --arg id "$REPLENISHMENT_CONTAINER_ID" \
  --arg expectedUser "$REVIEWED_GATEWAY_USER" \
  --arg expectedNetwork "$AFFILIATE_AGENT_GATEWAY_NETWORK" '
  .[]
  | select(.id == $id)
  | .service == "affiliate-replenishment-controller"
    and .user == $expectedUser
    and .restartPolicy == "no"
    and .networks == [$expectedNetwork]
    and (.environment
      | index("AFFILIATE_AGENT_GATEWAY_ADDRESS=<redacted>") != null)
    and (.environment
      | index("AFFILIATE_AGENT_GATEWAY_PATH_PREFIX=<redacted>") != null)
    and (.environment
      | index("AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=<redacted>") != null)
    and (.environment
      | index("AFFILIATE_REPLENISHMENT_INTERVAL_SECONDS=<redacted>") != null)
    and ((.command | join("\n"))
      | contains("npm run affiliate:replenishment:controller"))
    and (all(.environment[];
      contains("AFFILIATE_GATEWAY_OPERATOR_TOKEN") | not))
    and (all(.environment[];
      contains("DATABASE_URL") | not))
    and (all(.environment[];
      contains("PRODUCTION_BACKEND") | not))
    and (all(.environment[];
      contains("AFFILIATE_SCRAPINGDOG_API_KEY") | not))
    and (all(.environment[];
      contains("AFFILIATE_FIRECRAWL_API_KEY") | not))
    and (all(.environment[];
      contains("AFFILIATE_AGENT_CODEX_") | not))
' "$REVIEWED_CONTAINERS_OUTPUT"
grep -Fx "$GATEWAY_CONTAINER_ID" \
  /path/to/affiliate-governed-private/reviewed-affiliate-container-ids.txt
grep -Fx "$REPLENISHMENT_CONTAINER_ID" \
  /path/to/affiliate-governed-private/reviewed-affiliate-container-ids.txt
export GATEWAY_PREFLIGHT_REPORT_HASH="$(
  printf '%s' "$AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON" \
    | shasum -a 256 | cut -d ' ' -f1
)"
export GATEWAY_STARTUP_CONTAINER_OUTPUT="/path/to/affiliate-governed-private/gateway-startup-container.${GATEWAY_STARTUP_TAG}.redacted.json"
test ! -e "$GATEWAY_STARTUP_CONTAINER_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  docker inspect "$GATEWAY_CONTAINER_ID" |
    jq -e --slurpfile image_evidence "$REVIEWED_CONTAINER_IMAGE_EVIDENCE" \
      --arg id "$GATEWAY_CONTAINER_ID" \
      --arg expected "$AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON" \
      --arg image "$REVIEWED_GATEWAY_IMAGE" \
      --arg image_id "$REVIEWED_GATEWAY_IMAGE_ID" \
      --arg image_digest "$REVIEWED_GATEWAY_REPO_DIGEST" \
      --arg expected_user "$REVIEWED_GATEWAY_USER" \
      --arg preflight_hash "$GATEWAY_PREFLIGHT_REPORT_HASH" '
      ($image_evidence[0][] | select(.imageId == $image_id)) as $image_object
      | map(select(
        .Id == $id
        and ((.Config.Env // [])
          | index("AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON=" + $expected) != null)
        and .Config.Image == $image
        and .Image == $image_id
        and ($image_object.imageId == .Image)
        and (($image_object.repoDigests | type) == "array")
        and (($image_object.repoDigests | index($image_digest)) != null)
        and .Config.User == $expected_user
        and .HostConfig.ReadonlyRootfs == true
      ))
      | if length != 1 then empty else .[0] | {
          id: .Id,
          name: (.Name | ltrimstr("/")),
          service: .Config.Labels["com.docker.compose.service"],
          image: .Config.Image,
          imageId: .Image,
          repoDigests: $image_object.repoDigests,
          hasReadonlyRootFilesystem: .HostConfig.ReadonlyRootfs,
          preflightReportHash: $preflight_hash
        } end
    ' > "$GATEWAY_STARTUP_CONTAINER_OUTPUT"
); then
  rm -f "$GATEWAY_STARTUP_CONTAINER_OUTPUT"
  exit 1
fi
(
  cd /path/to/affiliate-governed-private
  shasum -a 256 \
    "$REVIEWED_CONTAINER_IDS_FILE" \
    "$REVIEWED_REPLENISHMENT_CONTAINER_ID_FILE" \
    "$REPLENISHMENT_IMAGE_EVIDENCE" \
    "$REVIEWED_CONTAINERS_OUTPUT" \
    "$REVIEWED_CONTAINER_IMAGE_EVIDENCE" \
    "$GATEWAY_STARTUP_PREFLIGHT" \
    "$GATEWAY_STARTUP_CONTAINER_OUTPUT"
) >> "$DEPLOYMENT_EVIDENCE_HASH"
docker start "$GATEWAY_CONTAINER_ID"
```

Do not use `docker compose up` or `--force-recreate` here. The gateway must
start from the exact reviewed container. If the reviewed startup preflight is
not already present in the container environment, stop and obtain a new
reviewed container-generation authorization; do not recreate or mutate this
container in place.

Wait for the gateway healthcheck to report healthy. The gateway has no host
port. Run the authenticated admission calls from inside the gateway
container. The default route prefix is `/v1/affiliate-agent`:

```text
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/admission", {
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "closed" || body.open !== false
      || Object.keys(body).sort().join(",") !== "open,status") throw new Error(JSON.stringify(body));
  console.log(JSON.stringify(body));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'
```

The response must contain `"status":"closed"` and `"open":false`. This
authenticated `GET /v1/affiliate-agent/admission` call confirms that no claim
can start before the rest of the fleet is ready.
```text
capture_container_database_identity "$GATEWAY_CONTAINER_ID" "$GATEWAY_DATABASE_IDENTITY_OUTPUT"
shasum -a 256 "$GATEWAY_DATABASE_IDENTITY_OUTPUT" \
  >> /path/to/affiliate-governed-private/deployment-evidence.sha256
```

2. Before this production state change, obtain separate current authorization.
   Verify the reviewed Codex ChatGPT auth seed and model settings. Do not put
   the auth contents in deployment evidence:

```text
CODEX_AUTH_FILE="$(sed -n 's/^AFFILIATE_AGENT_CODEX_AUTH_FILE=//p' "$DEPLOYMENT_ENV")"
test -n "$CODEX_AUTH_FILE"
test -f "$CODEX_AUTH_FILE"
test "$(stat -c '%a' "$CODEX_AUTH_FILE")" = "600"
jq -e '
  .auth_mode == "chatgpt"
  and (.access_token | type == "string" and length > 0)
  and (.refresh_token | type == "string" and length > 0)
' "$CODEX_AUTH_FILE" >/dev/null
test "$(sed -n 's/^AFFILIATE_AGENT_CODEX_MODEL=//p' "$DEPLOYMENT_ENV")" = "gpt-5.6-luna"
```

The runner mounts this file read-only. It validates the reviewed ChatGPT auth
shape at startup. It copies the file into a fresh workspace `CODEX_HOME` and
starts Codex CLI with `--model gpt-5.6-luna`. The runner joins only the
internal gateway network and the reviewed egress network. Supervisors do not
receive the auth file or the Codex model setting.

3. Before this production state change, obtain separate current authorization.
   Start the runner and exactly two Mapping Producers plus two independent
   Supply Reviewers:

```text
RUNNER_CONTAINER_ID="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml ps -aq affiliate-agent-runner
)"
SUPERVISOR_CONTAINER_IDS="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml ps -aq mapping-producer-1 mapping-producer-2 \
    supply-reviewer-1 supply-reviewer-2
)"
test -n "$RUNNER_CONTAINER_ID"
test -n "$SUPERVISOR_CONTAINER_IDS"
printf '%s\n' "$RUNNER_CONTAINER_ID" | awk '
  NF != 1 || length($1) != 64 || $1 !~ /^[a-fA-F0-9]+$/ { exit 1 }
  { count++ }
  END { exit count == 1 ? 0 : 1 }
'
printf '%s\n' "$SUPERVISOR_CONTAINER_IDS" | awk '
  NF != 1 || length($1) != 64 || $1 !~ /^[a-fA-F0-9]+$/ { exit 1 }
  { count++ }
  END { exit count == 4 ? 0 : 1 }
'
while IFS= read -r container_id; do
  test -n "$container_id"
  grep -Fx "$container_id" \
    /path/to/affiliate-governed-private/reviewed-affiliate-container-ids.txt
done <<EOF
$RUNNER_CONTAINER_ID
$SUPERVISOR_CONTAINER_IDS
EOF
docker inspect "$RUNNER_CONTAINER_ID" $SUPERVISOR_CONTAINER_IDS |
  jq -e '
    map(.Config.Labels["com.docker.compose.service"]) | sort
    == ["affiliate-agent-runner", "mapping-producer-1", "mapping-producer-2",
        "supply-reviewer-1", "supply-reviewer-2"]
  ' >/dev/null
docker start "$RUNNER_CONTAINER_ID"
export RUNNER_STARTED_AT="$(docker inspect -f '{{.State.StartedAt}}' \
  "$RUNNER_CONTAINER_ID")"
test "$RUNNER_STARTED_AT" != "0001-01-01T00:00:00Z"
test "$(docker inspect -f '{{.State.Status}}' "$RUNNER_CONTAINER_ID")" = "running"
export RUNNER_CGROUP_EVIDENCE_TAG="${GATEWAY_STARTUP_TAG:-$(date -u '+%Y%m%dT%H%M%SZ')-$$}"
export RUNNER_CGROUP_EVIDENCE_OUTPUT="/path/to/affiliate-governed-private/runner-cgroup-containment.${RUNNER_CGROUP_EVIDENCE_TAG}.redacted.json"
test ! -e "$RUNNER_CGROUP_EVIDENCE_OUTPUT"
test ! -L "$RUNNER_CGROUP_EVIDENCE_OUTPUT"
export RUNNER_CGROUP_RUNTIME_EVIDENCE_OUTPUT="/path/to/affiliate-governed-private/runner-cgroup-runtime.${RUNNER_CGROUP_EVIDENCE_TAG}.redacted.json"
test ! -e "$RUNNER_CGROUP_RUNTIME_EVIDENCE_OUTPUT"
test ! -L "$RUNNER_CGROUP_RUNTIME_EVIDENCE_OUTPUT"
export RUNNER_CGROUP_MOUNT_LINE="$(
  docker exec "$RUNNER_CONTAINER_ID" cat /proc/self/mountinfo |
    awk '
      {
        separator = 0
        for (field = 1; field <= NF; field += 1) {
          if ($field == "-") {
            separator = field
            break
          }
        }
        if ($5 == "/sys/fs/cgroup" && separator > 0
          && $(separator + 1) == "cgroup2"
          && $6 ~ /(^|,)rw(,|$)/
          && $(separator + 3) ~ /(^|,)rw(,|$)/) {
          print
          found = 1
        }
      }
      END { exit found ? 0 : 1 }
    '
)"
test -n "$RUNNER_CGROUP_MOUNT_LINE"
docker inspect "$RUNNER_CONTAINER_ID" |
  jq -e --arg expected_group "$HOST_WORKSPACE_GID" \
    --arg mount_line "$RUNNER_CGROUP_MOUNT_LINE" '
    length == 1
    and .[0].HostConfig.CgroupnsMode == "private"
    and ((.[0].HostConfig.SecurityOpt // []) | sort
      == ["no-new-privileges:true", "writable-cgroups=true"])
    and .[0].HostConfig.Privileged == false
    and ((.[0].HostConfig.CapDrop // []) == ["ALL"])
    and (((.[0].HostConfig.CapAdd // []) | sort)
      == ["CHOWN", "DAC_OVERRIDE", "FOWNER", "KILL", "SETGID", "SETUID"])
    and ((.[0].HostConfig.GroupAdd // []) == [$expected_group])
    and ($mount_line | length > 0)
  ' >/dev/null
docker inspect "$RUNNER_CONTAINER_ID" |
  jq --arg mount_line "$RUNNER_CGROUP_MOUNT_LINE" '
    .[0] | {
      id: .Id,
      cgroupNamespace: .HostConfig.CgroupnsMode,
      securityOptions: (.HostConfig.SecurityOpt // []),
      privileged: .HostConfig.Privileged,
      capDrop: (.HostConfig.CapDrop // []),
      capAdd: (.HostConfig.CapAdd // []),
      groupAdd: (.HostConfig.GroupAdd // []),
      cgroupMount: $mount_line
    }
  ' > "$RUNNER_CGROUP_RUNTIME_EVIDENCE_OUTPUT"
test -s "$RUNNER_CGROUP_RUNTIME_EVIDENCE_OUTPUT"
shasum -a 256 "$RUNNER_CGROUP_RUNTIME_EVIDENCE_OUTPUT" \
  >> /path/to/affiliate-governed-private/deployment-evidence.sha256
if ! (
  umask 077
  set -o noclobber
  docker logs --since "$RUNNER_STARTED_AT" "$RUNNER_CONTAINER_ID" 2>&1 |
    jq -R -s '
      [
        split("\n")[] | fromjson?
        | select(type == "object"
          and .event == "affiliate-agent-runner-cgroup-containment")
      ]
      | if length != 1
        then error("runner cgroup startup evidence is not unique")
        else .[0]
        end
    ' > "$RUNNER_CGROUP_EVIDENCE_OUTPUT"
); then
  rm -f "$RUNNER_CGROUP_EVIDENCE_OUTPUT"
  exit 1
fi
jq -e '
  .event == "affiliate-agent-runner-cgroup-containment"
  and (.cgroupRoot | type == "string" and startswith("/sys/fs/cgroup/"))
  and (.cgroupRoot != "/sys/fs/cgroup")
  and .invocationRoot == .cgroupRoot
  and (.controlIdentity == {"uid": 0, "gid": 0})
  and (.codexIdentity == {"uid": 1002, "gid": 1001})
  and ((.controlCapabilities | sort)
    == ["CAP_CHOWN", "CAP_DAC_OVERRIDE", "CAP_FOWNER", "CAP_KILL",
        "CAP_SETGID", "CAP_SETUID"])
  and (.selfRelativePath | type == "string" and startswith("/"))
  and (.effectiveLimits | type == "object")
  and ([.effectiveLimits["cpu.max"], .effectiveLimits["memory.max"],
        .effectiveLimits["pids.max"]]
    | all(type == "string" and length > 0 and . != "unavailable"))
  and (.staleInvocationIds | type == "array"
    and all(.[]; type == "string" and test("^[0-9a-f-]+$")))
  and (.staleInvocationCleanup | type == "array"
    and all(.[]; type == "object"
      and (.id | type == "string" and test("^[0-9a-f-]+$"))
      and .kill == "requested"
      and .empty == true))
  and ([.staleInvocationCleanup[]?.id] | sort)
    == (.staleInvocationIds | sort)
  and (.staleInvocationResidualIds | . == [])
  and .cleanupStatus == "clean"
' "$RUNNER_CGROUP_EVIDENCE_OUTPUT"
shasum -a 256 "$RUNNER_CGROUP_EVIDENCE_OUTPUT" \
  >> /path/to/affiliate-governed-private/deployment-evidence.sha256
export RUNNER_WORKSPACE_EVIDENCE_OUTPUT="/path/to/affiliate-governed-private/runner-workspace-containment.${RUNNER_CGROUP_EVIDENCE_TAG}.redacted.json"
test ! -e "$RUNNER_WORKSPACE_EVIDENCE_OUTPUT"
test ! -L "$RUNNER_WORKSPACE_EVIDENCE_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  docker logs --since "$RUNNER_STARTED_AT" "$RUNNER_CONTAINER_ID" 2>&1 |
    jq -R -s '
      [
        split("\n")[] | fromjson?
        | select(type == "object"
          and .event == "affiliate-agent-runner-workspace-containment")
      ]
      | if length != 1
        then error("runner workspace startup evidence is not unique")
        else .[0]
        end
    ' > "$RUNNER_WORKSPACE_EVIDENCE_OUTPUT"
); then
  rm -f "$RUNNER_WORKSPACE_EVIDENCE_OUTPUT"
  exit 1
fi
jq -e '
  .event == "affiliate-agent-runner-workspace-containment"
  and .workspaceRoot == "/workspaces"
  and (.staleWorkspaceIds | type == "array"
    and all(.[]; type == "string"
      and test("^[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9]{6}$")))
  and (.staleWorkspaceCleanup | type == "array"
    and all(.[]; type == "object"
      and (.id | type == "string"
        and test("^[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9]{6}$"))
      and .removed == true))
  and ([.staleWorkspaceCleanup[]?.id] | sort)
    == (.staleWorkspaceIds | sort)
  and (.staleWorkspaceResidualIds | . == [])
  and .cleanupStatus == "clean"
' "$RUNNER_WORKSPACE_EVIDENCE_OUTPUT"
shasum -a 256 "$RUNNER_WORKSPACE_EVIDENCE_OUTPUT" \
  >> /path/to/affiliate-governed-private/deployment-evidence.sha256
export HOST_RUNNER_SOCKET="$HOST_WORKSPACE_ROOT/.runner.sock"
export RUNNER_SOCKET_READY=0
for runner_socket_attempt in $(seq 1 30); do
  if test -S "$HOST_RUNNER_SOCKET" \
    && test -r "$HOST_RUNNER_SOCKET" \
    && test -w "$HOST_RUNNER_SOCKET" \
    && test "$(stat -c '%u:%g' "$HOST_RUNNER_SOCKET")" = \
      "1001:0" \
    && test "$(stat -c '%a' "$HOST_RUNNER_SOCKET")" = "600"; then
    export RUNNER_SOCKET_READY=1
    break
  fi
  sleep 1
done
test "$RUNNER_SOCKET_READY" = "1"
sudo -n -u "#$HOST_WORKSPACE_RUNNER_UID" -g "#$HOST_WORKSPACE_GID" -- \
  sh -ceu '
    test -S "$1/.runner.sock"
    test "$(stat -c "%u:%g" "$1/.runner.sock")" = "1001:0"
    test "$(stat -c "%a" "$1/.runner.sock")" = "600"
    ! rm "$1/.runner.sock" 2>/dev/null
  ' -- "$HOST_WORKSPACE_ROOT" "$HOST_WORKSPACE_GID"
while IFS= read -r container_id; do
  test -n "$container_id"
  docker start "$container_id"
done <<EOF
$SUPERVISOR_CONTAINER_IDS
EOF
```

The runner socket must be owned by supervisor UID `1001`, root GID `0`, and
mode `0600`. Supervisors connect as the owner; stop if any socket check fails.

4. Wait for the gateway readiness endpoint to observe all four downstream
   worker identities with healthy, unexpired leases. The profiled helper must
   exit successfully; do not start the planner when it exits non-zero:

```text
READINESS_CONTAINER_ID="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml --profile coverage-planner ps -aq affiliate-agent-downstream-ready
)"
test -n "$READINESS_CONTAINER_ID"
printf '%s\n' "$READINESS_CONTAINER_ID" | awk '
  NF != 1 || length($1) != 64 || $1 !~ /^[a-fA-F0-9]+$/ { exit 1 }
  { count++ }
  END { exit count == 1 ? 0 : 1 }
'
grep -Fx "$READINESS_CONTAINER_ID" \
  /path/to/affiliate-governed-private/reviewed-affiliate-container-ids.txt
docker inspect "$READINESS_CONTAINER_ID" |
  jq -e --arg id "$READINESS_CONTAINER_ID" '
    length == 1
    and .[0].Id == $id
    and .[0].Config.Labels["com.docker.compose.service"] == "affiliate-agent-downstream-ready"
  ' >/dev/null
docker start -a "$READINESS_CONTAINER_ID"
```

The successful readiness gate is the policy transition point. Before this next
production state change, obtain separate current authorization. The gateway,
runner, four downstream supervisors, and the stopped Coverage Planner must
still have the safe `no` policy:

```text
test "$(grep -c '^AFFILIATE_AGENT_RESTART_POLICY=' \
  /path/to/affiliate-governed-private/deployment.env)" = "1"
test "$(sed -n 's/^AFFILIATE_AGENT_RESTART_POLICY=//p' \
  /path/to/affiliate-governed-private/deployment.env)" = "no"
umask 077
awk '
  BEGIN { found = 0 }
  /^AFFILIATE_AGENT_RESTART_POLICY=/ {
    print "AFFILIATE_AGENT_RESTART_POLICY=unless-stopped"
    found = 1
    next
  }
  { print }
  END { if (!found) exit 1 }
' /path/to/affiliate-governed-private/deployment.env \
  > /path/to/affiliate-governed-private/deployment.env.next &&
chmod 0600 /path/to/affiliate-governed-private/deployment.env.next &&
mv /path/to/affiliate-governed-private/deployment.env.next \
  /path/to/affiliate-governed-private/deployment.env
test "$(sed -n 's/^AFFILIATE_AGENT_RESTART_POLICY=//p' \
  /path/to/affiliate-governed-private/deployment.env)" = "unless-stopped"
```

Read the Compose configuration again before changing any running container.
The eight long-lived services must resolve to `unless-stopped`; the profiled
one-shot readiness helper must remain `no`:

```text
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner config --format json |
jq -e '
  .services as $services
  | (
      [
        $services["affiliate-gateway"].restart,
        $services["affiliate-agent-runner"].restart,
        $services["mapping-producer-1"].restart,
        $services["mapping-producer-2"].restart,
        $services["supply-reviewer-1"].restart,
        $services["supply-reviewer-2"].restart,
        $services["coverage-planner"].restart,
        $services["affiliate-replenishment-controller"].restart
      ] | all(.[]; . == "unless-stopped")
    )
    and ($services["affiliate-agent-downstream-ready"].restart == "no")
'
```

Apply the reviewed policy to the containers created with `no` without
restarting them. Use the exact service list; do not include the one-shot
readiness helper:

```text
CONTAINER_IDS="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml --profile coverage-planner ps -aq \
    affiliate-gateway affiliate-agent-runner mapping-producer-1 \
    mapping-producer-2 supply-reviewer-1 supply-reviewer-2 coverage-planner \
    affiliate-replenishment-controller
)"
test -n "$CONTAINER_IDS"
printf '%s\n' "$CONTAINER_IDS" | awk '
  NF != 1 || length($1) != 64 || $1 !~ /^[a-fA-F0-9]+$/ { exit 1 }
  { count++ }
  END { exit count == 8 ? 0 : 1 }
'
while IFS= read -r container_id; do
  test -n "$container_id"
  docker update --restart=unless-stopped "$container_id"
done <<EOF
$CONTAINER_IDS
EOF
```

This metadata update does not start or stop a container. Stop if any container
ID is missing or `docker update` fails. The next `up` for Coverage Planner
therefore uses the persistent policy after the readiness gate, and the
gateway, runner, all five supervisors, and the governed replenishment controller
now share the same reviewed policy.

5. Before this production state change, obtain separate current authorization.
   Start Coverage Planner only after the readiness helper exits successfully:

```text
PLANNER_CONTAINER_ID="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml --profile coverage-planner ps -aq coverage-planner
)"
test -n "$PLANNER_CONTAINER_ID"
printf '%s\n' "$PLANNER_CONTAINER_ID" | awk '
  NF != 1 || length($1) != 64 || $1 !~ /^[a-fA-F0-9]+$/ { exit 1 }
  { count++ }
  END { exit count == 1 ? 0 : 1 }
'
grep -Fx "$PLANNER_CONTAINER_ID" \
  /path/to/affiliate-governed-private/reviewed-affiliate-container-ids.txt
REVIEWED_PLANNER_IMAGE="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml --profile coverage-planner config --format json |
    jq -er '.services["coverage-planner"].image'
)"
export PLANNER_IDENTITY_OUTPUT=/path/to/affiliate-governed-private/coverage-planner-identity.redacted.json
install -m 0600 /dev/null "$PLANNER_IDENTITY_OUTPUT"
docker inspect "$PLANNER_CONTAINER_ID" |
  jq 'map({
    id: .Id,
    name: (.Name | ltrimstr("/")),
    service: .Config.Labels["com.docker.compose.service"],
    image: .Config.Image,
    imageId: .Image,
    status: (.State.Status // "unknown")
  })' > "$PLANNER_IDENTITY_OUTPUT"
jq -e --arg id "$PLANNER_CONTAINER_ID" --arg image "$REVIEWED_PLANNER_IMAGE" '
  length == 1
  and .[0].id == $id
  and .[0].service == "coverage-planner"
  and .[0].image == $image
  and (.[0].image | test("@sha256:[a-fA-F0-9]{64}$"))
  and (.[0].imageId | test("^sha256:[a-fA-F0-9]{64}$"))
' "$PLANNER_IDENTITY_OUTPUT"
shasum -a 256 "$PLANNER_IDENTITY_OUTPUT" >> "$DEPLOYMENT_EVIDENCE_HASH"
docker start "$PLANNER_CONTAINER_ID"

```
Do not use `docker compose up` for the planner step. It can converge or
recreate a reviewed container. Start only the exact reviewed Coverage Planner
ID with `docker start`. Stop if the ID, service label, image digest, or
identity inspection does not match.

Start the governed replenishment controller only after the exact Coverage
Planner ID starts. Do not use `docker compose up`; start the reviewed
controller container directly:

```text
test -s "$REVIEWED_REPLENISHMENT_CONTAINER_ID_FILE"
test "$(cat "$REVIEWED_REPLENISHMENT_CONTAINER_ID_FILE")" = "$REPLENISHMENT_CONTAINER_ID"
docker inspect "$REPLENISHMENT_CONTAINER_ID" |
  jq -e --arg id "$REPLENISHMENT_CONTAINER_ID" '
    length == 1
    and .[0].Id == $id
    and .[0].Config.Labels["com.docker.compose.service"] == "affiliate-replenishment-controller"
    and (.[0].Config.Image | test("@sha256:[A-Fa-f0-9]{64}$"))
  ' >/dev/null
docker start "$REPLENISHMENT_CONTAINER_ID"
docker inspect "$REPLENISHMENT_CONTAINER_ID" |
  jq -e 'length == 1 and .[0].State.Status == "running"' >/dev/null
```

The controller now runs one safe, session-independent replenishment command
per protected interval. A command failure exits the cadence container; after
the authorized `unless-stopped` transition, Docker may restart that exact
container. Treat repeated failures as a halted cadence and obtain fresh
authorization before changing or manually restarting it.

Capture the effective policy after Coverage Planner and the replenishment
controller start. Stream Docker's inspection through a redacting filter; do not
retain a raw inspection:

```text
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/governed-restart-policy.redacted.json
test -n "$CONTAINER_IDS"
docker inspect $CONTAINER_IDS |
  jq 'map({
    name: (.Name | ltrimstr("/")),
    status: (.State.Status // "unknown"),
    restartPolicy: (.HostConfig.RestartPolicy.Name // "no"),
    restartCount: (.RestartCount // 0)
  })' > /path/to/affiliate-governed-private/governed-restart-policy.redacted.json
jq -e 'length == 8 and all(.[]; .restartPolicy == "unless-stopped")' \
  /path/to/affiliate-governed-private/governed-restart-policy.redacted.json
```
### Bounded canary admission

Run this opening command in the same shell as the canary observation and
close. Before the canary claim, obtain separate current authorization for one
bounded admission interval. The server-enforced open request must identify the
single `COVERAGE_PLANNER` worker, present its role credential, and request a
finite lease with exactly one remaining claim. The trap closes admission if
any command fails or the shell exits before the explicit close:

```text
set -Eeuo pipefail
export OBSERVATION_ADMISSION_OPEN=0
close_observation_admission() {
  if test "${OBSERVATION_ADMISSION_OPEN:-0}" = "1"; then
    if docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
      -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/admission/close", {
  method: "POST",
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "closed" || body.open !== false
      || Object.keys(body).sort().join(",") !== "open,status") throw new Error(JSON.stringify(body));
  console.log(JSON.stringify(body));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'
    then
      :
    else
      export OBSERVATION_ADMISSION_CLOSE_FAILED=1
      return 1
    fi
    export OBSERVATION_ADMISSION_OPEN=0
    export OBSERVATION_ADMISSION_END="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  fi
}
trap close_observation_admission EXIT INT TERM
export OBSERVATION_ADMISSION_START="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/admission", {
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "closed" || body.open !== false
      || Object.keys(body).sort().join(",") !== "open,status") throw new Error(JSON.stringify(body));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'
export CANARY_ADMISSION_LEASE_OUTPUT=/path/to/affiliate-governed-private/canary-admission-lease.redacted.json
test ! -e "$CANARY_ADMISSION_LEASE_OUTPUT"
test ! -L "$CANARY_ADMISSION_LEASE_OUTPUT"
export OBSERVATION_ADMISSION_OPEN=1
if ! (
  umask 077
  set -o noclobber
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
const roleCredential = process.env.AFFILIATE_COVERAGE_PLANNER_CREDENTIAL;
if (!roleCredential) throw new Error("The reviewed Coverage Planner credential is unavailable.");
fetch("http://127.0.0.1:8080" + prefix + "/admission/open", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN
  },
  body: JSON.stringify({
    role: "COVERAGE_PLANNER",
    workerId: "coverage-planner",
    roleCredential,
    leaseSeconds: 120
  })
}).then(async (response) => {
  const body = await response.json();
  const lease = body.lease;
  if (!response.ok || body.status !== "open" || body.open !== true
      || !lease || lease.role !== "COVERAGE_PLANNER"
      || lease.workerId !== "coverage-planner"
      || lease.remainingClaims !== 1
      || typeof lease.expiresAt !== "string"
      || new Date(lease.expiresAt).getTime() <= Date.now()) {
    throw new Error(JSON.stringify(body));
  }
  console.log(JSON.stringify({
    status: body.status,
    open: body.open,
    lease: {
      role: lease.role,
      workerId: lease.workerId,
      expiresAt: lease.expiresAt,
      remainingClaims: lease.remainingClaims
    }
  }));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'
  > "$CANARY_ADMISSION_LEASE_OUTPUT"
); then
  rm -f "$CANARY_ADMISSION_LEASE_OUTPUT"
  exit 1
fi
jq -e '
  .status == "open" and .open == true
  and .lease.role == "COVERAGE_PLANNER"
  and .lease.workerId == "coverage-planner"
  and .lease.remainingClaims == 1
  and (.lease.expiresAt | type == "string" and length > 0)
' "$CANARY_ADMISSION_LEASE_OUTPUT"
export CANARY_ADMISSION_EXPIRES_AT="$(jq -er '.lease.expiresAt' "$CANARY_ADMISSION_LEASE_OUTPUT")"
export OBSERVATION_ADMISSION_OPEN=1
```

This interval permits only the bounded canary claim. Do not extend it or
re-open it for restart, replay, or containment. The trap is required even when
the canary or readback fails.

### Bounded pre-restart canary

Before the restart observation, obtain separate current authorization for one
canary. Let one already-started Coverage Planner supervisor perform one real
bounded external command through the normal gateway path. The command must
leave a due, replayable in-flight receipt (`EXECUTE_COMMAND` with
`CAPTURE_CLAIM_URL` or `RUN_DISCOVERY_QUERY`), including its durable
idempotency key and external-operation key. Select a job with zero prior
invocation failures so this drill has a deterministic first-failure outcome.
Do not insert a receipt, submit synthetic SQL, call `/perform` with a
hand-written token, or manufacture a provider failure. If no naturally
in-flight receipt exists, stop; do not turn a completed heartbeat into replay
evidence. The canary window must end before the approved runner restart:

```text
export CANARY_WINDOW_START="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
# Keep the lease open only while polling for the one qualifying in-flight
# receipt. Close it immediately after a match and before any readback.
# The supervisor must already own this claim and have a real external command
# due for recovery. Do not manufacture a failure or receipt.
export CANARY_ROLLOUT_COHORT=REPLACE_WITH_REVIEWED_CANARY_ROLLOUT_COHORT
export CANARY_MARKET_KEY=REPLACE_WITH_REVIEWED_CANARY_MARKET_KEY
export CANARY_COVERAGE_CELL_ID=REPLACE_WITH_REVIEWED_CANARY_COVERAGE_CELL_ID
export CANARY_LINEAGE_CYCLE_ID=REPLACE_WITH_REVIEWED_CANARY_ASSESSMENT_CYCLE_ID
assert_non_placeholder_identity "$CANARY_ROLLOUT_COHORT" "CANARY_ROLLOUT_COHORT"
assert_non_placeholder_identity "$CANARY_MARKET_KEY" "CANARY_MARKET_KEY"
assert_non_placeholder_identity "$CANARY_COVERAGE_CELL_ID" "CANARY_COVERAGE_CELL_ID"
assert_non_placeholder_identity "$CANARY_LINEAGE_CYCLE_ID" "CANARY_LINEAGE_CYCLE_ID"
export CANARY_RECEIPT_OUTPUT=/path/to/affiliate-governed-private/canary-receipt.redacted.json
test ! -e "$CANARY_RECEIPT_OUTPUT"
assert_reviewed_database_identity
export CANARY_ADMISSION_DEADLINE_EPOCH="$(
  date -u -d "$CANARY_ADMISSION_EXPIRES_AT" +%s
)"
case "$CANARY_ADMISSION_DEADLINE_EPOCH" in
  ''|*[!0-9]*) printf '%s\n' "The canary lease expiration did not resolve to an epoch." >&2; exit 1 ;;
esac
for canary_attempt in $(seq 1 120); do
  test "$(date -u +%s)" -lt "$CANARY_ADMISSION_DEADLINE_EPOCH" || break
  if CANARY_RECEIPT_JSON="$(
    psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 -Atc \
      -v session_id="$CUTOVER_SESSION_ID" \
      -v replay_run_id="$REPLAY_RUN_ID" \
      -v window_start="$CANARY_WINDOW_START" \
      -v admission_expires_at="$CANARY_ADMISSION_EXPIRES_AT" \
      -v rollout_cohort="$CANARY_ROLLOUT_COHORT" \
      -v market_key="$CANARY_MARKET_KEY" \
      -v coverage_cell_id="$CANARY_COVERAGE_CELL_ID" \
      -v lineage_cycle_id="$CANARY_LINEAGE_CYCLE_ID" \
      "WITH session_scope AS (
        SELECT 1
        FROM \"AffiliateSupplyReconciliationRuns\" r
        WHERE r.\"id\" = :'session_id'
          AND r.\"mode\" = 'CUTOVER_SESSION'
      ),
      canary_source AS (
        SELECT
          w.\"coveragePlanningJobId\" AS coverage_planning_job_id,
          cc.\"id\" AS coverage_cell_id,
          ca.\"cycleKey\" AS lineage_cycle_id,
          min(ss.\"id\") AS source_id
        FROM \"AffiliateReplenishmentWaves\" w
        JOIN \"AffiliateReplenishmentDemands\" d
          ON d.\"id\" = w.\"demandId\"
        JOIN \"AffiliateAgentGatewayJobs\" planner_job
          ON planner_job.\"id\" = w.\"coveragePlanningJobId\"
         AND planner_job.\"role\" = 'COVERAGE_PLANNER'
         AND planner_job.\"supplySourceId\" IS NULL
        JOIN \"AffiliateCoverageCells\" cc
          ON cc.\"id\" = d.\"targetKey\"
         AND cc.\"id\" = :'coverage_cell_id'
         AND cc.\"marketKey\" = d.\"marketKey\"
         AND cc.\"sportId\" = d.\"sportId\"
         AND cc.\"profileKey\" = d.\"sourceProfile\"
        JOIN \"AffiliateCoverageCellAssessments\" ca
          ON ca.\"cellId\" = cc.\"id\"
         AND ca.\"cycleKey\" = :'lineage_cycle_id'
         AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
        JOIN \"AffiliateSourceDiscoveryCampaigns\" campaign
          ON campaign.\"id\" = w.\"campaignId\"
        JOIN \"AffiliateSourceDiscoveryRuns\" discovery_run
          ON discovery_run.\"campaignId\" = campaign.\"id\"
         AND discovery_run.\"status\" IN ('SUCCEEDED', 'PARTIAL', 'RUNNING')
        JOIN \"AffiliateSourceDiscoveryQueryExecutions\" discovery_query
          ON discovery_query.\"runId\" = discovery_run.\"id\"
         AND discovery_query.\"campaignId\" = campaign.\"id\"
         AND discovery_query.\"status\" IN ('SUCCEEDED', 'PARTIAL', 'RUNNING')
         AND discovery_query.\"sportId\" = cc.\"sportId\"
         AND discovery_query.\"profileKey\" = cc.\"profileKey\"
        JOIN \"AffiliateCoverageCities\" city
          ON city.\"id\" = cc.\"cityId\"
         AND city.\"placeGeoid\" = discovery_query.\"cityGeoid\"
        JOIN \"AffiliateSourceDiscoveryResults\" discovery_result
          ON discovery_result.\"campaignId\" = campaign.\"id\"
         AND discovery_result.\"latestRunId\" = discovery_run.\"id\"
         AND discovery_result.\"supplySourceId\" IS NOT NULL
        JOIN \"AffiliateSupplyTargets\" target
          ON target.\"marketKey\" = d.\"marketKey\"
         AND target.\"sportId\" = d.\"sportId\"
         AND target.\"sourceProfile\" = d.\"sourceProfile\"
         AND target.\"status\" = 'PUBLISHED'
         AND target.\"supplySourceId\" = discovery_result.\"supplySourceId\"
        JOIN \"AffiliateSupplySources\" ss
          ON ss.\"id\" = target.\"supplySourceId\"
         AND ss.\"id\" = discovery_result.\"supplySourceId\"
         AND ss.\"rolloutCohort\" = d.\"rolloutCohort\"
        CROSS JOIN session_scope
        WHERE w.\"rolloutCohort\" = :'rollout_cohort'
          AND d.\"rolloutCohort\" = :'rollout_cohort'
          AND d.\"marketKey\" = :'market_key'
          AND d.\"targetKey\" = cc.\"id\"
          AND w.\"coveragePlanningJobId\" IS NOT NULL
        GROUP BY w.\"coveragePlanningJobId\", cc.\"id\", ca.\"cycleKey\"
        HAVING count(DISTINCT ss.\"id\") = 1
      ),
      canary AS (
        SELECT
          r.\"id\" AS receipt_id,
          r.\"claimId\" AS claim_id,
          r.\"jobId\" AS job_id,
          r.\"claimGeneration\" AS claim_generation,
          r.\"idempotencyKey\" AS idempotency_key,
          r.\"operationKind\" AS operation_kind,
          r.\"commandName\" AS command_name,
          r.\"externalOperationKey\" AS external_operation_key,
          r.\"requestHash\" AS request_hash,
          r.\"startedAt\" AS started_at,
          r.\"reconcileAfter\" AS reconcile_after,
          j.\"role\" AS role,
          cs.source_id,
          cc.\"marketKey\" AS market_key,
          cc.\"cohort\" AS rollout_cohort,
          cc.\"id\" AS coverage_cell_id,
          cs.lineage_cycle_id,
          c.\"status\" AS claim_status,
          c.\"leaseExpiresAt\" AS claim_lease_expires_at
        FROM \"AffiliateAgentGatewayOperationReceipts\" r
        JOIN \"AffiliateAgentGatewayJobs\" j ON j.\"id\" = r.\"jobId\"
        JOIN canary_source cs ON cs.coverage_planning_job_id = j.\"id\"
        JOIN \"AffiliateAgentGatewayClaims\" c
          ON c.\"id\" = r.\"claimId\"
          AND c.\"jobId\" = r.\"jobId\"
          AND c.\"claimGeneration\" = r.\"claimGeneration\"
        JOIN \"AffiliateCoverageCells\" cc
          ON cc.\"id\" = cs.coverage_cell_id
        JOIN \"AffiliateSupplySources\" ss
          ON ss.\"id\" = cs.source_id
         AND ss.\"rolloutCohort\" = cc.\"cohort\"
        JOIN \"AffiliateSupplyContractManifests\" cm
          ON cm.\"rolloutCohort\" = ss.\"rolloutCohort\"
         AND cm.\"version\" = ss.\"activeSupplyContractVersion\"
         AND cm.\"contractHash\" = ss.\"activeSupplyContractHash\"
         AND cm.\"status\" = 'ACTIVE'
        WHERE r.\"operationKind\" = 'EXECUTE_COMMAND'
          AND r.\"commandName\" IN ('CAPTURE_CLAIM_URL', 'RUN_DISCOVERY_QUERY')
          AND r.\"status\" = 'PENDING'
          AND r.\"externalOperationKey\" IS NOT NULL
          AND r.\"requestHash\" IS NOT NULL
          AND r.\"reconcileAfter\" IS NOT NULL
          AND r.\"reconcileAfter\" <= CURRENT_TIMESTAMP
          AND r.\"startedAt\" >= :'window_start'::timestamptz
          AND CURRENT_TIMESTAMP < :'admission_expires_at'::timestamptz
          AND j.\"status\" = 'CLAIMED'
          AND j.\"activeClaimId\" = c.\"id\"
          AND j.\"claimGeneration\" = c.\"claimGeneration\"
          AND j.\"invocationFailureCount\" = 0
          AND c.\"status\" = 'ACTIVE'
          AND c.\"leaseExpiresAt\" > CURRENT_TIMESTAMP
        ORDER BY r.\"startedAt\" DESC, r.\"id\" DESC
        LIMIT 1
      )
      SELECT json_build_object(
        'cutoverSessionId', :'session_id',
        'replayRunId', :'replay_run_id',
        'receiptId', receipt_id,
        'claimId', claim_id,
        'jobId', job_id,
        'claimGeneration', claim_generation,
        'idempotencyKey', idempotency_key,
        'operationKind', operation_kind,
        'commandName', command_name,
        'externalOperationKey', external_operation_key,
        'requestHash', request_hash,
        'startedAt', started_at,
        'reconcileAfter', reconcile_after,
        'role', role,
        'sourceId', source_id,
        'marketKey', market_key,
        'rolloutCohort', rollout_cohort,
        'coverageCellId', coverage_cell_id,
        'lineageCycleId', lineage_cycle_id,
        'claimStatus', claim_status,
        'claimLeaseExpiresAt', claim_lease_expires_at
      )
      FROM canary;"
  )" && test -n "$CANARY_RECEIPT_JSON"; then
    if ! (
      umask 077
      set -o noclobber
      printf '%s\n' "$CANARY_RECEIPT_JSON" > "$CANARY_RECEIPT_OUTPUT"
    ); then
      rm -f "$CANARY_RECEIPT_OUTPUT"
      exit 1
    fi
    break
  fi
  sleep 1
done
test -s "$CANARY_RECEIPT_OUTPUT"
export CANARY_ADMISSION_CONSUMED_OUTPUT=/path/to/affiliate-governed-private/canary-admission-consumed.redacted.json
test ! -e "$CANARY_ADMISSION_CONSUMED_OUTPUT"
test ! -L "$CANARY_ADMISSION_CONSUMED_OUTPUT"
export CANARY_CONSUMED_DEADLINE_EPOCH="$(( $(date -u +%s) + 60 ))"
for canary_consumed_attempt in $(seq 1 60); do
  test "$(date -u +%s)" -lt "$CANARY_CONSUMED_DEADLINE_EPOCH" || break
  if docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/admission", {
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "closed" || body.open !== false
      || Object.keys(body).sort().join(",") !== "open,status") throw new Error(JSON.stringify(body));
  console.log(JSON.stringify(body));
}).catch((error) => { console.error(error); process.exitCode = 1; });
' > "$CANARY_ADMISSION_CONSUMED_OUTPUT" \
    && jq -e '.status == "closed" and .open == false and (keys | sort) == ["open", "status"]' \
      "$CANARY_ADMISSION_CONSUMED_OUTPUT"; then
    break
  fi
  sleep 1
done
jq -e '.status == "closed" and .open == false and (keys | sort) == ["open", "status"]' \
  "$CANARY_ADMISSION_CONSUMED_OUTPUT"
export CANARY_WINDOW_END="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
close_observation_admission
test "$OBSERVATION_ADMISSION_OPEN" = "0"
test -n "$OBSERVATION_ADMISSION_END"
trap - EXIT INT TERM
export CANARY_SOURCE_ID="$(jq -er '.sourceId' "$CANARY_RECEIPT_OUTPUT")"
assert_non_placeholder_identity "$CANARY_SOURCE_ID" "CANARY_SOURCE_ID"
jq -e \
  --arg session "$CUTOVER_SESSION_ID" \
  --arg replay "$REPLAY_RUN_ID" \
  --arg source "$CANARY_SOURCE_ID" \
  --arg market "$CANARY_MARKET_KEY" \
  --arg cohort "$CANARY_ROLLOUT_COHORT" \
  --arg cell "$CANARY_COVERAGE_CELL_ID" \
  --arg cycle "$CANARY_LINEAGE_CYCLE_ID" '
  .cutoverSessionId == $session
  and .replayRunId == $replay
  and (.receiptId | type == "string" and length > 0)
  and (.claimId | type == "string" and length > 0)
  and (.jobId | type == "string" and length > 0)
  and (.claimGeneration | type == "number" and floor == . and . >= 0)
  and (.idempotencyKey | type == "string" and length > 0)
  and .role == "COVERAGE_PLANNER"
  and .operationKind == "EXECUTE_COMMAND"
  and (.commandName == "CAPTURE_CLAIM_URL" or .commandName == "RUN_DISCOVERY_QUERY")
  and (.externalOperationKey | type == "string" and length > 0)
  and (.requestHash | type == "string" and test("^[a-fA-F0-9]{64}$"))
  and .sourceId == $source
  and .marketKey == $market
  and .rolloutCohort == $cohort
  and .coverageCellId == $cell
  and .lineageCycleId == $cycle
  and .claimStatus == "ACTIVE"
' "$CANARY_RECEIPT_OUTPUT"
export CANARY_RECEIPT_ID="$(jq -er '.receiptId' "$CANARY_RECEIPT_OUTPUT")"
export CANARY_CLAIM_ID="$(jq -er '.claimId' "$CANARY_RECEIPT_OUTPUT")"
export CANARY_JOB_ID="$(jq -er '.jobId' "$CANARY_RECEIPT_OUTPUT")"
export CANARY_CLAIM_GENERATION="$(jq -er '.claimGeneration | select(type == "number" and floor == . and . >= 0)' "$CANARY_RECEIPT_OUTPUT")"
export CANARY_IDEMPOTENCY_KEY="$(jq -er '.idempotencyKey' "$CANARY_RECEIPT_OUTPUT")"
export CANARY_OPERATION_KIND="$(jq -er '.operationKind' "$CANARY_RECEIPT_OUTPUT")"
export CANARY_COMMAND_NAME="$(jq -er '.commandName' "$CANARY_RECEIPT_OUTPUT")"
export CANARY_EXTERNAL_OPERATION_KEY="$(jq -er '.externalOperationKey' "$CANARY_RECEIPT_OUTPUT")"
```

### Admission remains closed before restart or replay

The receipt poll above ran only during the one-claim lease. After the qualifying
receipt matched, `close_observation_admission` recorded the end before the
readback and replay evidence. Verify the close again without re-opening admission:

```text
test "$OBSERVATION_ADMISSION_OPEN" = "0"
test -n "$OBSERVATION_ADMISSION_END"
```

The canary is a real durable gateway receipt. Its evidence must bind the
`CUTOVER_SESSION_ID`, `REPLAY_RUN_ID`, receipt, claim, job, claim generation,
and idempotency key. A missing receipt or any mismatch stops the run. Keep
admission closed and do not restart or replay until this gate passes.

For the first authorized restart/recovery observation, obtain separate current
authorization before the restart. Do not kill a production container to
manufacture evidence. Restarting the runner intentionally disconnects the
supervisor's runner socket; the supervisor's exact `/reconcile/invocation`
path recovers any pending external effect and records `PROCESS_CRASH`. Capture
the bounded `die` and recovery events:

```text
export RESTART_OBSERVATION_START="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
RUNNER_CONTAINER_ID="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml ps -aq affiliate-agent-runner
)"
test -n "$RUNNER_CONTAINER_ID"
printf '%s\n' "$RUNNER_CONTAINER_ID" | awk '
  NF != 1 || length($1) != 64 || $1 !~ /^[a-fA-F0-9]+$/ { exit 1 }
  { count++ }
  END { exit count == 1 ? 0 : 1 }
'
grep -Fx "$RUNNER_CONTAINER_ID" \
  /path/to/affiliate-governed-private/reviewed-affiliate-container-ids.txt
assert_reviewed_database_identity
export CANARY_CLAIM_BEFORE_RESTART_OUTPUT=/path/to/affiliate-governed-private/canary-claim-before-restart.redacted.json
test ! -e "$CANARY_CLAIM_BEFORE_RESTART_OUTPUT"
test ! -L "$CANARY_CLAIM_BEFORE_RESTART_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
    -v claim_id="$CANARY_CLAIM_ID" \
    -v job_id="$CANARY_JOB_ID" \
    -v claim_generation="$CANARY_CLAIM_GENERATION" \
    -v receipt_id="$CANARY_RECEIPT_ID" \
    -Atc "
    SELECT COALESCE((
      SELECT json_build_object(
        'claimId', c.\"id\",
        'jobId', c.\"jobId\",
        'claimGeneration', c.\"claimGeneration\",
        'status', c.\"status\",
        'leaseExpiresAt', c.\"leaseExpiresAt\",
        'receiptId', r.\"id\",
        'receiptStatus', r.\"status\",
        'receiptOperationKind', r.\"operationKind\",
        'receiptCommandName', r.\"commandName\",
        'receiptExternalOperationKey', r.\"externalOperationKey\"
      )
      FROM \"AffiliateAgentGatewayClaims\" c
      JOIN \"AffiliateAgentGatewayOperationReceipts\" r
        ON r.\"id\" = :'receipt_id'
        AND r.\"claimId\" = c.\"id\"
        AND r.\"jobId\" = c.\"jobId\"
        AND r.\"claimGeneration\" = c.\"claimGeneration\"
      WHERE c.\"id\" = :'claim_id'
        AND c.\"jobId\" = :'job_id'
        AND c.\"claimGeneration\" = :'claim_generation'::integer
        AND c.\"status\" = 'ACTIVE'
        AND c.\"leaseExpiresAt\" > CURRENT_TIMESTAMP
        AND r.\"operationKind\" = 'EXECUTE_COMMAND'
        AND r.\"commandName\" IN ('CAPTURE_CLAIM_URL', 'RUN_DISCOVERY_QUERY')
        AND r.\"status\" = 'PENDING'
        AND r.\"externalOperationKey\" IS NOT NULL
    ), '{}'::json);"
) > "$CANARY_CLAIM_BEFORE_RESTART_OUTPUT"; then
  rm -f "$CANARY_CLAIM_BEFORE_RESTART_OUTPUT"
  exit 1
fi
jq -e \
  --arg claim "$CANARY_CLAIM_ID" \
  --arg job "$CANARY_JOB_ID" \
  --arg receipt "$CANARY_RECEIPT_ID" \
  --argjson generation "$CANARY_CLAIM_GENERATION" '
  .claimId == $claim
  and .jobId == $job
  and .claimGeneration == $generation
  and .status == "ACTIVE"
  and (.leaseExpiresAt | type == "string" and length > 0)
  and .receiptId == $receipt
  and .receiptStatus == "PENDING"
  and .receiptOperationKind == "EXECUTE_COMMAND"
  and (.receiptCommandName == "CAPTURE_CLAIM_URL" or .receiptCommandName == "RUN_DISCOVERY_QUERY")
  and (.receiptExternalOperationKey | type == "string" and length > 0)
' "$CANARY_CLAIM_BEFORE_RESTART_OUTPUT"
docker restart "$RUNNER_CONTAINER_ID"
export RESTART_OBSERVATION_END="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
docker events \
  --since "$RESTART_OBSERVATION_START" \
  --until "$RESTART_OBSERVATION_END" \
  --filter type=container \
  --filter container="$RUNNER_CONTAINER_ID" \
  --filter event=die \
  --filter event=start \
  --filter event=restart \
  --format '{{json .}}' |
jq -c '{time: .time, timeNano: .timeNano, action: .Action, id: .Actor.ID,
        name: .Actor.Attributes.name}' \
  > /path/to/affiliate-governed-private/governed-restart-events.jsonl
jq -s -e --arg runner "$RUNNER_CONTAINER_ID" '
  length > 0
  and all(.[]; .id == $runner)
  and ([ .[] | select(.action == "die") ] | length == 1)
  and any(.[]; .action == "start" or .action == "restart")
  and (map(.timeNano | tonumber) == (map(.timeNano | tonumber) | sort))
  and (
    (map(.action) | map(if . == "die" then 0 elif . == "start" or . == "restart" then 1 else 2 end) | index(0))
    <
    (map(.action) | map(if . == "die" then 0 elif . == "start" or . == "restart" then 1 else 2 end) | index(1))
  )
' /path/to/affiliate-governed-private/governed-restart-events.jsonl
export RESTART_DIE_TIME_NANO="$(
  jq -s -er '
    [ .[] | select(.action == "die") | .timeNano | tonumber ]
    | if length == 1 then .[0] else error("expected exactly one runner die event") end
  ' /path/to/affiliate-governed-private/governed-restart-events.jsonl
)"
case "$RESTART_DIE_TIME_NANO" in
  ''|*[!0-9]*) printf '%s\n' "The runner die event did not provide a numeric timeNano." >&2; exit 1 ;;
esac
```

Inspect the restarted runner without retaining its environment, and require
that it is running under the persistent policy:

```text
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/governed-restart-recovery.redacted.json
docker inspect $(docker compose \
  --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner ps -q affiliate-agent-runner) |
jq '.[0] | {
  name: (.Name | ltrimstr("/")),
  status: (.State.Status // "unknown"),
  restartPolicy: (.HostConfig.RestartPolicy.Name // "no"),
  restartCount: (.RestartCount // 0)
}' > /path/to/affiliate-governed-private/governed-restart-recovery.redacted.json
jq -e '.status == "running" and .restartPolicy == "unless-stopped"' \
  /path/to/affiliate-governed-private/governed-restart-recovery.redacted.json
assert_reviewed_database_identity
export CANARY_CLAIM_AFTER_RESTART_OUTPUT=/path/to/affiliate-governed-private/canary-claim-after-restart.redacted.json
test ! -e "$CANARY_CLAIM_AFTER_RESTART_OUTPUT"
test ! -L "$CANARY_CLAIM_AFTER_RESTART_OUTPUT"
export CANARY_CLAIM_FAILURE_DEADLINE_EPOCH="$(( $(date -u +%s) + 60 ))"
for canary_claim_failure_attempt in $(seq 1 60); do
  test "$(date -u +%s)" -lt "$CANARY_CLAIM_FAILURE_DEADLINE_EPOCH" || break
  rm -f "$CANARY_CLAIM_AFTER_RESTART_OUTPUT.pending"
  if ! (
    umask 077
    set -o noclobber
    psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
      -v claim_id="$CANARY_CLAIM_ID" \
      -v job_id="$CANARY_JOB_ID" \
      -v claim_generation="$CANARY_CLAIM_GENERATION" \
      -v restart_die_time_nano="$RESTART_DIE_TIME_NANO" \
      -Atc "
      SELECT COALESCE((
        SELECT json_build_object(
          'restartDieTimeNano', :'restart_die_time_nano'::numeric,
          'claimId', c.\"id\",
          'jobId', c.\"jobId\",
          'claimGeneration', c.\"claimGeneration\",
          'status', c.\"status\",
          'leaseExpiresAt', c.\"leaseExpiresAt\",
          'endedAt', c.\"endedAt\",
          'tokenInvalidatedAt', c.\"tokenInvalidatedAt\",
          'safeFailureCode', c.\"safeFailureCode\",
          'terminalReceiptId', c.\"terminalReceiptId\",
          'jobStatus', j.\"status\",
          'activeClaimId', j.\"activeClaimId\",
          'jobClaimGeneration', j.\"claimGeneration\",
          'invocationFailureCount', j.\"invocationFailureCount\",
          'nextAttemptAt', j.\"nextAttemptAt\",
          'jobTerminalReceiptId', j.\"terminalReceiptId\",
          'failureReceiptStatus', fr.\"status\",
          'failureReceiptOperationKind', fr.\"operationKind\",
          'failureReceiptFailureCode', fr.\"responseJson\"->>'failureCode',
          'failureReceiptCompletedAt', fr.\"completedAt\"
        )
        FROM \"AffiliateAgentGatewayClaims\" c
        JOIN \"AffiliateAgentGatewayJobs\" j
          ON j.\"id\" = c.\"jobId\"
        JOIN \"AffiliateAgentGatewayOperationReceipts\" fr
          ON fr.\"id\" = c.\"terminalReceiptId\"
        WHERE c.\"id\" = :'claim_id'
          AND c.\"jobId\" = :'job_id'
          AND c.\"claimGeneration\" = :'claim_generation'::integer
          AND c.\"status\" = 'FAILED'
          AND c.\"endedAt\" >= to_timestamp(:'restart_die_time_nano'::double precision / 1000000000.0)
          AND c.\"tokenInvalidatedAt\" >= to_timestamp(:'restart_die_time_nano'::double precision / 1000000000.0)
          AND c.\"safeFailureCode\" = 'PROCESS_CRASH'
          AND c.\"terminalReceiptId\" IS NOT NULL
          AND j.\"status\" = 'RETRY_WAIT'
          AND j.\"activeClaimId\" IS NULL
          AND j.\"claimGeneration\" = c.\"claimGeneration\"
          AND j.\"invocationFailureCount\" = 1
          AND j.\"terminalReceiptId\" = c.\"terminalReceiptId\"
          AND fr.\"claimId\" = c.\"id\"
          AND fr.\"jobId\" = c.\"jobId\"
          AND fr.\"claimGeneration\" = c.\"claimGeneration\"
          AND fr.\"status\" = 'SUCCEEDED'
          AND fr.\"operationKind\" = 'RECORD_FAILURE'
          AND fr.\"responseJson\"->>'failureCode' = 'PROCESS_CRASH'
          AND fr.\"completedAt\" >= to_timestamp(:'restart_die_time_nano'::double precision / 1000000000.0)
      ), '{}'::json);"
  ) > "$CANARY_CLAIM_AFTER_RESTART_OUTPUT.pending"; then
    rm -f "$CANARY_CLAIM_AFTER_RESTART_OUTPUT.pending"
    exit 1
  fi
  if jq -e '(.claimId | type == "string" and length > 0)' \
    "$CANARY_CLAIM_AFTER_RESTART_OUTPUT.pending" >/dev/null 2>&1; then
    mv "$CANARY_CLAIM_AFTER_RESTART_OUTPUT.pending" \
      "$CANARY_CLAIM_AFTER_RESTART_OUTPUT"
    break
  fi
  rm -f "$CANARY_CLAIM_AFTER_RESTART_OUTPUT.pending"
  sleep 1
done
test -s "$CANARY_CLAIM_AFTER_RESTART_OUTPUT"
jq -e \
  --arg claim "$CANARY_CLAIM_ID" \
  --arg job "$CANARY_JOB_ID" \
  --argjson generation "$CANARY_CLAIM_GENERATION" \
  --argjson die_time_nano "$RESTART_DIE_TIME_NANO" '
  .restartDieTimeNano == $die_time_nano
  and .claimId == $claim
  and .jobId == $job
  and .claimGeneration == $generation
  and .status == "FAILED"
  and (.leaseExpiresAt | type == "string" and length > 0)
  and (.endedAt | type == "string" and length > 0)
  and (.tokenInvalidatedAt | type == "string" and length > 0)
  and .safeFailureCode == "PROCESS_CRASH"
  and (.terminalReceiptId | type == "string" and length > 0)
  and .jobStatus == "RETRY_WAIT"
  and .activeClaimId == null
  and .jobClaimGeneration == $generation
  and .invocationFailureCount == 1
  and .jobTerminalReceiptId == .terminalReceiptId
  and .failureReceiptStatus == "SUCCEEDED"
  and .failureReceiptOperationKind == "RECORD_FAILURE"
  and .failureReceiptFailureCode == "PROCESS_CRASH"
  and (.failureReceiptCompletedAt | type == "string" and length > 0)
' "$CANARY_CLAIM_AFTER_RESTART_OUTPUT"
```

The supervisor's exact invocation reconciliation handles the canary's pending
external effect before recording `PROCESS_CRASH`; it is not an operator
reconciliation. The supported operator endpoint below is only a bounded,
idempotent sweep: it may examine zero receipts, does not resurrect this failed
claim, and must not be treated as proof that the canary receipt was completed.
Do not issue a new `/perform` request or construct a claim token:

```text
export GATEWAY_REPLAY_OUTPUT=/path/to/affiliate-governed-private/gateway-replay.redacted.json
test ! -e "$GATEWAY_REPLAY_OUTPUT"
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/reconcile", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN
  },
  body: JSON.stringify({limit: 1, reconcileBefore: new Date().toISOString()})
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || !body.result
      || !Number.isInteger(body.result.examinedReceipts)
      || body.result.examinedReceipts < 0
      || !Number.isInteger(body.result.recoveredReceipts)
      || body.result.recoveredReceipts < 0
      || !Number.isInteger(body.result.completedReceipts)
      || body.result.completedReceipts < 0
      || body.result.unresolvedReceipts !== 0
      || body.result.isAdmissionHalted !== false) {
    throw new Error(JSON.stringify(body));
  }
  console.log(JSON.stringify(body.result));
}).catch((error) => { console.error(error); process.exitCode = 1; });
' > "$GATEWAY_REPLAY_OUTPUT"
jq -e '
  (.examinedReceipts | type == "number" and floor == . and . >= 0)
  and (.recoveredReceipts | type == "number" and floor == . and . >= 0)
  and (.completedReceipts | type == "number" and floor == . and . >= 0)
  and .unresolvedReceipts == 0
  and .isAdmissionHalted == false
' "$GATEWAY_REPLAY_OUTPUT"
```

Read back the exact external receipt after the supervisor's restart
reconciliation. This read-only query must prove the same operation key,
external-operation key, claim generation, lineage cycle, cohort, source, and
coverage cell completed at or after the captured runner `die` event
(`timeNano`), while the pre-die receipt was `PENDING` and the original claim is
now terminal `FAILED` with `PROCESS_CRASH` and its job is waiting for retry:

```text
export CANARY_REPLAY_OUTPUT=/path/to/affiliate-governed-private/canary-replay-receipt.redacted.json
test ! -e "$CANARY_REPLAY_OUTPUT"
assert_reviewed_database_identity
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 -Atc \
  -v receipt_id="$CANARY_RECEIPT_ID" \
  -v idempotency_key="$CANARY_IDEMPOTENCY_KEY" \
  -v external_operation_key="$CANARY_EXTERNAL_OPERATION_KEY" \
  -v claim_id="$CANARY_CLAIM_ID" \
  -v job_id="$CANARY_JOB_ID" \
  -v claim_generation="$CANARY_CLAIM_GENERATION" \
  -v restart_die_time_nano="$RESTART_DIE_TIME_NANO" \
  -v session_id="$CUTOVER_SESSION_ID" \
  -v replay_run_id="$REPLAY_RUN_ID" \
  -v source_id="$CANARY_SOURCE_ID" \
  -v market_key="$CANARY_MARKET_KEY" \
  -v rollout_cohort="$CANARY_ROLLOUT_COHORT" \
  -v coverage_cell_id="$CANARY_COVERAGE_CELL_ID" \
  -v lineage_cycle_id="$CANARY_LINEAGE_CYCLE_ID" \
  "SELECT json_build_object(
    'cutoverSessionId', :'session_id',
    'replayRunId', :'replay_run_id',
    'restartDieTimeNano', :'restart_die_time_nano'::numeric,
    'receiptId', r.\"id\",
    'claimId', r.\"claimId\",
    'jobId', r.\"jobId\",
    'claimGeneration', r.\"claimGeneration\",
    'idempotencyKey', r.\"idempotencyKey\",
    'operationKind', r.\"operationKind\",
    'commandName', r.\"commandName\",
    'externalOperationKey', r.\"externalOperationKey\",
    'requestHash', r.\"requestHash\",
    'responseHash', r.\"responseHash\",
    'status', r.\"status\",
    'completedAt', r.\"completedAt\",
    'claimStatus', c.\"status\",
    'claimTerminalReceiptId', c.\"terminalReceiptId\",
    'claimEndedAt', c.\"endedAt\",
    'claimFailureCode', c.\"safeFailureCode\",
    'jobStatus', j.\"status\",
    'jobActiveClaimId', j.\"activeClaimId\",
    'jobClaimGeneration', j.\"claimGeneration\",
    'invocationFailureCount', j.\"invocationFailureCount\",
    'jobTerminalReceiptId', j.\"terminalReceiptId\",
    'role', j.\"role\",
    'sourceId', ss.\"id\",
    'marketKey', cc.\"marketKey\",
    'rolloutCohort', cc.\"cohort\",
    'coverageCellId', cc.\"id\",
    'lineageCycleId', ca.\"cycleKey\"
  )
  FROM \"AffiliateAgentGatewayOperationReceipts\" r
  JOIN \"AffiliateAgentGatewayJobs\" j ON j.\"id\" = r.\"jobId\"
  JOIN \"AffiliateAgentGatewayClaims\" c
    ON c.\"id\" = r.\"claimId\"
    AND c.\"jobId\" = r.\"jobId\"
    AND c.\"claimGeneration\" = r.\"claimGeneration\"
  JOIN \"AffiliateReplenishmentWaves\" w
    ON w.\"coveragePlanningJobId\" = j.\"id\"
   AND w.\"campaignId\" IS NOT NULL
  JOIN \"AffiliateReplenishmentDemands\" d
    ON d.\"id\" = w.\"demandId\"
   AND d.\"rolloutCohort\" = w.\"rolloutCohort\"
  JOIN \"AffiliateCoverageCells\" cc
    ON cc.\"id\" = d.\"targetKey\"
   AND cc.\"marketKey\" = d.\"marketKey\"
   AND cc.\"sportId\" = d.\"sportId\"
   AND cc.\"profileKey\" = d.\"sourceProfile\"
  JOIN \"AffiliateCoverageCellAssessments\" ca
    ON ca.\"cellId\" = cc.\"id\"
   AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
  JOIN \"AffiliateSourceDiscoveryCampaigns\" campaign
    ON campaign.\"id\" = w.\"campaignId\"
  JOIN \"AffiliateSupplySources\" ss
    ON ss.\"id\" = :'source_id'
   AND ss.\"rolloutCohort\" = cc.\"cohort\"
  JOIN \"AffiliateSupplyContractManifests\" cm
    ON cm.\"rolloutCohort\" = ss.\"rolloutCohort\"
   AND cm.\"version\" = ss.\"activeSupplyContractVersion\"
   AND cm.\"contractHash\" = ss.\"activeSupplyContractHash\"
   AND cm.\"status\" = 'ACTIVE'
  WHERE r.\"id\" = :'receipt_id'
    AND r.\"claimId\" = :'claim_id'
    AND r.\"jobId\" = :'job_id'
    AND r.\"claimGeneration\" = :'claim_generation'::integer
    AND r.\"idempotencyKey\" = :'idempotency_key'
    AND r.\"externalOperationKey\" = :'external_operation_key'
    AND r.\"operationKind\" = 'EXECUTE_COMMAND'
    AND r.\"commandName\" IN ('CAPTURE_CLAIM_URL', 'RUN_DISCOVERY_QUERY')
    AND r.\"status\" = 'SUCCEEDED'
    AND r.\"responseHash\" IS NOT NULL
    AND r.\"completedAt\" >= to_timestamp(:'restart_die_time_nano'::double precision / 1000000000.0)
    AND c.\"status\" = 'FAILED'
    AND c.\"terminalReceiptId\" IS NOT NULL
    AND c.\"safeFailureCode\" = 'PROCESS_CRASH'
    AND j.\"role\" = 'COVERAGE_PLANNER'
    AND j.\"supplySourceId\" IS NULL
    AND j.\"status\" = 'RETRY_WAIT'
    AND j.\"activeClaimId\" IS NULL
    AND j.\"claimGeneration\" = c.\"claimGeneration\"
    AND j.\"invocationFailureCount\" = 1
    AND j.\"terminalReceiptId\" = c.\"terminalReceiptId\"
    AND cc.\"marketKey\" = :'market_key'
    AND cc.\"cohort\" = :'rollout_cohort'
    AND cc.\"id\" = :'coverage_cell_id'
    AND ca.\"cycleKey\" = :'lineage_cycle_id';" > "$CANARY_REPLAY_OUTPUT"
jq -e \
  --arg session "$CUTOVER_SESSION_ID" \
  --arg replay "$REPLAY_RUN_ID" \
  --arg receipt "$CANARY_RECEIPT_ID" \
  --arg idempotency "$CANARY_IDEMPOTENCY_KEY" \
  --arg external "$CANARY_EXTERNAL_OPERATION_KEY" \
  --arg claim "$CANARY_CLAIM_ID" \
  --arg job "$CANARY_JOB_ID" \
  --arg source "$CANARY_SOURCE_ID" \
  --arg market "$CANARY_MARKET_KEY" \
  --arg cohort "$CANARY_ROLLOUT_COHORT" \
  --arg cell "$CANARY_COVERAGE_CELL_ID" \
  --arg cycle "$CANARY_LINEAGE_CYCLE_ID" \
  --argjson die_time_nano "$RESTART_DIE_TIME_NANO" '
  .restartDieTimeNano == $die_time_nano
  and .cutoverSessionId == $session
  and .replayRunId == $replay
  and .receiptId == $receipt
  and .claimId == $claim
  and .jobId == $job
  and (.claimGeneration | type == "number" and floor == . and . >= 0)
  and .idempotencyKey == $idempotency
  and .operationKind == "EXECUTE_COMMAND"
  and (.commandName == "CAPTURE_CLAIM_URL" or .commandName == "RUN_DISCOVERY_QUERY")
  and .externalOperationKey == $external
  and (.requestHash | type == "string" and test("^[a-fA-F0-9]{64}$"))
  and (.responseHash | type == "string" and test("^[a-fA-F0-9]{64}$"))
  and .status == "SUCCEEDED"
  and .claimStatus == "FAILED"
  and (.claimTerminalReceiptId | type == "string" and length > 0)
  and (.claimEndedAt | type == "string" and length > 0)
  and .claimFailureCode == "PROCESS_CRASH"
  and .jobStatus == "RETRY_WAIT"
  and .jobActiveClaimId == null
  and .jobClaimGeneration == .claimGeneration
  and .invocationFailureCount == 1
  and .jobTerminalReceiptId == .claimTerminalReceiptId
  and .role == "COVERAGE_PLANNER"
  and .sourceId == $source
  and .marketKey == $market
  and .rolloutCohort == $cohort
  and .coverageCellId == $cell
  and .lineageCycleId == $cycle
' "$CANARY_REPLAY_OUTPUT"
```

Hash the redacted restart artifacts after this observation; never hash or
retain the raw Docker event or inspection streams:

```text
(
  cd /path/to/affiliate-governed-private
  shasum -a 256 \
    governed-restart-policy.redacted.json \
    canary-claim-before-restart.redacted.json \
    canary-claim-after-restart.redacted.json \
    canary-receipt.redacted.json \
    gateway-replay.redacted.json \
    canary-replay-receipt.redacted.json \
    governed-restart-events.jsonl \
    governed-restart-recovery.redacted.json
) >> /path/to/affiliate-governed-private/deployment-evidence.sha256
```

The event and recovery artifacts are evidence only. A `die` followed by
`start`/`restart`, a running container, and the `unless-stopped` policy are
required before attempting the explicit replay gate below; they do not open
admission.

6. Keep admission closed. Before this production state change, obtain separate
   current authorization to execute exactly one idempotent replay for the same
   durable cutover session. Do not create a new session or nonce. Restore the
   protected nonce and reviewed hashes from the original APPLY:

```text
export APPLY_NONCE_FILE=/path/to/affiliate-governed-private/reconciliation-apply-nonce.txt
test -r "$APPLY_NONCE_FILE"
export APPLY_NONCE="$(cat "$APPLY_NONCE_FILE")"
test -n "$APPLY_NONCE"
export REPORT_HASH="$(jq -er '.reportHash' \
  /path/to/affiliate-governed-private/reconciliation-apply.json)"
export INPUT_HASH="$(jq -er '.inputHash' \
  /path/to/affiliate-governed-private/reconciliation-apply.json)"
export COUNTS_HASH="$(jq -er '.countsHash' \
  /path/to/affiliate-governed-private/reconciliation-apply.json)"
printf '%s\n' "$REPORT_HASH" "$INPUT_HASH" "$COUNTS_HASH" \
  | grep -Eq '^[a-fA-F0-9]{64}$'
```

Run the same session-bound APPLY once. Reusing the nonce, report, input,
counts, and session binding makes this an idempotent replay; never generate a
new nonce or session:

```text
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/reconciliation-replay.json
assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
assert_reviewed_database_identity
npm run --silent affiliate:cutover:reconcile -- --apply \
  --rollout-cohort=DEFAULT \
  --operator="$OPERATOR_ID" \
  --cutover-session-id="$CUTOVER_SESSION_ID" \
  --cutover-session-hash="$CUTOVER_SESSION_HASH" \
  --apply-nonce="$APPLY_NONCE" \
  --report-hash="$REPORT_HASH" \
  --input-hash="$INPUT_HASH" \
  --counts-json=/path/to/affiliate-governed-private/reviewed-counts.json \
  --counts-hash="$COUNTS_HASH" \
  --preflight=/path/to/affiliate-governed-private/preflight-report.json \
  > /path/to/affiliate-governed-private/reconciliation-replay.json
jq -e --arg report "$REPORT_HASH" --arg input "$INPUT_HASH" \
  --arg counts "$COUNTS_HASH" '
  .isApplied == true
  and .mode == "APPLY"
  and .reportHash == $report
  and .inputHash == $input
  and .countsHash == $counts
' /path/to/affiliate-governed-private/reconciliation-replay.json
```

Read back the durable reconciliation run by the reviewed report and input
hashes. This query is read-only and retains no database URL or credential:

```text
test ! -e /path/to/affiliate-governed-private/reconciliation-replay-run.redacted.json
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/reconciliation-replay-run.redacted.json
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 -Atc \
  "SELECT json_build_object(
    'id', \"id\",
    'cutoverSessionId', \"reportJson\"->>'cutoverSessionId',
    'mode', \"mode\",
    'status', \"status\",
    'rolloutCohort', \"rolloutCohort\",
    'inputHash', \"inputHash\",
    'reportHash', \"reportHash\",
    'appliedAt', \"appliedAt\",
    'appliedBy', \"appliedBy\"
  )
  FROM \"AffiliateSupplyReconciliationRuns\"
  WHERE \"rolloutCohort\" = 'DEFAULT'
    AND \"inputHash\" = '$INPUT_HASH'
    AND \"reportHash\" = '$REPORT_HASH'
    AND \"reportJson\"->>'cutoverSessionId' = '$CUTOVER_SESSION_ID'
  LIMIT 1;" \
  > /path/to/affiliate-governed-private/reconciliation-replay-run.redacted.json
jq -e --arg session "$CUTOVER_SESSION_ID" --arg report "$REPORT_HASH" --arg input "$INPUT_HASH" '
  (.id | type == "string" and length > 0)
  and .cutoverSessionId == $session
  and .mode == "APPLY"
  and .status == "APPLIED"
  and .inputHash == $input
  and .reportHash == $report
  and (.appliedAt | type == "string")
  and (.appliedBy | type == "string" and length > 0)
' /path/to/affiliate-governed-private/reconciliation-replay-run.redacted.json
export OBSERVED_REPLAY_RUN_ID="$(jq -er '.id' \
  /path/to/affiliate-governed-private/reconciliation-replay-run.redacted.json)"
test "$OBSERVED_REPLAY_RUN_ID" = "$REPLAY_RUN_ID"
```

Recover at most one pending gateway receipt in the bounded restart window.
This is one authorized gateway reconciliation pass, not a retry loop:

```text
export REPLAY_RECONCILE_BEFORE="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/gateway-replay-reconcile.redacted.json
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml exec -T \
  -e RECONCILE_BEFORE="$REPLAY_RECONCILE_BEFORE" \
  affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
const reconcileBefore = process.env.RECONCILE_BEFORE;
fetch("http://127.0.0.1:8080" + prefix + "/reconcile", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN
  },
  body: JSON.stringify({limit: 1, reconcileBefore})
}).then(async (response) => {
  const body = await response.json();
  const result = body.result;
  if (
    !response.ok
    || !result
    || result.isAdmissionHalted !== false
    || Number(result.examinedReceipts) < 0
    || Number(result.unresolvedReceipts) !== 0
  ) throw new Error(JSON.stringify(body));
  console.log(JSON.stringify(result));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'
  > /path/to/affiliate-governed-private/gateway-replay-reconcile.redacted.json
jq -e '
  .isAdmissionHalted == false
  and (.examinedReceipts | type == "number" and . >= 0)
  and .unresolvedReceipts == 0
' /path/to/affiliate-governed-private/gateway-replay-reconcile.redacted.json
```
The reconciliation pass may examine zero receipts when the gateway is clean and
idle. A non-zero examined count must have zero unresolved receipts. The later
fresh-claim replay receipt query must still find the observed successful
Coverage Planner replay linked to the original receipt; do not treat an idle
reconciliation result as that replay.

The runner restart consumed the original claim, so its `FAILED` claim and
`RETRY_WAIT` job must not be reused. Wait for normal retry admission; the
existing Coverage Planner supervisor must obtain a fresh claim and
`claimGeneration` for the same job. It may replay the observed operation with
the exact `CANARY_OPERATION_KIND` and `CANARY_IDEMPOTENCY_KEY`; the gateway
must link the new successful receipt to `CANARY_RECEIPT_ID`. Do not call
`/perform` with a hand-written token. The query below must find that
fresh-claim replay:

```text
export GATEWAY_REPLAY_RECEIPT_OUTPUT=/path/to/affiliate-governed-private/gateway-replay-receipt.redacted.json
test ! -e "$GATEWAY_REPLAY_RECEIPT_OUTPUT"
test ! -L "$GATEWAY_REPLAY_RECEIPT_OUTPUT"
test ! -e "$GATEWAY_REPLAY_RECEIPT_OUTPUT.pending"
test ! -L "$GATEWAY_REPLAY_RECEIPT_OUTPUT.pending"
export CANARY_REPLAY_DEADLINE_EPOCH="$(( $(date -u +%s) + 900 ))"
for canary_replay_attempt in $(seq 1 900); do
  test "$(date -u +%s)" -lt "$CANARY_REPLAY_DEADLINE_EPOCH" || break
  rm -f "$GATEWAY_REPLAY_RECEIPT_OUTPUT.pending"
  if ! (
    umask 077
    set -o noclobber
    psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
      -v cutover_session_id="$CUTOVER_SESSION_ID" \
      -v replay_run_id="$REPLAY_RUN_ID" \
      -v restart_die_time_nano="$RESTART_DIE_TIME_NANO" \
      -v replay_end="$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
      -v canary_receipt_id="$CANARY_RECEIPT_ID" \
      -v canary_claim_id="$CANARY_CLAIM_ID" \
      -v canary_job_id="$CANARY_JOB_ID" \
      -v canary_claim_generation="$CANARY_CLAIM_GENERATION" \
      -v canary_idempotency_key="$CANARY_IDEMPOTENCY_KEY" \
      -v canary_operation_kind="$CANARY_OPERATION_KIND" \
      -v canary_source_id="$CANARY_SOURCE_ID" \
      -v canary_market_key="$CANARY_MARKET_KEY" \
      -v canary_rollout_cohort="$CANARY_ROLLOUT_COHORT" \
      -v canary_coverage_cell_id="$CANARY_COVERAGE_CELL_ID" \
      -v canary_lineage_cycle_id="$CANARY_LINEAGE_CYCLE_ID" \
      -Atc \
      "SELECT json_build_object(
        'cutoverSessionId', :'cutover_session_id',
        'replayRunId', :'replay_run_id',
        'receiptId', r.\"id\",
        'claimId', r.\"claimId\",
        'jobId', r.\"jobId\",
        'claimGeneration', r.\"claimGeneration\",
        'idempotencyKey', r.\"idempotencyKey\",
        'operationKind', r.\"operationKind\",
        'commandName', r.\"commandName\",
        'externalOperationKey', r.\"externalOperationKey\",
        'replayedFromReceiptId', replay_event.\"payload\"->>'replayedFromReceiptId',
        'replayedFromExternalOperationKey', prior_receipt.\"externalOperationKey\",
        'requestHash', r.\"requestHash\",
        'sourceId', ss.\"id\",
        'marketKey', cc.\"marketKey\",
        'rolloutCohort', cc.\"cohort\",
        'coverageCellId', cc.\"id\",
        'lineageCycleId', ca.\"cycleKey\",
        'role', j.\"role\",
        'status', r.\"status\",
        'claimStatus', c.\"status\",
        'jobStatus', j.\"status\",
        'jobActiveClaimId', j.\"activeClaimId\",
        'jobClaimGeneration', j.\"claimGeneration\",
        'responseHash', r.\"responseHash\",
        'completedAt', r.\"completedAt\",
        'updatedAt', r.\"updatedAt\",
        'replayEventId', replay_event.\"id\"
      )
      FROM \"AffiliateAgentGatewayOperationReceipts\" r
      JOIN \"AffiliateAgentGatewayJobs\" j ON j.\"id\" = r.\"jobId\"
      JOIN \"AffiliateAgentGatewayClaims\" c
        ON c.\"id\" = r.\"claimId\"
        AND c.\"jobId\" = r.\"jobId\"
        AND c.\"claimGeneration\" = r.\"claimGeneration\"
      JOIN \"AffiliateAgentGatewayOperationReceipts\" prior_receipt
        ON prior_receipt.\"id\" = :'canary_receipt_id'
        AND prior_receipt.\"status\" = 'SUCCEEDED'
        AND prior_receipt.\"jobId\" = r.\"jobId\"
        AND prior_receipt.\"operationKind\" = r.\"operationKind\"
        AND prior_receipt.\"commandName\" = r.\"commandName\"
        AND prior_receipt.\"idempotencyKey\" = r.\"idempotencyKey\"
      JOIN \"AffiliateAgentGatewayEvents\" replay_event
        ON replay_event.\"id\" IS NOT NULL
        AND replay_event.\"receiptId\" = r.\"id\"
        AND replay_event.\"claimId\" = r.\"claimId\"
        AND replay_event.\"jobId\" = r.\"jobId\"
        AND replay_event.\"eventType\" = 'EXTERNAL_COMMAND_SUCCEEDED'
        AND replay_event.\"payload\"->>'replayedFromReceiptId' = prior_receipt.\"id\"
      JOIN \"AffiliateReplenishmentWaves\" w
        ON w.\"coveragePlanningJobId\" = j.\"id\"
       AND w.\"campaignId\" IS NOT NULL
      JOIN \"AffiliateReplenishmentDemands\" d
        ON d.\"id\" = w.\"demandId\"
      JOIN \"AffiliateCoverageCells\" cc
        ON cc.\"id\" = d.\"targetKey\"
       AND cc.\"marketKey\" = d.\"marketKey\"
       AND cc.\"sportId\" = d.\"sportId\"
       AND cc.\"profileKey\" = d.\"sourceProfile\"
      JOIN \"AffiliateCoverageCellAssessments\" ca
        ON ca.\"cellId\" = cc.\"id\"
       AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
      JOIN \"AffiliateSourceDiscoveryCampaigns\" campaign
        ON campaign.\"id\" = w.\"campaignId\"
      JOIN \"AffiliateSupplySources\" ss
        ON ss.\"id\" = :'canary_source_id'
       AND ss.\"rolloutCohort\" = cc.\"cohort\"
      JOIN \"AffiliateSupplyContractManifests\" cm
        ON cm.\"rolloutCohort\" = ss.\"rolloutCohort\"
       AND cm.\"version\" = ss.\"activeSupplyContractVersion\"
       AND cm.\"contractHash\" = ss.\"activeSupplyContractHash\"
       AND cm.\"status\" = 'ACTIVE'
      WHERE r.\"id\" <> :'canary_receipt_id'
        AND r.\"claimId\" <> :'canary_claim_id'
        AND r.\"jobId\" = :'canary_job_id'
        AND r.\"claimGeneration\" > :'canary_claim_generation'::integer
        AND r.\"idempotencyKey\" = :'canary_idempotency_key'
        AND r.\"operationKind\" = :'canary_operation_kind'
        AND r.\"status\" = 'SUCCEEDED'
        AND r.\"requestHash\" IS NOT NULL
        AND r.\"responseHash\" IS NOT NULL
        AND r.\"updatedAt\" >= to_timestamp(:'restart_die_time_nano'::double precision / 1000000000.0)
        AND r.\"updatedAt\" <= :'replay_end'::timestamptz
        AND j.\"role\" = 'COVERAGE_PLANNER'
        AND j.\"supplySourceId\" IS NULL
        AND j.\"claimGeneration\" = r.\"claimGeneration\"
        AND c.\"status\" IN ('ACTIVE', 'COMPLETED')
        AND cc.\"marketKey\" = :'canary_market_key'
        AND cc.\"cohort\" = :'canary_rollout_cohort'
        AND cc.\"id\" = :'canary_coverage_cell_id'
        AND ca.\"cycleKey\" = :'canary_lineage_cycle_id'
      ORDER BY r.\"updatedAt\" ASC, r.\"id\" ASC
      LIMIT 1;" > "$GATEWAY_REPLAY_RECEIPT_OUTPUT.pending"
  ); then
    rm -f "$GATEWAY_REPLAY_RECEIPT_OUTPUT.pending"
    exit 1
  fi
  if jq -e '(.receiptId | type == "string" and length > 0)' \
    "$GATEWAY_REPLAY_RECEIPT_OUTPUT.pending" >/dev/null 2>&1; then
    mv "$GATEWAY_REPLAY_RECEIPT_OUTPUT.pending" "$GATEWAY_REPLAY_RECEIPT_OUTPUT"
    break
  fi
  rm -f "$GATEWAY_REPLAY_RECEIPT_OUTPUT.pending"
  sleep 1
done
test -s "$GATEWAY_REPLAY_RECEIPT_OUTPUT"
export REPLAY_OBSERVATION_END="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
jq -e --arg session "$CUTOVER_SESSION_ID" --arg replay "$REPLAY_RUN_ID" \
  --arg receipt "$CANARY_RECEIPT_ID" --arg claim "$CANARY_CLAIM_ID" \
  --arg job "$CANARY_JOB_ID" --argjson generation "$CANARY_CLAIM_GENERATION" \
  --arg idempotency "$CANARY_IDEMPOTENCY_KEY" \
  --arg operation "$CANARY_OPERATION_KIND" \
  --arg external "$CANARY_EXTERNAL_OPERATION_KEY" \
  --arg source "$CANARY_SOURCE_ID" \
  --arg market "$CANARY_MARKET_KEY" \
  --arg cohort "$CANARY_ROLLOUT_COHORT" \
  --arg cell "$CANARY_COVERAGE_CELL_ID" \
  --arg cycle "$CANARY_LINEAGE_CYCLE_ID" '
  .cutoverSessionId == $session
  and .replayRunId == $replay
  and (.receiptId | type == "string" and length > 0 and . != $receipt)
  and (.claimId | type == "string" and length > 0 and . != $claim)
  and .jobId == $job
  and (.claimGeneration | type == "number" and floor == . and . > $generation)
  and .idempotencyKey == $idempotency
  and .operationKind == $operation
  and (.commandName == "CAPTURE_CLAIM_URL" or .commandName == "RUN_DISCOVERY_QUERY")
  and (.externalOperationKey == null)
  and .replayedFromReceiptId == $receipt
  and .replayedFromExternalOperationKey == $external
  and (.requestHash | type == "string" and test("^[a-fA-F0-9]{64}$"))
  and (.responseHash | type == "string" and test("^[a-fA-F0-9]{64}$"))
  and .sourceId == $source
  and .marketKey == $market
  and .rolloutCohort == $cohort
  and .coverageCellId == $cell
  and .lineageCycleId == $cycle
  and .role == "COVERAGE_PLANNER"
  and .status == "SUCCEEDED"
  and (.claimStatus == "ACTIVE" or .claimStatus == "COMPLETED")
  and (.jobStatus == "CLAIMED" or .jobStatus == "COMPLETED")
  and .jobClaimGeneration == .claimGeneration
  and (.replayEventId | type == "string" and length > 0)
' "$GATEWAY_REPLAY_RECEIPT_OUTPUT"
```

Before constructing the replay URL, bind the production observation cohort in
the reviewed operator shell. This value must exist before `set -u` evaluates
the dashboard query:

```text
export OBSERVATION_ROLLOUT_COHORT=REPLACE_WITH_REVIEWED_ROLLOUT_COHORT
assert_non_placeholder_identity "$OBSERVATION_ROLLOUT_COHORT" "OBSERVATION_ROLLOUT_COHORT"
```

Verify the same replay run in the authenticated operations projection and
record its deep link. The selected detail must resolve to the `APPLIED` run
and the cutover table must contain the matching report hash:

```text
test -r "$ADMIN_COOKIE_FILE"
export DASHBOARD_REPLAY_QUERY="$(
  jq -rn \
    --arg base "$DASHBOARD_BASE_URL" \
    --arg id "$REPLAY_RUN_ID" \
    --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
    --arg version "$ACTIVE_SUPPLY_CONTRACT_VERSION" \
    '$base + "/api/admin/affiliate-operations?view=cutover&page=1&pageSize=50"
     + "&rolloutCohort=" + ($cohort | @uri)
     + "&contractVersion=" + ($version | @uri)
     + "&selectedType=reconciliationRun&selected=" + ($id | @uri)'
)"
export DASHBOARD_REPLAY_OUTPUT=/path/to/affiliate-governed-private/affiliate-operations-replay.json
install -m 0600 /dev/null "$DASHBOARD_REPLAY_OUTPUT"
curl --fail --silent --show-error \
  --cookie "$ADMIN_COOKIE_FILE" \
  "$DASHBOARD_REPLAY_QUERY" \
  > "$DASHBOARD_REPLAY_OUTPUT"
jq -e --arg id "$REPLAY_RUN_ID" \
  --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
  --arg version "$ACTIVE_SUPPLY_CONTRACT_VERSION" '
  .schemaVersion == 2
  and .view == "cutover"
  and .selected.id == $id
  and .selected.kind == "reconciliationRun"
  and .selected.status == "APPLIED"
  and .contract.rolloutCohort == $cohort
  and .contract.contractVersion == ($version | tonumber)
  and (.selected.href | type == "string" and length > 0)
  and (.selected.href | contains("selected=" + ($id | @uri)))
  and (.selected.href | contains("rolloutCohort=" + ($cohort | @uri)))
  and (.selected.href | contains("contractVersion=" + ($version | @uri)))
' "$DASHBOARD_REPLAY_OUTPUT"
export DASHBOARD_REPLAY_DEEP_LINK="$(
  jq -er --arg id "$REPLAY_RUN_ID" \
    --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
    --arg version "$ACTIVE_SUPPLY_CONTRACT_VERSION" \
    '.selected.href
     | select(contains("selected=" + ($id | @uri)))
     | select(contains("rolloutCohort=" + ($cohort | @uri)))
     | select(contains("contractVersion=" + ($version | @uri)))' \
    "$DASHBOARD_REPLAY_OUTPUT"
)"
export DASHBOARD_REPLAY_DEEP_LINK_FILE=/path/to/affiliate-governed-private/affiliate-operations-replay.deep-link.txt
install -m 0600 /dev/null "$DASHBOARD_REPLAY_DEEP_LINK_FILE"
printf '%s\n' "$DASHBOARD_REPLAY_DEEP_LINK" \
  > "$DASHBOARD_REPLAY_DEEP_LINK_FILE"
jq -e --arg deep_link "$DASHBOARD_REPLAY_DEEP_LINK" '
  .selected.href == $deep_link
' "$DASHBOARD_REPLAY_OUTPUT"
```

If the replay result, durable run, successful gateway receipt, or matching
dashboard/deep link is missing, stop: do not run `admission/open`; keep
admission closed and escalate through the production operator procedure. These
checks are required external production evidence, not local proof.

Hash the replay, receipt, and dashboard evidence before admission opens. Do not
hash the protected nonce file:

```text
(
  cd /path/to/affiliate-governed-private
  shasum -a 256 \
    reconciliation-replay.json \
    reconciliation-replay-run.redacted.json \
    gateway-replay-reconcile.redacted.json \
    gateway-replay-receipt.redacted.json \
    affiliate-operations-replay.json \
    affiliate-operations-replay.deep-link.txt
) >> /path/to/affiliate-governed-private/deployment-evidence.sha256
```

## Open bounded production observation admission

Open separate, role-specific production observation windows only after the
restart, replay, receipt, and dashboard gates pass. Obtain separate current
authorization for every window. Each readiness-gated lease permits exactly one
claim for the requested worker and expires at the returned deadline. There is
no global admission window: the gateway must report closed before each bounded
lease, and the lease is closed after one matching successful claim/receipt is
observed. Mapping Producer and Supply Reviewer windows use the same
`POST /admission/open` shape `(role,workerId,roleCredential,leaseSeconds)`.
Admission must be closed before this section and must close on every success,
failure, or shell exit:

```text
set -Eeuo pipefail
assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
export OBSERVATION_SUPPLY_SOURCE_ID=REPLACE_WITH_REVIEWED_SUPPLY_SOURCE_ID
export OBSERVATION_MARKET_KEY=REPLACE_WITH_REVIEWED_MARKET_KEY
export OBSERVATION_COVERAGE_CELL_ID=REPLACE_WITH_REVIEWED_COVERAGE_CELL_ID
export OBSERVATION_ASSESSMENT_CYCLE_ID=REPLACE_WITH_REVIEWED_ASSESSMENT_CYCLE_ID
assert_non_placeholder_identity "$OBSERVATION_ROLLOUT_COHORT" "OBSERVATION_ROLLOUT_COHORT"
assert_non_placeholder_identity "$OBSERVATION_SUPPLY_SOURCE_ID" "OBSERVATION_SUPPLY_SOURCE_ID"
assert_non_placeholder_identity "$OBSERVATION_MARKET_KEY" "OBSERVATION_MARKET_KEY"
assert_non_placeholder_identity "$OBSERVATION_COVERAGE_CELL_ID" "OBSERVATION_COVERAGE_CELL_ID"
assert_non_placeholder_identity "$OBSERVATION_ASSESSMENT_CYCLE_ID" "OBSERVATION_ASSESSMENT_CYCLE_ID"
export OBSERVATION_ADMISSION_OPEN=0
export OBSERVATION_EVIDENCE_START=""
export OBSERVATION_EVIDENCE_END=""
close_claim_observation_admission() {
  if test "${OBSERVATION_ADMISSION_OPEN:-0}" = "1"; then
    if docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
      -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/admission/close", {
  method: "POST",
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "closed" || body.open !== false
      || Object.keys(body).sort().join(",") !== "open,status") throw new Error(JSON.stringify(body));
  console.log(JSON.stringify(body));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'; then
      :
    else
      export OBSERVATION_ADMISSION_CLOSE_FAILED=1
      return 1
    fi
    export OBSERVATION_ADMISSION_OPEN=0
    export OBSERVATION_ADMISSION_END="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  fi
}
trap close_claim_observation_admission EXIT INT TERM
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/admission", {
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "closed" || body.open !== false
      || Object.keys(body).sort().join(",") !== "open,status") throw new Error(JSON.stringify(body));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'
export OBSERVATION_WINDOW_TAG="$(date -u '+%Y%m%dT%H%M%SZ')-$$"
open_role_observation_admission() {
  local role="$1"
  local worker_id="$2"
  local credential_env="$3"
  local lease_output="$4"
  case "$role/$worker_id/$credential_env" in
    MAPPING_PRODUCER/mapping-producer-1/AFFILIATE_MAPPING_PRODUCER_1_CREDENTIAL|\
    MAPPING_PRODUCER/mapping-producer-2/AFFILIATE_MAPPING_PRODUCER_2_CREDENTIAL|\
    SUPPLY_REVIEWER/supply-reviewer-1/AFFILIATE_SUPPLY_REVIEWER_1_CREDENTIAL|\
    SUPPLY_REVIEWER/supply-reviewer-2/AFFILIATE_SUPPLY_REVIEWER_2_CREDENTIAL) ;;
    *) printf '%s\n' "Refusing an unreviewed downstream role/worker credential binding." >&2; return 1 ;;
  esac
  test "${OBSERVATION_ADMISSION_OPEN:-0}" = "0"
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/admission", {
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "closed" || body.open !== false
      || Object.keys(body).sort().join(",") !== "open,status") throw new Error(JSON.stringify(body));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml exec -T affiliate-gateway node -e '
const [requestedRole, requestedWorkerId] = process.argv.slice(1);
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
const readinessUrl = "http://127.0.0.1:8080" + prefix + "/readiness?role="
  + encodeURIComponent(requestedRole) + "&workerId=" + encodeURIComponent(requestedWorkerId);
fetch(readinessUrl, {
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "ready" || body.ready !== true
      || Object.keys(body).sort().join(",") !== "ready,status") {
    throw new Error(JSON.stringify(body));
  }
}).catch((error) => { console.error(error); process.exitCode = 1; });
' "$role" "$worker_id"
  export OBSERVATION_ADMISSION_OPEN=1
  test ! -e "$lease_output"
  test ! -L "$lease_output"
  if ! (
    umask 077
    set -o noclobber
    docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
      -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
const [role, workerId, credentialEnv] = process.argv.slice(1);
const roleCredential = process.env[credentialEnv];
if (!roleCredential) throw new Error("reviewed role credential is unavailable");
fetch("http://127.0.0.1:8080" + prefix + "/admission/open", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN
  },
  body: JSON.stringify({role, workerId, roleCredential, leaseSeconds: 120})
}).then(async (response) => {
  const body = await response.json();
  const lease = body.lease;
  if (!response.ok || body.status !== "open" || body.open !== true
      || !lease || lease.role !== role || lease.workerId !== workerId
      || lease.remainingClaims !== 1 || Date.parse(lease.expiresAt || "") <= Date.now()) {
    throw new Error(JSON.stringify(body));
  }
  console.log(JSON.stringify({
    status: body.status,
    open: body.open,
    lease: {
      role: lease.role,
      workerId: lease.workerId,
      expiresAt: lease.expiresAt,
      remainingClaims: lease.remainingClaims
    }
  }));
}).catch((error) => { console.error(error); process.exitCode = 1; });
' "$role" "$worker_id" "$credential_env" > "$lease_output"
  ); then
    rm -f "$lease_output"
    return 1
  fi
  jq -e --arg role "$role" --arg worker "$worker_id" '
    .status == "open" and .open == true
    and .lease.role == $role and .lease.workerId == $worker
    and .lease.remainingClaims == 1
    and (.lease.expiresAt | type == "string" and length > 0)
  ' "$lease_output"
  export OBSERVATION_ADMISSION_OPEN=1
}
wait_for_role_observation_completion() {
  local role="$1"
  local worker_id="$2"
  local lease_expires_at="$3"
  local receipt_output="$4"
  local lease_deadline_epoch
  if ! lease_deadline_epoch="$(date -u -d "$lease_expires_at" +%s)"; then
    printf '%s\n' "The role lease expiration is not a valid UTC timestamp." >&2
    return 1
  fi
  case "$lease_deadline_epoch" in
    ''|*[!0-9]*) printf '%s\n' "The role lease expiration did not resolve to an epoch." >&2; return 1 ;;
  esac
  while test "$(date -u +%s)" -lt "$lease_deadline_epoch"; do
    if psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
      -v role="$role" \
      -v worker_id="$worker_id" \
      -v session_id="$CUTOVER_SESSION_ID" \
      -v market_key="$OBSERVATION_MARKET_KEY" \
      -v rollout_cohort="$OBSERVATION_ROLLOUT_COHORT" \
      -v coverage_cell_id="$OBSERVATION_COVERAGE_CELL_ID" \
      -v assessment_cycle_id="$OBSERVATION_ASSESSMENT_CYCLE_ID" \
      -v observation_start="$OBSERVATION_ADMISSION_START" \
      -v lease_expires_at="$lease_expires_at" \
      -Atc '
        WITH session_scope AS (
          SELECT 1
          FROM "AffiliateSupplyReconciliationRuns" session
          WHERE session."id" = :'session_id'
            AND session."mode" = 'CUTOVER_SESSION'
        ),
        role_lineage AS (
            SELECT
              j."id" AS job_id,
              ss."id" AS source_id,
              cc."marketKey" AS market_key,
              ss."rolloutCohort" AS rollout_cohort,
              cc."id" AS coverage_cell_id,
              ca."cycleKey" AS assessment_cycle_id
          FROM "AffiliateAgentGatewayJobs" j
          LEFT JOIN "AffiliateSourceMappingJobs" mapping_job
            ON mapping_job."id" = j."subjectJson"->>'mappingJobId'
          LEFT JOIN "AffiliateScrapeSources" scrape_source
            ON scrape_source."id" = mapping_job."sourceId"
          JOIN "AffiliateSupplySources" ss
            ON ss."id" = CASE
              WHEN j."role" = 'MAPPING_PRODUCER'
                THEN scrape_source."supplySourceId"
              ELSE j."supplySourceId"
            END
           AND ss."rolloutCohort" = :'rollout_cohort'
          JOIN "AffiliateSupplyTargets" target
            ON target."supplySourceId" = ss."id"
           AND target."status" = 'PUBLISHED'
          JOIN "AffiliateReplenishmentDemands" demand
            ON demand."marketKey" = target."marketKey"
           AND demand."sportId" = target."sportId"
           AND demand."sourceProfile" = target."sourceProfile"
           AND demand."rolloutCohort" = ss."rolloutCohort"
          JOIN "AffiliateCoverageCells" cc
            ON cc."id" = demand."targetKey"
           AND cc."marketKey" = demand."marketKey"
           AND cc."sportId" = demand."sportId"
           AND cc."profileKey" = demand."sourceProfile"
          JOIN "AffiliateReplenishmentWaves" wave
            ON wave."demandId" = demand."id"
           AND wave."rolloutCohort" = demand."rolloutCohort"
          JOIN "AffiliateCoverageCellAssessments" ca
            ON ca."cellId" = cc."id"
           AND ca."cycleKey" = demand."id" || ':generation:' || wave."demandGeneration"
          JOIN "AffiliateSourceDiscoveryCampaigns" campaign
            ON campaign."id" = wave."campaignId"
          JOIN "AffiliateSourceDiscoveryRuns" discovery_run
            ON discovery_run."campaignId" = campaign."id"
           AND discovery_run."status" IN ('SUCCEEDED', 'PARTIAL')
          JOIN "AffiliateSourceDiscoveryQueryExecutions" discovery_query
            ON discovery_query."runId" = discovery_run."id"
           AND discovery_query."campaignId" = campaign."id"
           AND discovery_query."status" IN ('SUCCEEDED', 'PARTIAL')
           AND discovery_query."sportId" = cc."sportId"
           AND discovery_query."profileKey" = cc."profileKey"
          JOIN "AffiliateCoverageCities" city
            ON city."id" = cc."cityId"
           AND city."placeGeoid" = discovery_query."cityGeoid"
          JOIN "AffiliateSourceDiscoveryResults" discovery_result
            ON discovery_result."campaignId" = campaign."id"
           AND discovery_result."latestRunId" = discovery_run."id"
           AND discovery_result."supplySourceId" = ss."id"
          JOIN "AffiliateSupplyContractManifests" contract_manifest
            ON contract_manifest."rolloutCohort" = ss."rolloutCohort"
           AND contract_manifest."version" = ss."activeSupplyContractVersion"
           AND contract_manifest."contractHash" = ss."activeSupplyContractHash"
           AND contract_manifest."status" = 'ACTIVE'
          CROSS JOIN session_scope
          WHERE j."role" = :'role'
            AND (
              j."role" = 'MAPPING_PRODUCER'
              OR j."supplySourceId" = ss."id"
            )
            AND demand."marketKey" = :'market_key'
            AND cc."id" = :'coverage_cell_id'
            AND ca."cycleKey" = :'assessment_cycle_id'
            AND (
              j."role" <> 'MAPPING_PRODUCER'
              OR (
                mapping_job."id" IS NOT NULL
                AND mapping_job."sourceId" = scrape_source."id"
                AND scrape_source."supplySourceId" = ss."id"
              )
            )
        )
        SELECT json_build_object(
          '\''claimCount'\'', COUNT(DISTINCT c."id"),
          '\''lineageCount'\'', COUNT(DISTINCT (
            lineage.job_id,
            lineage.source_id,
            lineage.coverage_cell_id,
            lineage.assessment_cycle_id
          )),
          '\''terminalReceiptCount'\'', COUNT(DISTINCT r."id"),
          '\''lifecycleGeneration'\'', MIN(c."lifecycleGeneration"),
          '\''transitionGeneration'\'', MIN(lifecycle_transition."generation"),
          '\''claimId'\'', MIN(c."id"),
          '\''receiptId'\'', MIN(r."id"),
          '\''jobId'\'', MIN(j."id"),
          '\''role'\'', MIN(c."role"),
          '\''workerId'\'', MIN(c."workerId"),
          '\''claimGeneration'\'', MIN(c."claimGeneration"),
          '\''claimLifecycleGeneration'\'', MIN(c."lifecycleGeneration"),
          '\''claimStatus'\'', MIN(c."status"::text),
          '\''leaseExpiresAt'\'', MIN(c."leaseExpiresAt"),
          '\''receiptStatus'\'', MIN(r."status"::text),
          '\''completedAt'\'', MIN(r."completedAt"),
          '\''sourceId'\'', MIN(lineage.source_id),
          '\''marketKey'\'', MIN(lineage.market_key),
          '\''rolloutCohort'\'', MIN(lineage.rollout_cohort),
          '\''coverageCellId'\'', MIN(lineage.coverage_cell_id),
          '\''assessmentCycleId'\'', MIN(lineage.assessment_cycle_id)
        )
        FROM "AffiliateAgentGatewayClaims" c
        JOIN "AffiliateAgentGatewayJobs" j ON j."id" = c."jobId"
        JOIN role_lineage lineage ON lineage.job_id = j."id"
        JOIN "AffiliateAgentGatewayOperationReceipts" r
          ON r."claimId" = c."id"
         AND r."jobId" = j."id"
         AND r."claimGeneration" = c."claimGeneration"
        JOIN "AffiliateAgentGatewayOperationReceipts" lifecycle_receipt
          ON lifecycle_receipt."claimId" = c."id"
         AND lifecycle_receipt."jobId" = j."id"
         AND lifecycle_receipt."claimGeneration" = c."claimGeneration"
         AND lifecycle_receipt."status" = 'SUCCEEDED'
         AND lifecycle_receipt."completedAt" IS NOT NULL
         AND (
           (
             c."role" = 'MAPPING_PRODUCER'
             AND lifecycle_receipt."operationKind" = 'EXECUTE_COMMAND'
             AND lifecycle_receipt."commandName" = 'COMMIT_DECLARATIVE_PACKAGE'
           )
           OR (
             c."role" = 'SUPPLY_REVIEWER'
             AND lifecycle_receipt."operationKind" = 'TERMINAL_EFFECT'
             AND lifecycle_receipt."commandName" = 'SUPPLY_REVIEWER_TERMINAL_EFFECT'
           )
         )
        JOIN "AffiliateSupplyLifecycleTransitions" lifecycle_transition
          ON lifecycle_transition."supplySourceId" = lineage.source_id
         AND lifecycle_transition."generation" = c."lifecycleGeneration" + 1
         AND lifecycle_transition."commandRef" = lifecycle_receipt."id"
         AND lifecycle_transition."idempotencyKey" = lifecycle_receipt."id"
         AND lifecycle_transition."actorKind"::text = c."role"
         AND lifecycle_transition."actorId" = c."workerId"
         AND lifecycle_transition."executingAgentId" = c."invocationId"
         AND (
           (
             c."role" = 'MAPPING_PRODUCER'
             AND lifecycle_transition."command" = 'RECORD_MAPPING'
           )
           OR (
             c."role" = 'SUPPLY_REVIEWER'
             AND lifecycle_transition."command"::text =
               lifecycle_receipt."responseJson"->'safeOutput'->>'command'
           )
         )
         AND c."lifecycleGeneration" IS NOT NULL
         AND c."lifecycleGeneration" = j."expectedLifecycleGeneration"
        WHERE c."role" = :'role'
          AND j."role" = :'role'
          AND c."workerId" = :'worker_id'
          AND c."claimedAt" >= :'observation_start'::timestamptz
          AND CURRENT_TIMESTAMP < :'lease_expires_at'::timestamptz
          AND c."status" = 'COMPLETED'
          AND r."status" = 'SUCCEEDED'
          AND r."operationKind" = 'SUBMIT_RESULT'
          AND r."completedAt" IS NOT NULL;
      ' > "$receipt_output" \
      && jq -e \
        --arg expected_role "$role" \
        --arg expected_worker "$worker_id" \
        --arg expected_source "$OBSERVATION_SUPPLY_SOURCE_ID" \
        --arg expected_market "$OBSERVATION_MARKET_KEY" \
        --arg expected_cohort "$OBSERVATION_ROLLOUT_COHORT" \
        --arg expected_cell "$OBSERVATION_COVERAGE_CELL_ID" \
        --arg expected_cycle "$OBSERVATION_ASSESSMENT_CYCLE_ID" '
        .claimCount == 1 and .terminalReceiptCount == 1
        and .lineageCount == 1
        and .role == $expected_role
        and .workerId == $expected_worker
        and (.claimId | type == "string" and length > 0)
        and (.receiptId | type == "string" and length > 0)
        and (.jobId | type == "string" and length > 0)
        and (.claimGeneration | type == "number" and floor == . and . >= 0)
        and (.claimLifecycleGeneration | type == "number" and floor == . and . >= 0)
        and (.transitionGeneration | type == "number" and floor == . and . == (.claimLifecycleGeneration + 1))
        and .claimStatus == "COMPLETED"
        and .receiptStatus == "SUCCEEDED"
        and (.leaseExpiresAt | type == "string" and length > 0)
        and (.completedAt | type == "string" and length > 0)
        and .sourceId == $expected_source
        and .marketKey == $expected_market
        and .rolloutCohort == $expected_cohort
        and .coverageCellId == $expected_cell
        and .assessmentCycleId == $expected_cycle
      ' "$receipt_output"; then
      return 0
    fi
    sleep 1
  done
  printf '%s\n' "No bounded downstream claim completed before its lease deadline." >&2
  return 1
}
run_role_observation_window() {
  local role="$1"
  local worker_id="$2"
  local credential_env="$3"
  local lease_output="/path/to/affiliate-governed-private/${role}.${worker_id}.lease.json"
  local receipt_output="/path/to/affiliate-governed-private/${role}.${worker_id}.receipt.json"
  export OBSERVATION_ADMISSION_START="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  if test -z "${OBSERVATION_EVIDENCE_START:-}"; then
    export OBSERVATION_EVIDENCE_START="$OBSERVATION_ADMISSION_START"
  fi
  open_role_observation_admission "$role" "$worker_id" "$credential_env" "$lease_output"
  export OBSERVATION_ROLE_LEASE_EXPIRES_AT="$(jq -er '.lease.expiresAt' "$lease_output")"
  wait_for_role_observation_completion \
    "$role" "$worker_id" "$OBSERVATION_ROLE_LEASE_EXPIRES_AT" "$receipt_output"
  close_claim_observation_admission
  test "$OBSERVATION_ADMISSION_OPEN" = "0"
  test -n "$OBSERVATION_ADMISSION_END"
  export OBSERVATION_EVIDENCE_END="$OBSERVATION_ADMISSION_END"
}
run_role_observation_window MAPPING_PRODUCER mapping-producer-1 AFFILIATE_MAPPING_PRODUCER_1_CREDENTIAL
run_role_observation_window MAPPING_PRODUCER mapping-producer-2 AFFILIATE_MAPPING_PRODUCER_2_CREDENTIAL
run_role_observation_window SUPPLY_REVIEWER supply-reviewer-1 AFFILIATE_SUPPLY_REVIEWER_1_CREDENTIAL
run_role_observation_window SUPPLY_REVIEWER supply-reviewer-2 AFFILIATE_SUPPLY_REVIEWER_2_CREDENTIAL
export OBSERVATION_ADMISSION_START="$OBSERVATION_EVIDENCE_START"
export OBSERVATION_ADMISSION_END="$OBSERVATION_EVIDENCE_END"
trap - EXIT INT TERM
test "${OBSERVATION_ADMISSION_OPEN:-0}" = "0"
```

All four bounded role windows are closed before the SQL readbacks below.
`OBSERVATION_ADMISSION_START` and `OBSERVATION_ADMISSION_END` are the
aggregate interval from the first role lease through the last role lease;
each role receipt also records its own worker and claim interval. Every
readback remains constrained to that aggregate interval and the reviewed
tuple. Do not reopen admission for evidence collection or reuse a role
credential as proof that a different worker completed a claim.

Admission remains closed before this section. All SQL readbacks below are
read-only post-close queries. Do not reopen admission for evidence collection
or reuse the final admission authorization as proof that the fleet is ready
for an unbounded rollout.

The evidence gates below still require every observed happy path, retry,
denial, provider-containment outcome, alert delivery, exception event, and
no-digest check to pass before final admission.

### Happy path and lineage

The successful Coverage Planner receipt from the bounded replay is the minimum
happy-path receipt. It must have a complete lineage tuple and a matching
operations projection:

```text
jq -e \
  --arg source "$OBSERVATION_SUPPLY_SOURCE_ID" \
  --arg market "$OBSERVATION_MARKET_KEY" \
  --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
  --arg cell "$OBSERVATION_COVERAGE_CELL_ID" \
  --arg cycle "$OBSERVATION_ASSESSMENT_CYCLE_ID" '
  (.receiptId | type == "string" and length > 0)
  and (.jobId | type == "string" and length > 0)
  and (.claimGeneration | type == "number" and . >= 0)
  and (.idempotencyKey | type == "string" and length > 0)
  and (.operationKind | type == "string" and length > 0)
  and .status == "SUCCEEDED"
  and (.responseHash | type == "string" and test("^[a-fA-F0-9]{64}$"))
  and (.completedAt | type == "string" and length > 0)
  and .sourceId == $source
  and .marketKey == $market
  and .rolloutCohort == $cohort
  and .coverageCellId == $cell
  and .lineageCycleId == $cycle
' /path/to/affiliate-governed-private/gateway-replay-receipt.redacted.json
jq -e --arg id "$REPLAY_RUN_ID" --arg report "$REPORT_HASH" '
  .selected.id == $id
  and .selected.status == "APPLIED"
  and any(.cutover.rows[]?; .id == $id and .reportHash == $report)
' /path/to/affiliate-governed-private/affiliate-operations-replay.json
```

The observed chain must be explicit and same-lineage: discovery run and query
execution → discovery result → intake capture run and artifact → mapping job
and mapping package → independent approval job → activation transition →
published target and publication transition. Populate these IDs from the
durable rows; never invent an ID or use a timestamp to bridge a missing stage:

```text
export LINEAGE_DISCOVERY_RUN_ID=REPLACE_WITH_REVIEWED_DISCOVERY_RUN_ID
export LINEAGE_DISCOVERY_QUERY_ID=REPLACE_WITH_REVIEWED_DISCOVERY_QUERY_ID
export LINEAGE_DISCOVERY_RESULT_ID=REPLACE_WITH_REVIEWED_DISCOVERY_RESULT_ID
export LINEAGE_INTAKE_ID=REPLACE_WITH_REVIEWED_INTAKE_ID
export LINEAGE_CAPTURE_RUN_ID=REPLACE_WITH_REVIEWED_INTAKE_CAPTURE_RUN_ID
export LINEAGE_CAPTURE_ARTIFACT_ID=REPLACE_WITH_REVIEWED_CAPTURE_ARTIFACT_ID
export LINEAGE_MAPPING_JOB_ID=REPLACE_WITH_REVIEWED_MAPPING_JOB_ID
export LINEAGE_MAPPING_ID=REPLACE_WITH_REVIEWED_MAPPING_ID
export LINEAGE_APPROVAL_JOB_ID=REPLACE_WITH_REVIEWED_APPROVAL_JOB_ID
export LINEAGE_ACTIVATION_TRANSITION_ID=REPLACE_WITH_REVIEWED_ACTIVATION_TRANSITION_ID
export LINEAGE_TARGET_ID=REPLACE_WITH_REVIEWED_PUBLISHED_TARGET_ID
export LINEAGE_PUBLICATION_TRANSITION_ID=REPLACE_WITH_REVIEWED_PUBLICATION_TRANSITION_ID
export LINEAGE_GATEWAY_JOB_ID="$CANARY_JOB_ID"
export LINEAGE_PRODUCER_ID=REPLACE_WITH_REVIEWED_MAPPING_PRODUCER_ID
export LINEAGE_REVIEWER_ID=REPLACE_WITH_REVIEWED_SUPPLY_REVIEWER_ID
for lineage_name in \
  LINEAGE_DISCOVERY_RUN_ID LINEAGE_DISCOVERY_QUERY_ID \
  LINEAGE_DISCOVERY_RESULT_ID LINEAGE_INTAKE_ID LINEAGE_CAPTURE_RUN_ID \
  LINEAGE_CAPTURE_ARTIFACT_ID LINEAGE_MAPPING_JOB_ID LINEAGE_MAPPING_ID \
  LINEAGE_APPROVAL_JOB_ID LINEAGE_ACTIVATION_TRANSITION_ID LINEAGE_TARGET_ID \
  LINEAGE_PUBLICATION_TRANSITION_ID LINEAGE_GATEWAY_JOB_ID \
  LINEAGE_PRODUCER_ID LINEAGE_REVIEWER_ID; do
  assert_non_placeholder_identity "${!lineage_name}" "$lineage_name"
done
test "$LINEAGE_PRODUCER_ID" != "$LINEAGE_REVIEWER_ID"
export LINEAGE_OUTPUT=/path/to/affiliate-governed-private/lineage-chain.redacted.json
install -m 0600 /dev/null "$LINEAGE_OUTPUT"
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  -v cutover_session_id="$CUTOVER_SESSION_ID" \
  -v source_id="$OBSERVATION_SUPPLY_SOURCE_ID" \
  -v market_key="$OBSERVATION_MARKET_KEY" \
  -v rollout_cohort="$OBSERVATION_ROLLOUT_COHORT" \
  -v coverage_cell_id="$OBSERVATION_COVERAGE_CELL_ID" \
  -v assessment_cycle_id="$OBSERVATION_ASSESSMENT_CYCLE_ID" \
  -v discovery_run_id="$LINEAGE_DISCOVERY_RUN_ID" \
  -v discovery_query_id="$LINEAGE_DISCOVERY_QUERY_ID" \
  -v discovery_result_id="$LINEAGE_DISCOVERY_RESULT_ID" \
  -v intake_id="$LINEAGE_INTAKE_ID" \
  -v capture_run_id="$LINEAGE_CAPTURE_RUN_ID" \
  -v capture_artifact_id="$LINEAGE_CAPTURE_ARTIFACT_ID" \
  -v mapping_job_id="$LINEAGE_MAPPING_JOB_ID" \
  -v mapping_id="$LINEAGE_MAPPING_ID" \
  -v approval_job_id="$LINEAGE_APPROVAL_JOB_ID" \
  -v activation_transition_id="$LINEAGE_ACTIVATION_TRANSITION_ID" \
  -v target_id="$LINEAGE_TARGET_ID" \
  -v publication_transition_id="$LINEAGE_PUBLICATION_TRANSITION_ID" \
  -v gateway_job_id="$LINEAGE_GATEWAY_JOB_ID" \
  -v producer_id="$LINEAGE_PRODUCER_ID" \
  -v reviewer_id="$LINEAGE_REVIEWER_ID" \
  -Atc "
WITH lineage_scope AS (
  SELECT
    session.\"id\" AS cutover_session_id,
    gj.\"id\" AS gateway_job_id,
    cc.\"id\" AS coverage_cell_id,
    ca.\"cycleKey\" AS assessment_cycle_id,
    ss.\"id\" AS source_id,
    cc.\"marketKey\" AS market_key,
    ss.\"rolloutCohort\" AS rollout_cohort,
    w.\"id\" AS wave_id,
    d.\"id\" AS demand_id,
    campaign.\"id\" AS campaign_id,
    dr.\"id\" AS discovery_run_id,
    dq.\"id\" AS discovery_query_id,
    ds.\"id\" AS discovery_result_id,
    ir.\"id\" AS capture_run_id,
    ds.\"matchingIntakeId\" AS intake_id,
    mj.\"id\" AS mapping_job_id,
    mj.\"mappingId\" AS mapping_id,
    aj.\"id\" AS approval_job_id,
    activation.\"id\" AS activation_transition_id,
    st.\"id\" AS target_id,
    publication.\"id\" AS publication_transition_id,
    mj.\"workerId\" AS producer_id,
    aj.\"reviewerId\" AS reviewer_id
  FROM \"AffiliateSupplyReconciliationRuns\" session
  JOIN \"AffiliateAgentGatewayJobs\" gj
    ON gj.\"id\" = :'gateway_job_id'
   AND gj.\"role\" = 'COVERAGE_PLANNER'
   AND gj.\"supplySourceId\" IS NULL
  JOIN \"AffiliateReplenishmentWaves\" w
    ON w.\"coveragePlanningJobId\" = gj.\"id\"
   AND w.\"campaignId\" IS NOT NULL
  JOIN \"AffiliateReplenishmentDemands\" d
    ON d.\"id\" = w.\"demandId\"
   AND d.\"marketKey\" = :'market_key'
   AND d.\"rolloutCohort\" = :'rollout_cohort'
  JOIN \"AffiliateCoverageCells\" cc
    ON cc.\"id\" = d.\"targetKey\"
   AND cc.\"marketKey\" = d.\"marketKey\"
   AND cc.\"sportId\" = d.\"sportId\"
   AND cc.\"profileKey\" = d.\"sourceProfile\"
   AND cc.\"id\" = :'coverage_cell_id'
   AND cc.\"cohort\" = :'rollout_cohort'
  JOIN \"AffiliateCoverageCellAssessments\" ca
    ON ca.\"cellId\" = cc.\"id\"
   AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
   AND ca.\"cycleKey\" = :'assessment_cycle_id'
  JOIN \"AffiliateSourceDiscoveryCampaigns\" campaign
    ON campaign.\"id\" = w.\"campaignId\"
  JOIN \"AffiliateSourceDiscoveryRuns\" dr
    ON dr.\"id\" = :'discovery_run_id'
   AND dr.\"campaignId\" = campaign.\"id\"
   AND dr.\"status\" IN ('SUCCEEDED', 'COMPLETED')
  JOIN \"AffiliateSourceDiscoveryQueryExecutions\" dq
    ON dq.\"id\" = :'discovery_query_id'
   AND dq.\"runId\" = dr.\"id\"
   AND dq.\"campaignId\" = campaign.\"id\"
   AND dq.\"status\" IN ('SUCCEEDED', 'COMPLETED')
  JOIN \"AffiliateCoverageCities\" city
    ON city.\"id\" = cc.\"cityId\"
   AND dq.\"cityGeoid\" = city.\"placeGeoid\"
   AND dq.\"sportId\" = cc.\"sportId\"
   AND dq.\"profileKey\" = cc.\"profileKey\"
  JOIN \"AffiliateSourceDiscoveryResults\" ds
    ON ds.\"id\" = :'discovery_result_id'
   AND ds.\"campaignId\" = campaign.\"id\"
   AND ds.\"latestRunId\" = dr.\"id\"
   AND ds.\"matchingIntakeId\" = :'intake_id'
  JOIN \"AffiliateSupplySources\" ss
    ON ss.\"id\" = ds.\"supplySourceId\"
   AND ss.\"id\" = :'source_id'
   AND ss.\"rolloutCohort\" = cc.\"cohort\"
  JOIN \"AffiliateSupplyTargets\" st
    ON st.\"id\" = :'target_id'
   AND st.\"supplySourceId\" = ss.\"id\"
   AND st.\"marketKey\" = cc.\"marketKey\"
   AND st.\"sportId\" = cc.\"sportId\"
   AND st.\"sourceProfile\" = cc.\"profileKey\"
   AND st.\"status\" = 'PUBLISHED'
   AND st.\"publishedAt\" IS NOT NULL
  JOIN \"AffiliateSourceIntakeRuns\" ir
    ON ir.\"id\" = :'capture_run_id'
   AND ir.\"intakeId\" = ds.\"matchingIntakeId\"
   AND ir.\"supplySourceId\" = ss.\"id\"
   AND ir.\"status\" IN ('SUCCEEDED', 'COMPLETED')
  JOIN \"AffiliateSourceIntakeArtifacts\" ia
    ON ia.\"id\" = :'capture_artifact_id'
   AND ia.\"runId\" = ir.\"id\"
   AND ia.\"intakeId\" = ds.\"matchingIntakeId\"
   AND ia.\"supplySourceId\" = ss.\"id\"
  JOIN \"AffiliateSourceMappingJobs\" mj
    ON mj.\"id\" = :'mapping_job_id'
   AND mj.\"intakeId\" = ds.\"matchingIntakeId\"
   AND mj.\"supplySourceId\" = ss.\"id\"
   AND mj.\"mappingId\" = :'mapping_id'
   AND mj.\"status\" = 'APPROVED'
  JOIN \"AffiliateScrapeSources\" scrape_source
    ON scrape_source.\"id\" = mj.\"sourceId\"
   AND scrape_source.\"supplySourceId\" = ss.\"id\"
  JOIN \"AffiliateApprovalJobs\" aj
    ON aj.\"id\" = :'approval_job_id'
   AND aj.\"supplySourceId\" = ss.\"id\"
   AND aj.\"subjectType\" = 'MAPPING_PACKAGE'
   AND aj.\"subjectKey\" = mj.\"mappingId\"
   AND aj.\"status\" = 'APPROVED'
  JOIN \"AffiliateSupplyLifecycleTransitions\" activation
    ON activation.\"id\" = :'activation_transition_id'
   AND activation.\"supplySourceId\" = ss.\"id\"
   AND activation.\"command\" = 'ACTIVATE'
   AND COALESCE(
     activation.\"requestJson\"->>'mappingId',
     activation.\"resultJson\"->>'mappingId'
   ) = mj.\"mappingId\"
  JOIN \"AffiliateSupplyLifecycleTransitions\" publication
    ON publication.\"id\" = :'publication_transition_id'
   AND publication.\"supplySourceId\" = ss.\"id\"
   AND publication.\"command\" = 'PUBLISH_TARGET'
   AND (
     publication.\"requestJson\"->>'targetId' = st.\"id\"
     OR publication.\"resultJson\"->>'targetId' = st.\"id\"
     OR publication.\"requestJson\"->>'candidateId' = st.\"candidateId\"
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(
         COALESCE(publication.\"requestJson\"->'targets', '[]'::jsonb)
       ) publication_target
       WHERE publication_target->>'targetId' = st.\"id\"
     )
   )
  WHERE session.\"id\" = :'cutover_session_id'
    AND session.\"mode\" = 'CUTOVER_SESSION'
),
checks AS (
  SELECT
    (SELECT COUNT(*) = 1 FROM lineage_scope) AS joined_lineage,
    EXISTS (
      SELECT 1
      FROM \"AffiliateSourceDiscoveryRuns\" dr
      JOIN \"AffiliateSourceDiscoveryQueryExecutions\" dq
        ON dq.\"runId\" = dr.\"id\"
      JOIN \"AffiliateSourceDiscoveryResults\" ds
        ON ds.\"latestRunId\" = dr.\"id\"
      WHERE dr.\"id\" = :'discovery_run_id'
        AND dr.\"status\" IN ('SUCCEEDED', 'COMPLETED')
        AND dq.\"id\" = :'discovery_query_id'
        AND dq.\"status\" IN ('SUCCEEDED', 'COMPLETED')
        AND ds.\"id\" = :'discovery_result_id'
        AND ds.\"matchingIntakeId\" = :'intake_id'
    ) AS discovery_to_result,
    EXISTS (
      SELECT 1
      FROM \"AffiliateSourceIntakeRuns\" ir
      JOIN \"AffiliateSourceIntakeArtifacts\" ia
        ON ia.\"runId\" = ir.\"id\"
      WHERE ir.\"id\" = :'capture_run_id'
        AND ir.\"supplySourceId\" = :'source_id'
        AND ir.\"status\" IN ('SUCCEEDED', 'COMPLETED')
        AND ia.\"id\" = :'capture_artifact_id'
        AND ia.\"intakeId\" = :'intake_id'
        AND ia.\"supplySourceId\" = :'source_id'
    ) AS result_to_capture,
    EXISTS (
      SELECT 1
      FROM \"AffiliateSourceMappingJobs\" mj
      WHERE mj.\"id\" = :'mapping_job_id'
        AND mj.\"intakeId\" = :'intake_id'
        AND mj.\"supplySourceId\" = :'source_id'
        AND mj.\"mappingId\" = :'mapping_id'
        AND mj.\"status\" = 'APPROVED'
        AND mj.\"workerId\" = :'producer_id'
    ) AS capture_to_mapping,
    EXISTS (
      SELECT 1
      FROM \"AffiliateApprovalJobs\" aj
      WHERE aj.\"id\" = :'approval_job_id'
        AND aj.\"supplySourceId\" = :'source_id'
        AND aj.\"subjectType\" = 'MAPPING_PACKAGE'
        AND aj.\"subjectKey\" = :'mapping_id'
        AND aj.\"status\" = 'APPROVED'
        AND aj.\"reviewerId\" = :'reviewer_id'
    ) AS independent_review,
    EXISTS (
      SELECT 1
      FROM \"AffiliateSupplyLifecycleTransitions\" lt
      WHERE lt.\"id\" = :'activation_transition_id'
        AND lt.\"supplySourceId\" = :'source_id'
        AND lt.\"command\" = 'ACTIVATE'
        AND COALESCE(
          lt.\"requestJson\"->>'mappingId',
          lt.\"resultJson\"->>'mappingId'
        ) = :'mapping_id'
    ) AS mapping_to_activation,
    EXISTS (
      SELECT 1
      FROM \"AffiliateSupplyTargets\" st
      WHERE st.\"id\" = :'target_id'
        AND st.\"supplySourceId\" = :'source_id'
        AND st.\"marketKey\" = :'market_key'
        AND st.\"status\" = 'PUBLISHED'
        AND st.\"publishedAt\" IS NOT NULL
    )
    AND EXISTS (
      SELECT 1
      FROM \"AffiliateSupplyLifecycleTransitions\" lt
      WHERE lt.\"id\" = :'publication_transition_id'
        AND lt.\"supplySourceId\" = :'source_id'
        AND lt.\"command\" = 'PUBLISH_TARGET'
        AND (
          lt.\"requestJson\"->>'targetId' = :'target_id'
          OR lt.\"resultJson\"->>'targetId' = :'target_id'
          OR lt.\"requestJson\"->>'candidateId' = (
            SELECT st.\"candidateId\"
            FROM \"AffiliateSupplyTargets\" st
            WHERE st.\"id\" = :'target_id'
              AND st.\"supplySourceId\" = :'source_id'
            LIMIT 1
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              COALESCE(lt.\"requestJson\"->'targets', '[]'::jsonb)
            ) target
            WHERE target->>'targetId' = :'target_id'
          )
        )
    ) AS activation_to_publication,
    EXISTS (
      SELECT 1
      FROM \"AffiliateAgentGatewayJobs\" gj
      JOIN \"AffiliateReplenishmentWaves\" w
        ON w.\"coveragePlanningJobId\" = gj.\"id\"
       AND w.\"campaignId\" IS NOT NULL
      JOIN \"AffiliateReplenishmentDemands\" d
        ON d.\"id\" = w.\"demandId\"
      JOIN \"AffiliateCoverageCells\" cc
        ON cc.\"id\" = d.\"targetKey\"
       AND cc.\"marketKey\" = d.\"marketKey\"
       AND cc.\"sportId\" = d.\"sportId\"
       AND cc.\"profileKey\" = d.\"sourceProfile\"
      JOIN \"AffiliateCoverageCellAssessments\" ca
        ON ca.\"cellId\" = cc.\"id\"
       AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
      JOIN \"AffiliateSourceDiscoveryCampaigns\" campaign
        ON campaign.\"id\" = w.\"campaignId\"
      JOIN \"AffiliateSupplySources\" ss
        ON ss.\"id\" = :'source_id'
       AND ss.\"rolloutCohort\" = cc.\"cohort\"
      JOIN \"AffiliateSupplyContractManifests\" cm
        ON cm.\"rolloutCohort\" = ss.\"rolloutCohort\"
       AND cm.\"version\" = ss.\"activeSupplyContractVersion\"
       AND cm.\"contractHash\" = ss.\"activeSupplyContractHash\"
       AND cm.\"status\" = 'ACTIVE'
      WHERE gj.\"id\" = :'gateway_job_id'
        AND gj.\"role\" = 'COVERAGE_PLANNER'
        AND gj.\"supplySourceId\" IS NULL
        AND cc.\"marketKey\" = :'market_key'
        AND cc.\"cohort\" = :'rollout_cohort'
        AND cc.\"id\" = :'coverage_cell_id'
        AND ca.\"cycleKey\" = :'assessment_cycle_id'
    ) AS gateway_tuple,
    (SELECT \"workerId\" FROM \"AffiliateSourceMappingJobs\"
      WHERE \"id\" = :'mapping_job_id') AS producer_id,
    (SELECT \"reviewerId\" FROM \"AffiliateApprovalJobs\"
      WHERE \"id\" = :'approval_job_id') AS reviewer_id
)
SELECT json_build_object(
  'cutoverSessionId', :'cutover_session_id',
  'joinedLineageCount', (SELECT COUNT(*) FROM lineage_scope),
  'tuple', (
    SELECT json_build_object(
      'sourceId', source_id,
      'marketKey', market_key,
      'rolloutCohort', rollout_cohort,
      'coverageCellId', coverage_cell_id,
      'assessmentCycleId', assessment_cycle_id
    )
    FROM lineage_scope
  ),
  'ids', (
    SELECT json_build_object(
      'discoveryRunId', discovery_run_id,
      'discoveryQueryId', discovery_query_id,
      'discoveryResultId', discovery_result_id,
      'intakeId', intake_id,
      'captureRunId', capture_run_id,
      'captureArtifactId', capture_artifact_id,
      'mappingJobId', mapping_job_id,
      'mappingId', mapping_id,
      'approvalJobId', approval_job_id,
      'activationTransitionId', activation_transition_id,
      'targetId', target_id,
      'publicationTransitionId', publication_transition_id,
      'gatewayJobId', gateway_job_id,
      'waveId', wave_id,
      'demandId', demand_id,
      'campaignId', campaign_id
    )
    FROM lineage_scope
  ),
  'producerId', (SELECT producer_id FROM lineage_scope),
  'reviewerId', (SELECT reviewer_id FROM lineage_scope),
  'checks', json_build_object(
    'joinedLineage', joined_lineage,
    'discoveryToResult', discovery_to_result,
    'resultToCapture', result_to_capture,
    'captureToMapping', capture_to_mapping,
    'independentReview', independent_review,
    'mappingToActivation', mapping_to_activation,
    'activationToPublication', activation_to_publication,
    'gatewayTuple', gateway_tuple
  )
)
FROM checks;" > "$LINEAGE_OUTPUT"
jq -e \
  --arg session "$CUTOVER_SESSION_ID" \
  --arg source "$OBSERVATION_SUPPLY_SOURCE_ID" \
  --arg market "$OBSERVATION_MARKET_KEY" \
  --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
  --arg cell "$OBSERVATION_COVERAGE_CELL_ID" \
  --arg cycle "$OBSERVATION_ASSESSMENT_CYCLE_ID" \
  --arg producer "$LINEAGE_PRODUCER_ID" \
  --arg reviewer "$LINEAGE_REVIEWER_ID" '
  .cutoverSessionId == $session
  and .joinedLineageCount == 1
  and .tuple == {
    sourceId: $source,
    marketKey: $market,
    rolloutCohort: $cohort,
    coverageCellId: $cell,
    assessmentCycleId: $cycle
  }
  and .producerId == $producer
  and .reviewerId == $reviewer
  and .producerId != .reviewerId
  and (.checks | [
    .joinedLineage, .discoveryToResult, .resultToCapture,
    .captureToMapping, .independentReview, .mappingToActivation,
    .activationToPublication, .gatewayTuple
  ] | all)
' "$LINEAGE_OUTPUT"
```

The query fails closed unless every join and tuple check is true, and it
records producer and reviewer identities separately. A producer/reviewer
identity collision, missing stage, mismatched source/market/cohort/cell/cycle,
or publication without the exact target transition blocks admission.

### Invocation retry

Observe one real invocation failure followed by a later terminal invocation
success for the same job. The success must carry the same job/claim/generation
between its terminal event and successful receipt, and every row must match the
reviewed source, market, cohort, coverage cell, and assessment cycle. Query
only the bounded restart/replay window. Do not induce a failure:

```text
export INVOCATION_RETRY_OUTPUT=/path/to/affiliate-governed-private/invocation-retry.redacted.json
install -m 0600 /dev/null "$INVOCATION_RETRY_OUTPUT"
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  -v rollout_cohort="$OBSERVATION_ROLLOUT_COHORT" \
  -v supply_source_id="$OBSERVATION_SUPPLY_SOURCE_ID" \
  -v market_key="$OBSERVATION_MARKET_KEY" \
  -v coverage_cell_id="$OBSERVATION_COVERAGE_CELL_ID" \
  -v observation_start="$OBSERVATION_ADMISSION_START" \
  -v observation_end="$OBSERVATION_ADMISSION_END" \
  -v assessment_cycle_id="$OBSERVATION_ASSESSMENT_CYCLE_ID" \
  -Atc "
  WITH failures AS (
    SELECT
      e.\"jobId\" AS job_id,
      e.\"id\" AS failure_event_id,
      e.\"claimId\" AS failure_claim_id,
      e.\"sequence\" AS failure_sequence,
      e.\"createdAt\" AS failure_at,
      e.\"reasonCodes\" AS failure_reason_codes,
      ss.\"id\" AS source_id,
      cc.\"marketKey\" AS market_key,
      ss.\"rolloutCohort\" AS rollout_cohort,
      cc.\"id\" AS coverage_cell_id,
      ca.\"cycleKey\" AS assessment_cycle_id
    FROM \"AffiliateAgentGatewayEvents\" e
    JOIN \"AffiliateAgentGatewayJobs\" j ON j.\"id\" = e.\"jobId\"
    JOIN \"AffiliateSupplySources\" ss
      ON ss.\"id\" = j.\"supplySourceId\"
     AND ss.\"id\" = :'supply_source_id'
     AND ss.\"rolloutCohort\" = :'rollout_cohort'
    JOIN \"AffiliateCoverageCells\" cc
      ON cc.\"id\" = :'coverage_cell_id'
     AND cc.\"marketKey\" = :'market_key'
     AND cc.\"cohort\" = ss.\"rolloutCohort\"
    JOIN \"AffiliateCoverageCellAssessments\" ca
      ON ca.\"cellId\" = cc.\"id\"
     AND ca.\"cycleKey\" = :'assessment_cycle_id'
    JOIN \"AffiliateSupplyContractManifests\" cm
      ON cm.\"rolloutCohort\" = ss.\"rolloutCohort\"
     AND cm.\"version\" = ss.\"activeSupplyContractVersion\"
     AND cm.\"contractHash\" = ss.\"activeSupplyContractHash\"
     AND cm.\"status\" = 'ACTIVE'
    WHERE e.\"eventType\" = 'CLAIM_INVOCATION_FAILED'
      AND e.\"claimId\" IS NOT NULL
      AND cardinality(e.\"reasonCodes\") > 0
      AND j.\"role\" IN ('MAPPING_PRODUCER', 'SUPPLY_REVIEWER')
      AND e.\"createdAt\" >= :'observation_start'::timestamptz
      AND e.\"createdAt\" <= :'observation_end'::timestamptz
  ),
  successes AS (
    SELECT
      f.job_id,
      f.failure_event_id,
      f.failure_claim_id,
      f.failure_sequence,
      f.failure_at,
      f.failure_reason_codes,
      e.\"id\" AS success_event_id,
      e.\"claimId\" AS success_claim_id,
      e.\"sequence\" AS success_sequence,
      e.\"createdAt\" AS success_at,
      r.\"id\" AS successful_receipt_id,
      r.\"claimGeneration\" AS success_claim_generation,
      r.\"status\" AS receipt_status,
      j.\"status\" AS job_status,
      f.source_id,
      f.market_key,
      f.rollout_cohort,
      f.coverage_cell_id,
      f.assessment_cycle_id
    FROM failures f
    JOIN \"AffiliateAgentGatewayEvents\" e
      ON e.\"jobId\" = f.job_id
      AND e.\"sequence\" > f.failure_sequence
      AND e.\"createdAt\" > f.failure_at
    JOIN \"AffiliateAgentGatewayOperationReceipts\" r
      ON r.\"id\" = e.\"receiptId\"
      AND r.\"jobId\" = e.\"jobId\"
      AND r.\"claimId\" = e.\"claimId\"
      AND r.\"status\" = 'SUCCEEDED'
      AND r.\"completedAt\" >= e.\"createdAt\"
    JOIN \"AffiliateAgentGatewayClaims\" c
      ON c.\"id\" = e.\"claimId\"
      AND c.\"jobId\" = e.\"jobId\"
      AND c.\"claimGeneration\" = r.\"claimGeneration\"
    JOIN \"AffiliateAgentGatewayJobs\" j ON j.\"id\" = e.\"jobId\"
    WHERE e.\"eventType\" = 'CLAIM_TERMINAL_RESULT_ACCEPTED'
      AND e.\"actorKind\" = 'AGENT_INVOCATION'
      AND r.\"operationKind\" = 'SUBMIT_RESULT'
  )
  SELECT COALESCE(
    (
      SELECT json_build_object(
        'jobId', job_id,
        'failureEventId', failure_event_id,
        'failureClaimId', failure_claim_id,
        'failureSequence', failure_sequence,
        'failureAt', failure_at,
        'failureReasonCodes', failure_reason_codes,
        'successEventId', success_event_id,
        'successClaimId', success_claim_id,
        'successSequence', success_sequence,
        'successAt', success_at,
        'successfulReceiptId', successful_receipt_id,
        'successClaimGeneration', success_claim_generation,
        'receiptStatus', receipt_status,
        'jobStatus', job_status,
        'sourceId', source_id,
        'marketKey', market_key,
        'rolloutCohort', rollout_cohort,
        'coverageCellId', coverage_cell_id,
        'assessmentCycleId', assessment_cycle_id
      )
      FROM successes
      ORDER BY success_at ASC, success_sequence ASC
      LIMIT 1
    ),
    '{}'::json
  );" \
  > "$INVOCATION_RETRY_OUTPUT"
jq -e \
  --arg source "$OBSERVATION_SUPPLY_SOURCE_ID" \
  --arg market "$OBSERVATION_MARKET_KEY" \
  --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
  --arg cell "$OBSERVATION_COVERAGE_CELL_ID" \
  --arg cycle "$OBSERVATION_ASSESSMENT_CYCLE_ID" '
  (.jobId | type == "string" and length > 0)
  and (.failureEventId | type == "string" and length > 0)
  and (.failureReasonCodes | type == "array" and length > 0)
  and (.failureClaimId | type == "string" and length > 0)
  and (.failureSequence | type == "number" and . >= 0)
  and (.successEventId | type == "string" and length > 0)
  and (.successClaimId | type == "string" and length > 0)
  and (.successSequence | type == "number")
  and (.successSequence > .failureSequence)
  and (.successfulReceiptId | type == "string" and length > 0)
  and (.successClaimGeneration | type == "number" and . >= 0)
  and .receiptStatus == "SUCCEEDED"
  and (.jobStatus | type == "string" and . != "PIPELINE_BLOCKED")
  and .sourceId == $source
  and .marketKey == $market
  and .rolloutCohort == $cohort
  and .coverageCellId == $cell
  and .assessmentCycleId == $cycle
' "$INVOCATION_RETRY_OUTPUT"
```

### Stale-generation denial

Observe one real stale-generation denial in the reviewed lineage tuple. The
event must retain its safe reason code and claim/job identity:

```text
export STALE_GENERATION_OUTPUT=/path/to/affiliate-governed-private/stale-generation.redacted.json
install -m 0600 /dev/null "$STALE_GENERATION_OUTPUT"
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  -v source_id="$OBSERVATION_SUPPLY_SOURCE_ID" \
  -v market_key="$OBSERVATION_MARKET_KEY" \
  -v rollout_cohort="$OBSERVATION_ROLLOUT_COHORT" \
  -v coverage_cell_id="$OBSERVATION_COVERAGE_CELL_ID" \
  -v assessment_cycle_id="$OBSERVATION_ASSESSMENT_CYCLE_ID" \
  -v observation_start="$OBSERVATION_ADMISSION_START" \
  -v observation_end="$OBSERVATION_ADMISSION_END" \
  -Atc "
  SELECT COALESCE(
    (json_agg(json_build_object(
      'eventId', e.\"id\",
      'jobId', e.\"jobId\",
      'claimId', e.\"claimId\",
      'eventType', e.\"eventType\",
      'reasonCodes', e.\"reasonCodes\",
      'createdAt', e.\"createdAt\",
      'claimStatus', c.\"status\",
      'jobStatus', j.\"status\",
      'sourceId', ss.\"id\",
      'marketKey', cc.\"marketKey\",
      'rolloutCohort', ss.\"rolloutCohort\",
      'coverageCellId', cc.\"id\",
      'assessmentCycleId', ca.\"cycleKey\"
    ) ORDER BY e.\"createdAt\" DESC, e.\"id\" DESC)->0),
    '{}'::json
  )
  FROM \"AffiliateAgentGatewayEvents\" e
  JOIN \"AffiliateAgentGatewayJobs\" j ON j.\"id\" = e.\"jobId\"
  JOIN \"AffiliateAgentGatewayClaims\" c
    ON c.\"id\" = e.\"claimId\"
   AND c.\"jobId\" = j.\"id\"
  JOIN \"AffiliateSupplySources\" ss
    ON ss.\"id\" = j.\"supplySourceId\"
   AND ss.\"id\" = :'source_id'
   AND ss.\"rolloutCohort\" = :'rollout_cohort'
  JOIN \"AffiliateCoverageCells\" cc
    ON cc.\"id\" = :'coverage_cell_id'
   AND cc.\"marketKey\" = :'market_key'
   AND cc.\"cohort\" = ss.\"rolloutCohort\"
  JOIN \"AffiliateCoverageCellAssessments\" ca
    ON ca.\"cellId\" = cc.\"id\"
   AND ca.\"cycleKey\" = :'assessment_cycle_id'
  JOIN \"AffiliateSupplyContractManifests\" cm
    ON cm.\"rolloutCohort\" = ss.\"rolloutCohort\"
   AND cm.\"version\" = ss.\"activeSupplyContractVersion\"
   AND cm.\"contractHash\" = ss.\"activeSupplyContractHash\"
   AND cm.\"status\" = 'ACTIVE'
  WHERE e.\"eventType\" = 'CLAIM_INVOCATION_FAILED'
    AND e.\"claimId\" IS NOT NULL
    AND 'STALE_GENERATION' = ANY(e.\"reasonCodes\")
    AND j.\"role\" IN ('MAPPING_PRODUCER', 'SUPPLY_REVIEWER')
    AND e.\"createdAt\" >= :'observation_start'::timestamptz
    AND e.\"createdAt\" <= :'observation_end'::timestamptz;" \
  > "$STALE_GENERATION_OUTPUT"
jq -e \
  --arg source "$OBSERVATION_SUPPLY_SOURCE_ID" \
  --arg market "$OBSERVATION_MARKET_KEY" \
  --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
  --arg cell "$OBSERVATION_COVERAGE_CELL_ID" \
  --arg cycle "$OBSERVATION_ASSESSMENT_CYCLE_ID" '
  (.eventId | type == "string" and length > 0)
  and (.jobId | type == "string" and length > 0)
  and (.claimId | type == "string" and length > 0)
  and .eventType == "CLAIM_INVOCATION_FAILED"
  and (.reasonCodes | index("STALE_GENERATION") != null)
  and .sourceId == $source
  and .marketKey == $market
  and .rolloutCohort == $cohort
  and .coverageCellId == $cell
  and .assessmentCycleId == $cycle
  and (.claimStatus | type == "string" and length > 0)
  and (.jobStatus | type == "string" and length > 0)
' "$STALE_GENERATION_OUTPUT"
```

### Provider failure containment

Observe one real provider failure for a named provider execution in the reviewed
lineage tuple. The durable wave record must identify the provider and provider
operation, and a related alert must expose its exact alert ID/event key and
safe reason code:

```text
export PROVIDER_FAILURE_OUTPUT=/path/to/affiliate-governed-private/provider-failure.redacted.json
install -m 0600 /dev/null "$PROVIDER_FAILURE_OUTPUT"
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  -v source_id="$OBSERVATION_SUPPLY_SOURCE_ID" \
  -v market_key="$OBSERVATION_MARKET_KEY" \
  -v rollout_cohort="$OBSERVATION_ROLLOUT_COHORT" \
  -v coverage_cell_id="$OBSERVATION_COVERAGE_CELL_ID" \
  -v assessment_cycle_id="$OBSERVATION_ASSESSMENT_CYCLE_ID" \
  -v observation_start="$OBSERVATION_ADMISSION_START" \
  -v observation_end="$OBSERVATION_ADMISSION_END" \
  -Atc "
  SELECT COALESCE(
    (json_agg(json_build_object(
      'waveId', w.\"id\",
      'provider', w.\"provider\",
      'providerOperationKey', w.\"providerOperationKey\",
      'status', w.\"status\",
      'errorCode', w.\"errorCode\",
      'alertId', a.\"id\",
      'alertEventKey', a.\"eventKey\",
      'alertCategory', a.\"category\",
      'alertReasonCodes', a.\"reasonCodes\",
      'sourceId', COALESCE(a.\"supplySourceId\", ss.\"id\"),
      'marketKey', cc.\"marketKey\",
      'rolloutCohort', ss.\"rolloutCohort\",
      'coverageCellId', cc.\"id\",
      'assessmentCycleId', ca.\"cycleKey\",
      'campaignId', campaign.\"id\",
      'discoveryRunId', dr.\"id\",
      'discoveryQueryId', dq.\"id\",
      'discoveryResultId', ds.\"id\",
      'targetId', st.\"id\",
      'outcome', w.\"status\",
      'observedAt', w.\"updatedAt\"
    ) ORDER BY w.\"updatedAt\" DESC, w.\"id\" DESC)->0),
    '{}'::json
  )
  FROM \"AffiliateReplenishmentWaves\" w
  JOIN \"AffiliateReplenishmentDemands\" d ON d.\"id\" = w.\"demandId\"
  JOIN \"AffiliateAgentGatewayJobs\" j ON j.\"id\" = w.\"coveragePlanningJobId\"
  JOIN \"AffiliateCoverageCells\" cc
    ON cc.\"id\" = d.\"targetKey\"
   AND cc.\"marketKey\" = d.\"marketKey\"
   AND cc.\"sportId\" = d.\"sportId\"
   AND cc.\"profileKey\" = d.\"sourceProfile\"
  JOIN \"AffiliateCoverageCellAssessments\" ca
    ON ca.\"cellId\" = cc.\"id\"
   AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
  JOIN \"AffiliateSupplySources\" ss
    ON ss.\"id\" = :'source_id'
   AND ss.\"rolloutCohort\" = cc.\"cohort\"
  JOIN \"AffiliateSupplyContractManifests\" cm
    ON cm.\"rolloutCohort\" = ss.\"rolloutCohort\"
   AND cm.\"version\" = ss.\"activeSupplyContractVersion\"
   AND cm.\"contractHash\" = ss.\"activeSupplyContractHash\"
   AND cm.\"status\" = 'ACTIVE'
  JOIN \"AffiliateSupplyTargets\" st
    ON st.\"supplySourceId\" = ss.\"id\"
   AND st.\"marketKey\" = cc.\"marketKey\"
   AND st.\"sportId\" = cc.\"sportId\"
   AND st.\"sourceProfile\" = cc.\"profileKey\"
   AND st.\"status\" = 'PUBLISHED'
  JOIN \"AffiliateSourceDiscoveryCampaigns\" campaign
    ON campaign.\"id\" = w.\"campaignId\"
  JOIN \"AffiliateSourceDiscoveryRuns\" dr
    ON dr.\"campaignId\" = campaign.\"id\"
   AND dr.\"status\" IN ('SUCCEEDED', 'COMPLETED', 'RUNNING')
  JOIN \"AffiliateSourceDiscoveryQueryExecutions\" dq
    ON dq.\"runId\" = dr.\"id\"
   AND dq.\"campaignId\" = campaign.\"id\"
   AND dq.\"status\" IN ('SUCCEEDED', 'COMPLETED', 'RUNNING')
   AND dq.\"sportId\" = cc.\"sportId\"
   AND dq.\"profileKey\" = cc.\"profileKey\"
  JOIN \"AffiliateCoverageCities\" city
    ON city.\"id\" = cc.\"cityId\"
   AND dq.\"cityGeoid\" = city.\"placeGeoid\"
  JOIN \"AffiliateSourceDiscoveryResults\" ds
    ON ds.\"campaignId\" = campaign.\"id\"
   AND ds.\"latestRunId\" = dr.\"id\"
   AND ds.\"supplySourceId\" = ss.\"id\"
  JOIN LATERAL (
    SELECT
      a.\"id\",
      a.\"eventKey\",
      a.\"category\",
      a.\"reasonCodes\",
      a.\"supplySourceId\"
    FROM \"AffiliateOperationalAlerts\" a
    WHERE (
      a.\"subjectId\" = w.\"id\"
      OR a.\"payload\"->>'waveId' = w.\"id\"
    )
      AND a.\"reasonCodes\" && ARRAY[
        'PROVIDER_FAILURE',
        'DISCOVERY_PROVIDER_FAILURE',
        'CAPTURE_PROVIDER_FAILURE',
        'SOURCE_REFRESH_FAILED',
        'AUTOMATIC_CAPTURE_FAILURE'
      ]::text[]
      AND a.\"createdAt\" >= :'observation_start'::timestamptz
      AND a.\"createdAt\" <= :'observation_end'::timestamptz
    ORDER BY a.\"createdAt\" DESC, a.\"id\" DESC
    LIMIT 1
  ) a ON true
  WHERE w.\"provider\" IS NOT NULL
    AND w.\"providerOperationKey\" IS NOT NULL
    AND w.\"rolloutCohort\" = :'rollout_cohort'
    AND d.\"rolloutCohort\" = :'rollout_cohort'
    AND d.\"targetKey\" = cc.\"id\"
    AND d.\"marketKey\" = cc.\"marketKey\"
    AND d.\"sportId\" = cc.\"sportId\"
    AND d.\"sourceProfile\" = cc.\"profileKey\"
    AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
    AND d.\"contractVersion\" = cm.\"version\"
    AND d.\"contractHash\" = cm.\"contractHash\"
    AND j.\"role\" = 'COVERAGE_PLANNER'
    AND j.\"supplySourceId\" IS NULL
    AND cc.\"marketKey\" = :'market_key'
    AND cc.\"cohort\" = :'rollout_cohort'
    AND cc.\"id\" = :'coverage_cell_id'
    AND ca.\"cycleKey\" = :'assessment_cycle_id'
    AND COALESCE(a.\"supplySourceId\", ss.\"id\") = :'source_id'
    AND a.\"supplySourceId\" = :'source_id'
    AND w.\"status\" IN ('FAILED', 'PAUSED')
    AND w.\"errorCode\" IN (
      'PROVIDER_FAILURE',
      'DISCOVERY_PROVIDER_FAILURE',
      'CAPTURE_PROVIDER_FAILURE'
    )
    AND w.\"updatedAt\" >= :'observation_start'::timestamptz
    AND w.\"updatedAt\" <= :'observation_end'::timestamptz;" \
  > "$PROVIDER_FAILURE_OUTPUT"
jq -e \
  --arg source "$OBSERVATION_SUPPLY_SOURCE_ID" \
  --arg market "$OBSERVATION_MARKET_KEY" \
  --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
  --arg cell "$OBSERVATION_COVERAGE_CELL_ID" \
  --arg cycle "$OBSERVATION_ASSESSMENT_CYCLE_ID" '
  (.waveId | type == "string" and length > 0)
  and (.provider | type == "string" and length > 0)
  and (.providerOperationKey | type == "string" and length > 0)
  and (.status == "FAILED" or .status == "PAUSED")
  and (
    .errorCode == "PROVIDER_FAILURE"
    or .errorCode == "DISCOVERY_PROVIDER_FAILURE"
    or .errorCode == "CAPTURE_PROVIDER_FAILURE"
  )
  and (.alertId | type == "string" and length > 0)
  and (.alertEventKey | type == "string" and length > 0)
  and (.alertCategory | type == "string" and length > 0)
  and (.alertReasonCodes | type == "array" and length > 0)
  and (
    (.alertReasonCodes | index("PROVIDER_FAILURE") != null)
    or (.alertReasonCodes | index("DISCOVERY_PROVIDER_FAILURE") != null)
    or (.alertReasonCodes | index("CAPTURE_PROVIDER_FAILURE") != null)
    or (.alertReasonCodes | index("SOURCE_REFRESH_FAILED") != null)
    or (.alertReasonCodes | index("AUTOMATIC_CAPTURE_FAILURE") != null)
  )
  and .sourceId == $source
  and .marketKey == $market
  and .rolloutCohort == $cohort
  and .coverageCellId == $cell
  and .assessmentCycleId == $cycle
  and (.campaignId | type == "string" and length > 0)
  and (.discoveryRunId | type == "string" and length > 0)
  and (.discoveryQueryId | type == "string" and length > 0)
  and (.discoveryResultId | type == "string" and length > 0)
  and (.targetId | type == "string" and length > 0)
  and (.outcome | type == "string" and length > 0)
  and (.observedAt | type == "string" and length > 0)
' "$PROVIDER_FAILURE_OUTPUT"
```

Do not copy `detail`, `payload`, provider URLs, response bodies, or
credentials into this artifact. If the provider failure is not safely
contained, keep admission closed and use the lane-specific resolution path.

### Alert delivery, exception history, and no digest

Observe immutable alert delivery and exception-rail history in the same
bounded window. Select one alert and its exact delivered delivery ID, one
exception event ID/reason set, and zero daily digest rows; every selected row
must match the reviewed source, market, cohort, coverage cell, and assessment
cycle:

```text
export ALERT_EXCEPTION_OUTPUT=/path/to/affiliate-governed-private/alert-exception-history.redacted.json
install -m 0600 /dev/null "$ALERT_EXCEPTION_OUTPUT"
test -n "$CUTOVER_SESSION_START"
test -n "$OBSERVATION_EVIDENCE_END"
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  -v source_id="$OBSERVATION_SUPPLY_SOURCE_ID" \
  -v market_key="$OBSERVATION_MARKET_KEY" \
  -v rollout_cohort="$OBSERVATION_ROLLOUT_COHORT" \
  -v coverage_cell_id="$OBSERVATION_COVERAGE_CELL_ID" \
  -v assessment_cycle_id="$OBSERVATION_ASSESSMENT_CYCLE_ID" \
  -v observation_start="$OBSERVATION_ADMISSION_START" \
  -v observation_end="$OBSERVATION_ADMISSION_END" \
  -v cutover_session_start="$CUTOVER_SESSION_START" \
  -v final_observation_close="$OBSERVATION_EVIDENCE_END" \
  -Atc "
  WITH selected_alert AS (
    SELECT
      a.\"id\" AS alert_id,
      a.\"eventKey\" AS alert_event_key,
      a.\"category\" AS alert_category,
      a.\"reasonCodes\" AS alert_reason_codes,
      ss.\"rolloutCohort\" AS rollout_cohort,
      ss.\"id\" AS source_id,
      cc.\"id\" AS coverage_cell_id,
      cc.\"marketKey\" AS market_key,
      ca.\"cycleKey\" AS assessment_cycle_id
    FROM \"AffiliateOperationalAlerts\" a
    LEFT JOIN \"AffiliateReplenishmentWaves\" w
      ON w.\"id\" = COALESCE(a.\"waveId\", a.\"payload\"->>'waveId')
    LEFT JOIN \"AffiliateReplenishmentDemands\" d ON d.\"id\" = w.\"demandId\"
    LEFT JOIN \"AffiliateAgentGatewayJobs\" j
      ON j.\"id\" = w.\"coveragePlanningJobId\"
    JOIN \"AffiliateSupplySources\" ss
      ON ss.\"id\" = a.\"supplySourceId\"
     AND ss.\"id\" = :'source_id'
     AND ss.\"rolloutCohort\" = :'rollout_cohort'
    JOIN \"AffiliateCoverageCells\" cc
      ON cc.\"id\" = COALESCE(a.\"coverageCellId\", d.\"targetKey\")
     AND cc.\"marketKey\" = :'market_key'
     AND cc.\"cohort\" = ss.\"rolloutCohort\"
    JOIN \"AffiliateCoverageCellAssessments\" ca
      ON ca.\"cellId\" = cc.\"id\"
     AND ca.\"cycleKey\" = :'assessment_cycle_id'
     AND (
       j.\"role\" <> 'COVERAGE_PLANNER'
       OR ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
     )
    JOIN \"AffiliateSupplyContractManifests\" cm
      ON cm.\"rolloutCohort\" = ss.\"rolloutCohort\"
     AND cm.\"version\" = ss.\"activeSupplyContractVersion\"
     AND cm.\"contractHash\" = ss.\"activeSupplyContractHash\"
     AND cm.\"status\" = 'ACTIVE'
    WHERE a.\"createdAt\" >= :'observation_start'::timestamptz
      AND a.\"createdAt\" <= :'observation_end'::timestamptz
      AND a.\"rolloutCohort\" = :'rollout_cohort'
      AND a.\"supplySourceId\" = :'source_id'
      AND (
        j.\"role\" IS NULL
        OR j.\"role\" <> 'COVERAGE_PLANNER'
        OR (
          j.\"supplySourceId\" IS NULL
          AND w.\"coveragePlanningJobId\" = j.\"id\"
          AND d.\"targetKey\" = cc.\"id\"
          AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
        )
      )
      AND (
        w.\"id\" IS NULL
        OR (
          w.\"rolloutCohort\" = ss.\"rolloutCohort\"
          AND d.\"rolloutCohort\" = ss.\"rolloutCohort\"
          AND d.\"targetKey\" = cc.\"id\"
          AND d.\"marketKey\" = cc.\"marketKey\"
          AND d.\"contractVersion\" = cm.\"version\"
          AND d.\"contractHash\" = cm.\"contractHash\"
        )
      )
      AND a.\"reasonCodes\" && ARRAY[
        'PROVIDER_FAILURE',
        'DISCOVERY_PROVIDER_FAILURE',
        'CAPTURE_PROVIDER_FAILURE',
        'SOURCE_REFRESH_FAILED',
        'AUTOMATIC_CAPTURE_FAILURE'
      ]::text[]
    ORDER BY a.\"createdAt\" DESC, a.\"id\" DESC
    LIMIT 1
  ),
  selected_delivery AS (
    SELECT
      d.\"id\" AS delivery_id,
      d.\"alertId\" AS delivery_alert_id,
      d.\"channel\" AS delivery_channel,
      d.\"status\" AS delivery_status,
      d.\"deliveredAt\" AS delivered_at,
      d.\"createdAt\" AS delivery_created_at
    FROM \"AffiliateOperationalAlertDeliveries\" d
    JOIN selected_alert a ON a.alert_id = d.\"alertId\"
    WHERE d.\"status\" = 'DELIVERED'
      AND d.\"createdAt\" >= :'observation_start'::timestamptz
      AND d.\"createdAt\" <= :'observation_end'::timestamptz
    ORDER BY d.\"createdAt\" DESC, d.\"id\" DESC
    LIMIT 1
  ),
  selected_exception AS (
    SELECT
      e.\"id\" AS event_id,
      e.\"eventKey\" AS event_key,
      e.\"jobId\" AS job_id,
      e.\"claimId\" AS claim_id,
      e.\"receiptId\" AS receipt_id,
      e.\"sequence\" AS event_sequence,
      e.\"eventType\" AS event_type,
      e.\"reasonCodes\" AS reason_codes,
      e.\"createdAt\" AS created_at,
      ss.\"id\" AS source_id,
      cc.\"marketKey\" AS market_key,
      ss.\"rolloutCohort\" AS rollout_cohort,
      cc.\"id\" AS coverage_cell_id,
      ca.\"cycleKey\" AS assessment_cycle_id
    FROM \"AffiliateAgentGatewayEvents\" e
    JOIN \"AffiliateAgentGatewayJobs\" j ON j.\"id\" = e.\"jobId\"
    JOIN \"AffiliateSupplySources\" ss
      ON ss.\"id\" = j.\"supplySourceId\"
     AND ss.\"id\" = :'source_id'
     AND ss.\"rolloutCohort\" = :'rollout_cohort'
    JOIN \"AffiliateCoverageCells\" cc
      ON cc.\"id\" = :'coverage_cell_id'
     AND cc.\"marketKey\" = :'market_key'
     AND cc.\"cohort\" = ss.\"rolloutCohort\"
    JOIN \"AffiliateCoverageCellAssessments\" ca
      ON ca.\"cellId\" = cc.\"id\"
     AND ca.\"cycleKey\" = :'assessment_cycle_id'
    JOIN \"AffiliateSupplyContractManifests\" cm
      ON cm.\"rolloutCohort\" = ss.\"rolloutCohort\"
     AND cm.\"version\" = ss.\"activeSupplyContractVersion\"
     AND cm.\"contractHash\" = ss.\"activeSupplyContractHash\"
     AND cm.\"status\" = 'ACTIVE'
    WHERE cardinality(e.\"reasonCodes\") > 0
      AND j.\"role\" IN ('MAPPING_PRODUCER', 'SUPPLY_REVIEWER')
      AND e.\"createdAt\" >= :'observation_start'::timestamptz
      AND e.\"createdAt\" <= :'observation_end'::timestamptz
    ORDER BY e.\"createdAt\" DESC, e.\"id\" DESC
    LIMIT 1
  )
  SELECT json_build_object(
    'alert', (SELECT json_build_object(
      'alertId', alert_id,
      'alertEventKey', alert_event_key,
      'alertCategory', alert_category,
      'alertReasonCodes', alert_reason_codes,
      'sourceId', source_id,
      'marketKey', market_key,
      'rolloutCohort', rollout_cohort,
      'coverageCellId', coverage_cell_id,
      'assessmentCycleId', assessment_cycle_id
    ) FROM selected_alert),
    'delivery', (SELECT json_build_object(
      'deliveryId', delivery_id,
      'alertId', delivery_alert_id,
      'channel', delivery_channel,
      'status', delivery_status,
      'deliveredAt', delivered_at,
      'createdAt', delivery_created_at
    ) FROM selected_delivery),
    'exceptionEvent', (SELECT json_build_object(
      'eventId', event_id,
      'eventKey', event_key,
      'jobId', job_id,
      'claimId', claim_id,
      'receiptId', receipt_id,
      'sequence', event_sequence,
      'eventType', event_type,
      'reasonCodes', reason_codes,
      'createdAt', created_at,
      'sourceId', source_id,
      'marketKey', market_key,
      'rolloutCohort', rollout_cohort,
      'coverageCellId', coverage_cell_id,
      'assessmentCycleId', assessment_cycle_id
    ) FROM selected_exception),
    'alertCount', (SELECT count(*) FROM \"AffiliateOperationalAlerts\"
      WHERE \"createdAt\" >= :'observation_start'::timestamptz
        AND \"createdAt\" <= :'observation_end'::timestamptz),
    'deliveredCount', (SELECT count(*) FROM \"AffiliateOperationalAlertDeliveries\"
      WHERE \"status\" = 'DELIVERED'
        AND \"createdAt\" >= :'observation_start'::timestamptz
        AND \"createdAt\" <= :'observation_end'::timestamptz),
    'exceptionEventCount', (SELECT count(*) FROM \"AffiliateAgentGatewayEvents\"
      WHERE cardinality(\"reasonCodes\") > 0
        AND \"createdAt\" >= :'observation_start'::timestamptz
        AND \"createdAt\" <= :'observation_end'::timestamptz),
    'dailyDigestCount', (SELECT count(*) FROM \"AffiliateOperationalAlerts\"
      WHERE \"category\" = 'DAILY_DIGEST'
        AND \"createdAt\" >= :'cutover_session_start'::timestamptz
        AND \"createdAt\" <= :'final_observation_close'::timestamptz)
  );" \
  > "$ALERT_EXCEPTION_OUTPUT"
jq -e \
  --arg source "$OBSERVATION_SUPPLY_SOURCE_ID" \
  --arg market "$OBSERVATION_MARKET_KEY" \
  --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
  --arg cell "$OBSERVATION_COVERAGE_CELL_ID" \
  --arg cycle "$OBSERVATION_ASSESSMENT_CYCLE_ID" '
  (.alert.alertId | type == "string" and length > 0)
  and (.alert.alertEventKey | type == "string" and length > 0)
  and (.alert.alertCategory | type == "string" and length > 0)
  and (.alert.alertReasonCodes | type == "array" and length > 0)
  and (
    (.alert.alertReasonCodes | index("PROVIDER_FAILURE") != null)
    or (.alert.alertReasonCodes | index("DISCOVERY_PROVIDER_FAILURE") != null)
    or (.alert.alertReasonCodes | index("CAPTURE_PROVIDER_FAILURE") != null)
    or (.alert.alertReasonCodes | index("SOURCE_REFRESH_FAILED") != null)
    or (.alert.alertReasonCodes | index("AUTOMATIC_CAPTURE_FAILURE") != null)
    or (.alert.alertReasonCodes | index("AGENT_INVOCATION_FAILURE") != null)
    or (.alert.alertReasonCodes | index("AGENT_LEASE_EXPIRED") != null)
  )
  and .alert.sourceId == $source
  and .alert.marketKey == $market
  and .alert.rolloutCohort == $cohort
  and .alert.coverageCellId == $cell
  and .alert.assessmentCycleId == $cycle
  and (.delivery.deliveryId | type == "string" and length > 0)
  and .delivery.alertId == .alert.alertId
  and .delivery.status == "DELIVERED"
  and (.delivery.channel | type == "string" and length > 0)
  and (.delivery.deliveredAt | type == "string" and length > 0)
  and (.exceptionEvent.eventId | type == "string" and length > 0)
  and (.exceptionEvent.eventKey | type == "string" and length > 0)
  and (.exceptionEvent.jobId | type == "string" and length > 0)
  and (.exceptionEvent.claimId | type == "string" and length > 0)
  and (.exceptionEvent.sequence | type == "number" and . >= 0)
  and (.exceptionEvent.reasonCodes | type == "array" and length > 0)
  and .exceptionEvent.sourceId == $source
  and .exceptionEvent.marketKey == $market
  and .exceptionEvent.rolloutCohort == $cohort
  and .exceptionEvent.coverageCellId == $cell
  and .exceptionEvent.assessmentCycleId == $cycle
  and (.alertCount | type == "number" and . >= 1)
  and (.deliveredCount | type == "number" and . >= 1)
  and (.exceptionEventCount | type == "number" and . >= 1)
  and .dailyDigestCount == 0
' "$ALERT_EXCEPTION_OUTPUT"
```
### Dashboard projection scenarios

The authenticated dashboard must expose the exact retry, stale-generation,
provider-containment, alert, and delivered-alert records selected from the
read-only evidence above. A page-level count or an unselected dashboard is not
proof. Capture one response per scenario, require the selected detail and its
server-generated deep link, and require the corresponding projection row or
related delivery ID:

```text
export DASHBOARD_RETRY_JOB_ID="$(jq -er '.jobId' "$INVOCATION_RETRY_OUTPUT")"
export DASHBOARD_STALE_JOB_ID="$(jq -er '.jobId' "$STALE_GENERATION_OUTPUT")"
export DASHBOARD_PROVIDER_WAVE_ID="$(jq -er '.waveId' "$PROVIDER_FAILURE_OUTPUT")"
export DASHBOARD_ALERT_ID="$(jq -er '.alert.alertId' "$ALERT_EXCEPTION_OUTPUT")"
export DASHBOARD_DELIVERY_ID="$(jq -er '.delivery.deliveryId' "$ALERT_EXCEPTION_OUTPUT")"
export DASHBOARD_RETRY_FAILURE_EVENT_ID="$(jq -er '.failureEventId' "$INVOCATION_RETRY_OUTPUT")"
export DASHBOARD_RETRY_FAILURE_REASONS="$(jq -c '.failureReasonCodes' "$INVOCATION_RETRY_OUTPUT")"
export DASHBOARD_RETRY_STATUS="$(jq -er '.receiptStatus' "$INVOCATION_RETRY_OUTPUT")"
export DASHBOARD_STALE_EVENT_ID="$(jq -er '.eventId' "$STALE_GENERATION_OUTPUT")"
export DASHBOARD_STALE_REASONS="$(jq -c '.reasonCodes' "$STALE_GENERATION_OUTPUT")"
export DASHBOARD_STALE_CLAIM_STATUS="$(jq -er '.claimStatus' "$STALE_GENERATION_OUTPUT")"
export DASHBOARD_STALE_JOB_STATUS="$(jq -er '.jobStatus' "$STALE_GENERATION_OUTPUT")"
export DASHBOARD_PROVIDER_ALERT_ID="$(jq -er '.alertId' "$PROVIDER_FAILURE_OUTPUT")"
export DASHBOARD_PROVIDER_FAULT_EVENT_KEY="$(jq -er '.alertEventKey' "$PROVIDER_FAILURE_OUTPUT")"
export DASHBOARD_PROVIDER_FAULT_REASONS="$(jq -c '.alertReasonCodes' "$PROVIDER_FAILURE_OUTPUT")"
export DASHBOARD_PROVIDER_STATUS="$(jq -er '.status' "$PROVIDER_FAILURE_OUTPUT")"
export DASHBOARD_PROVIDER_ERROR_CODE="$(jq -er '.errorCode' "$PROVIDER_FAILURE_OUTPUT")"
jq -e \
  --arg exception_alert "$DASHBOARD_ALERT_ID" \
  --arg provider_alert "$DASHBOARD_PROVIDER_ALERT_ID" \
  '.alert.alertId == $exception_alert and .alert.alertId == $provider_alert' \
  "$ALERT_EXCEPTION_OUTPUT"
test -r "$ADMIN_COOKIE_FILE"
fetch_dashboard_scenario() {
  local view="$1"
  local detail_type="$2"
  local detail_id="$3"
  local output="$4"
  local query
  test ! -e "$output"
  test ! -L "$output"
  query="$(
    jq -rn \
      --arg base "$DASHBOARD_BASE_URL" \
      --arg view "$view" \
      --arg detail_type "$detail_type" \
      --arg detail_id "$detail_id" \
      --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
      --arg version "$ACTIVE_SUPPLY_CONTRACT_VERSION" \
      '$base + "/api/admin/affiliate-operations?view=" + ($view | @uri)
       + "&page=1&pageSize=50&rolloutCohort=" + ($cohort | @uri)
       + "&contractVersion=" + ($version | @uri)
       + "&selectedType=" + ($detail_type | @uri)
       + "&selected=" + ($detail_id | @uri)'
  )"
  curl --fail --silent --show-error \
    --cookie "$ADMIN_COOKIE_FILE" \
    "$query" > "$output"
  jq -e \
    --arg view "$view" \
    --arg detail_type "$detail_type" \
    --arg detail_id "$detail_id" \
    --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
    --arg version "$ACTIVE_SUPPLY_CONTRACT_VERSION" '
    .schemaVersion == 2
    and .stale == false
    and .view == $view
    and .contract.contractVersion == ($version | tonumber)
    and .selected.id == $detail_id
    and .selected.kind == $detail_type
    and .selected.href == (
      "/admin?tab=affiliateOperations&view=" + ($view | @uri)
      + "&selectedType=" + ($detail_type | @uri)
      + "&selected=" + ($detail_id | @uri)
      + "&rolloutCohort=" + ($cohort | @uri)
      + "&contractVersion=" + ($version | @uri)
    )
  ' "$output"
}
export DASHBOARD_RETRY_OUTPUT=/path/to/affiliate-governed-private/dashboard-retry.json
export DASHBOARD_STALE_OUTPUT=/path/to/affiliate-governed-private/dashboard-stale-generation.json
export DASHBOARD_PROVIDER_OUTPUT=/path/to/affiliate-governed-private/dashboard-provider-failure.json
export DASHBOARD_ALERT_OUTPUT=/path/to/affiliate-governed-private/dashboard-alert-delivery.json
fetch_dashboard_scenario jobs job "$DASHBOARD_RETRY_JOB_ID" "$DASHBOARD_RETRY_OUTPUT"
fetch_dashboard_scenario jobs job "$DASHBOARD_STALE_JOB_ID" "$DASHBOARD_STALE_OUTPUT"
fetch_dashboard_scenario coverage wave "$DASHBOARD_PROVIDER_WAVE_ID" "$DASHBOARD_PROVIDER_OUTPUT"
fetch_dashboard_scenario alerts alert "$DASHBOARD_PROVIDER_ALERT_ID" "$DASHBOARD_ALERT_OUTPUT"
jq -e --arg id "$DASHBOARD_RETRY_JOB_ID" '
  any(.jobs.rows[]?; .id == $id and (.href | type == "string" and contains($id)))
' "$DASHBOARD_RETRY_OUTPUT"
jq -e --arg id "$DASHBOARD_STALE_JOB_ID" '
  any(.jobs.rows[]?; .id == $id and (.href | type == "string" and contains($id)))
' "$DASHBOARD_STALE_OUTPUT"
jq -e \
  --arg wave "$DASHBOARD_PROVIDER_WAVE_ID" \
  --arg status "$DASHBOARD_PROVIDER_STATUS" \
  --arg error_code "$DASHBOARD_PROVIDER_ERROR_CODE" \
  --arg operation_key "$(jq -er '.providerOperationKey' "$PROVIDER_FAILURE_OUTPUT")" '
  .selected.id == $wave
  and any(.selected.sections[]?.fields[]?;
    .label == "Status" and .value == $status
  )
  and any(.selected.sections[]?.fields[]?;
    .label == "Error code" and .value == $error_code
  )
  and any(.selected.sections[]?.fields[]?;
    .label == "Provider operation key" and .value == $operation_key
  )
  and any(.selected.sections[]?.fields[]?;
    ((.value | tostring) == $wave)
    or (((.href // "") | tostring) | contains($wave))
  )
' "$DASHBOARD_PROVIDER_OUTPUT"
jq -e \
  --arg provider_alert "$DASHBOARD_PROVIDER_ALERT_ID" \
  --arg event_key "$DASHBOARD_PROVIDER_FAULT_EVENT_KEY" \
  --argjson reasons "$DASHBOARD_PROVIDER_FAULT_REASONS" '
  .selected.id == $provider_alert
  and any(.selected.sections[]?.fields[]?;
    .label == "Event key" and .value == $event_key
  )
  and any(.selected.sections[]?.fields[]?;
    .label == "Reason codes"
    and (
      (.value | tostring) as $value
      | all($reasons[]; . as $reason | $value | contains($reason))
    )
  )
' "$DASHBOARD_ALERT_OUTPUT"
jq -e \
  --arg alert "$DASHBOARD_ALERT_ID" \
  --arg provider_alert "$DASHBOARD_PROVIDER_ALERT_ID" \
  --arg delivery "$DASHBOARD_DELIVERY_ID" '
  any(.alerts.rows[]?; .id == $alert and .deliveryCount >= 1 and .latestDeliveryStatus == "DELIVERED")
  and .selected.id == $provider_alert
  and any(.selected.related[]?; .kind == "ALERT_DELIVERY" and .id == $delivery)
' "$DASHBOARD_ALERT_OUTPUT"
jq -e \
  --arg event "$DASHBOARD_RETRY_FAILURE_EVENT_ID" \
  --arg status "$DASHBOARD_RETRY_STATUS" \
  --argjson reasons "$DASHBOARD_RETRY_FAILURE_REASONS" '
  (.selected | tostring) as $selected
  | ($selected | contains($event))
  and ($selected | contains("CLAIM_INVOCATION_FAILED"))
  and ($selected | contains($status))
  and all($reasons[]; . as $reason | $selected | contains($reason))
' "$DASHBOARD_RETRY_OUTPUT"
jq -e \
  --arg event "$DASHBOARD_STALE_EVENT_ID" \
  --arg claim_status "$DASHBOARD_STALE_CLAIM_STATUS" \
  --arg job_status "$DASHBOARD_STALE_JOB_STATUS" \
  --argjson reasons "$DASHBOARD_STALE_REASONS" '
  (.selected | tostring) as $selected
  | ($selected | contains($event))
  and ($selected | contains("CLAIM_INVOCATION_FAILED"))
  and ($selected | contains($claim_status))
  and ($selected | contains($job_status))
  and all($reasons[]; . as $reason | $selected | contains($reason))
' "$DASHBOARD_STALE_OUTPUT"
jq -e \
  --arg alert "$DASHBOARD_ALERT_ID" \
  --arg delivery "$DASHBOARD_DELIVERY_ID" \
  --arg delivery_status "$(jq -er '.delivery.status' "$ALERT_EXCEPTION_OUTPUT")" \
  --argjson reasons "$(jq -c '.alert.alertReasonCodes' "$ALERT_EXCEPTION_OUTPUT")" '
  (.selected | tostring) as $selected
  | ($selected | contains($alert))
  and ($selected | contains($delivery))
  and ($selected | contains($delivery_status))
  and all($reasons[]; . as $reason | $selected | contains($reason))
' "$DASHBOARD_ALERT_OUTPUT"
```

The four response files are redacted projection evidence only. Do not treat a
successful HTTP status, an aggregate count, or a manually constructed URL as a
selected-row proof.
```text
(
  for dashboard_evidence_path in \
    "$CANARY_ADMISSION_LEASE_OUTPUT" \
    "$CANARY_ADMISSION_CONSUMED_OUTPUT" \
    "$INVOCATION_RETRY_OUTPUT" \
    "$STALE_GENERATION_OUTPUT" \
    "$PROVIDER_FAILURE_OUTPUT" \
    "$ALERT_EXCEPTION_OUTPUT" \
    "$LINEAGE_OUTPUT" \
    "$DASHBOARD_RETRY_OUTPUT" \
    "$DASHBOARD_STALE_OUTPUT" \
    "$DASHBOARD_PROVIDER_OUTPUT" \
    "$DASHBOARD_ALERT_OUTPUT" \
    "/path/to/affiliate-governed-private/MAPPING_PRODUCER.mapping-producer-1.lease.json" \
    "/path/to/affiliate-governed-private/MAPPING_PRODUCER.mapping-producer-1.receipt.json" \
    "/path/to/affiliate-governed-private/MAPPING_PRODUCER.mapping-producer-2.lease.json" \
    "/path/to/affiliate-governed-private/MAPPING_PRODUCER.mapping-producer-2.receipt.json" \
    "/path/to/affiliate-governed-private/SUPPLY_REVIEWER.supply-reviewer-1.lease.json" \
    "/path/to/affiliate-governed-private/SUPPLY_REVIEWER.supply-reviewer-1.receipt.json" \
    "/path/to/affiliate-governed-private/SUPPLY_REVIEWER.supply-reviewer-2.lease.json" \
    "/path/to/affiliate-governed-private/SUPPLY_REVIEWER.supply-reviewer-2.receipt.json"; do
    test -e "$dashboard_evidence_path"
    test ! -L "$dashboard_evidence_path"
  done
  shasum -a 256 \
    "$CANARY_ADMISSION_LEASE_OUTPUT" \
    "$CANARY_ADMISSION_CONSUMED_OUTPUT" \
    "$INVOCATION_RETRY_OUTPUT" \
    "$STALE_GENERATION_OUTPUT" \
    "$PROVIDER_FAILURE_OUTPUT" \
    "$ALERT_EXCEPTION_OUTPUT" \
    "$LINEAGE_OUTPUT" \
    "$DASHBOARD_RETRY_OUTPUT" \
    "$DASHBOARD_STALE_OUTPUT" \
    "$DASHBOARD_PROVIDER_OUTPUT" \
    "$DASHBOARD_ALERT_OUTPUT" \
    "/path/to/affiliate-governed-private/MAPPING_PRODUCER.mapping-producer-1.lease.json" \
    "/path/to/affiliate-governed-private/MAPPING_PRODUCER.mapping-producer-1.receipt.json" \
    "/path/to/affiliate-governed-private/MAPPING_PRODUCER.mapping-producer-2.lease.json" \
    "/path/to/affiliate-governed-private/MAPPING_PRODUCER.mapping-producer-2.receipt.json" \
    "/path/to/affiliate-governed-private/SUPPLY_REVIEWER.supply-reviewer-1.lease.json" \
    "/path/to/affiliate-governed-private/SUPPLY_REVIEWER.supply-reviewer-1.receipt.json" \
    "/path/to/affiliate-governed-private/SUPPLY_REVIEWER.supply-reviewer-2.lease.json" \
    "/path/to/affiliate-governed-private/SUPPLY_REVIEWER.supply-reviewer-2.receipt.json"
) >> /path/to/affiliate-governed-private/deployment-evidence.sha256
```


### Portland before Seattle

Start and prove the Portland–Vancouver cohort only. Recompute a fresh
read-only artifact from the reviewed database after observation admission is
closed; do not reuse a static fixture or overwrite an earlier hashed artifact.
Every source row is constrained to the current session, market, reviewed
cohort, coverage cell, and assessment cycle:

```text
export ROLLOUT_MARKET=portland-vancouver
test "$ROLLOUT_MARKET" = "portland-vancouver"
test "$OBSERVATION_MARKET_KEY" = "$ROLLOUT_MARKET"
export PORTLAND_COHORT_EVIDENCE=/path/to/affiliate-governed-private/portland-vancouver-cohort.json
export PORTLAND_CAPTURE_ARTIFACT_ID=REPLACE_WITH_REVIEWED_PORTLAND_CAPTURE_ARTIFACT_ID
test ! -e "$PORTLAND_COHORT_EVIDENCE"
test ! -L "$PORTLAND_COHORT_EVIDENCE"
assert_non_placeholder_identity "$PORTLAND_CAPTURE_ARTIFACT_ID" "PORTLAND_CAPTURE_ARTIFACT_ID"
(
  umask 077
  set -o noclobber
  : > "$PORTLAND_COHORT_EVIDENCE"
  psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
    -v session_id="$CUTOVER_SESSION_ID" \
    -v market_key="$OBSERVATION_MARKET_KEY" \
    -v rollout_cohort="$OBSERVATION_ROLLOUT_COHORT" \
    -v source_id="$OBSERVATION_SUPPLY_SOURCE_ID" \
    -v coverage_cell_id="$OBSERVATION_COVERAGE_CELL_ID" \
    -v assessment_cycle_id="$OBSERVATION_ASSESSMENT_CYCLE_ID" \
    -v capture_artifact_id="$PORTLAND_CAPTURE_ARTIFACT_ID" \
    -Atc "
    WITH scoped_source AS (
      SELECT \"id\", \"rolloutCohort\", \"activeSupplyContractVersion\", \"activeSupplyContractHash\"
      FROM \"AffiliateSupplySources\"
      WHERE \"id\" = :'source_id'
        AND \"rolloutCohort\" = :'rollout_cohort'
    ),
    scoped_jobs AS (
      SELECT DISTINCT j.\"id\"
      FROM \"AffiliateAgentGatewayJobs\" j
      CROSS JOIN scoped_source s
      JOIN \"AffiliateCoverageCells\" cc
        ON cc.\"id\" = :'coverage_cell_id'
       AND cc.\"marketKey\" = :'market_key'
       AND cc.\"cohort\" = s.\"rolloutCohort\"
      JOIN \"AffiliateCoverageCellAssessments\" ca
        ON ca.\"cellId\" = cc.\"id\"
       AND ca.\"cycleKey\" = :'assessment_cycle_id'
      JOIN \"AffiliateSupplyContractManifests\" cm
        ON cm.\"rolloutCohort\" = s.\"rolloutCohort\"
       AND cm.\"version\" = s.\"activeSupplyContractVersion\"
       AND cm.\"contractHash\" = s.\"activeSupplyContractHash\"
       AND cm.\"status\" = 'ACTIVE'
      WHERE j.\"role\" <> 'COVERAGE_PLANNER'
        AND j.\"supplySourceId\" = s.\"id\"
      UNION
      SELECT DISTINCT j.\"id\"
      FROM \"AffiliateAgentGatewayJobs\" j
      CROSS JOIN scoped_source s
      JOIN \"AffiliateReplenishmentWaves\" w
        ON w.\"coveragePlanningJobId\" = j.\"id\"
       AND w.\"campaignId\" IS NOT NULL
      JOIN \"AffiliateReplenishmentDemands\" d
        ON d.\"id\" = w.\"demandId\"
      JOIN \"AffiliateCoverageCells\" cc
        ON cc.\"id\" = d.\"targetKey\"
       AND cc.\"marketKey\" = d.\"marketKey\"
       AND cc.\"sportId\" = d.\"sportId\"
       AND cc.\"profileKey\" = d.\"sourceProfile\"
      JOIN \"AffiliateCoverageCellAssessments\" ca
        ON ca.\"cellId\" = cc.\"id\"
       AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
      JOIN \"AffiliateSourceDiscoveryCampaigns\" campaign
        ON campaign.\"id\" = w.\"campaignId\"
      JOIN \"AffiliateSupplyContractManifests\" cm
        ON cm.\"rolloutCohort\" = s.\"rolloutCohort\"
       AND cm.\"version\" = s.\"activeSupplyContractVersion\"
       AND cm.\"contractHash\" = s.\"activeSupplyContractHash\"
       AND cm.\"status\" = 'ACTIVE'
      WHERE j.\"role\" = 'COVERAGE_PLANNER'
        AND j.\"supplySourceId\" IS NULL
        AND cc.\"marketKey\" = :'market_key'
        AND cc.\"cohort\" = s.\"rolloutCohort\"
        AND cc.\"id\" = :'coverage_cell_id'
        AND ca.\"cycleKey\" = :'assessment_cycle_id'
    ),
    scoped_waves AS (
      SELECT w.\"id\", w.\"status\", w.\"errorCode\"
      FROM \"AffiliateReplenishmentWaves\" w
      JOIN \"AffiliateReplenishmentDemands\" d ON d.\"id\" = w.\"demandId\"
      JOIN \"AffiliateAgentGatewayJobs\" j ON j.\"id\" = w.\"coveragePlanningJobId\"
      JOIN scoped_jobs sj ON sj.\"id\" = j.\"id\"
      WHERE w.\"rolloutCohort\" = :'rollout_cohort'
        AND d.\"marketKey\" = :'market_key'
    ),
    scoped_lifecycle AS (
      SELECT l.\"id\", l.\"command\", l.\"toStage\"
      FROM \"AffiliateSupplyLifecycleTransitions\" l
      JOIN scoped_source s ON s.\"id\" = l.\"supplySourceId\"
      WHERE l.\"command\" IN ('RECORD_MAPPING', 'APPROVE', 'ACTIVATE', 'PUBLISH_TARGET')
        AND l.\"evidenceRefs\" @> ARRAY['supply-source:' || s.\"id\"]::text[]
    ),
    scoped_targets AS (
      SELECT t.\"id\", t.\"status\", t.\"publishedAt\"
      FROM \"AffiliateSupplyTargets\" t
      JOIN scoped_source s ON s.\"id\" = t.\"supplySourceId\"
      WHERE t.\"marketKey\" = :'market_key'
    ),
    scoped_publication AS (
      SELECT \"id\", \"status\", \"publishedAt\"
      FROM scoped_targets
      WHERE \"status\" = 'PUBLISHED'
        AND \"publishedAt\" IS NOT NULL
    ),
    joined_cycle AS (
      SELECT
        session.\"id\" AS session_id,
        gj.\"id\" AS gateway_job_id,
        w.\"id\" AS wave_id,
        campaign.\"id\" AS campaign_id,
        dr.\"id\" AS discovery_run_id,
        dq.\"id\" AS discovery_query_id,
        ds.\"id\" AS discovery_result_id,
        ir.\"id\" AS capture_run_id,
        ia.\"id\" AS capture_artifact_id,
        ia.\"kind\" AS capture_artifact_kind,
        mj.\"id\" AS mapping_job_id,
        mj.\"mappingId\" AS mapping_id,
        aj.\"id\" AS approval_job_id,
        activation.\"id\" AS activation_transition_id,
        st.\"id\" AS target_id,
        publication.\"id\" AS publication_transition_id
      FROM \"AffiliateSupplyReconciliationRuns\" session
      JOIN \"AffiliateAgentGatewayJobs\" gj
        ON gj.\"role\" = 'COVERAGE_PLANNER'
       AND gj.\"supplySourceId\" IS NULL
      JOIN \"AffiliateReplenishmentWaves\" w
        ON w.\"coveragePlanningJobId\" = gj.\"id\"
       AND w.\"campaignId\" IS NOT NULL
      JOIN \"AffiliateReplenishmentDemands\" d
        ON d.\"id\" = w.\"demandId\"
       AND d.\"marketKey\" = :'market_key'
       AND d.\"rolloutCohort\" = :'rollout_cohort'
      JOIN \"AffiliateCoverageCells\" cc
        ON cc.\"id\" = d.\"targetKey\"
       AND cc.\"marketKey\" = d.\"marketKey\"
       AND cc.\"sportId\" = d.\"sportId\"
       AND cc.\"profileKey\" = d.\"sourceProfile\"
       AND cc.\"id\" = :'coverage_cell_id'
       AND cc.\"cohort\" = :'rollout_cohort'
      JOIN \"AffiliateCoverageCellAssessments\" ca
        ON ca.\"cellId\" = cc.\"id\"
       AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
       AND ca.\"cycleKey\" = :'assessment_cycle_id'
      JOIN \"AffiliateSourceDiscoveryCampaigns\" campaign
        ON campaign.\"id\" = w.\"campaignId\"
      JOIN \"AffiliateSourceDiscoveryRuns\" dr
        ON dr.\"campaignId\" = campaign.\"id\"
       AND dr.\"status\" IN ('SUCCEEDED', 'COMPLETED')
      JOIN \"AffiliateSourceDiscoveryQueryExecutions\" dq
        ON dq.\"runId\" = dr.\"id\"
       AND dq.\"campaignId\" = campaign.\"id\"
       AND dq.\"status\" IN ('SUCCEEDED', 'COMPLETED')
       AND dq.\"sportId\" = cc.\"sportId\"
       AND dq.\"profileKey\" = cc.\"profileKey\"
      JOIN \"AffiliateCoverageCities\" city
        ON city.\"id\" = cc.\"cityId\"
       AND dq.\"cityGeoid\" = city.\"placeGeoid\"
      JOIN \"AffiliateSourceDiscoveryResults\" ds
        ON ds.\"campaignId\" = campaign.\"id\"
       AND ds.\"latestRunId\" = dr.\"id\"
       AND ds.\"supplySourceId\" = :'source_id'
      JOIN \"AffiliateSupplySources\" ss
        ON ss.\"id\" = ds.\"supplySourceId\"
       AND ss.\"id\" = :'source_id'
       AND ss.\"rolloutCohort\" = cc.\"cohort\"
      JOIN \"AffiliateSupplyTargets\" st
        ON st.\"supplySourceId\" = ss.\"id\"
       AND st.\"marketKey\" = cc.\"marketKey\"
       AND st.\"sportId\" = cc.\"sportId\"
       AND st.\"sourceProfile\" = cc.\"profileKey\"
       AND st.\"status\" = 'PUBLISHED'
       AND st.\"publishedAt\" IS NOT NULL
      JOIN \"AffiliateSourceIntakeRuns\" ir
        ON ir.\"intakeId\" = ds.\"matchingIntakeId\"
       AND ir.\"supplySourceId\" = ss.\"id\"
       AND ir.\"status\" IN ('SUCCEEDED', 'COMPLETED')
      JOIN \"AffiliateSourceIntakeArtifacts\" ia
        ON ia.\"id\" = :'capture_artifact_id'
       AND ia.\"runId\" = ir.\"id\"
       AND ia.\"intakeId\" = ds.\"matchingIntakeId\"
       AND ia.\"supplySourceId\" = ss.\"id\"
       AND ia.\"kind\" IN ('PAGE_HTML', 'PAGE_MARKDOWN')
      JOIN \"AffiliateSourceMappingJobs\" mj
        ON mj.\"intakeId\" = ds.\"matchingIntakeId\"
       AND mj.\"supplySourceId\" = ss.\"id\"
       AND mj.\"status\" = 'APPROVED'
       AND mj.\"mappingId\" IS NOT NULL
      JOIN \"AffiliateScrapeSources\" scrape_source
        ON scrape_source.\"id\" = mj.\"sourceId\"
       AND scrape_source.\"supplySourceId\" = ss.\"id\"
      JOIN \"AffiliateApprovalJobs\" aj
        ON aj.\"supplySourceId\" = ss.\"id\"
       AND aj.\"subjectType\" = 'MAPPING_PACKAGE'
       AND aj.\"subjectKey\" = mj.\"mappingId\"
       AND aj.\"status\" = 'APPROVED'
      JOIN \"AffiliateSupplyLifecycleTransitions\" activation
        ON activation.\"supplySourceId\" = ss.\"id\"
       AND activation.\"command\" = 'ACTIVATE'
       AND COALESCE(
         activation.\"requestJson\"->>'mappingId',
         activation.\"resultJson\"->>'mappingId'
       ) = mj.\"mappingId\"
      JOIN \"AffiliateSupplyLifecycleTransitions\" publication
        ON publication.\"supplySourceId\" = ss.\"id\"
       AND publication.\"command\" = 'PUBLISH_TARGET'
       AND (
         publication.\"requestJson\"->>'targetId' = st.\"id\"
         OR publication.\"resultJson\"->>'targetId' = st.\"id\"
         OR publication.\"requestJson\"->>'candidateId' = st.\"candidateId\"
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(
             COALESCE(publication.\"requestJson\"->'targets', '[]'::jsonb)
           ) publication_target
           WHERE publication_target->>'targetId' = st.\"id\"
         )
       )
      WHERE session.\"rolloutCohort\" = :'rollout_cohort'
        AND session.\"reportJson\"->>'cutoverSessionId' = :'session_id'
        AND session.\"status\" = 'APPLIED'
    ),
    scoped_runs AS (
      SELECT
        r.\"id\",
        r.\"status\",
        (SELECT count(*) FROM scoped_jobs) AS gateway_job_count,
        (SELECT count(*) FROM scoped_waves) AS wave_count,
        (SELECT count(DISTINCT \"command\") FROM scoped_lifecycle) AS lifecycle_command_count,
        (SELECT count(*) FROM scoped_targets) AS target_count,
        (SELECT count(*) FROM scoped_publication) AS publication_count
      FROM \"AffiliateSupplyReconciliationRuns\" r
      WHERE r.\"rolloutCohort\" = :'rollout_cohort'
        AND r.\"reportJson\"->>'cutoverSessionId' = :'session_id'
    ),
    scoped_alerts AS (
      SELECT a.\"id\", a.\"reasonCodes\"
      FROM \"AffiliateOperationalAlerts\" a
      LEFT JOIN \"AffiliateReplenishmentWaves\" w
        ON w.\"id\" = COALESCE(a.\"waveId\", a.\"payload\"->>'waveId')
      LEFT JOIN \"AffiliateReplenishmentDemands\" d ON d.\"id\" = w.\"demandId\"
      LEFT JOIN \"AffiliateAgentGatewayJobs\" j
        ON j.\"id\" = w.\"coveragePlanningJobId\"
      JOIN \"AffiliateSupplySources\" s
        ON s.\"id\" = a.\"supplySourceId\"
       AND s.\"id\" = :'source_id'
       AND s.\"rolloutCohort\" = :'rollout_cohort'
      LEFT JOIN \"AffiliateCoverageCells\" cc
        ON cc.\"id\" = COALESCE(a.\"coverageCellId\", d.\"targetKey\")
      LEFT JOIN \"AffiliateCoverageCellAssessments\" ca
        ON ca.\"cellId\" = cc.\"id\"
       AND ca.\"cycleKey\" = :'assessment_cycle_id'
       AND (
         j.\"role\" <> 'COVERAGE_PLANNER'
         OR ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
       )
      JOIN \"AffiliateSupplyContractManifests\" cm
        ON cm.\"rolloutCohort\" = s.\"rolloutCohort\"
       AND cm.\"version\" = s.\"activeSupplyContractVersion\"
       AND cm.\"contractHash\" = s.\"activeSupplyContractHash\"
       AND cm.\"status\" = 'ACTIVE'
      WHERE a.\"rolloutCohort\" = :'rollout_cohort'
        AND a.\"supplySourceId\" = :'source_id'
        AND cc.\"id\" = :'coverage_cell_id'
        AND cc.\"marketKey\" = :'market_key'
        AND cc.\"cohort\" = s.\"rolloutCohort\"
        AND ca.\"cycleKey\" = :'assessment_cycle_id'
        AND (
          j.\"role\" IS NULL
          OR j.\"role\" <> 'COVERAGE_PLANNER'
          OR (
            j.\"supplySourceId\" IS NULL
            AND w.\"coveragePlanningJobId\" = j.\"id\"
            AND d.\"targetKey\" = cc.\"id\"
            AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
          )
        )
        AND (
          w.\"id\" IS NULL
          OR (
            w.\"rolloutCohort\" = s.\"rolloutCohort\"
            AND d.\"rolloutCohort\" = s.\"rolloutCohort\"
            AND d.\"targetKey\" = cc.\"id\"
            AND d.\"marketKey\" = cc.\"marketKey\"
            AND d.\"contractVersion\" = cm.\"version\"
            AND d.\"contractHash\" = cm.\"contractHash\"
          )
        )
    )
    SELECT json_build_object(
      'cutoverSessionId', :'session_id',
      'generatedAt', CURRENT_TIMESTAMP,
      'marketKey', :'market_key',
      'rolloutCohort', :'rollout_cohort',
      'assessmentCycleId', :'assessment_cycle_id',
      'cycleComplete', (SELECT count(*) = 1 FROM joined_cycle),
      'joinedCycleCount', (SELECT count(*) FROM joined_cycle),
      'joinedCycle', COALESCE(
        (
          SELECT json_build_object(
            'gatewayJobId', gateway_job_id,
            'waveId', wave_id,
            'campaignId', campaign_id,
            'discoveryRunId', discovery_run_id,
            'discoveryQueryId', discovery_query_id,
            'discoveryResultId', discovery_result_id,
            'captureRunId', capture_run_id,
            'captureArtifactKind', capture_artifact_kind,
            'captureArtifactId', capture_artifact_id,
            'mappingJobId', mapping_job_id,
            'mappingId', mapping_id,
            'approvalJobId', approval_job_id,
            'activationTransitionId', activation_transition_id,
            'targetId', target_id,
            'publicationTransitionId', publication_transition_id
          )
          FROM joined_cycle
        ),
        '{}'::json
      ),
      'invariantFailures', (
        SELECT count(*) FROM scoped_alerts
        WHERE \"reasonCodes\" && ARRAY[
          'INVARIANT_FAILURE', 'INVARIANT_VIOLATION'
        ]::text[]
      ),
      'reconciliationFailures', (
        SELECT count(*) FROM scoped_runs WHERE \"status\" <> 'APPLIED'
      ),
      'providerFailures', (
        SELECT count(*) FROM scoped_waves
        WHERE \"status\" IN ('FAILED', 'PAUSED')
          AND \"errorCode\" IN (
            'PROVIDER_FAILURE',
            'DISCOVERY_PROVIDER_FAILURE',
            'CAPTURE_PROVIDER_FAILURE'
          )
      ),
      'alertDeliveryFailures', (
        SELECT count(*)
        FROM \"AffiliateOperationalAlertDeliveries\" d
        JOIN scoped_alerts a ON a.\"id\" = d.\"alertId\"
        WHERE d.\"status\" <> 'DELIVERED'
      ),
      'lineageIds', json_build_object(
        'gatewayJobIds', COALESCE(
          (SELECT json_agg(\"id\" ORDER BY \"id\") FROM scoped_jobs),
          '[]'::json
        ),
        'reconciliationRunIds', COALESCE(
          (SELECT json_agg(\"id\" ORDER BY \"id\") FROM scoped_runs),
          '[]'::json
        ),
        'waveIds', COALESCE(
          (SELECT json_agg(\"id\" ORDER BY \"id\") FROM scoped_waves),
          '[]'::json
        ),
        'lifecycleTransitionIds', COALESCE(
          (SELECT json_agg(\"id\" ORDER BY \"id\") FROM scoped_lifecycle),
          '[]'::json
        ),
        'targetIds', COALESCE(
          (SELECT json_agg(\"id\" ORDER BY \"id\") FROM scoped_targets),
          '[]'::json
        ),
        'publicationTargetIds', COALESCE(
          (SELECT json_agg(\"id\" ORDER BY \"id\") FROM scoped_publication),
          '[]'::json
        ),
        'alertIds', COALESCE(
          (SELECT json_agg(\"id\" ORDER BY \"id\") FROM scoped_alerts),
          '[]'::json
        )
      )
    );" >> "$PORTLAND_COHORT_EVIDENCE"
)
test -s "$PORTLAND_COHORT_EVIDENCE"
jq -e \
  --arg session "$CUTOVER_SESSION_ID" \
  --arg market "$ROLLOUT_MARKET" \
  --arg cohort "$OBSERVATION_ROLLOUT_COHORT" \
  --arg cycle "$OBSERVATION_ASSESSMENT_CYCLE_ID" \
  --arg capture_artifact "$PORTLAND_CAPTURE_ARTIFACT_ID" '
  .cutoverSessionId == $session
  and .marketKey == $market
  and .rolloutCohort == $cohort
  and .assessmentCycleId == $cycle
  and (.generatedAt | type == "string" and length > 0)
  and .cycleComplete == true
  and .joinedCycleCount == 1
  and (.joinedCycle
    | type == "object"
    and (keys | sort) == [
      "activationTransitionId", "approvalJobId", "campaignId",
      "captureArtifactId", "captureArtifactKind", "captureRunId",
      "discoveryQueryId", "discoveryResultId", "discoveryRunId",
      "gatewayJobId", "mappingId", "mappingJobId",
      "publicationTransitionId", "targetId", "waveId"
    ]
    and all(.[]; type == "string" and length > 0)
    and .captureArtifactId == $capture_artifact
    and (.captureArtifactKind as $kind
      | (["PAGE_HTML", "PAGE_MARKDOWN"] | index($kind) != null))
  )
  and .invariantFailures == 0
  and .reconciliationFailures == 0
  and .providerFailures == 0
  and .alertDeliveryFailures == 0
  and (.lineageIds | type == "object" and length >= 7)
  and (.lineageIds.gatewayJobIds | type == "array" and length > 0)
  and (.lineageIds.reconciliationRunIds | type == "array" and length > 0)
  and (.lineageIds.waveIds | type == "array" and length > 0)
  and (.lineageIds.lifecycleTransitionIds | type == "array" and length > 0)
  and (.lineageIds.targetIds | type == "array" and length > 0)
  and (.lineageIds.publicationTargetIds | type == "array" and length > 0)
  and (.lineageIds.alertIds | type == "array" and length > 0)
' "$PORTLAND_COHORT_EVIDENCE"
shasum -a 256 "$PORTLAND_COHORT_EVIDENCE" \
  >> /path/to/affiliate-governed-private/deployment-evidence.sha256
```

This file must contain observed production values. Do not create a passing
fixture. Record a separate current authorization before any Seattle–Tacoma
assignment. Require a new cohort evidence file and keep the Portland file
immutable. If the Portland gate is missing or fails, do not set
`ROLLOUT_MARKET=seattle-tacoma`.

### Separate provider-failure drill

The Portland artifact is a clean-cycle gate: its `providerFailures` value must
remain zero. A failure drill is a separate observation and must never be
represented by changing the Portland JSON or by inserting a synthetic row.
Obtain separate current authorization and query one real failed or paused wave
from the durable provider/discovery lineage. Keep this file separate from the
Portland `cycleComplete` gate. Record it only under the
`providerFailureDrill` entry in the production-evidence manifest.

```text
assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
: "${FAILURE_DRILL_AUTHORIZATION_ID:?Set separate current provider-failure-drill authorization}"
assert_non_placeholder_identity "$FAILURE_DRILL_AUTHORIZATION_ID" "FAILURE_DRILL_AUTHORIZATION_ID"
export FAILURE_DRILL_SOURCE_ID=REPLACE_WITH_REVIEWED_FAILURE_DRILL_SUPPLY_SOURCE_ID
export FAILURE_DRILL_MARKET_KEY=REPLACE_WITH_REVIEWED_FAILURE_DRILL_MARKET_KEY
export FAILURE_DRILL_ROLLOUT_COHORT=REPLACE_WITH_REVIEWED_FAILURE_DRILL_ROLLOUT_COHORT
export FAILURE_DRILL_COVERAGE_CELL_ID=REPLACE_WITH_REVIEWED_FAILURE_DRILL_COVERAGE_CELL_ID
export FAILURE_DRILL_ASSESSMENT_CYCLE_ID=REPLACE_WITH_REVIEWED_FAILURE_DRILL_ASSESSMENT_CYCLE_ID
export FAILURE_DRILL_OBSERVATION_START=REPLACE_WITH_REVIEWED_FAILURE_DRILL_START
export FAILURE_DRILL_OBSERVATION_END=REPLACE_WITH_REVIEWED_FAILURE_DRILL_END
: "${FAILURE_DRILL_OBSERVATION_START:?Set provider-failure-drill start timestamp}"
: "${FAILURE_DRILL_OBSERVATION_END:?Set provider-failure-drill end timestamp}"
for failure_drill_identity in \
  "$FAILURE_DRILL_SOURCE_ID" \
  "$FAILURE_DRILL_MARKET_KEY" \
  "$FAILURE_DRILL_ROLLOUT_COHORT" \
  "$FAILURE_DRILL_COVERAGE_CELL_ID" \
  "$FAILURE_DRILL_ASSESSMENT_CYCLE_ID"; do
  assert_non_placeholder_identity "$failure_drill_identity" "FAILURE_DRILL_IDENTITY"
done
test "$FAILURE_DRILL_SOURCE_ID:$FAILURE_DRILL_MARKET_KEY:$FAILURE_DRILL_ROLLOUT_COHORT:$FAILURE_DRILL_COVERAGE_CELL_ID:$FAILURE_DRILL_ASSESSMENT_CYCLE_ID" != \
  "$OBSERVATION_SUPPLY_SOURCE_ID:$OBSERVATION_MARKET_KEY:$OBSERVATION_ROLLOUT_COHORT:$OBSERVATION_COVERAGE_CELL_ID:$OBSERVATION_ASSESSMENT_CYCLE_ID"
export FAILURE_DRILL_OUTPUT=/path/to/affiliate-governed-private/provider-failure-drill.redacted.json
test ! -e "$FAILURE_DRILL_OUTPUT"
test ! -L "$FAILURE_DRILL_OUTPUT"
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  -v source_id="$FAILURE_DRILL_SOURCE_ID" \
  -v market_key="$FAILURE_DRILL_MARKET_KEY" \
  -v rollout_cohort="$FAILURE_DRILL_ROLLOUT_COHORT" \
  -v coverage_cell_id="$FAILURE_DRILL_COVERAGE_CELL_ID" \
  -v assessment_cycle_id="$FAILURE_DRILL_ASSESSMENT_CYCLE_ID" \
  -v observation_start="$FAILURE_DRILL_OBSERVATION_START" \
  -v observation_end="$FAILURE_DRILL_OBSERVATION_END" \
  -Atc "
  SELECT json_build_object(
    'drill', 'PROVIDER_FAILURE',
    'waveId', w.\"id\",
    'campaignId', campaign.\"id\",
    'discoveryRunId', dr.\"id\",
    'discoveryQueryId', dq.\"id\",
    'discoveryResultId', ds.\"id\",
    'sourceId', ss.\"id\",
    'targetId', st.\"id\",
    'provider', w.\"provider\",
    'providerOperationKey', w.\"providerOperationKey\",
    'status', w.\"status\",
    'errorCode', w.\"errorCode\",
    'alertId', a.\"id\",
    'alertEventKey', a.\"eventKey\",
    'alertReasonCodes', a.\"reasonCodes\",
    'marketKey', cc.\"marketKey\",
    'rolloutCohort', ss.\"rolloutCohort\",
    'coverageCellId', cc.\"id\",
    'assessmentCycleId', ca.\"cycleKey\",
    'observedAt', w.\"updatedAt\"
  )
  FROM \"AffiliateReplenishmentWaves\" w
  JOIN \"AffiliateReplenishmentDemands\" d ON d.\"id\" = w.\"demandId\"
  JOIN \"AffiliateAgentGatewayJobs\" j ON j.\"id\" = w.\"coveragePlanningJobId\"
  JOIN \"AffiliateCoverageCells\" cc
    ON cc.\"id\" = d.\"targetKey\"
   AND cc.\"marketKey\" = d.\"marketKey\"
   AND cc.\"sportId\" = d.\"sportId\"
   AND cc.\"profileKey\" = d.\"sourceProfile\"
  JOIN \"AffiliateCoverageCellAssessments\" ca
    ON ca.\"cellId\" = cc.\"id\"
   AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
  JOIN \"AffiliateSourceDiscoveryCampaigns\" campaign
    ON campaign.\"id\" = w.\"campaignId\"
  JOIN \"AffiliateSourceDiscoveryRuns\" dr
    ON dr.\"campaignId\" = campaign.\"id\"
   AND dr.\"status\" IN ('SUCCEEDED', 'COMPLETED')
  JOIN \"AffiliateSourceDiscoveryQueryExecutions\" dq
    ON dq.\"runId\" = dr.\"id\"
   AND dq.\"campaignId\" = campaign.\"id\"
   AND dq.\"status\" IN ('SUCCEEDED', 'COMPLETED')
   AND dq.\"sportId\" = cc.\"sportId\"
   AND dq.\"profileKey\" = cc.\"profileKey\"
  JOIN \"AffiliateCoverageCities\" city
    ON city.\"id\" = cc.\"cityId\"
   AND dq.\"cityGeoid\" = city.\"placeGeoid\"
  JOIN \"AffiliateSourceDiscoveryResults\" ds
    ON ds.\"campaignId\" = campaign.\"id\"
   AND ds.\"latestRunId\" = dr.\"id\"
   AND ds.\"supplySourceId\" = :'source_id'
  JOIN \"AffiliateSupplySources\" ss
    ON ss.\"id\" = ds.\"supplySourceId\"
   AND ss.\"rolloutCohort\" = :'rollout_cohort'
  JOIN \"AffiliateSupplyTargets\" st
    ON st.\"supplySourceId\" = ss.\"id\"
   AND st.\"marketKey\" = cc.\"marketKey\"
   AND st.\"sportId\" = cc.\"sportId\"
   AND st.\"sourceProfile\" = cc.\"profileKey\"
   AND st.\"status\" = 'PUBLISHED'
  JOIN LATERAL (
    SELECT a.\"id\", a.\"eventKey\", a.\"reasonCodes\"
    FROM \"AffiliateOperationalAlerts\" a
    WHERE a.\"supplySourceId\" = ss.\"id\"
      AND (a.\"subjectId\" = w.\"id\" OR a.\"payload\"->>'waveId' = w.\"id\")
      AND a.\"reasonCodes\" && ARRAY[
        'PROVIDER_FAILURE', 'DISCOVERY_PROVIDER_FAILURE',
        'CAPTURE_PROVIDER_FAILURE'
      ]::text[]
      AND a.\"createdAt\" >= :'observation_start'::timestamptz
      AND a.\"createdAt\" <= :'observation_end'::timestamptz
    ORDER BY a.\"createdAt\" DESC, a.\"id\" DESC
    LIMIT 1
  ) a ON true
  WHERE j.\"role\" = 'COVERAGE_PLANNER'
    AND j.\"supplySourceId\" IS NULL
    AND d.\"targetKey\" = cc.\"id\"
    AND d.\"marketKey\" = :'market_key'
    AND d.\"sportId\" = cc.\"sportId\"
    AND d.\"sourceProfile\" = cc.\"profileKey\"
    AND d.\"rolloutCohort\" = :'rollout_cohort'
    AND w.\"rolloutCohort\" = :'rollout_cohort'
    AND cc.\"id\" = :'coverage_cell_id'
    AND ca.\"cycleKey\" = :'assessment_cycle_id'
    AND w.\"status\" IN ('FAILED', 'PAUSED')
    AND w.\"errorCode\" IN (
      'PROVIDER_FAILURE', 'DISCOVERY_PROVIDER_FAILURE',
      'CAPTURE_PROVIDER_FAILURE'
    )
    AND w.\"updatedAt\" >= :'observation_start'::timestamptz
    AND w.\"updatedAt\" <= :'observation_end'::timestamptz
  ORDER BY w.\"updatedAt\" DESC, w.\"id\" DESC
  LIMIT 1;" > "$FAILURE_DRILL_OUTPUT"
test -s "$FAILURE_DRILL_OUTPUT"
jq -e \
  --arg source "$FAILURE_DRILL_SOURCE_ID" \
  --arg market "$FAILURE_DRILL_MARKET_KEY" \
  --arg cohort "$FAILURE_DRILL_ROLLOUT_COHORT" \
  --arg cell "$FAILURE_DRILL_COVERAGE_CELL_ID" \
  --arg cycle "$FAILURE_DRILL_ASSESSMENT_CYCLE_ID" '
  .drill == "PROVIDER_FAILURE"
  and (.waveId | type == "string" and length > 0)
  and (.campaignId | type == "string" and length > 0)
  and (.discoveryRunId | type == "string" and length > 0)
  and (.discoveryQueryId | type == "string" and length > 0)
  and (.discoveryResultId | type == "string" and length > 0)
  and .sourceId == $source
  and (.targetId | type == "string" and length > 0)
  and (.alertId | type == "string" and length > 0)
  and (.alertEventKey | type == "string" and length > 0)
  and (.alertReasonCodes | type == "array" and length > 0)
  and .marketKey == $market
  and .rolloutCohort == $cohort
  and .coverageCellId == $cell
  and .assessmentCycleId == $cycle
' "$FAILURE_DRILL_OUTPUT"
shasum -a 256 "$FAILURE_DRILL_OUTPUT" \
  >> /path/to/affiliate-governed-private/deployment-evidence.sha256
```

### Seattle–Tacoma cohort evidence

After the Portland gate and the separate failure drill, obtain a new current
authorization for the Seattle–Tacoma cohort. Do not copy the Portland JSON,
reuse its hash, or substitute a static fixture. The query below selects one
durable joined wave/job/campaign/discovery/mapping/review/lifecycle/target
lineage and fails closed unless exactly one row carries the reviewed tuple.

```text
assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
: "${SEATTLE_AUTHORIZATION_ID:?Set separate current Seattle–Tacoma authorization}"
assert_non_placeholder_identity "$SEATTLE_AUTHORIZATION_ID" "SEATTLE_AUTHORIZATION_ID"
export SEATTLE_MARKET_KEY=seattle-tacoma
export SEATTLE_ROLLOUT_COHORT=REPLACE_WITH_REVIEWED_SEATTLE_ROLLOUT_COHORT
export SEATTLE_SOURCE_ID=REPLACE_WITH_REVIEWED_SEATTLE_SUPPLY_SOURCE_ID
export SEATTLE_COVERAGE_CELL_ID=REPLACE_WITH_REVIEWED_SEATTLE_COVERAGE_CELL_ID
export SEATTLE_ASSESSMENT_CYCLE_ID=REPLACE_WITH_REVIEWED_SEATTLE_ASSESSMENT_CYCLE_ID
assert_non_placeholder_identity "$SEATTLE_ROLLOUT_COHORT" "SEATTLE_ROLLOUT_COHORT"
export SEATTLE_CAPTURE_ARTIFACT_ID=REPLACE_WITH_REVIEWED_SEATTLE_CAPTURE_ARTIFACT_ID
assert_non_placeholder_identity "$SEATTLE_CAPTURE_ARTIFACT_ID" "SEATTLE_CAPTURE_ARTIFACT_ID"
assert_non_placeholder_identity "$SEATTLE_SOURCE_ID" "SEATTLE_SOURCE_ID"
assert_non_placeholder_identity "$SEATTLE_COVERAGE_CELL_ID" "SEATTLE_COVERAGE_CELL_ID"
assert_non_placeholder_identity "$SEATTLE_ASSESSMENT_CYCLE_ID" "SEATTLE_ASSESSMENT_CYCLE_ID"
assert_non_placeholder_identity "$SEATTLE_CAPTURE_ARTIFACT_ID" "SEATTLE_CAPTURE_ARTIFACT_ID"
export SEATTLE_COHORT_EVIDENCE=/path/to/affiliate-governed-private/seattle-tacoma-cohort.json
test ! -e "$SEATTLE_COHORT_EVIDENCE"
test ! -L "$SEATTLE_COHORT_EVIDENCE"
psql --service="$PGSERVICE" --no-psqlrc --set=ON_ERROR_STOP=1 \
  -v session_id="$CUTOVER_SESSION_ID" \
  -v market_key="$SEATTLE_MARKET_KEY" \
  -v rollout_cohort="$SEATTLE_ROLLOUT_COHORT" \
  -v source_id="$SEATTLE_SOURCE_ID" \
  -v coverage_cell_id="$SEATTLE_COVERAGE_CELL_ID" \
  -v assessment_cycle_id="$SEATTLE_ASSESSMENT_CYCLE_ID" \
  -v capture_artifact_id="$SEATTLE_CAPTURE_ARTIFACT_ID" \
  -Atc "
  WITH joined AS (
    SELECT DISTINCT
      w.\"id\" AS wave_id,
      gj.\"id\" AS gateway_job_id,
      campaign.\"id\" AS campaign_id,
      dr.\"id\" AS discovery_run_id,
      dq.\"id\" AS discovery_query_id,
      ds.\"id\" AS discovery_result_id,
      ia.\"id\" AS capture_artifact_id,
      ia.\"kind\" AS capture_artifact_kind,
      mj.\"id\" AS mapping_job_id,
      mj.\"mappingId\" AS mapping_id,
      aj.\"id\" AS approval_job_id,
      activation.\"id\" AS activation_transition_id,
      st.\"id\" AS target_id,
      publication.\"id\" AS publication_transition_id
    FROM \"AffiliateSupplyReconciliationRuns\" session
    JOIN \"AffiliateAgentGatewayJobs\" gj
      ON gj.\"role\" = 'COVERAGE_PLANNER'
     AND gj.\"supplySourceId\" IS NULL
    JOIN \"AffiliateReplenishmentWaves\" w
      ON w.\"coveragePlanningJobId\" = gj.\"id\"
     AND w.\"campaignId\" IS NOT NULL
    JOIN \"AffiliateReplenishmentDemands\" d
      ON d.\"id\" = w.\"demandId\"
     AND d.\"marketKey\" = :'market_key'
     AND d.\"rolloutCohort\" = :'rollout_cohort'
    JOIN \"AffiliateCoverageCells\" cc
      ON cc.\"id\" = d.\"targetKey\"
     AND cc.\"id\" = :'coverage_cell_id'
     AND cc.\"marketKey\" = d.\"marketKey\"
     AND cc.\"sportId\" = d.\"sportId\"
     AND cc.\"profileKey\" = d.\"sourceProfile\"
     AND cc.\"cohort\" = d.\"rolloutCohort\"
    JOIN \"AffiliateCoverageCellAssessments\" ca
      ON ca.\"cellId\" = cc.\"id\"
     AND ca.\"cycleKey\" = d.\"id\" || ':generation:' || w.\"demandGeneration\"
     AND ca.\"cycleKey\" = :'assessment_cycle_id'
    JOIN \"AffiliateSourceDiscoveryCampaigns\" campaign
      ON campaign.\"id\" = w.\"campaignId\"
    JOIN \"AffiliateSourceDiscoveryRuns\" dr
      ON dr.\"campaignId\" = campaign.\"id\"
     AND dr.\"status\" IN ('SUCCEEDED', 'COMPLETED')
    JOIN \"AffiliateSourceDiscoveryQueryExecutions\" dq
      ON dq.\"runId\" = dr.\"id\"
     AND dq.\"campaignId\" = campaign.\"id\"
     AND dq.\"status\" IN ('SUCCEEDED', 'COMPLETED')
     AND dq.\"sportId\" = cc.\"sportId\"
     AND dq.\"profileKey\" = cc.\"profileKey\"
    JOIN \"AffiliateCoverageCities\" city
      ON city.\"id\" = cc.\"cityId\"
     AND dq.\"cityGeoid\" = city.\"placeGeoid\"
    JOIN \"AffiliateSourceDiscoveryResults\" ds
      ON ds.\"campaignId\" = campaign.\"id\"
     AND ds.\"latestRunId\" = dr.\"id\"
     AND ds.\"supplySourceId\" = :'source_id'
    JOIN \"AffiliateSupplySources\" ss
      ON ss.\"id\" = ds.\"supplySourceId\"
     AND ss.\"rolloutCohort\" = :'rollout_cohort'
    JOIN \"AffiliateSupplyTargets\" st
      ON st.\"supplySourceId\" = ss.\"id\"
     AND st.\"marketKey\" = cc.\"marketKey\"
     AND st.\"sportId\" = cc.\"sportId\"
     AND st.\"sourceProfile\" = cc.\"profileKey\"
     AND st.\"status\" = 'PUBLISHED'
    JOIN \"AffiliateSourceIntakeRuns\" ir
      ON ir.\"intakeId\" = ds.\"matchingIntakeId\"
     AND ir.\"supplySourceId\" = ss.\"id\"
     AND ir.\"status\" IN ('SUCCEEDED', 'COMPLETED')
    JOIN \"AffiliateSourceIntakeArtifacts\" ia
      ON ia.\"id\" = :'capture_artifact_id'
     AND ia.\"runId\" = ir.\"id\"
     AND ia.\"intakeId\" = ds.\"matchingIntakeId\"
     AND ia.\"supplySourceId\" = ss.\"id\"
     AND ia.\"kind\" IN ('PAGE_HTML', 'PAGE_MARKDOWN')
    JOIN \"AffiliateSourceMappingJobs\" mj
      ON mj.\"intakeId\" = ds.\"matchingIntakeId\"
     AND mj.\"supplySourceId\" = ss.\"id\"
     AND mj.\"status\" = 'APPROVED'
     AND mj.\"mappingId\" IS NOT NULL
    JOIN \"AffiliateScrapeSources\" scrape_source
      ON scrape_source.\"id\" = mj.\"sourceId\"
     AND scrape_source.\"supplySourceId\" = ss.\"id\"
    JOIN \"AffiliateApprovalJobs\" aj
      ON aj.\"supplySourceId\" = ss.\"id\"
     AND aj.\"subjectType\" = 'MAPPING_PACKAGE'
     AND aj.\"subjectKey\" = mj.\"mappingId\"
     AND aj.\"status\" = 'APPROVED'
    JOIN \"AffiliateSupplyLifecycleTransitions\" activation
      ON activation.\"supplySourceId\" = ss.\"id\"
     AND activation.\"command\" = 'ACTIVATE'
     AND COALESCE(
       activation.\"requestJson\"->>'mappingId',
       activation.\"resultJson\"->>'mappingId'
     ) = mj.\"mappingId\"
    JOIN \"AffiliateSupplyLifecycleTransitions\" publication
      ON publication.\"supplySourceId\" = ss.\"id\"
     AND publication.\"command\" = 'PUBLISH_TARGET'
     AND (
       publication.\"requestJson\"->>'targetId' = st.\"id\"
       OR publication.\"resultJson\"->>'targetId' = st.\"id\"
       OR publication.\"requestJson\"->>'candidateId' = st.\"candidateId\"
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(
           COALESCE(publication.\"requestJson\"->'targets', '[]'::jsonb)
         ) publication_target
         WHERE publication_target->>'targetId' = st.\"id\"
       )
     )
    WHERE session.\"rolloutCohort\" = :'rollout_cohort'
      AND session.\"reportJson\"->>'cutoverSessionId' = :'session_id'
      AND session.\"status\" = 'APPLIED'
  )
  SELECT json_build_object(
    'marketKey', :'market_key',
    'rolloutCohort', :'rollout_cohort',
    'tuple', json_build_object(
      'sourceId', :'source_id',
      'marketKey', :'market_key',
      'rolloutCohort', :'rollout_cohort',
      'coverageCellId', :'coverage_cell_id',
      'assessmentCycleId', :'assessment_cycle_id'
    ),
    'joinedCount', (SELECT count(*) FROM joined),
    'cycleComplete', (SELECT count(*) = 1 FROM joined),
    'joinedIds', COALESCE(
      (
        SELECT json_build_object(
          'gatewayJobId', gateway_job_id,
          'waveId', wave_id,
          'campaignId', campaign_id,
          'discoveryRunId', discovery_run_id,
          'discoveryQueryId', discovery_query_id,
          'discoveryResultId', discovery_result_id,
          'captureArtifactId', capture_artifact_id,
          'captureArtifactKind', capture_artifact_kind,
          'mappingJobId', mapping_job_id,
          'mappingId', mapping_id,
          'approvalJobId', approval_job_id,
          'activationTransitionId', activation_transition_id,
          'targetId', target_id,
          'publicationTransitionId', publication_transition_id
        )
        FROM joined
      ),
      '{}'::json
    )
  );" > "$SEATTLE_COHORT_EVIDENCE"
test -s "$SEATTLE_COHORT_EVIDENCE"
jq -e \
  --arg source "$SEATTLE_SOURCE_ID" \
  --arg market "$SEATTLE_MARKET_KEY" \
  --arg cohort "$SEATTLE_ROLLOUT_COHORT" \
  --arg cell "$SEATTLE_COVERAGE_CELL_ID" \
  --arg cycle "$SEATTLE_ASSESSMENT_CYCLE_ID" \
  --arg capture_artifact "$SEATTLE_CAPTURE_ARTIFACT_ID" '
  .marketKey == $market
  and .rolloutCohort == $cohort
  and .tuple == {
    sourceId: $source,
    marketKey: $market,
    rolloutCohort: $cohort,
    coverageCellId: $cell,
    assessmentCycleId: $cycle
  }
  and .cycleComplete == true
  and .joinedCount == 1
  and (.joinedIds | type == "object"
    and (keys | sort) == [
      "activationTransitionId", "approvalJobId", "campaignId",
      "captureArtifactId", "captureArtifactKind", "discoveryQueryId",
      "discoveryResultId", "discoveryRunId", "gatewayJobId",
      "mappingId", "mappingJobId", "publicationTransitionId",
      "targetId", "waveId"
    ]
    and all(.[]; type == "string" and length > 0)
    and .captureArtifactId == $capture_artifact
    and (.captureArtifactKind as $kind
      | (["PAGE_HTML", "PAGE_MARKDOWN"] | index($kind) != null)))
' "$SEATTLE_COHORT_EVIDENCE"
export SEATTLE_COHORT_EVIDENCE_SHA256="$(shasum -a 256 "$SEATTLE_COHORT_EVIDENCE" | cut -d ' ' -f1)"
printf '%s  %s\n' "$SEATTLE_COHORT_EVIDENCE_SHA256" "$SEATTLE_COHORT_EVIDENCE" \
  >> /path/to/affiliate-governed-private/deployment-evidence.sha256
```

### Confirm bounded production observation admission is closed

The observation window was closed before the evidence queries. Re-assert that
the server reports closed state and that the end timestamp was recorded before
requesting any final governed-claims lease:

```text
close_claim_observation_admission
test "$OBSERVATION_ADMISSION_OPEN" = "0"
test -n "$OBSERVATION_ADMISSION_END"
trap - EXIT INT TERM
```

If any evidence query or check fails after this point, keep admission closed
and exit non-zero. Disable the trap only after the closed-state assertion.

7. Before this production state change, obtain separate current authorization
   for opening the next governed claim. The authenticated `POST
   /v1/affiliate-agent/admission/open` call must run after the readiness helper
   succeeds and must request one finite Coverage Planner lease:
```text
assert_non_placeholder_identity "$OPERATOR_ID" "OPERATOR_ID"
: "${FINAL_ADMISSION_AUTHORIZATION_ID:?Set separate current final-admission authorization}"
assert_non_placeholder_identity "$FINAL_ADMISSION_AUTHORIZATION_ID" "FINAL_ADMISSION_AUTHORIZATION_ID"
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
const roleCredential = process.env.AFFILIATE_COVERAGE_PLANNER_CREDENTIAL;
if (!roleCredential) throw new Error("missing Coverage Planner role credential");
fetch("http://127.0.0.1:8080" + prefix + "/admission/open", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN
  },
  body: JSON.stringify({
    role: "COVERAGE_PLANNER",
    workerId: "coverage-planner",
    roleCredential,
    leaseSeconds: 1200
  })
}).then(async (response) => {
  const body = await response.json();
  if (
    !response.ok ||
    body.status !== "open" ||
    body.open !== true ||
    body.lease?.role !== "COVERAGE_PLANNER" ||
    body.lease?.workerId !== "coverage-planner" ||
    body.lease?.remainingClaims !== 1 ||
    Date.parse(body.lease?.expiresAt || "") <= Date.now()
  ) throw new Error(JSON.stringify(body));
  console.log(JSON.stringify(body));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'
```

If this call returns `503` with `"status":"waiting"`, do not retry in a loop.
Check the readiness helper and worker leases. Call it again only after the
readiness gate succeeds.

8. Confirm the open state with the authenticated `GET
   /v1/affiliate-agent/admission` call. The response is intentionally limited
   to `{"status":"open","open":true}`; validate the role, worker, expiry, and
   one-claim lease from the successful `POST /admission/open` response above:

```text
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/admission", {
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "open" || body.open !== true
      || Object.keys(body).sort().join(",") !== "open,status") {
    throw new Error(JSON.stringify(body));
  }
  console.log(JSON.stringify(body));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'
```

The `coverage-planner` profile includes the readiness helper, planner, and
protected replenishment controller. Start the controller only after the planner
container has started and its reviewed identity is confirmed. The gateway
healthcheck remains a meaningful `GET <configured-prefix>/healthz` check, while
the helper uses `GET <configured-prefix>/readiness` for the four-worker
admission gate. No service in this project publishes a host port.

## Enforceable legacy retirement gate

Issue 70 does not complete legacy retirement in this worktree. The governed
production cohort proof is missing. The fixed manifest records
`retirementStatus` as `BLOCKED_PENDING_GOVERNED_COHORT_PROOF` and
`cohortProof.status` as `MISSING`. Do not remove or re-enable any path listed
under `paths` until a current cohort evidence artifact has been reviewed.

The paths in `retainedPausedReferences` are rollback references only. They must
remain stopped and fail closed. In particular,
`deploy/ai/bin/run-controller-once.sh` rejects `queue` mode before it can
invoke `run-affiliate-mapping-agent.ts`; operators must use governed gateway
admission for production writes. The restored Goal, loop, pool, claim,
completion, intake, discovery, and gold-capture launchers remain discoverable
paused references and reject production or `--live` execution. Their package
commands remain retained for rollback/reference only; no governed Compose
service activates them as a production writer.

The `retainedSupport` entries are migrated support paths. They are not
retirement targets. Eligible removal remains limited to paths explicitly
listed in a future reviewed manifest after cohort proof. This patch records
package and caller migrations as `reviewedEdits`, but that record is not
evidence of a completed production retirement.

Before removal, prove that the package still exposes none of the retired
command names and that active application code has no caller or import of a
retired module/path. Do not treat a package edit as proof that a script's
callers migrated. The authorization scope must include the fixed
`reviewedEdits`, not only paths that will be deleted.

The gate must fail closed when the manifest or its explicit evidence path is
absent, uses a placeholder identity, omits a path, or reports a path that
still exists:

```text
export LEGACY_RETIREMENT_ALLOWLIST=/path/to/affiliate-governed-private/legacy-retirement-allowlist.json
export LEGACY_RETIREMENT_CANONICAL_INVENTORY=/path/to/affiliate-governed-private/legacy-path-inventory.json
export LEGACY_RETIREMENT_EVIDENCE=/path/to/affiliate-governed-private/legacy-retirement-evidence.json
export LEGACY_RETIREMENT_FIXED_PATH_MANIFEST=/path/to/repository/apps/site/deploy/affiliate-governed/legacy-retirement-manifest.json
export LEGACY_RETIREMENT_FIXED_EVIDENCE_MANIFEST=/path/to/repository/apps/site/deploy/affiliate-governed/production-evidence-manifest.json
for fixed_manifest in \
  "$LEGACY_RETIREMENT_FIXED_PATH_MANIFEST" \
  "$LEGACY_RETIREMENT_FIXED_EVIDENCE_MANIFEST"; do
  test -e "$fixed_manifest"
  test ! -L "$fixed_manifest"
  test -s "$fixed_manifest"
  jq -e '
    .schemaVersion == 1
    and (.manifestId | type == "string" and length > 0)
    and (.paths | type == "array" and length > 0)
    and (.paths | length == (unique | length))
    and (.pathsSha256 | type == "string" and test("^[a-fA-F0-9]{64}$"))
  ' "$fixed_manifest"
  test "$(jq -S -c '.paths' "$fixed_manifest" | shasum -a 256 | cut -d ' ' -f1)" \
    = "$(jq -er '.pathsSha256' "$fixed_manifest")"
done
jq -e '
  (.retainedSupport | type == "array" and length > 0)
  and (.retainedSupport | length == (unique | length))
  and (.retainedSupport
    | all(.[]; type == "string" and startswith("apps/site/") and (contains("..") | not)))
  and (.reviewedEdits | type == "array" and length > 0)
  and (.reviewedEdits | map(.path) | length == (unique | length))
  and (.reviewedEdits
    | all(.[]; (.path | type == "string" and startswith("apps/site/") and (contains("..") | not))
      and (.operation | type == "string" and length > 0)
      and (.sha256 | type == "string" and test("^[a-fA-F0-9]{64}$"))))
  and ([.paths[], .retainedSupport[], (.reviewedEdits[] | .path)]
    | length == (unique | length))
' "$LEGACY_RETIREMENT_FIXED_PATH_MANIFEST"
jq -e '
  (.entries | type == "array" and length > 0)
  and (.entries | map(.key) | length == (unique | length))
  and (.entries
    | all(.[]; (.key | type == "string" and length > 0)
      and (.path | type == "string" and length > 0)))
  and ((.entries | map(.path) | sort) == (.paths | sort))
' "$LEGACY_RETIREMENT_FIXED_EVIDENCE_MANIFEST"
test -e "$LEGACY_RETIREMENT_ALLOWLIST"
test ! -L "$LEGACY_RETIREMENT_ALLOWLIST"
test -s "$LEGACY_RETIREMENT_ALLOWLIST"
test -e "$LEGACY_RETIREMENT_CANONICAL_INVENTORY"
test ! -L "$LEGACY_RETIREMENT_CANONICAL_INVENTORY"
test -s "$LEGACY_RETIREMENT_CANONICAL_INVENTORY"
test -e "$LEGACY_RETIREMENT_EVIDENCE"
test ! -L "$LEGACY_RETIREMENT_EVIDENCE"
test -s "$LEGACY_RETIREMENT_EVIDENCE"
export RETIREMENT_ALLOWLIST_REVIEWED_BY="$(jq -er '.reviewedBy' "$LEGACY_RETIREMENT_ALLOWLIST")"
export RETIREMENT_ALLOWLIST_AUTHORIZATION_ID="$(jq -er '.authorizationId' "$LEGACY_RETIREMENT_ALLOWLIST")"
assert_non_placeholder_identity "$RETIREMENT_ALLOWLIST_REVIEWED_BY" "RETIREMENT_ALLOWLIST_REVIEWED_BY"
assert_non_placeholder_identity "$RETIREMENT_ALLOWLIST_AUTHORIZATION_ID" "RETIREMENT_ALLOWLIST_AUTHORIZATION_ID"
export RETIREMENT_EVIDENCE_REVIEWED_BY="$(jq -er '.reviewedBy' "$LEGACY_RETIREMENT_EVIDENCE")"
export RETIREMENT_EVIDENCE_AUTHORIZATION_ID="$(jq -er '.authorizationId' "$LEGACY_RETIREMENT_EVIDENCE")"
assert_non_placeholder_identity "$RETIREMENT_EVIDENCE_REVIEWED_BY" "RETIREMENT_EVIDENCE_REVIEWED_BY"
assert_non_placeholder_identity "$RETIREMENT_EVIDENCE_AUTHORIZATION_ID" "RETIREMENT_EVIDENCE_AUTHORIZATION_ID"
export RETIREMENT_STOPPED_UNIT_EVIDENCE="$(jq -er '.stoppedUnitEvidencePath' "$LEGACY_RETIREMENT_EVIDENCE")"
export RETIREMENT_REMOVAL_AUTHORIZATION_ARTIFACT="$(jq -er '.removalAuthorizationArtifactPath' "$LEGACY_RETIREMENT_EVIDENCE")"
export RETIREMENT_POST_REMOVAL_EVIDENCE="$(jq -er '.postRemovalEvidencePath' "$LEGACY_RETIREMENT_EVIDENCE")"
assert_non_placeholder_identity "$RETIREMENT_STOPPED_UNIT_EVIDENCE" "RETIREMENT_STOPPED_UNIT_EVIDENCE"
assert_non_placeholder_identity "$RETIREMENT_REMOVAL_AUTHORIZATION_ARTIFACT" "RETIREMENT_REMOVAL_AUTHORIZATION_ARTIFACT"
assert_non_placeholder_identity "$RETIREMENT_POST_REMOVAL_EVIDENCE" "RETIREMENT_POST_REMOVAL_EVIDENCE"
test -e "$RETIREMENT_STOPPED_UNIT_EVIDENCE"
test ! -L "$RETIREMENT_STOPPED_UNIT_EVIDENCE"
test -s "$RETIREMENT_STOPPED_UNIT_EVIDENCE"
test -e "$RETIREMENT_REMOVAL_AUTHORIZATION_ARTIFACT"
test ! -L "$RETIREMENT_REMOVAL_AUTHORIZATION_ARTIFACT"
test -s "$RETIREMENT_REMOVAL_AUTHORIZATION_ARTIFACT"
export RETIREMENT_EXPECTED_SCOPE_HASH="$(
  jq -S -c '.paths' "$LEGACY_RETIREMENT_ALLOWLIST" |
    shasum -a 256 | cut -d ' ' -f1
)"
export RETIREMENT_EXPECTED_REVIEWED_EDITS="$(
  jq -c '.reviewedEdits' "$LEGACY_RETIREMENT_FIXED_PATH_MANIFEST"
)"
export RETIREMENT_APPROVED_AUTHORIZATION_ID="$(jq -er '.authorizationId' \
  "$RETIREMENT_REMOVAL_AUTHORIZATION_ARTIFACT")"
export RETIREMENT_APPROVED_BY="$(jq -er '.reviewedBy' \
  "$RETIREMENT_REMOVAL_AUTHORIZATION_ARTIFACT")"
export RETIREMENT_APPROVED_SCOPE_HASH="$(jq -er '.scopeHash' \
  "$RETIREMENT_REMOVAL_AUTHORIZATION_ARTIFACT")"
assert_non_placeholder_identity "$RETIREMENT_APPROVED_AUTHORIZATION_ID" "RETIREMENT_APPROVED_AUTHORIZATION_ID"
assert_non_placeholder_identity "$RETIREMENT_APPROVED_BY" "RETIREMENT_APPROVED_BY"
assert_non_placeholder_identity "$RETIREMENT_APPROVED_SCOPE_HASH" "RETIREMENT_APPROVED_SCOPE_HASH"
jq -e \
  --arg authorization "$RETIREMENT_APPROVED_AUTHORIZATION_ID" \
  --arg reviewer "$RETIREMENT_ALLOWLIST_REVIEWED_BY" \
  --arg scope_hash "$RETIREMENT_EXPECTED_SCOPE_HASH" \
  --argjson paths "$(jq -c '.paths' "$LEGACY_RETIREMENT_ALLOWLIST")" \
  --argjson reviewed_edits "$RETIREMENT_EXPECTED_REVIEWED_EDITS" '
  .status == "APPROVED"
  and .authorizationId == $authorization
  and .reviewedBy == $reviewer
  and .scopeHash == $scope_hash
  and .scope.manifestId == "affiliate-governed-legacy-retirement-paths"
  and .scope.paths == $paths
  and .scope.reviewedEdits == $reviewed_edits
  and (.approvedAt | fromdateiso8601) <= now
  and (.expiresAt | fromdateiso8601) > now
' "$RETIREMENT_REMOVAL_AUTHORIZATION_ARTIFACT"
test ! -e "$RETIREMENT_POST_REMOVAL_EVIDENCE"
test ! -L "$RETIREMENT_POST_REMOVAL_EVIDENCE"
jq -e '
  (.reviewedBy | type == "string" and length > 0)
  and (.authorizationId | type == "string" and length > 0)
  and (.paths | type == "array" and length > 0)
  and (.paths | all(.[]; type == "string" and startswith("apps/site/") and (contains("..") | not)))
  and (.paths | length == (unique | length))
  and (.reviewedEdits | type == "array" and length > 0)
  and (.reviewedEdits | map(.path) | length == (unique | length))
  and (.reviewedEdits
    | all(.[]; (.path | type == "string" and startswith("apps/site/") and (contains("..") | not))
      and (.operation | type == "string" and length > 0)))
  and (.productionEvidencePaths | type == "array" and length > 0)
  and (.productionEvidencePaths | length == (unique | length))
  and (.productionEvidencePaths
    | all(.[]; type == "string" and startswith("/path/to/affiliate-governed-private/") and (contains("..") | not)))
' "$LEGACY_RETIREMENT_ALLOWLIST"
jq -e --slurpfile fixed "$LEGACY_RETIREMENT_FIXED_PATH_MANIFEST" '
  ($fixed | length == 1)
  and (.paths | sort == ($fixed[0].paths | sort))
  and (.reviewedEdits == $fixed[0].reviewedEdits)
' "$LEGACY_RETIREMENT_ALLOWLIST"
jq -e --slurpfile fixed "$LEGACY_RETIREMENT_FIXED_EVIDENCE_MANIFEST" '
  ($fixed | length == 1)
  and (
    .productionEvidencePaths | sort
    == ($fixed[0].paths | map("/path/to/affiliate-governed-private/" + .) | sort)
  )
' "$LEGACY_RETIREMENT_ALLOWLIST"
jq -e '
  (.paths | type == "array" and length > 0)
  and (.paths | length == (unique | length))
  and (.paths | all(.[]; type == "string" and startswith("apps/site/") and (contains("..") | not)))
' "$LEGACY_RETIREMENT_CANONICAL_INVENTORY"
jq -e --slurpfile canonical "$LEGACY_RETIREMENT_CANONICAL_INVENTORY" '
  ($canonical | length == 1)
  and (.paths | sort == ($canonical[0].paths | sort))
' "$LEGACY_RETIREMENT_ALLOWLIST"
while IFS= read -r edit_path; do
  test -e "/path/to/repository/$edit_path"
  test ! -L "/path/to/repository/$edit_path"
done < <(jq -er '.reviewedEdits[].path' "$LEGACY_RETIREMENT_ALLOWLIST")
while IFS= read -r edit_path; do
  export RETIREMENT_REVIEWED_EDIT_HASH="$(
    jq -er --arg path "$edit_path" \
      '.reviewedEdits[] | select(.path == $path) | .sha256' \
      "$LEGACY_RETIREMENT_FIXED_PATH_MANIFEST"
  )"
  test "$(shasum -a 256 "/path/to/repository/$edit_path" | cut -d ' ' -f1)" \
    = "$RETIREMENT_REVIEWED_EDIT_HASH"
done < <(jq -er '.reviewedEdits[].path' "$LEGACY_RETIREMENT_ALLOWLIST")
jq -e '
  . as $package
  | (.scripts | type == "object")
  and ([
    "affiliate:intakes:process",
    "affiliate:discovery:run",
    "affiliate:mapping:claim",
    "affiliate:mapping:complete",
    "affiliate:approvals:claim",
    "affiliate:approvals:complete",
    "affiliate:coverage:claim",
    "affiliate:coverage:complete",
    "affiliate:intakes:codex-goal",
    "affiliate:intakes:codex-goal:dry-run",
    "affiliate:intakes:codex-loop",
    "affiliate:intakes:codex-pool",
    "affiliate:approvals:codex-goal",
    "affiliate:approvals:codex-goal:dry-run",
    "affiliate:approvals:loop",
    "affiliate:coverage:codex-goal",
    "affiliate:coverage:codex-goal:dry-run",
    "affiliate:coverage:loop",
    "affiliate:intake:automation",
    "affiliate:mapping:baseline",
    "affiliate:mapping:evaluate",
    "affiliate:mapping:agent",
    "affiliate:scrape:due",
  ] | all(.[]; . as $name | ($package.scripts[$name]? // null) == null))
' /path/to/repository/apps/site/package.json
if git -C /path/to/repository grep -n -E \
  'affiliate:(intakes:process|discovery:run|mapping:claim|mapping:complete|approvals:claim|approvals:complete|coverage:claim|coverage:complete)' \
  -- apps/site/src apps/site/app; then
  printf '%s\n' "Legacy direct-writer caller remains in active application code." >&2
  exit 1
fi
if git -C /path/to/repository grep -n -E \
  'npm[[:space:]]+(run|exec)[[:space:]]+(affiliate:scrape:due(:dry-run)?|affiliate:intake:automation|affiliate:mapping:(baseline|evaluate|agent|gold-capture(-cohort)?))([[:space:]]|$)' \
  -- apps/site/src apps/site/app apps/site/scripts apps/site/deploy/ai/bin apps/site/deploy/vm/systemd; then
  printf '%s\n' "Retired package command is still invoked by an active launcher." >&2
  exit 1
fi
if git -C /path/to/repository grep -n -E \
  'codex(IngestionResult|IngestionApproval)|codexCliGoal|codexApprovalGoal|codexCoverageGoal' \
  -- apps/site/src apps/site/scripts; then
  printf '%s\n' "Retired Codex module import remains in active code." >&2
  exit 1
fi
if git -C /path/to/repository grep -n -E \
  'scripts/(process-affiliate-source-intakes|run-affiliate-source-discovery|claim-affiliate-source-mapping|complete-affiliate-source-mapping|claim-affiliate-approval|complete-affiliate-approval|claim-affiliate-coverage-agent-job|complete-affiliate-coverage-agent-job|run-affiliate-intake-automation|run-affiliate-mapping-agent|run-due-affiliate-scrapes|audit-affiliate-mapping-agent-baseline|evaluate-affiliate-mapping-agent)\\.ts' \
  -- apps/site/src apps/site/scripts; then
  printf '%s\n' "Retired direct-writer entrypoint reference remains in active code." >&2
  exit 1
fi
jq -e --slurpfile allowlist "$LEGACY_RETIREMENT_ALLOWLIST" '
  . as $evidence
  | ($allowlist | length == 1)
  and ($allowlist[0].paths | type == "array" and length > 0)
  and ($allowlist[0].productionEvidencePaths | type == "array" and length > 0)
  and ($allowlist[0].reviewedEdits | type == "array" and length > 0)
  and (.reviewedEdits == $allowlist[0].reviewedEdits)
  and (.productionEvidenceComplete == true)
  and (.portlandCohortComplete == true)
  and (.legacyWritersStopped == true)
  and (.stoppedUnitEvidencePath | type == "string" and length > 0)
  and (.productionEvidenceHashes | type == "object" and length > 0)
  and ((.productionEvidenceHashes | keys | sort) == ($allowlist[0].productionEvidencePaths | sort))
  and (.productionEvidenceHashes
    | all(to_entries[]; .value | type == "string" and test("^[a-fA-F0-9]{64}$")))
  and (.preRemovalInputHash | type == "string" and test("^[a-fA-F0-9]{64}$"))
  and (.removalAuthorizationArtifactPath | type == "string" and length > 0)
  and (.postRemovalEvidencePath | type == "string" and length > 0)
  and (.removedPaths | type == "array" and length > 0)
  and (.removedPaths | length == (unique | length))
  and all($evidence.removedPaths[]; . as $path
    | ($allowlist[0].paths | index($path)) != null)
  and all($allowlist[0].paths[]; . as $path
    | ($evidence.removedPaths | index($path)) != null)
  and (.deletionStatus | type == "object")
  and ((.deletionStatus | keys | sort) == (.removedPaths | sort))
  and all($evidence.removedPaths[]; . as $path
    | ($evidence.deletionStatus[$path] == "REMOVED"))
  and (.reviewedBy | type == "string" and length > 0)
  and (.removalAuthorizationId | type == "string" and length > 0)
  and (.authorizationId | type == "string" and length > 0)
' "$LEGACY_RETIREMENT_EVIDENCE"
while IFS= read -r artifact; do
  test -e "$artifact"
  test ! -L "$artifact"
  test -s "$artifact"
  export RETIREMENT_EXPECTED_ARTIFACT_HASH="$(
    jq -er --arg path "$artifact" '.productionEvidenceHashes[$path]' "$LEGACY_RETIREMENT_EVIDENCE"
  )"
  export RETIREMENT_ACTUAL_ARTIFACT_HASH="$(
    shasum -a 256 "$artifact" | cut -d ' ' -f1
  )"
  test "$RETIREMENT_ACTUAL_ARTIFACT_HASH" = "$RETIREMENT_EXPECTED_ARTIFACT_HASH"
done < <(jq -er '.productionEvidencePaths[]' "$LEGACY_RETIREMENT_ALLOWLIST")
while IFS= read -r path; do
  test -e "/path/to/repository/$path"
  test ! -L "/path/to/repository/$path"
done < <(jq -er '.paths[]' "$LEGACY_RETIREMENT_ALLOWLIST")
export RETIREMENT_UNIT_STATE_TAG="$(date -u '+%Y%m%dT%H%M%SZ')-$$"
export RETIREMENT_UNIT_WILDCARD_OUTPUT="/path/to/affiliate-governed-private/legacy-unit-state.retirement.${RETIREMENT_UNIT_STATE_TAG}.wildcard.txt"
export RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT="/path/to/affiliate-governed-private/legacy-unit-state.retirement.${RETIREMENT_UNIT_STATE_TAG}.reviewed-ids.txt"
export RETIREMENT_UNIT_EXACT_OUTPUT="/path/to/affiliate-governed-private/legacy-unit-state.retirement.${RETIREMENT_UNIT_STATE_TAG}.exact.txt"
export RETIREMENT_UNIT_FRAGMENT_OUTPUT="/path/to/affiliate-governed-private/legacy-unit-state.retirement.${RETIREMENT_UNIT_STATE_TAG}.fragments.tsv"
export RETIREMENT_UNIT_NOT_FOUND_OUTPUT="/path/to/affiliate-governed-private/legacy-unit-state.retirement.${RETIREMENT_UNIT_STATE_TAG}.not-found.txt"
for unit_capture_path in \
  "$RETIREMENT_UNIT_WILDCARD_OUTPUT" \
  "$RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT" \
  "$RETIREMENT_UNIT_EXACT_OUTPUT" \
  "$RETIREMENT_UNIT_FRAGMENT_OUTPUT" \
  "$RETIREMENT_UNIT_NOT_FOUND_OUTPUT" \
  "${RETIREMENT_UNIT_WILDCARD_OUTPUT}.ids" \
  "${RETIREMENT_UNIT_EXACT_OUTPUT}.ids"; do
  test ! -e "$unit_capture_path"
  test ! -L "$unit_capture_path"
done
if ! (
  umask 077
  set -o noclobber
  systemctl show 'bracketiq-affiliate-*' \
    -p Id -p UnitFileState -p ActiveState -p SubState --no-pager \
    > "$RETIREMENT_UNIT_WILDCARD_OUTPUT"
); then
  rm -f "$RETIREMENT_UNIT_WILDCARD_OUTPUT"
  exit 1
fi
test -s "$RETIREMENT_UNIT_WILDCARD_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  jq -er '.reviewedSystemdUnits[] | .unitId' "$GATEWAY_STARTUP_PREFLIGHT" |
    sort -u > "$RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT"
); then
  rm -f "$RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT"
  exit 1
fi
test -s "$RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  systemctl show $(paste -sd' ' "$RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT") \
    -p Id -p UnitFileState -p ActiveState -p SubState --no-pager \
    > "$RETIREMENT_UNIT_EXACT_OUTPUT"
); then
  rm -f "$RETIREMENT_UNIT_EXACT_OUTPUT"
  exit 1
fi
test -s "$RETIREMENT_UNIT_EXACT_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  : > "$RETIREMENT_UNIT_FRAGMENT_OUTPUT"
  while IFS= read -r unit_id; do
    fragment_path="$(systemctl show "$unit_id" -p FragmentPath --value --no-pager)"
    case "$fragment_path" in
      "/etc/systemd/system/$unit_id"|"/usr/lib/systemd/system/$unit_id"|"/lib/systemd/system/$unit_id") ;;
      *) printf '%s\n' "Unexpected installed FragmentPath for $unit_id: $fragment_path" >&2; exit 1 ;;
    esac
    test -f "$fragment_path"
    printf '%s\t%s\n' "$unit_id" "$fragment_path" >> "$RETIREMENT_UNIT_FRAGMENT_OUTPUT"
  done < "$RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT"
); then
  rm -f "$RETIREMENT_UNIT_FRAGMENT_OUTPUT"
  exit 1
fi
test -s "$RETIREMENT_UNIT_FRAGMENT_OUTPUT"
if ! (
  umask 077
  set -o noclobber
  awk -F= '$1 == "Id" { print $2 }' "$RETIREMENT_UNIT_WILDCARD_OUTPUT" |
    sort -u > "${RETIREMENT_UNIT_WILDCARD_OUTPUT}.ids"
  awk -F= '$1 == "Id" { print $2 }' "$RETIREMENT_UNIT_EXACT_OUTPUT" |
    sort -u > "${RETIREMENT_UNIT_EXACT_OUTPUT}.ids"
); then
  rm -f "${RETIREMENT_UNIT_WILDCARD_OUTPUT}.ids" \
    "${RETIREMENT_UNIT_EXACT_OUTPUT}.ids"
  exit 1
fi
test -s "${RETIREMENT_UNIT_WILDCARD_OUTPUT}.ids"
test -s "${RETIREMENT_UNIT_EXACT_OUTPUT}.ids"
test "$(comm -3 \
  "${RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT}" \
  "${RETIREMENT_UNIT_WILDCARD_OUTPUT}.ids" | wc -l | tr -d '[:space:]')" = "0"
test "$(comm -3 \
  "${RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT}" \
  "${RETIREMENT_UNIT_EXACT_OUTPUT}.ids" | wc -l | tr -d '[:space:]')" = "0"
test "$(wc -l < "$RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT" | tr -d '[:space:]')" = \
  "$(wc -l < "${RETIREMENT_UNIT_EXACT_OUTPUT}.ids" | tr -d '[:space:]')"
awk -F= '
  /^UnitFileState=/ && $2 !~ /^(disabled|masked)$/ { exit 1 }
  /^ActiveState=/ && $2 != "inactive" { exit 1 }
' "$RETIREMENT_UNIT_EXACT_OUTPUT"
export RETIREMENT_PRE_REMOVAL_HASH_TAG="$(date -u '+%Y%m%dT%H%M%SZ')-$$"
export RETIREMENT_PRE_REMOVAL_HASH_OUTPUT="/path/to/affiliate-governed-private/legacy-retirement-pre-removal.${RETIREMENT_PRE_REMOVAL_HASH_TAG}.sha256"
test ! -e "$RETIREMENT_PRE_REMOVAL_HASH_OUTPUT"
test ! -L "$RETIREMENT_PRE_REMOVAL_HASH_OUTPUT"
(
  umask 077
  set -o noclobber
  : > "$RETIREMENT_PRE_REMOVAL_HASH_OUTPUT"
  {
    printf 'allowlist\t'
    shasum -a 256 "$LEGACY_RETIREMENT_ALLOWLIST"
    printf 'canonical-inventory\t'
    shasum -a 256 "$LEGACY_RETIREMENT_CANONICAL_INVENTORY"
    printf 'fixed-legacy-manifest\t'
    shasum -a 256 "$LEGACY_RETIREMENT_FIXED_PATH_MANIFEST"
    printf 'fixed-production-evidence-manifest\t'
    shasum -a 256 "$LEGACY_RETIREMENT_FIXED_EVIDENCE_MANIFEST"
    printf 'fresh-unit-wildcard\t'
    shasum -a 256 "$RETIREMENT_UNIT_WILDCARD_OUTPUT"
    printf 'fresh-unit-reviewed-ids\t'
    shasum -a 256 "$RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT"
    printf 'fresh-unit-exact\t'
    shasum -a 256 "$RETIREMENT_UNIT_EXACT_OUTPUT"
    printf 'fresh-unit-fragments\t'
    shasum -a 256 "$RETIREMENT_UNIT_FRAGMENT_OUTPUT"
    printf 'fresh-unit-wildcard-ids\t'
    shasum -a 256 "${RETIREMENT_UNIT_WILDCARD_OUTPUT}.ids"
    printf 'fresh-unit-exact-ids\t'
    shasum -a 256 "${RETIREMENT_UNIT_EXACT_OUTPUT}.ids"
    printf 'stopped-unit-evidence\t'
    shasum -a 256 "$RETIREMENT_STOPPED_UNIT_EVIDENCE"
    printf 'removal-authorization\t'
    shasum -a 256 "$RETIREMENT_REMOVAL_AUTHORIZATION_ARTIFACT"
    while IFS= read -r artifact; do
      printf 'production-evidence\t%s\t' "$artifact"
      shasum -a 256 "$artifact"
    done < <(jq -er '.productionEvidencePaths[]' "$LEGACY_RETIREMENT_ALLOWLIST")
    while IFS= read -r edit_path; do
      printf 'reviewed-edit\t%s\t' "$edit_path"
      shasum -a 256 "/path/to/repository/$edit_path"
    done < <(jq -er '.reviewedEdits[].path' "$LEGACY_RETIREMENT_ALLOWLIST")
    while IFS= read -r path; do
      printf 'legacy-path\t%s\t' "$path"
      shasum -a 256 "/path/to/repository/$path"
    done < <(jq -er '.paths[]' "$LEGACY_RETIREMENT_ALLOWLIST")
  } >> "$RETIREMENT_PRE_REMOVAL_HASH_OUTPUT"
)
export RETIREMENT_PRE_REMOVAL_INPUT_HASH="$(
  shasum -a 256 "$RETIREMENT_PRE_REMOVAL_HASH_OUTPUT" | cut -d ' ' -f1
)"
test "$RETIREMENT_PRE_REMOVAL_INPUT_HASH" = "$(jq -er '.preRemovalInputHash' "$LEGACY_RETIREMENT_EVIDENCE")"
export RETIREMENT_REMOVAL_AUTHORIZATION_ID="$(jq -er '.removalAuthorizationId' "$LEGACY_RETIREMENT_EVIDENCE")"
assert_non_placeholder_identity "$RETIREMENT_REMOVAL_AUTHORIZATION_ID" "RETIREMENT_REMOVAL_AUTHORIZATION_ID"
test "$RETIREMENT_REMOVAL_AUTHORIZATION_ID" != "$RETIREMENT_ALLOWLIST_AUTHORIZATION_ID"
test "$RETIREMENT_REMOVAL_AUTHORIZATION_ID" = "$RETIREMENT_APPROVED_AUTHORIZATION_ID"
test "$RETIREMENT_EVIDENCE_REVIEWED_BY" = "$RETIREMENT_APPROVED_BY"
export RETIREMENT_MASKED_UNIT_IDS="$RETIREMENT_UNIT_REVIEWED_IDS_OUTPUT"
while IFS= read -r unit_id; do
  test -n "$unit_id"
  systemctl stop "$unit_id"
  systemctl disable "$unit_id"
  systemctl mask --runtime "$unit_id"
done < "$RETIREMENT_MASKED_UNIT_IDS"
systemctl daemon-reload
while IFS=$'\t' read -r unit_id fragment_path; do
  test -n "$unit_id"
  test -n "$fragment_path"
  case "$fragment_path" in
    "/etc/systemd/system/$unit_id"|"/usr/lib/systemd/system/$unit_id"|"/lib/systemd/system/$unit_id") ;;
    *) printf '%s\n' "Refusing unauthorized installed unit path: $fragment_path" >&2; exit 1 ;;
  esac
  test -f "$fragment_path"
  rm -- "$fragment_path"
done < "$RETIREMENT_UNIT_FRAGMENT_OUTPUT"
while IFS= read -r path; do
  case "$path" in
    apps/site/*) rm -- "/path/to/repository/$path" ;;
    *) printf '%s\n' "Refusing unauthorized retirement path" >&2; exit 1 ;;
  esac
done < <(jq -er '.paths[]' "$LEGACY_RETIREMENT_ALLOWLIST")
systemctl daemon-reload
while IFS= read -r unit_id; do
  test -n "$unit_id"
  systemctl unmask --runtime "$unit_id"
done < "$RETIREMENT_MASKED_UNIT_IDS"
systemctl daemon-reload
(
  umask 077
  set -o noclobber
  : > "$RETIREMENT_UNIT_NOT_FOUND_OUTPUT"
  while IFS= read -r unit_id; do
    test -n "$unit_id"
    systemctl show "$unit_id" \
      -p Id -p LoadState -p UnitFileState -p ActiveState -p SubState --no-pager \
      >> "$RETIREMENT_UNIT_NOT_FOUND_OUTPUT"
    printf '\n' >> "$RETIREMENT_UNIT_NOT_FOUND_OUTPUT"
  done < "$RETIREMENT_MASKED_UNIT_IDS"
)
test -s "$RETIREMENT_UNIT_NOT_FOUND_OUTPUT"
awk -F= -v expected="$(wc -l < "$RETIREMENT_MASKED_UNIT_IDS" | tr -d '[:space:]')" '
  /^Id=/ { id = $2 }
  /^LoadState=/ { load = $2 }
  /^UnitFileState=/ { unit = $2 }
  /^ActiveState=/ { active = $2 }
  /^SubState=/ { substate = $2 }
  /^$/ {
    if (id == "" || load != "not-found" || unit != "not-found"
        || active != "inactive" || substate != "dead") exit 1
    seen++
    id = ""; load = ""; unit = ""; active = ""; substate = ""
  }
  END {
    if (id != "" || seen != expected) exit 1
  }
' "$RETIREMENT_UNIT_NOT_FOUND_OUTPUT"
export RETIREMENT_DIFF_OUTPUT="/path/to/affiliate-governed-private/legacy-retirement.${RETIREMENT_PRE_REMOVAL_HASH_TAG}.diff"
test ! -e "$RETIREMENT_DIFF_OUTPUT"
test ! -L "$RETIREMENT_DIFF_OUTPUT"
(
  umask 077
  set -o noclobber
  : > "$RETIREMENT_DIFF_OUTPUT"
  while IFS= read -r path; do
    git -C /path/to/repository diff --name-status -- "$path" >> "$RETIREMENT_DIFF_OUTPUT"
  done < <(jq -er '.paths[]' "$LEGACY_RETIREMENT_ALLOWLIST")
)
while IFS= read -r path; do
  test ! -e "/path/to/repository/$path"
  test ! -L "/path/to/repository/$path"
  test "$(git -C /path/to/repository diff --name-status -- "$path")" = "$(printf 'D\t%s' "$path")"
done < <(jq -er '.paths[]' "$LEGACY_RETIREMENT_ALLOWLIST")
while IFS= read -r path; do
  test ! -e "/path/to/repository/$path"
done < <(jq -er '.removedPaths[]' "$LEGACY_RETIREMENT_EVIDENCE")
export RETIREMENT_DIFF_HASH="$(shasum -a 256 "$RETIREMENT_DIFF_OUTPUT" | cut -d ' ' -f1)"
export RETIREMENT_UNIT_NOT_FOUND_HASH="$(shasum -a 256 "$RETIREMENT_UNIT_NOT_FOUND_OUTPUT" | cut -d ' ' -f1)"
export RETIREMENT_REMOVED_PATHS_JSON="$(jq -c '.paths' "$LEGACY_RETIREMENT_ALLOWLIST")"
(
  umask 077
  set -o noclobber
  jq -n \
    --arg preRemovalInputHash "$RETIREMENT_PRE_REMOVAL_INPUT_HASH" \
    --arg removalAuthorizationId "$RETIREMENT_REMOVAL_AUTHORIZATION_ID" \
    --arg diffHash "$RETIREMENT_DIFF_HASH" \
    --arg unitNotFoundEvidencePath "$RETIREMENT_UNIT_NOT_FOUND_OUTPUT" \
    --arg unitNotFoundEvidenceHash "$RETIREMENT_UNIT_NOT_FOUND_HASH" \
    --argjson removedPaths "$RETIREMENT_REMOVED_PATHS_JSON" \
    --arg generatedAt "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    '{
      schemaVersion: 1,
      status: "REMOVED",
      generatedAt: $generatedAt,
      preRemovalInputHash: $preRemovalInputHash,
      removalAuthorizationId: $removalAuthorizationId,
      removedPaths: $removedPaths,
      diffHash: $diffHash,
      unitNotFoundEvidencePath: $unitNotFoundEvidencePath,
      unitNotFoundEvidenceHash: $unitNotFoundEvidenceHash
    }' > "$RETIREMENT_POST_REMOVAL_EVIDENCE"
)
jq -e \
  --arg preRemovalInputHash "$RETIREMENT_PRE_REMOVAL_INPUT_HASH" \
  --arg removalAuthorizationId "$RETIREMENT_REMOVAL_AUTHORIZATION_ID" \
  --arg diffHash "$RETIREMENT_DIFF_HASH" \
  --arg unitNotFoundEvidencePath "$RETIREMENT_UNIT_NOT_FOUND_OUTPUT" \
  --arg unitNotFoundEvidenceHash "$RETIREMENT_UNIT_NOT_FOUND_HASH" \
  --argjson removedPaths "$RETIREMENT_REMOVED_PATHS_JSON" \
  '.schemaVersion == 1
   and .status == "REMOVED"
   and .preRemovalInputHash == $preRemovalInputHash
   and .removalAuthorizationId == $removalAuthorizationId
   and .removedPaths == $removedPaths
   and .diffHash == $diffHash
   and .unitNotFoundEvidencePath == $unitNotFoundEvidencePath
   and .unitNotFoundEvidenceHash == $unitNotFoundEvidenceHash' "$RETIREMENT_POST_REMOVAL_EVIDENCE"
```

The manifest must include the legacy process launcher and service-definition
paths, not only a source-code diff. It must include the final stopped-unit
inventory and the exact production evidence hashes. A failed check leaves the
legacy files in place and keeps the removal blocked. This runbook currently
has no observed production cohort or retirement evidence, so this gate remains
blocked.



## Rollback boundary

The pre-write rollback drill in **Cutover boundary** uses the durable session
and must return `BINARY_ROLLBACK_ALLOWED` before any governed receipt,
lifecycle transition, demand or wave event, or authoritative write. Do not
restart the legacy fleet.

After the first governed write, use forward-only containment. First close
governed admission. Keep the gateway available for forward repair. Do not
restart the legacy fleet and do not restore old writers.
Run the Compose commands from the governed deployment directory:

```text
cd /path/to/repository/apps/site/deploy/affiliate-governed
```
Before the containment commands, list the services that are running:

```text
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner ps --status running --services
```

If `affiliate-gateway` is not listed, skip the authenticated close and status
calls in steps 1 and 2. Do not run `docker compose exec` against a stopped or
absent gateway. If no governed worker is listed, skip the worker stop command
in step 4. Run the session-bound post-write drill in step 3 immediately after
the first governed write, even when no governed service started.


1. If `affiliate-gateway` is running, obtain separate current authorization
   for this production state change. Run the authenticated `POST
   /v1/affiliate-agent/admission/close` call inside the gateway container:

```text
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/admission/close", {
  method: "POST",
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "closed" || body.open !== false
      || Object.keys(body).sort().join(",") !== "open,status") throw new Error(JSON.stringify(body));
  console.log(JSON.stringify(body));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'
```

2. If `affiliate-gateway` is running, confirm that the authenticated `GET
   /v1/affiliate-agent/admission` call reports `"status":"closed"` and
   `"open":false`:

```text
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml exec -T affiliate-gateway node -e '
const prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || "/v1/affiliate-agent").replace(/\/$/, "");
fetch("http://127.0.0.1:8080" + prefix + "/admission", {
  headers: {"x-affiliate-gateway-operator-token": process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN}
}).then(async (response) => {
  const body = await response.json();
  if (!response.ok || body.status !== "closed" || body.open !== false
      || Object.keys(body).sort().join(",") !== "open,status") throw new Error(JSON.stringify(body));
  console.log(JSON.stringify(body));
}).catch((error) => { console.error(error); process.exitCode = 1; });
'
```

3. Before this durable post-write rollback-drill write, obtain separate
   current authorization. Run the same session-bound command. It uses only
   the durable session ID and operator ID:

```text
cd "$OPERATOR_CLI_DIR"
assert_reviewed_database_identity
npm run --silent affiliate:cutover:rollback -- \
  --session-id="$CUTOVER_SESSION_ID" \
  --operator="$OPERATOR_ID" \
  > /path/to/affiliate-governed-private/rollback-drill-post-write.json
jq -e '.decision.mode == "FORWARD_ONLY" and (.record.reportHash | type) == "string" and (.record.reportHash | length) == 64' \
  /path/to/affiliate-governed-private/rollback-drill-post-write.json
```

The command loads the reviewed manifest, process inventory, preflight report,
deployment contract, and cutover start from the durable session. It captures
current runtime evidence and persists a `ROLLBACK_DRILL` reconciliation record.
Do not pass `--since`, `--manifest`, `--evidence`, `--rollout-cohort`, or
`--runtime-inventory`. A missing, stale, or mismatched session artifact must
not permit binary rollback. The post-write result must remain `FORWARD_ONLY`.
Preserve the current public content and use governed commands for forward
repair.

4. If at least one governed worker or the replenishment controller is running,
   obtain separate current authorization for this production state change. Stop
   the controller first to prevent a new replenishment write. Keep
   `affiliate-gateway` running for forward repair and status checks:

Each Mapping Producer, Supply Reviewer, and Coverage Planner supervisor has a
`30m` Compose stop grace period so an in-flight governed operation can drain.
Stop the replenishment controller, then the five supervisors, then the runner.
Leave the gateway last and running for forward repair.

```text
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner stop affiliate-replenishment-controller
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner stop \
  mapping-producer-1 mapping-producer-2 supply-reviewer-1 supply-reviewer-2 \
  coverage-planner
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner stop affiliate-agent-runner
```

5. Verify containment after the worker stop:

```text
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner ps --status running --services \
  > /path/to/affiliate-governed-private/running-services-after-containment.txt
awk '$1 == "affiliate-gateway" { found=1 } END { exit found ? 0 : 1 }' \
  /path/to/affiliate-governed-private/running-services-after-containment.txt
awk '$1 ~ /^(affiliate-agent-runner|mapping-producer-1|mapping-producer-2|supply-reviewer-1|supply-reviewer-2|coverage-planner|affiliate-replenishment-controller)$/ { exit 1 }' \
  /path/to/affiliate-governed-private/running-services-after-containment.txt
```

The gateway must remain available for forward repair. If it is listed as
running, run the authenticated `GET /v1/affiliate-agent/admission` status
command from step 2 again and require `"status":"closed"` and `"open":false`.
If the gateway is not running, record a containment failure and do not restart
legacy writers or use `up` to restore a governed worker.

### Intentional full-fleet shutdown

The normal post-write containment above leaves the gateway running for forward
repair. If rollback or incident containment requires disabling the entire
governed project, obtain separate current authorization after admission is
closed and the post-write drill is recorded. Change the private policy back to
`no` before stopping the fleet:

```text
test "$(grep -c '^AFFILIATE_AGENT_RESTART_POLICY=' \
  /path/to/affiliate-governed-private/deployment.env)" = "1"
umask 077
awk '
  BEGIN { found = 0 }
  /^AFFILIATE_AGENT_RESTART_POLICY=/ {
    print "AFFILIATE_AGENT_RESTART_POLICY=no"
    found = 1
    next
  }
  { print }
  END { if (!found) exit 1 }
' /path/to/affiliate-governed-private/deployment.env \
  > /path/to/affiliate-governed-private/deployment.env.next &&
chmod 0600 /path/to/affiliate-governed-private/deployment.env.next &&
mv /path/to/affiliate-governed-private/deployment.env.next \
  /path/to/affiliate-governed-private/deployment.env
test "$(sed -n 's/^AFFILIATE_AGENT_RESTART_POLICY=//p' \
  /path/to/affiliate-governed-private/deployment.env)" = "no"
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner config --format json |
jq -e '
  .services as $services
  | [
      $services["affiliate-gateway"].restart,
      $services["affiliate-agent-runner"].restart,
      $services["mapping-producer-1"].restart,
      $services["mapping-producer-2"].restart,
      $services["supply-reviewer-1"].restart,
      $services["supply-reviewer-2"].restart,
      $services["coverage-planner"].restart,
      $services["affiliate-agent-downstream-ready"].restart,
      $services["affiliate-replenishment-controller"].restart
    ]
  | all(.[]; . == "no")
'
```

Apply the disabled policy to existing containers before stopping them, so a
daemon event during shutdown cannot bring the project back:

```text
SHUTDOWN_CONTAINER_IDS="$(
  docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
    -f compose.yml --profile coverage-planner ps -aq \
    affiliate-gateway affiliate-agent-runner mapping-producer-1 \
    mapping-producer-2 supply-reviewer-1 supply-reviewer-2 coverage-planner \
    affiliate-agent-downstream-ready affiliate-replenishment-controller
)"
test -n "$SHUTDOWN_CONTAINER_IDS"
printf '%s\n' "$SHUTDOWN_CONTAINER_IDS" | awk '
  NF != 1 || length($1) != 64 || $1 !~ /^[a-fA-F0-9]+$/ { exit 1 }
  { count++ }
  END { exit count == 9 ? 0 : 1 }
'
while IFS= read -r container_id; do
  test -n "$container_id"
  docker update --restart=no "$container_id"
done <<EOF
$SHUTDOWN_CONTAINER_IDS
EOF
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner stop affiliate-replenishment-controller
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner stop affiliate-agent-downstream-ready
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner stop \
  mapping-producer-1 mapping-producer-2 supply-reviewer-1 supply-reviewer-2 \
  coverage-planner
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner stop affiliate-agent-runner
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner stop affiliate-gateway
```

Capture the stopped state and disabled policy without retaining environment
values:

```text
docker compose --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner ps --status running --services \
  > /path/to/affiliate-governed-private/running-services-after-full-shutdown.txt
test ! -s /path/to/affiliate-governed-private/running-services-after-full-shutdown.txt
install -m 0600 /dev/null \
  /path/to/affiliate-governed-private/governed-full-shutdown.redacted.json
docker inspect $(docker compose \
  --env-file /path/to/affiliate-governed-private/deployment.env \
  -f compose.yml --profile coverage-planner ps -aq \
  affiliate-gateway affiliate-agent-runner mapping-producer-1 \
  mapping-producer-2 supply-reviewer-1 supply-reviewer-2 coverage-planner \
  affiliate-agent-downstream-ready affiliate-replenishment-controller) |
jq 'map({
  name: (.Name | ltrimstr("/")),
  status: (.State.Status // "unknown"),
  restartPolicy: (.HostConfig.RestartPolicy.Name // "no")
})' > /path/to/affiliate-governed-private/governed-full-shutdown.redacted.json
jq -e 'length == 9 and all(.[]; .status != "running" and .restartPolicy == "no")' \
  /path/to/affiliate-governed-private/governed-full-shutdown.redacted.json
shasum -a 256 \
  /path/to/affiliate-governed-private/governed-full-shutdown.redacted.json \
  >> /path/to/affiliate-governed-private/deployment-evidence.sha256
```

This is an intentional operator shutdown: the containers are stopped and their
Docker restart policy is `no`, so a daemon restart cannot restart them. Do not
run `up` while the private value is `no`. To resume, repeat the stopped
creation and startup/readiness gates, then perform the separately authorized
`no` to `unless-stopped` transition above.
