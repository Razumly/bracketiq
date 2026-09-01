---
name: "TypeScript Next.js Prisma Web App Guide"
description: "A comprehensive development guide for building a full-stack web application using TypeScript, Next.js, Mantine UI, Prisma, and Postgres with OVHcloud hosting considerations"
category: "Web Development"
author: "Agents.md Collection"
authorUrl: "https://github.com/gakeez/agents_md_collection"
tags:
  - typescript
  - nextjs
  - mantine
  - prisma
  - postgres
  - web-development
  - react
  - saas
  - ovhcloud
lastUpdated: "2026-05-25"
---

# TypeScript Next.js Prisma Web App Guide

## Project Overview

This guide covers best practices for developing a **full-stack web application** with **Next.js** (App Router) as the front-end framework, **TypeScript** for type safety, **Mantine** as the UI component library, and **Prisma + Postgres** for backend data. The example project is BracketIQ, a multi-sport facility and event management platform where users can sign up, create profiles, form teams, join events, chat with other players, and handle payments for event registrations, rentals, leagues, and tournaments. Volleyball is one supported sport and appears in defaults, seed data, and tests, but the product should be described generically unless a request is specifically targeting volleyball facilities. We emphasize a **modular architecture**: Next.js for routing and SSR, Mantine for cohesive UI components, and Prisma-backed API routes for data access, file uploads, and business logic.

**Marketing and outreach positioning**: Describe BracketIQ as a local, multi-sport web and mobile platform for facilities, clubs, and event organizers. Reference specific sports such as volleyball, soccer, basketball, tennis, pickleball, hockey, baseball, or football only when tailoring copy to a known facility or organization. Outreach should emphasize capabilities that matter to facilities: event registration, league and tournament scheduling, team/player management, rentals, payments, public organization pages, embedded event listings, communication, and mobile access for participants and staff.

**SEO and public-page metadata standards**: Public marketing, blog, guide, and policy pages should keep page titles, H1 text, and visible body copy aligned. If a title or H1 uses important terms such as "sports event platform", "facility operations", "tournament", "league", or "BracketIQ", include those terms naturally in visible page content. Use the Next.js App Router metadata APIs for metadata and viewport output: export `metadata` and `viewport` from server layouts/pages, and do not hand-code duplicate `<meta name="viewport">` tags in JSX. Keep exactly one viewport tag, one canonical URL, and use the canonical apex domain `https://bracket-iq.com`. Do not introduce public absolute links, metadata URLs, sitemap URLs, or structured-data URLs on `www.bracket-iq.com`; `www` requests should redirect to the apex host through middleware and production hosting/DNS configuration. Keep `poweredByHeader: false` in `next.config.mjs` so the `X-Powered-By` response header is not sent after restart/deploy. On landing pages, use real heading tags only for the semantic outline. Do not use headings for repeated proof chips, stat cards, feature-card labels, or decorative UI labels; style `p`, `div`, or `span` elements instead. Avoid duplicate heading text and repeated identical paragraphs inside mapped sections. Repeated anchor text is acceptable for repeated CTAs to the same destination, but use more specific anchor text when repeated links point to different destinations. Backlink count is an off-site marketing outcome, not a code-only issue; improve it through partner/facility links, public organization/event pages, embeddable listings, local directories, and useful BracketIQ guides.

**SEO verification checklist**: When changing public SEO-sensitive surfaces, render the page locally and verify the actual HTML, not just component source. Check that there is one viewport tag, one canonical tag, no `X-Powered-By` header after a server restart, no duplicate heading texts, a reasonable heading count for the amount of body text, and no obvious repeated boilerplate paragraphs from mapped components. Confirm `Host: www.bracket-iq.com` redirects to `https://bracket-iq.com/...`. For landing-page edits, run the relevant Jest tests, `npx tsc --noEmit`, and a browser smoke test on desktop and mobile-sized viewports.

**Blog and article roadmap**: Keep the living editorial roadmap in `../../docs/blog-article-roadmap.md`. Prioritize product-led guides and tutorials that show how to use BracketIQ on web and mobile before broader informational SEO articles. Split "how to create" and "how to manage" topics for leagues and tournaments because setup, operations, communication, standings, and day-of workflows are large enough to deserve separate articles. Every roadmap entry must maintain `Article Name`, `Content`, `Dependencies`, and `Dependants`. Dependencies are prerequisite articles the current article should refer to. Dependants are selected downstream articles the current article should link to as next steps; do not list every sport-specific dependant from broad foundational articles.

**Guide writing workflow**: For product-led BracketIQ guides, plan one user workflow step at a time, perform that step in the local BracketIQ app, capture the screenshot for that step, then write the end-user instructions for that same step before moving on. Keep the article grounded in what the UI actually shows, and update screenshots when the fixture or UI state changes. Organization guides should be tutorial-first and should start with concrete BracketIQ setup or management workflows for clubs, facilities, event organizers, staff, public pages, fields/courts, rentals, teams, customers, and payments before broader informational positioning. For Stripe payment-processing setup guides, screenshot only BracketIQ-controlled setup, status, and verification surfaces; describe the Stripe-hosted onboarding flow at a high level and link to official Stripe documentation instead of recreating sensitive or change-prone third-party screens.

**Article screenshot data quality**: Do not publish article screenshots that show generated test names, automation names, or test emails such as Codex, Android, Browser Checkout, InviteFlow, `example.test`, or timestamped team/user labels. Use clean seeded examples with realistic organization, staff, player, team, league, and tournament names such as River City Sports Club, Summit United, Riverside FC, Cascade Crew, Harbor Strikers, Metro Five, Northside United, or other natural recreational sports names. For organization payment-processing screenshots, use `samuel.razumovsky@gmail.com` whenever the host is entering or providing their own email, including Stripe payout email examples. For non-host sample users, staff, players, parents, or customers in article screenshots, use realistic names and realistic `@test.com` email addresses. When an organization screenshot would otherwise show poor team data, reuse the clean league or tournament participant/team screenshots and update the article text so the image context still matches the instructions.

**Legacy references**: The repos `mvpDatabase` and `mvp-build-bracket` are **legacy backend references** only. Use them to understand data shape and historical behavior, but **do not implement new features using legacy services**. Any legacy-specific files or env vars in this repo should be treated as artifacts.

**Related app**: The mobile application is in `../mobile`. When a request mentions mobile parity, inspect that directory and determine whether a site or backend change needs a corresponding mobile update.

**Git remote standard**: Manage the repository remote from the monorepo root. Use `https://github.com/Razumly/bracketiq.git` after repository cutover.

## Operational Process Control

- Never start, stop, restart, pause, resume, enable, disable, or reconfigure a process, service, timer, cron entry, campaign, queue worker, container, deployment, or other runtime unless the user explicitly requests that exact operational state change.
- A request to inspect, debug, verify, report status, access a database, or review logs is read-only authorization. It does not authorize changing runtime state.
- Do not carry an older process-control instruction forward after the user changes scope. Require an explicit current instruction before every later start/stop or enable/disable action.
- When an operational change is explicitly requested, limit it to the named runtime and verify its resulting state without changing adjacent processes.

# ExecPlans
When writing complex features or significant refactors, use an ExecPlan as described in the root `../../PLANS.md`.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **UI Library**: **Mantine** for React
- **State Management**: React Hooks and Context API
- **Database**: **Postgres** via **Prisma** (Prisma Client in `src/lib/prisma.ts`)
- **API**: Next.js Route Handlers in `src/app/api`
- **Storage**: Prisma `File` model + storage provider (local in dev; DigitalOcean Spaces or similar in prod)
- **Auth**: Self-hosted JWT/session flow (see `src/lib/authServer.ts` and `src/lib/permissions.ts`)
- **Payments**: Stripe API via server routes
- **Styling**: Tailwind + Mantine components

## Development Environment Setup

### Installation Requirements

- **Node.js**: 20+
- **Package Manager**: npm
- **Database**: Postgres (local or hosted)
- **Environment Variables** (`.env.local`):
  - `DATABASE_URL`
  - `JWT_SECRET`
  - Google OAuth (login button on `/login`):
    - `GOOGLE_OAUTH_CLIENT_ID`
    - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - **Storage** (if using Spaces):
    - `DO_SPACES_ENDPOINT`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`
    - `DO_SPACES_KEY`, `DO_SPACES_SECRET`

### Live Database Access

Current production runs on the OVH VM at `15.204.81.193`. Access it with the dedicated operator key at `~/.ssh/id_ed25519_bracketiq_prod`. Use the `bracketiq` account for read-only application/container checks and the `ubuntu` operator account only for explicitly authorized system administration. The authoritative PostgreSQL database is private inside the `bracketiq-production-postgres-1` container and is not exposed publicly.

### Installation Steps

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
# Create/update .env.local with DATABASE_URL and JWT_SECRET

# 3. Run migrations (if needed)
npx prisma migrate dev

# 4. Run the development server
npm run dev

# 5. Open http://localhost:3000
```

## Project Structure

```
apps/site/
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx             # MantineProvider + global providers
│   │   ├── page.tsx               # Home
│   │   ├── api/                   # Route handlers (auth, files, users, etc.)
│   │   └── ...
│   ├── components/
│   │   ├── ui/                    # Mantine-based reusable UI
│   │   └── ...
│   ├── context/
│   ├── lib/                       # Prisma, auth helpers, services
│   ├── types/
│   └── globals.css
├── prisma/
│   └── schema.prisma
└── ...
```

## Core Development Principles

### Code Style and Structure

- **Functional Components & Hooks**: Client interactivity lives in client components (`'use client'`).
- **Separation of Concerns**: UI calls **service modules** in `src/lib/*Service.ts`. Services wrap API calls so components don’t talk to Prisma directly.
- **Naming**: Booleans as `is*/has*`; service methods `createX/getX/updateX/deleteX`.
- **Types**: Strong interfaces for rows; extend with computed fields for UI.
- **Immutability**: Functional state updates; async service functions with `try/catch` + user feedback.

## Database — ID-centric Modeling (Prisma)

We persist raw string IDs for associations (for example `teamIds`, `friendIds`, `fieldIds`) and **hydrate** related data in service modules. This keeps writes simple and reads explicit.

**Guidelines**:
- Persist raw IDs in Prisma updates; do not embed nested objects.
- Hydrate related data in service modules by querying Prisma for each ID list.
- Throw when referenced IDs are missing so data issues surface early.
- Chunk Prisma queries when the ID list is large.

## Storage — Files & Images

- Uploaded files are tracked in the Prisma `File` model (`prisma/schema.prisma`).
- API routes in `src/app/api/files/*` handle uploads and downloads.
- Use server-side routes to enforce permissions and to proxy access.
- For production hosting, prefer object storage (DigitalOcean Spaces or compatible S3). Keep local file storage for development.

## Auth & Permissions

- Auth is handled via server-side JWT/session flows.
- **Never** expose secrets via `NEXT_PUBLIC_*` env vars.
- Use `requireSession` and `assertUserAccess` from `src/lib/permissions.ts` in API routes.

## Testing & Quality Assurance

### Tooling & Commands

- **Test runner**: Jest
- **Run quickly during development**: `npm run test:watch`
- **CI quality checks**: `npm run test:ci`
- **Type checks**: `npx tsc --noEmit`
- **Full site lint**: `npm run lint`
- **Prisma-backed tests and E2E seeding**: Against the test database, run `npm run migrate:deploy`, then `npx prisma migrate status`; proceed with Prisma-backed tests or `npm run seed:e2e` only when the status reports no pending migrations.

- **Test selection**: Follow [`CODING_STANDARDS.md`](CODING_STANDARDS.md). Add Jest coverage when it proves an observable behavior that typechecking or the build cannot prove, such as a state transition, output transformation, authorization decision, persistence effect, failure path, race, or complete user workflow.
- **Do not add redundant tests**: Do not add presence-only tests, static-page copy/link tests, tests that only restate TypeScript relationships, or tests that assert implementation details without an observable outcome.
- **Do not simulate providers**: Do not mock or hand-build third-party SDKs, HTTP responses, OAuth/token exchanges, hosted widgets, maps, payment flows, or webhook payloads. Validate provider integrations through explicit sandbox, manual smoke, or separately owned contract checks instead.
- **UI tests**: Exercise the interaction and assert the resulting state, output, or side effect. Do not retain a test only to satisfy coverage.
- **Bug fixes**: Include a regression test when the bug exposes a meaningful observable behavior not already covered by a stronger boundary or smoke check.
- **Mocks**: Reset mocks and spies when they are used for internal application services, Prisma, or browser platform APIs; do not recreate a third-party provider client.
- **Async tests**: Use `await`/`waitFor` for asynchronous application behavior.
- **Affiliate mapping validation**: `npm run test:affiliate-mappings` runs the per-source mapping fixtures that the default Jest and CI suites skip. `npx tsc --noEmit` still checks their TypeScript contracts.
- **Focused validation**: Do not run Jest suites concurrently from multiple agents in the same checkout; shared `.next`/cache artifacts can cause flaky results.

## Form & Scheduling Standards

- Use date-only calendar inputs for all date-of-birth fields (signup/profile/children). Do not capture time for DOB values.
- Use 12-hour AM/PM time presentation for user-facing time pickers and labels.
- Keep one scoring-format control path per form section; do not expose duplicate controls for the same setting.
- When playoffs are enabled, default an absent `playoffTeamCount` to `3`. Current editors must preserve explicit values and reject values below `3`. The legacy HTTP upsert can normalize a finite value below `3` to `3` for installed-client compatibility.
- Field-to-division mapping is mandatory for league/tournament scheduling. Apply fallback in this order: field divisions from payload, then event divisions, then persisted field divisions, then `OPEN`.
- Weekly scheduling must support multi-day selection at the form boundary (`daysOfWeek`) while remaining backward compatible with legacy `dayOfWeek`.
- Any event create/edit scheduling change must include regression tests for validation, payload mapping, and scheduler behavior.

## Security & Permissions

- Enforce row-level access in API routes.
- Avoid client secrets in `NEXT_PUBLIC_*`.
- Admin-only operations must check `session.isAdmin`.

## Legacy Notes

- Legacy references are read-only.
- Use `mvpDatabase` and `mvp-build-bracket` **as reference**, not as active dependencies.

### ASD-STE100 Simplified Technical English

- Adhere to ASD-STE100 Simplified Technical English for agent-authored plans,
  documentation, reports, instructions, code comments, and completion notes.
- Use short sentences, active voice, and one action per instruction.
- Use one consistent term for each concept. Avoid idioms, vague pronouns,
  unnecessary jargon, and long noun groups.
- Do not rewrite exact user-provided copy, quotations, legal text, standardized
  text, product names, API names, or code identifiers only to conform to this
  writing standard.

## Shared agent rules

Read the root `../../AGENTS.md` for the issue tracker, triage labels, domain documents, current HTTP-contract rules, and operational boundaries.