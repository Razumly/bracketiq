package com.razumly.mvp.core.network

import kotlin.native.Platform

@OptIn(kotlin.experimental.ExperimentalNativeApi::class)
internal actual val isMvpHttpLoggingEnabled: Boolean = Platform.isDebugBinary
