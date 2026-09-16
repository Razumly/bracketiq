# Event operations reference record

This set contains 30 generated images for Issue #135.
The original 12 images show the six Event operations tabs.
The 18 supplemental images show nine nested workflows.
The desktop companions support Issue #125.
The Finance and Participants views use the approved commerce style from Issue #126.
Release-owner approval is recorded in `reference-manifest.json`.

## Tab references

| Tab | Desktop: 1536 × 1024 | Mobile: 853 × 1844 |
| --- | --- | --- |
| Details | [Desktop](../../operations-workspace/event-operations--details--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--details--mobile-853x1844.png) |
| Participants | [Desktop](../../operations-workspace/event-operations--participants--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--participants--mobile-853x1844.png) |
| Schedule | [Desktop](../../operations-workspace/event-operations--schedule--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--schedule--mobile-853x1844.png) |
| Standings | [Desktop](../../operations-workspace/event-operations--standings--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--standings--mobile-853x1844.png) |
| Bracket | [Desktop](../../operations-workspace/event-operations--bracket--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--bracket--mobile-853x1844.png) |
| Finance | [Desktop](../../operations-workspace/event-operations--finance--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--finance--mobile-853x1844.png) |

## Supplemental workflow references

| Surface | Desktop: 1536 × 1024 | Mobile: 853 × 1844 |
| --- | --- | --- |
| Calendar navigation | [Desktop](../../operations-workspace/event-operations--calendar-navigation--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--calendar-navigation--mobile-853x1844.png) |
| Match editing and official assignments | [Desktop](../../operations-workspace/event-operations--match-edit--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--match-edit--mobile-853x1844.png) |
| Live scoring and score confirmation | [Desktop](../../operations-workspace/event-operations--match-operations--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--match-operations--mobile-853x1844.png) |
| Match incident entry | [Desktop](../../operations-workspace/event-operations--match-incident--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--match-incident--mobile-853x1844.png) |
| Match roster management | [Desktop](../../operations-workspace/event-operations--match-roster--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--match-roster--mobile-853x1844.png) |
| Event Team check-in status | [Desktop](../../operations-workspace/event-operations--team-check-in--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--team-check-in--mobile-853x1844.png) |
| Registration compliance detail | [Desktop](../../operations-workspace/event-operations--registration-compliance--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--registration-compliance--mobile-853x1844.png) |
| Event bill creation | [Desktop](../../operations-workspace/event-operations--send-bill--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--send-bill--mobile-853x1844.png) |
| Payment review and refunds | [Desktop](../../operations-workspace/event-operations--payment-review--desktop-1536x1024.png) | [Mobile](../../operations-workspace/event-operations--payment-review--mobile-853x1844.png) |

See [surface-coverage.md](surface-coverage.md) for the issue coverage, source files, and shared references.

## Design

- Use the current `--bq-radius: 0.5rem` token for rectangular controls and surfaces.
- Use the BracketIQ navy, orange, and teal palette.
- Use round shapes only for avatars and circular indicators.
- Keep each label clear of its control border.
- Keep table values and score values aligned.
- Wrap the six mobile tabs into two rows.
- Treat `Manage` and `Normal` as visibility modes of one shared surface. Hide host-only controls and operational details in `Normal`; show them in `Manage` when permission allows.
- Most references capture `Manage`. The original Bracket pair captures `Normal` as the clean read-only example. Do not generate a second image only to represent hidden controls.
- Keep available drop targets distinct from unavailable Resource ranges.
- Do not add eyebrow text above a page or entity name.

The empty registration card and the Schedule state rows show separate reference states.
Loading, empty, error, conflict, and confirmation examples are visual state references, not live components.
Render one current state from data, request outcome, and user action. Do not combine these states in the live application.

The supplemental images each show one runtime state.
The mobile match editor shows the upper form with a complete footer.
Keep the rules and bracket fields in the scrollable form. The desktop companion shows them.
Team check-in shows saved status. Keep the current captain confirmation flow.
The shared bill dialog can open from Participants or Finance.

## Generation and checks

The built-in `image_gen.imagegen` tool generated all 30 images.
The supplemental set preserves the original 12 tab images.
No image received code-based text overlays or resizing.
All PNG dimensions match their filenames.
All saved file hashes match their generated source files.

Each image received a visual review for text, alignment, and required content.
The supplemental review corrected the calendar pool filter and two mobile layouts.
These raster references guide implementation.
Use the app's CSS tokens for exact dimensions and colors.
These images describe the visual result. They do not define a fixed component inventory.
No application tests are needed for this image-only change.

See [generation-prompts.json](generation-prompts.json) for the original prompt set.
See [supplemental-prompts.json](supplemental-prompts.json) for the new prompts, edits, and final file hashes.
See [reference-manifest.json](reference-manifest.json) for coverage and approval status.
