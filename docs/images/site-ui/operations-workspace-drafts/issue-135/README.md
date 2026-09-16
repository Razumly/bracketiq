# Event operations reference drafts

These 12 generated images replace the prior drafts for Issue #135.
The desktop companions support Issue #125.
The Finance and Participants views use the approved commerce style from Issue #126.
Release-owner approval is pending.

| Tab | Desktop: 1536 × 1024 | Mobile: 853 × 1844 |
| --- | --- | --- |
| Details | [Desktop](event-operations--details--desktop-1536x1024.png) | [Mobile](event-operations--details--mobile-853x1844.png) |
| Participants | [Desktop](event-operations--participants--desktop-1536x1024.png) | [Mobile](event-operations--participants--mobile-853x1844.png) |
| Schedule | [Desktop](event-operations--schedule--desktop-1536x1024.png) | [Mobile](event-operations--schedule--mobile-853x1844.png) |
| Standings | [Desktop](event-operations--standings--desktop-1536x1024.png) | [Mobile](event-operations--standings--mobile-853x1844.png) |
| Bracket | [Desktop](event-operations--bracket--desktop-1536x1024.png) | [Mobile](event-operations--bracket--mobile-853x1844.png) |
| Finance | [Desktop](event-operations--finance--desktop-1536x1024.png) | [Mobile](event-operations--finance--mobile-853x1844.png) |

## Design

- Use the current `--bq-radius: 0.5rem` token for rectangular controls and surfaces.
- Use the BracketIQ navy, orange, and teal palette.
- Use round shapes only for avatars and circular indicators.
- Keep each label clear of its control border.
- Keep table values and score values aligned.
- Wrap the six mobile tabs into two rows.
- Treat `Manage` and `Normal` as visibility modes of one shared surface. Hide host-only controls and operational details in `Normal`; show them in `Manage` when permission allows.
- Most references capture `Manage`. Bracket captures `Normal` as the clean read-only example. Do not generate a second image only to represent hidden controls.
- Keep available drop targets distinct from unavailable Resource ranges.
- Do not add eyebrow text above a page or entity name.

The empty registration card and the Schedule state rows show separate reference states.
Loading, empty, error, conflict, and confirmation examples are visual state references, not live components.
Render one current state from data, request outcome, and user action. Do not combine these states in the live application.

## Generation and checks

The built-in `image_gen.imagegen` tool generated all 12 replacements.
No image received code-based text overlays or resizing.
All files retain their existing names and dimensions.
All saved file hashes match their generated source files.

Each image received a visual review for text, alignment, and required content.
These raster references guide implementation.
Use the app's CSS tokens for exact dimensions and colors.
These images describe the visual result. They do not define a fixed component inventory.
No application tests are needed for this image-only change.

See [generation-prompts.json](generation-prompts.json) for the complete prompt set.
See [reference-manifest.json](reference-manifest.json) for coverage and approval status.
