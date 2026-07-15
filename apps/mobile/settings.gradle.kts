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
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

// Local unpublished artifacts are available only when a developer opts in with
// -Pmvp.useMavenLocal=true or MVP_USE_MAVEN_LOCAL=true.
val useMavenLocal = providers.gradleProperty("mvp.useMavenLocal")
    .orElse(providers.environmentVariable("MVP_USE_MAVEN_LOCAL"))
    .map { value -> value.equals("true", ignoreCase = true) }
    .getOrElse(false)

dependencyResolutionManagement {
    repositories {
        google()  // Remove the mavenContent block
        mavenCentral()
        if (useMavenLocal) {
            mavenLocal()
        }
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
