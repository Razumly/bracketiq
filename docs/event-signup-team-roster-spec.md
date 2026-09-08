# Guide Event signup and separate roster placement from invitation acceptance

## Problem Statement

A new Team manager cannot complete Event signup as one clear journey. Creating a Team sends the manager into general Team management. The manager must return to the Event and select the new Team manually. The general builder also includes steps that are not required to join the Event.

A returning manager repeats Team selection and setup decisions. Site and mobile do not preserve the same signup state. A manager who changes devices can lose the selected Team or the next step.

Adding a Player also has several conflicting meanings. An invitation can exist without a durable User Profile. An unaccepted Player can be absent from roster or document review. A manager cannot reliably distinguish a Managed Player from a Player who has an Account but has not accepted an invitation.

The current invitation lifecycle does not preserve a complete attempt history. Some repeat invitations overwrite an earlier attempt. Some cancellation and Account deletion paths delete invitations. Existing individual blocking does not consistently stop Team invitation actions. These behaviors make accidental declines, repeated unwanted invitations, and abuse review difficult to handle.

## Solution

Provide one short Event signup journey on site and mobile. Keep the Event context while the manager creates a Team or adds Players. Reuse normal Team and Player forms, but do not require the full Team-management wizard.

For a new Team, the journey is: required Team details, optional Add players, then the original Event review and explicit registration confirmation. Staff setup and free-agent discovery remain optional or available later. Pending Player acceptance does not add a new registration block. Existing Event rules still apply.

For a returning manager, select the last eligible Team used for a completed Event registration in the same sport. Go directly to Event review with Change team and Add players available. Keep an unfinished Event Registration Draft separate from this preference. Resume the next incomplete step on either platform.

Add Players to the roster immediately. Separate their durable User Profiles, roster entries, accepted Team Memberships, and invitation attempts. A Player can exist without an Account. Invitation acceptance grants Team access; it does not create the Player's identity or first roster placement.

Give managers one complete roster with separate profile and invitation indicators. Give authorized Event Hosts and match officials complete relevant rosters and document readiness. Keep invitation state and history out of their roster access. Protect unaccepted Player identities from regular Team members and public viewers.

Support verified Profile Claims, confirmed Profile Merges, and guardian acceptance for minors. Preserve identity and history. Give recipients a plain Decline action and a separate Decline and block action. Preserve routine invitation history for 90 days after the final outcome, with a limited evidence hold for an open abuse report.

## User Stories

### Event signup

1. As a new Team manager, I want Event signup to show the next required action, so that I can complete registration without knowing the Team-management structure.
2. As a new Team manager, I want to create a Team inside the Event journey, so that I do not lose the Event I intended to join.
3. As a new Team manager, I want to enter only required Team details, so that optional setup does not delay registration.
4. As a Team manager, I want to add Players after Team creation or continue without them, so that I can register before completing roster administration.
5. As a Team manager, I want Continue to event to select the new Team, so that I do not need to find and select it again.
6. As a Team manager, I want to review the Event registration before I confirm it, so that creating a Team does not register or charge me automatically.
7. As a Team manager, I want staff setup and free-agent discovery to remain available outside the required journey, so that I can use those features when needed.
8. As a returning Team manager, I want my last eligible Team from a completed registration in the same sport selected, so that repeated signup is fast.
9. As a returning Team manager, I want Change team and Add players on Event review, so that a remembered Team does not prevent a different choice.
10. As a Team manager without an eligible remembered Team, I want the sole eligible Team selected or a compact choice when several qualify, so that the fallback is clear.
11. As a Team manager, I want my unfinished Event's Team selection kept separate from my completed-registration preference, so that an abandoned signup does not change later defaults.
12. As a Team manager, I want to resume an unfinished registration on site or mobile, so that switching devices does not repeat completed steps.
13. As a Team manager, I want saved Teams, Players, and invitations to remain when I leave signup, so that completed work is not discarded.
14. As a Team manager, I want resume and retry to avoid duplicate Teams and invitations, so that a connection failure does not create duplicate work.
15. As a Team manager, I want Event availability and Team eligibility checked again when I resume, so that stale progress cannot complete an invalid registration.

### Roster placement and visibility

16. As a Team manager, I want an added Player to appear on the roster immediately, so that the roster reflects the people I intend to bring.
17. As a Team manager, I want an unaccepted Player to reserve a Team roster slot, so that pending invitations cannot exceed roster capacity.
18. As a Team manager, I want one list for accepted and unaccepted Players, so that I do not have to compare separate rosters.
19. As a Team manager, I want Managed profile shown separately from invitation status, so that I can distinguish Account ownership from acceptance.
20. As a Team manager, I want Awaiting player, Awaiting guardian, and Invitation expired states, so that I know which action is still required.
21. As a Team manager, I want Share invite link for a Player without email, so that the Player can claim their existing profile later.
22. As an invited Player, I want Team permissions withheld until acceptance, so that a manager cannot grant participation access on my behalf.
23. As an authorized Event Host, I want the full Event roster, including unaccepted and Managed Players, so that I can prepare for the actual participants.
24. As a match official, I want the complete roster and readiness status for my relevant match, so that I can perform my assigned duties.
25. As an invited Player, I want my unaccepted identity hidden from regular Team members and public roster viewers, so that an invitation does not expose me to those audiences.
26. As a Team manager, I want a Player added during signup assigned to the Team and the current Event only, so that another upcoming Event's roster does not change silently.
27. As a Team manager, I want accepted Players to lose pending invitation badges, so that completed acceptance is clear.

### User Profiles, claims, and corrections

28. As a Team manager, I want to add a real Player without creating an Account, so that roster work does not depend on the Player signing up first.
29. As a Player without an Account, I want to claim my existing User Profile, so that my roster associations remain attached to the same person.
30. As a Player, I want authentication and explicit claim confirmation, so that opening a link alone cannot attach a profile to an Account.
31. As a Player with an attached personal email, I want that address verified during claim, so that a forwarded URL cannot bypass proof of email control.
32. As a Player without an attached personal email, I want a valid claim URL to work after authentication and confirmation, so that email is not required for every Managed Player.
33. As a Player with an existing claimed profile, I want a verified merge into that primary profile, so that I do not end up with two identities.
34. As a Player with an existing claimed profile, I want my personal details preserved during merge, so that manager-entered values do not overwrite my own details.
35. As a Player, I want profiles kept separate unless claim proof and explicit confirmation support a merge, so that people with matching names are not combined.
36. As a Team manager, I want to correct an unverified contact on an unclaimed profile, so that an address error does not require a duplicate Player.
37. As a Player, I want old claim links invalidated after an authorized contact correction, so that an earlier recipient cannot use stale access.
38. As a Player with verified contact details or a claimed profile, I want changes restricted to myself, an authorized guardian, or support, so that a Team manager cannot take control of my identity.

### Minors and guardians

39. As a Team manager, I want an Is a minor checkbox in the new Player form, so that I can direct acceptance to a guardian.
40. As a Team manager adding a minor, I want birthdate and guardian email required, so that the child profile and acceptance route are established together.
41. As a guardian of several children, I want one Guardian Contact usable for separate child profiles, so that siblings do not need unique parent email addresses.
42. As a guardian, I want the invitation to identify the named child, so that accepting for one child cannot claim the child as my own identity or affect a sibling.
43. As a first-time guardian, I want one guided sign-in, email verification, child review, declaration, and acceptance journey, so that I can finish without navigating separate setup screens.
44. As a returning guardian, I want my existing active Guardian Relationship reused, so that I do not repeat completed setup.
45. As a Player whose birthdate is missing, I want birthdate collected before acceptance authority is selected, so that an unchecked manager checkbox is not treated as proof of adulthood.
46. As a minor with an Account, I want guardian-required Team acceptance to remain in effect, so that Account creation does not bypass the age rule.
47. As a Player turning 18, I want access granted solely through guardianship to end, so that I control my adult profile while relationship and document history remain.
48. As an adult without an Account, I want to claim my existing child profile, so that becoming an adult does not create another Player identity.

### Documents and readiness

49. As an authorized Event Host, I want missing signatures reported for unaccepted and Managed Players, so that an absent Account cannot hide an incomplete requirement.
50. As a Player or authorized guardian, I want to complete the required signing flow, so that the correct person's evidence satisfies the requirement.
51. As an authorized Organization staff member, I want supported externally signed evidence attached through the approved import and attestation model, so that valid evidence can satisfy a Managed Player's requirement.
52. As an Event Host, I want document completion to preserve required Signer roles, Version, and scope, so that a Team manager cannot mark a requirement complete without evidence.
53. As a Team manager, I want missing-document visibility without new registration or participation blocks, so that this feature does not silently change Event policy.

### Invitation outcomes and safety

54. As an invited Player, I want plain Decline to remove the current roster entry, so that I am not listed as a current Player after rejecting the invitation.
55. As a Team manager, I want a new invitation allowed immediately after ordinary decline, so that an accidental decline can be corrected even when join requests are disabled.
56. As a recipient, I want each new attempt to keep its own outcome, so that repeated invitations do not overwrite my earlier declines.
57. As a Team manager, I want a reminder to remain part of the current pending attempt, so that delivery history does not create duplicate roster entries or invitations.
58. As a Team manager, I want invitation expiry to keep the Player on the roster with an expired label, so that lack of a response is not treated as rejection.
59. As a recipient, I want Decline and block to let me select the sender or the Team, so that I can choose the scope of unwanted contact.
60. As a recipient, I want a Team Block to stop additions, invitations, and reminders from every manager of that Team, so that changing the sender cannot bypass the restriction.
61. As an Account holder, I want User Blocks to target active Accounts only, so that an inactive, unclaimed User Profile is not treated as a social Account.
62. As a recipient blocking a sender, I want Leave all chats with this user unchecked, so that blocking an invitation does not leave shared chats without my explicit choice.
63. As a guardian, I want Block sender applied to my Account and Block Team applied to the named child and Team, so that the two choices have clear, different scopes.
64. As a Player or authorized guardian, I want to remove a Team Block, so that I can permit future invitations without erasing previous outcomes.
65. As a Player merging a profile, I want my existing Account's blocks preserved, so that identity cleanup cannot remove my safety choices.
66. As an authorized abuse reviewer, I want necessary invitation evidence held while a report is open, so that resend, unblock, or sender Account deletion cannot silently erase it.
67. As a Player, I want routine invitation history removed after its retention window without removing my profile or membership, so that invitation data does not define my continued participation.

## Implementation Decisions

### Shared application boundary

- The backend owns the persistent rules, authorization, and HTTP contract. Site and mobile consume the same behavior. Do not implement safety rules only in a client.
- Extend the existing Event registration, Team management, invitation, identity, family, social blocking, and compliance modules. Reuse their public application boundaries before adding new ones.
- Keep the Event-specific journey separate from the full Team-management wizard. Share Team and Player form behavior and validation. Do not fork the domain rules between the two journeys.
- Keep the npm and Gradle build graphs separate. Mobile must not import server TypeScript or Prisma types.
- Coordinate each HTTP contract change with site and mobile callers. Use the repository's clean-cutover rule. Do not add a second legacy invitation model for one client.
- Store fetched mobile state in Room before screens observe it, except for an explicitly documented transient form state. Use batch reads for collections.
- Keep Team eligibility authoritative on the backend. Align the picker and review with that result. Do not broaden eligible management roles through client-only changes.

### Event journey and saved progress

- Preserve the originating Event and its existing registration context while creating a Team or adding Players. Preserve applicable Division, Occurrence, question answers, registration references, and valid progress.
- For a new Team, show required Team details, optional Add players, and then Event review. Continue to event selects the created Team. It does not complete Participant Registration or initiate an unconfirmed charge.
- Keep existing required Event questions, signing steps, payment choices, eligibility checks, and final confirmation behavior. The short Team setup does not bypass them.
- Offer staff setup and free-agent discovery as optional actions or later Team management. Do not make them mandatory steps in Event signup.
- For a new signup, use the last eligible Team from the Account's completed registration in the same sport. If none qualifies, select the sole eligible Team. Show a compact picker when several qualify. Offer Team creation when no eligible Team exists.
- On resume, use the Event Registration Draft's own selection if still eligible. Do not replace it with the last-used Team preference.
- Persist the completed-registration preference per Account and sport so both platforms use it. Update it only after completed Event registration, not after Team creation, selection, or an abandoned draft.
- Persist an Account-scoped Event Registration Draft with the selected Team and completed steps. Keep it distinct from an accepted Participant Registration and from saved Team or Player records.
- Resume the next incomplete step. Recheck Event availability and Team eligibility. Preserve valid progress and show an explicit error or required choice when old progress cannot be used.
- Closing signup keeps already saved Teams, Players, and invitation attempts. Resuming must not repeat their creation or delivery.

### User Profiles, roster entries, and permissions

- Create a durable User Profile when adding a new real Player. The current persistence model is UserData. Do not create an authentication Account for that Player.
- Represent Team Roster Entry, Event Team Roster Entry, accepted Team Membership, and Team Invitation as separate concepts. Their storage can reuse existing structures only if it preserves these independent lifecycles.
- Adding a Player creates current roster placement immediately and reserves one Team roster slot. Do not count the Player and their pending invitation as two slots.
- Team roster capacity is not Event Registration Capacity. A Team registration does not consume an additional Event registration slot for each Player.
- Pending invitation acceptance does not grant Team permissions or Team chat access. Authorize membership access independently from roster presence.
- A Player added during Event signup belongs to the canonical Team roster and the current Event's roster selection. Do not create a completed Event registration as a side effect. Apply the selection to the current Event Team when registration creates or updates it.
- Do not silently add that Player to every other upcoming Event. Preserve the independent scope of each Event roster and existing protected participation history.
- Managers see accepted and unaccepted Players in one roster. Show Managed profile independently from Awaiting player, Awaiting guardian, or Invitation expired. An accepted Managed Player can still have Managed profile without a pending invitation badge.
- Provide Share invite link for a Player without email. These management indicators use the same labels and meanings on site and mobile.
- Authorized Event Hosts see the complete Event roster and missing Document Requirements. Match officials see the complete roster and readiness needed for their assigned work. Neither role gains invitation history through roster access.
- Regular Team members and public viewers must not receive unaccepted Player identities through roster responses. Filtering is a backend access rule, not only a hidden UI badge.

### Claims, merges, and contact corrections

- Require authentication, valid claim proof, and explicit confirmation before an Account claims an unclaimed User Profile. A claim URL is not a login credential.
- If the profile has an attached personal email, verify that address. A valid URL does not bypass the check. An Account with a different email must verify the attached address or use an authorized contact correction followed by a new link.
- If no personal email is attached, a valid claim URL can provide claim proof with authentication and explicit confirmation.
- Do not transfer a profile already controlled by another Account. Do not infer a Profile Claim or Profile Merge from a matching name.
- If the Account already has a claimed profile, keep it primary. After proof and explicit confirmation, move the unclaimed profile's roster and invitation associations into it. Preserve both histories and a merge record. Keep existing personal details unchanged.
- Preserve identity-linked Event Participation and document associations through claim or merge. Do not lose signed evidence or infer completion for a different Document Subject or scope.
- Preserve the existing Account's blocks during merge. An unclaimed User Profile cannot be a User Block target, so do not invent incoming User Blocks against it.
- An authorized manager can correct an unverified contact on an unclaimed profile. Keep the correction history. Invalidate old claim links. Issue a new invitation that requires proof of the corrected address.
- Changes to verified contacts or claimed profiles require the Player, an authorized guardian, or support. General Team-management access is not sufficient.

### Minors and Guardian Relationships

- Add Is a minor to the new Player invitation form on site and mobile. When selected, require date-only birthdate and guardian email. Create the child User Profile with that birthdate and no Account. Send the invitation to the guardian.
- Keep Guardian Contact separate from the child's personal email. Several children can share a Guardian Contact. Do not copy the guardian address into a globally unique child personal-email field.
- A manager can add an adult without a birthdate. Before selecting the acceptance path, use an existing birthdate or ask the Player for a date-only birthdate. An unchecked checkbox is not proof of adulthood.
- Keep roster placement while claim, birthdate collection, or guardian setup is incomplete.
- First guardian setup is one guided journey: authenticate, verify the guardian email, review the named child, confirm a Guardian Declaration, activate the Guardian Relationship, and accept the Team Invitation.
- Store the declaration and its confirmation time. Describe it as declared authority, not independent proof of guardianship. Email verification alone does not establish parental authority.
- Reuse an existing active Guardian Relationship for subsequent acceptance. Do not repeat completed setup without a reason.
- Never merge a child's profile into the guardian's own profile or a sibling's profile. Guardian acceptance acts for the named child and does not claim that child as the Account holder's own identity.
- Use the existing under-18 boundary. Creating an Account before 18 does not remove the guardian requirement for Team acceptance.
- At 18, remove access granted solely by a Guardian Relationship. Keep relationship and document history. Apply the boundary to family profile access and edits as well as Team invitation actions.
- An adult without an Account uses verified claim on the existing User Profile. Do not create another Player identity as the child becomes an adult.

### Invitation lifecycle, blocking, and retention

- Keep each new invitation attempt as a distinct record with its own identity, sender, recipient User Profile, Team, time, and outcome. Associate guardian action with the named child and acting Account where applicable.
- Permit at most one current pending attempt for a Team and User Profile. An Invitation Reminder adds delivery history to that attempt instead of creating another attempt.
- A new invitation after decline, cancellation, or expiry gets a new attempt ID. The current roster label comes from the current attempt, not an overwritten historical outcome.
- Use Declined for recipient rejection and Cancelled for sender withdrawal. Replace destructive invitation cancellation with a retained terminal outcome. Preserve the current removal behavior for an explicitly withdrawn pending roster assignment; do not rewrite completed Event history.
- A recipient decline removes the current roster entry and frees the roster slot. It does not delete the User Profile or the invitation outcome.
- Permit immediate reinvitation after an ordinary decline. Do not add a cooldown or require a join request. A recipient block still prevents the relevant action.
- Expiry keeps the Player on Team and Event rosters. Show Invitation expired to managers. Do not grant Team access. Keep missing Document Requirements visible. A later invitation is a new attempt.
- Keep plain Decline. Decline and block opens a scope choice: Block sender or Block Team.
- Reuse individual User Block behavior for Block sender. Its target must have an active Account. Enforce the target rule in the UI and backend. An unclaimed User Profile is not a valid target.
- A Team Block prevents new roster additions, invitations, and reminders for that Player from every manager of the Team. The Player or an authorized guardian can remove it.
- For guardian action, Block sender belongs to the guardian's Account and stops that sender's invitations to the guardian, including invitations for their children. Block Team applies to the named child and Team, not siblings.
- In invitation blocking, keep Leave all chats with this user available and unchecked on both platforms. Leave shared chats only when explicitly selected. Preserve other established sender-block effects.
- Enforce the applicable User Block or Team Block before roster addition and invitation delivery. Apply the check to reminders and direct API calls as well as UI actions.
- Keep routine invitation history for 90 days after the attempt's final outcome. A resend, later attempt, or unrelated update must not reset an earlier attempt's final-outcome time.
- Hold only evidence needed for an open abuse report. Resending, unblocking, or deleting the sender's Account must not silently erase held evidence. Keep this hold independent from reports that the existing unblock operation clears.
- When the report closes, release the hold and apply normal cleanup. Do not start a new 90-day window at report closure. Evidence older than the ordinary window becomes eligible for cleanup after release.
- History cleanup must not remove a User Profile, accepted Team Membership, or roster entry. Do not make current participation depend on the continued existence of a closed invitation.

### Document readiness

- Include unaccepted and Managed Players in the current Event's Document Requirement evaluation. Do not require an Account or an unrelated individual registration row before showing the Player's missing signatures.
- Use Document Requirement Satisfaction for completion. Preserve the Document Subject, immutable Document Template Version, required Signer roles, validity, and Organization-wide or Event Participation scope.
- Support completion through normal Player signing after claim, appropriate guardian signing, or Imported Signed Document evidence under the approved Document Import Attestation model.
- A Team manager cannot mark a requirement complete without the required evidence and authority. Do not equate roster placement or invitation acceptance with document completion.
- This feature adds visibility for existing requirements. It does not add new registration, check-in, or participation blocks.

### Save, retry, and existing-data behavior

- Save related application records in one server transaction. A failed related write rolls back that complete save. Do not leave a profile, roster entry, or invitation in a contradictory partial state.
- Keep the long signup journey as separate explicit saves. Leaving a later step does not roll back an earlier successful Team or Player save.
- Distinguish committed application state from external delivery status. A delivery failure must not cause the client to recreate a successfully saved Team or Player. Provide a safe delivery retry without duplicate attempts or duplicate sends on registration resume.
- Make retries of the same operation and competing requests safe. Reuse the completed result when appropriate. Enforce one current pending attempt and one current roster assignment for the same scope.
- Make decline with a selected block one coherent operation. A failure must not leave the client claiming that a block is active when it is not.
- Apply the new identity and history rules to existing supported invitation entry points, not only the new Event UI. Cover Team management, share links, invitation inboxes, reminders, guardian actions, Account deletion, and cleanup.
- Preserve existing profile identifiers and evidence where valid. Convert current accountless Player invitations into durable profile associations without creating Accounts or merging by name. Do not fabricate outcomes that were already overwritten or deleted.
- Align current and historical invitation readers with the new terminal-outcome model. Remove code paths that assume cancelling an invitation deletes its identity or that roster presence proves accepted Team Membership.

## Testing Decisions

### Test boundaries

- Use the shared backend HTTP API as the main behavior boundary. Test complete commands and subsequent authorized reads for Team creation, Player addition, claim, acceptance, decline, blocking, roster visibility, and document readiness.
- Use the existing site registration and Team UI boundaries for navigation, selection, validation, and resume behavior. Exercise actions and their visible outcomes. Do not test only the presence of copy or components.
- Use the existing mobile registration coordinator, Team UI, and mobile-to-backend integration harness for the same observable flows. Confirm that remote results reach Room before rendered state changes.
- Use the existing cleanup boundary with a controlled clock for retention. Some retention effects have no direct interactive command; do not add a public API only to make them testable.
- Use a dedicated test database for transaction, uniqueness, migration, and concurrency checks. Assert persisted outcomes through application reads where possible. Do not treat mocked transaction call order as proof that rollback works.
- Keep pure state tests only when they cover a meaningful boundary that stronger workflow tests do not cover. Do not require every new private helper to have a separate test seam.

### Prior art

- Existing site registration progress tests restore selected Team, Division, answers, registration references, and hold state. Extend the observable resume contract to shared persistence.
- Existing site registration workflow tests cover exclusive questions, signing, and payment phases. Existing Team builder and Player invitation UI tests provide interaction harnesses for the short journey.
- Existing invitation route tests cover acceptance, decline, claim links, Team membership, and Event roster synchronization. Some assert invite deletion or internal call order. Replace those assumptions with retained outcomes and externally visible access rules.
- Existing Event Team compliance route tests cover authorized roster and Document Requirement Satisfaction reads. Extend them to unaccepted and Managed Players.
- Existing family, User Block, Account deletion, and invitation listing tests provide boundaries for guardian authority, block effects, deletion, and retention.
- Mobile EventRegistrationFlowCoordinatorTest and EventDetailMobileJoinFlowTest provide registration state and navigation coverage. CreateTeamBuilderUiTest and TeamInviteDialogUiTest provide Team setup interaction coverage.
- TeamRegistrationMobileApiIntegrationTest uses MobileApiTestSession against an explicitly configured backend. Reuse that integration pattern for real HTTP contract behavior. It is not currently proof of this proposed invitation lifecycle.

### Required behavioral coverage

1. A manager without an eligible Team creates one, optionally adds Players, returns to the same Event with that Team selected, and reaches review without final registration or charge.
2. A returning manager skips creation and roster setup. Cover several eligible Teams with a remembered selection, one eligible fallback, several fallbacks, and no eligible Team.
3. The last-used preference changes only after successful Event registration in the same sport. Another sport and an abandoned draft do not overwrite it.
4. A site draft resumes on mobile and a mobile draft resumes on site. Preserve the selected Team and valid registration context. Recheck a removed Team, lost management authority, and unavailable Event.
5. A retry after a saved Team, saved Player, or failed delivery does not duplicate identities, roster entries, or invitation attempts. Closing and resuming does not resend invitations.
6. A new Player with email and a new Player without email each receive a durable User Profile without an Account. Each occupies one roster slot before acceptance and no additional Event Registration Capacity.
7. Pending roster presence does not grant Team access or chat access. Check direct API requests, not only hidden UI controls.
8. Managers see complete roster status. Authorized hosts and officials see the permitted roster and readiness without invitation history. Regular members and public viewers do not receive unaccepted identities.
9. Adding a Player during one Event signup changes the canonical Team and current Event selection only. Another upcoming Event and completed participation history remain unchanged.
10. Claim rejects missing authentication, missing confirmation, invalid or stale links, unverified attached email, and a profile claimed by another Account. Valid no-email URL claim succeeds only with authentication and confirmation.
11. A verified, confirmed merge keeps the existing claimed profile primary. It preserves its personal details, roster and invitation associations, existing blocks, and history. Matching names alone do not merge profiles.
12. Contact correction on an unclaimed profile invalidates earlier links and records the correction. Managers cannot change verified contacts or claimed identities through this path.
13. Selecting Is a minor requires date-only birthdate and guardian email. Siblings can share Guardian Contact without sharing User Profile identity or overwriting personal email.
14. First guardian acceptance requires the named child, verified guardian contact, explicit declaration, and active relationship. A returning active guardian does not repeat setup. An unrelated Account cannot act for the child.
15. Missing birthdate does not default to adult acceptance. A minor's Account does not bypass guardian acceptance. Test immediately before and at age 18, including family profile reads and edits.
16. Decline removes the current roster entry and frees capacity while retaining the outcome. Immediate reinvitation succeeds without a join-request requirement and creates a distinct attempt.
17. A reminder preserves the pending attempt identity and adds delivery history. Concurrent adds or resends do not create multiple current pending attempts.
18. Expiry retains roster placement, denies unaccepted Team access, and shows the expired manager state. A later invitation creates a new attempt.
19. Cancellation retains a terminal outcome. Old links and actions must not change a newer attempt or reintroduce a withdrawn roster assignment.
20. Block sender and Block Team enforce their different scopes. Cover a second manager on the same Team, the same sender on another Team, direct addition, reminders, and unblock.
21. User Block rejects an unclaimed target in the API and UI. Guardian sender-block affects contact to that guardian. Guardian Team Block affects only the named child and Team.
22. Invitation sender-block leaves shared chats intact by default. Explicitly selecting Leave all chats with this user performs that action. Decline and block failure reports the actual saved state.
23. Unaccepted and Managed Players appear with missing required signatures. Accepted invitation alone does not satisfy documents. Valid Player, guardian, or approved imported evidence satisfies only the intended Version, Signer roles, and scope.
24. A controlled clock proves routine cleanup after 90 days from the final outcome. A new invitation or reminder cannot reset an older attempt's retention age.
25. An open abuse report preserves only needed held evidence through unblock, resend, and sender Account deletion. Closing the report releases the hold and uses the original retention window.
26. Invitation cleanup leaves the User Profile, current roster, and accepted Team Membership intact. Pending attempts are not removed as closed history.
27. A failed related database write rolls back the full save. Concurrent claim, acceptance, decline, and reinvitation cannot transfer another Account's identity or let an obsolete action override the current attempt.
28. Existing-data conversion preserves known identities and valid associations. It does not merge matching names, create Accounts, or invent missing historical outcomes.

### Verification limits

- Test external behavior rather than private helper names, SQL text, or exact internal call order. Type checks and builds cover static contracts.
- Do not recreate Stripe, email, identity-provider, or document-provider interfaces in test doubles. Test BracketIQ at its internal provider-independent boundaries. Use separately authorized sandbox or manual checks for actual provider delivery and signing.
- Verify the short journey at desktop and mobile site sizes and in the native mobile UI. Check action order, validation, back navigation, resume, and status meanings. Capture relevant UI evidence during implementation.
- Do not start a runtime, seed a database, or run provider operations as part of this specification task. Those actions require the applicable implementation and environment authorization.

## Out of Scope

- Application implementation, migrations, runtime changes, deployment, or release during specification authoring.
- Automatic Event registration or payment after Team creation.
- New Event registration, check-in, participation, or document-completion gates.
- A mandatory full Team builder, mandatory Player entry, or mandatory staff and free-agent setup during Event signup.
- A reinvitation cooldown or a requirement to submit a join request after ordinary decline.
- User Blocks against unclaimed User Profiles.
- Automatic cross-Event roster propagation or changes to protected completed participation history.
- Automatic Account creation for manager-entered Players.
- Profile merging by name, transfer of another Account's claimed profile, or replacement of a claimed profile's personal details with manager-entered values.
- Independent legal verification of guardianship. The flow records verified email control and a Guardian Declaration.
- A redesign of document signing providers, the full external-document import system, payments, social blocking outside the affected invitation behavior, or general Team staff permissions.
- A full moderation case-management product or indefinite retention of all invitation history.
- A visual redesign unrelated to this journey or a change to the separate site and mobile build systems.

## Further Notes

- The user confirmed the product design after the analysis interview. ADR-0013, Separate User Profiles, roster entries, and Team Invitations, records those decisions. ADR-0012, Use immutable document template versions and shared satisfaction, governs document completion.
- The specification applies to site, backend, and mobile. Its project Area is Shared. Publish it as one feature specification with the ready-for-agent triage label.
- The user confirmed the test boundaries: the shared HTTP API, existing site and mobile UI flows, and the existing controlled-clock cleanup boundary. No additional product interview is required.
- Current code differences are implementation work, not reasons to weaken the design. These include general-builder navigation, inconsistent client eligibility, local-only or incomplete draft state, accountless invitations, deletion-based invitation lifecycles, incomplete block enforcement, and family access without an adult cutoff.
- Approved imported-document behavior may depend on separately delivered document work. Preserve that model and identify the dependency during implementation. Do not add a manager completion bypass if the import UI is unavailable.
- Existing site UI migration work overlaps the Team, Account, and registration surfaces. Use the current shared UI primitives during implementation. This specification selects behavior, not a replacement component library.
- Public privacy wording and Account deletion behavior must agree with the approved retention rule before rollout. This specification does not rewrite legal copy or claim legal compliance.
- A later implementation task must follow the repository's ExecPlan and workstream rules. Publishing this specification does not claim an issue, start an agent, or authorize a runtime change in this task.
