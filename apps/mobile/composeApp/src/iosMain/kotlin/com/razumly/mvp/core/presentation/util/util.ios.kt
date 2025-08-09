package com.razumly.mvp.core.presentation.util

import androidx.compose.runtime.Composable
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo

@OptIn(ExperimentalComposeUiApi::class)
@Composable
actual fun getScreenWidth(): Int {
    val windowInfo = LocalWindowInfo.current
    return with(LocalDensity.current) {
        windowInfo.containerSize.width.toDp().value.toInt()
    }
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
actual fun getScreenHeight(): Int {
    val windowInfo = LocalWindowInfo.current
    return with(LocalDensity.current) {
        windowInfo.containerSize.height.toDp().value.toInt()
    }
}
