# Invitation retention and Account deletion

This document records the behavior required by issue 150. It supplies facts for public privacy wording. It does not make a legal compliance claim.

Each Team Invitation has its own final outcome time. Routine history expires 90 days after that time. Accepted, Declined, Cancelled, and Expired are final outcomes. A later invitation, reminder, report update, or Account change does not restart that window. Pending invitations are not closed history. A delivery failure does not close a Team Invitation.

Pending expiry runs in batches of at most 100 attempts. Each decision about a selected attempt checks its deadline directly. Cleanup runs at the existing invitation listing boundary. Each call removes at most 250 eligible invitation attempts. It also removes their delivery records. Pending Event reconciliation can protect an invitation record until reconciliation is safe. That protection does not prevent cleanup of other eligible records. Ordinary history reads apply the retention cutoff even when physical cleanup has a backlog.

A report about a Team Invitation stores a limited review record. Decline and block creates that report in the same save as the decline and selected block. An authorized recipient or guardian can also submit a report for one available attempt through the moderation API. The record contains the attempt identity, sender, Player, Team, relevant delivery events, outcome, acting Account or guardian, and times. It does not copy personal email addresses, phone numbers, birthdates, claim links, or unrelated profile data.

OPEN and IN_REVIEW reports hold their evidence. These reports are separate from the BLOCK_USER reports removed by unblock. Unblock does not remove invitation evidence. A new invitation does not replace evidence from an earlier attempt. Evidence access requires the existing Razumly admin review authorization. Event roster access, Team management, and invitation ownership do not grant access to this review record.

ACTIONED and DISMISSED close a report. Closure releases that report's hold. The original invitation outcome time still applies. Evidence outside the routine window can be removed immediately. A separate open report keeps its own necessary evidence. A closed report cannot be reopened after its evidence has been erased. No missing evidence is reconstructed.

Account deletion removes authentication. It preserves the existing limited User Profile record under the established Account deletion policy. It closes pending Team invitations sent by the Account as Cancelled. It closes pending received Team invitations as Declined. Already expired attempts keep expiry. Existing final outcomes and their times stay unchanged. Routine Team history remains subject to its original window. An open report's limited evidence survives sender Account deletion.

Invitation cleanup does not remove User Profiles, accepted Team Memberships, Team roster entries, or Event roster entries. It does not grant acceptance or Team access. A minimal request receipt can remain after history erasure to prevent a retried request from creating a duplicate invitation. It does not reconstruct erased history. Both clients refresh ordinary invitation history from the shared API. Mobile replaces that history in Room. Held review evidence is not sent to the mobile invitation cache.

Before rollout, public privacy and Account deletion wording must describe the invitation window, the limited open-report exception, and the distinction between authentication deletion and retained evidence. The current message and file retention rules are separate. This change does not alter them. The final integration issue controls rollout of the full Event signup flow.
