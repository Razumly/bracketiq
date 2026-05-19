package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

internal data class EventRefundPolicy(
    val eventHasStarted: Boolean,
    val refundDeadline: Instant?,
    val canAutoRefund: Boolean,
)

internal fun getRefundPolicy(
    event: Event,
    now: Instant = Clock.System.now(),
    effectiveStart: Instant = event.start,
): EventRefundPolicy {
    val refundBufferHours = event.cancellationRefundHours?.coerceAtLeast(0)
    val refundDeadline = when (refundBufferHours) {
        null -> null
        0 -> effectiveStart
        else -> effectiveStart.minus(refundBufferHours.hours)
    }
    val eventHasStarted = now >= effectiveStart

    return EventRefundPolicy(
        eventHasStarted = eventHasStarted,
        refundDeadline = refundDeadline,
        canAutoRefund = refundBufferHours != null && !eventHasStarted && refundDeadline != null && now < refundDeadline,
    )
}

internal fun formatRefundSummary(cancellationRefundHours: Int?): String {
    val normalizedHours = cancellationRefundHours?.coerceAtLeast(0)
    return when {
        normalizedHours == null -> "Automatic refunds disabled"
        normalizedHours == 0 -> "Until event start"
        else -> "${normalizedHours}h before start"
    }
}
