package com.razumly.mvp.core.presentation.util

import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.animation.StackAnimation
import com.arkivanov.essenty.backhandler.BackHandler


@OptIn(ExperimentalDecomposeApi::class)
expect  fun <C : Any, T : Any> backAnimation(
    backHandler: BackHandler,
    onBack: () -> Unit,
    horizontalDirectionProvider: () -> Int = { 1 },
): StackAnimation<C, T>
