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

## Local mobile-to-backend work

The mobile tooling resolves the backend to the sibling `apps/site` directory. A normal monorepo clone does not need `MVP_SITE_DIR`.

From `apps/mobile`, start or verify the local backend through the checked-in launcher only when that runtime change is intended:

```bash
./scripts/ensure-local-backend.sh
```

Set `MVP_SITE_DIR` only when you intentionally use a backend checkout outside this repository. The backend HTTP interface remains the boundary between applications. Do not share runtime TypeScript or Kotlin source across that boundary.

For the real mobile API integration check, start a non-production backend first. Then run:

```bash
cd apps/mobile
MVP_TEST_BACKEND_URL=http://127.0.0.1:3000 \
MVP_TEST_ALLOW_DB_SEED=true \
  ./gradlew :composeApp:testDebugUnitTest \
  --tests 'com.razumly.mvp.eventDetail.EventLifecycleMobileApiIntegrationTest' \
  --stacktrace
```
