# Moderation, Consent, Blocking, and Per-User Event Hiding

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `/PLANS.md`.

## Purpose / Big Picture

After this change, the Kotlin Multiplatform app will mirror the moderation behavior defined by `mvp-site`: chat access requires a one-time terms agreement, abusive users can be blocked and later unblocked, chats and events can be reported, blocked or reported content disappears from that user’s mobile UI immediately, and local storage stays in sync with the server’s moderation state. A user will be able to prove this by opening chat and seeing the consent prompt, by blocking a user and watching shared chats disappear from the chat list, and by reporting an event and seeing it leave mobile search results immediately.

## Progress

- [x] (2026-04-14 14:57Z) Reviewed the current app user model, auth DTOs, chat repositories, event search repository, and profile and event-detail screens.
- [x] (2026-04-14 22:13Z) Extended `UserData`, `UserDataDTO`, and `UserProfileDto` with blocked-user, hidden-event, and chat-consent fields, and bumped `MVP_DATABASE_VERSION` to 10.
- [x] (2026-04-14 22:13Z) Added repository support for block, unblock, report chat, report event, chat terms fetch and accept, and current-user cache refresh.
- [x] (2026-04-14 22:13Z) Updated chat list, chat group, profile connections, and event detail UI flows to expose moderation and consent actions.
- [x] (2026-04-14 22:13Z) Updated local chat and event filtering so blocked-away chats and hidden events disappear from mobile UI immediately after the server confirms the action.
- [x] (2026-04-14 23:39Z) Added focused repository tests for chat terms, block behavior, hidden-event filtering, and event-report hiding.
- [x] (2026-04-15 04:54Z) Added unblock repository coverage and restored end-user chat copy to say `Delete Chat` while preserving archive-on-delete behavior on the backend.

## Surprises & Discoveries

- Observation: the local chat repository currently deletes chat groups from Room when they disappear from the server response.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/chat/data/ChatGroupRepository.kt` uses `multiResponse(... deleteData = deleteChatGroupsByIds(...))`.

- Observation: the app already routes all current-user bootstrap through `/api/auth/me`, which means consent and moderation-related user fields can piggyback on the existing bootstrap path.
  Evidence: `UserRepository.loadCurrentUser()` reads `api/auth/me` and caches `me.profile`.

- Observation: this repo does not expose the `roomGenerateSchema` task referenced in `AGENTS.md`; the Room plugin here writes the checked-in schema under `composeApp/schemas/` during the Android build path, and `copyRoomSchemas` reports `NO-SOURCE`.
  Evidence: `composeApp/build.gradle.kts` configures `room { schemaDirectory("$projectDir/schemas") }`, `./gradlew :composeApp:tasks --all | rg -i "room|schema"` lists `copyRoomSchemas`, and `composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/10.json` contains the new user moderation fields.

## Decision Log

- Decision: mobile will treat archived or blocked-away chats as hidden and remove them from Room for the acting user, even though the server keeps them for admin evidence.
  Rationale: the user-facing requirement is immediate disappearance from the acting user’s feed, and the server remains the source of truth for preserved evidence.
  Date/Author: 2026-04-14 / Codex

- Decision: local event filtering will use the current user’s `hiddenEventIds` in repository return values and UI rendering, in addition to trusting the server to exclude those events.
  Rationale: the requirement explicitly asks for client-side filtering as a backstop.
  Date/Author: 2026-04-14 / Codex

## Outcomes & Retrospective

Implementation shipped across the app surfaces that map to the new site contract. Chat access is now gated by a blocking terms dialog until the server records consent. Profile connections now expose block and unblock flows, including the defaulted “Leave all chats with this user” option and a blocked-users section for reversal. Chat group menus expose reporting with a follow-up leave-chat prompt, and event detail menus expose event reporting. Event repository reads now filter `hiddenEventIds` both from cached data and new fetches so reported events disappear immediately.

Verification outcome:

- `./gradlew :composeApp:assembleDebug` passed on 2026-04-14 after adding the missing `kotlinx.serialization.Serializable` import for the new moderation DTOs.
- `./gradlew :composeApp:testDebugUnitTest --tests '*UserRepositoryHttpTest' --tests '*EventRepositoryHttpTest'` passed after adding focused repository coverage for moderation and visibility behavior.
- The checked-in Room schema at `composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/10.json` already reflects `blockedUserIds`, `hiddenEventIds`, `chatTermsAcceptedAt`, and `chatTermsVersion`.
- The build still emits unrelated deprecation and style warnings from existing files, but the new moderation code paths compiled and the targeted tests passed.

## Context and Orientation

The shared app code lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp`. User account data is modeled in `core/data/dataTypes/UserData.kt` and decoded from `core/network/dto/AuthDtos.kt` and `core/data/dataTypes/dtos/UserDataDTO.kt`. The current-user bootstrap and social actions live in `core/data/repositories/UserRepository.kt`. Chat screens are `chat/ChatGroupScreen.kt` and `chat/ChatListComponent.kt`, while chat persistence and API access live in `chat/data/ChatGroupRepository.kt` and `chat/data/MessageRepository.kt`. Event discovery flows use `core/data/repositories/EventRepository.kt` and `eventSearch/EventSearchComponent.kt`. The profile connections screen is `profile/ProfileFeatureScreens.kt` with state and actions in `profile/ProfileComponent.kt`. The mobile event action menu is in `eventDetail/EventDetailScreen.kt`. Room database versioning is controlled by `core/db/MVPDatabaseService.kt`, and schema snapshots are emitted into `composeApp/schemas/`.

In this repository, “hide” means remove something from the current user’s visible mobile state and from local Room-backed lists. The authoritative archive and moderation evidence still live on the site backend.

## Plan of Work

Start by extending the user DTOs and Room entity with `blockedUserIds`, `hiddenEventIds`, `chatTermsAcceptedAt`, and `chatTermsVersion`. Update `UserRepository` so bootstrap, social refresh, and local caching all preserve those fields. Bump `MVP_DATABASE_VERSION` and regenerate the Room schema snapshot once the entity shape is stable.

Next, add repository methods that wrap the new site APIs: chat-terms consent, block, unblock, report chat, and report event. These methods should update local user state immediately and, when the server returns chat ids to hide, remove those chats from Room for the current user without deleting server evidence.

Then update the UI layers. `ChatGroupScreen.kt` needs a report action and a post-report leave flow. `ProfileFeatureScreens.kt` and `ProfileComponent.kt` need blocked-users state plus block and unblock actions. `EventDetailScreen.kt` needs a report action in the three-dot menu. Finally, `EventRepository.kt` and the event search components need to filter out `hiddenEventIds` both when processing server responses and when rendering cached results.

## Concrete Steps

Run the following from the repository root as work proceeds.

    ./gradlew :composeApp:testDebugUnitTest
    ./gradlew :composeApp:test

After changing `UserData` or any Room entity, run:

    ./gradlew :composeApp:roomGenerateSchema

If iOS-related Gradle tasks are needed on macOS, ensure JDK 17 is active first, as required by `AGENTS.md`.

## Validation and Acceptance

Acceptance is behavioral. A user who opens chat for the first time on mobile must be prompted to agree to the terms before chat opens. A user who blocks another user with the leave-chats option enabled must see shared chats disappear from the chat list immediately after the action completes. A user who unblocks someone must see that user move out of the blocked section without old chats or friendships being automatically restored. A user who reports an event must stop seeing it in mobile search and discover lists without needing a fresh app launch.

Tests must cover DTO decoding for the new user fields, repository state updates for block and report flows, UI state in connections and chat menus, and the Room schema migration.

## Idempotence and Recovery

Repository calls should be written so retries are safe. Repeating chat consent should refresh cached user data without duplicating UI state. Filtering hidden events locally should be deterministic and should not depend on one specific screen having already refreshed. If the Room schema generation fails after a version bump, fix the entity definitions first and rerun the generation task until the emitted schema matches the final entity shape.

## Artifacts and Notes

Expected user-visible mobile behavior:

    Open chat for the first time
    -> terms dialog appears
    Tap Agree
    -> chat opens and future chat opens do not prompt again unless the terms version changes

Expected block behavior:

    Block user with "Leave all chats with this user" enabled
    -> current user cache updates
    -> reported block is sent to server
    -> returned chat ids are removed from local chat lists immediately

## Interfaces and Dependencies

Extend these Kotlin types:

    UserData
    UserDataDTO
    UserProfileDto

Add repository methods with stable names under `UserRepository`, `ChatGroupRepository`, or a dedicated moderation helper if that keeps the call sites clearer:

    acceptChatTerms(version: String): Result<UserData>
    blockUser(targetUserId: String, leaveSharedChats: Boolean): Result<BlockUserResult>
    unblockUser(targetUserId: String): Result<UserData>
    reportChat(chatId: String, notes: String?, leaveChat: Boolean): Result<ReportChatResult>
    reportEvent(eventId: String, notes: String?): Result<UserData>

`EventRepository` must expose filtered results that already exclude the current user’s `hiddenEventIds`, and `ProfileConnectionsState` must gain a blocked-users collection.

Revision note: created this ExecPlan before implementation to satisfy the repository requirement that significant multi-surface features be tracked with a living execution plan.
