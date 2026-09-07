# Event Editor coverage contract

These files are the reviewed test contract for issue #53. The site owns the HTTP contract. The applications share JSON test data. They do not share application code.

## Inventory

`field-inventory.json` classifies all 301 strict command leaves. A command uses the shared `draft` classifications. The guard expands them for Create, Save, and both proposal acceptance commands. It checks each complete command separately. A change to one command cannot hide behind the shared draft.

`source-field-inventory.json` records editor state, network DTO, domain model, and Room property declarations. It also records field defaults and serialization annotations. Each source record supplies the `apps/mobile/composeApp` owner for all its field classifications. A classification applies to the named declaration only. Catalogs, navigation state, participant flows, and legacy display values have explicit exclusions.

`protocol-schema-snapshot.json` records strict commands, snapshots, typed results, and proposal responses. It detects changes to required fields, defaults, constraints, and union branches. Zod Date values appear as unrepresented JSON alternatives because JSON cannot carry a JavaScript Date. Wire fixtures use date strings.

The allowed classifications are `covered`, `derived`, `immutable`, `server-owned`, `conditional`, and `intentionally-excluded`. Each classification requires a reason. Open JSON records have a `.*` leaf. Their keys are not strict command fields. The source inventory also covers their modeled Kotlin configuration types. The complete fixtures include non-default phase, scoring, Match Rule, and Playoff configuration values.

## Shared examples

`complete-wire-fixtures.json` contains eight complete Event Type and context examples. They cover all five Event Types, payments, questions, documents, staffing, rental values, Organization authority, and External Registration. They also include nine command envelopes and thirteen typed result examples.

The pairwise matrix contains 26 cases. They cover every feasible pair among the declared Event Type, End Policy, Staffing Priority, payment, time zone, collection, phase, and authority factors. Tryout excludes Match officiating choices. The guard checks coverage against the full factor domain. It does not execute the full Cartesian product. Boundary cases cover leap dates, daylight-saving offsets, day and week limits, empty collections, fractional durations, and client integer limits. Invalid boundary cases must fail the site schema.

Some values depend on context. One-Time Event and Tryout disable Automated Scheduling. Weekly Event enables it. League and Tournament retain the organizer choice. Non-competition Event Types exclude Match generation settings. Tryout also excludes Team standings and Match officiating. Assistant hosts remain valid for Tryout.

Set scoring derives Match duration from the whole-minute segment settings. A timed Match retains its explicit duration, including fractions. For No Planned End, an absent generated Match end and null have the same meaning. An absent optional Match duration and null also have the same meaning. The web round-trip test names these two normalizations. It does not remove other differences.

## Checks

Run site checks from `apps/site`:

    npm run test:event-editor:coverage
    npx tsc --noEmit
    npm run lint:changed

Run Android checks from `apps/mobile`:

    ./gradlew :core:network:testDebugUnitTest :core:repository-impl:testDebugUnitTest

Use `gradlew.bat` on Windows. The network task reads the JSON fixtures and generates test-only Kotlin source. The repository test module uses that same generated source. The common tests run on both Android and iOS. Mobile CI runs `:core:network:iosSimulatorArm64Test` and `:core:repository-impl:iosSimulatorArm64Test` on macOS.

The Android client-to-site test sends the production Kotlin encoder output to the real site parser. It requires the site npm dependencies. `MVP_SITE_DIR` can override the default `apps/site` path. This check does not start a site server.

## Failure paths

The site coverage command runs `eventEditorSave.test.ts` and `eventEditorRevisionBinding.test.ts`. They check complete rollback, exact retries, changed payload identity, stale revisions, proposal invalidation, and notification or invitation deduplication after commit. The database integration suite also checks proposal rollback against PostgreSQL.

Mobile `DefaultCreateEventComponentTest` checks unchanged retry identity, changed-intent identity, partial acceptance retries, stale proposals, and proposal invalidation after setup changes. `EventEditorCoverageRoundTripTest` checks the complete draft through the mobile session mapper. It also checks canonical assistant-host roles for Tryout.

## Change process

Run the guard before changing an inventory. Review each reported path. Set its classification and reason. Confirm its mobile owner. Add a non-default example for an applicable context. Update the protocol snapshot after reviewing the contract shape. Run the site and mobile checks. Add a Room migration and schema snapshot if a persisted entity changes.

Do not regenerate expected classifications during tests. Do not replace a failed expected value with encoder output. A new fixture must describe the intended canonical value independently from the implementation.
