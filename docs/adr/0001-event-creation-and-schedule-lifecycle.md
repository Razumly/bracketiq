# Keep Event creation atomic while allowing reviewed Partial Schedules

Event creation captures one current Event Configuration and commits the Event, configured Divisions, complete Match Graph, and accepted Match placements atomically. Automated Scheduling is a lasting Event property, while Build Schedule, Complete Schedule, Rebuild Schedule, and Schedule Reflow are distinct operations over Matches rather than a separate Schedule entity.

A Schedule Proposal with Unscheduled Matches can become a Partial Schedule only after explicit organizer acceptance. Unchanged retries reuse the same creation identity and reviewed proposal; configuration changes, Automated Scheduling changes, or Partial Schedule acceptance create a new intent so retries cannot silently persist different Event behavior.

Planned End, Set End from Schedule, and No Planned End remain separate policies because fixed competition bounds, scheduler-selected competition ends, and unbounded Weekly Events have different invariants.
