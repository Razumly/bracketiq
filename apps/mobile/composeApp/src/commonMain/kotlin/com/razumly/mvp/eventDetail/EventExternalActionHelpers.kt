package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.hasAnyPaidDivision
import com.razumly.mvp.core.presentation.util.createEventUrl
import com.razumly.mvp.core.presentation.util.getEventQrCodePath
import io.ktor.http.encodeURLQueryComponent

internal data class EventDeletePlan(
    val loadingMessage: String,
    val shouldRefund: Boolean,
)

internal data class EventSharePayload(
    val title: String,
    val url: String,
)

internal data class EventQrCodeSharePayload(
    val title: String,
    val path: String,
    val fileName: String,
    val mimeType: String,
)

internal sealed class EventDirectionsPlan {
    data class OpenUrl(val url: String) : EventDirectionsPlan()
    data class Unavailable(val message: String) : EventDirectionsPlan()
}

internal fun eventDeletePlan(event: Event): EventDeletePlan {
    val isTemplateEvent = event.state.equals("TEMPLATE", ignoreCase = true)
    return when {
        isTemplateEvent -> EventDeletePlan(
            loadingMessage = "Deleting Template ...",
            shouldRefund = false,
        )
        !event.hasAnyPaidDivision() -> EventDeletePlan(
            loadingMessage = "Deleting Event ...",
            shouldRefund = false,
        )
        else -> EventDeletePlan(
            loadingMessage = "Deleting Event and Refunding ...",
            shouldRefund = true,
        )
    }
}

internal fun eventSharePayload(event: Event): EventSharePayload =
    EventSharePayload(
        title = event.name,
        url = createEventUrl(event),
    )

internal fun eventQrCodeSharePayload(event: Event): EventQrCodeSharePayload =
    EventQrCodeSharePayload(
        title = "${event.name} QR Code",
        path = getEventQrCodePath(event.id),
        fileName = "event-qr-code.png",
        mimeType = "image/png",
    )

internal fun eventDirectionsPlan(event: Event): EventDirectionsPlan {
    val destinationQuery = when {
        !event.address.isNullOrBlank() -> event.address.trim()
        event.lat != 0.0 || event.long != 0.0 -> "${event.lat},${event.long}"
        else -> return EventDirectionsPlan.Unavailable(
            "No event location available for directions."
        )
    }

    return EventDirectionsPlan.OpenUrl(
        "geo:0,0?q=${destinationQuery.encodeURLQueryComponent()}"
    )
}
