# Migrate the BracketIQ site global shell

This ExecPlan is a living document. Keep the `Progress`, `Surprises & Discoveries`, `Decision Log`, `Review Record`, and `Outcomes & Retrospective` sections current while work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root. A contributor must be able to restart the work from this file and the current working tree only.

## Purpose / Big Picture

BracketIQ users need one consistent application shell on desktop and mobile. After this work, the shared navigation, footer, gates, prompts, chat surfaces, AI assistant, loading state, error state, drawers, and dialogs use BracketIQ-owned tokens and primitives. The shell no longer uses Mantine presentation components, except for the root Mantine provider and global Mantine styles that unmigrated callers still require.

A user can open a management page and use the same routes, authentication state, Team state, feedback flow, chat flow, and AI flow as before. The user can operate each shared control with a keyboard. Each overlay restores focus. Modeless chat windows remain independent. The target behavior is reflow at actual 200% browser zoom and at 320 CSS pixels. Motion stops when the user requests reduced motion. Interactive targets are at least 44 by 44 CSS pixels. Issue #120 owns the shared shell's responsive behavior across every consuming Route. Route-specific product content stays owned by its Layout Family and must meet the same universal responsive requirement in its own migration slice.

The visible proof is a real browser comparison against the approved desktop and mobile references. The user authorized a temporary non-development runtime named `issue120-prod-smoke`; it served `http://localhost:3100` with local PostgreSQL. The final static, authenticated/manual, native-zoom, responsive, Standards, and Spec shared-shell proof is recorded below. Route-specific product content findings remain with later issues and are not #120 failures. Issue #120 remains open and uncommitted in this record.

## Progress

- [x] (2026-09-01) Read `PLANS.md`, issue #120, the approved reference comment in issue #133, `plans/site-ui-foundation-execplan.md`, the repository rules, the site rules, and the read-only shell discovery map.
- [x] (2026-09-01) Recorded implementation base `e720f540764628272e339aec31259789ddda5c50`, the current issue state, the approved image paths, the scope decisions, the file ownership, and the validation contract in this ExecPlan.
- [x] (2026-09-01) Milestone 1: Added the owned `PageShell` seam and the shared App Router loading and error presentations. The root loading fallback is in-flow. The error section has a labelled region, a focused heading, a text-only alert message, and a retry button outside the alert.
  Evidence: Changed `apps/site/src/components/layout/PageShell.tsx`, `apps/site/src/components/ui/Loading.tsx`, `apps/site/src/components/ui/ErrorPresentation.tsx`, `apps/site/src/app/loading.tsx`, `apps/site/src/app/error.tsx`, `apps/site/src/app/__tests__/shell-boundaries.test.tsx`, `apps/site/src/components/ui/__tests__/Loading.test.tsx`, and `apps/site/src/components/ui/__tests__/ErrorPresentation.test.tsx`.
  Focused proof: the current root record is 3 suites and 10 tests with no open handles.
- [x] (2026-09-01) Milestone 2: Migrated `FeedbackDrawer` and `FeedbackForm` together. Kept the Navigation and standalone page caller contracts.
  Evidence: Changed `apps/site/src/components/feedback/FeedbackDrawer.tsx`, `apps/site/src/components/feedback/FeedbackForm.tsx`, `apps/site/src/components/feedback/__tests__/FeedbackDrawer.test.tsx`, and `apps/site/src/components/feedback/__tests__/FeedbackForm.test.tsx`. No Mantine import remains in either production feedback component.
  Focused proof: 2 suites and 16 tests with no open handles.
- [x] (2026-09-01) Milestone 3: Migrated the shared chat overlays and visual markup. Preserved `ChatContext`, `ChatUIContext`, service methods, HTTP contracts, portal and timer behavior, three-window ordering, unread behavior, invite creation, terms consent, and message behavior.
 Evidence: Changed `apps/site/src/components/chat/InviteUsersModal.tsx`, `apps/site/src/components/moderation/TermsConsentModal.tsx`, `apps/site/src/components/chat/ChatDrawer.tsx`, `apps/site/src/components/chat/ChatList.tsx`, `apps/site/src/components/chat/ChatDetail.tsx`, `apps/site/src/components/chat/__tests__/ChatDrawer.test.tsx`, `apps/site/src/components/chat/__tests__/ChatList.test.tsx`, `apps/site/src/components/chat/__tests__/ChatDetail.test.tsx`, `apps/site/src/components/chat/__tests__/InviteUsersModal.test.tsx`, `apps/site/src/components/moderation/__tests__/TermsConsentModal.test.tsx`, and `apps/site/src/context/__tests__/ChatUIContext.test.tsx`. `ChatComponents.tsx` and `ChatUIContext.tsx` implementation remained unchanged. No Mantine import remains in the migrated chat or terms production surfaces.
  Focused proof: 7 suites and 41 tests with no open handles.
- [x] (2026-09-01) Milestone 4: Migrated `AIAssistantDrawer`. Preserved the Agent context, HTTP payloads, event-page registrations, and controlled focus behavior.
  Evidence: Changed `apps/site/src/components/agent/AIAssistantDrawer.tsx` and `apps/site/src/components/agent/__tests__/AIAssistantDrawer.test.tsx`. No Mantine import remains in the AI drawer. `AgentContext.tsx`, `Navigation.tsx`, `RootLayout`, and the event schedule registrations remain unchanged.
  Focused proof: 2 suites and 15 tests with no open handles.
- [x] (2026-09-01) Milestone 5 Navigation slice: migrated `Navigation.tsx` to semantic shell tokens, owned Buttons, and a controlled left Sheet for mobile navigation. Preserved route ownership, route order, auth branches, admin visibility, AI and feedback actions, active-path semantics, menu close behavior, and focus return. The Navigation slice is complete. Footer, profile-gate, and mobile prompt slices are also complete below.
  Evidence: Changed `apps/site/src/components/layout/Navigation.tsx` and `apps/site/src/components/layout/__tests__/Navigation.test.tsx`. The Navigation test renders without `MantineProvider`. No Mantine import remains in either Navigation file.
  Focused proof: 1 suite and 22 tests with no open handles.
- [x] (2026-09-01) Milestone 5 ProfileCompletionGate proof: Added focused tests for no-op branches, query preservation, the complete-profile exemption, safe-next validation, the home fallback, and the discover fallback. The control-character test exposed that `safeNextPath` rejected only carriage return, line feed, and tab. Expanded the guard to reject C0 and C1 controls and DEL. Null UI remained unchanged.
  Evidence: Changed `apps/site/src/components/auth/__tests__/ProfileCompletionGate.test.tsx` and `apps/site/src/components/auth/ProfileCompletionGate.tsx`.
  Focused proof: 1 suite and 15 tests with no open handles.
- [x] (2026-09-01) Milestone 5 MobileAppPrompt slice: Replaced Mantine `Button`, `Group`, `Paper`, and `Text` with the owned `Button`, `Card`, and native layout and text. Preserved the path, feature-flag, standalone, native iOS Safari, dismissal, zero-delay reveal, store, deep-link, and fallback contracts. Added rendered proof for suppression, reveal, dismissal expiry, platform destinations, dismissal storage, deep-link assignment, and fallback timing.
  Evidence: Changed `apps/site/src/components/layout/MobileAppPrompt.tsx` and `apps/site/src/components/layout/__tests__/MobileAppPrompt.test.tsx`. TypeScript reference resolution before the edit found the default component at its definition and the `apps/site/src/app/layout.tsx` import and JSX use. Each exported helper had only its definition and local component call. No Mantine import remains in either prompt file.
  Focused proof: 1 suite and 16 tests with no open handles.
- [x] Milestone 5: Migrated shared navigation, footer, profile gate proof, and mobile application prompt. Kept Navigation route-owned.
- [x] Milestone 6: Integrated the root `PageShell` once. Preserved provider order, feature flags, and the overlay-surface bypass.
  Evidence: Changed `apps/site/src/app/layout.tsx` and `apps/site/src/app/__tests__/shell-boundaries.test.tsx`. The normal branch now has one `PageShell` owner with `SiteFooter` in its `footer` slot. The existing AgentProvider subtree remains in the growing child region. `MobileAppPrompt` and `Toaster` remain after the shell. The overlay branch is unchanged.
  Final focused proof: the root shell, Loading, and ErrorPresentation records total 3 suites and 10 tests with no open handles.

- [x] (2026-09-01) Issue #120 shell scope correction: restored the organization page to the fixed base, removed the unused route-content API, and replaced image mocks in the three focused tests with accessible non-image stubs.
  Evidence: `apps/site/src/app/organizations/[id]/page.tsx` remains at the fixed base. The final root and Navigation records below cover the corrected shell boundary and route behavior. Focused ESLint passed for the protected shell files with no diagnostics.
- [x] (2026-09-01) Milestone 7 behavior, static, production-build, and public production browser gates: complete. The exact composite proof, TypeScript, changed-file lint, placeholder-database build, and public browser review all pass.
 Evidence: 19/19 suites, 142/142 tests, 0 snapshots, no warnings or open handles; `npx tsc --noEmit` exit 0 with zero diagnostics; changed-file lint exit 0 for 36 changed site files with zero errors or warnings; placeholder build exit 0 with Prisma validate, generate, and check, Next.js 16.2.9, and 127/127 static pages; the final `issue120-prod-smoke` runtime served `http://localhost:3100` with local PostgreSQL.
- [x] (2026-09-01) Milestone 7 authenticated/manual and responsive shared-shell subgate: complete. The final matrix covered 34 routes at 320, 390, 768, 1024, and 1536 CSS pixels, with equivalent reflow conditions. Native Chrome 200% proof passed, and Chrome was restored to 100%. Route-specific content findings are recorded under later issues and are not #120 shell failures.
- [x] (2026-09-01) Milestone 8 Standards review: complete. All Standards findings are verified.
- [x] (2026-09-01) Milestone 9 Spec review: complete. The final shared-shell Spec re-review passes. CHAT-SPEC-05 and ROOT-SPEC-01 are verified. Route-content findings remain with #121, #122, #123, and #127.
- [x] (2026-09-01) Issue #120 shared-shell acceptance evidence: complete. The shared shell passes the authenticated/manual matrix, native 200% responsive proof, Standards re-review, and Spec re-review. This plan does not declare Organization, Discover, Organization Events, My Schedule, or other route-specific product content passed. Issue #120 remains open and uncommitted.
- [x] (2026-09-01) Recorded the universal responsive contract and the shared-shell versus Layout Family ownership boundary. The requirement applies to every consuming Route. Route-specific product content remains in its Layout Family migration slice.
 
## Surprises & Discoveries

- Observation: `Navigation` is route-owned. It is not rendered by `RootLayout`.
  Evidence: Fifteen production callers render `apps/site/src/components/layout/Navigation.tsx`. This plan changes the shared component and its transitive feedback surface. It does not move Navigation into the root layout and does not edit callers only to apply the migration.
- Observation: the Navigation export and local route constants have stable TypeScript references.
  Evidence: A TypeScript language-service references query before the edit returned 15 production caller files for default `Navigation`, three local references for `baseNav`, nine local references for `mobileAppNavItem`, and one direct JSX use of `FeedbackDrawer`. No caller changed.

- Observation: the root Mantine provider is still an active compatibility boundary.
  Evidence: `apps/site/src/app/layout.tsx` imports both Mantine style sheets and wraps the normal application tree in `MantineProvider`. Unmigrated routes, product overlays, global selectors, and test helpers still use Mantine.

- Observation: The root App Router segment now has shared in-flow loading and resettable error boundaries.
  Evidence: `apps/site/src/app/loading.tsx` delegates to `Loading` with `Loading page...` and no `fullScreen` prop. `ErrorPresentation` renders a labelled `region`, focuses its heading, exposes only its message through `role="alert"`, and keeps retry outside that alert. The root boundary suite and focused component suites cover these contracts.

- Observation: Root `PageShell` and route content width are separate ownership boundaries.
  Evidence: `PageShell` owns the root full-width, safe-shrinking content region and root footer order. The organization route keeps its pre-#120 Mantine `Container`; its route-specific maximum width remains product-owned. The shared shell's responsive behavior applies across every consuming Route. Route-specific product Surfaces remain owned by their Layout Family and must meet the universal responsive requirement in their own migration slices. This keeps the shared shell change separate from the roughly 5,000-line organization product surface.

- Observation: the exported `Loading` symbol has 18 production caller files and 36 JSX uses.
  Evidence: A TypeScript language-server references query ran before the edit. It returned 55 references, including the definition, 18 imports, and 36 JSX uses. No caller needed a change.

- Observation: the chat UI is modeless by design.
  Evidence: `ChatUIContext` keeps an ordered list of as many as three open chat windows. It deduplicates a requested window and evicts the oldest window when a fourth window opens. A single modal Sheet would remove this behavior.

- Observation: some chat surfaces use raw visual markup but still need migration work.
  Evidence: `ChatDrawer`, `ChatList`, and `ChatDetail` have no Mantine imports. They use non-semantic clickable rows, unlabeled close controls, and custom fixed windows. The visual classes also need semantic BracketIQ tokens.

- Observation: `TermsConsentModal` is not a Mantine component, but it is an incomplete custom dialog.
  Evidence: it has no dialog role, accessible dialog name, focus trap, Escape policy, or focus restoration. Its event-schedule caller requires `allowClose=false`.
- Observation: the chat and moderation exported symbols have stable caller boundaries.
  Evidence: the pre-edit reference scan found `ChatComponents` as the only production caller of `ChatDrawer` and `InviteUsersModal`, `ChatDrawer` and the schedule page as the `TermsConsentModal` callers, and no required caller changes for `ChatList`, `ChatDetail`, or the `ChatUIContext` public interface.

- Observation: Base UI controlled Dialog close requests can be rejected without changing the controlled state.
  Evidence: `DialogRoot.ChangeEventDetails` exposes `cancel()`. `TermsConsentModal` uses it for Escape and outside interaction when `allowClose=false`, and its focused test confirms the dialog remains open.

- Observation: the owned Textarea does not implement Mantine autosize props.
  Evidence: `apps/site/src/components/ui/textarea.tsx` is a native textarea wrapper. Feedback and AI migration work must set a usable responsive height without changing draft, Enter, or Shift+Enter behavior.
- Observation: the owned Sheet keeps a controlled popup mounted only when its close event opts out of unmounting.
  Evidence: `SheetContent` owns its portal, while the Base UI root close details expose `preventUnmountOnClose()`. `FeedbackDrawer` uses the root action ref for form Cancel and Done, and opts out in the shared close callback for Escape and the close button.

- Observation: the standalone feedback page has no focused test file.
  Evidence: `apps/site/src/app/feedback/FeedbackPageClient.tsx` remains an unchanged caller of the exported `FeedbackForm` props. The focused form suite renders the `standalone_page` entry source.

- Observation: the AI drawer has stable production references and event-page context seams.
  Evidence: The TypeScript language service found `AIAssistantDrawer` at its definition and `apps/site/src/app/layout.tsx` import and render, and found `useAgentContext` in the drawer, `Navigation.tsx`, and `apps/site/src/app/events/[id]/schedule/page.tsx`. No caller or context API change was required.

- Observation: the owned Textarea has no ref API, so the AI drawer uses a stable native input ID for Sheet initial focus.
  Evidence: `apps/site/src/components/ui/textarea.tsx` wraps a native textarea without `forwardRef`. The drawer passes an `initialFocus` callback to the owned Sheet and returns the connected textarea element.
- Observation: the normal root tree and the broadcast overlay tree are intentionally different.
  Evidence: `RootLayout` returns only `html`, the overlay body, and route children when `x-bracketiq-surface` is `overlay`. That branch bypasses providers, gates, chat, AI, footer, prompt, and Toaster.
- Observation: RootLayout and its metadata exports had stable TypeScript language-service references before the protected seam edit.
  Evidence: The pre-edit references query returned two `RootLayout` references in `apps/site/src/app/layout.tsx`. Each re-exported `metadata` and `viewport` reference resolved to `layout.tsx` and `rootMetadata.ts`. The export declarations remain unchanged.
- Observation: The root shell boundary test now covers normal and overlay composition.
  Evidence: The focused test renders enabled and disabled chat and agent branches, checks the PageShell child and footer order, and confirms the overlay renders route content without normal provider or global-surface markers.
- Observation: The authorized production runtime is available for this plan's proof.
 Evidence: The user authorized the `issue120-prod-smoke` runtime. It served `http://localhost:3100` with local PostgreSQL. The local fixture/runtime boundary is explicit: the placeholder database URL was used only for the production build's Prisma validation, generation, and check. The final authenticated/manual shared-shell matrix is recorded below.
 
- Observation: The first live mobile Navigation review found the drawer too wide and visually unlike the approved reference.
  Evidence: The initial drawer measured 384/426 CSS px (90.1%) at the 426px viewport and was full width at 320px, rather than the approved 56.7% reference intent. The final component-specific width is `min(16rem, calc(100vw - 3rem))`, with fixed route icon slots and an active 3px primary rail/background/icon/label.
 
- Observation: Extending the Navigation width/icon edit temporarily removed the SheetContent transition completion callback.
  Evidence: Mobile Feedback then waited for its 250ms fallback. Restoring `onTransitionEnd` and cancelling the pending Feedback action/timer when the menu reopens makes the handoff deterministic; the Navigation proof is now 22/22.
 
- Observation: Native Chromium shortcuts did not change tool-owned browser zoom, so the final check used Chrome settings.
 Evidence: Chrome `chrome://settings` Page zoom was set to 200%. The physical viewport was 1536x1024, the CSS viewport was 768x512, and DPR was 2. The final drawer internal scroller measured 443 client and 681 scroll; AI and Feedback were reachable after scroll; Navigation, Chat, Feedback, and AI stayed within the viewport; and the page measured 768/768. Chrome was restored to 100% Page zoom, DPR1, and 1536/1536 physical/CSS viewport. The actual zoom record is [issue comment 5503403469](https://github.com/Razumly/bracketiq/issues/120#issuecomment-5503403469).
 
- Observation: The initial public browser lacked organization product state; the final local PostgreSQL runtime supplied the shared-shell acceptance state.
 Evidence: The final shared reference review passes for the desktop bar and the mobile header/drawer at 426 and 320 CSS pixels. Organization route shell, content, and state reference differences remain owned by [issue #122 comment 5503302029](https://github.com/Razumly/bracketiq/issues/122#issuecomment-5503302029), not #120. No route-specific product content pass is claimed here.
 
- Observation: Several production observations are outside issue #120.
 Evidence: The authenticated responsive matrix isolated route-content findings outside #120. `/discover` exceeded the viewport by 16 CSS pixels at 320 in [issue #121 comment 5503302025](https://github.com/Razumly/bracketiq/issues/121#issuecomment-5503302025). An Organization tab clipped in [issue #122 comment 5503302029](https://github.com/Razumly/bracketiq/issues/122#issuecomment-5503302029). Organization Events exceeded the viewport by 16 CSS pixels at 320 in [issue #123 comment 5503302031](https://github.com/Razumly/bracketiq/issues/123#issuecomment-5503302031). `/my-schedule` exceeded the viewport by 16 CSS pixels at 320 in [issue #127 comment 5503302032](https://github.com/Razumly/bracketiq/issues/127#issuecomment-5503302032). These are route-content findings for later issues, not shared-shell failures for #120.
- Observation: The final browser review found and fixed six shared-shell defects.
  Evidence: Chat focus return became synchronous. Navigation dark/nav visual alignment was corrected. Mobile Chat now uses a 44px header portal in Navigation and MarketingHeader, so the footer and actions remain unobscured. The mobile Chat conversation is stacked and contained at 320 and 426. The mobile drawer has an internal scroller at native 200%, so AI and Feedback remain reachable after scroll. The AI mobile drawer handoff works.
- Observation: The final composite found a Navigation breakpoint focus race and an interrupted close transition.
  Evidence: The final fix closes the mobile drawer when native 200% changes to 100%, focuses the visible BracketIQ home control, leaves the hidden trigger unfocused, and resets interrupted-close state. NAV-STD-09 and NAV-STD-10 are verified.

## Decision Log

- Decision: use `e720f540764628272e339aec31259789ddda5c50` as the fixed implementation and review base.
  Rationale: this commit contains the approved issue #120 reference set and the completed owned primitive foundation from issue #119.
  Date/Author: 2026-09-01 / Codex.

- Decision: retain `@mantine/core/styles.css`, `@mantine/dates/styles.css`, `MantineProvider`, `createTheme`, `MantineColorsTuple`, and `MOBILE_APP_MANTINE_PRIMARY_SCALE` in `apps/site/src/app/layout.tsx`.
  Rationale: active product callers still use Mantine. A provider or package removal would break unmigrated callers. Remove Mantine imports only from shell surfaces completed by this plan.
  Date/Author: 2026-09-01 / Codex.

- Decision: keep Navigation route-owned.
  Rationale: current routes choose when the management navigation appears. Moving it into `RootLayout` would add it to login, complete-profile, landing, and public pages. Change only the shared Navigation implementation and its transitive `FeedbackDrawer` and `FeedbackForm` surface.
  Date/Author: 2026-09-01 / Codex.
- Decision: use an owned controlled left `Sheet` for the mobile Navigation menu.
  Rationale: `Sheet` supplies the approved left-drawer interaction, modal keyboard close, and focus containment. Navigation keeps its existing account, application, feedback, route, and public login links. A local opener ref supplements `Sheet` focus return for Escape, the close control, and close-on-link while preserving the trigger and menu id contract.
  Date/Author: 2026-09-01 / Codex.

- Decision: make `PageShell` the only page-shell export.
  Rationale: `PageShell` owns the root full-width and min-width content region and the root footer order. Keep the `PageShellProps` contract unchanged. Do not add a separate route-content export or migrate the organization route.
  Date/Author: 2026-09-01 / Codex.

- Decision: keep route-specific content width product-owned and outside issue #120.
  Rationale: restore the organization page's original Mantine `Container` wrapper from the fixed base. This avoids an unrelated 5,000-line product refactoring and does not narrow the shared PageShell behavior.
  Date/Author: 2026-09-01 / Codex.

- Decision: migrate `FeedbackDrawer`, `FeedbackForm`, `MobileAppPrompt`, `InviteUsersModal`, `TermsConsentModal`, and `AIAssistantDrawer` away from Mantine presentation components.
  Rationale: these are the Mantine or custom overlay surfaces inside the issue #120 shell boundary. Owned Base UI primitives already provide controlled state, keyboard dismissal, focus containment, and reduced-motion presentation.
  Date/Author: 2026-09-01 / Codex.

- Decision: keep chat focus bookkeeping in presentation owners and keep chat windows modeless.
  Rationale: a local ref captures the connected opener without changing either chat context. Chat list and detail roots own their dialog names, first useful focus, keyboard Escape handling, and real controls. ChatDrawer restores list focus to the opener, chat entry, or next window.
  Date/Author: 2026-09-01 / Codex.

- Decision: use controlled owned Dialogs for Invite and Terms.
  Rationale: the Dialog primitive provides named modal semantics and initial focus. Invite resets selection on close and restores its trigger. Terms calls `cancel()` for required consent close requests and only renders optional close actions when `allowClose` is true.
  Date/Author: 2026-09-01 / Codex.

- Decision: keep the three-window chat state model and model the visible chat containers as modeless dialogs.
  Rationale: users must keep as many as three independent windows visible and interact with the page or another window. Add accessible names, real buttons, local Escape handling, initial focus, and focus return. Do not add a modal focus trap to a modeless chat window.
  Date/Author: 2026-09-01 / Codex.

- Decision: preserve the normal root provider and overlay order exactly.
  Rationale: authentication, profile redirects, analytics identity, chat state, AI state, footer position, prompt behavior, notifications, and broadcast overlays depend on this composition. `PageShell` is a structural extraction, not a provider reorder.
  Date/Author: 2026-09-01 / Codex.
- Decision: integrate the root PageShell only around the existing normal growing region and footer.
  Rationale: this extracts the frame without changing provider order, feature flags, child order, scripts, or the overlay bypass. Keep prompt and Toaster as siblings after the shell.
  Date/Author: 2026-09-01 / Codex.

- Decision: use the owned primitives and semantic tokens delivered by issue #119.
  Rationale: shared shell code must import direct lowercase primitive modules such as `@/components/ui/button`, `@/components/ui/dialog`, and `@/components/ui/sheet`. Use semantic roles such as `background`, `foreground`, `muted`, `border`, `primary`, and `ring`. Do not add migration-only selectors or a second token system.
  Date/Author: 2026-09-01 / Codex.

- Decision: use behavior tests and real-browser review. Do not add visual or style tests.
  Rationale: tests must defend routes, state transitions, payloads, focus, keyboard actions, and rendered semantics. Class-name, color, spacing, screenshot, and pixel assertions make the migration brittle and do not prove behavior.
  Date/Author: 2026-09-01 / Codex.
- Decision: keep the feedback Sheet controlled and use the owned root action ref for close requests from the mounted form.
  Rationale: Base UI supplies `preventUnmountOnClose()` only to close events. Routing form Cancel and Done through the root action ref preserves the mounted form and lets the existing controlled `onClose` callback run once. A custom opener ref captures the closed-to-open active element before Sheet focus handling and restores it only on the open-to-closed transition when it remains connected.
  Date/Author: 2026-09-01 / Codex.

- Decision: preserve the current overlay levels unless a browser check proves a collision.
  Rationale: the current order is Toaster at z40, chat panels at z50, the chat entry at z60, AI and terms surfaces at z70, and the mobile application prompt at z1200. A change requires a recorded discovery, a Decision Log update, and a browser comparison.
  Date/Author: 2026-09-01 / Codex.
- Decision: use a controlled right-side owned Sheet for the AI drawer and keep its full-height z70 surface.
  Rationale: the Sheet replaces Mantine presentation components without changing `useAgentContext` or the existing open guard. A local opener ref captures focus on the closed-to-open transition, while `finalFocus={false}` lets the drawer restore focus only after a controlled close. Native layout keeps the message viewport, input state, confirmation transitions, and bounded textarea height.
  Date/Author: 2026-09-01 / Codex.
- Decision: use the in-flow root-segment loading fallback.
  Rationale: `AppLoading` must occupy the App Router segment instead of covering the footer and other mounted shell controls with a viewport overlay. This keeps covered controls out of hidden keyboard access during loading.
  Date/Author: 2026-09-01 / Codex.

- Decision: use a polite status without permanent busy suppression.
  Rationale: `Loading` keeps `role="status"` and `aria-live="polite"` and does not set `aria-busy` for the lifetime of the status. A permanent busy value can defer the message until unmount.
  Date/Author: 2026-09-01 / Codex.

- Decision: use a labelled error section with a text-only alert message.
  Rationale: `ErrorPresentation` labels a `role="region"` with its focused heading, puts only the message in `role="alert"`, and keeps the retry Button outside the alert. This gives assistive technology a clear message without announcing an interactive control as alert text.
  Date/Author: 2026-09-01 / Codex.

- Decision: use the user-authorized temporary non-development production runtime for the public browser gate.
  Rationale: The user authorized `issue120-prod-smoke` for the browser gate. It served `http://localhost:3100` with local PostgreSQL. The placeholder database URL was limited to the build's Prisma gates. This separates build validation from the local runtime used for authenticated/manual browser proof.
  Date/Author: 2026-09-01 / Codex.
 
- Decision: use a component-specific mobile Navigation width and fixed route icon slots.
  Rationale: the first live drawer measured 384/426 CSS px (90.1%) and was full width at 320px, which did not match the approved 56.7% reference intent. `min(16rem, calc(100vw - 3rem))` produces the verified 256px drawer and preserves stable route alignment; the active state uses a 3px primary rail, background, icon, and label.
  Date/Author: 2026-09-01 / Codex.
 
- Decision: restore SheetContent transition completion and cancel a pending mobile Feedback handoff when Navigation reopens.
  Rationale: the width/icon edit had temporarily dropped `onTransitionEnd`, forcing the 250ms fallback. Restoring the callback makes close sequencing deterministic and prevents a stale Feedback action or timer from firing after reopen.
 Date/Author: 2026-09-01 / Codex.

- Decision: apply the accepted universal responsive-layout contract to every consuming Route and Surface while keeping route-specific product content in its Layout Family.
  Rationale: Copied desktop and mobile references show one named viewport's hierarchy and visual intent. They are not fixed-size page canvases. Issue #120 owns shared-shell adaptation across every consuming Route, while each route-specific Surface keeps its Layout Family owner and must pass the same requirement in its own migration slice. The invariant is continuous adaptation from 320 CSS pixels through wide desktop, actual 200% browser reflow, no page-level two-dimensional scrolling, dynamic-viewport overlays, 44px targets where applicable, safe-area and reduced-motion support, and accessible keyboard and focus behavior. A product-owned table, map, or workspace may scroll horizontally only inside a bounded region. The page itself must not. This prevents silent scope expansion without weakening site-wide acceptance. The responsive decisions are recorded in [issue #117 comment 5502869377](https://github.com/Razumly/bracketiq/issues/117#issuecomment-5502869377) and [issue #120 comment 5502870392](https://github.com/Razumly/bracketiq/issues/120#issuecomment-5502870392).
  Date/Author: 2026-09-01 / Codex.

## Review Record

This record captures findings from the fixed base through review fixes, the final shared-shell browser proof, and the final Standards and Spec re-reviews. It records route-content findings separately. The final shared-shell Spec review passes. Each entry has a concise title, outcome, evidence, and current lifecycle. Static and public evidence do not count as route-specific product-content acceptance.

### Standards findings — root shell

- ROOT-STD-01 — Keep hidden shell controls out of the tab order (P2). The initial root fallback used a viewport overlay while the footer and other shell controls stayed mounted. `AppLoading` is now in-flow, and the root boundary proof confirms the status has no logo overlay. Lifecycle: `open → fixed → re-reviewed → verified`. Production and focused tests are verified.
- ROOT-STD-02 — Let the loading status announce before completion (P2). The initial status kept `aria-busy="true"` until unmount. `Loading` now uses `role="status"` and `aria-live="polite"` without permanent `aria-busy`; its focused test asserts the absence. Lifecycle: `open → fixed → re-reviewed → verified`. Production and focused tests are verified.
- ROOT-STD-03 — Keep the retry control outside the alert live region (P2). The initial error presentation put the heading, message, and retry control in one alert. `ErrorPresentation` now uses a labelled region, a focused heading, a text-only alert message, and a retry Button outside the alert. Lifecycle: `open → fixed → re-reviewed → verified`. Production and focused tests are verified.

### Standards findings — navigation and adjacent shell

- NAV-STD-01 — Sequence the mobile feedback Sheet handoff (P2). The initial batched close-and-open path could lose the feedback opener. Navigation now waits for the menu close and passes a connected fallback trigger; Navigation 22 and Feedback 16 tests cover the handoff. Lifecycle: `open → fixed → re-reviewed → verified`.
- NAV-STD-02 — Close the mobile Sheet at the desktop breakpoint (P2). The initial controlled portal could remain open after the trigger became hidden. Navigation now closes at the desktop breakpoint without focusing a hidden trigger. Lifecycle: `open → fixed → re-reviewed → verified`.
- NAV-STD-03 — Preserve Sheet safe-area insets (P2). The initial class merge could replace the owned Sheet inset padding. The current Navigation surface preserves the safe-area classes through the Base UI merge. Lifecycle: `open → fixed → re-reviewed → verified`.
- NAV-STD-04 — Exercise admin cancellation without public-viewer masking (P2). The initial stale-response test could mask the result with a public viewer. The current test uses two authenticated viewer states, an explicit settlement sentinel, and an admin-absence assertion. Lifecycle: `open → fixed → re-reviewed → verified`.
- NAV-STD-05 — Simulate a real desktop in the non-mobile test (P2). The initial prompt fixture used touch points that made a desktop user agent look mobile. The current desktop fixture uses zero touch points. Lifecycle: `open → fixed → re-reviewed → verified`.
- NAV-STD-06 — Isolate prompt tests from supported environment overrides (P2). The initial prompt tests inherited process configuration. The current fixture installs a deterministic environment baseline and restores it after each case. Lifecycle: `open → fixed → re-reviewed → verified`.
- NAV-STD-07 — Correct stale Navigation and Feedback proof descriptions (P2). Earlier proof records used outdated counts. The current proof and case descriptions record Navigation 22 and Feedback 16. Lifecycle: `open → fixed → re-reviewed → verified`.
- NAV-STD-08 — Restore the mobile Feedback transition completion callback (P2). The width/icon edit temporarily dropped `SheetContent`'s `onTransitionEnd`, so mobile Feedback relied on the 250ms fallback. The fix restores `onTransitionEnd` and cancels the pending Feedback action/timer if the menu reopens. Navigation focused proof is now 22/22 with deterministic transition and reopen-before-fallback tests. Lifecycle: `open → fixed → re-reviewed → verified`.
- NAV-STD-09 — Resolve the Navigation focus race when a native zoom change crosses the desktop breakpoint (P2). With the mobile drawer open at native 200%, changing to 100% closes the drawer, focuses the visible BracketIQ home control, and leaves the hidden trigger unfocused. Lifecycle: `open → fixed → composite re-reviewed → verified`.
- NAV-STD-10 — Reset Navigation state after an interrupted close transition (P2). The final fix resets the interrupted-close lifecycle. Standards re-review and the final composite verify the reset. Lifecycle: `open → fixed → composite re-reviewed → verified`.

### Shared-shell browser findings — fixed

- SHELL-BROWSER-01 — Return focus from Chat synchronously. The final Chat close path returns focus without waiting for a later task. Lifecycle: `open → fixed → browser re-reviewed → verified`.
- SHELL-BROWSER-02 — Correct Navigation dark/nav visual alignment. The final Navigation presentation matches the reviewed shell alignment. Lifecycle: `open → fixed → browser re-reviewed → verified`.
- SHELL-BROWSER-03 — Keep the mobile Chat launcher clear of footer and action controls. Navigation and MarketingHeader now provide a 44px Chat header portal. The final mobile review leaves the footer and actions unobscured. Lifecycle: `open → fixed → browser re-reviewed → verified`.
- SHELL-BROWSER-04 — Keep the mobile Chat conversation inside the viewport. The final conversation is stacked and contained at 320 and 426 CSS pixels. Lifecycle: `open → fixed → browser re-reviewed → verified`.
- SHELL-BROWSER-05 — Keep short-height drawers usable at native 200% zoom. The final mobile drawer has an internal scroller; AI and Feedback remain reachable after scroll, and Navigation, Chat, Feedback, and AI remain within the viewport. Lifecycle: `open → fixed → browser re-reviewed → verified`.
- SHELL-BROWSER-06 — Complete the AI mobile drawer handoff. The final handoff works in the shared shell. Lifecycle: `open → fixed → browser re-reviewed → verified`.

### Shared-shell reference review

- GLOBAL-REF-01 — Review the approved global Navigation references. The final review passes for the desktop bar and for the mobile header/drawer at 426 and 320 CSS pixels. Organization route shell, content, and state reference differences remain owned by [issue #122 comment 5503302029](https://github.com/Razumly/bracketiq/issues/122#issuecomment-5503302029), not #120. Lifecycle: `open → fixed → browser re-reviewed → verified`.

### Spec findings — navigation and adjacent shell

- NAV-SPEC-01 — Close the mobile Sheet at the desktop breakpoint. The current breakpoint effect closes the controlled Sheet and avoids hidden-trigger focus. Status: `verified`.
- NAV-SPEC-02 — Restore focus after mobile feedback closes. The current handoff uses the persistent menu trigger when the menu action disconnects, and the focused Navigation and Feedback cases cover the fallback. Status: `verified`.
- NAV-SPEC-03 — Increase the logo home-link target to 44 pixels. The current home link has the required target area without changing its destination. Status: `verified`.
- NAV-SPEC-04 — Let mobile prompt actions wrap at narrow widths. The current prompt action row can wrap at narrow widths while preserving both actions and their destinations. Status: `verified`.
- NAV-SPEC-05 — Keep landing-footer links legible on hover. The current landing-page footer override retains readable link contrast on hover. Status: `verified`.
- NAV-SPEC-06 — Match the approved mobile Navigation drawer and active-route treatment. The initial drawer was 384/426 CSS px (90.1%) at 426px and full width at 320px, which did not match the approved 56.7% reference intent. The fix uses component-specific width `min(16rem, calc(100vw - 3rem))`, fixed route icon slots, and an active 3px primary rail/background/icon/label. Final visual proof: 256px drawer; scrim 64px at 320, 134px at 390, and 170px at 426; rows 223x44; no overlap, wrapping, or overflow; the `global-navigation--open--mobile-853x1844.png` reference passes. Lifecycle: `open → fixed → browser re-reviewed → verified`.

### Standards findings — chat and feedback overlays

- CHAT-STD-01 — Unmount the feedback Sheet after its close transition (P1). The initial close path prevented unmount without completing the close action. The current Sheet forwards `keepMounted` to the portal, hides the closed popup and backdrop, and tests both hidden states. Status: `verified`.
- CHAT-STD-02 — Restore feedback focus when its opener disconnects (P2). The initial mobile handoff left no connected opener. The current drawer chooses a connected opener or fallback trigger, and Navigation and drawer tests cover it. Status: `verified`.
- CHAT-STD-03 — Hide close controls when the modal cannot close (P2). The initial Terms loading case exposed a dead close control without `onClose`. The current `canClose` gate controls the close handler, X button, and Not now action. Status: `verified`.
- CHAT-STD-04 — Associate feedback errors only with the affected field (P2). The initial global error flag marked valid fields invalid. The current form separates message and email validation errors from form errors, with focused cases for each. Status: `verified`.
- CHAT-STD-05 — Implement complete keyboard behavior for chat actions (P2). The initial action control declared menu semantics without a complete menu. The current disclosure uses native Tab order, stops Escape at the disclosure, and returns focus to its trigger. Status: `verified`.
- CHAT-STD-06 — Include unread status in each chat row name (P2). The initial row name hid the unread count behind an overriding label. The current accessible name includes the unread count, and the focused test asserts four unread messages. Status: `verified`.
- CHAT-STD-07 — Focus an enabled control while Terms loads (P2). The initial dialog focused a disabled Agree button. The current loading path focuses the Terms link and the ready path focuses Agree. Status: `verified`.
- CHAT-STD-08 — Assert the exact open-window sequence (P2). The initial context tests used substring matching for deduplication and eviction. The current tests use exact matching for every window state. Status: `verified`.

### Spec findings — chat and feedback overlays

- CHAT-SPEC-01 — Preserve the original chat-list opener. The current drawer captures the opener before the asynchronous list request and restores it after close. Status: `verified`.
- CHAT-SPEC-02 — Keep chat-list dismissal available during refresh. The current loading state keeps the close control and local Escape path available. Status: `verified`.
- CHAT-SPEC-03 — Stop chat animation for reduced motion. The current chat entry honors the reduced-motion preference while preserving the entry action. Status: `verified`.
- CHAT-SPEC-04 — Give the Terms link a 44-pixel target. The current Terms link has the required target area without changing its destination. Status: `verified`.
- CHAT-SPEC-05 — Remove the prohibited mobile pixel and style assertion. The final chat regression uses behavior-only coverage. Status: `verified`.

### Standards findings — AI assistant

- AI-STD-01 — Keep the Sheet initial-focus target focusable. The current initial-focus callback returns the textarea only when it is an enabled textarea and otherwise lets Base UI choose a target. Status: `verified`.
- AI-STD-02 — Preserve Sheet safe-area padding. The current AI Sheet retains the owned safe-area padding while using the right-side surface. Status: `verified`.
- AI-STD-03 — Wrap unbroken message content before the Card clips it. The current message card wraps long content before overflow can clip it. Status: `verified`.
- AI-STD-04 — Resolve overlay focus to a visible launcher (P2). Overlay close now rejects connected but hidden or disabled candidates and resolves a visible launcher. Native zoom-crossing browser proof passes desktop Feedback to 200% mobile and mobile AI to 100% desktop. Lifecycle: `open → fixed → browser re-reviewed → verified`.

### Spec findings — AI assistant

- AI-SPEC-01 — Focus an enabled element when the drawer opens. The current drawer defers focus until the first load state is usable and falls back when the textarea is disabled. Status: `verified`.

- ROOT-SPEC-01 — Complete the separate final Spec review for the shared shell. The authenticated/manual matrix, native 200% proof, and shared reference review are complete. Route-content findings remain owned by [#121 comment 5503302025](https://github.com/Razumly/bracketiq/issues/121#issuecomment-5503302025), [#122 comment 5503302029](https://github.com/Razumly/bracketiq/issues/122#issuecomment-5503302029), [#123 comment 5503302031](https://github.com/Razumly/bracketiq/issues/123#issuecomment-5503302031), and [#127 comment 5503302032](https://github.com/Razumly/bracketiq/issues/127#issuecomment-5503302032). Status: `verified`; final Spec re-review passes with no unresolved findings for the shared shell.
- ROOT-SPEC-02 — Bring the living ExecPlan up to date. This update records the final loading and error contracts, final static proof, local-PostgreSQL runtime boundary, authenticated/manual and responsive matrix, native 200% proof and restoration, review lifecycles, and route-content findings. Lifecycle: `open → fixed → re-reviewed → verified`.

All Standards findings above are verified and all Standards axes pass. The shared-shell browser and responsive axes pass. The final shared-shell Spec axis also passes with no unresolved findings. Route-specific product content remains owned by later issues.

## Outcomes & Retrospective

The final static proof passes: the exact 19-suite command produced 19/19 suites, 142/142 tests, 0 snapshots, and no warnings or open handles; TypeScript exited 0 with zero diagnostics; changed-file lint exited 0 for 36 changed site files with zero errors or warnings; and the placeholder-database production build exited 0 through Prisma validate, generate, and check, Next.js 16.2.9, and 127/127 static pages without a real database connection.

The final production runtime is `issue120-prod-smoke` at `http://localhost:3100` with local PostgreSQL. The authenticated/manual shared-shell matrix covered 34 routes at 320, 390, 768, 1024, and 1536 CSS pixels and equivalent reflow conditions. It found no shared-shell overflow. The final shared reference review passes for the desktop bar and the mobile header/drawer at 426 and 320. Organization route shell, content, and state reference differences remain owned by #122.

Native Chrome Page zoom was set to 200% through `chrome://settings`. The physical viewport was 1536x1024, the CSS viewport was 768x512, and DPR was 2. The final drawer internal scroller measured 443 client and 681 scroll. AI and Feedback were reachable after scroll. Navigation, Chat, Feedback, and AI stayed within the viewport, and the page measured 768/768. Chrome was restored to 100% Page zoom, DPR1, and 1536/1536 physical/CSS viewport. The actual zoom evidence is [issue comment 5503403469](https://github.com/Razumly/bracketiq/issues/120#issuecomment-5503403469).

The responsive matrix recorded route-content findings for later issues: `/discover` +16 CSS pixels at 320 in [#121 comment 5503302025](https://github.com/Razumly/bracketiq/issues/121#issuecomment-5503302025), Organization tab clipping in [#122 comment 5503302029](https://github.com/Razumly/bracketiq/issues/122#issuecomment-5503302029), Organization Events +16 CSS pixels at 320 in [#123 comment 5503302031](https://github.com/Razumly/bracketiq/issues/123#issuecomment-5503302031), and `/my-schedule` +16 CSS pixels at 320 in [#127 comment 5503302032](https://github.com/Razumly/bracketiq/issues/127#issuecomment-5503302032). These findings are not #120 shared-shell failures. Organization route shell, content, and state reference differences remain owned by #122.

The live review fixed synchronous Chat focus return, Navigation dark/nav visual alignment, mobile Chat launcher obstruction through the 44px Navigation and MarketingHeader header portal, mobile Chat conversation offscreen placement through stacked and contained layout at 320 and 426, short-height drawer clipping through native-200% internal scrolling, and the AI mobile drawer handoff. The later review fixed the Navigation breakpoint focus race, interrupted-close reset, and overlay focus candidate handling. Standards and Spec re-reviews pass with no unresolved findings. Issue #120 remains open and uncommitted.

## Context and Orientation

### Governing issue, claim, and references

The governing issue is [GitHub issue #120](https://github.com/Razumly/bracketiq/issues/120). At plan authoring time it is open. It is assigned to `@camka14`. It has labels `enhancement`, `ready-for-agent`, and `area: web`. All ten issue checklist items are open. Treat the assignee as the current claim. Recheck this state before implementation. Do not change issue metadata as part of this plan unless a separate current instruction authorizes it.

The issue #120 approval comment is [issue comment 5485552665](https://github.com/Razumly/bracketiq/issues/120#issuecomment-5485552665). It approves the shared catalog at [docs/images/site-ui](https://github.com/Razumly/bracketiq/tree/workstream/site-ui/docs/images/site-ui). The release-owner mobile approval is [issue comment 5498456003](https://github.com/Razumly/bracketiq/issues/133#issuecomment-5498456003). It names commit `e720f540764628272e339aec31259789ddda5c50` and requires use of the images without resizing.

Use these exact canonical repository paths:

- `docs/images/site-ui/management-shell/organization-overview--default--desktop-1536x1024.png`
- `docs/images/site-ui/management-shell/global-navigation--open--mobile-853x1844.png`
- `docs/images/site-ui/management-shell/organization-sections--open--mobile-853x1844.png`
- `docs/images/site-ui/management-shell/organization-overview--default--mobile-852x1846.png`
- `docs/images/site-ui/management-shell/organization-overview--loading--mobile-853x1844.png`
- `docs/images/site-ui/management-shell/organization-overview--network-error--mobile-853x1844.png`
- `docs/images/site-ui/management-shell/organization-overview--permission-denied--mobile-853x1844.png`
- `docs/images/site-ui/management-shell/organization-overview--empty--mobile-853x1844.png`

The desktop file is part of the issue #120 approved catalog. The seven mobile files are the exact files approved in issue #133. These references define hierarchy, density, visual roles, mobile navigation, and shell states. They do not authorize a route, permission, copy, or behavior change.

A desktop or mobile reference is one sample state, not a fixed canvas. Copied references define hierarchy and visual intent at their named viewport. They do not authorize fixed-size page canvases. Every Route and Surface must adapt continuously from 320 CSS pixels through wide desktop, reflow at actual 200% browser zoom, avoid page-level two-dimensional scrolling, keep overlays in the dynamic viewport, keep 44px touch targets where applicable, honor safe areas and reduced motion, and preserve accessible keyboard and focus behavior. A product-owned table, map, or workspace may scroll horizontally only inside a bounded region. The page itself must not. Verify representative mobile, tablet, desktop, direct 320px, and actual 200% zoom for every migration slice.

Issue #120 owns the shared shell's responsive behavior across every consuming Route. Route-specific product content stays owned by its Layout Family and must meet the same universal requirement in its own migration slice. This scope boundary does not silently expand #120 into a route-content rewrite.

### Terms used in this plan

The **global shell** is shared presentation around route-owned product content. It includes the root page frame, shared Navigation component, footer, profile redirect gate, mobile application prompt, chat entry and windows, AI drawer, shared loading and error states, and the overlays reached from these surfaces.

A **Surface** is one user-visible area with one behavior owner. The capitalized term matches issue #120. A **primitive** is a low-level owned control in `apps/site/src/components/ui`, such as Button, Dialog, Sheet, Input, or Card.

A **page-shell seam** is the `PageShell` interface that owns the root column, the full-width safe-shrinking content region, and the footer slot. Route-specific content width remains owned by its Layout Family and is not part of this global-shell issue. The shared shell still must adapt across every consuming Route.

A **modeless dialog** is a named floating window that does not trap focus. The user can interact with another chat window or with the page while it is open. It still needs a dialog role, an accessible name, keyboard close behavior, and focus return.

A **route contract** is the current URL and App Router ownership. An **HTTP contract** is the current method, path, request body, response handling, and error behavior. Neither contract changes in this work.

### Root composition and preserved state

`apps/site/src/app/layout.tsx` exports `RootLayout` and re-exports `metadata` and `viewport`. The normal branch imports Mantine core and date styles. It renders this order:

1. `MantineProvider` with the current theme.
2. `Providers`, which owns authentication, session loading, guest state, profile-completion state, user profile, and the Team cache.
3. `ProfileCompletionGate` in `Suspense` with a null fallback.
4. `PostHogIdentity`.
5. The flex column that has a growing content region and `SiteFooter` after it.
6. `AgentProvider` inside the growing region.
7. Either route children alone when `NEXT_PUBLIC_DISABLE_CHAT=1`, or `ChatProvider`, then `ChatUIProvider`, then route children and `ChatComponents`.
8. `AIAssistantDrawer` under `AgentProvider`.
9. `MobileAppPrompt` after the flex column.
10. The owned Sonner `Toaster` after the prompt.

The `OPENAI_AGENT_ENABLED` values `0`, `false`, `off`, and `disabled` disable the agent. Keep this interpretation.

When request header `x-bracketiq-surface` equals `overlay`, `RootLayout` returns the overlay `html`, the `broadcast-overlay-body`, and route children only. It skips all providers and shared UI. Preserve the font classes in both branches. Preserve the Google Analytics scripts after `body` in the normal document.

Do not edit `apps/site/src/app/providers.tsx`. Its `Providers`, `useApp`, session fetch, guest-session reset, user hydration, profile flags, and Team cache are behavior contracts. Do not edit authentication services, session routes, Team services, or route handlers.

### The ten issue surfaces

#### Desktop application navigation

`apps/site/src/components/layout/Navigation.tsx` owns the shared desktop and mobile navigation. Desktop users see Info at `/info`, Guides at `/guides`, Discover at `/discover`, My Organizations at `/organizations`, My Schedule at `/my-schedule`, and the mobile application link at `/mobile-app`. Authenticated users see profile, feedback, and AI actions. Public users see Login and Signup. The logo uses `getHomePathForUser` from `apps/site/src/lib/homePage.ts`.

Preserve exact-path and descendant-path active behavior. Preserve the `/profile` and `/mobile-app` active states. Preserve the auth-loading null result. Preserve the cancellable `/api/admin/access` request and show admin access only to the current authenticated, non-public viewer. Keep links as links. Use the owned Button only for actions.

#### Mobile application navigation

The same `Navigation` component owns the mobile menu. Preserve `isMenuOpen`, `aria-expanded`, `aria-controls="mobile-navigation-menu"`, item order, authenticated and public branches, and close-on-link behavior. Keep profile, application, feedback, and route items in the authenticated menu. Keep Login and Signup in the public menu. Give each action a 44 by 44 CSS-pixel target. Keep focus visible. Return focus to the menu button when the menu closes through Escape or its close control.

Do not edit the fifteen route callers only to apply this migration. They are admin constants, admin dashboard, admin user detail, discover, event schedule, create-event schedule view, feedback, my schedule, onboarding, organizations, organization detail, organization claim, profile, team management, and `ManageTeams`. Exercise representative callers in the browser after the shared component changes. Issue #120 owns the shared shell's responsive behavior across every consuming Route. Route-specific product content remains owned by its Layout Family and is not rewritten here.

#### Page shell and route content ownership

Create `apps/site/src/components/layout/PageShell.tsx`. It owns one export. `PageShell` owns the root `min-h-screen` flex column, the full-width growing content region that can safely shrink with `min-w-0`, and the footer slot. Route-specific containers remain product-owned.

Use this exact public contract:

    export interface PageShellProps extends React.ComponentPropsWithoutRef<'div'> {
      footer: React.ReactNode;
    }

    export function PageShell(props: PageShellProps): React.JSX.Element;

`PageShell` must render the content region before the supplied footer. It must merge caller classes with `cn` from `@/lib/utils`. It must use semantic token classes. It must not know about Navigation, a route, Mantine, authentication, or product data.

Adopt `PageShell` only in `RootLayout`. Keep `apps/site/src/app/organizations/[id]/page.tsx` at the fixed base: retain its original Mantine `Container` import and `<Container fluid py="xl" className="discover-shell org-page-shell">` wrapper. The organization route-specific maximum width remains product-owned and outside issue #120. Keep `Navigation` before it. Keep all organization product content and modals unchanged. Do not migrate another route-specific `Container` or introduce a shared content-width wrapper in this issue.

Issue #120 owns the shared shell's responsive behavior across every consuming Route. It does not rewrite route-specific product content. Each route's Layout Family owns that content and must meet the same universal responsive requirement in its own migration slice.

#### Global footer

`apps/site/src/components/layout/SiteFooter.tsx` is a root-only footer. Keep the dynamic year. Keep the brand text and these exact destinations: Events `/find-events`, Clubs `/find-clubs`, Facilities `/find-facilities`, Guides `/guides`, Blog `/blog`, Privacy Policy `/privacy-policy`, Feedback `/feedback`, Terms and EULA `/terms`, Delete Data `/delete-data`, and `mailto:support@bracket-iq.com`. Keep the existing landing-page override in `globals.css` that applies through `body:has(.landing-root)`. Use semantic tokens for the default footer. Make footer links usable as 44px targets without changing an href.

#### Profile-completion gate

`apps/site/src/components/auth/ProfileCompletionGate.tsx` renders no visual UI. Keep it behavior-only. Preserve the internal `safeNextPath` rules. A safe value starts with one slash. It is not `//`, `/login`, or `/complete-profile`. It has no control character. Preserve the current query string when an incomplete authenticated user redirects to `/complete-profile?next=...`. Preserve the `/complete-profile` exemption. When a completed user leaves that route, use a safe `next`, then `getHomePathForUser(user)`, then `/discover` as the fallback. Do nothing while loading, for a guest, for a signed-out user, or without a pathname.

Do not add a visual profile overlay. Add focused redirect behavior tests because this gate has no current focused suite.

#### Mobile application prompt

`apps/site/src/components/layout/MobileAppPrompt.tsx` is root-only. Replace Mantine Button, Group, Paper, and Text with the owned Button, Card or a semantic panel, and native layout and text. Preserve these contracts:

- Suppress the prompt on `/` and `/onboarding`.
- Suppress it when `NEXT_PUBLIC_SHOW_APP_PROMPT=0`.
- Suppress it in standalone or installed application display mode.
- Suppress the custom prompt for iOS Safari because the native smart application banner owns that case.
- Show it for Android and non-Safari iOS user agents.
- Read and write `mvp_mobile_app_prompt_dismissed_until` in localStorage.
- Keep a seven-day dismissal.
- Keep the zero-delay visibility timer.
- Keep the store URL selection from `getMobileAppLinks` in `apps/site/src/lib/mobileAppLinks.ts`.
- Keep the deep-link assignment and the 1.2-second store fallback.

Keep the panel role and 520px maximum width, but let its bounds adapt to the dynamic viewport and avoid page-level scrolling. Keep the current collision level unless browser evidence requires a Decision Log update. Use 44px controls. Keep iOS App Store identifier `6746649739`, Play Store identifier `com.razumly.mvp`, default iOS deep link `mvp://discover`, and default Android deep link `razumly://mvp`.

#### Global chat entry and container

`apps/site/src/components/chat/ChatComponents.tsx` suppresses chat while authentication loads, for signed-out and guest sessions, and on `/`, `/request-demo`, `/blog` and descendants, and `/guides` and descendants. Preserve this gate.

`apps/site/src/components/chat/ChatDrawer.tsx` owns the body portal, the two-second open-window poll, the 30-second silent inactive-group refresh, unread aggregation, list loading, up to three visible windows, floating Lottie entry, unread badge capped at `99+`, and `TermsConsentModal`. Preserve all intervals, conditions, and callbacks. Keep the list open action after `loadChatGroups` resolves. Keep list opening independent from terms consent. Keep terms agreement as a separate user action.

`apps/site/src/components/chat/ChatList.tsx` owns group selection, unread state, invite, rename, report, leave or hide, action-menu isolation, and window close actions. Replace clickable group-row divs with real buttons or links as appropriate. Keep `window.prompt` and `window.confirm` behavior in this issue. Give every icon-only action a specific accessible name.

`apps/site/src/components/chat/ChatDetail.tsx` owns older-message loading near the top, scroll-position preservation after prepend, initial and appended-message bottom scroll, trimmed send, blocked-send draft retention, successful-send clearing, and close-by-chat-id. Preserve all behavior. Give the close button a specific accessible name.

`apps/site/src/context/ChatUIContext.tsx` keeps `ChatUIProvider`, `useChatUI`, and `MAX_OPEN_CHATS = 3`. Keep the context shape. Preserve deduplication, oldest-window eviction, list state, invite state, and floating-button visibility. Add focused transition tests. Do not store DOM nodes in this context.

`apps/site/src/context/ChatContext.tsx` keeps `ChatProvider`, `useChat`, `ChatMessagePaginationState`, state reset on `user.$id`, terms state, 20-message descending preload, last-activity ordering, local read state, send, create, report, hide, and group update behavior. Do not change its public shape or its service calls.

Preserve these chat HTTP paths and their current methods, bodies, and error handling: `/api/chat/groups`, `/api/chat/groups/:id/messages`, `/api/chat/groups/:id/messages/read`, `/api/messages`, `/api/messaging/topics/:id/messages`, `/api/chat/terms-consent`, `/api/moderation/reports`, and the current group PATCH paths.

Migrate `apps/site/src/components/chat/InviteUsersModal.tsx` from Mantine Modal, TextInput, Button, Group, Paper, Avatar, Text, Alert, and ScrollArea. Remove the unused Alert import. Use the owned Dialog, Input, Button, Card, Avatar, Field family, and native overflow layout. Preserve the 300ms search debounce after two characters. Preserve selected-user filtering, close reset, default one-to-one or group name, initials image, `MOBILE_APP_THEME_TOKENS.primary`, and `createChatGroup`. Make each result a keyboard-operable selection control. Focus the search input on open. Restore focus to the invite trigger on close.

Migrate `apps/site/src/components/moderation/TermsConsentModal.tsx` to the owned controlled Dialog and Button. Preserve title, intro, summary, terms link, save state, callback order, and the optional X and Not now controls. Pass `showCloseButton={allowClose}` to `DialogContent`. When `allowClose=false`, keep the controlled dialog open when Base UI requests a close from Escape or outside interaction. Omit the X and Not now controls. When `allowClose=true`, close through the X, Not now, and Escape according to the existing callback. Restore focus when a trigger exists.

Keep chat list and chat detail windows modeless. Add `role="dialog"` and `aria-labelledby` with stable IDs. Do not set `aria-modal="true"`. Focus the first useful control when a window opens. Handle Escape only while focus is inside the applicable list or chat window. Close that one surface only. Return focus to the connected element that opened it. If that element no longer exists, return focus to the chat entry or the next open chat window. Do not trap focus. Keep all three windows independently usable. Keep the current visual dimensions where they fit, but constrain each window to the dynamic viewport and reflow its content at narrow widths. Do not create page-level horizontal or two-dimensional scrolling.

#### AI assistant drawer

`apps/site/src/components/agent/AIAssistantDrawer.tsx` is always mounted under `AgentProvider`. Navigation controls whether an authenticated user sees its trigger. Replace Mantine Alert, Badge, Button, Divider, Drawer, Group, Paper, ScrollArea, Stack, Text, and Textarea with owned Sheet, Badge, Button, Separator, Card, Textarea, Field error semantics, and native layout and overflow.

Preserve the controlled `isOpen` state from `useAgentContext`. Preserve the disabled environment message, the intro message, pending confirmations, error state, scroll-to-bottom behavior, page context, signed-in or guest footer, and new-chat behavior. Preserve Enter-to-send and Shift+Enter-to-insert-a-line. Give the native textarea a bounded responsive minimum and maximum height because the owned Textarea has no Mantine autosize API.

Preserve these calls exactly:

- Open load: `GET /api/agent/chat` once after the first open. Keep the component-level `loaded` guard, so close and reopen does not load the conversation again.
- New chat: `POST /api/agent/chat/new`.
- Send: `POST /api/agent/chat` with `{ message, pageContext }`.
- Confirmation: `POST /api/agent/chat/confirm` with `{ confirmationId, confirmed, pageContext }`.

Preserve client-action dispatch, the active-page refresh callback, pending confirmation transitions, and recoverable error messages. Do not change `apps/site/src/context/AgentContext.tsx`. Do not change the refresh and client-action registrations in `apps/site/src/app/events/[id]/schedule/page.tsx`.

Use a right-side owned Sheet. Keep the current full-height behavior and z70 relationship. Capture the focused opener when the drawer opens. Restore it after any close if it is still connected. Use Sheet focus handling for the open surface.

#### Shared global loading and error presentation

Keep the default `Loading` export in `apps/site/src/components/ui/Loading.tsx`. Keep this prop API:

    interface LoadingProps {
      size?: 'sm' | 'md' | 'lg';
      text?: string;
      fullScreen?: boolean;
      belowNavigation?: boolean;
    }

Keep inline and full-screen modes for existing callers. Keep the logo. Keep caller-supplied text. Keep z40 when `belowNavigation` is true and z50 otherwise. Add an accessible status name and `role="status"` with `aria-live="polite"`. Do not set a permanent busy flag on the status. Stop spinner motion under `prefers-reduced-motion: reduce` without hiding the loading message.

Create `apps/site/src/app/loading.tsx`. Its default `AppLoading` function must render `Loading` with the stable text `Loading page...` in the root segment's normal flow. Do not pass `fullScreen`. This keeps the fallback inside the route segment instead of covering mounted shell controls, so no covered control remains keyboard reachable behind the loading surface. Do not change any of the 18 current Loading callers.

Create `apps/site/src/components/ui/ErrorPresentation.tsx` with this public contract:

    export interface ErrorPresentationProps {
      title?: string;
      message?: string;
      retryLabel?: string;
      onRetry: () => void;
    }

    export function ErrorPresentation(props: ErrorPresentationProps): React.JSX.Element;

Use the default title `Something went wrong`. Use the default message `We could not load this page. Try again.` Use the default retry label `Try again`. Render a `section` with `role="region"` and `aria-labelledby` pointing to its heading. Focus the heading when the error presentation mounts. Put only the message in a text-only `p` with `role="alert"`. Keep the owned retry Button outside the alert. Call `onRetry` once for each retry activation.

Create `apps/site/src/app/error.tsx` as a client component. Its default `AppError` signature must be compatible with App Router:

    export default function AppError({
      error,
      reset,
    }: {
      error: Error & { digest?: string };
      reset: () => void;
    }): React.JSX.Element;

Pass `reset` to `ErrorPresentation`. Do not show the raw error message, stack, or digest to the user. Do not change a route contract. Do not replace local permission, empty, validation, or network-error states with this boundary.

#### Global dialogs, drawers, and focus management

Use `apps/site/src/components/ui/dialog.tsx` for Invite and Terms. Use `apps/site/src/components/ui/sheet.tsx` for Feedback and AI. Use owned Button, Input, Textarea, Checkbox, Avatar, Badge, Card, Separator, Field, and RadioGroup modules as their current contracts require. Use AlertDialog only for a real destructive confirmation. Do not use it as a general modal.

Preserve FeedbackDrawer `keepMounted` behavior, one analytics event per closed-to-open transition, right-side 520px width, draft retention across close and reopen, and reset only after Done. Preserve each controlled callback. Preserve Invite reset and focus behavior. Preserve AI full-height scroll and input state. Preserve Terms `allowClose=false`. Preserve modeless chat windows.

The root trigger can live outside a controlled Sheet. In that case, capture `document.activeElement` only on the closed-to-open transition. Restore focus only on the open-to-closed transition. Check `isConnected` before focus. Do not change a context API only to store a DOM element.

### Feedback behavior

`apps/site/src/components/feedback/FeedbackDrawer.tsx` is called only by Navigation. Keep its current public controlled-state and draft contract unless the shared caller and tests are migrated in the same milestone. Keep `FeedbackFormDraft` in the parent. Keep the form mounted while the drawer is closed. Keep `trackFeedbackOpened` at one event per open transition. Keep the right-side width at `min(100vw, 520px)`. Keep Done close and form-key reset behavior.

`apps/site/src/components/feedback/FeedbackForm.tsx` is also used by `apps/site/src/app/feedback/FeedbackPageClient.tsx`. Keep that standalone caller working. Preserve late authenticated-email prefill, Bug and Idea context fields, the General omission behavior, the honeypot, 10-to-5000 character validation, contact consent, current path and viewport capture, recoverable errors, success confirmation, copy action, Send another, and analytics. Preserve `POST /api/feedback` and its current payload. Replace SegmentedControl with the owned RadioGroup or an equivalent single-choice primitive. Keep one programmatic label for each field.

### Exact implementation ownership

Create only these permanent source modules:

- `apps/site/src/components/layout/PageShell.tsx`: `PageShell` and `PageShellProps`.
- `apps/site/src/components/ui/ErrorPresentation.tsx`: `ErrorPresentation` and `ErrorPresentationProps`.
- `apps/site/src/app/loading.tsx`: default `AppLoading`.
- `apps/site/src/app/error.tsx`: default `AppError`.

Modify only these existing production files for the shell implementation:

- `apps/site/src/app/layout.tsx`: `RootLayout` normal shell extraction only. Keep theme, providers, feature flags, overlay branch, metadata, viewport, fonts, and scripts.
- `apps/site/src/app/organizations/[id]/page.tsx`: preserve the original outer Mantine `Container` import and wrapper from the fixed base. Its route-specific maximum width and product Surfaces remain owned by their Layout Family and outside issue #120. Those Surfaces must meet the universal responsive requirement in their own migration slices. Do not change organization product code.
- `apps/site/src/components/layout/Navigation.tsx`: desktop and mobile shared markup, semantic tokens, targets, menu focus, transitive feedback trigger behavior, and the 44px mobile Chat header portal shared with `apps/site/src/components/marketing/MarketingHeader.tsx`.
- `apps/site/src/components/marketing/MarketingHeader.tsx`: `MarketingMobileControls` and its 44px mobile Chat header portal, which keeps the footer and actions unobscured.
- `apps/site/src/components/layout/SiteFooter.tsx`: semantic shell presentation and targets.
- `apps/site/src/components/auth/ProfileCompletionGate.tsx`: behavior changes only if a focused test exposes a current contract defect. A presentation change is not permitted.
- `apps/site/src/components/layout/MobileAppPrompt.tsx`: Mantine removal and preserved prompt behavior.
- `apps/site/src/components/ui/Loading.tsx`: accessible and reduced-motion presentation with the same API.
- `apps/site/src/components/feedback/FeedbackDrawer.tsx`: owned Sheet migration and focus return.
- `apps/site/src/components/feedback/FeedbackForm.tsx`: owned form primitives and preserved request behavior.
- `apps/site/src/components/chat/ChatComponents.tsx`: semantic markup only if required by the shared container. Keep its gate.
- `apps/site/src/components/chat/ChatDrawer.tsx`: semantic modeless containers, focus bookkeeping, targets, and preserved timers and state calls.
- `apps/site/src/components/chat/ChatList.tsx`: keyboard-operable rows, names, semantic tokens, and preserved actions.
- `apps/site/src/components/chat/ChatDetail.tsx`: names, keyboard behavior, semantic tokens, and preserved message behavior.
- `apps/site/src/components/chat/InviteUsersModal.tsx`: owned Dialog and controls.
- `apps/site/src/components/moderation/TermsConsentModal.tsx`: owned Dialog and controls.
- `apps/site/src/components/agent/AIAssistantDrawer.tsx`: owned Sheet and controls.

Modify or create only focused tests beside these owners:

- `apps/site/src/app/__tests__/shell-boundaries.test.tsx`.
- `apps/site/src/components/layout/__tests__/Navigation.test.tsx`.
- `apps/site/src/components/layout/__tests__/SiteFooter.test.tsx`.
- `apps/site/src/components/layout/__tests__/MobileAppPrompt.test.tsx`.
- `apps/site/src/components/auth/__tests__/ProfileCompletionGate.test.tsx`.
- `apps/site/src/components/ui/__tests__/Loading.test.tsx`.
- `apps/site/src/components/ui/__tests__/ErrorPresentation.test.tsx`.
- `apps/site/src/components/feedback/__tests__/FeedbackDrawer.test.tsx`.
- `apps/site/src/components/feedback/__tests__/FeedbackForm.test.tsx`.
- `apps/site/src/components/chat/__tests__/ChatComponents.test.tsx`.
- `apps/site/src/components/chat/__tests__/ChatDrawer.test.tsx`.
- `apps/site/src/components/chat/__tests__/ChatList.test.tsx`.
- `apps/site/src/components/chat/__tests__/ChatDetail.test.tsx`.
- `apps/site/src/components/chat/__tests__/InviteUsersModal.test.tsx`.
- `apps/site/src/components/moderation/__tests__/TermsConsentModal.test.tsx`.
- `apps/site/src/context/__tests__/ChatUIContext.test.tsx`.
- `apps/site/src/components/agent/__tests__/AIAssistantDrawer.test.tsx`.

Reuse `apps/site/src/components/ui/__tests__/overlays.test.tsx` as the owned primitive proof. Remove `renderWithMantine` only from a focused shell test that no longer renders a Mantine caller. Keep `apps/site/test/utils/renderWithMantine.tsx` because unrelated tests still use it.

### Non-goals

Do not remove Mantine dependencies, the root Mantine provider, either global Mantine stylesheet, the Mantine primary scale, existing Mantine global selectors, or the shared Mantine test helper. Do not migrate an unrelated route Container, route form, date control, event-type Modal, organization product control, profile form, or management tab. Do not edit the separate event-type Mantine Modal in the event schedule page.

Do not change `Providers`, `ChatContext`, `ChatUIContext`, or `AgentContext` public interfaces. Add transition tests for `ChatUIContext`, but do not replace its state model. Do not change authentication, session, Team, navigation routes, permissions, API handlers, service methods, database code, analytics event names, or HTTP payloads.

Do not add a migration wrapper selector, a route-scoped redesign flag, a duplicate token set, a visual regression test, a style assertion, or a screenshot assertion. Do not edit canonical images. Do not change mobile application code. Do not change GitHub metadata without separate current authorization.

Every consuming Route remains in scope for consuming the shared shell behavior. Route-specific product content does not move into this issue. Its Layout Family owns its migration and its responsive proof.

## Plan of Work

### Milestone 1: establish the shared shell, loading, and error seams

Start with files that have no product-state overlap. Create `PageShell.tsx`, `ErrorPresentation.tsx`, `app/loading.tsx`, and `app/error.tsx`. Update `Loading.tsx`. Keep the organization overview at the fixed base, including its existing route-specific `Container`. Keep the root layout unchanged until Milestone 6.

Add behavior tests for Loading status text, reduced-motion-safe semantics, the in-flow root fallback, ErrorPresentation labelled-region focus and retry behavior, and the App Router reset path. Do not assert class names, z-index values, widths, colors, or screenshots. A test can assert the main or labelled-region landmark and the text-only alert message because those are accessibility contracts.

This milestone is complete. The current root proof covers 3 suites and 10 tests with no open handles. The root boundary test proves the in-flow loading component and the resettable error path.

### Milestone 2: migrate feedback as one transitive unit

Change `FeedbackDrawer.tsx` and `FeedbackForm.tsx` together. First keep or extend existing behavior tests. Then replace Mantine Drawer with the owned Sheet. Replace Mantine form controls with owned controls. Keep the drawer mounted while closed. Keep draft ownership above the form. Record the opener on the open transition and restore it on close.

Run only `FeedbackDrawer.test.tsx` and `FeedbackForm.test.tsx` during this milestone. The tests prove analytics transition count, draft persistence, keyboard close, focus return, validation, late email, payload, recoverable error, success, Done, copy, and Send another behavior. They do not inspect Mantine or BracketIQ classes. No focused `FeedbackPageClient` test exists; its unchanged props are covered by the standalone form render.

This milestone is complete: both feedback callers retain their public contracts, and neither feedback component imports Mantine.

### Milestone 3: migrate chat presentation and focus without changing chat state

Start with `InviteUsersModal` and `TermsConsentModal`. Give each an owned Dialog. Add focused tests for open focus, close reset, Escape policy, `allowClose=false`, save behavior, and focus return. Preserve invite search and group creation behavior.

Next add `ChatUIContext` tests for list state, duplicate windows, three-window ordering, fourth-window eviction, invite state, and floating-button visibility. Keep the context implementation unchanged unless a test proves a real contract defect.

Then update `ChatDrawer`, `ChatList`, and `ChatDetail`. Add modeless dialog roles and stable names. Convert row and icon actions to real controls. Add local Escape handling and focus bookkeeping. Preserve portal creation, all timers, unread behavior, loading, scrolling, message drafts, and action isolation. Keep `ChatComponents` route and auth gates.

Run the seven chat and moderation suites for this milestone. Use fake timers only where the existing interval and debounce contracts require them. Restore real timers after each test. This milestone is complete when three simultaneous windows remain usable, a fourth evicts the oldest, focus returns after close, every action has a name, and no migrated chat overlay imports Mantine.

### Milestone 4: migrate the AI assistant drawer

Extend `AIAssistantDrawer.test.tsx` before changing presentation. Cover closed no-load, open GET once, new chat, send body, confirmation body, pending state removal, client-action dispatch, active-page refresh, error recovery, disabled state, Enter send, Shift+Enter newline, close, and focus return. Mock only the internal fetch boundary and Agent context. Do not mock a third-party provider.

Replace Mantine Drawer with the owned right Sheet. Replace each other Mantine presentation import with the named owned primitive or native semantic layout. Keep all state and request code. Keep event schedule registration untouched.

Run the AI suite and the existing Markdown message suite. This milestone is complete when the request and keyboard tests pass, the drawer has no Mantine import, and the real event page still typechecks against the unchanged Agent context.

### Milestone 5: migrate navigation, footer, profile-gate proof, and prompt

Migrate `Navigation.tsx` only after feedback no longer needs Mantine. Keep every route caller unchanged. Use semantic tokens and owned action buttons. Keep link semantics. Add the missing admin request, active descendant, mobile close, keyboard, and focus-return behavior to the focused suite. Remove the MantineProvider wrapper from this test only when the rendered Navigation tree no longer needs it.

Update `SiteFooter.tsx` without changing any destination. Add profile-gate behavior tests without adding UI. Migrate `MobileAppPrompt.tsx` from Mantine. Add rendered tests for reveal, seven-day dismissal, localStorage, platform label and URL, deep link, and 1.2-second fallback. Preserve pure gate tests.

Run the four focused areas after each owner is complete. This milestone is complete when desktop and mobile Navigation retain all branches, the footer destinations are unchanged, the profile redirect matrix passes, the prompt timers and URLs pass, and these completed shell components have no Mantine imports.

### Milestone 6: integrate `PageShell` in the protected root file

Edit `apps/site/src/app/layout.tsx` once. Replace only the inline flex column and growing content wrapper with `PageShell`. Pass `SiteFooter` through the footer contract. Keep AgentProvider and both chat branches in the growing content slot. Keep AIAssistantDrawer under AgentProvider. Keep MobileAppPrompt and Toaster after PageShell.

Do not move, rename, or remove the Mantine imports. Do not change the theme. Do not change the overlay early return. Do not move ProfileCompletionGate, PostHogIdentity, scripts, metadata, viewport, fonts, or feature-flag logic.

Add a focused shell-boundary test. Prove that the overlay request renders route children without normal providers or global UI. Prove that the normal request retains the named global surfaces and both disable branches. Test observable markers from mocked child owners. Do not assert source text or CSS classes.

Run the shell-boundary test, the owned overlay primitive test, and the focused tests from prior milestones. This milestone is complete when normal and overlay behavior both pass and the root file has one structural shell owner.

The exact composite gates and final browser gate are complete. The final focused command passed 19/19 suites and 142/142 tests with 0 snapshots, no warnings, and no open handles. TypeScript, changed-file lint, the placeholder-database production build, and the final authenticated/manual shared-shell browser review all pass. The `issue120-prod-smoke` runtime served `http://localhost:3100` with local PostgreSQL. Route-specific product content findings remain with later issues.

Do not report shared-shell evidence as a pass for route-specific product content. Record route-content findings under their owning issues.
### Milestone 8: complete the Standards review

Milestone 8 is complete. The root, Navigation, adjacent-shell, chat, feedback, and AI Standards findings have source, test, and browser-relevant evidence where applicable; each lifecycle is verified and all Standards axes pass.

### Milestone 9: complete the separate Spec review

Milestone 9 is complete. The final shared-shell Spec re-review passes with no unresolved findings. CHAT-SPEC-05 and ROOT-SPEC-01 are verified. Route-content findings remain owned by #121, #122, #123, and #127.

## Concrete Steps

Run all site commands from `apps/site`. Do not run site commands from the repository root.

Before editing, confirm that the intended implementation base is present in the history. Compare the implementation diff against `e720f540764628272e339aec31259789ddda5c50`. Preserve unrelated working-tree changes. Do not reset them.

During a milestone, run only the focused suites owned by that milestone. After Milestone 6, run this exact focused Jest command:

    cd apps/site
    npm test -- --runInBand --detectOpenHandles \
      src/app/__tests__/shell-boundaries.test.tsx \
      src/components/layout/__tests__/Navigation.test.tsx \
      src/components/layout/__tests__/SiteFooter.test.tsx \
      src/components/layout/__tests__/MobileAppPrompt.test.tsx \
      src/components/auth/__tests__/ProfileCompletionGate.test.tsx \
      src/components/ui/__tests__/Loading.test.tsx \
      src/components/ui/__tests__/ErrorPresentation.test.tsx \
      src/components/ui/__tests__/overlays.test.tsx \
      src/components/feedback/__tests__/FeedbackDrawer.test.tsx \
      src/components/feedback/__tests__/FeedbackForm.test.tsx \
      src/components/chat/__tests__/ChatComponents.test.tsx \
      src/components/chat/__tests__/ChatDrawer.test.tsx \
      src/components/chat/__tests__/ChatList.test.tsx \
      src/components/chat/__tests__/ChatDetail.test.tsx \
      src/components/chat/__tests__/InviteUsersModal.test.tsx \
      src/components/moderation/__tests__/TermsConsentModal.test.tsx \
      src/context/__tests__/ChatUIContext.test.tsx \
      src/components/agent/__tests__/AIAssistantDrawer.test.tsx \
The final command exited with status 0. It produced 19/19 suites, 142/142 tests, 0 snapshots, no warnings, and no open handles.

Run TypeScript next:

    cd apps/site
    npx tsc --noEmit

Final proof: `npx tsc --noEmit` exited with status 0 and produced zero diagnostics.

Run the changed-file gate next:

    cd apps/site
    npm run lint:changed

Final proof: `npm run lint:changed` exited with status 0 for 36 changed site files and produced zero errors or warnings.

Run the production build with a command-local placeholder database URL. This value exists only for Prisma validation and client generation. It must not enter an environment file:

    cd apps/site
    DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public' npm run build

Final proof: the placeholder-database build exited with status 0. Prisma validation, generation, and the generated-client check passed. Next.js 16.2.9 compiled. TypeScript passed. Static generation produced 127/127 pages. The build made no real database connection.

The user authorized a temporary non-development production runtime named `issue120-prod-smoke`. The placeholder-database production build above passed, then `npm run start` was started from `apps/site` and served `http://localhost:3100` with local PostgreSQL. The placeholder database and local PostgreSQL runtime are separate boundaries. Runtime start is complete.
 
Open `http://localhost:3100` in Chromium for the public production review. The public desktop, mobile, Navigation, focus, motion, target-size, overflow, and Feedback checks below are PASS.
 
Authenticated/manual shared-shell acceptance is complete. The matrix covered 34 routes at 320, 390, 768, 1024, and 1536 CSS pixels and equivalent reflow conditions. It did not certify route-specific product content. No route-specific Organization, Discover, Organization Events, or My Schedule content pass is claimed.

The responsive browser matrix applies to every migration slice. For #120, the final shared-shell matrix covered 34 routes at representative mobile, tablet, desktop, direct 320px, and native 200% Chrome reflow conditions. The native 200% proof used Chrome Page zoom settings, not a CSS/DPR2 proxy. Route-specific product content remains owned by its Layout Family.
 
Keep this production runtime as the source of browser proof. The placeholder database URL is for Prisma build validation only. The final browser runtime uses local PostgreSQL. Do not create a disposable smoke route as a substitute for route-owned content. Record route-content findings under their owning issues without recording credentials.

## Validation and Acceptance

### Focused behavior tests

Each test must defend an observable contract. No test can assert a color, utility class, pixel value, screenshot, Mantine absence, or source import text.

`Navigation.test.tsx` must prove public, guest, authenticated, profile, admin, exact route, descendant route, AI, feedback, menu aria state, item order, close action, and focus return behavior. `SiteFooter.test.tsx` must prove the supported destinations and support email. `ProfileCompletionGate.test.tsx` must prove incomplete, complete, safe next, unsafe next, guest, signed-out, loading, and fallback redirects.

`MobileAppPrompt.test.tsx` must prove platform and path gates, standalone suppression, dismissed and revealed state, dismissal expiry, store destination, deep link, and fallback timer. It must restore fake timers and browser globals.

`FeedbackDrawer.test.tsx` and `FeedbackForm.test.tsx` must prove open analytics, draft persistence, Escape, focus return, Done, Bug and Idea context, General omission, labels, honeypot behavior, length validation, email consent, late email, request payload, error recovery, success, copy, and Send another.

`ChatUIContext.test.tsx` must prove the three-window invariant and floating-button visibility. The chat component tests must prove auth and route gates, interval work, unread count, list load, list and window focus, local Escape, row keyboard activation, action-menu isolation, invite reset and create behavior, terms close policy, message pagination, scroll preservation, draft retention, send clearing, and focus restoration. They must prove that a modeless window does not trap focus.

`AIAssistantDrawer.test.tsx` must prove every named HTTP call and body, one-time load behavior, pending state, client action, refresh, keyboard send, disabled state, error recovery, close, and focus return. It must not test the visual implementation.

`Loading.test.tsx` must prove the stable prop behavior, in-flow root status, and polite accessible status without permanent busy suppression. `ErrorPresentation.test.tsx` must prove the labelled region, initial heading focus, default copy, custom copy, text-only alert message, retry outside the alert, and one retry callback per activation. `shell-boundaries.test.tsx` must prove the overlay bypass, normal shared UI, feature branches, in-flow root loading component, and App Router error reset integration without style assertions.

### Browser and manual comparison

Current status: final authenticated/manual shared-shell browser PASS. The `issue120-prod-smoke` runtime served `http://localhost:3100` with local PostgreSQL. The 34-route matrix, native 200% proof, and final shared reference review are complete. Route-specific product content is not declared passed.

Universal responsive invariant: a desktop or mobile reference is one sample state, not a fixed canvas. Copied references define hierarchy and visual intent at their named viewport; they do not authorize fixed-size page canvases. Every Route and Surface must adapt continuously from 320 CSS pixels through wide desktop, reflow at actual 200% browser zoom, avoid page-level two-dimensional scrolling, keep overlays in the dynamic viewport, keep 44px touch targets where applicable, honor safe areas and reduced motion, and preserve accessible keyboard and focus behavior. A product-owned table, map, or workspace may scroll horizontally only inside a bounded region; the page itself must not.

For #120, the final shared-shell matrix covers every consuming Route at representative mobile, tablet, desktop, direct 320px, and native 200% browser reflow conditions. Route-specific product content remains owned by its Layout Family and must meet the same invariant in its own migration slice. Do not use a reference image as a fixed-size page canvas.
 
Final shared-shell browser evidence covers 34 routes at 320, 390, 768, 1024, and 1536 CSS pixels and equivalent reflow conditions. There is no shared-shell page or Sheet horizontal overflow. Desktop and mobile Navigation expose the exact active `aria-current`; shell targets are 44px; real pointer and keyboard menu open, close, and link activation work; focus remains inside the menu trap, with the transient Base UI guard resolving within one `requestAnimationFrame`; Escape and pointer close restore focus; reduced motion produces no transition; the public Feedback route supports keyboard navigation and validation without submission; and custom radio and checkbox pseudo-elements show verified 3px focus rings.
 
The final Navigation proof is a 256px drawer with scrim widths of 64px at 320, 134px at 390, and 170px at 426. Its rows are 223x44, with no overlap, wrapping, or overflow. The global Navigation reference review passes for the desktop bar and the mobile header/drawer at 426 and 320.
 
Native Chrome Page zoom was set to 200% through `chrome://settings`. The physical viewport was 1536x1024, the CSS viewport was 768x512, and DPR was 2. The final drawer internal scroller measured 443 client and 681 scroll. AI and Feedback were reachable after scroll. Navigation, Chat, Feedback, and AI stayed within the viewport, and the page measured 768/768. Chrome was restored to 100% Page zoom, DPR1, and 1536/1536 physical/CSS viewport. See [issue comment 5503403469](https://github.com/Razumly/bracketiq/issues/120#issuecomment-5503403469).
 
Reference matrix: the final shared review passes for the desktop bar and the mobile header/drawer at 426 and 320 CSS pixels. Organization route shell, content, and state reference differences remain owned by [issue #122 comment 5503302029](https://github.com/Razumly/bracketiq/issues/122#issuecomment-5503302029), not #120. This plan does not claim the Organization content or state references passed.
 
The final 34-route shared-shell matrix covered authenticated/manual focus, responsive, and native-zoom behavior. Route-content findings were isolated and assigned to later issues: `/discover` +16 CSS pixels at 320 in [#121 comment 5503302025](https://github.com/Razumly/bracketiq/issues/121#issuecomment-5503302025), Organization tab clipping in [#122 comment 5503302029](https://github.com/Razumly/bracketiq/issues/122#issuecomment-5503302029), Organization Events +16 CSS pixels at 320 in [#123 comment 5503302031](https://github.com/Razumly/bracketiq/issues/123#issuecomment-5503302031), and `/my-schedule` +16 CSS pixels at 320 in [#127 comment 5503302032](https://github.com/Razumly/bracketiq/issues/127#issuecomment-5503302032). These are not #120 failures.
 
The following public checks are complete and must not be reclassified as authenticated checks: pointer and keyboard Navigation open/close/link behavior; menu focus containment and transient guard resolution; Escape and pointer focus return; reduced-motion transition suppression; 44px public shell targets; public Feedback keyboard validation without submission; and the custom radio/checkbox 3px pseudo-element focus rings.
 
Out-of-scope observations are recorded without treating them as issue #120 failures: organization product-owned Mantine CTAs are 36px; public onboarding `/icon-192.png` optimizer requests return 400 unchanged from base; local data APIs return expected placeholder/no-database 500s. Route-content findings are tracked separately in [#121 comment 5503302025](https://github.com/Razumly/bracketiq/issues/121#issuecomment-5503302025), [#122 comment 5503302029](https://github.com/Razumly/bracketiq/issues/122#issuecomment-5503302029), [#123 comment 5503302031](https://github.com/Razumly/bracketiq/issues/123#issuecomment-5503302031), and [#127 comment 5503302032](https://github.com/Razumly/bracketiq/issues/127#issuecomment-5503302032).
 
### Acceptance mapping

The #120 shared-shell work is accepted when all ten shell surfaces pass and the universal responsive invariant is met for the shared shell across every consuming Route. Route-specific product content is owned by Layout Families and is not part of this acceptance statement.

Current acceptance status for the shared shell is COMPLETE. Static, TypeScript, changed-file lint, production-build, authenticated/manual browser, responsive, native 200%, Standards, and Spec evidence is complete. Route-specific Organization, Discover, Organization Events, My Schedule, and other product content is not declared passed by #120.

1. Desktop application navigation uses owned semantic presentation and preserves all routes and branches.
2. Mobile application navigation matches the approved open reference and preserves menu behavior.
3. `PageShell` owns the root frame and full-width safe-shrinking content region. Existing route containers own route-specific content widths, including the organization overview, without an unrelated migration. The shared shell adapts across every consuming Route. Route-specific product content remains owned by its Layout Family and must meet the same universal responsive requirement in its own migration slice.
4. The global footer uses owned semantic presentation and preserves all destinations.
5. The profile-completion gate passes the full redirect matrix without new UI.
6. The mobile application prompt has no Mantine presentation import and preserves every gate and timer.
7. Chat entry, list, windows, Invite, and Terms use owned or semantic presentation. The three-window and HTTP contracts remain intact.
8. The AI assistant has no Mantine presentation import and preserves Agent and HTTP contracts.
9. The App Router has real shared loading and resettable error presentation. Existing Loading callers keep their API.
10. Feedback, Invite, Terms, AI, and chat focus behavior meets the dialog, modeless, Escape, and restoration contracts.

The issue acceptance criteria also require all shell surfaces to use approved BracketIQ tokens and primitives; applicable references to be reviewed; WCAG 2.2 AA keyboard, focus order, focus restoration, reduced motion, zoom, and target behavior to pass; existing behavior to remain intact; focused tests, TypeScript, changed-file lint, production build, browser smoke, and manual review to pass; and Mantine imports to be absent from completed shell surfaces. The root provider, style imports, theme imports, and active unrelated callers are the explicit exception. For every migration slice, verify representative mobile, tablet, desktop, direct 320px, and actual 200% browser zoom. A product-owned table, map, or workspace may scroll horizontally only inside a bounded region; the page itself must not.

Authentication, session, Team, Navigation route, permission, and HTTP behavior show no change. The final diff has no migration-only style scope and no visual or style test. All Standards axes pass. Shared-shell browser and responsive evidence passes. The separate Spec review passes with no unresolved findings. Route-content findings remain with their owning issues. Issue #120 remains open and uncommitted.

## Idempotence and Recovery

The source changes are safe to repeat because they are component replacements and additive route-boundary files. Do not run a bulk shadcn command. Do not regenerate owned primitives. Import the existing issue #119 modules directly.

Keep each milestone passing before the next milestone. If a migrated overlay fails, restore the last working component body for that one owner. Do not revert another contributor's changes. Keep the new behavior test. Use it to make the next fix red and then green.

If focus does not return, first confirm that the opener is still connected. Fix focus ownership in the consumer. Do not put DOM nodes in ChatUIContext, AgentContext, or AppContext. Do not add a global keydown listener when a local surface handler can own Escape.

If a modal cannot close when `allowClose=false`, inspect Dialog close controls, Escape, and outside-interaction paths. Disable those paths through the primitive contract. Do not add a hidden close control. If `allowClose=true` fails, preserve each existing callback and fix the controlled open transition.

If a route-specific organization width question arises, keep its original `Container` and product-owned maximum width. Do not add a shared content-width wrapper or refactor the organization product surface as a workaround. The root `PageShell` remains the shared shell owner.

If the placeholder build URL fails before Next.js because Prisma requires syntax only, correct the placeholder syntax. If any step attempts a real connection, do not use a production URL. Record the failure and use an authorized disposable local database only if the build truly needs one.

A disposable browser-smoke route is not a deliverable. Remove it before the final focused command. Remove only its stale generated `.next` entries when an error names them. Do not remove the complete `.next` directory without a specific generated-state reason.

Keep the Mantine provider and styles even when the focused shell suites no longer need their test wrapper. Remove a Mantine test wrapper only from a test that renders no active Mantine child. Do not uninstall Mantine.

After any review fix, rerun the narrow proof first. Then rerun Jest, TypeScript, changed-file lint, and the production build before final acceptance. Update all living sections before stopping.

## Artifacts and Notes

Planning evidence:

    Governing issue: https://github.com/Razumly/bracketiq/issues/120
    Shared catalog approval: https://github.com/Razumly/bracketiq/issues/120#issuecomment-5485552665
    Mobile release-owner approval: https://github.com/Razumly/bracketiq/issues/133#issuecomment-5498456003
    Fixed implementation base: e720f540764628272e339aec31259789ddda5c50
    Issue state at planning: OPEN
    Issue claim at planning: assigned to @camka14
    Issue checklist at planning: 0 of 10 complete

The initial planning phase ran no project command. The implementation phase produced the command records below. No source, test, image, runtime, or issue metadata was changed by this plan update.

2026-09-01 — Root shell focused Jest
Command: `npx jest src/app/__tests__/shell-boundaries.test.tsx src/components/ui/__tests__/Loading.test.tsx src/components/ui/__tests__/ErrorPresentation.test.tsx --runInBand --detectOpenHandles`
Result: PASS; 3 suites, 10 tests; no open handles. The cases cover normal and overlay shell composition, feature branches, in-flow root loading, labelled error semantics, heading focus, text-only alert messaging, and retry reset.

2026-09-01 — Navigation focused Jest
Command: `npx jest src/components/layout/__tests__/Navigation.test.tsx --runInBand --detectOpenHandles`
Result: PASS; 1 suite, 22 tests; no open handles. The cases cover loading, home and route order, exact and descendant active state, profile and mobile-app active state, admin allow, visibility and cancellation, authenticated/public/guest branches, AI and feedback actions, mobile menu state, item order, Escape, close control, link close, trigger focus restoration, deterministic Sheet transition completion, and reopen-before-fallback cancellation.

2026-09-01 — SiteFooter focused Jest
Command: `npm test -- --runInBand --detectOpenHandles src/components/layout/__tests__/SiteFooter.test.tsx`
Result: PASS; 1 suite, 1 test; no open handles. The suite covers the semantic footer landmark, current year, supported destinations, and support email.

2026-09-01 — MobileAppPrompt focused Jest
Command: `npx jest src/components/layout/__tests__/MobileAppPrompt.test.tsx --runInBand --detectOpenHandles`
Result: PASS; 1 suite, 16 tests; no open handles. The cases cover path and feature-flag suppression, non-mobile, standalone and native iOS Safari suppression, Android and non-Safari iOS reveal, dismissal expiry, seven-day localStorage dismissal, platform store URLs, deep links, and the 1.2-second fallback.

2026-09-01 — ProfileCompletionGate focused Jest
Command: `npx jest src/components/auth/__tests__/ProfileCompletionGate.test.tsx --runInBand --detectOpenHandles`
Result: PASS; 1 suite, 15 tests; no open handles. The cases cover no-op loading, guest and signed-out states, complete-profile exemption, incomplete redirect query preservation, safe and unsafe next paths, home fallback, and discover fallback.

2026-09-01 — Feedback focused Jest
Command: `npx jest src/components/feedback/__tests__/FeedbackDrawer.test.tsx src/components/feedback/__tests__/FeedbackForm.test.tsx --runInBand --detectOpenHandles`
Result: PASS; 2 suites, 16 tests; no open handles. The cases cover drawer close paths, focus return and draft retention, analytics transition count, form context choices, labels, honeypot, validation, consent, late email, payload, recovery, success, copy, and Send another.

2026-09-01 — Overlays and feedback focused Jest
Command: `npx jest src/components/ui/__tests__/overlays.test.tsx src/components/feedback/__tests__/FeedbackDrawer.test.tsx src/components/feedback/__tests__/FeedbackForm.test.tsx --runInBand --detectOpenHandles`
Result: PASS; 3 suites, 22 tests; no open handles.

2026-09-01 — Chat focused Jest
Command: `npx jest src/components/chat/__tests__/ChatComponents.test.tsx src/components/chat/__tests__/ChatDrawer.test.tsx src/components/chat/__tests__/ChatList.test.tsx src/components/chat/__tests__/ChatDetail.test.tsx src/components/chat/__tests__/InviteUsersModal.test.tsx src/components/moderation/__tests__/TermsConsentModal.test.tsx src/context/__tests__/ChatUIContext.test.tsx --runInBand --detectOpenHandles`
Result: PASS; 7 suites, 41 tests; no open handles. The cases cover auth and route gates, intervals, unread state, list load, modeless windows, focus and Escape behavior, keyboard rows, disclosure isolation, invite and Terms flows, pagination and scroll preservation, draft and send behavior, exact window ordering, and focus restoration.

2026-09-01 — AI focused Jest
Command: `npx jest src/components/agent/__tests__/AIAssistantDrawer.test.tsx src/components/agent/__tests__/MarkdownMessageContent.test.tsx --runInBand --detectOpenHandles`
Result: PASS; 2 suites, 15 tests; no open handles. The cases cover each AI request and body, one-time load, pending state, client action, refresh, keyboard send and newline, disabled state, recovery, close, focus return, and Markdown rendering.
2026-09-01 — Cross-owner overlay focus proof
Command: `npx jest src/components/feedback/__tests__/FeedbackDrawer.test.tsx src/components/agent/__tests__/AIAssistantDrawer.test.tsx --runInBand --detectOpenHandles`
Result: PASS; 2 suites, 18 tests; no open handles. The proof covers overlay close candidates, native zoom-crossing desktop Feedback to 200% mobile, and mobile AI to 100% desktop focus handoffs.

2026-09-01 — Final focused Jest
Command:

    cd apps/site
    npm test -- --runInBand --detectOpenHandles \
      src/app/__tests__/shell-boundaries.test.tsx \
      src/components/layout/__tests__/Navigation.test.tsx \
      src/components/layout/__tests__/SiteFooter.test.tsx \
      src/components/layout/__tests__/MobileAppPrompt.test.tsx \
      src/components/auth/__tests__/ProfileCompletionGate.test.tsx \
      src/components/ui/__tests__/Loading.test.tsx \
      src/components/ui/__tests__/ErrorPresentation.test.tsx \
      src/components/ui/__tests__/overlays.test.tsx \
      src/components/feedback/__tests__/FeedbackDrawer.test.tsx \
      src/components/feedback/__tests__/FeedbackForm.test.tsx \
      src/components/chat/__tests__/ChatComponents.test.tsx \
      src/components/chat/__tests__/ChatDrawer.test.tsx \
      src/components/chat/__tests__/ChatList.test.tsx \
      src/components/chat/__tests__/ChatDetail.test.tsx \
      src/components/chat/__tests__/InviteUsersModal.test.tsx \
      src/components/moderation/__tests__/TermsConsentModal.test.tsx \
      src/context/__tests__/ChatUIContext.test.tsx \
      src/components/agent/__tests__/AIAssistantDrawer.test.tsx \
Result: PASS; exit 0; 19/19 suites, 142/142 tests, 0 snapshots, no warnings, no open handles.

2026-09-01 — TypeScript
Command: `npx tsc --noEmit`
Result: PASS; exit 0; zero diagnostics.

2026-09-01 — Changed-file lint
Command: `npm run lint:changed`
Result: PASS; exit 0; 36 changed site files; zero errors and zero warnings.

2026-09-01 — Production build
Command: `DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public' npm run build`
Result: PASS; exit 0. Prisma validate, generate, and check passed; Next.js 16.2.9 compiled; TypeScript passed; static generation produced 127/127 pages; no real database connection occurred.

2026-09-01 — Production runtime and final browser review
Runtime: User-authorized temporary non-development runtime `issue120-prod-smoke`. The placeholder-database build passed above. `npm run start` served `http://localhost:3100` from `apps/site` with local PostgreSQL. The placeholder database and local PostgreSQL runtime are separate boundaries.
Route/account state: Authenticated/manual shared-shell review used the local PostgreSQL runtime. The matrix covered 34 routes. It did not certify route-specific product content. No route-specific Organization, Discover, Organization Events, or My Schedule content pass is claimed.
Viewport/DPR/zoom: The matrix covered 320, 390, 768, 1024, and 1536 CSS pixels with equivalent reflow conditions. Native Chrome Page zoom was set through `chrome://settings` to 200%; physical viewport 1536x1024, CSS viewport 768x512, DPR2. Chrome was restored to 100% Page zoom, DPR1, and 1536/1536 physical/CSS viewport.
Final shared-shell result: PASS. No shared-shell page or Sheet horizontal overflow; exact active `aria-current` on desktop and mobile; 44px shell targets; real pointer and keyboard menu open, close, and link activation; focus containment with the transient Base UI guard resolving within a requestAnimationFrame; Escape and pointer focus return; no reduced-motion transition; public Feedback keyboard validation without submission; and custom radio/checkbox pseudo-element 3px focus rings.
Shared-shell findings fixed: synchronous Chat focus return; Navigation dark/nav visual alignment; mobile Chat 44px header portal in Navigation and MarketingHeader so footer/actions remain unobscured; mobile Chat conversation stacked and contained at 320 and 426; native-200% mobile drawer internal scrolling with AI and Feedback reachable after scroll; AI mobile drawer handoff; overlay close rejection for connected-but-hidden or disabled candidates; the Navigation breakpoint focus race across native 200% to 100% zoom, which focuses visible BracketIQ home while leaving the hidden trigger unfocused; and interrupted-close state reset. NAV-STD-09 and NAV-STD-10 are verified.
Reference result: PASS for the desktop bar and the mobile header/drawer at 426 and 320. Organization route shell, content, and state reference differences remain owned by [issue #122 comment 5503302029](https://github.com/Razumly/bracketiq/issues/122#issuecomment-5503302029).
Route-content findings: `/discover` +16 CSS pixels at 320 in [#121 comment 5503302025](https://github.com/Razumly/bracketiq/issues/121#issuecomment-5503302025); Organization tab clipping in [#122 comment 5503302029](https://github.com/Razumly/bracketiq/issues/122#issuecomment-5503302029); Organization Events +16 CSS pixels at 320 in [#123 comment 5503302031](https://github.com/Razumly/bracketiq/issues/123#issuecomment-5503302031); `/my-schedule` +16 CSS pixels at 320 in [#127 comment 5503302032](https://github.com/Razumly/bracketiq/issues/127#issuecomment-5503302032). These are not #120 shared-shell failures.
Actual zoom record: [issue #120 comment 5503403469](https://github.com/Razumly/bracketiq/issues/120#issuecomment-5503403469).
Separate Spec result: PASS. The final shared-shell reviewer gate passed with no unresolved findings. No route-specific product content pass is claimed.

## Interfaces and Dependencies

Use React and the installed Next.js App Router. Do not add a package. Use `cn` from `apps/site/src/lib/utils.ts` for class merging.

Use these owned modules from issue #119:

- `@/components/ui/button` for action controls and 44px targets.
- `@/components/ui/dialog` for Invite and Terms modal behavior.
- `@/components/ui/sheet` for Feedback and AI right drawers.
- `@/components/ui/input` and `@/components/ui/textarea` for text entry.
- `@/components/ui/checkbox` and `@/components/ui/radio-group` for feedback choices and consent.
- `@/components/ui/avatar` for invite results.
- `@/components/ui/badge` for AI status labels.
- `@/components/ui/card` for panels and message groups.
- `@/components/ui/separator` for visual separation.
- `@/components/ui/field` for labels, descriptions, and errors.
- `@/components/ui/sonner` for the existing global Toaster.

Keep direct imports. Do not add a barrel file or compatibility alias. Keep owned primitive public interfaces unchanged unless a verified primitive defect blocks this plan. If that occurs, record the defect in `Surprises & Discoveries` and fix it with focused primitive behavior proof.

`PageShell` and `PageShellProps` use only React native element props and the owned `cn` helper. `ErrorPresentation` uses only React, owned Button, and semantic markup: a labelled `region`, focused heading, text-only alert message, and retry Button outside the alert. `AppLoading` depends on the existing `Loading` API, uses the stable text `Loading page...` in the root segment flow, and does not pass `fullScreen`. `AppError` depends on the App Router error signature and `ErrorPresentation`.

Feedback depends on `FeedbackFormDraft`, current analytics helpers, `useApp`, and `POST /api/feedback`. Navigation depends on `useApp`, `useAgentContext`, `usePathname`, `getHomePathForUser`, and `GET /api/admin/access`. Keep those interfaces.

Chat presentation depends on `useChat` and `useChatUI`. Keep both context return shapes. Add no replacement store. Keep the current chat service methods and HTTP paths. Modeless focus bookkeeping stays in chat presentation owners and native refs.

AI presentation depends on `useAgentContext`. Keep its open state, active page, refresh handler, and client-action handler. Keep the event schedule registrations unchanged. Keep the four current AI request paths and bodies.

RootLayout depends on Mantine until all active callers migrate. The final source must still include the two global Mantine style imports, the theme construction, `MantineProvider`, and `MOBILE_APP_MANTINE_PRIMARY_SCALE`. This retained dependency is intentional and is not an incomplete issue #120 migration.

Plan revision note, 2026-09-01: Created the initial self-contained ExecPlan for issue #120. Recorded the fixed implementation base, current open claim, approved canonical references, all ten shell surfaces, preserved behavior contracts, exact file and interface ownership, incremental milestones, command and browser proof, Mantine retention boundary, and separate Standards and Spec review lifecycles. The plan exists before implementation so a novice can resume from this file alone.
Plan revision note, 2026-09-01: Updated this living plan after the user-authorized production runtime, final static proof, public Chromium review, and Navigation re-review. The earlier interim proof and changed-file totals were superseded. This update recorded 19/19 suites and 142/142 tests, 36 changed site files, the `issue120-prod-smoke` local-PostgreSQL runtime, the authenticated/manual shared-shell matrix, native 200% proof, fixed browser findings, route-content ownership, and the pending separate Spec review at that earlier point. The later Spec re-review is recorded below.
Plan revision note, 2026-09-01: Restored the organization route outer wrapper to the fixed implementation base because its route-specific maximum width is product-owned. Removed the unused route-content export and updated the shell boundary test to cover the root content region and footer order. Replaced the three test image mocks with accessible non-image stubs. This keeps the shared PageShell full-width and safe-shrinking behavior while avoiding an unrelated 5,000-line product refactoring.
Plan revision note, 2026-09-01: Recorded final shared-shell implementation and verification evidence. The record now includes 19/19 suites and 142/142 tests, TypeScript exit 0, 36 changed site files linted, 127/127 generated pages, the local-PostgreSQL `issue120-prod-smoke` runtime, the 34-route responsive matrix, native 200% proof and 100% restoration, fixed shared-shell findings, exact route-content comment links, the global Navigation reference PASS, and the completed separate Spec review. No route-specific product content pass is claimed.
Plan revision note, 2026-09-01: Added the accepted universal responsive-layout contract and recorded that copied references are sample states at named viewports, not fixed-size page canvases. At that earlier revision, native 200% Chrome proof was pending. The final evidence now records Chrome settings Page zoom at 200%, the 1536x1024 physical and 768x512 CSS viewport at DPR2, the drawer scroller proof, and restoration to 100% Page zoom at DPR1 and 1536/1536 physical/CSS viewport. Route-content findings remain with later issues.
Plan revision note, 2026-09-01: Recorded the final Standards fixes after the prior composite. The prior composite record is superseded by the final 19/19-suite, 142/142-test result. Chat remains 7 suites and 41 tests; Feedback is 2 suites and 16 tests; AI is 2 suites and 15 tests; and the cross-owner overlay proof is 2 suites and 18 tests. NAV-STD-09, NAV-STD-10, AI-STD-04, and CHAT-SPEC-05 are verified. The Navigation breakpoint and interrupted-close lifecycles are fixed and verified. The separate Spec reviewer gate now passes.
Plan revision note, 2026-09-01: Recorded the final Spec re-review and Standards re-review. The final composite is 19/19 suites and 142/142 tests with 0 snapshots, no warnings, and no open handles. Navigation is 1 suite and 22 tests. The final build produced 127/127 pages. The separate Spec review passes with no unresolved findings. No route-specific product content pass is claimed.
