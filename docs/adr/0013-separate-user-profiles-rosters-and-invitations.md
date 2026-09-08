# ADR-0013: Separate User Profiles, roster entries, and Team Invitations

- Status: Accepted; product design confirmed. Implementation is not authorized by this record.
- Date: 2026-09-03
- Scope: Site, backend, and mobile

A real Player can exist before an Account. Adding that Player creates a roster entry immediately, but Team access still requires accepted Team Membership. Separate User Profiles, roster entries, and invitation attempts so that roster work does not depend on Account creation and invitation history remains available.

## Settled interview decisions

- Create `UserData` for a Managed Player without creating an Account. Keep the User Profile claimable through an attached email or a claim URL.
- Require an authenticated Account and explicit confirmation for a Profile Claim. Do not transfer a profile that another Account already controls.
- When a profile has an attached email address, require verification of that address before a Profile Claim or Profile Merge. If the Account uses a different email address, require verification of the attached address or an authorized correction followed by a new claim link. A valid claim URL does not bypass this check. Profiles without an email address can use a valid claim URL with authentication and explicit confirmation.
- Let authorized managers correct an unverified contact on an unclaimed User Profile. Invalidate old claim links, retain correction history, and issue a new invitation that requires verification of the corrected address. Changes to verified contacts or claimed profiles must go through the Player, an authorized guardian, or support, not a Team manager.
- When the Account already has a claimed User Profile, keep that profile as the primary identity. After claim verification and explicit confirmation, merge the unclaimed profile's roster and invitation associations into it. Preserve both histories and a record of the Profile Merge. Do not overwrite the claimed profile's personal details with manager-entered values. Never merge profiles based on a matching name alone.
- Keep each child's User Profile separate. A parent accepts invitations for the named child through an active Guardian Relationship. Do not merge a child's profile into the parent's profile or a sibling's profile. Email verification proves control of the address, not that the recipient is the Player.
- On site and mobile, add an "Is a minor" checkbox to the new Player invitation fields. When selected, require a date-only birthdate and a guardian email address. Create the child's `UserData` with that birthdate, without creating an Account. Direct the invitation to the guardian.
- A manager can add an adult Player without supplying a birthdate. During claim, use the Player's existing birthdate when available. Otherwise, ask the Player for a date-only birthdate. Use that birthdate to select adult or guardian invitation acceptance. Keep the roster entry in place while these steps are incomplete.
- Store the Guardian Contact separately from the child's personal email address. Several children can share a Guardian Contact. A guardian invitation identifies the child whose Team Membership is being accepted; it does not invite the guardian to claim that child as their own identity.
- Establish a first Guardian Relationship in one guided invitation flow. Require sign-in, verification of the guardian email, review of the child's details, and an explicit Guardian Declaration. Record the declaration and confirmation time. Then activate the Guardian Relationship and accept the Team Invitation. This records declared authority; email verification alone is not proof of guardianship. Reuse an existing active Guardian Relationship without repeating its setup.
- Use birthdate to apply the existing under-18 boundary. Before age 18, creating an Account does not remove the guardian requirement for Team acceptance. At age 18, end access granted solely by the Guardian Relationship. Preserve relationship and document history. An adult who still needs an Account uses the verified claim flow for their existing User Profile, not a new Player identity.
- Add invited Players to the planned roster immediately. Count them toward Team roster capacity and include them in Event roster review. Do not grant Team permissions before acceptance.
- Managers see invitation state and history. Authorized hosts see the complete Event roster and missing Document Requirements. Match officials see the complete relevant roster and readiness status. Hosts and officials do not receive invitation history through roster access.
- Use one manager roster list for accepted and unaccepted Players. Show "Managed profile" for a Player without their own Account. Show invitation status separately as "Awaiting player", "Awaiting guardian", or "Invitation expired". For Players without an email, provide "Share invite link". Accepted Players have no pending badge. These indicators are manager-only and use the same labels on site and mobile.
- Regular Team members and public viewers do not see an unaccepted Player's identity through the roster.
- Evaluate Document Requirements for unaccepted and Managed Players. Report missing signatures instead of omitting those Players. This change does not add new registration, check-in, or participation blocks.
- Complete required documents through normal Player signing after Profile Claim, appropriate guardian signing, or an Imported Signed Document from authorized Organization staff under the approved Document Import Attestation model. Preserve existing required Signer roles and document scope. A Team manager cannot mark a document complete without the required evidence.
- When a manager adds a Player during an Event join journey, update the Team roster and the current Event roster only. Adding the Player to another upcoming Event is an explicit action.
- After creating a Team during Event join, make "Add players" optional. Provide a clear "Continue to event" action that selects the new Team and resumes the originating Event registration flow. Managers can add Players now or later. Pending invitation acceptance does not delay registration. Existing Event rules still apply.
- Use a short Event-specific journey: required Team details, optional "Add players", then Event review and confirmation. Reuse the normal Team and Player forms without requiring the full Team-management wizard. Keep staff setup and free-agent discovery optional or available later. Return to the original Event with the new Team selected. Require explicit final confirmation to register.
- For returning managers, preselect the previously used Team when it remains eligible, including when several Teams are available. If there is no eligible previous Team, select the sole eligible Team or show a compact picker when several are eligible. Continue directly to Event registration review with "Change team" and "Add players" available. Do not repeat Team creation or roster setup.
- Remember the last Team used for a completed Event registration in the same sport for each Account. Share this preference across site and mobile. An abandoned signup keeps its own draft Team selection without replacing the completed-registration preference.
- When a manager leaves before Event registration completes, keep saved Teams, Players, and Team Invitations. Save an Event Registration Draft and offer "Continue registration" on site and mobile. Resume the next incomplete step. Recheck Event availability and eligibility. Resuming must not create duplicate Teams or send duplicate invitations.
- A recipient decline removes the current roster entry and frees the slot. Retain the invitation outcome. Use Declined for recipient rejection and Cancelled for sender withdrawal.
- Keep ordinary "Decline" available. "Decline and block" opens a choice to block the user who sent the invitation or to block the Team. Reuse individual-user blocking for the sender choice. The Team choice prevents future roster additions, invitations, and reminders from any manager of that Team. The Player or an authorized guardian can later remove the Team Block. Preserve invitation history for abuse review.
- A User Block can target only an active Account. An unclaimed User Profile cannot be blocked. Enforce this rule in the interface and backend. A merge into an existing claimed profile retains that Account's existing blocks; there are no incoming User Blocks against the unclaimed profile to combine. Team Blocks remain a separate restriction on a Team.
- When a guardian chooses "Block sender", the User Block belongs to the guardian's Account. It stops that sender's invitations to the guardian, including invitations for their children. When a guardian chooses "Block Team", the Team Block applies only to the named child and Team. It does not affect a sibling's participation.
- When blocking an invitation sender, keep "Leave all chats with this user" available but unchecked by default on site and mobile. Leave shared chats only when the recipient explicitly selects that option. Blocking the sender still prevents their invitation actions.
- Invitation expiry keeps the Player on the Team and Event rosters. Managers see "Invitation expired" and can send a new invitation attempt. Team access remains unavailable before acceptance. Authorized staff continue to see missing Document Requirements. Expiry is not a decline and does not remove the Player automatically.
- A new invitation after decline, cancellation, or expiry gets a new attempt ID. An Invitation Reminder keeps the pending attempt ID and adds delivery history. Permit only one current pending invitation per Team and User Profile.
- Permit a new invitation immediately after an ordinary decline. Do not impose a cooldown or require the Player to submit a join request. This lets a manager correct an accidental decline, including for Teams that do not accept join requests. Keep the declined attempt in history. A User Block or Team Block still prevents the relevant invitation.
- Derive the current roster invitation label from the current attempt. Keep prior outcomes available for abuse review.
- Keep routine invitation history for 90 days after an attempt's final outcome. Hold only the evidence needed for an open abuse report. Resending, unblocking, or deleting the sender's Account must not silently erase held evidence. When the report closes, release the hold and apply normal cleanup. This retention rule applies to the invitation histories described above. Invitation history cleanup must not remove a User Profile, accepted Team Membership, or roster entry.

## Consequences

The current accountless invite is not sufficient as the Player identity. The implementation must retain User Profile identity when an Account claims it and must include unaccepted Players in Event roster and compliance associations.

The current repeat-invite path reuses a previous invite row, and cancellation deletes that row. The new history model must preserve terminal outcomes instead. Team permission checks must remain separate from roster presence on both site and mobile.

Individual-user blocking already exists on site and mobile. The current backend removes social connections and leaves shared chats unless the caller opts out. Team invitation creation and resend do not currently enforce this block. The new invitation flow must enforce the selected User Block or Team Block before roster addition and invitation delivery.

The current User Block endpoint checks that the target User Profile exists. It does not check that the target has an active Account. The new target rule requires that additional check.

The current unblock operation clears related block moderation reports. Invitation attempt history must remain separate so that an unblock does not erase the invitation abuse trail.

Current invitation listing cleanup removes eligible declined, rejected, and failed invitations after a 90-day window based on their last update or creation. Account deletion also deletes invitations sent by the deleted Account. These paths can remove abuse evidence. The public privacy policy does not specify an invitation-history retention duration.

The current backend supports separate child profiles through active parent-child links. Its personal email field is unique across profiles. A shared Guardian Contact must not use that field on each child's profile.

The current Team invitation rules treat a missing birthdate as minor status. The claim journey must collect a missing birthdate before it selects the invitation acceptance path. An unchecked "Is a minor" checkbox is not proof of adult status.

Current Team invitation authority changes at age 18. Family profile access has no corresponding age cutoff; an active or pending parent-child link can still permit personal-detail edits. Account signup can also reuse a child profile by personal email without a dedicated child claim confirmation. The accepted claim and guardian boundaries must cover these paths, not only Team invitation screens.

## Design confirmation

The Event checkout presentation and individual-only child entry rules are extended by [ADR 0014](0014-use-one-event-checkout-with-explicit-registrant-selection.md). Team and roster saves remain separate from explicit Event registration confirmation.

All interview decisions are settled. The user confirmed the complete product design and requested a specification.

This record authorizes no application implementation or runtime change. Specification publication is a separate requested action.
