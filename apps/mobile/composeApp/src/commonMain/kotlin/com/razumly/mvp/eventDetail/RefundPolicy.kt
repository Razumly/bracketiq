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
): EventRefundPolicy {
    val refundBufferHours = event.cancellationRefundHours.coerceAtLeast(0)
    val refundDeadline = if (refundBufferHours > 0) {
        event.start.minus(refundBufferHours.hours)
    } else {
        null
    }
    val eventHasStarted = now >= event.start

    return EventRefundPolicy(
        eventHasStarted = eventHasStarted,
        refundDeadline = refundDeadline,
        canAutoRefund = refundDeadline != null && !eventHasStarted && now < refundDeadline,
    )
}

internal fun formatRefundSummary(cancellationRefundHours: Int): String {
    val normalizedHours = cancellationRefundHours.coerceAtLeast(0)
    return if (normalizedHours > 0) {
        "${normalizedHours}h before start"
    } else {
        "Automatic refunds disabled"
    }
}
