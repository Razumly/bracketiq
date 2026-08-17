package com.razumly.mvp.matchDetail

import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
class MatchSegmentBreakTest {
    @Test
    fun given_positive_break_when_previous_segment_ends_then_countdown_uses_persisted_end_time() {
        val countdown = resolveMatchSegmentBreakCountdown(
            previousSegment = segment(sequence = 1, status = "COMPLETE", endedAt = "2026-08-03T20:00:00Z"),
            currentSegment = segment(sequence = 2),
            breakDurationMinutes = 5,
            now = Instant.parse("2026-08-03T20:02:00Z"),
        )

        assertEquals(300, countdown?.totalSeconds)
        assertEquals(180, countdown?.remainingSeconds)
        assertEquals("segment-1", countdown?.previousSegmentId)
    }

    @Test
    fun given_zero_or_finished_break_when_resolved_then_no_break_is_active() {
        val previous = segment(sequence = 1, status = "COMPLETE", endedAt = "2026-08-03T20:00:00Z")
        val current = segment(sequence = 2)

        assertNull(resolveMatchSegmentBreakCountdown(previous, current, 0, Instant.parse("2026-08-03T20:01:00Z")))
        assertNull(resolveMatchSegmentBreakCountdown(previous, current, 5, Instant.parse("2026-08-03T20:05:00Z")))
    }

    @Test
    fun given_next_segment_started_when_resolved_then_break_does_not_replace_segment_timer() {
        val countdown = resolveMatchSegmentBreakCountdown(
            previousSegment = segment(sequence = 1, status = "COMPLETE", endedAt = "2026-08-03T20:00:00Z"),
            currentSegment = segment(sequence = 2, startedAt = "2026-08-03T20:01:00Z"),
            breakDurationMinutes = 5,
            now = Instant.parse("2026-08-03T20:02:00Z"),
        )

        assertNull(countdown)
    }

    @Test
    fun given_clock_before_saved_end_when_resolved_then_full_break_remains() {
        val countdown = resolveMatchSegmentBreakCountdown(
            previousSegment = segment(sequence = 1, status = "COMPLETE", endedAt = "2026-08-03T20:00:10Z"),
            currentSegment = segment(sequence = 2),
            breakDurationMinutes = 1,
            now = Instant.parse("2026-08-03T20:00:00Z"),
        )

        assertTrue(countdown != null)
        assertEquals(60, countdown.remainingSeconds)
    }

    @Test
    fun given_restart_metadata_when_resolved_then_countdown_uses_restart_time() {
        val previous = segment(sequence = 1, status = "COMPLETE", endedAt = "2026-08-03T20:00:00Z")
        val current = segment(sequence = 2).withRestartedSegmentBreak("2026-08-03T20:02:00Z")

        val countdown = resolveMatchSegmentBreakCountdown(
            previousSegment = previous,
            currentSegment = current,
            breakDurationMinutes = 5,
            now = Instant.parse("2026-08-03T20:02:00Z"),
        )

        assertEquals(300, countdown?.remainingSeconds)
    }

    @Test
    fun given_skipped_break_when_resolved_then_break_stays_inactive_until_restart() {
        val previous = segment(sequence = 1, status = "COMPLETE", endedAt = "2026-08-03T20:00:00Z")
        val skipped = segment(sequence = 2).withSkippedSegmentBreak("2026-08-03T20:01:00Z")

        assertNull(resolveMatchSegmentBreakCountdown(
            previousSegment = previous,
            currentSegment = skipped,
            breakDurationMinutes = 5,
            now = Instant.parse("2026-08-03T20:01:00Z"),
        ))

        val restarted = skipped.withRestartedSegmentBreak("2026-08-03T20:01:00Z")
        assertEquals(null, restarted.metadata?.get(SEGMENT_BREAK_SKIPPED_AT_METADATA_KEY))
        assertEquals("2026-08-03T20:01:00Z", restarted.metadata?.get(SEGMENT_BREAK_STARTED_AT_METADATA_KEY))
    }

    private fun segment(
        sequence: Int,
        status: String = "NOT_STARTED",
        startedAt: String? = null,
        endedAt: String? = null,
    ) = MatchSegmentMVP(
        id = "segment-$sequence",
        matchId = "match-1",
        sequence = sequence,
        status = status,
        startedAt = startedAt,
        endedAt = endedAt,
    )
}
