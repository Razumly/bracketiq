package com.razumly.mvp.core.presentation.util

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration

@Composable
actual fun getScreenWidth(): Int = LocalConfiguration.current.screenWidthDp

@Composable
actual fun getScreenHeight(): Int = LocalConfiguration.current.screenHeightDp
