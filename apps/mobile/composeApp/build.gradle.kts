import org.jetbrains.compose.ExperimentalComposeLibrary
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
    alias(libs.plugins.secrets)
    id("kotlin-parcelize")
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
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
            linkerOpts.add("-lsqlite3")
        }
    }

    sourceSets {
        commonMain {
            kotlin.srcDir("build/generated/ksp/metadata/commonMain/kotlin")
            dependencies {
                implementation(compose.runtime)
                implementation(compose.foundation)
                implementation(compose.material3)
                implementation(compose.ui)
                implementation(compose.components.resources)
                implementation(compose.components.uiToolingPreview)
                implementation(libs.kotlinx.coroutines.core)
                implementation(libs.kotlinx.serialization.json)
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
                api(libs.geo)
                api("io.appwrite:sdk-for-kmp:0.3.0")
            }
        }

        androidMain {
            kotlin.srcDir("build/generated/ksp/android/androidMain/kotlin")
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
                implementation(libs.androidx.material.android)
                implementation(libs.androidx.material3.android)
                implementation(libs.androidx.navigation.common.ktx)
                implementation(libs.androidx.activity.ktx)
            }
        }


    commonTest.dependencies {
            @OptIn(ExperimentalComposeLibrary::class)
            implementation(compose.uiTest)
            implementation(libs.kotlin.test)
            implementation(libs.assertk)
            implementation(libs.compose.ui.test.manifest)
            implementation(libs.koin.test)
            implementation(libs.androidx.sqlite.bundled)
            implementation(kotlin("test-annotations-common"))
            implementation(libs.core.ktx)
            implementation(libs.junit)
            implementation(libs.robolectric)
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
    implementation(libs.androidx.ui)
    implementation(libs.androidx.material)
}