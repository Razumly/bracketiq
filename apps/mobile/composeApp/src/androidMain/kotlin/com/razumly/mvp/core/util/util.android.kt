package com.razumly.mvp.core.util

import com.razumly.mvp.BuildConfig

@Suppress("unused", "EXPECT_ACTUAL_CLASSIFIERS_ARE_IN_BETA_WARNING")
actual object Platform {
    actual val name: String = "Android"
    actual val isIOS: Boolean = false
    actual val isDebugBuild: Boolean = BuildConfig.DEBUG
    actual val isNonReleaseBuild: Boolean =
        !BuildConfig.BUILD_TYPE.equals("release", ignoreCase = true)
}
