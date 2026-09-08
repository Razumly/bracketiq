# Unify web checkout and filter child entry choices

This plan follows `PLANS.md`. Keep the progress and outcome current.

## Purpose / Big Picture

An authenticated Account opens Register from an Event and completes entry selection, requirements, and explicit review within a consistent checkout. Web uses a two-column layout with an Event summary. Mobile retains its shared checkout shell. Individual signup offers eligible linked children. Team signup offers Teams and the current user as a free agent.

## Context Boundary

Use the root and application AGENTS files, ADR 0013, ADR 0014, and the registration terms in CONTEXT.md. Web sources start at `apps/site/src/app/discover/components/EventDetailSheet.tsx` and its `eventDetail` registration panels, dialogs, and hooks. Mobile sources start at `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationActionHandler.kt`, lifecycle loading, checkout dialogs, and focused tests. Inspect exact family and registration contracts for eligibility and registrant identity. Expand to billing only when the existing child continuation requires it. Preserve unrelated working tree changes.

## Progress

- [x] (2026-09-07) Confirm individual-only child registration with the user and inspect current flows.
- [x] (2026-09-07) Record the accepted checkout decision in ADR 0014.
- [x] (2026-09-07) Implement web checkout presentation, entry choices, Team editing, and review.
- [x] (2026-09-07) Filter mobile child selection by Event and division age rules.
- [x] (2026-09-07) Send child division and answers to the existing site endpoint. Add the existing paid-child checkout target to the mobile serializer and repository.
- [x] (2026-09-07) Finish the production build and final regression checks. All 59 site tests pass. Changed-file lint has no errors. Android tests, lint, APK build, and mobile-to-site integration pass.
- [x] (2026-09-07) Verify the rendered checkout on desktop web, narrow web, and the Android emulator. Verify both saved child registrations in the isolated database.

## Surprises & Discoveries

Web currently offers a child free-agent path for Team Events. Mobile limits child entry to individual Events, but loads all active children without age filtering. Web returns early after Event age checks and can omit a division age check. Mobile already has questions, guardian signing, and final review continuations.

Mobile's child request omitted the selected division and question answers. Its child flow also sent paid registrations to the free endpoint, which returns HTTP 402. The site already supports paid child checkout. Manual child payments and child payment plans are explicitly unsupported by the site; keep the same explicit limit on mobile.

Visual fixtures must use the canonical division ID format produced by the Event editor. An initial arbitrary fixture ID was interpreted as a legacy token by the existing mobile mapper. The fixture now uses `<event-id>__division__c_skill_open_age_u12`. The real API test also checks the fetched division ID and child eligibility. Visual fixtures use a separate host so the guardian sees participant controls.

## Decision Log

On 2026-09-07, the user confirmed that child registration applies only to individual signup Events. Preserve this boundary in both entry interfaces. Reuse the existing server commands and checkout continuations. Do not introduce duplicate Account forms. Use the existing family cache as the mobile source of child profiles.

## Plan of Work

Record ADR 0014 and cross-reference it from ADR 0013. Add a shared web checkout layout around the existing registration steps. Keep Team and child identity visible. Require final review for the existing adult registration paths. Preserve cancellation and error handling. Filter mobile children using the current site's age semantics, and recheck the selected child before continuing. Add tests for boundary ages, invalid birthdates, Team Events, selection, and confirmation.

## Concrete Steps

Run site commands from `apps/site`: focused Jest suites, `npx tsc --noEmit`, and `npm run lint:changed`. Run mobile commands from `apps/mobile` with JDK 17: `./gradlew.bat :composeApp:testDebugUnitTest :composeApp:lintDebug :composeApp:assembleDebug --no-daemon --max-workers=1 --console=plain`. Use focused tests first. Inspect existing runtime state before requesting any exact start or restart required for visual verification.

## Validation and Acceptance

Opening Register must show checkout without saving a registration. Team identity must include a readable name and logo. Team creation and roster edits return to checkout. Individual signup offers a child only when a linked child is eligible. An unknown birthdate is not eligible. Event and division age rules must both pass. Team signup must not offer child registration. Requirements preserve the selected registrant. Final confirmation invokes the existing save once. Errors remain visible and cancellation does not submit.

## Idempotence and Recovery

Reuse saved Team drafts and request idempotency. No destructive migration is planned. Keep this work separate from existing untracked evidence and preserve the user's CONTEXT.md edits. Runtime start, restart, and installation require the explicit operations described in AGENTS.md.

## Interfaces and Dependencies

Use Mantine and existing Team image components on web. Use Compose and current family profile data on mobile. The existing child endpoint accepts optional `divisionId` and `answers` with `questionId` and `answer` entries. Mobile now sends these fields. The existing billing purchase-intent endpoint accepts optional `eventRegistration` with `registrantId`, `registrantType: CHILD`, and `parentId`. Mobile now sends that target while `user.id` remains the payer. No server request field becomes required. No response or Room schema changes. The current site parsers remain compatible with earlier mobile clients.

## Artifacts and Notes

Test logs use `.scratch/web-child-checkout-*`. Browser scripts and screenshots use the Windows temporary directory. The checkout decision and reference links are in ADR 0014.

Rendered evidence: `C:/Users/samue/AppData/Local/Temp/web-child-checkout-team-entry.png`, `web-child-checkout-team-edit.png`, `web-child-checkout-desktop-review.png`, `web-child-checkout-narrow-review.png`, and `web-child-checkout-mobile-review.png` in the same directory. Browser checks used Playwright with headless Edge. No Browser skill was available. The browser checks observed no uncaught page errors. The checkout screens rendered without a framework error overlay.

## Outcomes & Retrospective

The first six focused web suites passed all 29 tests. Four checkout regression suites then passed all 30 tests. These checks cover the new entry action, explicit review, payment continuations, cancellation, and free-agent payment exclusion. The site type check passed after two missing Event fields were added to the test fixture. Changed-file lint now passes with six advisory JSX complexity warnings. Existing errors in changed files required smaller payment, eligibility, and test setup functions. All 26 focused tests pass after that refactor.

The Android tests, lint, and APK build pass. The real mobile-to-site child test passes without skips. It verifies the saved child identity, guardian, division, status, and question answers. All 46 registration coordinator tests pass, including answer reset when the registrant changes. The six review coordinator tests, four age tests, and request-format test also pass.

The user approved starting or restarting the local site server on port 3153 and starting the emulator with the updated app. The database migration retry confirms that all 234 migrations are applied. The updated APK is installed. The old test Account could not log out because its push token was missing. Its local app data was reset for the new fixture Account. A cold startup timed out, then the retry reached login. Browser login also succeeds. The first production build exceeded a 3 GB worker heap during type checking. The 6 GB retry passed compilation, type checking, and all 128 static pages. Port 3153 now serves that production build. The build-specific TypeScript include paths were removed from the working tree.

The browser and emulator each completed a free child registration. Each flow kept Avery Rivera as the registrant through questions and review. The database contained no mobile registration before confirmation. Browser request tracking also confirmed no child save before review and exactly one save after confirmation. Both final database checks verified one ACTIVE child registration, the guardian ID, canonical division ID, and the answer `Family car`. The browser review rendered at 1280 and 390 pixels. Team checkout displayed the Cascade Team card. Team edit opened, canceled, and saved through HTTP 200 without leaving checkout.

The final combined site run passed 59 tests in 10 suites. A focused start-time test also passed after keeping the clock check outside memoized age data. Final changed-file lint passed with six advisory JSX complexity warnings. The real mobile-to-site test passed again with the canonical division fixture and fetched eligibility check. No live charge or external signing-provider session was exercised in this run. The emulator used an Event with no outstanding signing requirements. Existing signing continuations remain in place; the child name is now shown in their prompts.

Plan created on 2026-09-07 for the user's approved checkout and child selection changes.

Plan completed on 2026-09-07. Validation found and resolved fixture, nullable-type, and changed-file lint errors. The accepted child boundary remains individual signup only.
