import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.targets.native.tasks.KotlinNativeSimulatorTest
import java.io.ByteArrayOutputStream
import java.net.InetSocketAddress
import java.net.URI
import java.net.Socket
import java.util.Properties
import java.util.concurrent.TimeUnit

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.kotlinCocoapods)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.room)
    alias(libs.plugins.compose.vectorize)
    alias(libs.plugins.secrets)
    id("kotlin-parcelize")
    id("com.google.gms.google-services") version "4.4.3"
    id("co.touchlab.skie") version "0.10.5"
}
composeCompiler {
    includeSourceInformation = true
}

compose.resources {
    generateResClass = always
}

val mvpVersion = "0.4.6"
val mvpVersionCode = 11
kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }

    iosX64()
    iosArm64()
    iosSimulatorArm64()

    applyDefaultHierarchyTemplate()

    listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "ComposeApp"
            // your extra linker flags
            linkerOpts.add("-lsqlite3")
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
        pod("IQKeyboardManagerSwift") {
            extraOpts += listOf("-compiler-option", "-fmodules")
        }
        framework {
            baseName = "ComposeApp"
            isStatic = true
            freeCompilerArgs += "-Xbinary=bundleId=com.razumly.mvp"
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
                implementation(compose.runtime)
                implementation(compose.foundation)
                implementation(compose.material3)
                implementation(compose.materialIconsExtended)
                implementation(compose.ui)
                implementation(compose.components.resources)
                implementation(compose.components.uiToolingPreview)
                implementation(libs.runtime.saveable)
                implementation(libs.coil.compose)
                implementation(libs.androidx.room.runtime)
                implementation(libs.androidx.sqlite.bundled)
                implementation(libs.compose.vectorize.core)
                implementation(libs.permissions.compose)
                implementation(libs.ktor.client.core)
                implementation(libs.ktor.client.content.negotiation)
                implementation(libs.ktor.serialization.kotlinx.json)
                implementation(libs.coil.compose.core)
                implementation(libs.coil.compose)
                implementation(libs.coil.mp)
                implementation(libs.coil.network.ktor)
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
                implementation(libs.places)
                implementation(libs.androidx.concurrent.futures.ktx)
                implementation(libs.kotlinx.coroutines.android)
                implementation(libs.androidx.navigation.common.ktx)
                implementation(libs.androidx.activity.ktx)
                implementation(libs.androidx.credentials)
                implementation(libs.androidx.credentials.play.services.auth)
                implementation(libs.googleid)
                implementation("com.google.auth:google-auth-library-oauth2-http:1.37.1") {
                    exclude(group = "org.apache.httpcomponents", module = "httpclient")
                    exclude(group = "org.apache.httpcomponents", module = "httpcore")
                    exclude(module = "commons-logging")
                }
                implementation("com.google.http-client:google-http-client-gson:2.0.0") {
                    exclude(group = "org.apache.httpcomponents", module = "httpclient")
                    exclude(group = "org.apache.httpcomponents", module = "httpcore")
                    exclude(module = "commons-logging")
                }
                implementation("com.google.apis:google-api-services-oauth2:v2-rev20200213-2.0.0") {
                    exclude(group = "org.apache.httpcomponents", module = "httpclient")
                    exclude(group = "org.apache.httpcomponents", module = "httpcore")
                    exclude(module = "commons-logging")
                }
                implementation(libs.firebase.messaging)
                implementation(libs.stripe.android)
                implementation(libs.financial.connections)
                implementation(libs.androidx.browser)
                implementation(libs.ktor.client.okhttp)
            }
        }
        iosMain {
            dependencies {
                implementation(libs.ktor.client.darwin)
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
                implementation(kotlin("test-annotations-common"))
            }
        }
        androidUnitTest {
            dependencies {
                implementation(libs.mockk)
                implementation(libs.robolectric)
                implementation(libs.androidx.core)
            }
        }

        val osName = System.getProperty("os.name")
        val targetOs = when {
            osName == "Mac OS X" -> "macos"
            osName.startsWith("Win") -> "windows"
            osName.startsWith("Linux") -> "linux"
            else -> error("Unsupported OS: $osName")
        }

        val osArch = System.getProperty("os.arch")
        val targetArch = when (osArch) {
            "x86_64", "amd64" -> "x64"
            "aarch64" -> "arm64"
            else -> error("Unsupported arch: $osArch")
        }

        val version = "0.9.22" // or any more recent version
        val target = "${targetOs}-${targetArch}"
        dependencies {
            implementation("org.jetbrains.skiko:skiko-awt-runtime-$target:$version")
        }
    }
}

android {
    namespace = "com.razumly.mvp"
    compileSdk = libs.versions.android.compileSdk.get().toInt()
    buildFeatures.buildConfig = true
    packaging {
        resources.pickFirsts.add("META-INF/*")
        resources.pickFirsts.add("mozilla/*")
    }
    defaultConfig {
        applicationId = "com.razumly.mvp"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = mvpVersionCode
        versionName = mvpVersion
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles (
                getDefaultProguardFile("proguard-android-optimize.txt"),
            )
        }

    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    bundle {
        language {
            enableSplit = false
        }
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
}

room {
    schemaDirectory("$projectDir/schemas")
    generateKotlin = true
}

skie {
    features {
        enableSwiftUIObservingPreview = true
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
    debugImplementation(compose.uiTooling)
    add("kspCommonMainMetadata", libs.androidx.room.compiler)
    add("kspAndroid", libs.androidx.room.compiler)
    add("kspIosX64", libs.androidx.room.compiler)
    add("kspIosArm64", libs.androidx.room.compiler)
    add("kspIosSimulatorArm64", libs.androidx.room.compiler)
    implementation(libs.androidx.foundation.layout)
    implementation(libs.androidx.material)
}

val deviceName =
    project.findProperty("iosDevice") as? String ?: "BE7968D4-D8CD-4F4F-A995-307A153AB31C"

tasks.register<Exec>("bootIOSSimulator") {
    isIgnoreExitValue = true
    val errorBuffer = ByteArrayOutputStream()
    errorOutput = ByteArrayOutputStream()
    commandLine("xcrun", "simctl", "boot", deviceName)

    doLast {
        val result = executionResult.get()
        if (result.exitValue != 148 && result.exitValue != 149) { // ignoring device already booted errors
            println(errorBuffer.toString())
            result.assertNormalExitValue()
        }
    }
}

tasks.withType<KotlinNativeSimulatorTest>().configureEach {
    dependsOn("bootIOSSimulator")
    standalone.set(false)
    device.set(deviceName)
}

fun isPortOpen(host: String, port: Int, timeoutMs: Int = 250): Boolean {
    return try {
        Socket().use { socket ->
            socket.connect(InetSocketAddress(host, port), timeoutMs)
        }
        true
    } catch (_: Exception) {
        false
    }
}

fun loadPropertiesIfExists(file: File): Properties {
    val props = Properties()
    if (!file.exists()) return props
    file.inputStream().use { props.load(it) }
    return props
}

fun detectPackageManager(
    backendDir: File,
    preferred: String?,
): String {
    val normalizedPreferred = preferred?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
    if (normalizedPreferred != null) return normalizedPreferred

    val hasPnpmLock = File(backendDir, "pnpm-lock.yaml").exists()
    if (hasPnpmLock) return "pnpm"

    val hasYarnLock = File(backendDir, "yarn.lock").exists()
    if (hasYarnLock) return "yarn"

    return "npm"
}

fun pmCommand(pm: String, isWindows: Boolean): String {
    return if (isWindows) "$pm.cmd" else pm
}

fun toWslPath(windowsPath: String): String? {
    // Convert "C:\foo\bar" -> "/mnt/c/foo/bar" for WSL.
    val m = Regex("""^([A-Za-z]):\\(.*)$""").matchEntire(windowsPath) ?: return null
    val drive = m.groupValues[1].lowercase()
    val rest = m.groupValues[2].replace('\\', '/')
    return "/mnt/$drive/$rest"
}

fun resolveBackendDir(project: Project): File? {
    val fromGradleProp = project.findProperty("mvp.site.dir")?.toString()?.takeIf { it.isNotBlank() }?.let { File(it) }
    val fromEnv = System.getenv("MVP_SITE_DIR")?.takeIf { it.isNotBlank() }?.let { File(it) }

    val userHome = System.getProperty("user.home") ?: ""

    val candidates = listOfNotNull(
        fromGradleProp,
        fromEnv,
        // Prefer sibling checkout for a mono-workspace style setup.
        project.rootProject.file("../mvp-site"),
        // Common personal setups (including macOS-style path segments, but under user.home).
        File(userHome, "Projects/MVP/mvp-site"),
        File(userHome, "StudioProjects/mvp-site"),
    )

    return candidates.firstOrNull { dir ->
        dir.exists() && File(dir, "package.json").exists()
    }
}

fun resolveWslBackendDir(project: Project): String {
    val fromGradleProp = project.findProperty("mvp.site.wsl.dir")?.toString()?.takeIf { it.isNotBlank() }
    val fromEnv = System.getenv("MVP_SITE_WSL_DIR")?.takeIf { it.isNotBlank() }
    return fromGradleProp ?: fromEnv ?: "~/Projects/MVP/mvp-site"
}

fun resolveWslDistro(project: Project): String? {
    val fromGradleProp = project.findProperty("mvp.site.wsl.distro")?.toString()?.takeIf { it.isNotBlank() }
    val fromEnv = System.getenv("MVP_SITE_WSL_DISTRO")?.takeIf { it.isNotBlank() }
    return fromGradleProp ?: fromEnv
}

fun wslArgs(distro: String?, script: String): List<String> {
    val args = mutableListOf("wsl.exe")
    if (!distro.isNullOrBlank()) {
        args.addAll(listOf("-d", distro))
    }
    args.addAll(listOf("--", "bash", "-c", script))
    return args
}

fun runProcess(
    command: List<String>,
    timeoutSeconds: Long,
    outAppend: File? = null,
    errAppend: File? = null,
): Int? {
    val pb = ProcessBuilder(command)
    pb.redirectOutput(outAppend?.let { ProcessBuilder.Redirect.appendTo(it) } ?: ProcessBuilder.Redirect.DISCARD)
    pb.redirectError(errAppend?.let { ProcessBuilder.Redirect.appendTo(it) } ?: ProcessBuilder.Redirect.DISCARD)

    val proc = pb.start()
    val finished = proc.waitFor(timeoutSeconds, TimeUnit.SECONDS)
    if (!finished) {
        proc.destroy()
        return null
    }

    return proc.exitValue()
}

fun resolveBackendPort(project: Project, backendPortProp: String?): Int {
    val fromProp = backendPortProp?.toIntOrNull()?.takeIf { it > 0 }
    if (fromProp != null) return fromProp

    // Derive from MVP_API_BASE_URL when possible so one configuration drives both app and server.
    val secrets = loadPropertiesIfExists(project.rootProject.file("secrets.properties"))
    val defaults = loadPropertiesIfExists(project.rootProject.file("local.defaults.properties"))
    val baseUrl = (secrets.getProperty("MVP_API_BASE_URL") ?: defaults.getProperty("MVP_API_BASE_URL"))?.trim()
        ?.takeIf { it.isNotBlank() } ?: return 3000

    return try {
        val port = URI(baseUrl).port
        if (port > 0) port else 3000
    } catch (_: Exception) {
        3000
    }
}

val startLocalBackend = tasks.register("startLocalBackend") {
    group = "mvp"
    description = "Starts the local mvp-site backend (Next.js dev server) if it's not already running."

    doLast {
        val startBackend = (findProperty("mvp.startBackend")?.toString() ?: "true").toBoolean()
        if (!startBackend) {
            logger.lifecycle("startLocalBackend: disabled via -Pmvp.startBackend=false")
            return@doLast
        }

        val isCi = !System.getenv("CI").isNullOrBlank() || !System.getenv("GITHUB_ACTIONS").isNullOrBlank()
        if (isCi) {
            logger.lifecycle("startLocalBackend: skipping on CI")
            return@doLast
        }

        val isWindows = System.getProperty("os.name")?.lowercase()?.contains("win") == true

        val backendPort = resolveBackendPort(project, findProperty("mvp.site.port")?.toString())
        if (isPortOpen("127.0.0.1", backendPort)) {
            logger.lifecycle("startLocalBackend: already running on http://localhost:$backendPort")
            return@doLast
        }

        val backendDir = resolveBackendDir(project)

        val logDir = layout.buildDirectory.dir("localBackend").get().asFile
        logDir.mkdirs()
        val outFile = File(logDir, "backend.out.log").also { it.writeText("") }
        val errFile = File(logDir, "backend.err.log").also { it.writeText("") }

        if (backendDir == null) {
            // Many dev setups keep mvp-site under WSL (~//Projects/MVP/mvp-site). If so, start it there.
            if (!isWindows) {
                logger.lifecycle(
                    "startLocalBackend: mvp-site not found; skipping. " +
                        "Set MVP_SITE_DIR or -Pmvp.site.dir=<path-to-mvp-site>."
                )
                return@doLast
            }

            val wslDir = resolveWslBackendDir(project)
            val wslDistro = resolveWslDistro(project)

            val checkExit = try {
                runProcess(
                    command = wslArgs(wslDistro, "cd \"$wslDir\" && test -f package.json"),
                    timeoutSeconds = 10,
                )
            } catch (_: Exception) {
                null
            }

            if (checkExit != 0) {
                logger.lifecycle(
                    "startLocalBackend: mvp-site not found (Windows or WSL). " +
                        "Windows: set MVP_SITE_DIR or -Pmvp.site.dir=<path-to-mvp-site>. " +
                        "WSL: set MVP_SITE_WSL_DIR or -Pmvp.site.wsl.dir=<wsl-path>."
                )
                return@doLast
            }

            val nodeModulesExit = runProcess(
                command = wslArgs(wslDistro, "cd \"$wslDir\" && test -d node_modules"),
                timeoutSeconds = 10,
            )
            if (nodeModulesExit != 0) {
                logger.lifecycle("startLocalBackend: installing backend dependencies (WSL / npm) ...")
                runProcess(
                    command = wslArgs(wslDistro, "cd \"$wslDir\" && npm install"),
                    timeoutSeconds = 60 * 15,
                    outAppend = outFile,
                    errAppend = errFile,
                )
            }

            logger.lifecycle(
                "startLocalBackend: starting (WSL) in $wslDir on port $backendPort. " +
                    "Logs: ${outFile.absolutePath}"
            )

            try {
                // Keep wsl.exe alive running the server (like we do on Windows). This is more reliable than
                // trying to background inside WSL and hoping the process survives after this command exits.
                ProcessBuilder(
                    wslArgs(
                        wslDistro,
                        "cd \"$wslDir\" && npm run dev -- --hostname 0.0.0.0 --port $backendPort",
                    )
                )
                    .redirectOutput(ProcessBuilder.Redirect.appendTo(outFile))
                    .redirectError(ProcessBuilder.Redirect.appendTo(errFile))
                    .start()
            } catch (e: Exception) {
                logger.error(
                    "startLocalBackend: failed to start backend via WSL. " +
                        "You can disable via -Pmvp.startBackend=false. " +
                        "Error: ${e.message}"
                )
            }
        } else {
            val pm = detectPackageManager(
                backendDir = backendDir,
                preferred = findProperty("mvp.site.pm")?.toString(),
            )
            val pmCmd = pmCommand(pm, isWindows)

            // Install deps if needed. This keeps the "one click run" experience intact after a fresh clone.
            if (!File(backendDir, "node_modules").exists()) {
                logger.lifecycle("startLocalBackend: installing backend dependencies ($pm) ...")
                val installArgs = listOf(pmCmd, "install")
                exec {
                    workingDir = backendDir
                    commandLine(installArgs)
                }
            }

            val devArgs = when (pm) {
                "pnpm" -> listOf(pmCmd, "run", "dev", "--", "--hostname", "0.0.0.0", "--port", backendPort.toString())
                "yarn" -> listOf(pmCmd, "run", "dev", "--hostname", "0.0.0.0", "--port", backendPort.toString())
                else -> listOf(pmCmd, "run", "dev", "--", "--hostname", "0.0.0.0", "--port", backendPort.toString())
            }

            logger.lifecycle(
                "startLocalBackend: starting ($pm) in $backendDir on port $backendPort. " +
                    "Logs: ${outFile.absolutePath}"
            )

            try {
                ProcessBuilder(devArgs)
                    .directory(backendDir)
                    .redirectOutput(ProcessBuilder.Redirect.appendTo(outFile))
                    .redirectError(ProcessBuilder.Redirect.appendTo(errFile))
                    .start()
            } catch (e: Exception) {
                logger.error(
                    "startLocalBackend: failed to start backend. " +
                        "You can disable via -Pmvp.startBackend=false. " +
                        "Error: ${e.message}"
                )
            }
        }

        // Give the server a moment to bind to its port so the app doesn't immediately fail on first launch.
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20)
        while (System.nanoTime() < deadline) {
            if (isPortOpen("127.0.0.1", backendPort)) {
                logger.lifecycle("startLocalBackend: backend reachable on http://localhost:$backendPort")
                return@doLast
            }
            Thread.sleep(500)
        }

        logger.lifecycle("startLocalBackend: backend still starting; continuing build.")
    }
}

// Android Studio "Run" triggers the debug build graph; wiring here makes it effectively one click.
tasks.matching { it.name == "preDebugBuild" }.configureEach {
    dependsOn(startLocalBackend)
}
