---
status: accepted
---

# Schedule complete Phase Divisions in phase order

## Context

An Event can contain several Phase Divisions. A Schedule must use the Event's stable Division order while it uses shared Resources. ADR-0008 requires readiness placement and does not allow a conceptual-round barrier inside a Division. The same ordering rule is needed when Build Schedule, Rebuild Schedule, or Schedule Reflow places Matches.

## Decision

Use strict phase-first, complete-Division scheduling:

- The preliminary phase rank contains `LEAGUE` and `POOL`. It always comes before the elimination phase rank, which contains `PLAYOFF` and `BRACKET`.
- Within one phase rank, process non-empty Phase Divisions in the Event's stable Division order. Empty Divisions are skipped and add no delay.
- Place every Match in one non-empty Division batch before the next batch starts. For adjacent batches A and B, `max(end of A) <= min(start of B)`.
- A Division batch may use all eligible Resources concurrently. Inside that Division, preserve ADR-0008 readiness placement: place each Match at its earliest feasible time after incoming advancement dependencies and required rest, without a conceptual-round barrier.
- Build Schedule, Rebuild Schedule, and Schedule Reflow apply this policy. Schedule Reflow applies it to Matches that it may move. Protected Matches remain fixed. If their fixed placements make the ordering impossible, report a conflict instead of moving protected Matches or violating the order.

This decision changes placement order only. It does not change operation boundaries or Match identity rules.

## Consequences

Preliminary Matches finish before elimination Matches, and Divisions have deterministic order within each phase rank. Empty Divisions do not create artificial gaps, while each non-empty Division can use its full eligible Resource set. Readiness and early placement remain available inside a Division. Schedule Reflow can report an ordering conflict when protected Matches prevent a valid complete-Division order; it must not silently move those Matches or produce an invalid order.
