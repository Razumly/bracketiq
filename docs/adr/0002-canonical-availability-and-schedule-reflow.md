# Resolve availability once and reflow Tournament Matches minimally

Scheduling and diagnostics consume the same concrete Time Slot intervals, Resource eligibility, Division eligibility, Event bounds, and time-zone rules. Overlapping Time Slots on a shared Resource are invalid at both client and server boundaries; diagnostics lead with Unscheduled Match counts and evidenced Restricting Factors rather than an aggregate capacity estimate that cannot prove feasibility.

Tournament Match completion performs one atomic Schedule Reflow while Automated Scheduling is enabled. Reflow moves only affected unlocked Matches, prefers deterministic official reassignment over Match movement, preserves locked and unaffected Matches, and applies no partial result when all conflicts cannot be resolved.

Staffing Priority explicitly decides whether Team duties and named Official Positions are required constraints, conflict-free best effort, or retained despite conflicts. Optional staffing conflicts remain visible warnings but never masquerade as causes of Unscheduled Matches.
