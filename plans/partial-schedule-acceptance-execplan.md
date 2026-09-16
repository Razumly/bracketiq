# Purpose / Big Picture

Issue 38 adds safe partial acceptance for an automatically generated schedule.

A scheduling proposal can contain matches that the system cannot place. An organizer must see the exact `Unscheduled Matches` and the affected `Competition Phases`. The organizer must choose partial acceptance as an explicit action. The system must save the graph that the organizer reviewed. It must not run the scheduler again during acceptance.

The saved result must have a new intent and identity. The availability revision must protect the write. A stale revision must reject the whole operation. It must not leave partial writes. Automated scheduling must stay enabled.

Mobile must show the proposal as a transient review state. Android and iOS must offer the same explicit confirmation. Mobile must retain the setup after a rejection. The Room write must use one transaction. The stale result must use a typed error that the UI can handle.

This is a living plan. Update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` as work moves forward. Do not mark a check as passed until a focused check or a real surface run proves it.

# Progress

- [x] (2026-08-31) Confirm the current contracts and seams from the code at base `bd683fb698daf504fc59c3a3758ebb6300721636`.
- [x] (2026-08-31) Record and preserve the staged and unstaged working-tree state.
- [x] (2026-08-31) Define the shared proposal, partial-acceptance, identity, revision, and typed-stale-result contract.
- [x] (2026-08-31) Implement the explicit `PARTIAL` command/result, fresh acceptance identity, original proposal identity/revision/draft, and atomic stale handling.
- [x] (2026-08-31) Update organizer, public, registration, main event, detail, bracket, standings, and embed web surfaces.
- [x] (2026-08-31) Update mobile DTO, gateway, repository, component, dialog, Android, and iOS seams.
- [x] (2026-08-31) Run the focused checks and record their results and environment limits below.
- [x] (2026-08-31) Perform final Standards and Spec reviews against all Issue 38 criteria; no Issue 38-specific defects remain.
- [x] (2026-08-31) Record outcomes, remaining risks, and recovery notes. Typecheck, the required live mobile-to-site check, and the database integration check pass; changed-file lint and the full organizer page suite remain separate gates.

The implementation is complete for the requested Issue 38 scope. Focused checks, typecheck, the required live client-to-site partial-acceptance check, and the database integration check passed. A clean final validation claim is not made for changed-file lint or the full organizer page suite because those checks remain red or timed out.

# Surprises & Discoveries

- Observation: The acceptance contract needs both the original proposal identity/revision/draft and a fresh acceptance identity.
  Evidence: The explicit `PARTIAL` command/result now carries these values; transport replay reuses the acceptance identity, while a new confirmation receives a new one.
- Observation: Stale recovery is a state transition, not only an error message.
  Evidence: The rendered organizer flow retains setup and proposal data, clears the old identity, disables the old Accept action, offers Refresh with a fresh proposal, and retains Reject.
- Observation: Public incomplete data crosses more surfaces than the organizer page.
  Evidence: Registration, main event detail, bracket, standings, and embed outputs now use deterministic exact unscheduled IDs and affected Competition Phase IDs, with safe display-name fallback, bounded privacy projection, and hydrated `placementState`.
- Observation: Mobile and database-backed verification require an isolated local runtime.
  Evidence: Inspectable XML checks passed with zero skipped, failed, or errored cases. The worktree PostgreSQL service runs on its local database URL, and the required live mobile-to-site partial-acceptance test passed after the site backend ran against that database with outbound providers disabled. The site database integration suite also passed 5 tests.
- Observation: Final static checks have different outcomes.
  Evidence: From `apps/site`, `npx tsc --noEmit` passed with exit 0 in 32.98 seconds and no output. From `apps/site`, `npm run lint:changed` failed with exit 1 in 1.90 seconds across 39 changed site files, with 161 problems (154 errors and 7 warnings). The command is non-baselined and does not establish a concrete Issue 38 regression; `schedule/page.tsx` alone reported 21 diagnostics, with broad existing complexity and hooks diagnostics elsewhere.

# Decision Log

- **Base.** Treat `bd683fb698daf504fc59c3a3758ebb6300721636` as the current base for this work.
- **Working tree.** Preserve all existing staged and unstaged changes. Do not reset, clean, stash, checkout, or overwrite work that is not part of Issue 38.
- **Contract first.** Reuse the existing site contract and shared domain types. Add only the fields and result variants that the partial-acceptance flow needs. Do not create a parallel contract or compatibility alias.
- **Explicit action.** Partial acceptance is a distinct command from full acceptance, regeneration, and ordinary schedule edits. A review must not become an acceptance through an implicit fallback.
- **New identity.** A successful partial acceptance creates a new intent and identity. A transport retry reuses the same acceptance intent identity; it must not create duplicate accepted schedules. A new user action receives a new identity.
- **Reviewed graph is authoritative.** The graph submitted by the review flow is the graph to persist. Acceptance does not call the scheduler or recompute placements.
- **Atomic revision check.** The availability revision comparison and all acceptance writes share one transaction and one write boundary. A stale revision writes nothing.
- **Automation remains enabled.** Partial acceptance records the result but does not disable automated scheduling, change its enablement setting, or bypass future automatic runs.
- **Mobile state.** Mobile treats the proposal as transient until the user confirms. A stale rejection keeps the setup and review context available for recovery.
- **Room boundary.** The mobile repository performs the confirmed local persistence in one Room transaction at the Room seam. Keep Android and iOS behavior aligned even if their local adapters differ.
- **Typed rejection.** Stale availability is a typed result or error. Do not reduce it to a generic network or unknown failure before the component and screen can act on it.

If code inspection shows an existing convention that conflicts with a choice above, record the evidence and update this log before changing the implementation.
- **Closeout evidence.** The final focused matrix, separate rendered stale check, site database integration, and required live mobile-to-site partial-acceptance check passed. Final Standards and Spec reviews found no remaining Issue 38-specific defects.
  Rationale: Record the completed behavior without converting the remaining lint gate or the bounded organizer suite timeout into pass claims.
  Date/Author: 2026-08-31 / implementation closeout.
- **Verification wording.** Record the latest terminal results: `npx tsc --noEmit` passed with exit 0 in 32.98 seconds and no output; `npm run lint:changed` failed with exit 1 in 1.90 seconds on 39 changed site files; the site database integration suite passed 5 tests; and the required mobile live partial-acceptance test passed 1 test against the local backend.
  Rationale: Keep pass, failure, and timeout outcomes separate. The lint command is non-baselined and does not establish a concrete Issue 38 regression. The live test used the worktree PostgreSQL URL through `MVP_TEST_DATABASE_URL` and a separate loopback HTTP URL through `MVP_TEST_BACKEND_URL`.
  Date/Author: 2026-08-31 / implementation closeout.

# Outcomes & Retrospective

Issue 38 implementation is complete across the shared contract, server acceptance path, web surfaces, mobile transport and state seams, and Android/iOS presentation. The flow now uses an explicit `PARTIAL` acceptance command/result. Success creates a fresh acceptance identity while preserving the original proposal identity, revision, and draft. The server atomically rejects stale revisions with `EDITOR_PROPOSAL_STALE`, supports replay and mismatch behavior, persists the exact reviewed graph, and does not recompute it with the scheduler. Automated scheduling remains enabled.

Organizer review and rendered stale recovery are complete. Recovery retains setup and proposal data, clears the old identity, disables the old Accept action, offers Refresh with a fresh proposal, and retains Reject. Public registration, main event detail, bracket, standings, and embed surfaces show bounded incomplete data with deterministic exact unscheduled match IDs and affected Competition Phase IDs. They use safe display-name fallback and hydrate `placementState`.

Mobile now keeps proposals transient until explicit confirmation. Android and iOS have matching confirmation, typed stale, refresh, and reject behavior. Transport retries reuse the acceptance identity. The confirmed Room persistence path uses one transaction, and setup remains available after a non-successful result.

Focused evidence includes a latest-fix site matrix of 14 suites and 200 passed tests, a separate rendered organizer stale test with 1 passed test, eventService/detail hydration coverage of 3 suites and 33 passed tests, eventEditor coverage of 19 passed tests plus 1 wire test, eventEditorSave coverage of 31 passed tests, and the site database integration suite with 5 passed tests. Core, replay, and public counts remain recorded in the prior plan/context evidence. Mobile inspectable XML checks covered DTO (3), gateway (6), session mapper (28), accepted merge (4), component (83), dialog (6), and iOS parity (4), with zero skipped, failed, or errored cases. The required live mobile-to-site partial-acceptance test passed 1 test with zero failures, errors, or skips. Android/iOS source compilation passed earlier.

Known limits remain explicit. The full organizer page suite was rerun after the unresolved-participant assertion fix and still timed out at 180 seconds while emitting Mantine Portal and Modal act warnings. The isolated unresolved-participant scenario passed. The focused MatchEditModal suite also timed out in this environment and is not an Issue 38 acceptance gate. Latest unrelated Gradle/Kotlin reruns timed out during configuration. From `apps/site`, `npx tsc --noEmit` passed with exit 0 in 32.98 seconds and no output, with no environment blocker. From `apps/site`, `npm run lint:changed` failed with exit 1 in 1.90 seconds across 39 changed site files, with 161 problems (154 errors and 7 warnings). The result is non-baselined and does not establish a concrete Issue 38 regression; `schedule/page.tsx` alone reported 21 diagnostics plus broad existing complexity and hooks diagnostics. The lint gate and organizer full-page timeout remain separate close gates. Final Standards and Spec reviews found no remaining Issue 38-specific defects.

The main lesson is to treat proposal identity, acceptance identity, revision, and stale recovery as one end-to-end contract. Exact IDs and bounded projections prevent clients from inferring incomplete state, while explicit action boundaries and transaction-level checks protect the reviewed graph.

# Context and Orientation

The current base is `bd683fb698daf504fc59c3a3758ebb6300721636`.

The working tree can be dirty. It can contain both staged and unstaged changes from the user. Before editing, inspect and preserve that state. Compare only the Issue 38 work when reviewing the final diff. Never use a destructive Git command to obtain a clean tree.

The feature crosses five areas:

1. **Site contract and shared model.** This area carries the proposal graph, match and phase identifiers, incomplete status data, availability revision, acceptance intent identity, and typed result or error data. The contract must carry exact identifiers. It must not ask a client to infer affected phases from matches.
2. **Server seam.** This area authorizes the organizer, validates the submitted proposal and revision, persists the new schedule intent and reviewed graph, and returns a typed stale result. The revision check and writes must be atomic. The scheduler must not run in this command.
3. **Web seams.** The organizer review and confirmation surfaces show the proposal state and exact incomplete data. Public surfaces show the incomplete result without implying that the schedule is complete. The web action sends an explicit partial-acceptance command.
4. **Mobile seams.** DTOs map the contract, the gateway sends the explicit command, the repository owns transient and confirmed state, components model confirmation and stale recovery, and Android/iOS screens show the same user-visible flow.
5. **Persistence and automation.** The accepted graph and new identity must survive a successful write. A stale request must not alter the accepted graph, availability state, intent, or local confirmation state. Automated scheduling remains enabled after the write.

The expected state flow is:

`generated proposal -> review -> explicit partial confirmation -> atomic accept -> new intent/identity`

A stale revision follows this path:

`generated proposal -> review -> explicit partial confirmation -> typed stale rejection -> setup and review context retained`

A retry after a transient transport failure uses the same acceptance intent identity. A new confirmation after the user refreshes the proposal uses a new identity and the current availability revision.

## Issue 38 acceptance criteria

The criteria below are the exact five web/shared criteria and the exact four mobile criteria. Keep the wording and count stable as implementation details are added.

### Web/shared: five criteria

1. **Exact Unscheduled Matches and affected Competition Phases.** The contract, server result, organizer view, and public view identify the exact unscheduled match IDs and the exact affected Competition Phase IDs for the reviewed proposal. The result must not include unrelated matches or phases. The order and labels must remain deterministic.
2. **Incomplete labels on organizer and public surfaces.** The organizer and public surfaces label the schedule as incomplete. They identify the unscheduled matches and affected Competition Phases. They must not present a partial result as a complete schedule.
3. **Explicit partial acceptance with a new intent/identity.** The user must choose a distinct partial-acceptance action. The command must create a new intent and identity. Full acceptance, regeneration, and ordinary edits must not silently use this path.
4. **Exact reviewed graph persistence without recomputation.** A successful acceptance persists the exact reviewed graph, including accepted and unscheduled data and the graph metadata required by the contract. The acceptance path must not invoke the scheduling solver or recompute the graph.
5. **Atomic availability-revision stale rejection.** The server compares the submitted availability revision with the current revision in the same atomic boundary as the acceptance writes. A stale request returns a typed stale result and writes nothing.

**Cross-cutting invariant:** **automated scheduling stays enabled** after partial acceptance. This is required for every web/shared implementation and is not a sixth numbered criterion.

### Mobile: four criteria

1. **Mobile transient proposal.** Android and iOS hold the proposal as transient review state until explicit confirmation. They show the exact unscheduled matches, affected Competition Phases, and incomplete status data supplied by the contract. They do not store the proposal as an accepted schedule before confirmation.
2. **Android/iOS confirmation.** Both platforms provide an explicit partial-acceptance confirmation. Each platform sends the reviewed graph reference or payload, the current availability revision, and the new acceptance intent/identity through the shared gateway contract.
3. **Setup retention.** After a stale rejection or another non-successful confirmation result, mobile retains the scheduling setup and review context. The user can recover, refresh, or retry without re-entering the setup. A successful confirmation clears or advances state only according to the existing repository convention.
4. **One Room transaction and typed stale rejection.** The confirmed mobile persistence path uses one Room transaction at the Room repository boundary. The stale response remains a typed stale rejection through DTO, gateway, repository, component, and screen layers. It must not become a generic error or leave partial local data.

# Context Boundary

In scope:

- the Issue 38 site/shared contract needed to represent an incomplete proposal and partial acceptance;
- server authorization, validation, identity creation, exact graph persistence, revision protection, and typed stale rejection;
- organizer and public web labels, exact match and phase data, and explicit confirmation;
- mobile transient proposal state, Android/iOS confirmation, setup retention, Room transaction behavior, and typed stale handling;
- focused tests and checks for the changed contract and behavior;
- a necessary persistence migration, only if existing storage cannot represent the new intent, identity, graph state, or revision result.

Out of scope:

- changing the scheduling algorithm or improving its placement decisions;
- disabling, replacing, or redesigning automated scheduling;
- accepting a partial proposal without an explicit user action;
- broad UI restyling or unrelated copy changes;
- unrelated database cleanup, API redesign, or dependency upgrades;
- destructive cleanup of existing staged or unstaged user work;
- claiming that a check, migration, deployment, or review passed before it runs.

If a required change appears outside this boundary, record it as a discovery and explain the smallest Issue 38 change that can satisfy the contract.

# Plan of Work

Work in this order. Keep each change small enough to review against the five web/shared criteria and four mobile criteria.

1. **Map the existing design.** Locate the site contract, shared proposal graph types, server command and persistence seams, organizer/public web surfaces, and mobile DTO/gateway/repository/component/screen seams. Identify existing status labels, intent identity rules, availability revision source, scheduler enablement setting, and Room transaction convention.
2. **Freeze the contract.** Define the request, success result, incomplete data, new identity, and typed stale result. Reuse existing names and serialization rules. Make exact unscheduled matches and affected Competition Phases first-class data.
3. **Implement the server behavior.** Validate authorization and proposal ownership. Validate graph and revision. Use one atomic write boundary. Create the new intent/identity. Persist the reviewed graph exactly. Return a typed stale result with no writes when the revision is old. Leave automated scheduling enabled.
4. **Update web behavior.** Render the exact incomplete data on organizer and public surfaces. Add a distinct partial-acceptance action and confirmation. Handle success, typed stale rejection, and other errors without converting partial results into full results.
5. **Update mobile behavior.** Map the contract in DTOs. Send the explicit action through the gateway. Keep the proposal transient. Retain setup on rejection. Use one Room transaction for the confirmed persistence path. Expose typed stale rejection to Android and iOS components and screens.
6. **Exercise focused checks.** Run only checks that cover the changed contract and seams while implementation is in progress. Do not use a narrow passing check as proof of full completion.
7. **Verify the real surfaces and review.** Run the applicable web and mobile flows, inspect the persisted graph and identity, confirm stale atomicity, confirm automation remains enabled, and perform a final code review against every criterion. Record results in this plan.

# Concrete Steps

1. **Preserve the starting tree.** At the start of implementation, record the current base and the staged and unstaged diff boundaries. Do not alter user-owned changes. Use targeted edits that do not rewrite whole files. If a file contains mixed user work, isolate the Issue 38 hunk or stop and record the conflict.
2. **Map existing contracts and callers.** Find the proposal generation response, graph review model, match and Competition Phase identifiers, incomplete or unscheduled status values, availability revision field, schedule intent identity, and existing acceptance commands. List every server, web, Android, and iOS caller before changing a shared type.
3. **Define the shared partial-acceptance shape.** Add or extend the existing contract with:
   - the exact reviewed graph or stable reference to that graph;
   - exact `Unscheduled Matches` identifiers;
   - exact affected `Competition Phases` identifiers;
   - the submitted availability revision;
   - a new acceptance intent/identity;
   - a success result that identifies the persisted intent and incomplete state;
   - a typed stale rejection that carries the revision conflict needed for recovery.
   Keep wire serialization, nullability, and error conventions consistent with the site contract. Update all callers in the same cutover.
4. **Make the server command explicit.** Add the partial-acceptance operation at the existing server command/service seam. Require organizer authorization and the explicit action. Reject malformed, unauthorized, or no-longer-valid proposal data using existing error conventions. Do not route this command through full acceptance or regeneration.
5. **Implement atomic stale protection.** In the persistence transaction, read or lock the current availability revision and compare it with the submitted revision. On mismatch, return the typed stale rejection before any intent, graph, schedule, or availability write. On match, create the new intent/identity and persist all accepted and unscheduled graph data in the same atomic boundary. Make the comparison safe under concurrent confirmations.
6. **Prevent recomputation.** Trace the acceptance call graph and remove any solver or scheduling recomputation from this path. Persist the graph from the review payload or its immutable stored review snapshot. Add an assertion, seam-level test, or fake that fails if acceptance invokes the scheduler. Keep automated scheduling enabled and verify that its setting and future trigger remain unchanged.
7. **Persist incomplete state and labels.** Ensure stored data can distinguish a partial result from a complete result. Preserve exact match and phase IDs. Expose enough data for organizer and public reads to show incomplete labels without deriving a broad list from current schedule state.
8. **Update organizer web flow.** Add an explicit partial-acceptance control and confirmation. Show the exact unscheduled matches and affected Competition Phases before confirmation. Handle success by moving to the new intent/identity. Handle typed stale rejection by retaining the proposal and showing a refresh/review action. Keep full acceptance and regeneration behavior unchanged.
9. **Update public web flow.** Show an incomplete label and the exact unscheduled match and affected Competition Phase information for a partial result. Use wording and status components already used by the site. Do not expose organizer-only actions or imply that all matches are scheduled.
10. **Update mobile DTOs and gateway.** Map every new contract field, including incomplete data, availability revision, new intent/identity, and typed stale rejection. Send the explicit partial-acceptance operation. Preserve the server error type through the gateway. Do not map stale to a generic exception.
11. **Update the mobile repository.** Keep a generated proposal transient until confirmation. On confirmation, perform the local accepted-state write in one Room transaction at the Room repository seam. On stale rejection, leave existing setup and review data intact. Make retry behavior use the same intent identity only for the same transport attempt; a new user confirmation creates a new identity and uses refreshed revision data.
12. **Update Android and iOS components.** Model the confirmation state, success state, typed stale state, and recoverable error state. Show the exact unscheduled matches, affected Competition Phases, and incomplete label. Keep setup fields and review context after rejection. Ensure both platforms use the same observable contract even where view technology differs.
13. **Add focused checks.** Add or update checks at the existing test seams for shared serialization, server transaction behavior, web rendering and action handling, mobile mapping and repository behavior, Room atomicity, and Android/iOS confirmation. Each check must defend an observable criterion or a concurrency invariant.
14. **Run focused validation and surface checks.** Execute the smallest relevant contract, server, web, Android, and iOS checks. Exercise the real organizer and public web surfaces where available. Exercise the mobile confirmation flow on both platforms or the repository's supported platform test harness. Inspect persisted identity, graph, incomplete status, and stale no-write behavior.
15. **Perform final review.** Review the complete Issue 38 diff against base `bd683fb698daf504fc59c3a3758ebb6300721636`. Check every caller and every platform. Confirm that unrelated staged and unstaged changes remain intact. Perform a standards review for maintainability and a specification review for all five web/shared and four mobile criteria. Record actual results in `Progress` and `Outcomes & Retrospective`.

# Validation / Acceptance

Plan these checks before implementation. Do not record them as passed until they run.

## Shared and server checks

- Serialize and deserialize a proposal with exact unscheduled match IDs and affected Competition Phase IDs. Verify that no IDs are added or inferred.
- Exercise explicit partial acceptance. Verify a new intent/identity is created and a full-acceptance or regeneration path is not called.
- Submit a reviewed graph with both scheduled and unscheduled data. Verify the persisted graph matches the reviewed graph exactly, including incomplete state and metadata.
- Use a scheduler spy or equivalent seam check. Verify that acceptance does not recompute the graph.
- Submit an old availability revision while another revision is current. Verify the typed stale rejection and verify that no intent, graph, schedule, or availability write occurs.
- Submit concurrent confirmations for the same revision. Verify that only the transaction that wins the atomic revision check can persist.
- Verify that automated scheduling remains enabled after successful partial acceptance and that its normal future trigger is still available.

## Web checks

- Organizer review shows exact `Unscheduled Matches` and affected `Competition Phases`.
- Organizer confirmation requires the distinct partial-acceptance action.
- Organizer success shows the new intent/identity and incomplete result.
- Organizer stale rejection keeps the proposal available and gives a recovery action.
- Public output shows incomplete labels and exact affected data without organizer controls or a complete-schedule claim.

## Mobile checks

- DTO and gateway checks preserve all partial-acceptance fields and the typed stale result.
- Repository checks prove that the proposal is transient before confirmation.
- Repository checks prove that confirmed local persistence uses one Room transaction.
- Stale rejection checks prove that setup and review context remain available and that no partial local state is saved.
- Android checks cover explicit confirmation, success, incomplete display, and typed stale recovery.
- iOS checks cover the same observable confirmation, success, incomplete display, and typed stale recovery behavior.

## Final verification and code review

Run records now appear below. These results supersede the initial no-pass statement while preserving each timeout, skipped gate, missing variable, and dirty-tree limitation.

## Closeout verification (2026-08-31)

The latest focused site matrix passed 14 suites and 200 tests. A separate rendered organizer stale-recovery check passed 1 test. Event service/detail hydration passed 3 suites and 33 tests. Event editor passed 19 tests plus 1 wire test, and event-editor save passed 31 tests. The site database integration suite passed 5 tests. Core, replay, and public counts are retained in the prior plan/context evidence and are not restated without their exact recorded totals.

The focused web scenarios prove the explicit partial action, fresh acceptance identity, original proposal identity/revision/draft, stale `EDITOR_PROPOSAL_STALE` rejection, replay/mismatch behavior, exact graph persistence, and no scheduler recomputation. They also cover organizer stale recovery and incomplete public projections, including deterministic IDs, affected phases, privacy bounds, display-name fallback, and `placementState` hydration.

Mobile inspectable XML checks passed for DTO (3), gateway (6), session mapper (28), accepted merge (4), component (83), dialog (6), and iOS parity (4). Every listed inspectable XML check reported zero skipped, failures, and errors. The mobile cleanup behavioral and static contract checks also passed. Android/iOS source compilation passed earlier; some later Gradle/Kotlin reruns timed out during configuration. The required live mobile-to-site partial-acceptance test passed 1 test with zero skipped, failures, or errors against the local backend and worktree database.

The bounded organizer full-page suite was rerun after the unresolved-participant assertion fix and timed out at 180 seconds while emitting Mantine Portal and Modal act warnings. The isolated unresolved-participant scenario passed. The focused MatchEditModal suite also timed out in this environment. From `apps/site`, `npx tsc --noEmit` passed with exit 0 in 32.98 seconds and no output, with no environment blocker. From `apps/site`, `npm run lint:changed` failed with exit 1 in 1.90 seconds across 39 changed site files, with 161 problems (154 errors and 7 warnings). The command is non-baselined and does not establish a concrete Issue 38 regression; `schedule/page.tsx` alone reported 21 diagnostics plus broad existing complexity and hooks diagnostics. The lint gate, organizer full-page timeout, and MatchEditModal timeout remain separate close gates.

Final Standards and Spec reviews found no remaining Issue 38-specific defects. The focused checks, database integration, live mobile-to-site check, and typecheck passed. No claim is made that lint or the full organizer page suite passed.

# Idempotence / Recovery

- Preserve the pre-existing staged and unstaged tree. If an Issue 38 edit touches a line that also changed in user work, stop that edit, isolate the hunk, and record the conflict. Never resolve it by discarding user content.
- Use a stable acceptance intent identity for one user action across transport retries. The server must make a repeated request with that identity safe and must return the existing result rather than create a duplicate. A new confirmation action must create a new intent/identity.
- A stale availability revision is a normal recoverable outcome. It must have no server writes and no local accepted-state writes. Keep the proposal and setup, obtain the current proposal or revision through the existing refresh path, and require a new explicit confirmation.
- If a transaction fails after beginning, rely on the database transaction to roll back all acceptance writes. Do not add compensating writes that can leave a second partial result.
- If a mobile request times out, keep the transient proposal and intent identity until the gateway can determine whether the request succeeded. Do not silently clear setup or issue a new identity before resolving the result.
- If a required schema migration is needed, make it forward-compatible and reversible through the repository's existing migration process. Do not delete old proposal or schedule data.
- If implementation must be abandoned, revert only the Issue 38 hunks. Leave unrelated staged and unstaged changes untouched. Record the last known contract and persistence state in this plan.

# Artifacts / Notes

Completed artifacts include the explicit `PARTIAL` site/shared command and result; atomic server stale handling and exact reviewed-graph persistence; organizer and public web behavior; mobile DTO, gateway, repository, component, dialog, and Android/iOS behavior; the partial draft-ID cleanup pattern; and focused checks for the contract, stale recovery, incomplete projections, transient proposal state, Room transaction, setup retention, and typed stale rejection.

Verification artifacts are the focused suite results recorded in `Validation / Acceptance`, the rendered organizer stale result, the isolated unresolved-participant organizer result, the inspectable XML results, the mobile cleanup behavioral and static contract results, the earlier Android/iOS source-compile result, the passing terminal typecheck result, the passing site database integration result, the passing live mobile-to-site partial-acceptance result, the failed non-baselined lint output, and the final Standards and Spec review findings. The organizer full-page timeout, MatchEditModal test timeout, mobile configuration timeouts, and lint findings remain operational notes, not pass evidence.

Initial note: this plan was created without reading or changing existing files. No validation checks had run at that time.

Closeout note (2026-08-31): Updated `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, `Validation / Acceptance`, and `Artifacts / Notes` to record the completed Issue 38 implementation, focused evidence, final review, and unresolved environment limitations. This note is required so later contributors can distinguish the initial plan state from the verified closeout.

# Interfaces / Dependencies

## Site contract and shared interface

The partial-acceptance interface must carry, using the repository's existing names and serialization rules:

- proposal identity and the exact reviewed graph;
- exact `Unscheduled Matches`;
- exact affected `Competition Phases`;
- incomplete result status and labels needed by organizer, public, and mobile readers;
- submitted availability revision;
- new acceptance intent/identity;
- success identity and persisted-result reference;
- typed stale availability-revision rejection.

The interface must make the exact match and phase sets explicit. Clients must not reconstruct them from a partial schedule.

## Server and persistence dependencies

The server depends on the existing organizer authorization boundary, proposal ownership checks, availability revision source, schedule intent persistence, reviewed graph persistence, and automated scheduling enablement. The transaction must cover the revision check, new intent/identity, graph persistence, and incomplete state. The acceptance command must not depend on a scheduler run.

## Web dependencies

The organizer review and confirmation depend on the site contract and its existing proposal and intent view models. The public surface depends on the persisted incomplete result and read model. Both depend on stable match and Competition Phase labels and identifiers. Stale recovery depends on a typed client result that keeps the review state.

## Mobile dependencies

Mobile depends on the shared DTO schema, gateway transport, repository state model, Room transaction API, and platform UI state conventions. The DTO mapper must preserve the stale type. The gateway must send the new intent/identity and availability revision. The repository must keep proposals transient and retain setup after rejection. Android and iOS screens must expose the same explicit confirmation and incomplete result behavior.

## Tooling and verification dependencies

Use the repository's existing contract, server, web, Android, and iOS test commands after locating them. Use the existing database transaction test harness and mobile Room test harness. Use the existing browser or device smoke-test path for real-surface verification. A final standards and specification code review is required. The initial plan claimed no checks; the actual closeout results and limits are recorded in `Validation / Acceptance` above.
