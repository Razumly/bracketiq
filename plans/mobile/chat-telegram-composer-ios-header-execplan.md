# Telegram-Style Chat Composer, Scroll, and iOS Header

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with [PLANS.md](/Users/elesesy/StudioProjects/mvp-app/PLANS.md).

## Purpose / Big Picture

After this change, the chat conversation screen behaves like a modern messenger instead of a generic form screen. On iOS, focusing the composer should no longer push the full screen upward, the bottom menu should not appear on the conversation screen, the newest messages should stay visible above the composer, and scrolling upward should not be overridden when new messages arrive. Emoji-only messages should render without the normal bubble container, and the chat header should use the iOS safe area more intentionally so it feels closer to Telegram.

You can see the result by opening a chat on iPhone simulator or device, focusing the message field, scrolling upward while the keyboard remains open, receiving a new message, and sending an emoji-only message such as `🔥🔥`.

## Progress

- [x] (2026-03-19 23:12Z) Inspected the current chat screen, app shell, iOS host, and message rendering paths.
- [x] (2026-03-19 23:12Z) Confirmed the current baseline is the working tree with existing uncommitted edits, not `HEAD`.
- [x] (2026-03-19 23:12Z) Confirmed product decisions: bottom nav hidden for all chat, scrolled-up state preserved, and new messages show a jump-to-latest affordance.
- [x] (2026-03-19 23:12Z) Verified iOS uses `IQKeyboardManagerSwift 8.0.1` and currently applies both global IQKeyboardManager behavior and SwiftUI `.ignoresSafeArea(.keyboard)`.
- [x] (2026-03-19 23:35Z) Created the implementation branch `codex/chat-shell-ios-keyboard` and isolated this slice to shell/iOS host files.
- [x] (2026-03-19 23:39Z) Removed chat from the shared bottom-nav shell and added Compose-host scoping for keyboard management (`resignOnTouchOutside = false`, disabled distance handling for Compose host VC).
- [x] (2026-03-19 23:45Z) Ran `./gradlew :composeApp:compileKotlinMetadata --no-daemon` and it completed successfully.
- [x] (2026-03-19 23:54Z) Extracted message bubble rendering into `ChatMessageBubble`, added `isEmojiOnlyMessage` helper with attachment gating, and added targeted classification tests.
- [x] (2026-03-20 00:04Z) Rebuilt `ChatGroupScreen` as an overlay-based conversation surface with a custom `ChatHeader`, a floating composer dock, and jump-to-latest affordance driven by chat-local scroll policy.
- [x] (2026-03-20 00:12Z) Added `ChatScrollPolicy` helper tests and extended emoji classification coverage to keycap emoji sequences.
- [x] (2026-03-20 00:15Z) Ran `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.chat.composables.ChatMessageBubbleTest" --tests "com.razumly.mvp.chat.composables.ChatScrollPolicyTest"` and it completed successfully.
- [ ] Complete manual iOS validation for chat keyboard behavior and one non-chat text-entry screen.

## Surprises & Discoveries

- Observation: The current chat screen opts out of scaffold insets with `contentWindowInsets = WindowInsets(0)`, but still pads its composer using `LocalNavBarPadding`, which couples the composer to the shared bottom nav even inside chat.
  Evidence: [ChatGroupScreen.kt](/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/chat/ChatGroupScreen.kt)

- Observation: iOS is currently managed by two competing keyboard systems for Compose-hosted screens: IQKeyboardManager and SwiftUI keyboard safe-area overrides.
  Evidence: [iOSApp.swift](/Users/elesesy/StudioProjects/mvp-app/iosApp/iosApp/iOSApp.swift)

- Observation: The current auto-scroll policy is unconditional and keyed only to `messages.size`, which guarantees jumpy behavior whenever a new message arrives.
  Evidence: [ChatGroupScreen.kt](/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/chat/ChatGroupScreen.kt)

- Observation: The shared Compose insets API available in this project did not expose the `safeDrawing` or `systemBars` constants expected from newer samples, but the stable modifier APIs such as `navigationBarsPadding()` are available.
  Evidence: `compileDebugKotlinAndroid` failed until the composer dock switched from unresolved `WindowInsets.safeDrawing/systemBars` references to `navigationBarsPadding()`.

## Decision Log

- Decision: Treat the current working tree as the implementation baseline rather than `HEAD`.
  Rationale: The repository already contains uncommitted edits in shared shell and iOS files, and the user explicitly asked to preserve and build on the current tree.
  Date/Author: 2026-03-19 / Codex

- Decision: Hide the bottom nav for the full chat route, not only while the keyboard is visible.
  Rationale: This matches the requested messenger-style conversation screen and avoids composer/nav coupling during keyboard transitions.
  Date/Author: 2026-03-19 / Codex

- Decision: Use `disabledDistanceHandlingClasses` on `IQKeyboardManager` for `MainViewController` rather than globally disabling distance management.
  Rationale: This preserves IQKeyboardManager support for other UIKit flows while preventing Compose from fighting with global keyboard-frame adjustments during chat/Compose interaction.
  Date/Author: 2026-03-19 / Codex

- Decision: Scope `disabledDistanceHandlingClasses` from `ContentView` using the runtime `composeController` type.
  Rationale: Applying host-specific IQ exclusions from the point where `MainViewController` is instantiated avoids class-symbol resolution assumptions and guarantees the Compose host VC is the one excluded.
  Date/Author: 2026-03-19 / Codex

- Decision: Preserve manual scroll position when the user is away from the bottom and surface a jump-to-latest affordance instead of forcing auto-scroll.
  Rationale: The user requested Telegram-like reading behavior where typing or inbound messages do not override deliberate scrolling.
  Date/Author: 2026-03-19 / Codex

- Decision: Scope IQKeyboardManager away from the Compose host instead of trying to let both IQKeyboardManager and Compose own keyboard movement.
  Rationale: IQKeyboardManager’s own guidance says to enable or disable it when it conflicts with custom UI. Compose needs sole ownership of the chat layout to prevent full-screen shifts and dismissal side effects.
  Date/Author: 2026-03-19 / Codex

- Decision: Use separate implementation branches/workspaces for the independent slices and integrate them in merge order bubble -> shell/iOS -> layout.
  Rationale: The message-bubble extraction and app-shell/iOS work touch disjoint files, while the final chat layout work depends on both and touches the main conversation screen.
  Date/Author: 2026-03-19 / Codex

- Decision: Implement `isEmojiOnlyMessage` as a code-point parser that supports standalone emoji, flags, and ZWJ sequences while rejecting attachment-backed messages and mixed punctuation/text.
  Rationale: The parser prevents false positives for common non-emoji content and keeps rendering behavior localized to presentation logic without altering message data contracts.
  Date/Author: 2026-03-19 / Codex

- Decision: Build the final chat screen as an overlay layout rather than a `Scaffold` with stacked top/content/bottom slots.
  Rationale: Overlaying the header and composer over the `LazyColumn` allows measured content padding, smoother Telegram-like motion, and better use of the iOS safe area without forcing the full screen to shift during keyboard transitions.
  Date/Author: 2026-03-20 / Codex

## Outcomes & Retrospective

The implementation now removes chat from the shared bottom-nav shell, scopes IQKeyboardManager away from the Compose host, extracts chat message rendering into a dedicated composable, adds emoji-only rendering, and refactors the conversation screen to use a custom header, measured overlay composer, explicit scroll policy, and jump-to-latest affordance. Targeted chat tests pass and the shared metadata compile remains clean.

Manual iOS validation is still outstanding in this session. The remaining acceptance work is to verify the chat keyboard behavior on simulator or device and confirm at least one non-chat iOS text-entry screen still behaves correctly after the host-level keyboard changes.

## Context and Orientation

The conversation UI lives in [composeApp/src/commonMain/kotlin/com/razumly/mvp/chat/ChatGroupScreen.kt](/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/chat/ChatGroupScreen.kt). That file currently owns the full conversation surface, including the header, message list, message bubble rendering, and composer row. The current screen uses a `LazyColumn` for messages and a bottom `Surface` for the composer, but it always auto-scrolls to the bottom when the message count changes and always reserves space for the shared bottom nav.

The shared app shell lives in [composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/App.kt](/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/App.kt) and [composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/MVPBottomNavBar.kt](/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/MVPBottomNavBar.kt). Today, any non-login, non-splash screen is wrapped in the bottom-nav shell. `LocalNavBarPadding` is the shared bottom padding value that downstream screens consume when they need to avoid the overlaying nav bar.

The iOS host is in [iosApp/iosApp/iOSApp.swift](/Users/elesesy/StudioProjects/mvp-app/iosApp/iosApp/iOSApp.swift), [iosApp/iosApp/ContentView.swift](/Users/elesesy/StudioProjects/mvp-app/iosApp/iosApp/ContentView.swift), and [composeApp/src/iosMain/kotlin/com/razumly/mvp/MainViewController.kt](/Users/elesesy/StudioProjects/mvp-app/composeApp/src/iosMain/kotlin/com/razumly/mvp/MainViewController.kt). The host uses `IQKeyboardManagerSwift` for global keyboard management and currently applies `.ignoresSafeArea(.keyboard)` to the SwiftUI wrapper around the Compose view controller. That combination is a likely cause of the full-screen movement the user described.

The message data model is [composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MessageMVP.kt](/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MessageMVP.kt). It already contains `body` and `attachmentUrls`, so emoji-only styling is a view-layer concern rather than a schema change.

The chat component that sends messages is [composeApp/src/commonMain/kotlin/com/razumly/mvp/chat/ChatGroupComponent.kt](/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/chat/ChatGroupComponent.kt). No backend changes are needed for this plan.

## Plan of Work

First, create isolated worker branches or workspaces for the two non-overlapping slices. One worker implements app-shell and iOS keyboard-host changes in `App.kt`, `iOSApp.swift`, and any necessary iOS host files. Another worker extracts the message bubble into a dedicated composable, adds emoji-only rendering logic, and writes the associated tests. The main integration path remains on the primary workspace and will apply the conversation-layout refactor after those worker outputs are available.

Next, change the shared app shell so `RootComponent.Child.Chat` renders outside the bottom-nav wrapper. The chat route must no longer receive nav-bar padding from the shared shell. At the same time, reduce iOS host interference by turning off global tap-to-dismiss and scoping IQKeyboardManager away from the Compose host view controller so Compose can manage keyboard layout itself.

Then, extract message rendering from `ChatGroupScreen.kt` into a new `ChatMessageBubble` composable under `composeApp/src/commonMain/kotlin/com/razumly/mvp/chat/composables/`. Add a helper that classifies emoji-only messages using the text body plus attachments list, and use that to render large standalone emoji text instead of the default card bubble. Keep normal message alignment and timestamp toggling behavior intact.

After that, refactor `ChatGroupScreen.kt` into three visual sections: a custom pinned chat header, the scrollable message list, and a composer dock. Replace the Material `TopAppBar` with a chat-local header that uses `statusBarsPadding()`, a translucent surface, larger circular controls, and a centered title/subtitle layout. Replace unconditional auto-scroll with explicit rules based on `LazyListState` and “near bottom” detection. Add a jump-to-latest affordance that appears only when inbound messages arrive while the user is intentionally away from the bottom. Keep the keyboard open while the user scrolls and ensure typing does not force a snap to latest.

Finally, validate the result with unit tests, targeted app tests, and manual iOS checks on both chat and non-chat text-entry screens. Record any deviations or required follow-up in this plan before finishing.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-app`, create and update the ExecPlan, then implement the changes in this order:

1. Create worker branches or workspaces for:
   `codex/chat-shell-ios-keyboard`
   `codex/chat-bubble-emoji`

2. Implement worker changes and bring them back into the main workspace.

3. Refactor the conversation screen on top of those changes.

4. Run targeted tests:

       ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.chat.*"

   If the project’s test filters do not match the new tests, run:

       ./gradlew :composeApp:testDebugUnitTest

5. If iOS simulator validation is available on this machine, run the app and verify the chat flow manually. If simulator test tasks are configured and stable, run:

       ./gradlew bootIOSSimulator
       ./gradlew :composeApp:iosSimulatorArm64Test

   If iOS simulator automation is not practical, record the limitation in `Outcomes & Retrospective` and complete the required manual validation using Xcode or the simulator app.

## Validation and Acceptance

Acceptance is complete only when all of the following are true:

On the chat screen, focusing the composer does not push the entire conversation upward. The bottom nav is absent from the conversation route. The composer docks directly above the keyboard and the newest messages remain visible above it.

When the user scrolls upward, the keyboard stays open and the list position remains stable. Typing while scrolled upward does not force the list back to the bottom. If a new message arrives while the user is away from the bottom, a jump-to-latest control appears and the list does not move until the user taps the control or manually returns to the bottom.

The custom chat header uses the iOS safe area intentionally, feels taller and less cramped than the previous Material app bar, and still preserves back navigation and chat actions.

Emoji-only messages such as `😀`, `🔥🔥`, and `👨🏽‍💻` render without the normal card bubble container, while mixed-content messages such as `😀 ok` still use the normal bubble.

At least one non-chat iOS text-entry screen still behaves correctly after the IQKeyboardManager changes.

## Idempotence and Recovery

This plan is additive and safe to repeat. Re-running the implementation steps should not create duplicate routes, duplicate components, or duplicate tests if files are updated in place. If a worker branch proves difficult to integrate, keep the branch output as reference and re-apply the same file-level changes manually in the main workspace.

If the iOS keyboard-host changes regress non-chat screens, the safe rollback is to restore only the IQKeyboardManager scoping behavior while keeping the chat-route bottom-nav removal and message-layout improvements. Do not roll back unrelated working-tree changes that predate this plan.

## Artifacts and Notes

Important starting facts from inspection:

    ChatGroupScreen currently auto-scrolls via LaunchedEffect(messages.size).
    ChatGroupScreen currently pads the composer with LocalNavBarPadding.
    App.kt currently wraps Chat in the shared bottom-nav shell.
    iOSApp.swift currently enables IQKeyboardManager globally and calls .ignoresSafeArea(.keyboard).

Important library guidance:

    IQKeyboardManager’s README states that when the library conflicts with custom or third-party UI, developers should enable or disable IQKeyboardManager when presenting or dismissing that UI rather than expecting both systems to cooperate automatically.

## Interfaces and Dependencies

Define the following internal interfaces and helpers by the end of the implementation:

In `composeApp/src/commonMain/kotlin/com/razumly/mvp/chat/composables/ChatMessageBubble.kt`, define a composable equivalent to:

    @Composable
    fun ChatMessageBubble(
        message: MessageMVP,
        user: UserData?,
        isCurrentUser: Boolean,
        isTimestampExpanded: Boolean,
        onToggleTimestamp: () -> Unit,
    )

In the same package or a nearby chat-local utility file, define a helper equivalent to:

    internal fun isEmojiOnlyMessage(body: String, attachmentUrls: List<String>): Boolean

In `ChatGroupScreen.kt`, define chat-local state or helpers that decide whether the list should auto-scroll and whether the jump-to-latest affordance should be shown. Keep these helpers internal to the `chat` package.

Revision note: Created this ExecPlan from the approved implementation plan before code changes began so the implementation can be tracked as a living document in the repository.

Revision note: Updated after implementation to record the final overlay-based chat layout, the targeted test commands that passed, and the remaining manual iOS validation requirement.
