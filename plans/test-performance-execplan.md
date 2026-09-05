# Reduce site and mobile test time

This ExecPlan is a living document. Maintain it under the root `PLANS.md` rules.

## Purpose / Big Picture

Developers should receive test results sooner without losing behavior checks. Mobile CI should reuse native compiler state and build outputs. Android release validation should run independently of debug unit tests. Site CI should run independent checks at the same time. Site tests should avoid generated-code coverage and unnecessary browser work.

The user approved the fixes identified in `docs/test-performance-audit-2026-09-05.md`. The baseline has 780 passing site suites. The iOS job takes 41 to 49 minutes. The Android job takes about 15 minutes. The site job takes about 13 minutes. These are recorded CI measurements, not a local benchmark.

## Progress

- [x] (2026-09-05) Inspect the audit, repository rules, current configuration, and branch state.
- [x] (2026-09-05) Create `codex/test-performance` from local `main` at `a877f70c849298c1eb1f0362209a7ff2c4badbfd` for this direct user request.
- [x] (2026-09-05) Install locked site dependencies and measure the slow form suite.
- [x] (2026-09-05) Configure mobile build caches, independent release validation, and timing artifacts.
- [x] (2026-09-05) Configure parallel site quality checks and remove unnecessary coverage work.
- [x] (2026-09-05) Use Mantine test mode, remove unused form providers, and select Node for 73 backend suites.
- [ ] Investigate and repair the reproducible test teardown leak.
- [ ] Run focused checks, the complete affected site suite, available mobile validation, and independent code reviews.
- [ ] Record outcomes and commit the completed changes.

## Surprises & Discoveries

The checkout has no site dependencies or mobile test reports. Existing CI logs provide the initial baseline. The current host is Windows and cannot run iOS simulator tests. A new local dependency installation is required for a controlled site comparison.

The first local EventForm run took 384.722 seconds. It passed 129 of 130 cases. The unchanged manual-payment assertion failed. Mantine test mode alone took 371.636 seconds and exposed another dirty-state failure. Both cases passed in a focused 7.669-second run after removing unused modal and notification providers from the EventForm wrapper. These runs do not yet establish a reliable overall speedup.

The focused open-handle check ran three server suites. It reported no open handles, but two suites failed on Linux-only socket paths, file modes, and no-follow file access. These files were not changed by this task. The complete site run must distinguish these platform failures from regressions.

Actionlint 1.7.12 accepted both workflows. A temporary harness executed the actual gate shell scripts for 22 success, failure, cancellation, and skip cases. All 22 passed. The Android release scripts passed Bash syntax checks. Gradle 9.4.1 starts with JDK 17 on this host.

## Decision Log

Decision: retain all release checks and the existing site coverage floors. Run Android release validation as a separate required job when mobile checks run. Reason: the resource check protects the packaged release APK. Moving it must not remove its protection. Date: 2026-09-05.

Decision: use a dedicated branch in the current checkout. This is a direct user request, not a claimed GitHub issue batch. The other existing issue worktrees remain separate. Date: 2026-09-05.

Decision: implement measured configuration and test changes before any large mobile module refactor. Reason: the audit establishes missing native caches, but does not isolate the marginal link cost of each library. Date: 2026-09-05.

Decision: use setup-gradle v5 for the Gradle cache and a separate native cache for `.konan` and CocoaPods state. Include the native catalog, wrapper, build properties, Podfile inputs, architecture, and Xcode hash in its restore prefix. Use a unique run key so successful runs save new state. Reason: fixed dependency keys cannot retain new compiled outputs after an exact hit. Date: 2026-09-05.

## Outcomes & Retrospective

Implementation is in progress. No new performance saving is established yet.

## Context and Orientation

`.github/workflows/site-ci.yml` currently runs lint, Prisma validation, coverage tests, and TypeScript checks in one job. `apps/site/jest.config.ts` defines one Jest suite with jsdom as its default environment. Its coverage glob includes generated Prisma source. `apps/site/test/utils/renderWithMantine.tsx` wraps UI tests with Mantine, modal, and notification providers. The large EventForm suite uses this helper repeatedly.

`.github/workflows/mobile-ci.yml` runs Android and iOS jobs. The Android job first invokes `apps/mobile/scripts/tests/google-sign-in-release-resource-contract.sh`, which assembles a release APK. It later compiles debug unit tests. The iOS job builds the application test binary and a database test binary. `apps/mobile/gradle.properties` does not enable task output caching. The current setup-java cache does not preserve `.konan`, the directory where the native compiler stores downloads and reusable compiled dependencies.

The baseline commit is `a877f70c849298c1eb1f0362209a7ff2c4badbfd`. Use the audit and this plan as the specification for the final review. Do not change backend, Prisma, Room, or HTTP contracts for this task.

## Plan of Work

First install dependencies from the site lockfile. Run the EventForm suite before changing its rendering setup. Save the command, test count, and elapsed time. Inspect the test wrappers and library cleanup behavior to identify a smaller setup that keeps the same assertions.

Next enable Gradle task output caching. Configure CI caches that preserve updated Gradle state and `.konan` across runs. Include the version catalog and native toolchain context in cache keys. Keep native configuration caching disabled unless this project proves compatibility. Move the Android release scripts into a separate job. Include the new job in the required mobile gate. Add Gradle profiles and test reports as artifacts. These changes must not publish an APK or start a deployed runtime.

Then split site quality checks into independent jobs while preserving the existing final gate. Keep Prisma validation. Make the gate fail when any required check fails, is canceled, or is unexpectedly skipped. Exclude generated source from coverage. Preserve JSON coverage needed by the API route coverage gate. Save Jest timing results and coverage as artifacts. Use cache paths inside ignored output directories.

Finally apply measured UI setup improvements and use Node for backend test files that need no DOM. Keep explicit browser environments for tests that require browser globals. Diagnose test resource leaks with focused open-handle runs. Avoid a broad test deletion or provider mock rewrite.

## Concrete Steps

Run site commands from `apps/site`:

    npm ci --no-audit --no-fund
    npx jest --runInBand --runTestsByPath 'src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx'
    npm run test:ci
    npx tsc --noEmit
    npm run lint

Keep local timing files under an ignored output directory. Run Jest invocations sequentially in this checkout. Record any baseline failure separately from changes caused by this work.

Run Gradle commands from `apps/mobile` with JDK 17 and an installed Android SDK:

    ./gradlew testDebugUnitTest --continue --stacktrace --profile

On macOS, run the same iOS simulator test targets as CI. The Windows host can inspect the configuration and validate Android when its SDK is available. Do not claim that iOS ran on Windows. Do not start services or deploy the application.

Validate workflow syntax with actionlint when available. Inspect each final gate for success, failure, cancellation, and path-filter skip behavior. Review changes against the baseline with the code-review skill. Its Standards and Spec agents can inspect independently while local validation continues.

## Validation and Acceptance

All previous required site checks remain required. All previous Android release and unit checks remain required. Native state is restored with matching toolchain context and saved after successful builds. A failed cache save must not hide test failures. Test reports must upload after failed checks when reports exist.

The site coverage result must omit generated Prisma source and still satisfy the unchanged global and API route floors. The EventForm comparison must keep the same behavior cases. Backend environment changes must pass the affected suites. A teardown fix must clean the owning resource rather than force Jest to exit.

At completion, document the checks that actually ran and the CI checks that require a later platform run. A local timing improvement is not a claim about hosted runner performance.

## Idempotence and Recovery

Dependency installation uses the existing lockfile. Tests use their current isolated mocks and opt-in database controls. Changes are local and reversible through the branch diff. Do not reset unrelated files or delete shared caches. Use one test process per checkout.

## Artifacts and Notes

The initial CI timings and source evidence are in `docs/test-performance-audit-2026-09-05.md`. Add concise local before/after measurements here as validation proceeds. Future CI artifacts should contain per-test timings, coverage summaries, and Gradle task profiles.

## Interfaces and Dependencies

Use the existing Jest, ts-jest, Mantine, Gradle, Kotlin, and GitHub Actions interfaces. Do not add an npm workspace or join the npm and Gradle graphs. Cache state must be keyed for the operating system and relevant toolchain inputs. Workflow job outputs and final gate dependencies must agree after job changes.

Plan created on 2026-09-05 to execute the approved test performance audit fixes.

Plan updated on 2026-09-05 with implemented configuration changes, local benchmark results, gate validation, and Windows test limitations.
