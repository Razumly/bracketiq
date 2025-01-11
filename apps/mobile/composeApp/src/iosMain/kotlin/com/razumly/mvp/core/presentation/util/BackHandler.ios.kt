package com.razumly.mvp.core.presentation.util

import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.stack.animation.StackAnimation
import com.arkivanov.decompose.extensions.compose.stack.animation.StackAnimator
import com.arkivanov.decompose.extensions.compose.stack.animation.isFront
import com.arkivanov.decompose.extensions.compose.stack.animation.predictiveback.predictiveBackAnimatable
import com.arkivanov.decompose.extensions.compose.stack.animation.predictiveback.predictiveBackAnimation
import com.arkivanov.decompose.extensions.compose.stack.animation.stackAnimation
import com.arkivanov.decompose.extensions.compose.stack.animation.stackAnimator
import com.arkivanov.essenty.backhandler.BackHandler
import kotlin.math.roundToInt

@OptIn(ExperimentalDecomposeApi::class)
actual fun <C : Any, T : Any> backAnimation(
    backHandler: BackHandler,
    onBack: () -> Unit,
): StackAnimation<C, T> =
    predictiveBackAnimation(
        backHandler = backHandler,
        fallbackAnimation = stackAnimation(iosLikeSlide()),
        selector = { initialBackEvent, _, _ ->
            predictiveBackAnimatable(
                initialBackEvent = initialBackEvent,
                exitModifier = { progress, _ -> Modifier.slideExitModifier(progress = progress) },
                enterModifier = { progress, _ -> Modifier.slideEnterModifier(progress = progress) },
            )
        },
        onBack = onBack,
    )

private fun iosLikeSlide(animationSpec: FiniteAnimationSpec<Float> = tween()): StackAnimator =
    stackAnimator(animationSpec = animationSpec) { factor, direction, content ->
        content(
            Modifier
                .fillMaxSize()
                .offsetXFactor(factor = if (direction.isFront) factor else factor * 0.5F)
        )
    }

private fun Modifier.slideExitModifier(progress: Float): Modifier =
    this
        .fillMaxSize()
        .graphicsLayer {
            translationX = size.width * progress
        }

private fun Modifier.slideEnterModifier(progress: Float): Modifier =
    this
        .fillMaxSize()
        .graphicsLayer {
            translationX = size.width * (progress - 1f) * 0.5f
        }

private fun Modifier.offsetXFactor(factor: Float): Modifier =
    layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        layout(placeable.width, placeable.height) {
            val offset = (placeable.width.toFloat() * factor).roundToInt()
            placeable.placeRelative(x = offset, y = 0)
        }
    }


