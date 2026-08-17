package com.razumly.mvp.core.util

private data class AndroidPlatformConfig(
    val isDebugBuild: Boolean = false,
    val buildType: String = "release",
    val appVersionName: String = "",
    val appBuildNumber: Int? = null,
)

private var androidPlatformConfig = AndroidPlatformConfig()

fun configurePlatform(
    isDebugBuild: Boolean,
    buildType: String,
    appVersionName: String,
    appBuildNumber: Int?,
) {
    androidPlatformConfig = AndroidPlatformConfig(
        isDebugBuild = isDebugBuild,
        buildType = buildType,
        appVersionName = appVersionName,
        appBuildNumber = appBuildNumber,
    )
}

@Suppress("unused", "EXPECT_ACTUAL_CLASSIFIERS_ARE_IN_BETA_WARNING")
actual object Platform {
    actual val name: String = "Android"
    actual val isIOS: Boolean = false
    actual val isDebugBuild: Boolean
        get() = androidPlatformConfig.isDebugBuild
    actual val isNonReleaseBuild: Boolean =
        !androidPlatformConfig.buildType.equals("release", ignoreCase = true)
    actual val appVersionName: String
        get() = androidPlatformConfig.appVersionName
    actual val appBuildNumber: Int?
        get() = androidPlatformConfig.appBuildNumber
}
