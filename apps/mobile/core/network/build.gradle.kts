import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.kotlin.serialization)
}

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

fun String.asBuildConfigString(): String =
    "\"${replace("\\", "\\\\").replace("\"", "\\\"")}\""

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

    sourceSets {
        commonMain {
            dependencies {
                api(projects.core.model)
                api(libs.ktor.client.core)
                api(libs.ktor.client.websockets)
                implementation(libs.androidx.datastore)
                implementation(libs.datastore.preferences)
                implementation(libs.ktor.client.content.negotiation)
                implementation(libs.ktor.client.logging)
                implementation(libs.ktor.serialization.kotlinx.json)
                implementation(libs.napier)
                implementation(libs.kotlinx.serialization.json)
            }
        }
        androidMain {
            dependencies {
                implementation(libs.androidx.security.crypto)
                implementation(libs.ktor.client.okhttp)
            }
        }
        iosMain {
            dependencies {
                implementation(libs.multiplatform.settings)
                implementation(libs.ktor.client.darwin)
            }
        }
        commonTest {
            dependencies {
                implementation(libs.kotlin.test)
                implementation(libs.ktor.client.mock)
                implementation(libs.ktor.client.content.negotiation)
            }
        }
    }
}

android {
    namespace = "com.razumly.mvp.core.network"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        minSdk = libs.versions.android.minSdk.get().toInt()

        buildConfigField(
            "String",
            "MVP_API_BASE_URL",
            configProperty("MVP_API_BASE_URL", "http://10.0.2.2:3000").asBuildConfigString(),
        )
        buildConfigField(
            "String",
            "MVP_API_BASE_URL_REMOTE",
            configProperty("MVP_API_BASE_URL_REMOTE", "https://bracket-iq.com").asBuildConfigString(),
        )
        buildConfigField(
            "String",
            "MVP_WEB_BASE_URL",
            configProperty("MVP_WEB_BASE_URL", "").asBuildConfigString(),
        )
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
