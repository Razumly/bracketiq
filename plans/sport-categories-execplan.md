# Add persisted sport categories to search filters

This ExecPlan is a living document. Maintain it with `PLANS.md` from the repository root. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current after each milestone.

## Purpose / Big Picture

A person searching BracketIQ can choose a broad sport such as Soccer and receive events for every current Soccer sport, including Indoor Soccer, Grass Soccer, Beach Soccer, and Futsal. The search request still sends the existing sport values. The server does not need a new category filter.

The web application will store sport categories in a table separate from event Sports. The `/api/sports` response will return both lists. Search and filter controls will display expandable category groups with icons. Selecting a category expands to its member Sport names before the existing filter state reaches event, organization, rental, or team searches. Event creation and other saved sport fields continue to accept only member Sports.

A reviewer can see the result by opening Discover, opening the Sport control, expanding Soccer, and selecting Soccer. The selected state must contain the member Sport names, not `Soccer` as a query value.

## Progress

- [x] Research the Sports model, default catalog, `/api/sports`, existing filter controls, and shared sport icon set.
- [x] Record Sport and Sport Category terms in `CONTEXT.md`.
- [x] Decide the persisted category fields, seed groups, and filter-only expansion behavior.
- [x] Add the Prisma model, migration, default category seeding, and `/api/sports` catalog response.
- [x] Add admin constant loading and updates for Sport Categories.
- [x] Add the client catalog cache and typed category mapping.
- [x] Add category expansion logic and tests.
- [x] Replace search and filter sport controls with expandable, icon-backed groups.
- [x] Keep saved event, team, organization, field, and resource sport inputs member-Sport-only.
- [x] Run focused tests, site lint/type checks, and the production build.
- [x] Attempt Discover and organization filter flows in a real browser. The existing production-like runtime served stale missing static chunks after the build, so visual interaction could not be completed without an unauthorized runtime restart.
- [x] Record final outcomes and migration deployment notes.

## Surprises & Discoveries

- The existing database already removes generic Soccer and Volleyball Sports from the public catalog, while Football and Hockey remain canonical Sports. The category table can therefore add broad Soccer and Volleyball groups without reintroducing the removed rows.
- The existing discover state already stores string Sport names and sends them to unchanged service methods. Category clicks can expand that state in the browser and require no API contract change.
- `organization-operation-ui.tsx` provides a flat custom `MultiSelect`. Adding grouping to it would affect many saved-data forms, so the feature will use a dedicated filter selector instead.
- Sport icons already cover every seeded Sport and map broad labels such as Soccer and Volleyball to an existing icon. The generated icon manifest must remain generated and unchanged.

## Decision Log

- Decision: Store categories in a separate `SportCategories` model with `id`, timestamps, `name`, `sportIds`, and `displayOrder`.
  Rationale: A category is a search grouping, not an Event Sport. An array keeps the current schema boundary small and matches existing denormalized sport references.
  Date/Author: 2026-09-09 / Codex.

- Decision: Keep `/api/sports` and all search/filter request fields backward compatible. Add a `categories` response field and expand category selections to existing Sport names in the client.
  Rationale: Backend filters already match Sport values. A category query parameter would add a second filter contract and duplicate membership logic.
  Date/Author: 2026-09-09 / Codex.

- Decision: Seed Soccer, Volleyball, Football, Hockey, and Baseball categories. Category members are existing Sports: Soccer uses Indoor Soccer, Grass Soccer, Beach Soccer, and Futsal; Volleyball uses Indoor Volleyball, Beach Volleyball, and Grass Volleyball; Football uses Football, Flag Football, and Australian Football; Hockey uses Hockey, Field Hockey, and Ball Hockey; Baseball uses Baseball and Softball.
  Rationale: These groups cover the existing broad labels and their current variants. Admins can update membership without changing the Sport catalog.
  Date/Author: 2026-09-09 / Codex.

- Decision: Existing Football and Hockey rows remain valid member Sports even though categories have the same display names. The category record is separate, and the category label never enters selected Sport values.
  Rationale: Removing or renaming existing rows would change stored Event, Team, Division, Resource, and affiliate references. The request requires a clean category boundary without an unrelated data migration.
  Date/Author: 2026-09-09 / Codex.

- Decision: Validate category member IDs against Sports when an admin updates `sportIds`, but allow category membership sets to overlap.
  Rationale: IDs must not become dangling. Overlap is safe because selection uses a union and leaf values remain the only persisted filter values; forbidding future useful groupings would be a stronger domain rule than the request requires.
  Date/Author: 2026-09-09 / Codex.

- Decision: Use the category-aware selector only for search and filter surfaces. Event, team, organization, field, and resource creation/edit selectors remain member-Sport-only.
  Rationale: Categories are not valid persisted Event Sport values. This keeps saved-data contracts stable while giving broad selection to search users.
  Date/Author: 2026-09-09 / Codex.

## Outcomes & Retrospective

The implementation adds a separate `SportCategories` table, five lazy-seeded category groups, an additive `categories` field on `/api/sports`, admin editing with Sport ID validation, a v6 client catalog cache, and a dedicated expandable selector. Category callbacks emit only current member Sport names. Saved-data selectors continue to use `getAll()` and do not offer categories.

Focused helper, service, real HTTP client-to-site integration, admin, API, icon, Discover, organization, and selector tests passed. TypeScript, full ESLint, Prisma validation/generation, icon checks, and the production build passed. Browser API inspection returned the new category catalog. Browser UI inspection reached the existing loading fallback, but the runtime refused several rebuilt static chunks with 500/MIME errors. A runtime restart would be required for visual desktop/mobile interaction and was not authorized.

## Context and Orientation

`apps/site/prisma/schema.prisma` is the source of truth for the site database. `apps/site/src/server/defaultSports.ts` defines the existing Sport catalog and its lazy seeding. The new category seed helper will live beside it. `apps/site/src/app/api/sports/route.ts` currently returns canonical Sports and repairs removed generic Soccer and Volleyball references; it will add categories without changing that repair behavior.

`apps/site/src/lib/sportsService.ts` maps the HTTP catalog into client types and caches it in browser storage. `apps/site/src/app/hooks/useSports.ts` exposes the catalog to React components. The new catalog shape will preserve `getAll()` for existing callers and add category data for filter callers.

`apps/site/src/app/discover/components/DiscoverSearchBar.tsx`, `DiscoverFilterBar.tsx`, `DiscoverTabFilterBar.tsx`, and `DiscoverMapModal.tsx` are the Discover search surfaces. `apps/site/src/components/events/EventFilterControls.tsx` and `apps/site/src/app/organizations/[id]/OrganizationEventsTabContent.tsx` are the organization event filter surfaces. `SportIcon.tsx` renders the shared generated SVG icons. `organization-operation-ui.tsx` contains a flat generic selector used by saved-data forms and will not gain category behavior.

A Sport is a leaf value that existing APIs and saved Event data can use. A Sport Category is a separate grouping of leaf Sports. “Expansion” means converting a selected category into all valid member Sport names before a request or URL is built.

## Context Boundary

Read and change these sources only when the listed condition applies:

- `apps/site/prisma/schema.prisma` and a new migration under `apps/site/prisma/migrations/`: required for persisted categories.
- `apps/site/src/server/defaultSports.ts`, `canonicalSports.ts`, and the new category seed helper: required for stable default catalog data and lazy seeding.
- `apps/site/src/app/api/sports/route.ts` and its tests: required when the catalog response gains categories.
- `apps/site/src/server/adminConstants.ts` and both admin constants routes and tests: required because admins must update category rows like other constants.
- `apps/site/src/types/index.ts`, `sportsService.ts`, and `useSports.ts`: required for typed client catalog transport and cache compatibility.
- Discover and organization filter files named in Context and their existing tests: required for category selection and display.
- `SportIcon.tsx` and its tests: required to prove category and member rows use existing icon assets. Do not edit the generated manifest.
- `CONTEXT.md`: required for the resolved domain vocabulary.

Expand the boundary only if a type error or caller search shows another filter surface accepts selected Sports, or if a migration/build error identifies a generated Prisma or deployment file that must be refreshed. Do not expand into mobile because the HTTP request and response filter contracts remain unchanged.

## Plan of Work

First add the `SportCategories` Prisma model and an additive SQL migration. The migration will create the table, enforce trimmed nonblank names and nonnegative display order, add a case-insensitive name index, and seed the five default groups using existing Sport IDs. The seed must be repeatable. A TypeScript helper will lazily create missing defaults when the site starts against a database that has the table but no category rows; it will not overwrite admin changes.

Next extend `/api/sports`. It will continue to canonicalize and repair deprecated Sports, then load categories and return `{ sports, categories }`. Existing `sports` rows remain unchanged. Category payloads will contain IDs, names, member Sport IDs, and timestamps. Invalid stored member IDs will not be exposed as valid selectable leaves.

Extend the admin constants service with the `sport-categories` kind. Load categories in display order. Permit edits to `name`, `sportIds`, and `displayOrder`. Normalize and validate each field. Before updating member IDs, verify that every ID exists in Sports. Preserve the current admin authentication and generic JSON editor flow, adding a category tab and labels.

Add a typed `SportCategory` client type and a catalog cache version. `sportsService.getCatalog()` will return `{ sports, categories }`; the existing `getAll()` will continue to return only Sports for callers that populate saved fields. `useSports()` will expose `categories` and hydrate stale catalog data from the new cache shape.

Add a pure category selection module. It will map category member IDs to current Sports, build ordered groups, select or remove all member names, report full and partial selection, and summarize fully selected groups by category name. Missing member IDs will be ignored. It will never return a category name as a selected Sport value.

Add a dedicated `SportCategoryMultiSelect` component. It will use a keyboard-accessible combobox and listbox. Category rows will have an independent selection button and expand/collapse button with `aria-expanded` and `aria-controls`. Member rows will render `SportIcon`. Search will match category and member labels. The component will emit only member Sport names. Use it in Discover and organization event/team filter surfaces. Keep generic flat selectors for saved event and resource values.

Update Discover and organization callers to pass categories from `useSports()`. Existing URL, event service, organization service, rental service, team service, division option, and local matching code will continue to receive the expanded member Sport names. Update summaries and active filter labels to show category names when all members are selected.

## Concrete Steps

Run all commands from `apps/site` unless noted.

1. Add the Prisma model, migration, category seed helper, and response field. Run `npm run prisma:validate` and `npm run prisma:generate`.
2. Add client mapping and pure category selection helpers. Run the focused service and helper tests.
3. Add admin constant support and update the admin route tests.
4. Add the selector and wire Discover and organization filter surfaces. Run focused component tests.
5. Run `npm run lint` and `npm run build`. The build runs the icon check, Prisma check, generated client normalization, and Next build.
6. Use the browser against the existing site runtime or an explicitly authorized local runtime. At desktop and mobile widths, open Discover and an organization Events tab. Expand Soccer, select it, and observe member Sport values in the existing filter state. Expand/collapse without changing selection. Select one member and observe a partial category state. Verify clear-all restores an empty selection.
7. Apply the migration through the normal deployment process. Do not run a production migration or deployment as part of this code change without separate authorization.

## Validation and Acceptance

The Prisma schema validates. The migration is additive and repeatable. The API route returns the existing canonical `sports` array and a separate `categories` array. No category name is inserted into the Sports table by the migration or lazy seeder.

Admin route tests prove that `sport-categories` is listed, that editable fields are exposed, that valid member IDs update, and that unknown member IDs return a client validation error. Existing admin kinds continue to work.

Pure helper tests prove that selecting Soccer yields the four current Soccer Sport names, selecting it again removes those names, selecting one child marks the category partial, and missing category member IDs do not create a fake selected value. A service test proves that the v6 cache maps both Sports and categories and that `getAll()` still returns only Sports.

Component tests prove that category and member rows render the shared Sport icons, category expansion does not select a category, category selection emits only member names, and keyboard or click interaction can select and clear values. Existing flat callers without categories retain their current behavior.

Browser verification proves the same behavior on the actual Discover and organization filter surfaces. Existing event, organization, rental, and team requests receive arrays of existing Sport names. Event creation and resource selectors do not offer category values.

## Idempotence and Recovery

The migration uses `CREATE TABLE` and seed conflict guards in one transaction. Run it once through Prisma migration deployment. If it stops before completion, inspect the migration table and database table before retrying; do not hand-edit production rows. The lazy seeder creates only missing default category IDs and does not overwrite existing names or membership.

The browser cache version changes from `sports-cache-v5` to `sports-cache-v6`. Old data is ignored and refetched. If a category API response is malformed, the client keeps valid Sports and treats categories as empty rather than sending category names. If a category update references a missing Sport ID, reject the update without changing the row.

## Artifacts and Notes

Important end-state artifacts:

    apps/site/prisma/schema.prisma
    apps/site/prisma/migrations/<timestamp>_add_sport_categories/migration.sql
    apps/site/src/server/defaultSportCategories.ts
    apps/site/src/lib/sportCategoryFilters.ts
    apps/site/src/components/ui/SportCategoryMultiSelect.tsx

The existing generated icon files under `apps/site/src/components/ui/sharedIconManifest.generated.ts` and `apps/site/public/icons/sports` are inputs, not hand-edited outputs.

## Interfaces and Dependencies

Define `SportCategory` in `apps/site/src/types/index.ts` with `$id`, `name`, `sportIds`, `displayOrder`, `$createdAt`, and `$updatedAt`.

Define `sportsService.getCatalog(forceRefresh?: boolean): Promise<{ sports: Sport[]; categories: SportCategory[] }>` and keep `sportsService.getAll(forceRefresh?: boolean): Promise<Sport[]>` as the member-Sport-only compatibility method. `useSports()` returns `sports`, `categories`, `sportsById`, `sportsByName`, `loading`, and `error`.

Define pure functions in `apps/site/src/lib/sportCategoryFilters.ts` for ordered group construction, category selection toggling, full and partial selection checks, and selected-label summarization. The functions accept current Sport options and persisted category rows. They match category `sportIds` to Sport `$id` values and do not invent missing Sports.

Define `SportCategoryMultiSelect` props with member Sport options, category rows, a string-array value, and a string-array change callback. It may accept the existing label, placeholder, loading, error, disabled, and class props needed by the filter callers. Its callback contract is strict: every emitted value is a current member Sport name, never a category name.

The existing dependencies remain Next.js, React, Mantine wrappers, and the shared `SportIcon`. Do not add a new UI library or a new backend search parameter.

## Milestones

Milestone one creates and exposes persisted category data. It is complete when Prisma validation passes, the focused API tests pass, and a mocked `/api/sports` response contains separate category rows.

Milestone two adds client catalog and selection behavior. It is complete when cache, mapping, and pure helper tests pass and all existing `getAll()` callers type-check.

Milestone three updates the filter UI. It is complete when component tests prove category expansion, icon use, and member-only values on Discover and organization filters.

Milestone four completes verification when lint and build pass. Browser inspection was attempted, but the existing runtime served stale missing static chunks after the build; visual category interaction remains unverified in that runtime.

## Revision Notes

- 2026-09-09: Created the living plan after repository research. Resolved the separate-model, member-only expansion, default grouping, admin update, and saved-data boundary decisions.
- 2026-09-09: Implementation complete. Recorded test/build evidence and the existing-runtime static chunk limitation. Production migration and deployment remain separate authorized operations.
