@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.core.presentation.util

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.EaseInCubic
import androidx.compose.animation.core.EaseInQuart
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.EaseOutQuart
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format.MonthNames
import kotlinx.datetime.format.Padding
import kotlinx.datetime.format.char
import kotlinx.datetime.toLocalDateTime
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.time.ExperimentalTime

fun instantToDateTimeString(instant: Instant): String {
    return instant.toLocalDateTime(timeZone = TimeZone.currentSystemDefault()).toString()
}

@Composable
expect fun getScreenWidth(): Int

@Composable
expect fun getScreenHeight(): Int

val timeFormat = LocalTime.Format {
    amPmHour(Padding.NONE)
    char(':')
    minute()
    char(' ')
    amPmMarker("AM", "PM")
}

val dateFormat = LocalDate.Format {
    day(padding = Padding.ZERO)
    char(' ')
    monthName(MonthNames.ENGLISH_ABBREVIATED)
}

val dateTimeFormat = LocalDateTime.Format {
    day(padding = Padding.NONE)
    char(' ')
    monthName(MonthNames.ENGLISH_ABBREVIATED)
    char(',')
    char(' ')
    year()
    char('-')
    amPmHour()
    char(':')
    minute()
    char(' ')
    amPmMarker("AM", "PM")
}

fun Int.teamSizeFormat(): String {
    return if (this < 7) "$this" else "6+"
}

@Composable
fun LazyListState.isScrollingUp(): State<Boolean> {
    return produceState(initialValue = true) {
        var lastIndex = 0
        var lastScroll = Int.MAX_VALUE
        snapshotFlow {
            firstVisibleItemIndex to firstVisibleItemScrollOffset
        }.collect { (currentIndex, currentScroll) ->
            if (currentIndex != lastIndex || currentScroll != lastScroll) {
                value = currentIndex < lastIndex ||
                        (currentIndex == lastIndex && currentScroll < lastScroll)
                lastIndex = currentIndex
                lastScroll = currentScroll
            }
        }
    }
}

fun String.toTitleCase(): String {
    return this
        .lowercase()
        .split(" ")
        .joinToString(" ") { word ->
            word.replaceFirstChar { char ->
                char.uppercase()
            }
        }.split(".").joinToString(".") { word ->
            word.replaceFirstChar { char ->
                char.uppercase()
            }
        }
}

fun String.toDivisionCase(): String {
    return this
        .lowercase()
        .split(" ")
        .joinToString(" ") { word ->
            if (word.length > 3) {
                word.replaceFirstChar { char ->
                    char.uppercase()
                }
            } else {
                word.uppercase()
            }
        }
}

fun Double.moneyFormat(): String {
    val rounded = (this * 100).roundToInt()
    val whole = rounded / 100
    val fraction = abs(rounded % 100)
    return "$$whole.${if (fraction < 10) "0" else ""}$fraction"
}

fun AnimatedContentTransitionScope<Boolean>.transitionSpec(animationDelay: Int) = if (targetState) {
    slideInVertically(
        initialOffsetY = { it / 4 },
        animationSpec = tween(300, delayMillis = animationDelay, easing = EaseOutCubic)
    ) + fadeIn(
        animationSpec = tween(300, delayMillis = animationDelay + 100)
    ) + expandVertically(
        animationSpec = tween(300, delayMillis = animationDelay, easing = EaseOutCubic)
    ) togetherWith slideOutVertically(
        targetOffsetY = { -it / 4 },
        animationSpec = tween(200, easing = EaseInCubic)
    ) + fadeOut(
        animationSpec = tween(200)
    ) + shrinkVertically(
        animationSpec = tween(200, easing = EaseInCubic)
    )
} else {
    slideInVertically(
        initialOffsetY = { -it / 4 },
        animationSpec = tween(300, delayMillis = animationDelay, easing = EaseOutCubic)
    ) + fadeIn(
        animationSpec = tween(300, delayMillis = animationDelay + 100)
    ) + expandVertically(
        animationSpec = tween(300, delayMillis = animationDelay, easing = EaseOutCubic)
    ) togetherWith slideOutVertically(
        targetOffsetY = { it / 4 },
        animationSpec = tween(200, easing = EaseInCubic)
    ) + fadeOut(
        animationSpec = tween(200)
    ) + shrinkVertically(
        animationSpec = tween(200, easing = EaseInCubic)
    )
}.using(SizeTransform(clip = false))

fun AnimatedContentTransitionScope<Boolean>.buttonTransitionSpec() =
    if (targetState) {
        slideInVertically(
            initialOffsetY = { it / 8 },
            animationSpec = tween(200, easing = EaseOutQuart)
        ) + fadeIn(
            animationSpec = tween(150, delayMillis = 50)
        ) togetherWith slideOutVertically(
            targetOffsetY = { -it / 8 },
            animationSpec = tween(150, easing = EaseInQuart)
        ) + fadeOut(
            animationSpec = tween(100)
        )
    } else {
        slideInVertically(
            initialOffsetY = { -it / 8 },
            animationSpec = tween(200, easing = EaseOutQuart)
        ) + fadeIn(
            animationSpec = tween(150, delayMillis = 50)
        ) togetherWith slideOutVertically(
            targetOffsetY = { it / 8 },
            animationSpec = tween(150, easing = EaseInQuart)
        ) + fadeOut(
            animationSpec = tween(100)
        )
    }.using(SizeTransform(clip = false))

fun createEventUrl(event: EventAbs): String {
    return "https://www.razumly.com/mvp/${if (event.eventType == EventType.TOURNAMENT) "tournament/" else "event/"}${event.id}"
}