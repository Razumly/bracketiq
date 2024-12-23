import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.room)
    alias(libs.plugins.compose.vectorize)
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_11)
        }
    }

    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "ComposeApp"
            isStatic = true
        }
    }

    sourceSets {
        androidMain.dependencies {
            implementation(compose.preview)
            implementation(libs.androidx.activity.compose)
            implementation(libs.koin.android)
            implementation(libs.koin.androidx.compose)
            implementation(libs.koin.compose)
            implementation(libs.koin.androidx.compose)
            implementation(libs.maps.compose)
            implementation(libs.play.services.maps)
            implementation(libs.play.services.location)
            implementation(libs.places)
            implementation(libs.decompose.decompose)
            implementation(libs.decompose.extensionsComposeJetbrains)
        }
        commonMain.dependencies {
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.ui)
            implementation(compose.components.resources)
            implementation(compose.components.uiToolingPreview)
            implementation(libs.androidx.lifecycle.runtime.compose)
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.decompose.decompose)
            implementation(libs.decompose.extensionsComposeJetbrains)
            implementation(libs.coil.compose)
            implementation(libs.androidx.room.runtime)
            implementation(libs.androidx.sqlite.bundled)
            implementation(libs.compose.vectorize.core)
            implementation(libs.permissions.compose)
            api(libs.geo.compose)
            api(libs.navigation.compose)
            api(libs.kotlinx.datetime)
            api(libs.kotlinx.datetime.ext)
            api(libs.koin.core)
            api(libs.napier)
            api(libs.permissions)
            api(libs.geo)
            api(libs.kotlinx.serialization.json)
            api("io.appwrite:sdk-for-kmp:0.2.0")
            runtimeOnly(libs.androidx.lifecycle.runtime.compose)
        }
    }
}

android {
    namespace = "com.razumly.mvp"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.razumly.mvp"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    bundle {
        language {
            enableSplit = false
        }
    }
}

room {
    schemaDirectory("$projectDir/schemas")
}

dependencies {
    implementation(libs.places)
    implementation(libs.androidx.navigation.common.ktx)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.material.android)
    implementation(libs.androidx.material3.android)
    debugImplementation(compose.uiTooling)
    add("kspAndroid", libs.androidx.room.compiler)
}

