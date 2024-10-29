plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.kotlinCocoapods)
    alias(libs.plugins.androidLibrary)
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
            api(libs.koin.core)
            runtimeOnly(libs.androidx.lifecycle.runtime.compose)
            api(libs.napier)
            api(libs.permissions)
            api(libs.geo)
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
}
