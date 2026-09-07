# Unify mobile Event checkout

This plan follows `PLANS.md`. Keep the progress, discoveries, decisions, and outcome current.

## Purpose / Big Picture

An authenticated user opens Register from an Event. Checkout presents registration choices, Team cards and Team editing, applicable questions and signing, then a final review and payment. The user does not enter Account contact details again. Creating a Team must not register it. Signing must retain the existing signer authority rules.

## Context Boundary

Read root and mobile AGENTS.md, this plan, and `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/`. Start with EventDetailScreen, EventSignupDialogs, EventDetailOverlayHost, EventRegistrationActionHandler, EventRegistrationFlowCoordinator, and their focused tests. Read shared payment and document composables only when their checkout presentation changes. Read exact site routes only if HTTP fields or behavior must change. No HTTP or Room schema change is planned.

## Progress

- [x] (2026-09-07) Inspect existing registration and payment continuations.
- [x] (2026-09-07) Add a shared full-screen checkout layout and connect registration choices and Team editing.
- [x] (2026-09-07) Integrate requirements and explicit final review into existing execution paths.
- [x] (2026-09-07) Compile the final source and run unit tests. The suite has 1,629 passed tests, 16 skipped tests, and no failures. Updated four old immediate-submit or label expectations to prove the confirmation boundary.
- [x] (2026-09-07) Finish Android lint and APK packaging. The combined Gradle run passed in 10 minutes 5 seconds. Lint reports no errors and 83 warnings. No warning names the new checkout files.
- [ ] Finish emulator checks. The user approved the emulator and local server. Installation, sign-in, saved Team checkout, Team editor save, roster cancel, and final review passed. Final Team confirmation returns HTTP 500. The backend reports concurrent nested transactions while it copies Player registrations. Questions, signing, payment, and successful completion remain unverified in this checkout build.
- [x] (2026-09-07) Prepare the implementation commit with test results and the open verification limit. Standards and Spec reviews passed after corrections.
- [x] (2026-09-07) Fix the backend transaction overlap and resolve the 13 complexity lint failures. Preserve roster behavior through named helpers. Pass changed-file lint, type checking, focused regression tests, and the real database rollback check.

## Surprises & Discoveries

Registration already has independent continuations for questions, signing, payment plans, discounts, and billing. Free registration can complete immediately after signing. The new final review must stop that continuation until the user confirms. Provider payment screens must remain provider-controlled.

Review found that a price alone does not identify the submission action. Managers, minors, manual payments, installment plans, and child registration use different execution paths. Review now uses the execution decision. The final label states whether confirmation submits registration or proceeds to payment. Server signing refreshes provide document completion evidence for the current registrant.

## Decision Log

Use the Airbnb service reservation reference for clear sections and the Viator reference for visible progress. Use Register for the entry action. Use the existing TeamCard for identity. Keep Account authentication outside checkout. Reuse existing server behavior and Room observations.

The Team editor changes name and roster capacity through the existing repository. The component owns its draft and save operation. Closing roster setup restores Team review. Billing and discount forms use a shared presentation interface so other callers retain their normal dialogs. No HTTP fields or Room schema changed.

On 2026-09-07, the user requested the lint cleanup needed for the transaction fix. Extract named steps for metadata, fallback reads, roster validation, placeholder selection, snapshot writes, and stale roster removal. Keep the helpers private to their operation. Preserve existing inputs, outputs, write order, and transaction ownership. Keep Player registration writes sequential. Do not change invitation acceptance, document readiness, or registration status rules in this refactor.

## Context and Orientation

EventDetailScreen owns local Team creation and review visibility. EventDetailOverlayHost renders the other dialogs. EventRegistrationActionHandler sequences operations. EventRegistrationFlowCoordinator stores transient prompts and continuations. The backend validates requests. Team creation and roster edits use existing persistent signup drafts.

## Plan of Work

First add a shared checkout surface with a header, progress labels, scrollable content, and bottom actions. Apply it to registration-specific dialogs only. Then add a final review continuation after questions and signing for Team, self, and child paths. Preserve payment and guardian result handling. Show confirmed results only from successful registration callbacks. Keep edits connected to the saved draft.

## Concrete Steps

Run commands in `apps/mobile` with JDK 17. Run `./gradlew.bat :composeApp:testDebugUnitTest :composeApp:lintDebug :composeApp:assembleDebug --no-daemon --max-workers=1 --console=plain`. Use focused test filters during implementation. Inspect the Android UI through adb after installation. Do not run concurrent Gradle builds.

## Validation and Acceptance

Prove that choosing a Team and completing questions or signing does not submit registration before final confirmation. Prove that cancel and repeated confirmation cannot replay a continuation. In the emulator, open Register, select a Team card, edit or create a Team, return to checkout, complete requirements, and reach review. Check free-agent selection. Check a free registration result. Inspect paid checkout through the existing supported test environment without a real charge. Verify that Account information is not requested again. Capture screenshots and record actual limits.

## Idempotence and Recovery

Use existing request idempotency and saved drafts. Preserve unrelated changes in CONTEXT.md and untracked documents. Retry builds without deleting user data. Runtime operations require the specific approval in AGENTS.md.

## Artifacts and Notes

Store temporary logs and screenshots under `.scratch/mobile-checkout-*`. Reference source flows: https://mobbin.com/flows/8cbcaf23-5bb1-4f0c-8efa-05806e484b0d and https://mobbin.com/flows/61f6fd86-acdc-4fec-ae44-7e649633afa0.

## Interfaces and Dependencies

Use Compose Material 3, current Event and TeamWithPlayers models, and existing payment and signature interfaces. The new review state is transient UI state. Consume its continuation once. Do not import site types or add a required HTTP field.

## Outcomes & Retrospective

Implementation, both source reviews, compilation, unit tests, Android lint, and APK packaging are complete. The unit suite has 1,629 passed tests, 16 skipped tests, and no failures. Lint has no errors and 83 warnings. The debug APK is at `apps/mobile/composeApp/build/outputs/apk/debug/composeApp-debug.apk`. Logs are in `.scratch/mobile-checkout-final-validation.log`.

The user approved the Android emulator and local site server on port 3153. Both runtimes are running. The new APK installed and opened. The existing test account signed in. Cedar Cup resumed the Cascade Team draft. Team identity is readable in the Team card. The Team editor saved and returned to checkout. Canceling roster setup returned to the selected Team. Final review appeared before submission.

Final confirmation returned HTTP 500 from `/api/events/issue151-final-native-labels/participants`. The server reports `Concurrent nested transactions are not supported`. The compiled stack points to the parallel Player registration writes in `claimOrCreateEventTeamSnapshot`, which call `upsertEventRegistration` on the same transaction. No successful registration result was shown. This backend failure blocks completion of the Team walkthrough. Questions, signing, payment, and successful completion still need checks in this build. No production deployment or push was performed.

Screenshots are in `.scratch/mobile-checkout-team.png` and `.scratch/mobile-checkout-review.png`. UI dumps use the same prefix. The server error is in `.scratch/mobile-checkout-site-error.log`.

## Team transaction fix follow-up

On 2026-09-07, the user requested the backend fix. A new ordering regression test reproduced the nested transaction failure. A direct call to the real snapshot function against the existing issue #153 database reproduced the same error. The database has no pending migrations.

Player registration writes now run sequentially on the caller's transaction. The roster fields and HTTP contract are unchanged. The real database check copied four Player registrations. An intentional failure after those writes rolled back the complete save. The two focused suites passed all 73 tests. Type checking passed.

The required changed-file lint check failed with 13 complexity errors. Checking the original Team membership source at HEAD independently reproduced its 12 errors. The remaining error is in an existing test callback. The fix remains uncommitted because site coding standards require these errors to be resolved before commit. The running local server still uses the previous compiled build. A new build and an approved server restart are needed before repeating final confirmation in the emulator.

Evidence: `.scratch/checkout-transaction-red.log`, `.scratch/checkout-transaction-green.log`, `.scratch/checkout-transaction-live.ts`, `.scratch/checkout-transaction-types.log`, `.scratch/checkout-transaction-lint.log`, and `.scratch/checkout-transaction-baseline-lint.log`.

The user then requested the lint fixes. All 13 failures are resolved without suppressions or rule changes. The changed-file lint command passes. Type checking passes. The broader Team and participant route suite has 127 passed tests and 14 skipped tests. The real database check again copied four Player entries and verified complete rollback. The fix and refactor are ready for a local commit. The running server still needs a rebuilt artifact and an approved restart before an emulator recheck.

Final lint-refactor evidence: `.scratch/team-refactor-lint-final.log`, `.scratch/team-refactor-types-final.log`, and `.scratch/team-refactor-regression.log`. Updated on 2026-09-07 to record the requested behavior-preserving refactor and its verification.

Plan created on 2026-09-07 to record the approved mobile checkout design and its execution boundary.

Plan updated on 2026-09-07 after the first validation and review pass. It records the resolved action-label, return-navigation, document-status, and state-ownership findings.
