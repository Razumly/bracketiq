# Complete guardian invitations and age-based authority

This living plan follows root `PLANS.md`.

## Purpose / Big Picture

A guardian can review a named child and accept a Team Invitation in one guided journey on site and mobile. Existing guardian authority skips repeated setup. Each child keeps a separate profile. Family authority ends at the child's eighteenth birthday without deleting history.

## Context Boundary

Use Issue 148 and its comments, root and application AGENTS.md, ADR-0013 and ADR-0012, and the relevant roster/guardian entries in CONTEXT.md. The initial code set is `apps/site/src/server/managedPlayers.ts`, `teams/teamGuardianInvites.ts`, `userPrivacy.ts`, family and profile-claim API routes, invite creation routes, email templates, the site claim page and roster modal, and mobile claim, family repository, model, Room, and navigation code. Expand to authentication or document callers only when they also grant guardian authority or reuse child identities. Use existing API integration harnesses to prove client compatibility. Do not change unrelated user documents.

## Progress

- [x] Read Issue 148 and inspect existing guardian, claim, family, and invite code.
- [x] Claim Issue 148 on the current isolated branch.
- [x] Implement and test shared age-based family authority.
- [x] Implement atomic guardian declaration and invitation acceptance, contact corrections, and sibling-safe identity.
- [x] Add site and mobile guided flows, iOS claim-link parsing, and Room family state. Final validation remains open.
- [x] Run focused checks, client-to-site integration, and the full site and Android unit suites. Resolve test failures with focused reruns.
- [x] Run the live browser guardian journey at desktop and phone widths. Inspect both screenshots.
- [x] Review both standards and spec. Address transactional permission checks, login continuation, and the unknown-birthdate transition.
- [x] Commit the implementation and verification fixes on the current branch.
- [ ] Run native iOS validation on macOS before the final close review.

## Context and Orientation

`apps/site` owns HTTP and Prisma. A User Profile is `UserData`; an Account is `AuthUser`. `ParentChildLinks` records a guardian relationship. A pending link has no authority. `Invites` stores delivery email, personal player email, and guardian email separately. `teamGuardianInvites.ts` applies team acceptance. The existing minor profile claim activates a link separately from acceptance and must be replaced by one transaction. Mobile uses shared Compose code and Room for fetched state.

## Plan of Work

First add a shared guardian authority module. It must require an ACTIVE relationship and a known birthdate under 18 for family access and mutations. Preserve historical links. Apply the same check inside invitation transactions. Test family HTTP routes before and after the birthday and for pending links.

Next add a versioned Guardian Declaration to the relationship. Extend the existing profile claim request with optional guardian declaration/acceptance fields. Adult request fields remain compatible. A minor request must explicitly accept the named child's invitation. Reuse an existing active relationship. Activate a new relationship and accept membership in the same transaction. Reject missing proof or declaration without changing authority. Separate guardian delivery from personal email during adult transition and contact correction. Never use a shared guardian email to identify siblings.

Then update claim previews with authenticated guardian setup state and current age. Site and mobile show the child, declaration when required, and explicit Team acceptance. They retain the signed invitation through authentication and verification. Render managed status independently from invitation status. Persist refreshed family state in Room before screens observe it.

## Concrete Steps

Run site commands in `apps/site`: focused `npm test -- --runInBand --runTestsByPath <test>` commands, `npx tsc --noEmit --pretty false`, `npx prisma validate`, and `npm test -- --runInBand` once at the final gate. Set `NODE_OPTIONS=--max-old-space-size=8192` for the site type check on this host. Run Gradle from `apps/mobile` with the Windows SDK at `C:/Users/samue/AppData/Local/Android/Sdk`. Run `.\gradlew.bat testDebugUnitTest --max-workers=1` with a 2 GB Gradle heap. Run `:composeApp:lintDebug` separately. Use the existing client-to-site integration harness with an approved dedicated issue database. Do not run concurrent Jest or Gradle commands in this checkout. Keep the large site and mobile checks sequential. Capture environment failures without claiming success.

## Validation and Acceptance

At the shared HTTP boundary prove new and returning guardian acceptance, siblings with one contact, unrelated and pending guardians denied, minor self-acceptance denied, missing DOB retained without acceptance, birthday cutoff, safe contact correction, failed related writes rolled back, and retry without duplicate declarations or membership. Prove that client-produced requests reach site handlers and responses decode on mobile. Check site and mobile labels and continuation after login. Full iOS execution requires macOS.

## Interfaces and Dependencies

Keep the existing profile claim route and adult request parser compatible. Add optional `guardianDeclaration` and `acceptTeamInvitation` booleans for the new minor flow. Add preview fields for guardian setup and DOB. Return a distinct guardian acceptance outcome. Guardian declaration fields on ParentChildLinks are nullable for historical relationships. Reuse Prisma transactions and roster locks; do not introduce a provider or claim that email verification proves guardianship.

Changed HTTP fields:

- `POST /api/user-profiles/[id]/claim` accepts optional `guardianDeclaration` and `acceptTeamInvitation` booleans. A minor cannot activate authority without explicit acceptance. A new guardian must also declare authority. Adult request fields keep their existing shape.
- The claim response adds status `GUARDIAN_ACCEPTED`. It replaces the incomplete `GUARDIAN_LINKED` outcome. Profile IDs still identify the child. No child-to-guardian merge occurs.
- `GET /api/public/profile-claims/[id]` adds `invite.guardianSetupRequired`, `invite.guardianContactRequired`, `invite.guardianDeclaration`, `invite.birthdateRequired`, and `profile.dateOfBirth`. The birthdate is a nullable date-only string. Only authenticated signed-link viewers receive it. `invite.isMinor` uses the current birthdate. `profile.isManaged` uses the stored profile state. `guardianContactRequired` is optional for compatible clients. It directs a minor without an active guardian relationship or guardian email to request a corrected invitation. Never use the child's personal email as guardian proof.
- Family response shapes do not change. Family reads and edits require current under-18 authority. Room schema 108 stores the family response by parent Account. The observer checks the age boundary again at UTC midnight.
- `POST /api/auth/login`, `POST /api/auth/register`, and `POST /api/auth/verify/resend` accept optional `returnTo`. Only local Player claim paths enter the signed verification token. The verification redirect retains that path in `next`. Login and profile completion retain the signed invitation query. Mobile login and register DTOs preserve the optional contract.

## Idempotence and Recovery

Keep the current branch and user-owned changes. Use additive migrations. Never start or change production runtimes. Use existing authorized test storage and a dedicated logical issue database. Identical accepted requests must reuse relationship and invitation results. Failed saves must preserve the roster and leave no newly active relationship.

## Surprises & Discoveries

Family reads include all links and family edits accept PENDING links. Generic invitation matching can reuse a sibling's profile by guardian email. Adult claim currently reads guardian delivery email after age 18. These are confirmed gaps in existing code.

## Decision Log

The user selected Issue 148 and the implement skill, which requires commits on the current branch. Continue on `codex/issue-146` from `d816db58b`. The shared HTTP seam and required integration tests are already specified in Issue 148 and repository rules. Use them for behavior tests.

## Outcomes & Retrospective

Implementation and Windows test execution are complete. Native iOS validation requires macOS. Keep Issue 148 open for the final close review. Do not deploy this intermediate roster slice.

Focused HTTP checks passed for first and returning guardians, failed acceptance and retry, unrelated Accounts, minor self-acceptance, family-read filtering, and family-edit age checks. The initial site type check and Prisma validation passed. The user paused checks, then requested completion. The earlier schedule, admin, and field-picker failures passed on a focused rerun. Document access fixtures now contain the birthdate needed by the new authority check.

The user approved local test runtimes. A separate PostgreSQL container, `bracketiq-issue148-test-db`, serves database `bracketiq_issue148_test` on loopback port 5548. All 227 migrations applied, migration status is current, and development fixtures are seeded. The local site runs on port 3048 with outbound providers disabled. No production runtime changed. The final site type check, browser check, full suites, and mobile-to-site check remain in progress.

The site type check passed with `NODE_OPTIONS=--max-old-space-size=8192`. The live browser check passed at 1280 px and 390 px. It exercised login, the signed verification redirect, optional MFA skip, declaration, and Team Invitation acceptance. Database assertions proved ACTIVE guardian authority and ACCEPTED invitation status for a separate child profile. Provider email delivery was disabled; the email-boundary Jest test proves signed-token continuation separately. Both success screenshots were inspected. Mobile verification remains open.

The full site run completed in 2406 seconds: 802 suites passed, 5 failed, and 8 were skipped. It ran 5909 tests and skipped 72. Four failed suites had incomplete guardian fixtures. The fifth had a 20-second UI timeout under memory pressure. All five suites passed on the focused rerun without increasing the timeout. A new UI regression first failed because the adult form remained after `GUARDIAN_REQUIRED`. Both clients now refresh the signed preview and clear confirmation. The site regression and guardian HTTP checks then passed: 18 tests. Final mobile and type checks remain open.

The mobile network suite passed 105 tests. Five repository parity checks differed only in `contractVersion`: the golden fixtures used 3 while both baseline clients already use 4. Update the four stale fixture values to 4. Do not change the current HTTP contract. Rerun the repository and Compose suites sequentially after site testing. Windows Android tools are available. Use one Gradle worker and a 2 GB heap because the host has 16 GB RAM. The user approved stopping the local site server and isolated database after testing. Keep the database container and data.

A final API regression reproduced a legacy invitation authority error. An unknown birthdate with `isMinor=true` could reuse `playerEmail` after DOB collection. The fix always returns `GUARDIAN_REQUIRED` after collecting an under-18 birthdate. The next request must load current guardian contact and relationship data again. The regression now keeps the invitation pending and grants no guardian authority. All 19 focused claim tests pass. The browser check passed again at both widths after the final fix. The browser script first requests the preview API to compile the local development route before the browser's shorter request timeout.

The first full Android run finished in 10 minutes 50 seconds. It passed the model (44), network (105), repository API (6), repository implementation (141), UI (14), and Wear OS (30) tests. The main app ran 1622 tests: 1609 passed, 12 skipped, and one failed. Its family test had no loaded Account or family cache fixture. Update that test to load the Account, save the family response, and assert the cache observer result. The main app rerun and Android lint remain open. The standards review also required checkbox role and checked-state semantics for the mobile consent rows. The rows now use `toggleable` with `Role.Checkbox`.

The second full Android run passed all available unit suites: 1950 tests passed and 12 backend-gated tests were skipped. The main app result was 1622 tests, zero failures, and 12 skipped. Both review axes have no remaining findings. Android lint ran and found 12 existing `UnrememberedMutableState` errors and 83 warnings. The errors are in unchanged `EventMap.android.kt`, `SearchBoxUiTest.kt`, `SearchPlayerDialogUiTest.kt`, and `TeamDetailsDialogUiTest.kt`. A diff against the issue baseline confirmed that none of those four files changed. Keep this separate from Issue 148.

The real mobile-to-site check passed all three `TeamRegistrationMobileApiIntegrationTest` tests with zero failures, errors, or skipped tests. It used `MVP_TEST_BACKEND_URL=http://localhost:3048` and the isolated Issue 148 database. It proved separate siblings with one guardian email, first and repeat guardian acceptance, Room family state, and an unknown birthdate transition that cannot bypass missing guardian contact. The existing paid-registration error check also passed. Automatic seeding and outbound providers were disabled. Other backend-gated tests were not enabled for this focused run.

The final site type check passed. The local site server stopped after verification. The isolated database container stopped and remains available with its data. No production runtime changed. The parity fixture correction is commit `27c52ddab`. The Issue 148 implementation commit contains this final verification record. Native iOS execution and the unrelated Android lint errors remain outside the completed Windows test results.

## Artifacts and Notes

Baseline user-owned changes: CONTEXT.md, .scratch/, docs/adr/0013-separate-user-profiles-rosters-and-invitations.md, and docs/event-signup-team-roster-spec.md. Preserve them and exclude them from commits.

Revision: Resume verification after the user pause. Record runtime approval, migration evidence, and review fixes. The local browser script is `apps/site/scripts/check-guardian-claim.mjs`. It requires local test URLs and disabled outbound providers. It checks desktop and phone widths without sending provider email.

Final revision: Record the full suite results, focused reruns, real mobile-to-site checks, browser checks, review fixes, and authorized runtime shutdown. Preserve the separate iOS and existing lint limits. Keep all baseline user documents outside the commits.
