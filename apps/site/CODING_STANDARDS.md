# Coding Standards

## Testing standard

Tautological tests are considered harmful.

Tests must prove observable behavior that the compiler, linter, or build cannot prove.
Prefer tests for state transitions, output transformations, authorization decisions, persistence, failure handling, race/ordering behavior, and complete user workflows.

Do not add tests that only:

- prove an import, export, component, route, or feature exists;
- render a static page and assert that labels, links, or copy are present;
- repeat a type relationship or a value that TypeScript already checks; or
- assert an implementation detail without an observable outcome.

A UI test should perform the relevant interaction and assert the resulting state, output, or side effect. A static page, metadata, or route-presence check belongs in browser or deployment smoke validation when it is an externally important contract. Do not preserve a unit test only to satisfy a coverage number.

## Complexity standard

Changed site JavaScript and TypeScript files must pass `npm run lint:changed`.
The shared policy is in `eslint.complexity.config.mjs`:

- Non-JSX JavaScript and TypeScript functions have a complexity limit of 10. A higher score is an error.
- JSX and TSX functions have a complexity threshold of 20. A higher score is an advisory warning.
- Control-flow nesting must not exceed four levels in any file. Deeper nesting is an error.

The distinction is file-based. JSX and TSX files remain subject to the other lint rules, including React Hooks rules. Keep scheduling, payment, validation, and data-processing logic in focused non-JSX modules when it has a separate responsibility. Keep component-specific rendering and interaction logic near the UI.

Review complexity warnings for unclear responsibilities or difficult state transitions. Extract cohesive logic when that improves understanding, reuse, or testability. A warning alone does not require an extraction or block a commit. Simple conditional rendering, optional values, and defaults can raise the score without making the UI hard to understand.

The check analyzes each complete changed file. Resolve errors before commit. Keep files in the check; do not add rule suppressions, disable comments, or file exclusions to avoid a finding.

The local command includes staged, unstaged, and untracked files. The pre-commit hook and CI use the same policy. Complexity warnings remain non-blocking in these commands.

## Failure and fallback standard

Show an explicit failure when required data is missing or cannot load. Do not show an entity ID, username, or other implementation value in place of a required display name. Use a fallback only when the product contract defines that fallback. For example, a missing price may display as free when the event contract defines that behavior. Otherwise, stop the affected flow and show the error.

## External provider boundary

Do not mock or hand-build third-party provider interfaces in Jest or Playwright tests. This includes provider SDKs, HTTP endpoints and responses, OAuth/token exchanges, hosted widgets, maps, payment flows, and webhook payloads. Examples include Stripe, Google or Apple OAuth and Maps, QuickBooks, BoldSign, Gmail, ScrapingDog, Firecrawl, and OpenAI-compatible model APIs.

These doubles encode a vendor interface in the test suite. A provider can change its request or response contract while the fake keeps the suite green, which makes the test misleading. Provider validation must be an explicit sandbox, manual smoke, or separately owned contract check with its required credentials and lifecycle documented outside the default unit suite.

Test our application at a provider-independent boundary instead. It is acceptable to mock internal application services, Prisma, and browser platform APIs when that isolates application behavior. Do not recreate a vendor client or provider response in order to test the vendor itself.

## Cross-application HTTP contracts

`apps/site` owns the HTTP contract consumed by `apps/mobile`. When a request or response changes, update the server schema, every mobile DTO and mapper, and the contract version or compatibility parser in one change.

Before making a field required, either increase the contract version or keep the parser compatible with older clients. Never keep a version while changing its required shape.

Every cross-application contract change needs a focused client-to-site integration check. The check must use the client serializer and send the request to the site parser or API. A mocked client transport does not prove contract compatibility.

## Test review checklist

Before adding a test, answer:

1. What observable failure would this test catch?
2. Would `npx tsc --noEmit` or the build already catch it?
3. Does the test exercise application behavior rather than a static presence check?
4. Does it avoid inventing a third-party request, response, webhook, or hosted-widget interface?

If the answer to the first question is not specific, do not add the test. Remove legacy tests that violate these rules when their behavior is not covered by a stronger boundary or smoke check.


## Room cache policy

Room stores local cache data. For every Room schema change, increment `MVP_DATABASE_VERSION`. Configure each platform database builder to use destructive migration. Do not add manual migration SQL, auto-migrations, or migration edges. Do not preserve Room cache data across schema versions.