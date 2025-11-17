import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.targets.native.tasks.KotlinNativeSimulatorTest
import java.io.ByteArrayOutputStream

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
    id("org.kodein.mock.mockmp") version "2.0.0"
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
                api(libs.sdk.for1.kmp)
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

mockmp {
    onTest {
        withHelper()
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
