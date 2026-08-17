# Team open registration and payments

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It covers the Kotlin Multiplatform app in this repository and depends on the matching backend/site work in `C:\Users\samue\Documents\Code\mvp-site\plans\team-open-registration-payments-execplan.md`.

## Purpose / Big Picture

Team managers will be able to open a team for public registration, optionally charge a registration cost when the billing owner has Stripe connected, and let users register or leave without manually editing the roster. A user can see this working by opening a readonly team view, pressing Register for team, completing payment if required, and seeing their membership appear on the team.

## Progress

- [x] (2026-04-20 18:35Z) Created this mobile ExecPlan and linked it to the backend/site ExecPlan.
- [x] (2026-04-20) Updated shared team models, DTOs, repository calls, billing payloads, and Room database version for open registration fields and team registration actions.
- [x] (2026-04-20) Updated create/edit and readonly team UI for open registration, cost entry, register, paid payment, and leave flows.
- [x] (2026-04-20) Added focused app tests for team DTO field mapping, register/leave endpoints, and paid team registration purchase-intent payload.
- [x] (2026-04-20) Ran mobile validation commands.

## Surprises & Discoveries

- Observation: The working tree already has unrelated match-detail edits before this feature begins.
  Evidence: `git status --short` shows modified `MatchRepository.kt`, `MatchContentComponent.kt`, `MatchDetailScreen.kt`, and `MatchContentComponentTest.kt`. This plan must not revert or rewrite those files unless the feature directly requires it.

- Observation: The documented `:composeApp:roomGenerateSchema` task does not exist in this checkout.
  Evidence: `.\gradlew :composeApp:roomGenerateSchema` failed with task-not-found. `.\gradlew :composeApp:tasks --all` showed `copyRoomSchemas`; subsequent compile/test/assemble runs executed `copyRoomSchemas` as `NO-SOURCE`. The database version is now 14 and `composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/14.json` contains the new team columns.

## Decision Log

- Decision: Use `openRegistration` and `registrationPriceCents` as the mobile contract fields.
  Rationale: The backend contract stores money in cents and the app already treats payment amounts as cent values for purchase intents.
  Date/Author: 2026-04-20 / Codex

- Decision: Free open registration is allowed without Stripe, while positive registration cost is zeroed in the app UI when Stripe is unavailable and rejected by the backend.
  Rationale: The user explicitly selected free open registration without Stripe during planning, but backend validation remains the source of truth.
  Date/Author: 2026-04-20 / Codex

## Outcomes & Retrospective

Implemented app support for team open registration and payments. Teams now carry ownership, open-registration, and cent-based price fields through shared models, DTOs, local cache, and update payloads. `TeamRepository` exposes free self-register and leave calls, while `BillingRepository` posts `purchaseType=team_registration` with `teamRegistration.teamId` for paid checkout. Organization team cards can open a readonly team dialog, paid registration uses the existing payment processor, and active members can leave through the registration endpoint. The create/edit team screen includes the open-registration checkbox and guarded price input.

Validation completed on Windows:

- `.\gradlew :composeApp:compileDebugKotlinAndroid` passed.
- `.\gradlew :composeApp:testDebugUnitTest` passed after clearing a stale generated Gradle test-results directory from a previous failed run.
- `.\gradlew :composeApp:assembleDebug` passed.

## Context and Orientation

The app stores teams in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Team.kt`, maps backend JSON in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/TeamDtos.kt`, and sends updates through `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/TeamRepository.kt`. Paid event registration already uses `BillingRepository` and the app payment processor; team registration should reuse those concepts instead of introducing a separate payment stack.

Readonly team display exists in `TeamDetailsDialog`, while the create/edit surface exists in `CreateOrEditTeamScreen`. Organization team cards currently render without a registration action, so they need a way to open a readonly team dialog when open registration is relevant.

## Plan of Work

First, extend the shared data contract. Add `openRegistration`, `registrationPriceCents`, `organizationId`, and `createdBy` where team data is serialized, cached, copied, and sent to the backend. Add a `STARTED` membership constant for pending paid team registration while keeping `LEFT` for self-leave.

Second, add repository methods for registering and leaving teams. Free registration calls the new backend self-registration endpoint. Paid registration asks `BillingRepository` for a `team_registration` purchase intent and uses the existing payment processor flow.

Third, update UI. The create/edit team screen gets an open-registration checkbox and a money input guarded by whether the organization or user can charge with Stripe. Readonly team views get Register for team, payment, full/disabled, and Leave Team states. After registration or leave, refresh the relevant team and current user state from the repositories.

Finally, increment the Room database version, regenerate schema snapshots, and run the mobile unit test/build commands listed below.

## Concrete Steps

Run commands from `C:\Users\samue\StudioProjects\mvp-app` unless otherwise noted.

1. Edit the team data, DTO, repository, billing, and UI files described above.
2. Run `.\gradlew :composeApp:roomGenerateSchema` after Room entity fields change and review the schema diff under `composeApp/schemas`.
3. Run `.\gradlew :composeApp:testDebugUnitTest`.
4. Run `.\gradlew :composeApp:assembleDebug` if time allows after tests pass.

## Validation and Acceptance

Acceptance is met when a free open team lets a non-member register from a readonly team view and then shows that user as an active member, a paid open team launches the existing Stripe payment sheet and activates membership after success, and an active member can leave so their registration becomes `LEFT` rather than being deleted. The app must continue to parse older teams without the new fields by applying defaults.

## Idempotence and Recovery

The repository edits are additive and can be retried. Room schema generation is safe to rerun after the database version is incremented. If Gradle fails because of local Android SDK or JDK configuration, record the failure in this plan and keep the code changes reviewable.

## Artifacts and Notes

The Stripe integration should remain on the existing PaymentIntent-based app flow because the backend owns registration reservation state before payment is confirmed.

## Interfaces and Dependencies

At completion, `Team` and team DTOs expose `openRegistration: Boolean`, `registrationPriceCents: Int`, nullable `organizationId`, and nullable `createdBy`. `TeamRepository` exposes suspend functions for `registerForTeam(teamId: String)` and `leaveTeam(teamId: String)`. `BillingRepository` exposes a way to request a purchase intent for a team registration, with the backend returning the same payment client-secret shape used by event purchases.
