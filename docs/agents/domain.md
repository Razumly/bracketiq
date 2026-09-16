# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring

Use only domain references that govern the requested change.

- Read the relevant entries in `CONTEXT.md` for terms used by the issue or changed code.
- Read only named or directly governing ADRs in `docs/adr/`.
- Expand the set when code or a cited decision exposes an unresolved term or invariant.

If a selected file does not exist, proceed silently. Do not flag its absence or suggest creating it upfront. The `/domain-modeling` skill creates domain files when terms or decisions need them.

## File structure

This repo uses a single-context layout:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
