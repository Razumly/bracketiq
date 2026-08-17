package com.razumly.mvp.eventDetail.composables

import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class MatchCardDateTimeLabelTest {

    @Test
    fun format_match_date_time_label_returns_tbd_for_null_start() {
        val today = Instant.parse("2026-04-25T00:00:00Z")
            .toLocalDateTime(TimeZone.currentSystemDefault())
            .date

        assertEquals("TBD", formatMatchDateTimeLabel(start = null, today = today))
    }

    @Test
    fun format_match_date_time_label_returns_time_only_when_match_is_today() {
        val start = Instant.parse("2026-04-25T16:00:00Z")
        val today = start.toLocalDateTime(TimeZone.currentSystemDefault()).date

        val label = formatMatchDateTimeLabel(start = start, today = today)

        assertTrue(Regex("""^\d{1,2}:\d{2} [AP]\.M\.$""").matches(label))
        assertFalse(label.contains(","))
        assertFalse(label.contains("/"))
    }

    @Test
    fun format_match_date_time_label_returns_full_date_and_time_when_match_is_not_today() {
        val start = Instant.parse("2026-04-25T16:00:00Z")
        val today = Instant.parse("2026-04-24T16:00:00Z")
            .toLocalDateTime(TimeZone.currentSystemDefault())
            .date

        val label = formatMatchDateTimeLabel(start = start, today = today)

        assertTrue(Regex("""^\d{1,2} [A-Z][a-z]{2}, \d{4} \d{1,2}:\d{2} [AP]\.M\.$""").matches(label))
        assertFalse(label.contains("/"))
    }
}
