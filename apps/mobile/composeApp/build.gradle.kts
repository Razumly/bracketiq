
import co.touchlab.skie.configuration.SuppressSkieWarning
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.plugin.mpp.NativeBuildType
import org.jetbrains.kotlin.gradle.targets.native.tasks.KotlinNativeSimulatorTest
import org.gradle.api.tasks.bundling.Zip
import java.io.ByteArrayOutputStream
import java.util.Properties
import java.util.concurrent.TimeUnit

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.kotlinCocoapods)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.compose.vectorize)
    alias(libs.plugins.secrets)
    alias(libs.plugins.google.services) apply false
    alias(libs.plugins.skie)
    id("kotlin-parcelize")
}

val googleServicesConfigFile = layout.projectDirectory.file("google-services.json").asFile
val hasGoogleServicesConfig = googleServicesConfigFile.isFile

if (hasGoogleServicesConfig) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.lifecycle(
        "composeApp/google-services.json is not configured. " +
            "Firebase, push notifications, analytics, and Android Google sign-in are disabled; " +
            "debug builds and unit tests remain available.",
    )
}

val requireGoogleServicesConfig by tasks.registering {
    group = "verification"
    description = "Fails release builds when the untracked Android Google Services config is missing."
    doLast {
        if (!googleServicesConfigFile.isFile) {
            throw GradleException(
                "Release builds require composeApp/google-services.json. " +
                    "Run scripts/provision-google-services.sh; see README.md for local and CI setup.",
            )
        }
    }
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    dependsOn(requireGoogleServicesConfig)
}

composeCompiler {
    includeSourceInformation = providers.gradleProperty("compose.includeSourceInformation")
        .map(String::toBoolean)
        .orElse(false)
        .get()
}

compose.resources {
    generateResClass = always
}

val canonicalLogoComment =
    "<!-- Canonical BracketIQ logo geometry. Generate platform variants with :composeApp:generateLogoVectors. -->"
val generatedLogoComment =
    "<!-- Generated from mvp_logo.xml by :composeApp:generateLogoVectors. Do not edit manually. -->"
val composeResourceSuppression = "<!--suppress XmlPathReference, XmlUnboundNsPrefix -->"
val canonicalLogoFile = layout.projectDirectory.file(
    "src/commonMain/composeResources/drawable/mvp_logo.xml",
)
val generatedLogoFiles = mapOf(
    "launcher" to layout.projectDirectory.file("src/androidMain/res/drawable/ic_launcher_foreground.xml"),
    "notification" to layout.projectDirectory.file("src/androidMain/res/drawable/ic_notification_logo.xml"),
    "lightBackground" to layout.projectDirectory.file(
        "src/commonMain/composeResources/drawable/mvp_logo_white_bg.xml",
    ),
)

fun renderLogoVariant(canonicalXml: String, variant: String): String {
    val geometryXml = canonicalXml
        .removePrefix("$canonicalLogoComment\n")
        .removePrefix("$composeResourceSuppression\n")
    val transformed = when (variant) {
        "launcher" -> geometryXml
            .replace("android:scaleX=\"1\"", "android:scaleX=\"0.8\"")
            .replace("android:scaleY=\"1\"", "android:scaleY=\"0.8\"")
            .replace("android:translateX=\"0\"", "android:translateX=\"18.5\"")
            .replace("android:translateY=\"0\"", "android:translateY=\"18.5\"")
        "notification" -> Regex("android:fillColor=\"#[0-9A-Fa-f]+\"")
            .replace(geometryXml, "android:fillColor=\"#FFFFFFFF\"")
        "lightBackground" -> geometryXml.replaceFirst(
            "android:fillColor=\"#fefefe\"",
            "android:fillColor=\"#000000\"",
        )
        else -> error("Unknown logo variant: $variant")
    }
    val resourceSuppression = if (variant == "lightBackground") {
        "$composeResourceSuppression\n"
    } else {
        ""
    }
    return "$generatedLogoComment\n$resourceSuppression$transformed"
}

val generateLogoVectors by tasks.registering {
    group = "branding"
    description = "Regenerates platform logo vectors from the canonical shared geometry."
    inputs.file(canonicalLogoFile)
    outputs.files(generatedLogoFiles.values)
    doLast {
        val canonicalXml = canonicalLogoFile.asFile.readText()
        generatedLogoFiles.forEach { (variant, destination) ->
            destination.asFile.writeText(renderLogoVariant(canonicalXml, variant))
        }
    }
}

val verifyLogoVectors by tasks.registering {
    group = "verification"
    description = "Rejects manually drifted logo geometry variants."
    inputs.file(canonicalLogoFile)
    inputs.files(generatedLogoFiles.values)
    doLast {
        val canonicalXml = canonicalLogoFile.asFile.readText()
        val drifted = generatedLogoFiles.mapNotNull { (variant, destination) ->
            variant.takeIf { destination.asFile.readText() != renderLogoVariant(canonicalXml, variant) }
        }
        if (drifted.isNotEmpty()) {
            throw GradleException(
                "Generated logo vectors are stale (${drifted.joinToString()}). " +
                    "Run ./gradlew :composeApp:generateLogoVectors.",
            )
        }
    }
}

tasks.matching { it.name == "preBuild" }.configureEach {
    dependsOn(verifyLogoVectors)
}

val mvpVersion = "1.6.14"
val mvpVersionCode = 67

fun loadProperties(path: String): Properties =
    Properties().apply {
        val propertiesFile = rootProject.file(path)
        if (propertiesFile.isFile) {
            propertiesFile.inputStream().use(::load)
        }
    }

val secretProperties = loadProperties("secrets.properties")
val defaultProperties = loadProperties("local.defaults.properties")

fun configProperty(name: String, fallback: String = ""): String =
    secretProperties.getProperty(name)
        ?: defaultProperties.getProperty(name)
        ?: fallback
kotlin {
    compilerOptions {
        freeCompilerArgs.add("-Xexpect-actual-classes")
    }

    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }

    iosArm64()
    iosSimulatorArm64()

    applyDefaultHierarchyTemplate()

    listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "ComposeApp"
            linkerOpts.add("-lsqlite3")
            val podConfiguration = when (buildType) {
                NativeBuildType.DEBUG -> "Debug"
                NativeBuildType.RELEASE -> "Release"
            }
            val podSdk = if (target.name == "iosArm64") "iphoneos" else "iphonesimulator"
            val syntheticPodsBuildPath = layout.buildDirectory.asFile.get().absolutePath +
                "/cocoapods/synthetic/ios/build/$podConfiguration-$podSdk"

            // K/N does not always propagate CocoaPods -F search paths when a transitive klib
            // (for example kmpnotifier's FirebaseMessaging cinterop) contributes linker flags.
            listOf(
                "GoogleSignIn",
                "GooglePlaces",
                "FirebaseCore",
                "FirebaseMessaging",
                "FirebaseAnalytics",
                "IQKeyboardManagerSwift",
            ).forEach { podName ->
                linkerOpts.add("-F$syntheticPodsBuildPath/$podName")
                linkerOpts.add("-F$syntheticPodsBuildPath/XCFrameworkIntermediates/$podName")
            }
            linkerOpts.add("-framework")
            linkerOpts.add("WatchConnectivity")
        }
    }

    cocoapods {
        version = mvpVersion
        summary = "MVP App for pick up Volleyball events"
        homepage = "https://example.com"
        ios.deploymentTarget = "15.3"
        podfile = project.file("../iosApp/Podfile")

        pod("GoogleSignIn")
        pod("GooglePlaces")
        pod("FirebaseCore")
        pod("FirebaseMessaging")
        pod("FirebaseAnalytics")
        pod("IQKeyboardManagerSwift") {
            extraOpts += listOf("-compiler-option", "-fmodules")
        }
        framework {
            baseName = "ComposeApp"
            isStatic = true
            freeCompilerArgs += "-Xbinary=bundleId=com.razumly.mvp"
            export(projects.core.model)
            export(libs.decompose.decompose)
            export(libs.lifecycle)
            export(libs.kmpnotifier)
            export(libs.geo)
        }
    }


    sourceSets {
        all {
            languageSettings.optIn("kotlin.time.ExperimentalTime")
        }
        commonMain {
            dependencies {
                implementation(libs.runtime)
                api(projects.core.model)
                implementation(projects.core.database)
                api(project(":core:repository-impl"))
                api(projects.core.ui)
                implementation(libs.foundation)
                implementation(libs.material3)
                implementation(libs.material.icons.extended)
                implementation(libs.jetbrains.ui)
                implementation(libs.jetbrains.components.resources)
                implementation(libs.jetbrains.ui.tooling.preview)
                implementation(libs.runtime.saveable)
                implementation(libs.coil.compose)
                implementation(libs.compose.vectorize.core)
                implementation(libs.permissions.compose)
                api(projects.core.network)
                implementation(libs.coil.compose.core)
                implementation(libs.coil.mp)
                implementation(libs.coil.network.ktor)
                implementation(libs.coil.svg)
                implementation(libs.haze.materials)
                implementation(libs.haze)
                implementation(libs.androidx.datastore)
                implementation(libs.datastore.preferences)
                implementation(libs.materialKolor)
                implementation(libs.kmpalette.extensions.network)
                implementation(libs.kmpalette.core)
                implementation(libs.lifecycle.coroutines)
                implementation(libs.jetbrains.kotlin.metadata.jvm)
                implementation(libs.imagepickerkmp)
                api(libs.androidx.performance.annotation)
                api(libs.lifecycle)
                api(libs.kmpnotifier)
                api(libs.decompose.decompose)
                api(libs.decompose.extensions)
                api(libs.decompose.extentions.experimental)
                api(libs.kotlinx.serialization.core)
                api(libs.geo.compose)
                api(libs.kotlinx.datetime)
                api(libs.kotlinx.datetime.ext)
                api(libs.koin.core)
                api(libs.napier)
                api(libs.permissions)
                api(libs.permissions.location)
                api(libs.permissions.notifications)
                implementation(libs.compose.multiplatform)
                api(libs.geo)
            }
        }

        androidMain {
            dependencies {
                implementation(libs.androidx.lifecycle.runtime.compose)
                implementation(libs.androidx.activity.compose)
                implementation(libs.koin.android)
                implementation(libs.koin.androidx.compose)
                implementation(libs.koin.compose)
                implementation(libs.maps.compose)
                implementation(libs.play.services.maps)
                implementation(libs.play.services.location)
                implementation(libs.play.services.wearable)
                implementation(libs.places)
                implementation(libs.androidx.concurrent.futures.ktx)
                implementation(libs.kotlinx.coroutines.android)
                implementation(libs.androidx.navigation.common.ktx)
                implementation(libs.androidx.activity.ktx)
                implementation(libs.androidx.credentials)
                implementation(libs.androidx.credentials.play.services.auth)
                implementation(libs.androidx.core.splashscreen)
                implementation(libs.googleid)
                implementation(libs.firebase.analytics)
                implementation(libs.firebase.messaging)
                implementation(libs.posthog.android)
                implementation(libs.stripe.android)
                implementation(libs.financial.connections)
                implementation(libs.androidx.browser)
                implementation(libs.androidx.security.crypto)
                implementation(libs.androidx.sqlite.bundled)
            }
        }
        iosMain {
            dependencies {
            }
        }
        commonTest {
            dependencies {
                implementation(libs.turbine)
                implementation(libs.kotlin.test)
                implementation(libs.assertk)
                implementation(libs.koin.test)
                implementation(libs.androidx.sqlite.bundled)
                implementation(libs.kotlinx.coroutines.test)
                implementation(libs.ktor.client.mock)
                implementation(libs.ktor.client.content.negotiation)
                implementation(libs.ktor.serialization.kotlinx.json)
                implementation(libs.kotlinx.serialization.json)
                implementation(kotlin("test-annotations-common"))
            }
        }
        androidUnitTest {
            dependencies {
                implementation(libs.mockk)
                implementation(libs.robolectric)
                implementation(libs.androidx.test.core)
                implementation(libs.androidx.compose.ui.test.junit4)
            }
        }

    }
}

android {
    namespace = "com.razumly.mvp"
    compileSdk = libs.versions.android.compileSdk.get().toInt()
    buildFeatures.buildConfig = true
    defaultConfig {
        applicationId = "com.razumly.mvp"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = mvpVersionCode
        versionName = mvpVersion
        // The Secrets Gradle plugin supplies application variants, but Android's
        // generated unit-test manifest is merged independently. Mirror the
        // configured key into defaultConfig so every Android variant resolves
        // the map placeholder without a test-only fake value.
        manifestPlaceholders["MAPS_API_KEY"] = configProperty("MAPS_API_KEY")
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles (
                getDefaultProguardFile("proguard-android-optimize.txt"),
            )
            ndk {
                debugSymbolLevel = "SYMBOL_TABLE"
            }
        }

    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
}

val packageReleaseNativeDebugSymbols by tasks.registering(Zip::class) {
    group = "build"
    description = "Packages Play Console native debug symbols for the release Android app."
    dependsOn("mergeReleaseNativeLibs")

    archiveFileName.set("native-debug-symbols-$mvpVersion-code$mvpVersionCode.zip")
    destinationDirectory.set(layout.buildDirectory.dir("outputs/native-debug-symbols/release"))
    from(layout.buildDirectory.dir("intermediates/merged_native_libs/release/mergeReleaseNativeLibs/out/lib")) {
        include("**/*.so")
        exclude("**/.DS_Store", "__MACOSX/**", "**/__MACOSX/**", "**/*.zip")
    }
    isPreserveFileTimestamps = false
    isReproducibleFileOrder = true
}

tasks.configureEach {
    if (name == "assembleRelease" || name == "bundleRelease") {
        finalizedBy(packageReleaseNativeDebugSymbols)
    }
}

skie {
    features {
        enableSwiftUIObservingPreview = true
        group("androidx.compose.ui.unit") {
            SuppressSkieWarning.NameCollision(true)
        }
        group("androidx.collection") {
            SuppressSkieWarning.NameCollision(true)
        }
        group("io.ktor.http") {
            SuppressSkieWarning.NameCollision(true)
        }
        group("com.mmk.kmpnotifier.notification.configuration") {
            SuppressSkieWarning.NameCollision(true)
        }
    }
}


secrets {
    propertiesFileName = "secrets.properties"
    defaultPropertiesFileName = "local.defaults.properties"
    ignoreList.add("sdk.*")
}

dependencies {
    implementation(libs.androidx.lifecycle.runtime.compose.android)
    implementation(libs.androidx.animation.android)
    debugImplementation(libs.jetbrains.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    implementation(libs.androidx.foundation.layout)
    implementation(libs.androidx.material)
}

val deviceName =
    project.findProperty("iosDevice") as? String ?: "BE7968D4-D8CD-4F4F-A995-307A153AB31C"
val iosWorkspaceFile = rootProject.file("iosApp/iosApp.xcworkspace")
val iosScheme = project.findProperty("iosScheme") as? String ?: "iosApp"
val iosConfiguration = project.findProperty("iosConfiguration") as? String ?: "Debug"
val iosBundleId = project.findProperty("iosBundleId") as? String ?: "com.razumly.mvp"
val iosAppName = project.findProperty("iosAppName") as? String ?: "BracketIQ"
val iosDerivedDataDir = layout.buildDirectory.dir("xcode/DerivedData")
val iosAppBundleDir = iosDerivedDataDir.map {
    it.file("Build/Products/$iosConfiguration-iphonesimulator/$iosAppName.app").asFile
}
val java17Home = runCatching {
    ProcessBuilder("/usr/libexec/java_home", "-v", "17")
        .redirectError(ProcessBuilder.Redirect.DISCARD)
        .start()
        .let { process ->
            val output = process.inputStream.bufferedReader().readText().trim()
            if (process.waitFor(5, TimeUnit.SECONDS) && process.exitValue() == 0) output else ""
        }
}.getOrDefault("")

tasks.register<Exec>("bootIOSSimulator") {
    isIgnoreExitValue = true
    val errorBuffer = ByteArrayOutputStream()
    errorOutput = errorBuffer
    commandLine("xcrun", "simctl", "boot", deviceName)

    doLast {
        val result = executionResult.get()
        if (result.exitValue != 148 && result.exitValue != 149) { // ignoring device already booted errors
            println(errorBuffer.toString())
            result.assertNormalExitValue()
        }
    }
}

tasks.register<Exec>("buildIosAppWorkspace") {
    group = "ios"
    description = "Builds the iOS app workspace for the configured simulator."
    dependsOn("bootIOSSimulator")
    doFirst {
        iosDerivedDataDir.get().asFile.mkdirs()
        if (java17Home.isNotBlank()) {
            environment("JAVA_HOME", java17Home)
            environment("ORG_GRADLE_JAVA_HOME", java17Home)
        }
    }
    commandLine(
        "xcodebuild",
        "-workspace", iosWorkspaceFile.absolutePath,
        "-scheme", iosScheme,
        "-configuration", iosConfiguration,
        "-destination", "id=$deviceName",
        "-derivedDataPath", iosDerivedDataDir.get().asFile.absolutePath,
        "build",
    )
}

tasks.register<Exec>("runIosAppWorkspace") {
    group = "ios"
    description = "Builds, installs, and launches the iOS app on the configured simulator."
    dependsOn("buildIosAppWorkspace")
    doFirst {
        val appBundle = iosAppBundleDir.get()
        if (!appBundle.exists()) {
            throw GradleException("iOS app bundle not found at ${appBundle.absolutePath}")
        }
    }
    commandLine(
        "sh",
        "-c",
        listOf(
            "open -a Simulator",
            "xcrun simctl install \"$deviceName\" \"${iosAppBundleDir.get().absolutePath}\"",
            "xcrun simctl launch \"$deviceName\" \"$iosBundleId\"",
        ).joinToString(" && "),
    )
}

tasks.withType<KotlinNativeSimulatorTest>().configureEach {
    dependsOn("bootIOSSimulator")
    standalone.set(false)
    device.set(deviceName)
}

fun isIdeSyncBuild(): Boolean {
    return System.getProperty("idea.sync.active") == "true" ||
        System.getProperty("android.injected.invoked.from.ide") == "true"
}

fun isXcodeFirstLaunchComplete(): Boolean {
    if (System.getProperty("os.name") != "Mac OS X") return true

    return runCatching {
        runProcess(
            command = listOf("xcodebuild", "-checkFirstLaunchStatus"),
            timeoutSeconds = 10,
        ) == 0
    }.getOrDefault(false)
}

if (isIdeSyncBuild() && !isXcodeFirstLaunchComplete()) {
    logger.warn(
        "Xcode first-launch setup is incomplete. " +
            "Skipping CocoaPods sync tasks for IDE import. " +
            "Run `sudo xcodebuild -license accept` to enable full iOS builds."
    )

    tasks.matching {
        it.name == "podImport" ||
            it.name == "podInstall" ||
            it.name == "podInstallSyntheticIos" ||
            it.name.startsWith("podSetupBuild") ||
            it.name.startsWith("podBuild")
    }.configureEach {
        enabled = false
    }

    tasks.matching {
        it.name.startsWith("cinteropGooglePlaces") ||
            it.name.startsWith("cinteropGoogleSignIn") ||
            it.name.startsWith("cinteropIQKeyboardManagerSwift") ||
            it.name.contains("Cinterop-GooglePlaces") ||
            it.name.contains("Cinterop-GoogleSignIn") ||
            it.name.contains("Cinterop-IQKeyboardManagerSwift")
    }.configureEach {
        enabled = false
    }
}

fun runProcess(
    command: List<String>,
    timeoutSeconds: Long,
): Int? {
    val pb = ProcessBuilder(command)
    pb.redirectOutput(ProcessBuilder.Redirect.DISCARD)
    pb.redirectError(ProcessBuilder.Redirect.DISCARD)

    val proc = pb.start()
    val finished = proc.waitFor(timeoutSeconds, TimeUnit.SECONDS)
    if (!finished) {
        proc.destroy()
        return null
    }

    return proc.exitValue()
}

fun prunePreparedComposeDrawableDirectories(logPrefix: String) {
    val preparedResourcesRoot = layout.buildDirectory
        .dir("generated/compose/resourceGenerator/preparedResources")
        .get()
        .asFile

    if (!preparedResourcesRoot.exists()) return

    preparedResourcesRoot
        .listFiles()
        ?.filter { it.isDirectory }
        ?.forEach { sourceSetDir ->
            val preparedDrawableDir = File(sourceSetDir, "composeResources/drawable")
            if (!preparedDrawableDir.exists()) return@forEach

            preparedDrawableDir.listFiles()
                ?.filter { it.isDirectory }
                ?.forEach { nestedDir ->
                    val removed = project.delete(nestedDir) || nestedDir.deleteRecursively()
                    if (removed) {
                        logger.lifecycle(
                            "$logPrefix: removed nested drawable directory ${sourceSetDir.name}/${nestedDir.name}"
                        )
                    } else if (nestedDir.exists()) {
                        throw GradleException(
                            "$logPrefix: failed to remove nested prepared drawable directory ${nestedDir.absolutePath}"
                        )
                    }
                }
        }
}

fun sanitizeSourceComposeDrawableDirectories(logPrefix: String) {
    val sourceDrawableDir = project.file("src/commonMain/composeResources/drawable")
    if (!sourceDrawableDir.exists()) return

    val nestedDirs = sourceDrawableDir
        .walkTopDown()
        .filter { it.isDirectory && it != sourceDrawableDir }
        .toList()
        .sortedByDescending { it.absolutePath.length }

    nestedDirs.forEach { nestedDir ->
        val containsFiles = nestedDir.walkTopDown().any { it.isFile }
        if (containsFiles) {
            val relPath = nestedDir.relativeTo(project.projectDir).invariantSeparatorsPath
            throw GradleException(
                "$logPrefix: nested drawable directories with files are not supported by Compose resources: $relPath"
            )
        }

        val removed = project.delete(nestedDir) || nestedDir.deleteRecursively()
        if (removed) {
            logger.lifecycle("$logPrefix: removed empty source drawable directory ${nestedDir.name}")
        }
    }
}

val sanitizePreparedComposeResourcesForCommonMain =
    tasks.register("sanitizePreparedComposeResourcesForCommonMain") {
        group = "build"
        description = "Removes nested drawable directories from prepared Compose resources for commonMain."

        doLast {
            sanitizeSourceComposeDrawableDirectories("sanitizePreparedComposeResourcesForCommonMain")
            prunePreparedComposeDrawableDirectories("sanitizePreparedComposeResourcesForCommonMain")
        }
    }

// Compose resource accessor generation expects flat files under drawable/ and can fail on nested dirs.
tasks.matching { it.name.startsWith("prepareComposeResourcesTaskFor") }.configureEach {
    doFirst {
        sanitizeSourceComposeDrawableDirectories(name)
    }
    finalizedBy(sanitizePreparedComposeResourcesForCommonMain)
}

tasks.matching { it.name.startsWith("generateResourceAccessorsFor") }.configureEach {
    dependsOn(sanitizePreparedComposeResourcesForCommonMain)
}

sanitizePreparedComposeResourcesForCommonMain.configure {
    mustRunAfter(tasks.matching { it.name.startsWith("prepareComposeResourcesTaskFor") })
}
