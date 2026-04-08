package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.eventDetail.composables.buildCancellationRefundOptions
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
            cancellationRefundHours = 0,
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
    fun givenRefundSummaryAndOptions_whenUsingHourCounts_thenLabelsReflectRealHours() {
        assertEquals("36h before start", formatRefundSummary(36))
        assertEquals("Automatic refunds disabled", formatRefundSummary(0))

        val options = buildCancellationRefundOptions(36)

        assertEquals(listOf(36, 24, 48, 0), options.map { it.value })
        assertEquals("36 hours before event", options.first().label)
        assertEquals("Automatic refunds disabled", options.last().label)
    }
}
