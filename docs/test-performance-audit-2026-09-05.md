# Site and mobile test time audit

Audit date: 2026-09-05. Current checkout: `a877f70c849298c1eb1f0362209a7ff2c4badbfd`.

The largest mobile delays occur before test execution. The Android job builds a release APK before debug tests. The iOS job rebuilds native dependencies and links the full application test binary. The site runs a large coverage suite, then completes a separate type check. Large UI suites are its slowest test files.

This audit uses completed CI runs and current source files. It does not measure a new local test run. This checkout has no site `node_modules` directory or mobile test reports. The host is Windows, so it cannot reproduce iOS simulator timings. No application, test configuration, workflow, or runtime was changed.

**Measured baseline**

The primary samples use commit `1a6446273e15dc3f94b35ae26b4d405b2d4781b1` on 2026-09-01. The relevant workflows, Jest configuration, package scripts, mobile build file, and Gradle properties match this checkout.

| Job or step | Primary sample | Second successful sample |
| --- | ---: | ---: |
| iOS job | 41m 11s | 48m 31s |
| iOS simulator boot | 1m 57s | 2m 07s |
| iOS Gradle step, including build and tests | 38m 07s | 45m 17s |
| Android job | 15m 21s | 15m 28s |
| Android release Google Sign-In check | 9m 46s | 9m 53s |
| Android release endpoint check | 15s | 15s |
| Android Gradle debug test step, including compilation | 4m 47s | 4m 49s |
| Site job | 13m 19s | — |
| Site dependency installation | 42s | 44s |
| Site lint | 1m 47s | 1m 48s |
| Site coverage test step | 7m 26s | 7m 51s |
| Site type check | 3m 07s | 3m 14s |

Sources: [primary mobile run](https://github.com/Razumly/bracketiq/actions/runs/33488361439), [second mobile run](https://github.com/Razumly/bracketiq/actions/runs/33480165252), [primary site run](https://github.com/Razumly/bracketiq/actions/runs/33488361375), and [second site run](https://github.com/Razumly/bracketiq/actions/runs/33480165247).

Step durations come from GitHub job metadata. The intervals below come from timestamped console messages. Gradle can buffer these messages. Treat task intervals as evidence of where the delay occurs, not as exact profiler measurements.

**Mobile cause 1: the iOS test binary requires a large native build**

The primary log reports `:composeApp:linkDebugTestIosSimulatorArm64` at 09:00:42 UTC. It reports `:composeApp:iosSimulatorArm64Test` at 09:22:02 UTC. This is a 21m 20s interval. The same interval is 28m 29s in the second sample.

The next task appears about four seconds after the primary test-task message. This supports a build bottleneck. It does not establish an exact four-second test duration.

Before this interval, the job builds CocoaPods dependencies, runs C interop generation, compiles core modules, and compiles application and test sources. The test target belongs to `composeApp`. Its build includes Compose UI, resource libraries, Firebase, Google Places, and Google Sign-In. Small shared tests therefore depend on a large application build.

Source: `apps/mobile/composeApp/build.gradle.kts:339`, `:372`, and `:458`. The workflow invokes the application test target at `.github/workflows/mobile-ci.yml:125`.

Priority: preserve native compiler caches first. Then measure the link task with a Gradle profile. Move platform-independent behavior into small modules where that removes an actual application dependency. Keep native tests for platform behavior.

**Mobile cause 2: cache hits do not prevent repeated native work**

Both successful mobile runs report Gradle cache hits. Both also download LLVM and libffi into `/Users/runner/.konan`. Both execute all 97 actionable iOS tasks. Neither reports a task restored `FROM-CACHE`.

The workflow uses `actions/setup-java` with `cache: gradle`. The exact action revision used by the runs caches `.gradle/caches` and the Gradle wrapper. It does not cache `.konan` or CocoaPods outputs. The repository does not enable `org.gradle.caching` or pass `--build-cache`. Gradle task output caching is disabled by default. Sources: [setup-java cache implementation](https://github.com/actions/setup-java/blob/b6effb05e454b25005698d916606bdc6ffcbf961/src/cache.ts), [Gradle build cache documentation](https://docs.gradle.org/current/userguide/build_cache.html).

The configured dependency-cache key only includes `apps/mobile/**/*.gradle*`. It omits the version catalog. An exact cache hit prevents a new save. This can repeat dependency downloads after a catalog-only version update. This is a configuration risk; these samples do not measure its cost.

Priority: preserve `.konan` with suitable platform and toolchain keys. Enable and validate task output caching. Use a cache save strategy that can retain new outputs. Include the version catalog in dependency keys. Check whether CocoaPods tasks can reuse valid outputs. Kotlin explicitly recommends preserving `.konan` in CI. [Kotlin compilation guidance](https://kotlinlang.org/docs/native-improving-compilation-time.html).

**Mobile cause 3: an Android resource check builds the full release APK**

`apps/mobile/scripts/tests/google-sign-in-release-resource-contract.sh:69` invokes `:composeApp:assembleRelease --no-daemon`. It inspects the APK to confirm the Google Sign-In resource.

The primary log reports 301 executed tasks for this check. It includes release Kotlin compilation and R8 shrinking. The interval from the R8 message to `assembleRelease` is about 5m 10s. The complete step takes 9m 46s, or 64% of the Android job.

The next major step compiles debug variants and runs unit tests. Thus one job pays for both release and debug builds. Two release checks also use separate Gradle invocations with `--no-daemon`.

Priority: separate release APK validation from the ordinary unit-test job. Retain it where packaged release resources require validation. Use applicable change rules or a release gate. Combine compatible Gradle checks to avoid repeated configuration. Moving this check can remove about ten minutes from Android unit-test feedback. It will not shorten the overall mobile gate while iOS remains slower.

**Site cause 1: a few large UI suites repeatedly render full application sections**

Both successful site runs pass 780 suites and 5,544 tests. The same UI files are slow in both runs.

| Suite | Primary duration | Second duration |
| --- | ---: | ---: |
| EventForm.test.tsx | 113.9s | 124.1s |
| Schedule page.test.tsx | 47.7s | 54.1s |
| FieldsTabContent.test.tsx | 35.6s | 39.3s |
| OrganizationFinancePanel.test.tsx | 26.4s | 29.3s |
| ScoreUpdateModal.test.tsx | 18.6s | 21.7s |
| LeagueFields.test.tsx | 16.7s | 18.4s |

`apps/site/src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx` has 5,257 lines. Static inspection finds 121 direct test declarations, additional parameterized cases, 122 `renderForm` calls, and 147 `waitFor` calls. These counts describe source code, not elapsed time.

The helper at line 494 renders the open EventForm. It uses `test/utils/renderWithMantine.tsx`, which adds Mantine, modal, and notification providers. Many state and payload assertions therefore pay for full form setup and rendering.

Priority: keep complete UI workflows. Move pure state and payload cases to existing behavior boundaries where the same outcome can be tested without rendering the form. Split independent UI groups to improve scheduling across workers. Benchmark the same cases before and after each change.

**Site cause 2: broad coverage and a fixed two-worker run**

`apps/site/package.json:24` runs `jest --maxWorkers=2 --coverage`. Every matching change runs the complete default suite. The workflow has no test shards.

`apps/site/jest.config.ts:25` includes all source TypeScript in coverage. It does not exclude generated Prisma code. The current generated directory contains 144 TypeScript files and 10.55 MiB of source. Both sampled logs show Babel processing generated Prisma internals above its 500 KB formatting threshold.

The configuration emits five coverage formats. In the primary run, about 23 seconds pass between the final passing-suite message and the Jest summary. This interval includes reporting and teardown. Coverage also adds work during transformation and execution. The logs cannot isolate the total coverage penalty without an equivalent run with coverage disabled.

Priority: exclude generated code from coverage measurement. Keep coverage gates for application behavior. Benchmark worker counts on the actual runner. Consider balanced shards if one runner remains the limiting resource. Measure coverage with and without instrumentation before claiming a specific saving.

**Site cause 3: unnecessary browser environments and incomplete teardown**

Jest defaults to `jsdom`. Seventy-three active TypeScript test files under `src/server` and `src/app/api` have no Node environment override. Examples include `requestParsing.test.ts` and `timeSlotAccess.test.ts`. These run with browser setup despite testing server behavior. Many other server tests already select Node correctly.

The primary successful run also reports that a worker failed to exit cleanly and was force-terminated. This confirms a teardown problem. The log does not identify the responsible suite or show that this warning accounts for minutes of delay.

Priority: use Node for tests that need no browser APIs. Diagnose the teardown warning with a focused `--detectOpenHandles` run. Fix the owning resource or timer. Do not use `--forceExit` as the repair.

**Site cause 4: the quality job runs independent checks in sequence**

`.github/workflows/site-ci.yml:68` through `:78` runs lint, Prisma validation, tests, and type checking in sequence. Lint and type checking add 4m 54s to the primary run after dependency setup. The second sample adds 5m 02s.

Priority: run lint, type checking, and tests as independent jobs if runner capacity permits. This shortens elapsed feedback time without removing checks. Extra job setup reduces the theoretical saving. It does not reduce total compute by itself. The current workflow only configures npm dependency caching; it does not persist Jest transforms or TypeScript incremental output between jobs.

**Scope and rejected explanations**

- The mobile path filter includes all `apps/site/src/app/api/**` changes. Backend test-only edits under that directory can trigger both mobile platforms. This increases run frequency. It does not explain an individual native link delay.
- Site Playwright tests are excluded from default Jest and are not invoked by Site CI. Their configuration uses one worker and a fresh production build by default. This can explain slow local `test:e2e` runs, but it cannot explain the measured Site CI durations.
- Mobile backend integration tests have five- and fifteen-minute limits. Their setup skips them unless `MVP_TEST_BACKEND_URL` is set. The sampled workflow does not set this variable. These limits do not explain the measured successful CI runs.
- The Jest TypeScript configuration inherits `isolatedModules: true`. Duplicate full-project type checking inside ts-jest is not an established cause. [ts-jest documentation](https://kulshekhar.github.io/ts-jest/docs/getting-started/options/isolatedModules).
- The latest site run, on 2026-09-02, failed one assertion in `affiliateSupplyPersistence.test.ts`. Tests took 5m 10s, and type checking was skipped. Its shorter total is not evidence of a performance improvement. [Latest site run](https://github.com/Razumly/bracketiq/actions/runs/33590071911).

**Recommended order**

1. Preserve native compiler state and validate Gradle task output caching.
2. Separate Android release APK validation from debug unit-test feedback.
3. Exclude generated source from site coverage.
4. Run independent site quality checks in parallel jobs.
5. Reduce repeated full-form rendering in the slow UI suites.
6. Correct server test environments and locate the worker teardown leak.
7. Store Gradle task profiles and Jest per-test timing reports as CI artifacts.

Only the measured baseline is established. Savings from configuration or test changes require controlled comparison runs. Keep test counts, assertions, and application coverage gates visible during those comparisons.

**Evidence retrieval**

These read-only commands were used during this audit:

```powershell
gh run view 33488361439 --repo Razumly/bracketiq --json jobs,headSha,url
gh run view 33488361439 --repo Razumly/bracketiq --log
gh run view 33480165252 --repo Razumly/bracketiq --json jobs,headSha,url
gh run view 33480165252 --repo Razumly/bracketiq --log
gh run view 33488361375 --repo Razumly/bracketiq --json jobs,headSha,url
gh run view 33488361375 --repo Razumly/bracketiq --log
gh run view 33480165247 --repo Razumly/bracketiq --log
gh run view 33590071911 --repo Razumly/bracketiq --log-failed
```
