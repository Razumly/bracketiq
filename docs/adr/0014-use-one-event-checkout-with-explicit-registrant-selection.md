# Use one Event checkout with explicit registrant selection

Status: accepted. Date: 2026-09-07.

Event signup uses one checkout journey on web and mobile. The Account signs in before checkout. Checkout does not collect the Account's profile details again. The entry step selects the registrant. Requirements and document signing follow. An explicit review action precedes registration or payment.

For Team signup Events, the entry step selects a Team or the current user as a free agent. Show Team identity with its logo and name. Let the manager change, create, or edit the Team and add Players without losing Event context. Saving a Team or roster does not register it for the Event.

For individual signup Events, the entry step selects the current user or an eligible linked child. Offer child registration only when the Account has an active Guardian Relationship and at least one child with a known birthdate who meets the Event and selected Registration Division age rules. A Team signup Event does not offer child registration. Keep the child identity visible through requirements, signing, and review. The guardian remains the actor; the child remains the registrant. Existing guardian and child signature rules still apply.

On desktop web, show the active step beside an Event and price summary. On narrow screens, stack the content. Use the same entry, requirements, and review terms on mobile. Child selection is part of checkout, not Account creation. This avoids duplicate profile entry and prevents a guardian's identity from replacing the child's registration identity.

This decision extends [ADR 0013](0013-separate-user-profiles-rosters-and-invitations.md). It does not change roster placement, invitation acceptance, or Document Requirement satisfaction. The server remains the authority for eligibility and completion. Unknown birthdates and failed family reads must not be treated as eligibility.

Design references reviewed through Mobbin MCP: [Airbnb reservation](https://mobbin.com/flows/b6c81e56-99d0-46e0-a934-642290f6fa9d), [Care.com booking](https://mobbin.com/flows/e19c50ad-6347-45f2-9380-b5d128d374de), and [Expedia activity booking](https://mobbin.com/flows/3ee59fa3-79db-4035-81c4-668581249fc7).
