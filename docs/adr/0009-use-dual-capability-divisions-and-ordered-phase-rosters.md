---
status: accepted
---

# Use dual-capability Divisions and ordered phase rosters

A Division can accept Participant Registrations, own one Competition Phase, or do both. Registration Capacity and Phase Capacity remain independent, and a Phase Division stores its current Event Team occupants as an ordered roster whose stable Division Slots are identified by Division ID and one-based slot number.

Match sides store both the Division Slot and the actual Event Team, so roster replacement preserves competition position and historical Team identity. Advancement Positions map source standings positions to target Phase Divisions, while the target seed derives deterministically from source rank and source Division order.

This decision supersedes ADR-0003. Separate Registration Division and Phase Division rows remain valid only when the Event Configuration needs separate Competition Phases, such as generated Pools or split Playoffs.
