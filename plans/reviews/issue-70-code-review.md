# Issue 70 code review

## Fixed point

- Commit: `0336a881a`
- Base: `cb287f97d`
- Specification: GitHub Issue #70

## Standards review

Status: `verified`.

- Governance credential inspection checks every environment value for a connection URL. It reports only the environment key.
- Producer repair jobs use the lifecycle generation from the committed transition.
- Preflight includes database permission findings and rejects running control-plane writers.
- Gateway startup rejects operator, replenishment, worker, and supervisor-halt credential collisions.
- Authority-backed health failures close admission. Generic liveness failures do not.
- Retained writable launchers require an explicit local-only runtime and loopback database.
- Deployment runbook gates use closed shell filters, service-specific mounts, resolved network names, dedicated keys, separate migration credentials, and image-object digest inspection.

Evidence:

- Governance standards re-review: no findings.
- Deployment standards re-review: prior findings were fixed. The final review also identified the missing `command` field in a transition-row type. Commit `f113f0463` retains both `command` and `generation`; `DATABASE_URL=placeholder npx tsc --noEmit --pretty false` passed.
- Focused governance and gateway suites passed.

## Specification review

Status: `verified` for reviewed findings.

- APPLY binds the reviewed preflight to the active Supply Contract hash.
- Lifecycle invariant violations halt before replay or persistence.
- Lifecycle sequence and generation drift halts before replay or persistence.
- Applied-run replay performs lifecycle safety checks before returning or writing.
- Positive-generation roots without immutable transition history halt. Generation zero without history remains valid.
- Startup refresh supports an absent gateway, maps Docker states to reviewed states, projects service identities, and retains full IDs as evidence.
- Image evidence is written before validation.
- Replenishment credentials remain distinct from all worker and halt credentials.
- Socket evidence matches the runner contract.
- Migration evidence checks database and runtime role identity.

Evidence:

- Governance spec re-review: two residual findings were fixed by `cb287f97d` and passed the focused persistence suite.
- Deployment spec re-review: six residual findings were fixed by `f113f0463` and `0336a881a`. Final deployment re-review confirmed no remaining concrete findings.

## Finding lifecycle

Initial findings moved through `open -> fixed -> re-reviewed -> verified` across commits `121d5fcf7`, `cb287f97d`, and `f113f0463`.

No unresolved review finding may block release. CI status remains a separate release gate.
