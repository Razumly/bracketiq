# Implement the commerce and booking surfaces

This ExecPlan is a living document. It follows `PLANS.md`. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current at every stopping point.

## Purpose / Big Picture

After this work, a BracketIQ user can move through the commerce surfaces with one consistent interface. The user can choose an event registration, select or create a team, add players, manage invitations, review the registration, and continue to Stripe without entering card details in BracketIQ. The user can select a product, inspect product details, complete a Stripe-backed checkout, reserve a rental slot, and recover from loading, validation, permission, disabled, error, and interrupted-progress states.

The change is a visual and interaction migration. It must not change prices, fee calculations, registration rules, permissions, HTTP paths, request fields, response fields, or Stripe ownership of payment details. A reviewer can see the result by opening each affected site surface in a browser and by exercising the focused Jest flows listed in `Validation and Acceptance`.

## Progress

- [x] (2026-09-15) Generated and visually reviewed the approved 1536x1024 desktop references for registration, teams, products, checkout, rentals, loading, validation, disabled, permission, error, and recovery.
- [x] (2026-09-15) Added the approved desktop reference paths to issue #126 and recorded approval.
- [x] (2026-09-15) Set issue #126 Project Status to `Todo`, Workstream to `Site UI`, and label to `ready-for-agent`.
- [x] (2026-09-15) Created the clean implementation branch `workstream/site-ui-commerce-126` without importing unrelated dirty-worktree changes.
- [x] (2026-09-15) Copied the approved desktop PNG references into this branch.
- [x] (2026-09-15) Created this execution plan.
- [x] (2026-09-15) Created and pushed draft PR #160. The PR body closes issue #126.
- [x] (2026-09-15) Migrated event registration and team commerce surfaces.
- [x] (2026-09-15) Migrated product catalog and product detail surfaces.
- [x] (2026-09-15) Migrated checkout, billing, payment, and confirmation surfaces.
- [x] (2026-09-15) Migrated rental selection and reservation checkout surfaces.
- [x] (2026-09-15) Migrated loading, validation, disabled, permission, error, and recovery states.
- [x] (2026-09-15) Ran focused behavior checks. The final run passed 18 suites and 159 tests. Changed-file lint passed with 0 errors and 19 warnings.
- [x] (2026-09-15) Attempted the site build and browser smoke review. The build is blocked by missing `DATABASE_URL`. Browser evidence is limited to public discovery because no seeded public organization exists for the approved commerce slug.
- [x] (2026-09-15) Ran standards and specification review. Fixed the one standards finding by migrating the obsolete event-registration test helper. The specification review found no issue.
- [x] (2026-09-15) Marked PR #160 ready for review. GitHub reports `OPEN`, `isDraft: false`, and `MERGEABLE`.

## Surprises & Discoveries

- Observation: Issue #126 had no GitHub sub-issues, so it has no separate ticket frontier.
  Evidence: `gh api repos/Razumly/bracketiq/issues/126/sub_issues` returned an empty list. This plan treats #126 as the single implementation ticket and uses the surface slices below as the internal task graph.

- Observation: The event registration state machine and team invitation behavior already exist in site code.
  Evidence: `useEventSignupJourney`, `EventCheckoutLayout`, `TeamBuilderModal`, `InvitePlayersModal`, `TeamDetailModal`, and `TeamInvitationManager` are present. The migration should deepen and compose these modules instead of creating a second team system.

- Observation: The approved references require explicit Stripe ownership.
  Evidence: Payment references show billing fields and Stripe readiness or handoff copy, but no card number, expiry, or CVC fields. The site must keep payment entry inside Stripe-controlled UI.

- Observation: The coordinator worktree contains unrelated uncommitted changes.
  Evidence: `site-ui-operations-next` reports 80 tracked changes and 35 untracked paths. The implementation branch was created in a separate clean worktree from commit `4eacd13e`.
- Observation: The final focused run passes 18 suites and 159 tests after migrating the old registration helper and waiting for the finance settings control to become enabled.
  Evidence: Jest reports `18 passed`, `159 passed`.

- Observation: The complete site suite still reports unrelated failures.
  Evidence: `npm run test:ci` reports 34 failed suites, 146 failed tests, 863 passed tests, and 14 skipped suites. Failures are in scheduler, affiliate-import, event-editor, discover, Prisma-generated, calendar, and customer-bill areas outside the issue #126 commerce diff.

- Observation: Shared icon projections are current.
  Evidence: `npm run icons:check` reports 27 current icons.

- Observation: The TypeScript check is blocked by existing diagnostics outside the issue #126 commerce files.
  Evidence: `npx tsc --noEmit` reports 81 diagnostics in 27 files. A search of the output found no issue #126 commerce file.

- Observation: The production build stops before Next.js compilation because the local environment has no `DATABASE_URL`.
  Evidence: `npm run build` passes the icon check, then `prisma validate` reports `Cannot resolve environment variable: DATABASE_URL`.

- Observation: Browser smoke reached public discovery but not a seeded commerce organization.
  Evidence: `/find-clubs` loaded. `/o/summit` returned the Next.js 404 page. The existing operations runtime was not restarted or reconfigured.

- Observation: Changed-file lint has warnings but no errors.
  Evidence: `npm run lint:changed -- --base 4eacd13e0` reports 0 errors and 19 complexity or hook-dependency warnings.

## Decision Log

- Decision: Keep the existing HTTP and financial contracts unchanged.
  Rationale: Issue #126 explicitly requires visual migration without contract changes. Existing site services and route schemas are the source of truth.
  Date/Author: 2026-09-15 / implementation coordinator

- Decision: Reuse `TeamBuilderModal`, `InvitePlayersModal`, `TeamDetailModal`, and `TeamInvitationManager` for registration and team management.
  Rationale: These modules already represent creation, roster invites, editing, management, and delivery recovery. A second parallel implementation would drift from mobile behavior and invite rules.
  Date/Author: 2026-09-15 / implementation coordinator

- Decision: Treat an event-created team as a saved registration draft before optional player invites.
  Rationale: This matches the mobile flow and the current `eventRegistrationDraft` and `/api/teams` registration-draft contract. It preserves the selected team when a user skips or recovers from invites.
  Date/Author: 2026-09-15 / implementation coordinator

- Decision: Use BracketIQ-owned primitives for completed commerce surfaces and remove direct Mantine imports from each completed surface.
  Rationale: Issue #126 requires Mantine removal per completed surface while the rest of the site remains incrementally migratable.
  Date/Author: 2026-09-15 / implementation coordinator

- Decision: Do not add application-owned card inputs or simulated provider tests.
  Rationale: Stripe controls payment details. The repository rules prohibit simulating provider integrations and require manual or sandbox checks for provider behavior.
  Date/Author: 2026-09-15 / implementation coordinator

## Outcomes & Retrospective

The migration now covers event team selection and creation, optional player invitations, shared team management, invitation recovery, product selection and detail, checkout billing and Stripe handoff, finance categories and journal preview, refund review and recovery, rental availability, and reservation checkout. Completed surfaces use BracketIQ-owned primitives and keep loading, validation, disabled, permission, error, and recovery states visible.

The HTTP paths, request fields, response fields, registration rules, prices, fee calculations, permissions, and Stripe payment-detail ownership stayed unchanged. BracketIQ does not collect card number, expiry, or CVC fields. No provider simulation was added.

Focused behavior checks pass. Standards review found one stale registration-test helper and no other actionable standards issue. Specification review found no issue. The PR is ready for review.

The complete suite, TypeScript check, production build, provider sandbox, and seeded commerce browser flow remain environment or baseline limits. The exact failures and missing prerequisites are recorded above and in the PR.

## Context and Orientation

The site is a Next.js application in `apps/site`. App Router pages render public event, organization, product, and rental surfaces. Client components call service modules in `apps/site/src/lib`; route handlers under `apps/site/src/app/api` own the HTTP contracts. The existing event registration flow is composed in `apps/site/src/app/discover/components/EventDetailSheet.tsx` and its `eventDetail` children and hooks. Team creation and management are shared components under `apps/site/src/components/ui` and `apps/site/src/app/teams/components`.

The event registration seam is already split into a draft state and checkout controllers. `useEventRegistrationProgress` reads and saves `apps/site/src/lib/contracts/eventRegistrationDraft.ts` states. `useEventSignupJourney` loads eligible teams, starts registration-scoped team creation, opens optional player invites, and resumes preparation. `TeamBuilderModal` accepts a `registrationDraft` context and creates a team through `teamService`. `InvitePlayersModal` accepts an `eventRegistration` scope and sends player or staff invitations. `TeamDetailModal` and `TeamInvitationManager` provide canonical team management and invite recovery.

The product surfaces are `apps/site/src/app/o/[slug]/PublicProductGrid.tsx` and `apps/site/src/app/o/[slug]/products/[productId]/PublicProductCheckoutClient.tsx`. They use `BillingAddressModal`, `PaymentModal`, and product services. The rental surfaces are `apps/site/src/app/o/[slug]/rentals/PublicRentalSelectionClient.tsx` and related public rental pages. The checkout primitives include `apps/site/src/components/ui/PaymentModal.tsx`, `PaymentForm.tsx`, `StripePaymentCheckout.tsx`, `PaymentResultView.tsx`, `BillingAddressModal.tsx`, and the event-specific checkout components.

The approved reference images are under `docs/images/site-ui/commerce-flow` and `docs/images/site-ui/discovery-list`. The desktop registration images cover team selection, team setup, player invites, team management, and invitation history. The remaining desktop images cover product selection/detail, Stripe payment and confirmation, rental reservation checkout, and the required state families. The mobile references remain the approved set from #137.

## Context Boundary

Use these sources first:

- Issue #126 body and all comments. It defines the surface checklist, constraints, reference paths, and acceptance criteria.
- `AGENTS.md`, `apps/site/AGENTS.md`, and `PLANS.md`. They define repository, site, contract, process, and plan rules.
- `apps/site/src/app/discover/components/EventDetailSheet.tsx`, `eventDetail/EventDetailRegistrationPanels.tsx`, `eventDetail/EventTeamRegistrationPanel.tsx`, `eventDetail/EventCheckoutLayout.tsx`, `eventDetail/hooks/useEventSignupJourney.tsx`, and their focused tests. Expand to a named child only when a changed prop, state transition, or rendered path requires it.
- `apps/site/src/components/ui/TeamBuilderModal.tsx`, `TeamDetailModal.tsx`, `TeamInvitationManager.tsx`, and `apps/site/src/app/teams/components/InvitePlayersModal.tsx`, plus focused tests. Expand to services only when an invite, team update, or registration-draft contract changes.
- `apps/site/src/app/o/[slug]/PublicProductGrid.tsx`, `apps/site/src/app/o/[slug]/products/[productId]/PublicProductCheckoutClient.tsx`, `apps/site/src/app/o/[slug]/rentals/PublicRentalSelectionClient.tsx`, and their tests. Expand to public route handlers only when the rendered request or response contract changes.
- `apps/site/src/components/ui/PaymentModal.tsx`, `PaymentForm.tsx`, `StripePaymentCheckout.tsx`, `PaymentResultView.tsx`, and `BillingAddressModal.tsx`, plus focused tests. Expand to Stripe server routes only if a current behavior cannot be preserved through the existing seam.
- Approved reference images listed in issue #126. Use them for visual structure and state wording, not as proof of runtime behavior.

Expand the boundary only when one of these triggers fires: a TypeScript error names an unlisted caller; a changed exported symbol has an unlisted reference; a route or service contract must change; a focused test exposes a state transition outside the named module; or a browser smoke reveals a surface not covered by the issue checklist.

## Plan of Work

First create the draft pull request from `workstream/site-ui-commerce-126` with `Closes #126` in the body. Keep the initial commit limited to the approved reference PNGs and this plan. Do not import the coordinator worktree's unrelated changes.

Next migrate event registration. Align the entry panel with the approved team-selection reference. The user must see eligible team cards, the selected team, a clear create-team path, and the event context. Keep team creation in registration mode limited to the team-details step. On save, persist the registration draft and move to the optional player step. Use `InvitePlayersModal` for account and person invites. Preserve pending, saved, delivery-failed, link-ready, remind, cancel, and reinvite states. Replace the small event-only editor with the shared team management edit path when that fit remains accessible and preserves the event draft selection. Keep the selected team through skipped or failed invites.

Then migrate product and checkout surfaces. Replace direct Mantine composition with the repository's BracketIQ-owned primitives and styles on each completed surface. Keep product selection, product detail, billing address, discounts, fee previews, and totals consistent with current service calls. Keep the Stripe handoff explicit and remove any application-owned card field. Render success and error states with the same order or registration context and with a recovery action that does not imply payment success.

Then migrate rental selection and reservation checkout. Preserve venue, date, slot, duration, availability, price, reservation lock, billing, and Stripe handoff behavior. Keep the selected slot and total visible through errors and retries. Do not create a second reservation or payment path.

Then apply the shared state family. Each affected surface must have explicit loading, validation, disabled, permission, error, and recovery states where the current behavior supports them. State text must sit beside the affected control. Disabled actions must explain the missing prerequisite. Permission states must not expose private billing or payment controls. Recovery states must preserve saved progress and clearly distinguish unpaid progress from completed payment.

For each slice, migrate every caller of changed exported symbols. Use `lsp` references before changing an exported prop or component type when a language server is available. Add or update focused behavior tests only when they defend state transitions, validation, permission decisions, recovery, or a complete user-visible flow. Do not add screenshot or CSS assertions. Do not modify mobile code unless a site HTTP contract changes; the current task preserves contracts.

## Concrete Steps

Run commands from the stated directory.

1. From the repository root, confirm the clean implementation worktree and branch:

    `git status --short --branch`

    Expected: branch `workstream/site-ui-commerce-126`; only the planned reference and plan files are uncommitted before the initial commit.

2. From the implementation worktree root, commit the approved references and plan, push the branch, and create a draft pull request:

    `git add docs/images/site-ui/commerce-flow plans/issue-126-commerce-ui-execplan.md`

    `git commit -m "chore(site): add approved commerce references"`

    `git push -u origin workstream/site-ui-commerce-126`

    `gh pr create --repo Razumly/bracketiq --base main --head workstream/site-ui-commerce-126 --draft --title "Site UI: migrate commerce registration payments refunds and rentals" --body "Closes #126\n\nImplements the approved commerce and booking surface migration. Preserves existing financial, registration, permission, Stripe, and HTTP contracts."

3. During implementation, run focused site checks from `apps/site` after each independently mergeable slice:

    `npx jest --runInBand <focused-test-files>`

    `npx tsc --noEmit`

    Do not run focused Jest suites concurrently in the same checkout.

4. At the verification milestone, from `apps/site`, run the affected complete checks:

    `npm run test:ci`

    `npx tsc --noEmit`

    `npm run build`

    Use the repository's existing environment. Do not start, stop, or restart a runtime without current explicit authorization.

5. Perform the browser smoke on the actual affected site surface. Check event registration, team creation, optional invites, team management, product selection/detail, Stripe handoff, confirmation, rental selection/checkout, and each applicable state. Record the URL, viewport, visible result, and any environment limitation in the pull request and this plan. Do not add screenshot tests.

## Validation and Acceptance

A reviewer can select a team from the event flow, create a team with the event sport locked, save the team, add or skip players, and reach review without losing the selected team. Existing team management can edit the same team and show roster and invitation history. A saved invitation remains visible when delivery fails and offers the correct recovery action without creating a duplicate.

A reviewer can select a product, open product details without entering checkout prematurely, see the correct price and fee labels, and continue to checkout. Checkout retains billing values, shows the exact total, identifies Stripe as the payment-detail owner, and contains no BracketIQ card-number, expiry, or CVC input. Confirmation shows completed registration or payment only after the existing success path says it is complete. A reviewer can choose an available rental slot and continue through the same billing and Stripe handoff without losing the slot or creating a duplicate reservation.

A reviewer can observe explicit loading text, field-level validation, readable disabled prerequisites, permission-safe actions, recoverable errors, and restored saved progress. No state presents an unpaid registration as paid. Prices and totals match the existing services and route responses.

Focused Jest checks pass: 18 suites and 159 tests. Changed-file lint reports 0 errors and 19 warnings. The complete site suite reports 34 failed suites, 146 failed tests, 863 passed tests, and 14 skipped suites in unrelated baseline areas. TypeScript reports 81 diagnostics in 27 unrelated files, with no issue #126 commerce file in the diagnostic output. The build passes the icon check but stops at Prisma validation because `DATABASE_URL` is unavailable. Browser smoke loaded `/find-clubs`; `/o/summit` returned 404 because no seeded public organization was available. A provider sandbox check was not run because no authorized provider test environment was available, and no provider simulation was added.

## Idempotence and Recovery

The branch and pull request creation steps are one-time operations. If a push or pull-request command fails, retry the failed command after checking the branch and remote state. Do not force-push or rewrite unrelated history.

Each UI slice must preserve the existing service call and route contract. If a visual edit breaks a focused test, fix the implementation or the test's obsolete wording only when the test does not defend observable behavior. If a provider sandbox is unavailable, record the exact limitation and use the existing provider seam; do not simulate a provider response.

Keep the coordinator worktree untouched. If the implementation worktree becomes dirty with unrelated files, stop and restore only changes introduced by the implementation branch. Never reset or clean the coordinator worktree.

## Artifacts and Notes

Approved desktop reference groups:

    Registration/team: `commerce-registration--team-selection--desktop-1536x1024.png`, `commerce-registration--team-creation--desktop-1536x1024.png`, `commerce-registration--team-invites--desktop-1536x1024.png`, `commerce-registration--team-management--desktop-1536x1024.png`, `commerce-registration--invitation-history--desktop-1536x1024.png`.

    Product/checkout/rental: `commerce-product--selection--desktop-1536x1024.png`, `commerce-product--detail--desktop-1536x1024.png`, `commerce-checkout--payment--desktop-1536x1024.png`, `commerce-checkout--confirmation--desktop-1536x1024.png`, `commerce-rental--reservation-checkout--desktop-1536x1024.png`.

    State/recovery: `commerce-flow--loading--desktop-1536x1024.png`, `commerce-checkout--validation-error--desktop-1536x1024.png`, `commerce-flow--disabled--desktop-1536x1024.png`, `commerce-flow--permission--desktop-1536x1024.png`, `commerce-flow--error--desktop-1536x1024.png`, `commerce-flow--recovery--desktop-1536x1024.png`.

The issue body contains the full approved desktop and mobile reference list. Current evidence: focused Jest 18/18 suites and 159/159 tests pass; changed-file lint has 0 errors; icon projections pass for 27 icons; TypeScript, build, full-suite, provider-sandbox, and seeded-commerce-browser limitations are recorded in `Surprises & Discoveries` and `Validation and Acceptance`. Code review reports one fixed standards finding and no specification findings.

## Interfaces and Dependencies

Keep these current interfaces unless evidence requires a contract change:

- `useEventSignupJourney` owns event team preparation state and exposes team loading, creation, player-invite, edit, resume, and dialog composition to `EventDetailSheet`.
- `TeamBuilderModal` accepts `registrationDraft` with event id, team id, revision, slot id, and occurrence date. In registration mode it creates only the event team details and returns the saved `Team`.
- `InvitePlayersModal` accepts an `eventRegistration` scope and sends player or staff invitations through `teamService.createTeamMemberInvite`.
- `TeamDetailModal` is the shared team management surface. Its `variant` controls modal, page, and edit presentation. `TeamInvitationManager` owns invitation attempts, delivery status, remind, cancel, and reinvite actions.
- `teamService` remains the client seam for team create, update, roster, and invitation operations. `eventRegistrationDraft` remains the draft state contract.
- `PaymentModal`, `PaymentForm`, and `StripePaymentCheckout` remain the payment seam. BracketIQ owns billing address fields where the current contract requires them. Stripe owns payment details.
- Product and rental services remain the source of current product, availability, reservation, pricing, and payment behavior. Do not introduce direct server imports into client components.

If a route or service interface must change, stop the visual slice, document every request and response field in this plan, update every site and mobile caller together, and add the required client-to-site integration check before proceeding.
