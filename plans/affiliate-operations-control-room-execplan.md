# Build the read-only affiliate operations control room

This ExecPlan is a living document. Keep the `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections current during the work.

Maintain this document in accordance with `PLANS.md` at the repository root. Run site commands from `apps/site`.

## Purpose / Big Picture

After this change, a Razumly administrator can inspect affiliate supply from one read-only control room. The screen shows current Supply Target deficits, lifecycle counts, work-in-progress pressure, exceptions, jobs, source evidence, review cases, Supply Sources, and candidates. Each view has a stable URL. Browser navigation preserves the selected view, filters, page, and detail selection.

The browser reads one server-side projection. It does not join raw Prisma records. The projection includes `schemaVersion`, `asOf`, and `stale`. Detail records include lineage, evidence, operational history, and explicit `Not recorded` values for missing links. The browser never sends an affiliate mutation request.

The visible proof is a real browser walkthrough at `/admin?tab=affiliateOperations&view=overview`, followed by the six other view URLs, pagination, keyboard selection, a detail deep link, hidden-tab polling, and a failed-refresh stale state.

## Progress

- [x] (2026-08-24) Read issue #69, parent issue #66, completed prerequisite issues #67 and #68, repository rules, the product context, current Admin shell, affiliate models, and current affiliate admin routes.
- [x] (2026-08-24) Record the server projection contract and URL state contract.
- [x] (2026-08-24) Implement the bounded transactional server projection and read-only route.
- [x] (2026-08-24) Replace the mounted affiliate mutation panel with the control room.
- [x] (2026-08-24) Add seven views, bounded lists, charts with table alternatives, detail surfaces, polling, and stale behavior.
- [x] (2026-08-24) Add focused route and browser-component regression tests.
- [x] (2026-08-24) Run focused route, control-room, operational-alert, and source-discovery tests, TypeScript, and the full site Jest suite. The final full suite passed with 865 suites, 5,249 tests passed, and 28 tests skipped.
- [x] (2026-08-24) Resolve review repairs for bounded history truncation, polling overlap, projection cache size, invalid contract data, review execution history, and legacy Admin API compatibility. The control-room test passed with 14 tests.
- [ ] (2026-08-24) Complete the real-browser walkthrough. The available local runtime redirects to login, and no test administrator credentials are authorized for this session.
- [x] (2026-08-24) Complete the final two-axis review and commit the final changes. Standards review and Spec review returned no remaining findings. Commit `0519a4264` contains the implementation.

## Surprises & Discoveries

- Observation: The current Admin shell mounts `AdminAffiliateImportsPanel` under the `affiliateImports` tab. That panel mounts intake, discovery, review, source, candidate, scrape, publish, and delete controls.
  Evidence: `apps/site/src/app/admin/AdminDashboardClient.tsx` and `apps/site/src/app/admin/AdminAffiliateImportsPanel.tsx`.

- Observation: Issue #68 already stores Supply Source projections, Supply Targets, Replenishment Demands, Replenishment Waves, lifecycle transitions, gateway jobs, gateway claims, operation receipts, gateway events, coverage cells, and worker health.
  Evidence: `apps/site/prisma/schema.prisma` models `AffiliateSupplySources`, `AffiliateSupplyTargets`, `AffiliateReplenishmentDemands`, `AffiliateReplenishmentWaves`, `AffiliateSupplyLifecycleTransitions`, `AffiliateAgentGatewayJobs`, `AffiliateAgentGatewayClaims`, `AffiliateAgentGatewayOperationReceipts`, `AffiliateAgentGatewayEvents`, `AffiliateCoverageCells`, and `AffiliateAgentWorkerHealth`.

- Observation: The exception rail combines persisted operational alerts with derived invariant, gateway, worker, refresh, receipt, and event failures.
  Evidence: `buildExceptions` in `apps/site/src/server/affiliateImports/affiliateOperationsProjection.ts` and the operational alert models in `apps/site/prisma/schema.prisma`.
- Observation: Immediate operational alerts now persist immutable alert records and immutable per-channel delivery attempts. Webhook and configured email channels are supported. Delivery failure emits a second critical alert without a daily digest.
  Evidence: `apps/site/src/server/affiliateImports/affiliateOperationalAlerts.ts`, `AffiliateOperationalAlerts`, and `AffiliateOperationalAlertDeliveries` in `apps/site/prisma/schema.prisma`.

## Decision Log

- Decision: Replace the mounted affiliate imports tab with a new `affiliateOperations` tab, while leaving the old panel files unmounted.
  Rationale: The existing files are covered by focused tests and may be used as historical implementation references. Unmounting them removes mutation controls from the Admin surface without deleting user-owned code.
  Date/Author: 2026-08-24 / Codex.

- Decision: Use one GET route, `/api/admin/affiliate-operations`, for all seven views and detail data.
  Rationale: The issue requires one server-side projection and no browser-side joins. A single route gives one authorization boundary and one response snapshot. The `view`, filter, page, and selected-record query parameters choose the bounded part of the projection.
  Date/Author: 2026-08-24 / Codex.
- Decision: Keep the alert event and each delivery attempt as separate immutable records.
  Rationale: Operators need the original alert and the delivery result in the same projection without mutating alert history.
  Date/Author: 2026-08-24 / Codex.

- Decision: Build the projection inside a Prisma `RepeatableRead` transaction and issue batch reads for each record family.
  Rationale: `asOf` must describe one coherent read snapshot. Batch reads avoid one request per row and keep lineage assembly on the server.
  Date/Author: 2026-08-24 / Codex.

- Decision: Render charts as static, labeled bars or lines with a visible sortable table alternative.
  Rationale: The issue forbids decorative animation and color-only encoding. Native HTML tables provide the keyboard and screen-reader fallback without adding a chart dependency.
  Date/Author: 2026-08-24 / Codex.

- Decision: Use URL query state under `/admin` for all seven views and selected records.
  Rationale: The existing Admin shell already uses `tab` query state. Query parameters make deep links independent of the list page and let browser Back/Forward restore the control-room state.
  Date/Author: 2026-08-24 / Codex.

## Outcomes & Retrospective

_To be completed after focused verification, browser walkthrough, final review, and commit._

## Context and Orientation

`apps/site` contains the Next.js App Router application. `apps/site/src/app/admin/page.tsx` authenticates a Razumly administrator and mounts `AdminDashboardClient`. `AdminDashboardClient.tsx` owns the existing Admin shell, top-level tabs, URL `tab` state, and refresh button.

`apps/site/src/server/affiliateImports/affiliateSupplyPersistence.ts` is the persistence authority for issue #68. It derives Supply Source assessments and persists lifecycle projections. The control room must read those projections and related evidence. It must not derive lifecycle state in React and must not use job completion as a business outcome.

`apps/site/prisma/schema.prisma` defines the affiliate records. The projection will read these records in one transaction and map them into UI records. The browser will receive only the mapped projection. Stable IDs remain strings. Missing relationships remain present as `null` or `Not recorded` in the UI.

The seven views are `overview`, `coverage`, `jobs`, `intake`, `review`, `sources`, and `candidates`. Lists use bounded pages. Detail uses `selected` plus `selectedType` query parameters. The selected type covers jobs, intakes, reviews, sources, candidates, coverage cells, demands, waves, campaigns, discovery runs and queries, discovery results, targets, mappings, claims, workers, operations, transitions, alerts, scrape runs, capture runs, pages, artifacts, organizations, packages, events, and other related records.

## Plan of Work

First, define projection types and normalization helpers in `apps/site/src/server/affiliateImports/affiliateOperationsProjection.ts`. The module will accept view, filters, page, page size, selected type, and selected ID. It will load active Supply Contract data, Supply Sources, targets, demands, waves, lifecycle transitions, gateway jobs, claims, receipts, events, coverage cells and assessments, discovery runs and query executions, source intakes and evidence records, Mapping Jobs, approval jobs, scrape runs, candidates, discovery results, campaigns, and worker health in bounded batch queries. It will compute target deficits, lifecycle counts, WIP counts, queue-age bands, failure Pareto rows, marginal-yield rows, demand history, and exception rows on the server. It will attach URL-safe operation links to every row and return one serializable response with `schemaVersion`, `asOf`, `stale: false`, filters, view payloads, and selected detail.

Next, add `apps/site/src/app/api/admin/affiliate-operations/route.ts`. The route will require the existing Razumly admin session, parse only bounded GET query parameters, call the projection service, and return JSON. It will export no POST, PATCH, DELETE, or mutation handler. Add a route test that proves unauthenticated requests fail, valid requests return the snapshot envelope, and a mutation request is not handled by this route.

Then add `apps/site/src/app/admin/AdminAffiliateOperationsControlRoom.tsx`. The client will fetch only the projection route. It will render top-level view links with query state, filters, bounded tables, pagination, keyboard-focusable rows, a capped desktop Drawer, and a full-screen mobile detail surface. It will show direct labels and accessible summaries for every chart and render a sortable table alternative. It will show `Stale` and one `As of` value when a refresh fails while retaining the prior successful response. It will poll Overview and Jobs every 15 seconds, Coverage every 60 seconds, and open Job details every 15 seconds. It will pause polling while `document.hidden` is true and refresh when visibility returns. It will use only GET requests, anchor links, and local sorting or pagination controls.

Update `apps/site/src/app/admin/AdminDashboardClient.tsx` to add the `affiliateOperations` tab, remove the `AdminAffiliateImportsPanel` import and mounted panel, preserve existing non-affiliate Admin tabs, and pass the existing refresh action to the control room. Keep URL query state compatible with existing `tab` links.

Add focused tests under `apps/site/src/app/api/admin/affiliate-operations/__tests__/route.test.ts` and `apps/site/src/app/admin/__tests__/AdminAffiliateOperationsControlRoom.test.tsx`. Tests will exercise the public route and rendered control-room behavior: snapshot envelope, seven view links, read-only request method, stale preservation, hidden-tab polling pause, visible-tab refresh, keyboard row selection, and detail deep-link state. Tests will not mock third-party providers or inspect private helper implementation.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/bracketiq-affiliate-collection/apps/site`.

1. Add the projection module and focused route test. Run `npx jest src/app/api/admin/affiliate-operations/__tests__/route.test.ts --runInBand`.
2. Add the control-room component and focused component test. Run `npx jest src/app/admin/__tests__/AdminAffiliateOperationsControlRoom.test.tsx --runInBand`.
3. Update the Admin shell. Run `npx tsc --noEmit`.
4. Run changed affiliate and Admin tests in one serial command. Run `npx jest src/app/api/admin/affiliate-operations/__tests__/route.test.ts src/app/admin/__tests__/AdminAffiliateOperationsControlRoom.test.tsx --runInBand`.
5. Start the existing site development server only if needed for the browser walkthrough. Starting a server is an explicit verification action, not a production state change. Use the repository's documented `npm run dev:plain` command and stop it after the walkthrough.
6. Walk through `/admin?tab=affiliateOperations&view=overview`, each other view, a source or job detail, Back/Forward state restoration, keyboard focus, desktop/tablet/mobile widths, hidden-tab polling, and a failed-refresh fixture.
7. Run `npx tsc --noEmit`, `npm run prisma:check`, and the focused tests again after review repairs.
8. Run `npm run test:ci` once from `apps/site`.
9. Run the two-axis code review against the branch base and issue #69. Resolve every finding. Commit the final changes on the current branch.

## Validation and Acceptance

The route response has `schemaVersion`, an ISO `asOf`, and `stale: false`. Every view has a bounded list and URL state. The Overview shows Supply Target current, target, and deficit values; WIP counts and limits; lifecycle counts from Supply Sources; worker or admission exceptions; and bounded priority work. Coverage shows Coverage Cells, Supply Targets, marginal yield, search saturation, and demand history. Jobs shows unified queue rows, age bands, failure/rework rows, worker health, and lineage. Source Intake shows intake, page, capture, artifact, policy, and Mapping handoff evidence. Review Queue shows package, activation, regression, exclusion, target-rejection, and Human Review cases. Sources shows canonical identity, predecessor/successor, lifecycle, freshness, exclusion or hold, mapping, Organization, automation, and target lineage. Candidates shows candidate, target, rejection, freshness, source, run, and lifecycle context.

Charts have direct text labels, an accessible summary, and a sortable table alternative. Lists have bounded scroll, sticky headers, explicit pagination, and keyboard-focusable rows. Detail links load the selected record directly and display complete server-provided lineage, evidence, history, related records, and `Not recorded` gaps. Opening detail does not remove or reorder the list row.

A failed GET leaves the last successful response visible, displays `Stale`, and displays one `As of` timestamp. Hidden tabs do not issue polling requests. Visible Overview and Jobs refresh at 15-second intervals. Coverage refreshes at 60 seconds. Open Job detail refreshes at 15 seconds. The browser network log contains GET requests only for the control room.

## Idempotence and Recovery

The projection is read-only and safe to refresh repeatedly. It does not write Prisma records. If one batch query fails, the route returns an error and the client retains its last-good response. A later manual Refresh or visibility change retries the same GET. The old affiliate panel files remain available for their existing tests but are not reachable from the Admin shell.

## Artifacts and Notes

The primary artifacts are the projection module, the GET-only Admin route, the control-room component and focused tests, the Admin shell wiring, and this living plan. Final test output, browser evidence, review findings, and commit ID will be recorded in `Progress` and `Outcomes & Retrospective`.

## Interfaces and Dependencies

The server projection exports:

    export type AffiliateOperationsView = 'overview' | 'coverage' | 'jobs' | 'intake' | 'review' | 'sources' | 'candidates';

    export type AffiliateOperationsProjectionInput = Readonly<{
      view: AffiliateOperationsView;
      page: number;
      pageSize: number;
      filters: Readonly<Record<string, string>>;
      selectedType: string | null;
      selectedId: string | null;
    }>;

    export const loadAffiliateOperationsProjection: (
      input: AffiliateOperationsProjectionInput,
    ) => Promise<Readonly<Record<string, unknown>>>;

The API route accepts `GET /api/admin/affiliate-operations?view=...&page=...&pageSize=...` and returns the projection. It accepts filters and selected-record query parameters. It must not export a mutation handler.

The client control room receives `active` and `refreshKey` props from the Admin shell and uses `useSearchParams`, `useRouter`, and `fetch` with `credentials: 'include'`. It must not call existing affiliate mutation routes.

## Revision Notes

- 2026-08-24: Created the issue #69 plan after reading the issue, completed prerequisite work, current Admin shell, affiliate schema, and repository rules. Chose one transactional GET projection and query-addressable read-only views.