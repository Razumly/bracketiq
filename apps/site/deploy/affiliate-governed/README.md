# Governed affiliate fleet

This Compose project defines the reviewed five-worker topology:

- Two Mapping Producers.
- Two Supply Reviewers.
- One Coverage Planner.

Each worker uses one claim through the governed supervisor command. The
containers reach the internal gateway only. They do not receive a production
database URL, object-storage credential, provider credential, repository token,
or unrestricted backend network access.

## Prepare the manifest

1. Copy `deployment.env.example` to an untracked `deployment.env`.
2. Set the reviewed image digest.
3. Set the internal gateway address.
4. Set one role credential for each worker.
5. Set the model credential.
6. Set an existing workspace root.
7. Keep the restart policy set to `no` while the fleet is stopped.
8. Inspect the resolved manifest without starting a service:

```text
docker compose --env-file deployment.env -f compose.yml config
```

The resolved service inventory must contain exactly two
`MAPPING_PRODUCER` workers, two `SUPPLY_REVIEWER` workers, and one
`COVERAGE_PLANNER` worker. The agent environment must contain only the
internal gateway, model, workspace, and role-scoped values.

## Cutover boundary

1. Stop the legacy fleet by the approved operator procedure.
2. Capture the process, claim, permission, and container inventory.
3. Run `npm run affiliate:cutover:preflight -- --inventory=<file>`.
4. Save the JSON report and review every blocking finding.
5. Run `npm run affiliate:cutover:reconcile -- --dry-run --rollout-cohort=DEFAULT`.
6. Review the report hash, input hash, counts, targets, claims, and resolutions.
7. Apply only the same report with the operator ID, apply nonce, report hash,
   input hash, reviewed counts hash, and ready preflight report.

The reconciliation command does not start or stop a runtime. It uses one
serializable database transaction for an apply. A changed snapshot or an
active legacy claim blocks the apply.

## Rollback boundary

Before the first governed receipt or lifecycle transition, the operator may
roll back the reviewed binaries while both fleets remain stopped. After the
first governed write, use forward-only containment. Do not restart the legacy
fleet. Reconcile the failed governed work through the gateway and preserve the
immutable report and transition evidence.
