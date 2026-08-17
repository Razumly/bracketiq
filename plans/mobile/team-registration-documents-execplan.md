# Team Registration Documents and Team Join Parity

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root. The feature spans `C:/Users/samue/Documents/Code/mvp-site` for backend and web work and `C:/Users/samue/StudioProjects/mvp-app` for the Kotlin Multiplatform client alignment.

## Purpose / Big Picture

After this change, organization-owned teams can require document templates just like events do, and team join flows enforce signing before payment or free activation. A player joining a team from the public team page or the internal team detail modal can choose self or linked child, sign missing team documents, pay when required, and resume missing compliance later from team details or the profile documents screen. The mobile app now consumes the same team and team-registration contract so open-registration team joins stay in sync with the server.

## Progress

- [x] (2026-04-23T09:40:24-07:00) Reviewed the current team registration, event registration, payment intent, signing, team detail, public team page, and profile documents flows in `mvp-site`.
- [x] (2026-04-23T09:40:24-07:00) Confirmed the current gaps: `CanonicalTeams` had no `requiredTemplateIds`, `TeamRegistrations` was still self-only, `SignedDocuments` and `BoldSignSyncOperations` were only event-scoped, and both team detail surfaces still used the thin team join flow.
- [x] (2026-04-23T12:28:00-07:00) Finished the `mvp-site` schema and shared type changes: `CanonicalTeams.requiredTemplateIds`, consent-aware `TeamRegistrations`, and `teamId` on signed-document and BoldSign sync rows.
- [x] (2026-04-23T12:28:00-07:00) Finished the `mvp-site` route and UI rework: team create/edit template selection, self/child team registration, team signing, purchase-intent gating, profile document aggregation, and shared public/internal team join flow.
- [x] (2026-04-23T14:23:00-07:00) Mirrored the finalized team and team-registration contract into `mvp-app`, including `requiredTemplateIds`, richer `TeamPlayerRegistration` fields, consent-aware team-registration responses, richer team-registration checkout payloads, team-specific signing APIs, and team-aware profile documents.
- [x] (2026-04-23T14:23:00-07:00) Updated the mobile event-detail and organization-detail team join flows so they request team registration first, require signing before free activation or payment, and only treat `ACTIVE` registrations as completed joins.
- [x] (2026-04-23T14:23:00-07:00) Regenerated the Room schema snapshot by compiling the Android unit-test target after bumping `MVP_DATABASE_VERSION` to `15`; `composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/15.json` now exists and matches the new `Team` entity shape.
- [x] (2026-04-23T14:23:00-07:00) Ran targeted verification: `mvp-site` Prisma generation and TypeScript compile, plus `mvp-app` targeted Gradle tests for team DTO parsing, repository parsing, billing HTTP wiring, event-detail team join flow, and organization-detail regression coverage.
- [x] (2026-04-24T15:10:00-07:00) Followed up on the mobile team join UX: team detail dialogs now bind to Room-backed team flows so the join CTA disappears after registration refresh, unresolved team staff render as role labels instead of raw ids, and both event-detail and organization-detail signing flows wait for the backend to clear required team documents before resuming billing-address and payment steps automatically.

## Surprises & Discoveries

- Observation: Team creation and team editing use different modals today, so template selection had to be added to both `src/components/ui/CreateTeamModal.tsx` and `src/components/ui/TeamDetailModal.tsx`.
  Evidence: `src/app/teams/page.tsx` mounts both `CreateTeamModal` and `TeamDetailModal`.
- Observation: Team-specific signatures could not be modeled correctly without schema changes because `SignedDocuments` and `BoldSignSyncOperations` only stored `eventId` and not `teamId`.
  Evidence: `prisma/schema.prisma` defined `SignedDocuments.eventId` and `BoldSignSyncOperations.eventId`, but no `teamId` field.
- Observation: The existing mobile `ITeamRepository.registerForTeam(teamId)` return type was too thin for the new server contract. Preserving it as the only API would keep letting callers misinterpret `STARTED` team registrations as completed joins.
  Evidence: the old event-detail and organization-detail flows treated any successful response from `/api/teams/[id]/registrations/self` as a finished join even when the server now returns `registration`, `consent`, and a `STARTED` status.
- Observation: The team detail dialog in both mobile entry points held onto a snapshot `TeamWithPlayers` instead of observing the Room row, so the CTA and staff list could stay stale after registration or after a staff-user fetch completed.
  Evidence: `ParticipantsVeiw.kt` and `OrganizationDetailScreen.kt` both stored `selectedTeam` as local state for the dialog, and the org screen only seeded `knownUsers` from players plus captain.
- Observation: On this Windows machine, Gradle stayed alive only after lowering the heap and moving the Java heap above the 4 GB address boundary.
  Evidence: the default daemon crashed with `Native memory allocation (malloc) failed to allocate 1241344 bytes` in `hs_err_pid58648.log`; rerunning with `-Xmx768m -XX:HeapBaseMinAddress=6g -XX:CICompilerCount=2 -Xss512k` allowed compilation and tests to complete.
- Observation: The Room schema task name in this checkout is `copyRoomSchemas`, not `roomGenerateSchema`.
  Evidence: `:composeApp:tasks --all | Select-String -Pattern 'room|schema'` lists `copyRoomSchemas`.

## Decision Log

- Decision: Implement `mvp-site` first and treat it as the source of truth before aligning `mvp-app`.
  Rationale: The repository instructions explicitly define `mvp-site` as the backend/data contract source of truth for this workspace, and the mobile app already consumes that contract.
  Date/Author: 2026-04-23 / Codex
- Decision: Keep `TeamRegistrations.userId` as the stored registrant key and expose `registrantId` as a compatibility alias in serialized payloads.
  Rationale: The plan requires event-style semantics without a column rename, which keeps the existing unique key and migration scope smaller while still matching event-registration payloads for clients.
  Date/Author: 2026-04-23 / Codex
- Decision: Do not block invite acceptance or manager-added roster edits in this iteration. Instead, surface missing team documents as compliance debt on team details and the profile documents screen.
  Rationale: This matches the agreed product direction and avoids forcing non-self-service paths through checkout immediately.
  Date/Author: 2026-04-23 / Codex
- Decision: Introduce `requestTeamRegistration` on the Kotlin repository layer and keep `registerForTeam` as a strict compatibility wrapper that only succeeds for `ACTIVE` registrations.
  Rationale: Mobile screens now need the full `registration` and `consent` payload to decide whether to sign, activate a free join, or start checkout. Leaving the old method as a blind `Team` fetch would preserve the original bug.
  Date/Author: 2026-04-23 / Codex
- Decision: Reuse the existing mobile text-signature and embedded-web-signature UI states for team document signing instead of inventing a second prompt system.
  Rationale: The user-visible behavior matches the event join flow, keeps the UI surface smaller, and only required adding team-scoped sign-link and record-signature calls under the existing prompt machinery.
  Date/Author: 2026-04-23 / Codex
- Decision: Make the mobile profile documents flow branch on `eventId` versus `teamId` so team-required profile documents sign through the new team endpoints.
  Rationale: Once `mvp-site` started returning team-required documents from `/api/profile/documents`, the previous event-only mobile logic would reject those cards as invalid.
  Date/Author: 2026-04-23 / Codex
- Decision: Treat the backend-required-document response as the source of truth for signature completion instead of maintaining a local completed-signature cache in the mobile join components.
  Rationale: Local optimistic completion let the client continue before the server had actually removed the required team document, which is why users could get stuck mid-flow or need a second tap after signing.
  Date/Author: 2026-04-24 / Codex

## Outcomes & Retrospective

The feature is implemented across both repositories. On `mvp-site`, teams now carry required document templates, team registrations mirror the event-registration consent fields that matter for self-service join, team signing is scoped with `teamId`, purchase intents refuse checkout until signatures are complete, and both the public and internal team-detail surfaces route through the shared sign-before-pay flow. On `mvp-app`, the team contract now understands `requiredTemplateIds`, richer `TeamPlayerRegistration` fields, consent-aware team-registration responses, team-specific sign routes, and team-aware profile documents.

The most important mobile behavior change is that team join no longer treats the first successful registration POST as a completed join. Event-detail and organization-detail team joins now call the richer registration endpoint first, open the same text/PDF signing prompts when required, refresh the team registration after signing, and only activate the free join or start payment after the consent state is resolved. The follow-up fix on April 24 also removed the client-side shortcut that marked signatures complete locally before the backend had cleared them, so the join flow now waits on the server and automatically continues into billing-address and checkout steps without requiring a second tap.

Validation is targeted rather than full-suite. `mvp-site` was validated with Prisma generation plus a clean TypeScript compile. `mvp-app` was validated with `:composeApp:compileDebugUnitTestKotlinAndroid`, the targeted team regression classes, and `OrganizationDetailComponentTest`, plus the April 24 follow-up rerun covering `TeamDetailsDialogTest`, `EventDetailMobileJoinFlowTest`, and `OrganizationDetailComponentTest` together. The remaining gap is broader end-to-end manual QA across both apps, but the contract and client flow regressions covered by this plan are now exercised directly.

## Context and Orientation

The backend and web app live in `C:/Users/samue/Documents/Code/mvp-site`. The mobile client lives in `C:/Users/samue/StudioProjects/mvp-app`. Team data is currently split between canonical organization teams in `mvp-site/prisma/schema.prisma` model `CanonicalTeams` and event-owned teams in model `Teams`. Self-service team registration now centers on `src/server/teams/teamOpenRegistration.ts`, `src/server/teams/teamRegistrationDocuments.ts`, `src/app/api/teams/[id]/registrations/self/route.ts`, `src/app/api/teams/[id]/registrations/child/route.ts`, and `src/app/api/teams/[id]/sign/route.ts`.

Event registration already provided the richer patterns this feature copied. The relevant server routes were `src/app/api/events/[eventId]/registrations/self/route.ts`, `src/app/api/events/[eventId]/registrations/child/route.ts`, `src/app/api/events/[eventId]/sign/route.ts`, and the shared billing flow in `src/app/api/billing/purchase-intent/route.ts`. The web team surfaces that now converge with that behavior are `src/components/ui/TeamDetailModal.tsx` and `src/app/o/[slug]/teams/[teamId]/PublicTeamRegistrationClient.tsx`.

On the Kotlin side, the contract boundary lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/TeamDtos.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/BillingDtos.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/TeamRepository.kt`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`. The mobile team-join entry points are `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt`. The mobile profile documents screen that now needs to understand `teamId` is `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt`.

## Plan of Work

First, update the persistent models and public types in `mvp-site`. Add `requiredTemplateIds` to `CanonicalTeams`, add the event-style consent fields to `TeamRegistrations`, and add `teamId` to `SignedDocuments` and `BoldSignSyncOperations`. Then propagate those fields through `src/types/index.ts`, `src/server/teams/teamMembership.ts`, public organization catalog payloads, team create/edit routes, and organization-template deletion cleanup so every reader and writer agrees on the same shape.

Next, replace the thin team registration server logic with a consent-aware version patterned on the event routes. Extend the team registration helpers in `src/server/teams/teamOpenRegistration.ts` so they can create or update registrations for self and linked children, determine whether signatures already satisfy team requirements, dispatch required team documents, and keep paid registrations in `STARTED` until payment completes. Update the team billing purchase-intent route so `purchaseType: 'team_registration'` takes a richer `teamRegistration` payload and refuses checkout when required team signatures are still missing. Add a team-specific sign route that mirrors the event signer-context checks while persisting team-scoped signed-document records.

After the backend is stable, update the two team detail surfaces on `mvp-site`. Add organization template pickers to both team create and edit forms using the same organization-template loading pattern already used elsewhere. Then add a shared team join controller that loads linked children, opens the self-or-child chooser, starts signing when required, requests billing address when necessary, opens the existing `PaymentModal` for paid joins, and refreshes the current team after free join, signed completion, or payment completion. Also surface a resume-signing/compliance action when an existing member is missing team-required signatures.

Finally, align `mvp-app` with the new contract from `mvp-site`. Update the shared team and team-registration data models, repository parsing, billing payloads, team-specific signing methods, profile-document parsing, and the event-detail and organization-detail team join flows so `requiredTemplateIds`, `registrantId` aliasing, and consent-before-payment semantics are understood correctly. Regenerate the Room schema snapshot once the `Team` entity changes are in place.

## Concrete Steps

The implementation followed four concrete passes.

First, in `C:/Users/samue/Documents/Code/mvp-site`, update `prisma/schema.prisma`, the shared TypeScript types in `src/types/index.ts`, and the canonical team serializers so teams and team registrations expose the new fields everywhere they are read or written.

Second, in `mvp-site`, rework the team registration and signing routes. The key files are `src/server/teams/teamOpenRegistration.ts`, `src/server/teams/teamRegistrationDocuments.ts`, `src/app/api/teams/[id]/registrations/self/route.ts`, `src/app/api/teams/[id]/registrations/child/route.ts`, `src/app/api/teams/[id]/sign/route.ts`, `src/app/api/billing/purchase-intent/route.ts`, `src/app/api/documents/record-signature/route.ts`, `src/app/api/documents/signed/route.ts`, and `src/app/api/profile/documents/route.ts`.

Third, still in `mvp-site`, upgrade `src/components/ui/CreateTeamModal.tsx`, `src/components/ui/TeamDetailModal.tsx`, and `src/app/o/[slug]/teams/[teamId]/PublicTeamRegistrationClient.tsx` to expose required template selection and to run the shared self/child sign-before-pay team join flow.

Fourth, in `C:/Users/samue/StudioProjects/mvp-app`, update the Kotlin contract and flows in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Team.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/TeamMembership.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/TeamDtos.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/TeamRepository.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt`, then regenerate the Room schema snapshot and run targeted tests.

## Validation and Acceptance

Completed verification:

    C:/Users/samue/Documents/Code/mvp-site> npx prisma generate
    C:/Users/samue/Documents/Code/mvp-site> npm exec tsc --noEmit --pretty false

    C:/Users/samue/StudioProjects/mvp-app> .\gradlew.bat --no-daemon --console=plain --max-workers=2 :composeApp:compileDebugUnitTestKotlinAndroid
    C:/Users/samue/StudioProjects/mvp-app> .\gradlew.bat --no-daemon --console=plain --max-workers=2 :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.network.dto.TeamDtosTest" --tests "com.razumly.mvp.core.data.repositories.TeamRepositoryTeamsFetchTest" --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest" --tests "com.razumly.mvp.eventDetail.EventDetailMobileJoinFlowTest"
    C:/Users/samue/StudioProjects/mvp-app> .\gradlew.bat --no-daemon --console=plain --max-workers=2 :composeApp:testDebugUnitTest --tests "com.razumly.mvp.organizationDetail.OrganizationDetailComponentTest"
    C:/Users/samue/StudioProjects/mvp-app> .\gradlew.bat --no-daemon :composeApp:compileDebugUnitTestKotlinAndroid :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.presentation.composables.TeamDetailsDialogTest" --tests "com.razumly.mvp.eventDetail.EventDetailMobileJoinFlowTest" --tests "com.razumly.mvp.organizationDetail.OrganizationDetailComponentTest"

The Gradle commands above were run with reduced JVM settings on this Windows machine:

    -Xmx768m -XX:MaxMetaspaceSize=384m -XX:HeapBaseMinAddress=6g -XX:CICompilerCount=2 -Xss512k

Acceptance is now:

- `mvp-site` returns teams with `requiredTemplateIds`, team-registration responses with `registration` and `consent`, and team profile documents with `teamId`/`teamName`.
- `mvp-site` public and internal team detail flows require signing before free activation or payment, and paid teams still reuse the existing payment modal path.
- `mvp-app` parses the richer team contract, preserves the `registrantId` aliasing, routes team document signing through team-specific endpoints, and does not start checkout or report a free team join as complete until the team registration is actually active.
- `mvp-app` persists the updated `Team` entity shape under Room schema version `15`, with the generated snapshot at `composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/15.json`; in this checkout `copyRoomSchemas` was `NO-SOURCE`, so the snapshot was produced by the successful compile step instead.

## Idempotence and Recovery

All schema and API changes are additive and safe to rerun in a fresh checkout. The Gradle verification commands can be rerun as-is, provided the reduced-memory JVM settings are used on this Windows machine. If a partial implementation leaves the team join flow inconsistent, revert by file-specific edits instead of destructive git commands, and keep this ExecPlan updated with the exact stopping point before resuming.

## Artifacts and Notes

Important source-of-truth files:

    C:/Users/samue/Documents/Code/mvp-site/prisma/schema.prisma
    C:/Users/samue/Documents/Code/mvp-site/src/server/teams/teamOpenRegistration.ts
    C:/Users/samue/Documents/Code/mvp-site/src/server/teams/teamRegistrationDocuments.ts
    C:/Users/samue/Documents/Code/mvp-site/src/components/ui/TeamDetailModal.tsx
    C:/Users/samue/Documents/Code/mvp-site/src/app/o/[slug]/teams/[teamId]/PublicTeamRegistrationClient.tsx
    C:/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/TeamRepository.kt
    C:/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt
    C:/Users/samue/StudioProjects/mvp-app/composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/15.json
    C:/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
    C:/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt
    C:/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt

## Interfaces and Dependencies

At the end of this feature, the following interfaces and behaviors exist:

- `Team.requiredTemplateIds?: string[]` in the shared TypeScript and Kotlin contracts.
- `TeamRegistrations` rows that can represent self or child registrants and track consent status without renaming `userId`.
- Team join request and payment-intent payloads that can carry linked-child and consent-aware registration metadata.
- Team-scoped signed-document persistence, lookup, and file access in the same document subsystem that previously only handled event signatures.
- Team details and public registration UIs that reuse the existing payment modal and signing concepts rather than introducing a second payment or e-sign path.
- Mobile repository and UI paths that distinguish `STARTED` versus `ACTIVE` team registrations and only treat the latter as completed joins.

Revision note: updated this ExecPlan after implementation to record the completed `mvp-site` and `mvp-app` work, the reduced-memory Gradle invocation needed on Windows, the generated Room schema version `15`, and the targeted verification commands that passed.
