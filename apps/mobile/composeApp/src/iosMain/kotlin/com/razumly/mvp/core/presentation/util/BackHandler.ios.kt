package com.razumly.mvp.core.presentation.util

import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.tween
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.animation.PredictiveBackParams
import com.arkivanov.decompose.extensions.compose.experimental.stack.animation.StackAnimation
import com.arkivanov.decompose.extensions.compose.experimental.stack.animation.StackAnimator
import com.arkivanov.decompose.extensions.compose.experimental.stack.animation.stackAnimation
import com.arkivanov.decompose.extensions.compose.experimental.stack.animation.stackAnimator
import com.arkivanov.decompose.extensions.compose.stack.animation.isFront
import com.arkivanov.essenty.backhandler.BackHandler

@OptIn(ExperimentalDecomposeApi::class)
actual fun <C : Any, T : Any> backAnimation(
    backHandler: BackHandler,
    onBack: () -> Unit,
    horizontalDirectionProvider: () -> Int,
): StackAnimation<C, T> =
    stackAnimation(
        animator = iosLikeSlide(horizontalDirectionProvider = horizontalDirectionProvider),
        predictiveBackParams = {
            PredictiveBackParams(
                backHandler = backHandler,
                onBack = onBack,
            )
        },
    )

@OptIn(ExperimentalDecomposeApi::class)
private fun iosLikeSlide(
    animationSpec: FiniteAnimationSpec<Float> = tween(),
    horizontalDirectionProvider: () -> Int,
): StackAnimator =
    stackAnimator(animationSpec = animationSpec) { factor, direction ->
        val horizontalDirection = horizontalDirectionProvider().normalizedHorizontalDirection()
        Modifier
            .then(if (direction.isFront) Modifier else Modifier.fade(factor + 1F))
            .offsetXFactor(
                factor = if (direction.isFront) {
                    factor * horizontalDirection
                } else {
                    factor * 0.5F * horizontalDirection
                }
            )
    }

private fun Modifier.fade(factor: Float) =
    drawWithContent {
        drawContent()
        drawRect(color = Color(red = 0F, green = 0F, blue = 0F, alpha = (1F - factor) / 4F))
    }

private fun Modifier.offsetXFactor(factor: Float): Modifier =
    layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)

        layout(placeable.width, placeable.height) {
            placeable.placeRelative(x = (placeable.width.toFloat() * factor).toInt(), y = 0)
        }
    }

private fun Int.normalizedHorizontalDirection(): Int = when {
    this > 0 -> 1
    this < 0 -> -1
    else -> 1
}
