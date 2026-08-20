---
status: superseded by ADR-0009
---

# Separate registration Entry Divisions from competition Phase Divisions

Participant Registrations enter exactly one Entry Division, which owns registration eligibility and capacity. Every configured Competition Phase has a distinct Phase Division created atomically with the Event so League, Pool, Bracket, and Playoff stages can own different participants, Resources, rules, officiating plans, and Match settings without overloading one Division.

Phase Divisions receive participants through seeding or advancement and never add Registration Capacity. They generate the complete Match Graph before scheduling, leaving the scheduler responsible only for time, Resource, and officiating assignments.
