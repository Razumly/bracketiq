# Make Room junctions the canonical membership store

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Team rosters, pending team invitations, user team membership, and chat participants currently exist twice in the mobile database: once as serialized JSON arrays on the parent rows and again as normalized junction rows. Some reads search the JSON with substring matching, and several replacement transactions catch relation-write failures, allowing a parent row to commit with incomplete membership. After this change, Room junction rows are the sole persisted membership truth. The app will still expose the same `Team.playerIds`, `Team.pending`, `UserData.teamIds`, and `ChatGroup.userIds` domain properties used by API and UI code, but Room reads will reconstruct them from exact junction IDs, including IDs whose user profiles have not been downloaded yet.

The result is observable through Android and iOS migration tests that start from schema 92, preserve every legacy array member, remove the four duplicate columns, and validate schema 93. Android DAO tests will also prove exact `user_1` versus `user_10` matching, pre-profile membership, and full rollback when a trigger rejects one replacement row.

## Progress

- [x] (2026-07-14 13:08Z) Created isolated branch `codex/app009-membership` at mobile commit `dc1d4a8c` and reviewed the current entities, DAO transactions, relation models, migration registration, and schema 92 snapshot.
- [x] (2026-07-14 13:18Z) Defined ignored/defaulted domain membership properties and normalized relation projections that retain junction IDs without requiring hydrated `UserData` rows.
- [x] (2026-07-14 13:18Z) Replaced substring membership queries and exception-swallowing writes with exact, transactional junction operations.
- [x] (2026-07-14 13:22Z) Added and registered schema 92 to 93 migrations on Android and iOS, exported schema 93, and proved exact legacy backfill.
- [x] (2026-07-14 13:25Z) Added DAO regressions for missing-user reads and transaction rollback; passed 12 Android instrumentation tests, 4 iOS migration tests, and 125 focused repository tests after production Android/iOS compilation.
- [x] (2026-07-14 13:38Z) Reviewed the final diff, re-ran the focused Android membership unit tests and 12 Android migration/DAO instrumentation tests, and completed whitespace/static checks before the isolated checkpoint commit.

## Surprises & Discoveries

- Observation: All production Android and iOS Room builders use `BundledSQLiteDriver`, so the migration can rely on one modern SQLite feature set on supported devices rather than the varying framework SQLite bundled with Android 26 through 35.
  Evidence: `composeApp/src/androidMain/kotlin/com/razumly/mvp/di/RoomDBModule.android.kt` and `core/database/src/iosMain/kotlin/com/razumly/mvp/core/data/getDatabase.kt` both call `setDriver(BundledSQLiteDriver())`.

- Observation: Existing Room `@Relation` projections only return hydrated `UserData` records. They cannot preserve a membership ID when the corresponding user row has not arrived.
  Evidence: `TeamWithPlayers`, `TeamWithRelations`, and `ChatGroupWithRelations` currently relate the junction directly to `UserData`, while the junction entity itself is not included in the returned object.

- Observation: Ignoring only the four constructor properties is insufficient for Room's Kotlin symbol processor. Room then cannot identify a constructor whose parameters exactly match the persisted columns.
  Evidence: The first Android/iOS database compile failed with `Entities and data classes must have a usable public constructor`; adding an ignored primary constructor plus a persisted-field secondary constructor for each affected entity made both platform compiles pass.

- Observation: `MigrationTestHelper` validates the foreign-key declarations but does not enable SQLite foreign-key enforcement for ad hoc post-migration statements.
  Evidence: The first Android migration test saw the declared parent foreign key but a manual parent delete retained four junction rows. Explicitly enabling `PRAGMA foreign_keys = ON` before the cascade assertion made the same strict migration test pass.

- Observation: Normalizing a DAO-read `Team` before capturing its canonical arrays can resurrect stale membership from the persisted rich registration snapshot.
  Evidence: `withSynchronizedMembership()` prefers non-empty `playerRegistrations` and derives `playerIds` and `pending` from them. A static review caught that a `copy(playerIds = ...)` on a Room-read team would otherwise replace junctions with the old registrations.

- Observation: Treating in-progress `STARTED` and `PENDING` registration rows as historical records creates duplicate registrations when the same user is present in a canonical junction.
  Evidence: The final reconciliation regression now proves that a canonical member reuses the in-progress row as its metadata template and becomes exactly one `ACTIVE` or `INVITED` row; only terminal `LEFT` and `REMOVED` rows remain as history, while unassigned in-progress rows remain available for workflows.

## Decision Log

- Decision: Keep the API/domain properties on their existing public models, give them empty defaults, and exclude only those properties from Room persistence.
  Rationale: Network serializers, repositories, and UI code continue using the same contracts while the database has one physical source of truth.
  Date/Author: 2026-07-14 / Codex

- Decision: Retain the parent-side cascading foreign key on each junction and remove the user-side foreign key.
  Rationale: Deleting a team or chat must still clean its memberships, but network arrival order must permit a team or chat to reference a user whose profile is not cached yet.
  Date/Author: 2026-07-14 / Codex

- Decision: User profile refreshes will not replace team membership.
  Rationale: Team rows and their exact junction replacements own local roster convergence. Public or partial user payloads may omit `teamIds`, so using them to delete junctions can erase valid membership.
  Date/Author: 2026-07-14 / Codex

- Decision: Give each affected Room entity an ignored full domain constructor and a public Room constructor containing only persisted fields.
  Rationale: This keeps source-compatible domain/network construction, default empty membership fields on direct Room hydration, and an unambiguous constructor for generated Room adapters.
  Date/Author: 2026-07-14 / Codex

- Decision: Include raw junction relations alongside hydrated `UserData` relations in aggregate projections.
  Rationale: Domain membership arrays must be reconstructed from every canonical junction row, while the existing hydrated-user lists should still contain only profiles that are locally available.
  Date/Author: 2026-07-14 / Codex

- Decision: Reconcile the persisted rich registration snapshot to `Team.playerIds` and `Team.pending` before writing the parent row and junctions.
  Rationale: Remote mappers already synchronize rich registration payloads, while DAO reads reconstruct the public arrays from junctions. `withCanonicalMembershipIds()` converts canonical users' `STARTED`/`PENDING` rows to one `ACTIVE`/`INVITED` row while retaining metadata, preserves terminal history and unassigned workflow rows, removes stale active/invited rows, and makes later `withSynchronizedMembership()` calls stable after a Room read-copy-write cycle.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

Schema 93 now removes all four duplicate JSON columns and changes only the three parent entities and three junction entities. Every junction retains its parent cascade and both indexes while allowing a member profile to arrive later. Android and iOS migration tests prove exact legacy-array backfill, and Android DAO tests prove exact ID lookup, missing-profile reconstruction, and full rollback of rejected team and chat replacements.

Verification completed before the final commit:

- Android and iOS database/model compilation passed.
- Full `composeApp` Android and iOS production compilation passed.
- Four iOS migration tests passed with no failures.
- Twelve Android `RoomMigrationPathTest` instrumentation tests passed on the Pixel 9 Pro API 35 emulator with no failures.
- The Android DAO regression updates a `Team` read back from Room, proves its new exact junction lists persist despite stale rich registration rows, and then proves a rejected follow-up replacement rolls back to that new state.
- Two focused `TeamMembershipTest` unit tests passed, including metadata retention, stale current-row removal, captain reconciliation, and repeated synchronization stability.
- The four directly affected repository suites passed 125 tests with no failures.
- Static searches found no membership-column `LIKE` queries and no caught/swallowed exceptions in the three membership DAOs.
- A structural comparison of schemas 92 and 93 found changes only in `UserData`, `Team`, `ChatGroup`, and the three membership junctions.

## Context and Orientation

The repository is a Kotlin Multiplatform mobile app. `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Team.kt`, `ChatGroup.kt`, and `UserData.kt` are shared domain objects and Room entities. Schema 92 persists `Team.playerIds`, `Team.pending`, `ChatGroup.userIds`, and `UserData.teamIds` as JSON text through Room converters. It also persists the same relationships in `team_user_cross_ref`, `team_pending_player_cross_ref`, and `chat_user_cross_ref`.

A junction row is a two-column row connecting a parent ID to a member ID. `TeamPlayerCrossRef.kt`, `TeamPendingPlayerCrossRef.kt`, and `ChatUserCrossRef.kt` define these tables. Today each junction has foreign keys to both the parent and `UserData`; the second key rejects legitimate memberships when the parent payload arrives before the user profile.

`core/database/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/daos/TeamDao.kt`, `ChatGroupDao.kt`, and `UserDataDao.kt` own Room reads and writes. Their replacement helpers are annotated `@Transaction`, but caught exceptions prevent Room from seeing the failure and therefore permit a partial commit. Team and chat membership queries also search serialized JSON with `LIKE`, so `user_1` can match `user_10`.

`core/database/src/androidMain/kotlin/com/razumly/mvp/core/data/RoomMigrations.android.kt` and its iOS counterpart register the chronological schema graph. `core/database/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt` declares the current version, and `composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/` contains the checked Room snapshots used by Android's `MigrationTestHelper`.

## Plan of Work

First, mark the four duplicate list properties as ignored Room fields while retaining their Kotlin serialization behavior and empty defaults. Remove the `UserData` foreign key from all three junction entities, retaining the parent cascade and both useful indexes. Add relation projection types or relation-ID fields that load the junction rows themselves, not only hydrated users, and centralize conversion back to domain objects so every database-facing team, user, and chat read exposes the canonical IDs.

Next, rewrite the DAO surface. Exact membership lookup must join the junction tables. Parent replacement must delete the old junction set, upsert the parent, and insert the normalized new set in one uncaught `@Transaction`; any failure must escape and roll back all three actions. User refresh must upsert profile data without deleting team membership. Flow-returning APIs must apply the same junction-to-domain reconstruction as one-shot reads.

Then increment `MVP_DATABASE_VERSION` from 92 to 93. The 92-to-93 migration will capture existing junctions and each valid legacy JSON array, rebuild the three junction tables without user-side foreign keys, preserve all captured member IDs whose parent exists, and remove the duplicate parent columns. Register the migration in both platform arrays. Generate and review schema 93, checking that no unrelated table changes.

Finally, extend Android instrumentation coverage. A migration fixture will insert overlapping legacy arrays, pre-existing junctions, and IDs with no `UserData` row; after migration it will verify exact membership and removed columns. A live Room DAO test will prove exact lookup and missing-user reconstruction. SQLite abort triggers will reject a chosen junction ID during replacement, and assertions will prove the prior parent and complete prior membership remain unchanged. An iOS bundled-SQLite test will independently exercise the 92-to-93 migration and the same missing-profile backfill.

## Concrete Steps

Work from `/private/tmp/mvp-app-app009` on branch `codex/app009-membership`.

Inspect changes continuously with:

    git status --short
    git diff --check

After editing entities and DAOs, run lightweight compilation before emulator work:

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew :core:database:compileDebugKotlinAndroid :core:database:compileKotlinIosSimulatorArm64

Generate the Room snapshot after the entity version changes:

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew :core:database:roomGenerateSchema

Run iOS migration tests and the relevant shared tests:

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew :core:database:iosSimulatorArm64Test

When the shared Android emulator is free, run the focused instrumentation class:

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew :core:database:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.razumly.mvp.core.data.RoomMigrationPathTest

Before committing, stage only this plan and APP-009 implementation files, then run:

    git diff --cached --check
    git diff --cached --stat

## Validation and Acceptance

Schema acceptance requires a generated schema 93 in which `Team` has no `playerIds` or `pending` columns, `ChatGroup` has no `userIds`, and `UserData` has no `teamIds`. Each membership junction must have one cascading parent foreign key and no `UserData` foreign key. No unrelated entity may change between schemas 92 and 93.

Migration acceptance requires Android and iOS tests to start with valid schema-92 parent rows, arrays such as `["user_1","missing_user"]`, and existing junction rows, then reach schema 93 with every unique exact pair preserved. The migration must also remove the four obsolete columns and permit a junction whose user has no profile row.

DAO acceptance requires exact lookup to return `user_10` only for `user_10`, not `user_1`; a returned `Team`, `UserData`, or `ChatGroup` must expose junction IDs even if no related `UserData` can be hydrated. Replacing a team or chat with a membership that an abort trigger rejects must throw. A following read must show the old parent values and complete old junction set, proving the transaction rolled back rather than partially committing.

The focused Android instrumentation class and iOS simulator migration suite must pass. Android and iOS database production sources must compile, and `git diff --check` must report no whitespace errors.

## Idempotence and Recovery

Migration SQL uses temporary table names that it drops before creation and inserts unique primary-key pairs, so a failed test database can be deleted and recreated safely. Room itself executes one version migration in a transaction; an exception leaves schema 92 intact. The work is isolated from `/Users/elesesy/StudioProjects/mvp-app-critical-audit`, so no recovery action may reset, clean, or edit that dirty primary worktree. If schema generation leaves unrelated outputs, inspect paths and remove only generated artifacts created in this isolated worktree.

## Artifacts and Notes

The baseline is mobile commit `dc1d4a8c`, which already contains schema 92 and the Room-first catalog cache. The pre-existing unstaged DAO experiment in the primary audit worktree was reviewed only as a clue: its exact joins and uncaught writes are useful, but its tests incorrectly require missing-user inserts to fail and it does not remove the physical duplicate columns.

## Interfaces and Dependencies

The final public domain properties remain:

    Team.playerIds: List<String>
    Team.pending: List<String>
    ChatGroup.userIds: List<String>
    UserData.teamIds: List<String>

The final database version is 93. `MVP_DATABASE_MIGRATIONS` on Android and the iOS migration array must both include a 92-to-93 migration. DAO callers retain their existing public return types. Any internal Room-only projection introduced for canonicalization must expose member IDs from `TeamPlayerCrossRef`, `TeamPendingPlayerCrossRef`, or `ChatUserCrossRef` and must not infer membership from hydrated user rows.

Plan revision note (2026-07-14 13:08Z): Created the initial self-contained plan after inspecting schema 92, the three DAO implementations, shared relation models, and both platform migration registries.

Plan revision note (2026-07-14 13:26Z): Recorded completed implementation, constructor and test-runner discoveries, schema review, and cross-platform validation evidence before final review and commit.

Plan revision note (2026-07-14 13:31Z): Recorded and resolved the final static-review finding about stale rich registrations overriding a canonical DAO-read membership replacement, then re-ran Android and iOS database verification.

Plan revision note (2026-07-14 13:38Z): Tightened reconciliation so canonical `STARTED`/`PENDING` rows become exactly one current row without losing metadata, retained only terminal rows as membership history, added duplicate-prevention assertions, and recorded final verification.
