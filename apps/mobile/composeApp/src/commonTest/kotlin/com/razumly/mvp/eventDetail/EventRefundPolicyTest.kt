package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventRefundPolicyTest {

    @Test
    fun givenFutureEventBeforeDeadline_whenGettingRefundPolicy_thenAutomaticRefundIsAllowed() {
        val event = Event(
            start = Instant.parse("2026-07-01T12:00:00Z"),
            end = Instant.parse("2026-07-01T13:00:00Z"),
            cancellationRefundHours = 24,
        )

        val policy = getRefundPolicy(
            event = event,
            now = Instant.parse("2026-06-28T12:00:00Z"),
        )

        assertFalse(policy.eventHasStarted)
        assertTrue(policy.canAutoRefund)
        assertEquals(Instant.parse("2026-06-30T12:00:00Z"), policy.refundDeadline)
    }

    @Test
    fun givenDisabledAutomaticRefunds_whenGettingRefundPolicy_thenWindowIsClosed() {
        val event = Event(
            start = Instant.parse("2026-07-01T12:00:00Z"),
            end = Instant.parse("2026-07-01T13:00:00Z"),
            cancellationRefundHours = null,
        )

        val policy = getRefundPolicy(
            event = event,
            now = Instant.parse("2026-06-28T12:00:00Z"),
        )

        assertFalse(policy.eventHasStarted)
        assertFalse(policy.canAutoRefund)
        assertEquals(null, policy.refundDeadline)
    }

    @Test
    fun givenZeroHourAutomaticRefunds_whenGettingRefundPolicy_thenWindowClosesAtEventStart() {
        val event = Event(
            start = Instant.parse("2026-07-01T12:00:00Z"),
            end = Instant.parse("2026-07-01T13:00:00Z"),
            cancellationRefundHours = 0,
        )

        val policy = getRefundPolicy(
            event = event,
            now = Instant.parse("2026-07-01T11:59:00Z"),
        )

        assertFalse(policy.eventHasStarted)
        assertTrue(policy.canAutoRefund)
        assertEquals(Instant.parse("2026-07-01T12:00:00Z"), policy.refundDeadline)
    }

    @Test
    fun givenWeeklyParentHasStartedAndSelectedOccurrenceIsFuture_whenGettingRefundPolicy_thenSelectedOccurrenceStartIsUsed() {
        val event = Event(
            start = Instant.parse("2026-07-01T12:00:00Z"),
            end = Instant.parse("2026-07-01T13:00:00Z"),
            cancellationRefundHours = 0,
        )
        val selectedOccurrenceStart = Instant.parse("2026-07-08T12:00:00Z")

        val policy = getRefundPolicy(
            event = event,
            now = Instant.parse("2026-07-02T12:00:00Z"),
            effectiveStart = selectedOccurrenceStart,
        )

        assertFalse(policy.eventHasStarted)
        assertTrue(policy.canAutoRefund)
        assertEquals(selectedOccurrenceStart, policy.refundDeadline)
    }

    @Test
    fun givenRefundSummary_whenUsingHourCounts_thenLabelsReflectRealHours() {
        assertEquals("36h before start", formatRefundSummary(36))
        assertEquals("Until event start", formatRefundSummary(0))
        assertEquals("Automatic refunds disabled", formatRefundSummary(null))
    }
}
