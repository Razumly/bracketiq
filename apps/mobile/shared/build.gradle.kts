plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.kotlinCocoapods)
    alias(libs.plugins.androidLibrary)
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.0-Beta2"
}

kotlin {
    androidTarget {
        compilations.all {
            kotlinOptions {
                jvmTarget = "11"
            }
        }
    }
    iosX64()
    iosArm64()
    iosSimulatorArm64()

    cocoapods {
        summary = "Some description for the Shared Module"
        homepage = "Link to the Shared Module homepage"
        version = "1.0"
        ios.deploymentTarget = "16.0"
        podfile = project.file("../iosApp/Podfile")
        framework {
            baseName = "shared"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            api(libs.kmp.observableviewmodel.core)
            api(libs.kotlinx.datetime)
            api(libs.kotlinx.datetime.ext)
            api(libs.koin.core)
            runtimeOnly(libs.androidx.lifecycle.runtime.compose)
            api(libs.napier)
            api(libs.permissions)
            api(libs.geo)
            api(libs.kotlinx.serialization.json)
        }
        androidMain.dependencies {
            implementation(libs.sdkForAndroid)
            implementation(libs.koin.android)
            implementation(libs.koin.androidx.compose)
            implementation(libs.navigation.compose)
            implementation(libs.moshi)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.koin.test)
            implementation(libs.kotlinx.coroutines.test)
        }
        all {
            languageSettings.optIn("kotlinx.cinterop.ExperimentalForeignApi")
        }
    }
}

android {
    namespace = "com.razumly.mvp"
    compileSdk = 34
    defaultConfig {
        minSdk = 27
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }


}
dependencies {
    implementation(libs.androidx.core)
    implementation(libs.androidx.activity.ktx)
    testImplementation(libs.junit.jupiter)
}
