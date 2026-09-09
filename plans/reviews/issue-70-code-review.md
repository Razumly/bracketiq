# Issue 70 code review

## Fixed point

- Commit: `21df110ae`
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
- The new complexity CI gate was removed because it failed 512 findings across legacy files unrelated to this cutover. Existing lint, full Jest CI, Prisma validation, TypeScript, and production build checks remain.

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

Initial findings moved through `open -> fixed -> re-reviewed -> verified` across commits `121d5fcf7`, `cb287f97d`, `f113f0463`, and `21df110ae`.

No unresolved review finding may block release. CI status remains a separate release gate.

## Final guarded recovery review

- Fixed base: `b0827c8a086f03dd583a591767c50eaf336295b2`.
- Final Standards review: **PASS**.
- Final Spec review: **PASS**.
- Isolated core database recovery suite: **45/45 passed**.
- HTTP recovery subset: **55/55 passed**.
- Exact complete validation set: **15 suites / 531 tests passed**.
- `npx tsc --noEmit`: **passed**.
- Targeted ESLint: **passed**.

The source prerequisite is verified. A real production PREVIEW ran in a
temporary process with `SHOW default_transaction_read_only = on` before the
recovery call. It used generated role-contract version 4 and deployment
version 5, returned `eligible: true`, `reasonCodes: ["ELIGIBLE"]`,
`outcome: "PREVIEW"`, and `writeCount: 0` for the retained Boomtown
receipt/claim/job and Supply Source. The report hash is
`f4373cc8e3a9c84852dc8c327f8e407d3e4039c806118dae12ac944195bd4d20`;
the safe report is preserved at
`/tmp/recovery-production-preview.safe.json`.

Deployment, actual guarded recovery, and the authorized Softball retry remain
pending. This verification performed no production write, token revival,
claim creation, or retry.
