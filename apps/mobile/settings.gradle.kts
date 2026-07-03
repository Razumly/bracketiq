rootProject.name = "MVP"
enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.10.0"
}

dependencyResolutionManagement {
    repositories {
        google()  // Remove the mavenContent block
        mavenCentral()
        mavenLocal()
    }
}

include(":composeApp")
include(":wearApp")
include(":core:model")
include(":core:database")
include(":core:network")
include(":core:repository-api")
include(":core:repository-impl")
include(":core:ui")
