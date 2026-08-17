# Show useful division ranges and organization divisions

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current during implementation.

## Purpose / Big Picture

Event cards currently list the first division names and hide the total when an event has many divisions. After this change, a card with more than two divisions will show the gender, age, and skill span plus the total. A typical label will be `Men/Women · U6–U18 · Recreational–Premier · 40 divisions`. Cards with one or two divisions will keep their current explicit labels.

Organization detail views will show two active divisions above reviews. A More control will reveal the remaining divisions. A division with a registration URL will open that affiliate sign-up page when selected. This behavior must work on the mvp-site web surfaces and on the shared mobile organization detail screen used by Android and iOS.

The work will also stop organization detail from showing a rental-availability error for private affiliate organizations. The screen must not call the public rental-availability route when the organization is private and the viewer does not have organization management access.

## Progress

- [x] (2026-08-04) Traced the mobile rental error from the Discover organization card to `OrganizationDetailComponent.refreshOrganization` and the rental-availability API.
- [x] (2026-08-04) Confirmed that the live organization list includes private affiliate-rental organizations and that their anonymous rental-availability requests return 404.
- [x] (2026-08-04) Located the shared mobile event-card metadata and the web event-card division formatter.
- [x] (2026-08-04) Located the existing web organization division panel and the shared mobile organization overview.
- [x] (2026-08-04) Added tested event division range formatters in both repositories.
- [x] (2026-08-04) Used the shared range output on web, Android, and iOS event cards.
- [x] (2026-08-04) Added expandable organization division previews above reviews on web and mobile.
- [x] (2026-08-04) Added valid affiliate registration URL actions to each supported organization detail view.
- [x] (2026-08-04) Prevented the eager private rental-availability request and added regression tests.
- [x] (2026-08-04) Passed focused web and Kotlin tests, the Android debug build, and the iOS simulator Kotlin compilation.

## Surprises & Discoveries

- Observation: `OrganizationDetailComponent.refreshOrganization` calls `refreshCurrentRentalWeek` for every organization before the viewer opens the Rentals tab.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt` calls the rental refresh after the organization, events, teams, products, and reviews load.

- Observation: The rental-availability route hides private organizations from anonymous viewers with a 404 response.
  Evidence: `mvp-site/src/app/api/organizations/[id]/rental-availability/route.ts` checks `publicPageEnabled` and organization management access before it reads rental inventory.

- Observation: The live Discover organization response includes private organizations that have active affiliate rental facilities.
  Evidence: Live requests on 2026-08-04 returned private organizations such as AFC Fitness and APTC at Queens College. Their rental-availability requests returned 404, while public organizations returned 200.

- Observation: Android and iOS event cards already consume `buildNativeEventCardMetadata` from shared Kotlin.
  Evidence: Android uses `ComposeEventCard`, and `iosApp/iosApp/Discover/DiscoverCards.swift` calls the shared Kotlin metadata function.

- Observation: The main web organization overview already places `OrganizationDivisionsPanel` above `OrganizationReviewsPanel`, but its summary shows four rows and sends More to a separate tab. The public organization page does not show organization divisions.

- Observation: Some affiliate division identifiers contain an age in a compact token, such as `c_u16`, while older normalized fields can make that age look like a skill value.
  Evidence: Formatter regression tests now require the compact identifier to produce `Coed · U9–U16 · 3 divisions` without a false skill range.

## Decision Log

- Decision: Keep explicit division names when an event has one or two divisions. Use an axis range only when the event has more than two canonical divisions.
  Rationale: The explicit names are clearer for small lists. The range and total solve the density problem for large lists.
  Date: 2026-08-04

- Decision: Build the summary from canonical regular division identifiers and details. Do not use display-name matching to determine membership or count.
  Rationale: The repository rules require canonical division identifiers. The display formatter can infer missing axis labels only after it has selected the canonical divisions.
  Date: 2026-08-04

- Decision: Show two organization divisions before the More control.
  Rationale: The user asked to see a couple of divisions before expanding the section.
  Date: 2026-08-04

- Decision: Open only valid HTTP or HTTPS registration URLs. Leave divisions without a URL non-interactive.
  Rationale: This makes the affiliate action explicit and prevents invalid schemes from opening.
  Date: 2026-08-04

- Decision: Skip the initial rental-availability request only when the organization is private, the initial tab is not Rentals, and the viewer lacks `organization.manage`.
  Rationale: This matches the API access rule while preserving private organization management and direct Rentals-tab access.
  Date: 2026-08-04

## Outcomes & Retrospective

The app no longer requests rental availability while it opens a private affiliate organization overview. Public organizations, managers, and direct Rentals-tab navigation keep the existing availability request.

Event cards now keep one or two explicit division names. Cards with more divisions show the available gender, age, and skill ranges plus the canonical count. Android and iOS use the same shared Kotlin result. The web card uses an equivalent pure TypeScript formatter.

Organization overview pages now place divisions above reviews. They show two divisions before an in-place More control. Divisions with valid HTTP or HTTPS registration URLs open the affiliate sign-up page. The managed web page, public branded web page, Android view, and iOS view all have this behavior.

Validation passed with 31 focused web tests, 11 focused Compose tests, the network DTO regression test, TypeScript compilation, the Android debug assembly, and the iOS simulator Kotlin compilation. Both working trees passed `git diff --check`. Existing build warnings were outside this change.

## Context and Orientation

The mobile event card lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/EventCard.kt`. Its platform-neutral text comes from `EventCardMetadata.kt`. The native iOS Discover event card reads the same metadata in `iosApp/iosApp/Discover/DiscoverCards.swift`, so a shared metadata change applies to Android and iOS.

The web Discover event card lives in `mvp-site/src/components/ui/EventCard.tsx`. It gets division labels from `mvp-site/src/lib/eventDivisionDisplay.ts`.

The mobile organization overview lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt`. The loaded `Organization` already contains active organization divisions from the batch organization API. `DivisionDetail` needs to retain the optional `registrationUrl` field from that response.

The managed web organization detail page uses `mvp-site/src/app/organizations/[id]/OrganizationDivisionsPanel.tsx` above its review summary. The public branded organization page is `mvp-site/src/app/o/[slug]/page.tsx`. Its data comes from `mvp-site/src/server/publicOrganizationCatalog.ts`.

The rental error starts in `DefaultOrganizationDetailComponent.refreshOrganization`. It eagerly calls `/api/organizations/{id}/rental-availability`. The server returns 404 for a private organization unless the viewer can manage that organization. The component currently treats that expected response as a user-visible availability failure.

## Plan of Work

First, add pure division summary functions to the existing web and mobile division display seams. Resolve regular divisions by canonical identifier. Infer missing gender, age, and skill labels from the canonical identifier. Sort numeric ages before formatting the minimum and maximum. Format genders in the fixed order Men, Women, Coed. Format multiple skill values as a range. Add the canonical division count at the end. Keep the current output for one or two divisions.

Second, use the new summary in the web `EventCard` and shared `buildNativeEventCardMetadata`. The shared mobile change must set one combined division line for large events so the card does not repeat a separate skill label.

Third, add `registrationUrl` to the shared `DivisionDetail` model. Add an expandable mobile division section immediately before the reviews preview. Show two rows at first. Add a More and Show less control. Route valid registration URLs through the existing platform URL handler so Android uses a browser custom tab and iOS uses its web presentation.

Fourth, change the web organization division summary to show two rows and expand in place. Make rows with a valid registration URL accessible as links. Add the same two-row division section above reviews on the public organization page. Extend the public organization catalog with active organization divisions.

Fifth, add a pure rental-load policy function. Use it during organization loading. Mark rentals as resolved without a request when the policy denies the eager request. Keep direct Rentals-tab loading and manager access unchanged.

Finally, run focused unit tests. Then compile the touched Android and iOS surfaces. Run the web type check and focused Jest suites. Review both repository diffs and confirm that unrelated dirty work remains unchanged.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-app` unless a command states otherwise.

1. Update `EventCardMetadata.kt` and `EventCardMetadataTest.kt` with the range formatter and cases for gender, age, skill, count, and the one-or-two division rule.
2. Update the shared division model and the mobile organization detail component and screen. Add focused tests for the rental-load policy and division preview rules.
3. In `/Users/elesesy/StudioProjects/mvp-site`, update `src/lib/eventDivisionDisplay.ts`, `src/components/ui/EventCard.tsx`, and the formatter tests.
4. Update `OrganizationDivisionsPanel.tsx`, `publicOrganizationCatalog.ts`, and the public organization page. Add or update focused tests.
5. Run Kotlin common tests for event-card metadata and organization detail logic.
6. Run the Android compile task with JDK 17.
7. Run the focused web Jest tests and the TypeScript check.
8. Run the iOS compile or Xcode build with JDK 17 for Gradle-backed steps.
9. Inspect `git diff --check` and repository status in both repositories.

## Validation and Acceptance

The work is complete when all of these statements are true:

- An event with one or two divisions still shows explicit division names.
- An event with more than two divisions shows available gender, age, and skill spans plus the canonical division count.
- The same event summary appears on the mvp-site card, the Android card, and the iOS card.
- An organization overview shows two active divisions above reviews.
- More reveals the remaining divisions. Show less restores the two-row preview.
- Selecting a division with a valid registration URL opens that URL. A division without a URL is not presented as a link.
- A private organization opened from Discover does not show a rental-availability error during overview loading.
- A public organization and a direct Rentals-tab request still load rental availability.
- Focused tests pass in both repositories. Android and iOS touched surfaces compile.

## Idempotence and Recovery

All source edits are additive or narrow replacements. The test and build commands are safe to repeat. Do not reset either dirty working tree. If a test fails because of unrelated existing work, record the exact failure and run the narrowest command that proves the touched surface. If a generated build artifact changes, remove only that generated artifact when it is clearly created by this work.

## Artifacts and Notes

Live API evidence from 2026-08-04:

- `affiliate_org_afc_fitness_bala_cynwyd` has `publicPageEnabled: false`. Its anonymous rental-availability request returned 404.
- `affiliate_org_aptcnyc_queens_college` has `publicPageEnabled: false`. Its anonymous rental-availability request returned 404.
- Public comparison organizations returned 200 with an empty rental inventory.

The direct live database audit could not run because the current machine could not reach the DigitalOcean database. This does not block the confirmed 404 cause.

## Interfaces and Dependencies

The shared Kotlin event-card formatter will continue to expose:

    fun buildNativeEventCardMetadata(event: Event): NativeEventCardMetadata

The web formatter will add one card-oriented function next to the existing label function:

    export const buildEventDivisionCardLabel = (event: Event): string

The mobile organization detail component will add an action that accepts a canonical `DivisionDetail` and opens its `registrationUrl` when present.

The public organization catalog will add a serializable division card type and a `divisions` list to `PublicOrganizationCatalog`.
