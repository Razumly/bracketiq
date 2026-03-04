package com.razumly.mvp.core.util

import kotlin.native.Platform as NativePlatform

actual object Platform {
    actual val name: String = "iOS"
    actual val isIOS: Boolean = true
    actual val isDebugBuild: Boolean = NativePlatform.isDebugBinary
    actual val isNonReleaseBuild: Boolean = NativePlatform.isDebugBinary
}
