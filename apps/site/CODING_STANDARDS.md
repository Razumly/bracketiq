# Coding Standards

## Testing standard

Tests must prove observable behavior that the compiler, linter, or build cannot prove.
Prefer tests for state transitions, output transformations, authorization decisions, persistence, failure handling, race/ordering behavior, and complete user workflows.

Do not add tests that only:

- prove an import, export, component, route, or feature exists;
- render a static page and assert that labels, links, or copy are present;
- repeat a type relationship or a value that TypeScript already checks; or
- assert an implementation detail without an observable outcome.

A UI test should perform the relevant interaction and assert the resulting state, output, or side effect. A static page, metadata, or route-presence check belongs in browser or deployment smoke validation when it is an externally important contract. Do not preserve a unit test only to satisfy a coverage number.

## External provider boundary

Do not mock or hand-build third-party provider interfaces in Jest or Playwright tests. This includes provider SDKs, HTTP endpoints and responses, OAuth/token exchanges, hosted widgets, maps, payment flows, and webhook payloads. Examples include Stripe, Google or Apple OAuth and Maps, QuickBooks, BoldSign, Gmail, ScrapingDog, Firecrawl, and OpenAI-compatible model APIs.

These doubles encode a vendor interface in the test suite. A provider can change its request or response contract while the fake keeps the suite green, which makes the test misleading. Provider validation must be an explicit sandbox, manual smoke, or separately owned contract check with its required credentials and lifecycle documented outside the default unit suite.

Test our application at a provider-independent boundary instead. It is acceptable to mock internal application services, Prisma, and browser platform APIs when that isolates application behavior. Do not recreate a vendor client or provider response in order to test the vendor itself.

## Test review checklist

Before adding a test, answer:

1. What observable failure would this test catch?
2. Would `npx tsc --noEmit` or the build already catch it?
3. Does the test exercise application behavior rather than a static presence check?
4. Does it avoid inventing a third-party request, response, webhook, or hosted-widget interface?

If the answer to the first question is not specific, do not add the test. Remove legacy tests that violate these rules when their behavior is not covered by a stronger boundary or smoke check.
