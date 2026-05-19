package com.razumly.mvp.core.util

import kotlin.native.Platform as NativePlatform
import platform.Foundation.NSBundle

@OptIn(kotlin.experimental.ExperimentalNativeApi::class)
@Suppress("unused", "EXPECT_ACTUAL_CLASSIFIERS_ARE_IN_BETA_WARNING")
actual object Platform {
    actual val name: String = "iOS"
    actual val isIOS: Boolean = true
    actual val isDebugBuild: Boolean = NativePlatform.isDebugBinary
    actual val isNonReleaseBuild: Boolean = NativePlatform.isDebugBinary
    actual val appVersionName: String = bundleString("CFBundleShortVersionString")
    actual val appBuildNumber: Int? = bundleString("CFBundleVersion").toIntOrNull()
}

private fun bundleString(key: String): String =
    (NSBundle.mainBundle.objectForInfoDictionaryKey(key) as? String)
        ?.trim()
        .orEmpty()
