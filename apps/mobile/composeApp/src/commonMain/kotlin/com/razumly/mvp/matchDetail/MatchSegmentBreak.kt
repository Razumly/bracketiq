package com.razumly.mvp.matchDetail

import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

internal const val SEGMENT_BREAK_STARTED_AT_METADATA_KEY = "segmentBreakStartedAt"
internal const val SEGMENT_BREAK_SKIPPED_AT_METADATA_KEY = "segmentBreakSkippedAt"

internal data class MatchSegmentBreakCountdown(
    val totalSeconds: Int,
    val remainingSeconds: Int,
    val previousSegmentId: String,
)

@OptIn(ExperimentalTime::class)
internal fun resolveMatchSegmentBreakCountdown(
    previousSegment: MatchSegmentMVP?,
    currentSegment: MatchSegmentMVP?,
    breakDurationMinutes: Int,
    now: Instant,
): MatchSegmentBreakCountdown? {
    if (breakDurationMinutes <= 0 || previousSegment == null || currentSegment == null) return null
    if (!previousSegment.status.equals("COMPLETE", ignoreCase = true)) return null
    if (!currentSegment.startedAt.isNullOrBlank()) return null
    if (currentSegment.sequence != previousSegment.sequence + 1) return null
    if (currentSegment.metadata?.get(SEGMENT_BREAK_SKIPPED_AT_METADATA_KEY).isNullOrBlank().not()) return null

    val breakStartedAt = (
        currentSegment.metadata?.get(SEGMENT_BREAK_STARTED_AT_METADATA_KEY)
            ?: previousSegment.endedAt
        )
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { value -> runCatching { Instant.parse(value) }.getOrNull() }
        ?: return null
    val totalSeconds = breakDurationMinutes.coerceAtLeast(0) * 60
    val elapsedSeconds = ((now.toEpochMilliseconds() - breakStartedAt.toEpochMilliseconds()) / 1_000L)
        .coerceAtLeast(0L)
        .toInt()
    val remainingSeconds = totalSeconds - elapsedSeconds
    if (remainingSeconds <= 0) return null

    return MatchSegmentBreakCountdown(
        totalSeconds = totalSeconds,
        remainingSeconds = remainingSeconds,
        previousSegmentId = previousSegment.id,
    )
}

internal fun MatchSegmentMVP.withRestartedSegmentBreak(restartedAt: String): MatchSegmentMVP = copy(
    metadata = metadata.orEmpty()
        .minus(SEGMENT_BREAK_SKIPPED_AT_METADATA_KEY)
        .plus(SEGMENT_BREAK_STARTED_AT_METADATA_KEY to restartedAt),
)

internal fun MatchSegmentMVP.withSkippedSegmentBreak(skippedAt: String): MatchSegmentMVP = copy(
    metadata = metadata.orEmpty() + (SEGMENT_BREAK_SKIPPED_AT_METADATA_KEY to skippedAt),
)
