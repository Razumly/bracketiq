package com.razumly.mvp.core.util

@Suppress("unused", "EXPECT_ACTUAL_CLASSIFIERS_ARE_IN_BETA_WARNING")
expect object Platform {
    val name: String
    val isIOS: Boolean
    val isDebugBuild: Boolean
    val isNonReleaseBuild: Boolean
    val appVersionName: String
    val appBuildNumber: Int?
}
