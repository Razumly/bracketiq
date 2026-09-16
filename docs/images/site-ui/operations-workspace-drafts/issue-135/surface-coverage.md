# Operations surface coverage

Reviewed on 2026-09-16 against [Issue #135](https://github.com/Razumly/bracketiq/issues/135), its comments, and [Issue #125](https://github.com/Razumly/bracketiq/issues/125).
The code baseline is `7b95a754dd591883b5afb0e76c43188b57caa0dc`.
The named files define behavior. The images define visual direction.

The original set has six desktop and mobile tab pairs.
It shows the workspace shell, resource availability, schedule states, standings, selected match detail, and finance summary.
The supplemental set adds nine pairs for nested workflows that the tab images do not show in detail.
Use the [review index](README.md) to open each pair.

## Added surfaces

| Surface | Behavior and reference state | Source files |
| --- | --- | --- |
| Calendar navigation | Date navigation, Calendar/By court choice, and Agenda view. All pools matches the displayed Pool A, Pool B, and Final entries. | [ScheduleTabPanel.tsx](<../../../../../apps/site/src/app/events/[id]/schedule/schedulePage/ScheduleTabPanel.tsx>), [LeagueCalendarView.tsx](<../../../../../apps/site/src/app/events/[id]/schedule/components/LeagueCalendarView.tsx>) |
| Match editing and official assignments | Team, Division, Court, dates, official assignments, check-in flags, lock, and bracket rules. The invalid end time shows the existing validation message. The mobile view keeps lower rules inside the scrollable form. | [MatchEditModal.tsx](<../../../../../apps/site/src/app/events/[id]/schedule/components/MatchEditModal.tsx>) |
| Live scoring and score confirmation | Current-quarter scores remain separate from match totals. The same dialog has quarter confirmation, the running clock, and official check-in. | [ScoreUpdateModal.tsx](<../../../../../apps/site/src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx>) |
| Match incident entry | The missing player keeps Save Incident disabled. Team context comes from the selected scoring action. | [ScoreUpdateModal.tsx](<../../../../../apps/site/src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx>) |
| Match roster management | Actions apply to individual roster entries. Temporary player creation, email linking, removal, restoration, and missing signatures remain distinct. | [MatchRosterModal.tsx](<../../../../../apps/site/src/app/events/[id]/schedule/schedulePage/MatchRosterModal.tsx>) |
| Event Team check-in status | Participants shows saved Event Team check-in status. The existing captain confirmation flow performs check-in. The image adds no host or bulk check-in action. | [page.tsx](<../../../../../apps/site/src/app/events/[id]/schedule/page.tsx>) |
| Registration compliance detail | Payment, document counts, registration answers, and expanded child details remain read-only. | [EventComplianceModal.tsx](<../../../../../apps/site/src/app/events/[id]/schedule/schedulePage/EventComplianceModal.tsx>) |
| Event bill creation | The bill preview includes fees once. The fixture is $432.33 host amount + $13.35 processing + $4.32 platform = $450.00. Bill creation does not complete a payment. | [EventBillingModals.tsx](<../../../../../apps/site/src/app/events/[id]/schedule/schedulePage/EventBillingModals.tsx>), [HostPriceInput.tsx](<../../../../../apps/site/src/components/ui/HostPriceInput.tsx>), [billingFees.ts](<../../../../../apps/site/src/lib/billingFees.ts>) |
| Payment review and refunds | A paid card payment supports a refund. Submitted manual proof supports Accept and Reject. Submitted proof is excluded from paid totals until accepted. | [EventBillingModals.tsx](<../../../../../apps/site/src/app/events/[id]/schedule/schedulePage/EventBillingModals.tsx>) |

## Issue #135 requirements

| Requirement | References |
| --- | --- |
| Schedule and calendar navigation | Original Schedule pair; Calendar navigation pair |
| Dense operational controls | Original Schedule and Participants pairs; Match editing, Match roster, and Registration compliance pairs |
| Match, bracket, standings, and score presentation | Original Bracket and Standings pairs; Live scoring and Match incident pairs |
| Selection and detail panels | Original selected registration and match detail; Match editing, Match roster, Registration compliance, and Payment review pairs |
| Conflict, loading, empty, and error states | Original Schedule, Participants, and Finance examples; invalid match date and required incident player in the new pairs |
| Primary day-of-operation actions | Original Details and Schedule actions; score confirmation, official check-in, saved team check-in status, bill creation, and payment review |

## Shared references for Issue #125

Event editing uses the shared Event form.
Use the [advanced desktop form](../../form-flow/create-event--advanced--desktop-1536x1024.png) and [advanced mobile form](../../form-flow/create-event--advanced--default--mobile-853x1844.png).
Use the [mobile schedule validation](../../form-flow/create-event--schedule--validation-error--mobile-853x1844.png) for the form error treatment.
These references guide the shared form style. Keep edit data and actions from the current code.

Resource availability and match movement use the original Schedule pair.
Rental selection and checkout use the existing [desktop rental reference](../../commerce-flow/commerce-rental--reservation-checkout--desktop-1536x1024.png) and [mobile rental reference](../../commerce-flow/commerce-rental--selection--mobile-853x1844.png).
Use [RentalCheckoutModals.tsx](<../../../../../apps/site/src/app/events/[id]/schedule/schedulePage/RentalCheckoutModals.tsx>) for Event rental behavior.
This set does not duplicate those shared assets.

## Implementation boundaries

- Use the app's `--bq-radius: 0.5rem` token for exact corner dimensions.
- Use the existing permission and validation rules.
- Treat Manage and Normal as visibility modes of the same surface.
- Select each loading, empty, error, conflict, and confirmation state from runtime data.
- Keep the current component flows. The image set does not require one component per reference.
- Keep mobile modal content scrollable when it exceeds the viewport.
- Keep modal actions visible and text clear of the footer.

All 18 new images received a visual review.
All desktop files are 1536 × 1024. All mobile files are 853 × 1844.
Saved SHA-256 hashes match the generated sources.
The prompts and final hashes are in [supplemental-prompts.json](supplemental-prompts.json).
These files remain drafts. They do not record release-owner approval or implementation completion.
