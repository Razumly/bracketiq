---
status: accepted
---

# Separate Event Configuration from Schedule operations

Saving an existing Event writes Event Configuration and recalculates canonical Match Graph and placement input snapshots. Save never calls Build Schedule, Rebuild Schedule, Complete Schedule, Reschedule, or Schedule Reflow.

Semantic revision hashes compare current inputs with the snapshots accepted by the last graph and placement operations. Match Graph staleness and placement staleness remain independent, explicit Match operations remain available in every freshness state, and an explicit structural Match change marks a generated Match Graph as Customized instead of stale.

A Competition Phase becomes structurally protected when protected Match history begins. Rebuild Schedule preserves protected phases and replaces only unstarted phase graphs, while Reschedule changes placements on the existing Match Graph.
