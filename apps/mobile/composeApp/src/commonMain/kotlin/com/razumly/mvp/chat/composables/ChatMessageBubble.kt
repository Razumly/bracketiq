package com.razumly.mvp.chat.composables

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MessageMVP

@Composable
fun ChatMessageBubble(
    message: MessageMVP,
    senderName: String,
    isCurrentUser: Boolean,
    isTimestampExpanded: Boolean,
    timestampText: String,
    onToggleTimestamp: () -> Unit,
) {
    val isEmojiOnly = isEmojiOnlyMessage(
        body = message.body,
        attachmentUrls = message.attachmentUrls,
    )

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isCurrentUser) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.75f)
                .clickable(onClick = onToggleTimestamp),
            horizontalAlignment = if (isCurrentUser) Alignment.End else Alignment.Start,
        ) {
            Text(
                text = senderName,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (isEmojiOnly) {
                Text(
                    text = message.body,
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(
                        top = 4.dp,
                        bottom = 4.dp,
                        start = 4.dp,
                        end = 4.dp,
                    ),
                    textAlign = if (isCurrentUser) TextAlign.End else TextAlign.Start,
                )
            } else {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = if (isCurrentUser) {
                            MaterialTheme.colorScheme.primaryContainer
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant
                        }
                    )
                ) {
                    Text(
                        text = message.body,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            AnimatedVisibility(
                visible = isTimestampExpanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut(),
            ) {
                Text(
                    text = timestampText,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

internal fun isEmojiOnlyMessage(body: String, attachmentUrls: List<String>): Boolean {
    if (attachmentUrls.isNotEmpty()) return false

    val trimmed = body.trim()
    if (trimmed.isEmpty()) return false

    var index = 0
    while (index < trimmed.length) {
        val currentCodePoint = trimmed.codePointAtCompat(index)

        if (isWhitespaceCodePoint(currentCodePoint)) {
            index = trimmed.nextCodePointIndex(index)
            continue
        }

        val nextIndex = consumeEmojiCluster(trimmed, index)
        if (nextIndex < 0) return false
        index = nextIndex
    }

    return true
}

private fun consumeEmojiCluster(text: String, startIndex: Int): Int {
    val textLength = text.length
    val firstCodePoint = text.codePointAtCompat(startIndex)

    if (isKeycapBase(firstCodePoint)) {
        var index = text.nextCodePointIndex(startIndex)
        if (index < textLength && isVariationSelector(text.codePointAtCompat(index))) {
            index = text.nextCodePointIndex(index)
        }
        if (index >= textLength || text.codePointAtCompat(index) != COMBINING_KEYCAP) {
            return -1
        }
        return text.nextCodePointIndex(index)
    }

    if (!isRegionalIndicator(firstCodePoint) && !isCoreEmoji(firstCodePoint)) {
        return -1
    }

    var index = text.nextCodePointIndex(startIndex)

    if (isRegionalIndicator(firstCodePoint)) {
        if (index >= textLength) return -1

        val nextCodePoint = text.codePointAtCompat(index)
        if (!isRegionalIndicator(nextCodePoint)) return -1

        return text.nextCodePointIndex(index)
    }

    while (index < textLength) {
        val codePoint = text.codePointAtCompat(index)

        when {
            isVariationSelector(codePoint) || isSkinToneModifier(codePoint) -> {
                index = text.nextCodePointIndex(index)
            }

            codePoint == ZERO_WIDTH_JOINER -> {
                index = text.nextCodePointIndex(index)
                if (index >= textLength) return -1

                val nextCodePoint = text.codePointAtCompat(index)
                if (!isCoreEmoji(nextCodePoint) && !isRegionalIndicator(nextCodePoint)) return -1
                index = text.nextCodePointIndex(index)
            }

            else -> return index
        }
    }

    return index
}

private fun isCoreEmoji(codePoint: Int): Boolean = when (codePoint) {
    0x00A9, 0x00AE, 0x203C, 0x2049 -> true
    else -> when {
        codePoint in 0x2300..0x23FF -> true
        codePoint in 0x2600..0x27BF -> true
        codePoint in 0x1F170..0x1F251 -> true
        codePoint in 0x1F300..0x1FAFF -> true
        codePoint in 0x1F900..0x1F9FF -> true
        else -> false
    }
}

private fun isRegionalIndicator(codePoint: Int): Boolean =
    codePoint in 0x1F1E6..0x1F1FF

private fun isVariationSelector(codePoint: Int): Boolean =
    codePoint == 0xFE0F || codePoint == 0xFE0E

private fun isSkinToneModifier(codePoint: Int): Boolean =
    codePoint in 0x1F3FB..0x1F3FF

private fun isKeycapBase(codePoint: Int): Boolean =
    codePoint == '#'.code || codePoint == '*'.code || codePoint in '0'.code..'9'.code

private fun String.codePointAtCompat(index: Int): Int {
    require(index in indices) { "Index out of bounds: $index" }

    val first = this[index].code
    if (first !in HIGH_SURROGATE_START..HIGH_SURROGATE_END || index == lastIndex) {
        return first
    }

    val second = this[index + 1].code
    if (second !in LOW_SURROGATE_START..LOW_SURROGATE_END) {
        return first
    }

    return 0x10000 + ((first - HIGH_SURROGATE_START) shl 10) + (second - LOW_SURROGATE_START)
}

private fun String.nextCodePointIndex(index: Int): Int {
    val first = this[index].code
    if (
        first in HIGH_SURROGATE_START..HIGH_SURROGATE_END &&
        index < lastIndex &&
        this[index + 1].code in LOW_SURROGATE_START..LOW_SURROGATE_END
    ) {
        return index + 2
    }
    return index + 1
}

private fun isWhitespaceCodePoint(codePoint: Int): Boolean =
    codePoint <= Char.MAX_VALUE.code && codePoint.toChar().isWhitespace()

private const val ZERO_WIDTH_JOINER = 0x200D
private const val COMBINING_KEYCAP = 0x20E3
private const val HIGH_SURROGATE_START = 0xD800
private const val HIGH_SURROGATE_END = 0xDBFF
private const val LOW_SURROGATE_START = 0xDC00
private const val LOW_SURROGATE_END = 0xDFFF
