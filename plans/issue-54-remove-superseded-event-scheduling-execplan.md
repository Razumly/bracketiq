# Remove superseded Event and scheduling paths

This ExecPlan follows `PLANS.md`. It is a living record for GitHub issue #54. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current.

## Purpose / Big Picture

After this change, web and mobile use one Event Editor contract. The live Event Types are One-Time Event (`EVENT`), Weekly Event, League, Tournament, and Tryout. External Registration remains a commercial property and does not become an Event Type. Organizers see one Create action. A failed scheduled create returns to the editor without an automatic unscheduled fallback. Staffing uses only Staffing Priority. Generic resource surfaces say Resource unless a Sport supplies a label such as Field or Court.

The clean cutover is visible in the strict site contract, the mobile DTOs, the public Event response, and the database schema. Legacy Affiliate Event Type and old official scheduling mode values cannot enter the live contract.

## Progress

- [x] (2026-09-08 22:40Z) Read issue #54, parent issue #14, blocker issue #53, repository rules, site/mobile rules, and ExecPlan rules.
- [x] (2026-09-08 22:42Z) Closed issue #53 per maintainer direction. Android and shared fixture work were already complete. Native iOS execution is not required for this change.
- [x] Remove legacy official scheduling mode from site, mobile, API projection, tests, and Prisma schema.
- [x] Remove the Affiliate Event Type from the live schema and generated client. Keep External Registration and Affiliate Event commercial behavior.
- [x] Remove automatic unscheduled-create recovery and stale compatibility submission paths.
- [x] Remove the obsolete automated-scheduling wire alias and update site/mobile to the canonical wire field.
- [x] Replace generic user-facing Field text with Resource text. Keep Sport Resource Labels.
- [x] (2026-09-08) Add the Prisma and Room forward migrations, regenerate clients and Room schema 108, run focused checks, type checks, lint, Android unit tests, Room instrumentation compilation, and final two-axis code review.
- [x] (2026-09-08) Commit the clean cutover and update issue #54.
- [x] (2026-09-08) Update issue #53. Project status remains blocked by the GitHub token's missing `read:project` scope.

## Surprises & Discoveries

- The current Prisma `Events` and `EventTemplates` models still store `officialSchedulingMode`, although the canonical `staffingPriority` field and migration already exist.
- The site exposes `officialSchedulingMode` in the public Event allowlist and maps legacy values in several adapters and tests.
- The site stores automated scheduling as the Prisma column `automatedScheduling`, while Event Editor drafts use `isAutomatedScheduling`. The site and mobile still carry an alias for the old wire name.
- Mobile already has only the five approved Event Types. Its remaining staffing compatibility is in the maintenance graph decoder and accepted-key set.
- The create page still renders `Save as draft without a schedule` after a schedule-build failure. This is the only implicit recovery action to remove; explicit `CREATE_ONLY` remains a valid command mode when Automated Scheduling is disabled.
- Generic Field fallback text remains in site field helpers, the calendar filter, schedule projection, and mobile schedule diagnostics. Sport Resource Label data must continue to produce Field or Court where supplied.
- GitHub project mutations cannot be read with the current `gh` token because it lacks `read:project`. Issue edits work. Report this limitation rather than changing credentials.

## Decision Log

- Decision: Keep `EVENT` as the internal identifier for One-Time Event.
  Rationale: Parent issue #14 explicitly allows this compatibility identifier. Remove only `AFFILIATE` from Event Type values and branches.
  Date/Author: 2026-09-08 / Codex

- Decision: Keep `affiliateUrl`, External Registration, and Affiliate Event classification.
  Rationale: They are commercial context, not Event Type. Parent issue #14 requires their invariants.
  Date/Author: 2026-09-08 / Codex

- Decision: Keep `CREATE_ONLY` as an explicit completion mode.
  Rationale: It represents an intentional create with Automated Scheduling disabled. Remove only the automatic failure recovery that changes a failed scheduled create into an unscheduled create.
  Date/Author: 2026-09-08 / Codex

- Decision: Rename the public automated-scheduling wire field to `isAutomatedScheduling` while retaining the Prisma storage column only as an internal database detail unless the generated schema cutover proves a safe column rename.
  Rationale: The Event Editor already uses the canonical field. Removing the transport alias avoids mobile and site compatibility shims without expanding unrelated scheduler storage work.
  Date/Author: 2026-09-08 / Codex

- Decision: Use a new forward migration. Do not rewrite historical migrations.
  Rationale: Existing environments may already have applied the old enum and columns. The forward migration must normalize old Affiliate rows, copy old scheduling mode meaning into Staffing Priority where needed, then drop obsolete columns and enum values.
  Date/Author: 2026-09-08 / Codex

- Decision: Migrate Room database version 107 to 108 for the removed Event Type.
  Rationale: A converter fallback would keep obsolete AFFILIATE data in the live model. The forward migration rewrites persisted rows to EVENT before the strict converter and schema run.
  Date/Author: 2026-09-08 / Codex

## Outcomes & Retrospective

- Site and mobile now use canonical Event Types, Staffing Priority, Resource wording, and `isAutomatedScheduling`.
- The schedule page keeps explicit `CREATE_ONLY` but no longer offers automatic unscheduled recovery. Current configuration is captured before asynchronous submission work.
- Prisma migration `20260908230000_remove_legacy_event_and_staffing_modes` removes the old columns and enum value. Room migration 107 to 108 rewrites persisted `AFFILIATE` rows to `EVENT`.
- Site type checking, lint, focused tests, Prisma checks, mobile common tests, Android unit tests, Room instrumentation compilation, and the final mobile unit suite passed. The full site suite passed 792 suites and failed 19 unrelated Windows or repository-baseline suites.
- Native iOS tasks were not run on Windows. GitHub project status could not be changed because the token lacks `read:project`.

## Context and Orientation

`apps/site` is the backend and web source of truth. `apps/site/prisma/schema.prisma` defines persisted Event values. `apps/site/src/contracts/eventEditor.ts` defines the strict Event Editor command and draft. `apps/site/src/server/events` builds and persists editor snapshots. `apps/site/src/app/events/[id]/schedule` supplies the web editor and create action. `apps/site/src/server/officials/config.ts` owns Staffing Priority policy. Generated Prisma code under `apps/site/src/generated/prisma` must be regenerated after schema edits.

`apps/mobile/core/model` owns Room-backed domain models. `apps/mobile/core/network` owns wire DTOs. `apps/mobile/core/repository-impl` maps API data into Room and builds Event Editor commands. `apps/mobile/composeApp` owns Android and iOS shared UI. Mobile must consume the same five Event Types and Event Editor field names as the site.

A wire alias is a second payload field accepted only to support an older client. An adapter is a mapper that translates a removed contract value. A clean cutover removes both after all callers use the canonical field.

## Context Boundary

Minimum sources used: root `AGENTS.md`; `apps/site/AGENTS.md`; `apps/mobile/AGENTS.md`; `docs/agents/issue-tracker.md`; `docs/agents/workstream-execution.md`; `CONTEXT.md`; issue #54; parent issue #14; blocker issue #53; `apps/site/prisma/schema.prisma`; the Event Editor contract, snapshot, save, response, and wire compatibility modules; the official staffing configuration; the event create page; mobile Event, Event Editor, graph, and repository DTOs; affected tests.

Expand only if a changed symbol has additional callers, a Prisma migration reports an unexpected dependency, generated code differs from the schema, or a focused test identifies a contract path not listed above. Do not read unrelated affiliate supply code unless a search shows an Event Type branch rather than commercial provenance behavior.

## Plan of Work

First remove old Staffing Mode types and mappings from the site and mobile. Update adapters to require canonical Staffing Priority and preserve explicit `doTeamsOfficiate`. Remove the public legacy field and update tests to assert canonical output. Drop the old Prisma columns and enum in a forward migration after normalizing any remaining data. Regenerate Prisma code.

Next remove `AFFILIATE` from the Prisma Event Type enum and all generated code. The migration maps old Affiliate Event rows to internal `EVENT` while preserving `affiliateUrl`, source, authority, and registration behavior. Search every Event Type branch and retain only the five approved values. Remove compatibility tests that exist only for the deleted value.

Then remove `automatedScheduling` from the public wire contract. Site response projection must emit `isAutomatedScheduling`; editor snapshots and commands already use that name. Mobile DTOs must decode and encode the canonical name without `SerialName` or `JsonNames` aliases. Remove the legacy maintenance graph key and graph-shape discriminator. Keep the Prisma storage field mapping inside server persistence code until a separate schema rename is required by type generation.

Remove the create-page recovery state, handler, modal, and error-to-unscheduled transition. Keep the first failure action as an editor error. Ensure all submission paths call `captureCurrentEventConfiguration` and do not use the asynchronous draft reference as command input. Retain explicit proposal acceptance and explicit `CREATE_ONLY` commands.

Replace generic user-facing Field fallback labels with Resource in site and mobile. Use Sport Resource Labels for sports that supply Field or Court. Update observable tests and fixtures only where they assert generic wording.

Run Prisma generation, site focused Jest tests, site type checking, mobile common and Android unit tests, and the available cross-platform integration smoke paths. Run the repository-required final checks once. Review the diff with `/code-review`, fix findings, commit the clean cutover, and update GitHub issue #54.

## Concrete Steps

Run site commands from `apps/site`:

    npm exec prisma generate
    npx jest --runInBand <affected test files>
    npx tsc --noEmit
    npm run lint

Run mobile commands from `apps/mobile` in PowerShell:

    .\gradlew :composeApp:testDebugUnitTest
    .\gradlew :composeApp:test
    .\gradlew :composeApp:assembleDebug

Native iOS Gradle tasks are not available on Windows. Do not claim iOS execution. Use shared common tests and Android-to-site integration fixtures as the available cross-platform proof.

Use `gh issue comment 54 --repo Razumly/bracketiq` for the final evidence and `gh issue close 54 --repo Razumly/bracketiq` only after all acceptance criteria pass. Project status changes require the `read:project` scope, which the current token lacks.

## Validation and Acceptance

A repository search of production source and generated contract code contains no live `AFFILIATE` Event Type, no `officialSchedulingMode`, no old staffing mapping, no `automatedScheduling` wire alias, and no automatic Save Without Schedule or Schedule Later UI. Affiliate URL and External Registration behavior still exists.

The site Event Editor accepts and returns only canonical Staffing Priority and `isAutomatedScheduling`. A failed scheduled create leaves the editor open and does not issue a second `CREATE_ONLY` command. An explicit disabled-Automated-Scheduling submission still creates through `CREATE_ONLY`.

Mobile decodes the canonical fields, writes commands without compatibility aliases, opens existing Room data, shows Create as the only creation action, and renders generic Resource wording. Android focused tests and shared API integration fixtures pass. Native iOS is not run on Windows and is reported as an environment limit, not as an unverified code claim.

## Idempotence and Recovery

Source edits and Prisma generation are repeatable. Never rewrite applied migrations or reset the database. If a generated file changes unexpectedly, compare it with the edited schema and rerun generation from `apps/site`. If a migration depends on an existing foreign key or enum, inspect the database schema and adjust the forward migration before running it. Do not deploy or change a runtime without explicit authorization.

## Artifacts and Notes

The primary artifacts are the forward Prisma migration, the updated generated Prisma client, the canonical site and mobile Event Editor contract, removed recovery UI, updated resource labels, focused tests, and the final commit on the current workstream branch.

## Interfaces and Dependencies

The site Event Editor continues to expose `EventEditorDraft.schedule.isAutomatedScheduling`, `EventEditorDraft.staff.staffingPriority`, and completion modes `CREATE_ONLY` and `CREATE_AND_BUILD_SCHEDULE`. The public Event response exposes `isAutomatedScheduling` and `staffingPriority`, never the removed legacy fields. Mobile `EventApiDto` and `EventEditorScheduleDto` use the same canonical names. `EventType` contains `TOURNAMENT`, `EVENT`, `LEAGUE`, `TRYOUT`, and `WEEKLY_EVENT` only. Prisma `Events` and `EventTemplates` contain `staffingPriority` and no `officialSchedulingMode`; `EventsEventTypeEnum` contains no `AFFILIATE`.
