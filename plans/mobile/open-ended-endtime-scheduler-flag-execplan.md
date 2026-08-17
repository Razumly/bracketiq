# Introduce Explicit Open-Ended Scheduling Flag Across Web, Backend, and Mobile

This ExecPlan is a living document. The sections , , , and  will be kept up to date as work proceeds.

This plan follows  at the repository root ().

## Purpose / Big Picture

Hosts currently rely on a sentinel () to represent "no fixed end date/time" for league and tournament scheduling. That sentinel breaks during rescheduling because actual scheduled times diverge from equality. After this change, hosts can explicitly choose whether league/tournament scheduling is open-ended via a dedicated checkbox and persisted event flag. Scheduler behavior will use that flag, fixed windows will enforce , and failed auto-reschedules that would exceed fixed end-time will notify the host so they can extend the event or manually reschedule.

## Progress

- [x] (2026-02-18 18:33Z) Confirmed current implementation uses  sentinel in web EventForm and backend scheduler; identified match finalize auto-reschedule path.
- [x] (2026-02-18 18:33Z) Created this ExecPlan with cross-repo scope and implementation milestones.
- [ ] Implement backend data model and API contract updates for explicit open-ended flag.
- [ ] Update scheduler and auto-reschedule logic to use explicit flag and detect fixed-window overrun failures.
- [ ] Add host notification/email flow for fixed-window auto-reschedule failures.
- [ ] Update web EventForm UI/validation/serialization for league+tournament checkbox and fixed-window constraints.
- [ ] Update mobile models, DTOs, create/edit UI, and validation for the same behavior.
- [ ] Add or update regression tests for backend scheduler/API and mobile/web mapping/validation behavior.
- [ ] Run targeted verification commands and record outcomes.

## Surprises & Discoveries

- Observation: Existing behavior force-sets league/tournament  during create mode in web form state, not only during backend scheduling.
  Evidence:  includes an effect that mutates  to  for league/tournament create flow.

- Observation: Auto-reschedule route currently returns generic scheduling errors without host-facing notifications.
  Evidence:  catches  errors and returns 500 without calling email/push helpers.

## Decision Log

- Decision: Add a persisted boolean event field (name: ) as the single source of truth for open-ended scheduling.
  Rationale: This preserves behavior through lifecycle operations where  and  are naturally different and removes sentinel coupling.
  Date/Author: 2026-02-18 18:33Z / Codex

- Decision: Preserve existing end datetime field even when open-ended is enabled.
  Rationale: Retaining end datetime supports UI continuity, migration safety, and allows users to turn off open-ended mode without re-entering values.
  Date/Author: 2026-02-18 18:33Z / Codex

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

Two repositories are involved.

1. Mobile app repository () contains Kotlin Multiplatform models, DTO mappings, and create/edit event UI in .
2. Web/backend repository () is the source of truth for API schemas, event persistence, scheduling, and web EventForm behavior.

Relevant backend/web files include:
- 
- 
- 
- 
- 
- 
- 
- 
- 

Relevant mobile files include:
- 
- 
- 
- 
- 
- 

## Plan of Work

First, add  to event persistence and API contracts in backend and mobile DTO/model layers so both clients and scheduler can consume one consistent flag.

Second, replace scheduler sentinel logic with explicit flag checks. Open-ended events can extend scheduling horizon as needed; fixed-window events must obey event end-time boundaries.

Third, improve match finalize auto-reschedule error handling so fixed-window overruns trigger host notifications (email and push) and clear API errors.

Fourth, implement UI behavior parity in web and mobile for league/tournament forms: show "No fixed end date/time" checkbox near end datetime controls, enforce  when unchecked, and stop force-setting  as control state.

Fifth, add or update focused tests for serialization/validation/scheduler behaviors and run targeted test commands.

## Concrete Steps

All commands are run from each repository root.

- Backend/web implementation and tests in :
  - 
  - 
- Mobile implementation and tests in :
  - Type-safe project accessors is an incubating feature.

> Configure project :composeApp
w: [33m[1m⚠️ Unsupported Operating System[0m[0m
Kotlin CocoaPods Plugin is fully supported on MacOS machines only. Gradle tasks that can not run on non-mac hosts will be skipped.
[32m[1mSolution:[0m[0m
[32m[3mRun the build on a MacOS machine[0m[0m

w: [33m[1m⚠️ Disabled Kotlin/Native Targets[0m[0m
The following Kotlin/Native targets cannot be built on this machine and are disabled:
iosArm64, iosSimulatorArm64, iosX64
[32m[1mSolution:[0m[0m
[32m[3mTo hide this message, add 'kotlin.native.ignoreDisabledTargets=true' to the Gradle properties.[0m[0m

Configuration 'androidApis' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
WARNING: The following problems were found when resolving the SDK location:
Where: sdk.dir property in local.properties file. Problem: Directory does not exist

Configuration 'debugUnitTestRuntimeClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'androidJdkImage' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugAnnotationProcessorClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugCompileClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugRuntimeClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kotlin-extension' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kotlinCompilerPluginClasspathAndroidDebug' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kotlinCompilerClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kspDebugKotlinAndroidProcessorClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugReverseMetadataValues' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration '_agp_internal_javaPreCompileDebug_kspClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugUnitTestAnnotationProcessorClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugUnitTestCompileClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kotlinCompilerPluginClasspathAndroidDebugUnitTest' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kspDebugUnitTestKotlinAndroidProcessorClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration '_agp_internal_javaPreCompileDebugUnitTest_kspClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.

> Task :composeApp:checkKotlinGradlePluginConfigurationErrors SKIPPED
> Task :composeApp:convertXmlValueResourcesForAndroidMain NO-SOURCE
> Task :composeApp:copyNonXmlValueResourcesForAndroidMain NO-SOURCE
> Task :composeApp:prepareComposeResourcesTaskForAndroidMain NO-SOURCE
> Task :composeApp:generateResourceAccessorsForAndroidMain NO-SOURCE
> Task :composeApp:convertXmlValueResourcesForCommonMain
> Task :composeApp:copyNonXmlValueResourcesForCommonMain
> Task :composeApp:prepareComposeResourcesTaskForCommonMain
> Task :composeApp:generateResourceAccessorsForCommonMain
> Task :composeApp:generateActualResourceCollectorsForAndroidMain UP-TO-DATE
> Task :composeApp:generateComposeResClass
> Task :composeApp:preBuild UP-TO-DATE

> Task :composeApp:startLocalBackend
startLocalBackend: unable to configure adb reverse for tcp:3000 (no device/emulator?)
startLocalBackend: unable to configure adb reverse for tcp:3010 (no device/emulator?)
startLocalBackend: already running on http://localhost:3000

> Task :composeApp:preDebugBuild
> Task :composeApp:generateDebugBuildConfig UP-TO-DATE
> Task :composeApp:generateExpectResourceCollectorsForCommonMain UP-TO-DATE
> Task :composeApp:generateImages UP-TO-DATE
> Task :composeApp:convertXmlValueResourcesForAndroidDebug NO-SOURCE
> Task :composeApp:copyNonXmlValueResourcesForAndroidDebug NO-SOURCE
> Task :composeApp:prepareComposeResourcesTaskForAndroidDebug NO-SOURCE
> Task :composeApp:generateResourceAccessorsForAndroidDebug NO-SOURCE
> Task :composeApp:checkDebugAarMetadata UP-TO-DATE
> Task :composeApp:generateDebugResValues UP-TO-DATE
> Task :composeApp:processDebugGoogleServices UP-TO-DATE
> Task :composeApp:mapDebugSourceSetPaths
> Task :composeApp:generateDebugResources UP-TO-DATE
> Task :composeApp:mergeDebugResources UP-TO-DATE
> Task :composeApp:packageDebugResources UP-TO-DATE
> Task :composeApp:parseDebugLocalResources UP-TO-DATE
> Task :composeApp:createDebugCompatibleScreenManifests UP-TO-DATE
> Task :composeApp:extractDeepLinksDebug UP-TO-DATE
> Task :composeApp:processDebugMainManifest
> Task :composeApp:processDebugManifest
> Task :composeApp:javaPreCompileDebug UP-TO-DATE
> Task :composeApp:convertXmlValueResourcesForAndroidUnitTest NO-SOURCE
> Task :composeApp:copyNonXmlValueResourcesForAndroidUnitTest NO-SOURCE
> Task :composeApp:prepareComposeResourcesTaskForAndroidUnitTest NO-SOURCE
> Task :composeApp:generateResourceAccessorsForAndroidUnitTest NO-SOURCE
> Task :composeApp:convertXmlValueResourcesForAndroidUnitTestDebug NO-SOURCE
> Task :composeApp:copyNonXmlValueResourcesForAndroidUnitTestDebug NO-SOURCE
> Task :composeApp:prepareComposeResourcesTaskForAndroidUnitTestDebug NO-SOURCE
> Task :composeApp:generateResourceAccessorsForAndroidUnitTestDebug NO-SOURCE
> Task :composeApp:convertXmlValueResourcesForCommonTest NO-SOURCE
> Task :composeApp:copyNonXmlValueResourcesForCommonTest NO-SOURCE
> Task :composeApp:prepareComposeResourcesTaskForCommonTest NO-SOURCE
> Task :composeApp:generateResourceAccessorsForCommonTest NO-SOURCE
> Task :composeApp:preDebugUnitTestBuild UP-TO-DATE
> Task :composeApp:javaPreCompileDebugUnitTest UP-TO-DATE
> Task :composeApp:mergeDebugShaders UP-TO-DATE
> Task :composeApp:processDebugManifestForPackage
> Task :composeApp:compileDebugShaders NO-SOURCE
> Task :composeApp:processDebugResources
> Task :composeApp:copyDebugComposeResourcesToAndroidAssets
> Task :composeApp:debugAssetsCopyForAGP NO-SOURCE
> Task :composeApp:generateDebugAssets UP-TO-DATE
> Task :composeApp:mergeDebugAssets UP-TO-DATE
> Task :composeApp:packageDebugUnitTestForUnitTest UP-TO-DATE
> Task :composeApp:processDebugUnitTestManifest UP-TO-DATE
> Task :composeApp:generateDebugUnitTestConfig UP-TO-DATE
> Task :composeApp:kspDebugKotlinAndroid
w: [ksp] The return value includes a data class with a @Relation. It is usually desired to annotate this function with @Transaction to avoid possibility of inconsistent results between the data class and its relations. See https://developer.android.com/reference/androidx/room/Transaction.html for details.
w: [ksp] The return value includes a data class with a @Relation. It is usually desired to annotate this function with @Transaction to avoid possibility of inconsistent results between the data class and its relations. See https://developer.android.com/reference/androidx/room/Transaction.html for details.
w: [ksp] The return value includes a data class with a @Relation. It is usually desired to annotate this function with @Transaction to avoid possibility of inconsistent results between the data class and its relations. See https://developer.android.com/reference/androidx/room/Transaction.html for details.

> Task :composeApp:compileDebugKotlinAndroid
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/build/generated/ksp/android/androidDebug/kotlin/com/razumly/mvp/core/data/MVPDatabaseCtor.kt:5:8 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/androidMain/kotlin/com/razumly/mvp/core/presentation/PaymentProcessor.android.kt:15:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/androidMain/kotlin/com/razumly/mvp/core/presentation/util/BackHandler.android.kt:24:32 'fun androidPredictiveBackAnimatable(initialBackEvent: BackEvent, exitShape: ((@ParameterName(...) Float, @ParameterName(...) BackEvent.SwipeEdge) -> Shape)? = ..., enterShape: ((@ParameterName(...) Float, @ParameterName(...) BackEvent.SwipeEdge) -> Shape)? = ...): PredictiveBackAnimatable' is deprecated. Please use androidPredictiveBackAnimatableV1() or androidPredictiveBackAnimatableV2() functions.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/androidMain/kotlin/com/razumly/mvp/core/presentation/util/ShareService.android.kt:20:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/androidMain/kotlin/com/razumly/mvp/core/util/DecimalFormat.android.kt:4:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/androidMain/kotlin/com/razumly/mvp/core/util/UrlHandler.android.kt:9:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/androidMain/kotlin/com/razumly/mvp/core/util/util.android.kt:3:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/androidMain/kotlin/com/razumly/mvp/di/KoinInitializer.kt:7:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/MapComponent.kt:33:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/MVPDatabseCtor.kt:5:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/PaymentProcessor.kt:15:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/util/ShareService.kt:7:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/util/DecimalFormat.kt:3:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/util/UrlHandler.kt:3:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/util/util.kt:80:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/di/KoinInitializer.kt:3:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt:1347:27 Check for instance is always 'true'.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/DropdownField.kt:7:8 'typealias MenuAnchorType = ExposedDropdownMenuAnchorType' is deprecated. Renamed to ExposedDropdownMenuAnchorType.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/DropdownField.kt:36:29 'typealias MenuAnchorType = ExposedDropdownMenuAnchorType' is deprecated. Renamed to ExposedDropdownMenuAnchorType.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ScheduleView.kt:272:33 'val dayOfMonth: Int' is deprecated. Use the 'day' property instead.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/SetCountDropdown.kt:10:8 'typealias MenuAnchorType = ExposedDropdownMenuAnchorType' is deprecated. Renamed to ExposedDropdownMenuAnchorType.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/TeamSizeLimitDropdown.kt:10:8 'typealias MenuAnchorType = ExposedDropdownMenuAnchorType' is deprecated. Renamed to ExposedDropdownMenuAnchorType.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventMap/MapComponent.kt:8:1 'expect'/'actual' classes (including interfaces, objects, annotations, enums, and 'actual' typealiases) are in Beta. Consider using the '-Xexpect-actual-classes' flag to suppress this warning. Also see: https://youtrack.jetbrains.com/issue/KT-61573
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt:1148:45 'val dayOfMonth: Int' is deprecated. Use the 'day' property instead.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt:2029:22 'fun LocalDateTime(year: Int, monthNumber: Int, dayOfMonth: Int, hour: Int, minute: Int, second: Int = ..., nanosecond: Int = ...): LocalDateTime' is deprecated. Use the constructor that accepts a 'month' and a 'day'.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt:2031:23 'val monthNumber: Int' is deprecated. Use the 'month' property instead.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt:2032:22 'val dayOfMonth: Int' is deprecated. Use the 'day' property instead.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt:392:41 Condition is always 'true'.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt:392:58 Condition is always 'true'.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt:332:36 The corresponding parameter in the supertype 'ProfileComponent' is named 'loadingHandler'. This may cause problems when calling this function with named arguments.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/refundManager/RefundManagerComponent.kt:49:36 The corresponding parameter in the supertype 'RefundManagerComponent' is named 'loadingHandler'. This may cause problems when calling this function with named arguments.
w: file:///mnt/c/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/refundManager/RefundManagerComponent.kt:73:32 The corresponding parameter in the supertype 'RefundManagerComponent' is named 'refundRequest'. This may cause problems when calling this function with named arguments.

> Task :composeApp:compileDebugJavaWithJavac
> Task :composeApp:bundleDebugClassesToRuntimeJar UP-TO-DATE
> Task :composeApp:bundleDebugClassesToCompileJar UP-TO-DATE
> Task :composeApp:kspDebugUnitTestKotlinAndroid SKIPPED
> Task :composeApp:compileDebugUnitTestKotlinAndroid UP-TO-DATE
> Task :composeApp:compileDebugUnitTestJavaWithJavac NO-SOURCE
> Task :composeApp:copyRoomSchemas NO-SOURCE
> Task :composeApp:processDebugJavaRes UP-TO-DATE
> Task :composeApp:processDebugUnitTestJavaRes UP-TO-DATE
> Task :composeApp:testDebugUnitTest

[Incubating] Problems report is available at: file:///mnt/c/Users/samue/StudioProjects/mvp-app/build/reports/problems/problems-report.html

Deprecated Gradle features were used in this build, making it incompatible with Gradle 9.0.

You can use '--warning-mode all' to show the individual deprecation warnings and determine if they come from your own scripts or plugins.

For more on this, please refer to https://docs.gradle.org/8.14.3/userguide/command_line_interface.html#sec:command_line_warnings in the Gradle documentation.

BUILD SUCCESSFUL in 5m 54s
41 actionable tasks: 16 executed, 25 up-to-date
  - Type-safe project accessors is an incubating feature.

> Configure project :composeApp
w: [33m[1m⚠️ Unsupported Operating System[0m[0m
Kotlin CocoaPods Plugin is fully supported on MacOS machines only. Gradle tasks that can not run on non-mac hosts will be skipped.
[32m[1mSolution:[0m[0m
[32m[3mRun the build on a MacOS machine[0m[0m

w: [33m[1m⚠️ Disabled Kotlin/Native Targets[0m[0m
The following Kotlin/Native targets cannot be built on this machine and are disabled:
iosArm64, iosSimulatorArm64, iosX64
[32m[1mSolution:[0m[0m
[32m[3mTo hide this message, add 'kotlin.native.ignoreDisabledTargets=true' to the Gradle properties.[0m[0m

Configuration 'androidApis' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
WARNING: The following problems were found when resolving the SDK location:
Where: sdk.dir property in local.properties file. Problem: Directory does not exist

Configuration 'debugUnitTestRuntimeClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'androidJdkImage' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugAnnotationProcessorClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugCompileClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugRuntimeClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kotlin-extension' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kotlinCompilerPluginClasspathAndroidDebug' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kotlinCompilerClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kspDebugKotlinAndroidProcessorClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugReverseMetadataValues' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration '_agp_internal_javaPreCompileDebug_kspClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugUnitTestAnnotationProcessorClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'debugUnitTestCompileClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kotlinCompilerPluginClasspathAndroidDebugUnitTest' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration 'kspDebugUnitTestKotlinAndroidProcessorClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.
Configuration '_agp_internal_javaPreCompileDebugUnitTest_kspClasspath' was resolved during configuration time.
This is a build performance and scalability issue.
See https://github.com/gradle/gradle/issues/2298
Run with --info for a stacktrace.

> Task :composeApp:checkKotlinGradlePluginConfigurationErrors SKIPPED
> Task :composeApp:convertXmlValueResourcesForAndroidMain NO-SOURCE
> Task :composeApp:copyNonXmlValueResourcesForAndroidMain NO-SOURCE
> Task :composeApp:prepareComposeResourcesTaskForAndroidMain NO-SOURCE
> Task :composeApp:generateResourceAccessorsForAndroidMain NO-SOURCE
> Task :composeApp:convertXmlValueResourcesForCommonMain UP-TO-DATE
> Task :composeApp:copyNonXmlValueResourcesForCommonMain UP-TO-DATE
> Task :composeApp:prepareComposeResourcesTaskForCommonMain UP-TO-DATE
> Task :composeApp:generateResourceAccessorsForCommonMain UP-TO-DATE
> Task :composeApp:generateActualResourceCollectorsForAndroidMain UP-TO-DATE
> Task :composeApp:generateComposeResClass UP-TO-DATE
> Task :composeApp:preBuild UP-TO-DATE

> Task :composeApp:startLocalBackend
startLocalBackend: unable to configure adb reverse for tcp:3000 (no device/emulator?)
startLocalBackend: unable to configure adb reverse for tcp:3010 (no device/emulator?)
startLocalBackend: already running on http://localhost:3000

> Task :composeApp:preDebugBuild
> Task :composeApp:generateDebugBuildConfig UP-TO-DATE
> Task :composeApp:generateExpectResourceCollectorsForCommonMain UP-TO-DATE
> Task :composeApp:generateImages UP-TO-DATE
> Task :composeApp:convertXmlValueResourcesForAndroidDebug NO-SOURCE
> Task :composeApp:copyNonXmlValueResourcesForAndroidDebug NO-SOURCE
> Task :composeApp:prepareComposeResourcesTaskForAndroidDebug NO-SOURCE
> Task :composeApp:generateResourceAccessorsForAndroidDebug NO-SOURCE
> Task :composeApp:checkDebugAarMetadata UP-TO-DATE
> Task :composeApp:generateDebugResValues UP-TO-DATE
> Task :composeApp:processDebugGoogleServices UP-TO-DATE
> Task :composeApp:mapDebugSourceSetPaths UP-TO-DATE
> Task :composeApp:generateDebugResources UP-TO-DATE
> Task :composeApp:mergeDebugResources UP-TO-DATE
> Task :composeApp:packageDebugResources UP-TO-DATE
> Task :composeApp:parseDebugLocalResources UP-TO-DATE
> Task :composeApp:createDebugCompatibleScreenManifests UP-TO-DATE
> Task :composeApp:extractDeepLinksDebug UP-TO-DATE
> Task :composeApp:processDebugMainManifest UP-TO-DATE
> Task :composeApp:processDebugManifest UP-TO-DATE
> Task :composeApp:processDebugManifestForPackage UP-TO-DATE
> Task :composeApp:processDebugResources UP-TO-DATE
> Task :composeApp:kspDebugKotlinAndroid UP-TO-DATE
> Task :composeApp:compileDebugKotlinAndroid UP-TO-DATE
> Task :composeApp:javaPreCompileDebug UP-TO-DATE
> Task :composeApp:compileDebugJavaWithJavac UP-TO-DATE
> Task :composeApp:bundleDebugClassesToRuntimeJar UP-TO-DATE
> Task :composeApp:bundleDebugClassesToCompileJar UP-TO-DATE
> Task :composeApp:convertXmlValueResourcesForAndroidUnitTest NO-SOURCE
> Task :composeApp:copyNonXmlValueResourcesForAndroidUnitTest NO-SOURCE
> Task :composeApp:prepareComposeResourcesTaskForAndroidUnitTest NO-SOURCE
> Task :composeApp:generateResourceAccessorsForAndroidUnitTest NO-SOURCE
> Task :composeApp:convertXmlValueResourcesForAndroidUnitTestDebug NO-SOURCE
> Task :composeApp:copyNonXmlValueResourcesForAndroidUnitTestDebug NO-SOURCE
> Task :composeApp:prepareComposeResourcesTaskForAndroidUnitTestDebug NO-SOURCE
> Task :composeApp:generateResourceAccessorsForAndroidUnitTestDebug NO-SOURCE
> Task :composeApp:convertXmlValueResourcesForCommonTest NO-SOURCE
> Task :composeApp:copyNonXmlValueResourcesForCommonTest NO-SOURCE
> Task :composeApp:prepareComposeResourcesTaskForCommonTest NO-SOURCE
> Task :composeApp:generateResourceAccessorsForCommonTest NO-SOURCE
> Task :composeApp:kspDebugUnitTestKotlinAndroid SKIPPED
> Task :composeApp:compileDebugUnitTestKotlinAndroid UP-TO-DATE
> Task :composeApp:preDebugUnitTestBuild UP-TO-DATE
> Task :composeApp:javaPreCompileDebugUnitTest UP-TO-DATE
> Task :composeApp:compileDebugUnitTestJavaWithJavac NO-SOURCE
> Task :composeApp:mergeDebugShaders UP-TO-DATE
> Task :composeApp:compileDebugShaders NO-SOURCE
> Task :composeApp:copyDebugComposeResourcesToAndroidAssets UP-TO-DATE
> Task :composeApp:debugAssetsCopyForAGP NO-SOURCE
> Task :composeApp:generateDebugAssets UP-TO-DATE
> Task :composeApp:mergeDebugAssets UP-TO-DATE
> Task :composeApp:packageDebugUnitTestForUnitTest UP-TO-DATE
> Task :composeApp:processDebugUnitTestManifest UP-TO-DATE
> Task :composeApp:generateDebugUnitTestConfig UP-TO-DATE
> Task :composeApp:copyRoomSchemas NO-SOURCE
> Task :composeApp:processDebugJavaRes UP-TO-DATE
> Task :composeApp:processDebugUnitTestJavaRes UP-TO-DATE
> Task :composeApp:testDebugUnitTest

[Incubating] Problems report is available at: file:///mnt/c/Users/samue/StudioProjects/mvp-app/build/reports/problems/problems-report.html

Deprecated Gradle features were used in this build, making it incompatible with Gradle 9.0.

You can use '--warning-mode all' to show the individual deprecation warnings and determine if they come from your own scripts or plugins.

For more on this, please refer to https://docs.gradle.org/8.14.3/userguide/command_line_interface.html#sec:command_line_warnings in the Gradle documentation.

BUILD SUCCESSFUL in 27s
41 actionable tasks: 2 executed, 39 up-to-date

Expected outcomes will be recorded as progress continues.

## Validation and Acceptance

Acceptance requires all of the following observable behavior:

1. In both web and mobile create/edit event forms, league/tournament event types show a  checkbox next to end datetime controls.
2. When checkbox is unchecked, saving with  fails validation with user-visible error.
3. When checkbox is checked, scheduling uses open-ended behavior regardless of whether  equals .
4. During auto-reschedule, if a fixed-end event cannot place a match within end-time, host receives notification/email and API returns actionable failure.
5. Existing scheduling for normal fixed-window events remains functional.

## Idempotence and Recovery

All edits are additive and can be rerun safely. If migration generation or tests fail, rerun after resolving compile/type errors without destructive git operations. No hard resets are required.

## Artifacts and Notes

Artifacts will be appended during implementation (test outputs, key diffs, and notification error evidence).

## Interfaces and Dependencies

The resulting contract should expose:

- Backend  type including .
- API create/update payload handling and sanitization allowing .
- Scheduler behavior keyed off  instead of .
- Mobile , , and API DTOs with  mapping.
- Web and mobile event forms using the explicit checkbox for league/tournament.

Plan revision note: Initial plan authored to replace sentinel open-ended scheduling semantics with explicit persisted flag and host notifications for fixed-window auto-reschedule failures.
