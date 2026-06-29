import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.kotlin.serialization)
}

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
                api(project(":core:repository-api"))
                api(projects.core.model)
                api(projects.core.database)
                api(projects.core.network)
                implementation(libs.androidx.datastore)
                implementation(libs.datastore.preferences)
                implementation(libs.geo)
                implementation(libs.kmpnotifier)
                implementation(libs.napier)
                implementation(libs.kotlinx.datetime)
                implementation(libs.kotlinx.datetime.ext)
                implementation(libs.kotlinx.serialization.json)
                implementation(libs.ktor.client.core)
            }
        }
        androidMain {
            dependencies {
                implementation(libs.androidx.browser)
                implementation(libs.androidx.core)
                implementation(libs.firebase.messaging)
                implementation(libs.kotlinx.coroutines.android)
                implementation(libs.posthog.android)
                implementation(libs.play.services.wearable)
                implementation("androidx.lifecycle:lifecycle-process:2.10.0")
            }
        }
        commonTest {
            dependencies {
                implementation(libs.kotlin.test)
            }
        }
    }
}

android {
    namespace = "com.razumly.mvp.core.repository.impl"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        minSdk = libs.versions.android.minSdk.get().toInt()
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
