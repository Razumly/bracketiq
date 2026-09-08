# Issue 123 closeout verification

Date: 2026-09-05.

Issue 123 remains open. The current source does not meet all acceptance criteria.

## Local schedule rebase — 2026-09-06

The user requested the latest working version of the local issue-42 scheduling branch. The Events and Scheduling task confirmed `c431195d1` as its tested implementation checkpoint. Its HEAD `6cfca22b8` adds only the local main lint-policy merge. Its uncommitted issue-49 work is not required for schedule dialogs and remains in the source worktree.

The UI branch now has HEAD `0a3d8ecef` and includes `6cfca22b8`. The rebase preserves the Facilities alert with owned controls. The restored Discover tests retain next-occurrence sorting coverage. The newer shared HTTP-contract and Room standards remain intact. All 92 previously untracked files matched the recovery snapshot after restoration. The UI working changes remain uncommitted.

Recovery references are `codex/issue-123-before-schedule-rebase-20260906`, `codex/issue-123-wip-recovery-20260906`, and `codex/issue-123-reconciled-recovery-20260906`. No source worktree, application runtime, database, or remote branch was changed. The changed-file lint check passed with zero errors and eight existing warnings. Post-rebase TypeScript and focused tests are pending. The first focused run passed the public-rental selection and resource-calendar grid suites before cancellation. The machine had 253 MB free physical memory. Only this task's identified Jest process was cancelled to reduce memory pressure; TypeScript remained active. Do not treat this partial test run as an integration pass.

## Calendar interaction correction — 2026-09-06

The user reported that edge resizing showed a floating card and that release could open the slot dialog. Two new regression tests failed before the fix. The resize test found no change to the card width. The move test found an unwanted selection callback after release.

The grid now renders the temporary resize range in place. Only move gestures show a floating card. Range callbacks run on release. Cancellation restores the original range. A ref suppresses the release click before nested card handlers run. Pointer capture is released by its owner. Staff activation capture is disabled in edit mode so it cannot intercept the grid's release handler. Normal card and keyboard activation remain available.

All 30 focused grid and panel tests pass. They include start-edge preview, cancellation, move release, resize release, and staff-card activation. TypeScript and the whitespace check pass. Changed-file lint reports zero errors and eight existing warnings. This source change is not in the running production build. A production rebuild, restart, and Codex browser verification remain pending. No database, HTTP contract, or server process changed in this source correction. The other issue-wide findings below remain open.

## Audit scope

This audit covers the Organization operations from issue 123. It includes their shared controls and the shared Discover event filters. It excludes the Organization claim wizard and unrelated backend work.

The review base is `1e1cb02b716ea74389170af29543b76d2ea0e902`. The reviewed branch is `workstream/site-ui-operations` at `4c9de6191`. The review includes current tracked edits and untracked issue files. Earlier test and browser results do not validate all current changes.

The user approved a local production rebuild and start or restart for this audit. The user then approved creation and seeding of the isolated issue-123 database, a worktree connection update, and a preview restart. The user also requested test data from another database. No production deployment or provider transaction is authorized.

## Behavior checks

The first final run used 70 test files. It passed 68 suites and failed two suites. It passed 458 tests and failed three tests.

- Three tests in `OrganizationFinancePanel.test.tsx` exceeded the existing 20-second time limit. They cover failed line-item save retry, line-item creation, and retained account mappings. A separate rerun passed all 26 Finance tests with the same time limit and no source changes.
- `fieldCalendarHydration.test.ts` could not run. Its Node environment reaches the existing `PointerEventMock extends MouseEvent` setup error before a test starts. This audit did not change that test or the shared setup.
- The passing suites cover Facilities editing, resource movement and resize, save failure, state retention, event filtering, tab-local loading, Public Page, Reviews, Staff, Customers, Store, Refunds, Discounts, and shared dialogs and controls.

The machine had about 550 MB of free physical memory during part of the combined build and test run. Treat resource pressure as a possible cause of timeouts, not proof that they are harmless.

The machine-readable result is `apps/site/node_modules/.cache/issue-123-final-behavior-results.json`. The log is `apps/site/node_modules/.cache/issue-123-final-behavior-tests.log`.

The isolated rerun passed 34 tests in three suites. It included Finance, Create Team, and the team-logo workflow. Across both runs, 469 distinct tests passed in 71 suites. The separate Node-environment hydration suite remains unable to start. The isolated result is `apps/site/node_modules/.cache/issue-123-final-isolated-results.json`.

## Build and browser checks

The first build stopped because Prisma did not load `DATABASE_URL` from `.env.local`. A process-only build placeholder resolved that prerequisite. A later attempt stopped because the sandbox blocked Google Fonts. The network-enabled retry compiled the production code successfully. Its type-check worker then ran for an extended period under memory pressure. The audit cancelled only that build and its verified workers. The isolated tests then passed. A new production build ran alone with a process-only 6 GB JavaScript heap limit. It passed: compilation took 112 seconds, TypeScript took 6.1 minutes, and all 127 static pages were generated. `git diff --check` passed. The build did not change tracked generated Prisma files, `tsconfig.json`, or `next-env.d.ts`.

The approved local server started at `http://127.0.0.1:3000` and reported production mode. The Organization route returned HTTP 200, but the Codex browser then displayed `Something went wrong`. Retry reproduced the error. The server log reported Prisma `P1003`: the configured `mvp` database does not exist on the local server at port 5433. This proves why HTTP status alone is not a sufficient page smoke check.

A read-only query of `pg_database` returned only `postgres`, `bracketiq_e2e_150_codex`, and `bracketiq_e2e_151_codex`. The explicit database error and catalog result make code bisection unnecessary for this failure. The user approved the repair. The audit created `bracketiq_e2e_123_c2a7`, applied all 209 worktree migrations, and confirmed that migration status was current before seeding. The preview does not run against another issue's database.

The source import used a repeatable-read, read-only transaction on `bracketiq_e2e_151_codex`. It copied 13 events, 16 canonical teams, 18 additional test accounts and profiles, 16 team staff assignments, and two team registrations. It copied only columns supported by this worktree. It did not copy the source migration history, provider credentials, invitation deliveries, or background jobs. The source database was not changed. The target retained the base host login and `org_1` fixtures. Copied events and teams were assigned to that organization. Their target-only names and dates were adjusted for preview use. One copied team is archived; 15 teams appear in the active Teams view.

Additional local fixtures include one facility, three resources, rental slots, three event templates, two products, three reviews, and three staff records. The preview reuses image files already present in this worktree's uploads folder. The source database contains no file records. No live database or live image service was accessed. The helper is in `apps/site/node_modules/.cache/issue-123-populate.cjs`. It is an ignored, local test-data tool, not application source.

Only the database name in this worktree's `.env.local` connection changed. Credentials and provider settings stayed unchanged. The production preview restarted with `node server.mjs --port 3000`. It reported production mode. Its verified listener is process 11956 on `127.0.0.1:3000`. A fresh Codex browser tab loaded the organization. The seeded host login succeeded. The original missing-database error did not recur.

Current-build browser evidence now covers populated Events, Teams, and Facilities routes. Search narrowed the event cards to `Weekend Skills Clinic` while the header and controls remained visible. The Teams page displayed copied names and logos. Facilities displayed three resource rows, horizontal dates and time labels, and colored layer filters. Its populated schedule confirmed the existing overlapping-entry finding. A 375-pixel viewport showed the mobile Organization header and section control without document-level horizontal overflow. These checks do not constitute a complete visual or behavior pass.

Some later browser click and keyboard actions did not change the selected tab or clear the search. The result repeated after a reload and a viewport reset. Direct route navigation still worked. No new application exception appeared in the browser log. A request to show the preview in Codex returned `queued`. Treat this as an unresolved interaction-check result, not a confirmed application cause. Repeat the checks in the visible preview before deciding whether a source fix is needed. The browser also recorded a failed rental read with `Unauthorized` during the signed-out visit. This supports the existing silent-rental-failure finding.

Use the Codex in-app browser only. Do not use Chrome. Use generated images in `docs/images/site-ui` for comparison. Apply these later user instructions when an image differs:

- Keep the Organization header white. Do not restore the banner.
- Do not add eyebrow text.
- Keep controls visible during data loading.
- Keep calendar dates and time horizontal. Keep resources vertical.
- Keep a readable minimum time scale and bounded zoom.
- Size calendar height from the resource rows.
- Keep one Facility details action and a clear Back to schedule action.
- Use the colored filters as the legend. Keep creation cards to the right in edit mode.

Generated desktop references were inspected for Overview, Events, Teams, Customers, Reviews, Staff, Event Templates, Document Templates, Facilities, Finance, Refunds, and Public Page. Mobile references were inspected for Events, Customer detail, Facilities, and the section drawer. Reference inspection alone is not a visual pass for the running application.

## Standards

1. **S1 — Required rental data can fail silently.** `organizationEventSource.ts` logs rejected field reads and continues. If all reads fail, the cache receives a successful empty rental list. The failure standard requires an explicit error when required data cannot load. This behavior was retained from the base, but it remains in the migrated Events path.
2. **S2 — The shared search rule is duplicated.** The cached event filter searches the event address and organizer name. The rental refresh predicate does not. A visible rental can disappear after refresh for the same query. This is a Duplicated Code judgment call with a concrete behavior risk. Share the search predicate.

Standards total: two findings. The main Standards risk is a failed rental request that looks like an empty result.

## Spec

1. **P1 — Calendar entries can cover one another.** Resource entries use the same vertical position and height. Overlapping bookings and staff shifts can hide cards and their edit or resize targets. The issue requires preserved behavior and permissions.
2. **P2 — A dismissed Select can display an unsaved value.** The Select keeps typed search text after outside-click or Escape dismissal. The stored value changes only after an option is selected. Billing Address can display Nevada while the selected value remains California. The issue requires preserved validation and persistence behavior.
3. **P3 — Calendar creation requires pointer dragging.** The creation cards have pointer handlers but no keyboard activation. Manager slot selection returns without creating a draft. The issue requires WCAG 2.2 AA accessibility.
4. **P4 — Nested Mantine imports remain.** Facilities renders `CreateRentalSlotModal` and `FieldCalendarFilter`. Customer detail renders `TeamCard`. These files still import Mantine. The issue requires removal from every completed Organization operation surface. The separate claim wizard is not part of this finding.
5. **P5 — Today bypasses the minimum date.** The date picker disables calendar days before `minDate`, but its Today button does not use that restriction. An end-date control can accept Today after a future start date. The issue requires preserved validation and working filters.
6. **P6 — Reference exception approved.** No dedicated Store or Discounts image is present in the reference set. On 2026-09-05, the user explicitly approved the shared-pattern exception for these two tabs. Review their current layouts against the approved shared design patterns. This resolves the dedicated-image requirement only. It does not waive their behavior, accessibility, or visual checks.

Spec total: five open behavior or migration findings. The reference gap is resolved by the user's explicit exception. The main Spec risk is a calendar entry that cannot be reached because another entry covers it. The review found no separate unrequested scope change.

## Closure requirements

Confirm and resolve the named findings in issue-123-owned files. Rerun the affected behavior tests. Complete the production build. Run desktop and narrow-width checks in the Codex browser. Use the approved shared-pattern exception for Store and Discounts. Keep provider checks separate from provider-independent unit tests. Do not claim a provider sandbox pass without running that check. This audit found no configured Stripe keys, BoldSign API key, or QuickBooks client ID in the production preview environment. Do not copy credentials or change environment files without a separate request.

Do not close issue 123 based only on a passing complexity check or the existing surface checklist.
