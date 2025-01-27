package com.razumly.mvp.eventList.components

import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.sp
import com.razumly.mvp.eventList.util.TextPattern
import com.razumly.mvp.eventList.util.TextPatterns

@Composable
fun StylizedText(text: String, patterns: TextPatterns) {
    Text(
        buildAnnotatedString {
            var remainingText = text
            while (remainingText.isNotEmpty()) {
                val matchResult = findLongestMatchingPattern(remainingText, patterns)

                if (matchResult != null) {
                    val (pattern, startIndex, endIndex) = matchResult

                    // Append any text before the match
                    if (startIndex > 0) {
                        append(remainingText.substring(0, startIndex))
                    }

                    // Get the matched text with its original punctuation
                    val matchedText = remainingText.substring(startIndex, endIndex)
                    val prefix = matchedText.takeWhile { !it.isLetterOrDigit() }
                    val suffix = matchedText.takeLastWhile { !it.isLetterOrDigit() }
                    val cleanMatch = matchedText.removeSurrounding(prefix, suffix)

                    // Append prefix
                    append(prefix)

                    // Append styled match
                    withStyle(SpanStyle(color = pattern.color)) {
                        if (pattern.caseSensitive) {
                            append(pattern.text)
                        } else {
                            append(cleanMatch)
                        }
                    }

                    // Add icon before suffix
                    pattern.icon?.let {
                        appendInlineContent(pattern.text)
                    }

                    // Append suffix
                    append(suffix)

                    // Update remaining text
                    remainingText = remainingText.substring(endIndex)
                } else {
                    // No match found, append first character and continue
                    append(remainingText[0])
                    remainingText = remainingText.substring(1)
                }
            }
        },
        inlineContent = buildMap {
            patterns.getAllPatterns().forEach { pattern ->
                pattern.icon?.let {
                    put(pattern.text, InlineTextContent(
                        Placeholder(
                            width = 20.sp,
                            height = 20.sp,
                            placeholderVerticalAlign = PlaceholderVerticalAlign.TextCenter
                        )
                    ) {
                        Icon(
                            imageVector = pattern.icon,
                            contentDescription = null,
                            tint = pattern.color
                        )
                    })
                }
            }
        }
    )
}

private data class PatternMatch(
    val pattern: TextPattern,
    val startIndex: Int,
    val endIndex: Int
)

private fun findLongestMatchingPattern(text: String, patterns: TextPatterns): PatternMatch? {
    val allPatterns = patterns.getAllPatterns()
    return allPatterns
        .mapNotNull { pattern ->
            val matchResult = if (pattern.caseSensitive) {
                text.indexOf(pattern.text)
            } else {
                text.indexOf(pattern.text, ignoreCase = true)
            }

            if (matchResult >= 0) {
                PatternMatch(
                    pattern = pattern,
                    startIndex = matchResult,
                    endIndex = matchResult + pattern.text.length
                )
            } else null
        }
        .minByOrNull { it.startIndex }
}

private fun TextPatterns.getAllPatterns(): List<TextPattern> {
    // Sort patterns by length (longest first) to ensure longer matches take precedence
    return (divisions + playerCounts + fieldTypes + listOf(title))
        .sortedByDescending { it.text.length }
}
