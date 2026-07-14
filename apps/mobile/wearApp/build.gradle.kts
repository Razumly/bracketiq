import java.util.Properties

val wearVersion = "0.1.0"
val wearVersionCode = 100001

plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.kotlinAndroid)
    alias(libs.plugins.composeCompiler)
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

android {
    namespace = "com.razumly.mvp.wear"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.razumly.mvp"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = wearVersionCode
        versionName = wearVersion

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
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        jvmToolchain(17)
    }

    packaging {
        resources.pickFirsts.add("META-INF/*")
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
}

dependencies {
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose.android)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.wear.compose.foundation)
    implementation(libs.androidx.wear.compose.material3)
    implementation(libs.androidx.wear.compose.navigation)
    implementation(libs.androidx.wear.compose.ui.tooling)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.client.logging)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.androidx.security.crypto)
    implementation(libs.play.services.wearable)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(libs.kotlin.test)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.compose.ui.test.junit4)
    testImplementation(libs.robolectric)
}
