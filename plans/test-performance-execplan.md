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
- [x] (2026-09-05) Complete independent Standards and Spec reviews of the configuration changes. Both found no issues.
- [x] (2026-09-05) Validate both workflows, 22 gate outcomes, both release scripts, and the Prisma schema.
- [x] (2026-09-05) Pass the TypeScript check and ESLint. ESLint reports zero errors and 52 warnings.
- [x] (2026-09-05) Reproduce and repair a reconnect timer race after unmount. All three focused cleanup cases pass.
- [x] (2026-09-05) Run the complete site coverage diagnostic and affected UI and Node checks. Record the remaining baseline and platform failures.
- [x] (2026-09-05) Run focused checks, the complete affected site suite, available mobile validation, and independent code reviews.
- [x] (2026-09-05) Record outcomes and prepare the completed changes for the final commit.
- [x] (2026-09-05) Push the branch and open pull request 154 after the user requested integration into `main`.
- [x] (2026-09-05) Repair the stale runner fixture behind the sole Site CI failure. Both complete affiliate suites pass, with 148 tests.
- [x] (2026-09-05) Pass focused ESLint and both independent reviews for the fixture repair.
- [x] (2026-09-05) Pass hosted Site CI and Mobile CI at `bd0e4a60b`. Confirm Android and native cache reuse in a repeat run.
- [x] (2026-09-05) Validate the lint content-cache follow-up with installed ESLint, actionlint, and both independent reviews.
- [x] (2026-09-05) Pass the full lint command with `--cache-strategy content`. It reports zero errors and 55 warnings. Three warnings concern downloaded coverage report helpers; hosted lint reports the other 52 warnings.
- [ ] Integrate the reviewed branch into `main`.

## Surprises & Discoveries

The checkout has no site dependencies or mobile test reports. Existing CI logs provide the initial baseline. The current host is Windows and cannot run iOS simulator tests. A new local dependency installation is required for a controlled site comparison.

The first local EventForm run took 384.722 seconds. It passed 129 of 130 cases. The unchanged manual-payment assertion failed. Mantine test mode alone took 371.636 seconds and exposed another dirty-state failure. Both cases passed in a focused 7.669-second run after removing unused modal and notification providers from the EventForm wrapper. These runs do not yet establish a reliable overall speedup.

The focused open-handle check ran three server suites. It reported no open handles, but two suites failed on Linux-only socket paths, file modes, and no-follow file access. These files were not changed by this task. The complete site run must distinguish these platform failures from regressions.

The complete diagnostic run exposed two test assumptions about Mantine transitions. One label query also matched the select option list. Three modal assertions queried a dialog after its removal. The revised queries retain the input and visibility checks. Both complete affected suites pass after these changes.

Inspection found a cleanup race in `useEventMatchRealtime`. A pending refresh can finish after unmount and call `scheduleReconnect` or `connect`. Before the repair, the regression test found one remaining timer and a late connection attempt. The repair passes the cleanup signal to the refresh request and checks cancellation before reconnect work. All three cases pass, including the normal mounted reconnect. The complete diagnostic run reported no open handles. This race is not established as the source of the earlier CI worker warning.

The complete site diagnostic ran 784 suites with coverage and open-handle tracing. It passed 756 suites, failed 24, and skipped 4. It passed 5,490 tests, failed 58, and skipped 32. It took 1,482.223 seconds. This Windows diagnostic is not comparable to the two-worker Linux CI duration.

All global coverage floors passed: statements 68.54%, branches 58.27%, functions 69.05%, and lines 69.27%. The route gate passed for 333 files: statements 68.12%, branches 55.57%, functions 68.96%, and lines 69.19%. The coverage map contains no generated source.

All 130 EventForm cases passed in that diagnostic. A later run without coverage took 231.294 seconds for the form suite, compared with 363.114 seconds before the wrapper changes. Test-body totals were 222.907 and 330.527 seconds. Both runs failed the same pre-existing manual-payment clear assertion. This is an indicative local comparison with different cache and load conditions. The final test dispatches both value changes directly and retains the empty-value, invalid-value, and disabled-submit checks. All nine related cases pass.

The complete follow-up UI run passed all 80 schedule page cases, all 22 team modal cases, all five registration phase cases, and all three cleanup cases. All 73 Node environment suites passed across the full run and focused follow-up. One expected POSIX path needed `path.resolve` for Windows. The unchanged route coverage gate tests also passed.

The remaining full-run failures concern Unix sockets, file permissions, symlinks, POSIX paths, shell commands, CRLF-sensitive source assertions, and the affiliate cutover readiness failure already present in CI run 33590071911. This task does not claim a clean Linux or full Windows run.

The Android validation used JDK 17, SDK 36, two workers, a 3 GiB Gradle heap, and in-process Kotlin compilation to limit memory use on this host. It took 16 minutes 2 seconds. Gradle reported 211 actionable tasks: 163 executed and 48 restored from cache. This proves local task cache use, not the later hosted native-cache saving.

Android XML reports contain 1,724 tests: 1,716 passed, two failed, and six skipped. Both failures are in the unchanged `MatchRepositoryRoomPersistenceTest`. They throw `SQLiteCantOpenDatabaseException` while opening the database on this Windows host. Compilation and the other test suites completed. The opt-in backend test URL was unset. No backend runtime was started. The profile is saved under `apps/mobile/build/reports/profile/profile-2026-09-05-10-13-37.html`.

The local profile attributes 3m 46.99s to application Kotlin compilation, 2m 58.94s to application unit tests, and 57.854s to project configuration. Task durations can overlap. Do not add them to estimate elapsed build time.

Actionlint 1.7.12 accepted both workflows. A temporary harness executed the actual gate shell scripts for 22 success, failure, cancellation, and skip cases. All 22 passed. The Android release scripts passed Bash syntax checks. Gradle 9.4.1 starts with JDK 17 on this host.

## Decision Log

Decision: use `--cache-strategy content` for ESLint in CI. The repeat lint job took 2m52s, compared with 2m54s in the first run. ESLint defaults to metadata comparison, and a fresh checkout changes file timestamps. A probe with installed ESLint 9.39.1 executed a custom rule twice with metadata caching after a timestamp-only change. Content caching executed the rule once. Both strategies executed the rule again after a content change. Actionlint and both reviewers accepted the follow-up. No lint rule or gate was removed. See [ESLint cache strategy](https://eslint.org/docs/latest/use/command-line-interface#--cache-strategy). Date: 2026-09-05.

Decision: validate the final lint-only workflow follow-up with full local lint, the cache behavior probe, actionlint, and both reviews. The hosted application checks passed at `bd0e4a60b`, and their application inputs remain unchanged. The `main` workflows will check the integrated commit. Date: 2026-09-05.

Decision: repair the existing affiliate cutover test fixture before integration. The first PR run failed only this case. Diagnostic findings show a retired credential, a missing reviewed egress network, and missing Codex auth handoff evidence. The fixture now uses the same current runner contract as the passing cutover suite. All readiness and cutover assertions remain. Both complete suites pass, with 148 tests in 23.187 seconds. Production validation remains unchanged. Date: 2026-09-05.

Decision: let the first mobile CI run finish before pushing the fixture repair. A new push cancels the current PR workflows. Completion lets the cold native build save its caches for the next revision. Date: 2026-09-05.

Decision: retain all release checks and the existing site coverage floors. Run Android release validation as a separate required job when mobile checks run. Reason: the resource check protects the packaged release APK. Moving it must not remove its protection. Date: 2026-09-05.

Decision: use a dedicated branch in the current checkout. This is a direct user request, not a claimed GitHub issue batch. The other existing issue worktrees remain separate. Date: 2026-09-05.

Decision: implement measured configuration and test changes before any large mobile module refactor. Reason: the audit establishes missing native caches, but does not isolate the marginal link cost of each library. Date: 2026-09-05.

Decision: remove the two static tests in `test/ciConfiguration.test.ts`. Reason: they inspect raw configuration text and fail after the matrix change. The Standards reviewer identified them as implementation checks under `CODING_STANDARDS.md`. Actionlint, 22 executed workflow gate cases, and the retained behavioral route coverage tests provide validation. No application behavior case was removed. Date: 2026-09-05.

Decision: use setup-gradle v5 for the Gradle cache and a separate native cache for `.konan` and CocoaPods state. Include the native catalog, wrapper, build properties, Podfile inputs, architecture, and Xcode hash in its restore prefix. Use a unique run key so successful runs save new state. Reason: fixed dependency keys cannot retain new compiled outputs after an exact hit. Date: 2026-09-05.

## Outcomes & Retrospective

The implementation is complete on `codex/test-performance`. All required CI gates, release assertions, and application coverage floors remain. Standards and Spec reviews found no remaining issues. The follow-up removed only static CI configuration checks; application behavior cases remain.

Site workflow validation, gate execution checks, Prisma validation, TypeScript, ESLint, and both coverage gates passed. All changed Node environment suites and affected UI checks passed across the full and focused runs. The complete site run still has the recorded baseline and platform failures. Android compilation completed and 1,716 tests passed, but two unchanged Room persistence cases failed on Windows.

Hosted Site CI and Mobile CI passed at `bd0e4a60b`. Site CI passed 780 suites and 5,549 tests, with four suites and 32 tests skipped. Both coverage gates passed. Android passed 1,718 tests and skipped six. The first iOS run passed all 1,359 tests. The repeat run confirmed Gradle and native cache restoration. See the measured follow-up in `docs/test-performance-audit-2026-09-05.md`.

The site test job fell from the historical combined quality job's 13m19s to 8m39s. The repeat Android unit job took 1m58s. Its separate release validation took 2m05s. The repeat iOS job took 15m19s, compared with 51m53s in the first PR run and 41m11s in the primary historical sample. The repeated mobile runs used unchanged mobile inputs. These measurements show cache reuse, not a guaranteed duration after application changes.

No production image was published. No deployment was run. Large native module changes remain deferred. Native caching reduced application test linking from 26m55.61s to 3m19.01s in the measured repeat run.

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

Plan updated on 2026-09-05 with final site checks, the reproduced cleanup race, Android cache use and test results, and both review outcomes.
