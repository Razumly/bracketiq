# BracketIQ

[![Site CI](https://github.com/Razumly/bracketiq/actions/workflows/site-ci.yml/badge.svg?branch=main)](https://github.com/Razumly/bracketiq/actions/workflows/site-ci.yml)
[![Mobile CI](https://github.com/Razumly/bracketiq/actions/workflows/mobile-ci.yml/badge.svg?branch=main)](https://github.com/Razumly/bracketiq/actions/workflows/mobile-ci.yml)

BracketIQ is one product with separate site and mobile applications. This repository keeps both applications, shared product documentation, issues, and automation in one place. The applications keep independent build tools and release processes.

## Repository layout

- `apps/site` — Next.js web application, API routes, Prisma schema, and site deployment files.
- `apps/mobile` — Kotlin Multiplatform application, Android and iOS wrappers, Wear OS, and watchOS.
- `docs` — shared product documentation and architecture decisions.
- `plans` — current and historical execution plans.
- `.github/workflows` — repository CI and site image publication.

Pre-migration documents can refer to the former `mvp-site` and `mvp-app` repository names and paths. Treat those references as historical evidence.

## Common commands

The root package provides stable entry points without combining the application dependency graphs:

```bash
npm run build:site
npm run lint:site
npm run test:site
npm run typecheck:site
npm run test:mobile
```

## Application boundary

`apps/site` owns the backend, Prisma schema, HTTP API, and web UI. `apps/mobile` consumes the backend through the HTTP API and keeps its own Kotlin data models and Room cache. The applications do not import runtime source from each other. A contract change must update and validate both sides in one repository change.

Site deployment publishes an immutable container image. Android and iOS keep their existing store release workflows and version rules. Shared documentation and issue decisions stay at the repository root.

## Work tracking

Use [GitHub Issues](https://github.com/Razumly/bracketiq/issues) for scoped work. The shared [BracketIQ Project](https://github.com/orgs/Razumly/projects/1) uses the `Area` field with `Shared`, `Backend`, `Web`, `Mobile`, and `Operations` values. New issues receive `needs-triage` automatically.

## Releases

Site and mobile releases remain independent. Use `site-v<version>` tags for site releases and `mobile-v<version>` tags for mobile releases. A tag points to the monorepo commit that produced that application release. The migrated mobile history keeps its original tags with the `mobile-` prefix.

## Site and backend

Use Node.js 20 or the version in `apps/site/.nvmrc`. Use a local or approved non-production Postgres database.

```bash
cd apps/site
npm ci
npm run prisma:check
npm run dev
```

The local site listens on `http://localhost:3000` by default. Check the server with:

```bash
curl --fail http://127.0.0.1:3000/api/health/live
curl --fail http://127.0.0.1:3000/api/health/ready
```

Run site validation from `apps/site`:

```bash
npm run test:ci
npx tsc --noEmit
npm run build
```

## Android and shared mobile code

Use JDK 17. Run Gradle from `apps/mobile`.

```bash
cd apps/mobile
./scripts/tests/google-sign-in-release-resource-contract.sh
./scripts/tests/android-release-api-base-url-contract.sh
./gradlew :composeApp:testDebugUnitTest --continue --stacktrace
./gradlew :composeApp:assembleDebug --stacktrace
```

## iOS

Use macOS, Xcode, CocoaPods, and JDK 17.

```bash
cd apps/mobile/iosApp
pod install
cd ..
./scripts/tests/ios-release-api-base-url-contract.sh
./gradlew bootIOSSimulator
./gradlew :composeApp:iosSimulatorArm64Test :core:database:iosSimulatorArm64Test --continue --stacktrace
```

## Local mobile-to-site work

The mobile tooling resolves the backend to the sibling `apps/site` directory. A normal monorepo clone does not need `MVP_SITE_DIR`.

From `apps/mobile`, start or verify the local backend through the checked-in launcher only when that runtime change is intended:

```bash
MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1 MVP_BACKEND_PORT=3100 ./scripts/ensure-local-backend.sh
```

Set `MVP_SITE_DIR` only when you intentionally use a backend checkout outside this repository. The backend HTTP interface remains the boundary between applications. Do not share runtime TypeScript or Kotlin source across that boundary.

For the real mobile-to-site integration check, start a non-production backend first with outbound providers disabled. The checked-in launcher derives the Compose database URL. If `POSTGRES_*` values are overridden, the launcher output remains the source of truth. Run the focused Event Editor contract test locally from `apps/mobile`:

```bash
MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1 MVP_BACKEND_PORT=3100 ./scripts/ensure-local-backend.sh
COMPOSE_DATABASE_URL="$(./scripts/ensure-local-backend.sh --print-database-url)"
MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1 \
MVP_TEST_BACKEND_URL=http://127.0.0.1:3100 \
MVP_TEST_DATABASE_URL="$COMPOSE_DATABASE_URL" \
MVP_TEST_ALLOW_DB_SEED=true \
MVP_TEST_REQUIRE_BACKEND=true \
JAVA_TOOL_OPTIONS='-XX:TieredStopAtLevel=1' \
  ./gradlew --no-daemon :composeApp:testDebugUnitTest \
  --rerun-tasks \
  --tests 'com.razumly.mvp.eventDetail.MobileEventEditorApiContractTest.given_mobile_editor_create_command_when_sent_to_site_then_event_is_persisted' \
  --stacktrace
```

Expected Event Editor result: one executed test, zero skipped tests, zero failures, and a persisted Event returned after mobile reload.
For the Tournament-specific required assertion, first start and verify the same provider-disabled non-production backend from `apps/mobile`:

```bash
MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1 MVP_BACKEND_PORT=3100 ./scripts/ensure-local-backend.sh
curl -fsS 'http://127.0.0.1:3100/api/app-version?platform=ANDROID&versionName=0.0.0&buildNumber=0'
```

The launcher must complete its database-backed readiness check and the `curl` request must return JSON. Only then derive the guarded Compose database URL. `./scripts/ensure-local-backend.sh --print-database-url` only prints that URL; it does not start or verify the backend:

```bash
COMPOSE_DATABASE_URL="$(./scripts/ensure-local-backend.sh --print-database-url)"
MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1 \
MVP_TEST_BACKEND_URL=http://127.0.0.1:3100 \
MVP_TEST_DATABASE_URL="$COMPOSE_DATABASE_URL" \
MVP_TEST_ALLOW_DB_SEED=true \
MVP_TEST_REQUIRE_BACKEND=true \
JAVA_TOOL_OPTIONS='-XX:TieredStopAtLevel=1' \
  ./gradlew --no-daemon :composeApp:testDebugUnitTest \
  --rerun-tasks \
  --tests 'com.razumly.mvp.eventDetail.MobileTournamentEventEditorApiContractTest.given_mobile_tournament_editor_create_command_when_sent_to_site_then_tournament_is_persisted' \
  --stacktrace
```

Expected Tournament result: one executed test, zero skipped tests, zero failures, zero errors, and a persisted Tournament returned after mobile reload with its graph, selected resources, and fixed end policy verified. Do not record this as a pass unless those observations are present.

The shared Tournament wire-parity cases are separate dependency-project checks; `:composeApp:*Test` does not execute them:

```bash
./gradlew --no-daemon :core:repository-impl:testDebugUnitTest \
  --tests 'com.razumly.mvp.core.data.repositories.EventEditorTournamentParityAndroidTest.given_shared_tournament_fixture_when_mobile_command_is_built_then_it_matches_the_web_golden'
```

Expected Android result: `BUILD SUCCESSFUL`, one executed case, zero skips, zero failures, and zero errors. The recorded result at `2026-08-30T01:45:27.894Z` was `tests=1`, `skipped=0`, `failures=0`, and `errors=0`.

```bash
./gradlew --no-daemon :core:repository-impl:iosSimulatorArm64Test \
  --tests 'com.razumly.mvp.core.data.repositories.EventEditorTournamentParityCommonTest.given_shared_tournament_draft_when_command_is_encoded_then_complete_canonical_wire_is_preserved'
```

Expected iOS result: `BUILD SUCCESSFUL`, one executed case, zero skips, zero failures, and zero errors. The recorded result at `2026-08-29T19:46:42.900Z` was `tests=1`, `skipped=0`, `failures=0`, and `errors=0`.

If the launcher or readiness request fails, stop before dispatching the Tournament test. Record a backend readiness failure, not a test failure. Do not repair or restart a runtime without authorization. After an authorized repair or restart, rerun the launcher, readiness request, URL derivation, and exact Tournament selector.
