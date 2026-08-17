# Team Invite Search And Email Toggle Parity

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` in this repository and aligns API contracts with `~/Projects/MVP/mvp-site` as the backend source of truth.

## Purpose / Big Picture

After this change, team captains can switch between searching existing players and inviting by email using a single toggle button next to the invite search bar. The same behavior will exist in both the shared app (`composeApp`) and the web app (`mvp-site`). Email-based invites must create team invites that the backend can email correctly, so captains can invite people who are not yet active users.

## Progress

- [x] (2026-02-14 05:04Z) Audited current invite flows in `composeApp` and `mvp-site` (UI + services + `/api/invites`).
- [x] (2026-02-14 05:07Z) Implemented Compose team-invite UI toggle by extending `SearchBox` and updating `SearchPlayerDialog` mode behavior.
- [x] (2026-02-14 05:09Z) Implemented web `TeamDetailModal` toggle flow and wired email mode to `ensureUserByEmail` + `teamService.invitePlayerToTeam`.
- [x] (2026-02-14 05:09Z) Updated `/api/invites` to send invite emails for placeholder user-id invites and added regression coverage.
- [x] (2026-02-14 05:10Z) Ran targeted verification and recorded outcomes (`mvp-site` tests + lint passed with warnings only; Compose Gradle tests blocked by local Java 8 runtime).

## Surprises & Discoveries

- Observation: The shared app already has `ensureUserByEmail` and an email-typed invite entry in `SearchPlayerDialog`, but it is not an explicit toggle next to the search bar.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/SearchPlayerDialog.kt`.
- Observation: Web has a separate large email invite form below search instead of a mode switch next to search.
  Evidence: `~/Projects/MVP/mvp-site/src/components/ui/TeamDetailModal.tsx`.
- Observation: `/api/invites` only enqueues email send when invite creation path is email-first without `userId`; user-id invite creation does not currently trigger email.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/invites/route.ts`.
- Observation: Local Gradle validation is blocked by Java 8 in the environment, while project dependencies require Java 11+.
  Evidence: `./gradlew :composeApp:commonTest` failed with `Dependency requires at least JVM runtime version 11. This build uses a Java 8 JVM.`

## Decision Log

- Decision: Use one toggle-driven mode model (`search players` vs `invite by email`) in both UIs instead of keeping parallel sections.
  Rationale: Matches the requested interaction and reduces captain confusion by making invite intent explicit.
  Date/Author: 2026-02-14 / Codex
- Decision: Keep the existing backend contract (`/api/users/ensure` + `/api/invites`) and patch `/api/invites` to send email for placeholder user-id invites.
  Rationale: Preserves current clients while fixing the email gap for team invite flows that already rely on user-id invites.
  Date/Author: 2026-02-14 / Codex
- Decision: In web `TeamDetailModal`, replace multi-row first/last/email form with a single email mode tied to the same search bar toggle.
  Rationale: The request is specifically for a switch beside the search input; this keeps interaction focused and consistent with app flow.
  Date/Author: 2026-02-14 / Codex

## Outcomes & Retrospective

Shared app and web app now both expose a direct switch next to the team-invite search field to toggle between searching players and inviting by email. Backend `/api/invites` now handles the key email-send gap for user-id invites targeting invite-placeholder accounts, which is the path used after ensuring by email and then inviting to team pending.

Automated verification passed for backend invite route regression tests and lint checks on touched web/backend files (warnings only). Compose-side automated verification could not run due the local Java 8 runtime constraint.

## Context and Orientation

Shared app team invite UI is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/CreateOrEditTeamDialog.kt`, which launches `SearchPlayerDialog` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/SearchPlayerDialog.kt`. The reusable input row used there is `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/SearchBox.kt`.

Web team invite UI is in `~/Projects/MVP/mvp-site/src/components/ui/TeamDetailModal.tsx`, with calls through `~/Projects/MVP/mvp-site/src/lib/teamService.ts` and `~/Projects/MVP/mvp-site/src/lib/userService.ts`.

Backend invite creation is in `~/Projects/MVP/mvp-site/src/app/api/invites/route.ts`, and placeholder-user detection helper is in `~/Projects/MVP/mvp-site/src/lib/authUserPlaceholders.ts`.

## Plan of Work

First, update Compose `SearchPlayerDialog` so captains can toggle modes from a button adjacent to the search input row. In search mode, behavior remains unchanged (free agents/friends/suggestions). In email mode, suggestions list becomes email-invite specific and only shows invite CTA when the email is valid.

Second, update web `TeamDetailModal` to replace the separate bottom email form with an inline mode switch next to search. Add invite-by-email handling that ensures a user by email, invites that user to team pending, updates local pending UI state, and surfaces success/error notifications.

Third, update `/api/invites` so invites created with `userId` send email when that `AuthUser` is still an invite placeholder account. This keeps existing invite-by-user-id flows compatible while enabling email sends for newly ensured users.

Finally, run focused tests (at least invite API tests and app compile/tests relevant to changed modules), then update this plan sections with outcomes.

## Concrete Steps

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/SearchBox.kt` to support optional content next to the search text field row.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/SearchPlayerDialog.kt` to add mode toggle and email-mode rendering.
3. Edit `~/Projects/MVP/mvp-site/src/components/ui/TeamDetailModal.tsx` to add mode toggle + inline email invite submit flow.
4. Edit `~/Projects/MVP/mvp-site/src/lib/userService.ts` to expose `ensureUserByEmail`.
5. Edit `~/Projects/MVP/mvp-site/src/app/api/invites/route.ts` (+ tests in `src/app/api/invites/__tests__/inviteRoutes.test.ts`) for placeholder user-id invite email send behavior.
6. Run targeted checks:
   - `cd /home/camka/Projects/MVP/mvp-app && ./gradlew :composeApp:commonTest`
   - `cd /home/camka/Projects/MVP/mvp-site && npm test -- src/app/api/invites/__tests__/inviteRoutes.test.ts`

## Validation and Acceptance

Acceptance is met when:

- In shared app team invite dialog, a button next to the search bar toggles between searching players and inviting by email.
- In web TeamDetailModal Add Players section, the same switch exists next to the search bar and email mode can invite by email.
- Inviting by email results in a team invite record and backend email-send attempt for placeholder invite-created users.
- Targeted automated checks pass for modified backend route and shared app module.

## Idempotence and Recovery

All changes are additive and safe to re-run. If a UI edit misbehaves, revert only touched files and keep backend behavior changes isolated to `/api/invites`. Invite API tests can be rerun repeatedly.

## Artifacts and Notes

- `cd /home/camka/Projects/MVP/mvp-site && npm test -- src/app/api/invites/__tests__/inviteRoutes.test.ts`
  - Passed: 2 tests, 0 failures.
- `cd /home/camka/Projects/MVP/mvp-site && npx eslint src/components/ui/TeamDetailModal.tsx src/lib/userService.ts src/lib/teamService.ts src/app/api/invites/route.ts src/app/api/invites/__tests__/inviteRoutes.test.ts`
  - Result: 0 errors, 4 warnings (`react-hooks/exhaustive-deps`, `@next/next/no-img-element` pre-existing patterns in file).
- `cd /home/camka/Projects/MVP/mvp-app && ./gradlew :composeApp:commonTest`
  - Failed before test execution due local JVM version (`Java 8`, requires `11+`).

## Interfaces and Dependencies

The resulting interfaces should include:

- Optional action slot in `SearchBox` composable so screens can place toggle controls beside the input.
- Web `userService.ensureUserByEmail(email: string): Promise<UserData>`.
- `/api/invites` user-id branch deciding email-send eligibility with `isInvitePlaceholderAuthUser`.
