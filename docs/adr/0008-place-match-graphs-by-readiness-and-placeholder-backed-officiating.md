---
status: accepted
---

# Place Match Graphs by readiness and placeholder-backed officiating

A Schedule places each Match at its earliest feasible time after all incoming advancement dependencies and required rest have completed. Placement reserves eligible Resources, playing-Team slots, Team duties, and named Official Positions under the Phase Division's Officiating Plan and Staffing Priority. It does not wait for a conceptual round to finish and does not require later Bracket entrants to be known.

Placeholder Teams are stable Schedule slots for League, Pool, and standalone Tournament entrants and Team duties. Each assigned Placeholder Team ID is a stable identity for playing-Team overlap, required rest, and Team-duty conflicts. Placement and Schedule Reflow MUST use that exact ID. An assigned Placeholder Team is not anonymous capacity. Anonymous capacity is allowed only for a genuinely unassigned Team-duty slot or, where applicable, a named Official Position. An accepted Participant Registration claims a Placeholder Team. The Placeholder Team immediately updates its Match and Team-duty assignments without changing Match identity, graph links, time, or Resource placement. Named Official Positions may remain unbound assignment slots without creating fake Users.

Team Check-In is not an initial placement rule. It does not invalidate an existing assignment or trigger Schedule Reflow. When Schedule Reflow or a host-requested reschedule selects a replacement Team for a Team duty, only checked-in Teams in the same Phase Division or a mapped source Phase Division are eligible. Selection excludes conflicts and insufficient rest, then prefers recently eliminated or losing Teams. The Event Host decides whether an unchecked Team should remain assigned or whether to invoke rescheduling.

## Considered options

- A global round barrier was rejected because it leaves eligible Resources idle after some Matches in a round finish.
- Concrete-participant-only placement was rejected because later Bracket Matches have unresolved entrants.
- Check-In as a permanent Schedule invariant was rejected because Schedules and Participant Registrations exist before Event-day check-in, and automatic invalidation would override Event Host control.

## Consequences

Placement and Schedule Reflow must use one graph-readiness and reservation model. Persistence must retain stable Placeholder Team claims and unbound officiating slots. Initial planning can remain complete before registration and results are final, while rescheduling can use current results and Check-In state without regenerating the Match Graph.
