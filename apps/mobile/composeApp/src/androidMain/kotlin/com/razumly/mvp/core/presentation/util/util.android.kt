package com.razumly.mvp.core.presentation.util

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.stack.animation.StackAnimation
import com.arkivanov.decompose.extensions.compose.stack.animation.fade
import com.arkivanov.decompose.extensions.compose.stack.animation.predictiveback.predictiveBackAnimation
import com.arkivanov.decompose.extensions.compose.stack.animation.stackAnimation
import com.arkivanov.essenty.backhandler.BackHandler

@Composable
actual fun getScreenWidth(): Int = LocalConfiguration.current.screenWidthDp
