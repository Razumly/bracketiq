package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class EventExternalActionHelpersTest {
    @Test
    fun delete_plan_uses_template_message_without_refund() {
        val plan = eventDeletePlan(event(state = "TEMPLATE", paidDivision = true))

        assertEquals("Deleting Template ...", plan.loadingMessage)
        assertFalse(plan.shouldRefund)
    }

    @Test
    fun delete_plan_refunds_paid_non_template_events() {
        val plan = eventDeletePlan(event(paidDivision = true))

        assertEquals("Deleting Event and Refunding ...", plan.loadingMessage)
        assertTrue(plan.shouldRefund)
    }

    @Test
    fun share_payload_uses_event_name_and_public_url() {
        val payload = eventSharePayload(event(id = "event-1", name = "Summer League"))

        assertEquals("Summer League", payload.title)
        assertTrue(payload.url.contains("event-1"))
    }

    @Test
    fun qr_payload_uses_event_name_path_and_png_metadata() {
        val payload = eventQrCodeSharePayload(event(id = "event-2", name = "Cup"))

        assertEquals("Cup QR Code", payload.title)
        assertTrue(payload.path.contains("event-2"))
        assertEquals("event-qr-code.png", payload.fileName)
        assertEquals("image/png", payload.mimeType)
    }

    @Test
    fun directions_plan_prefers_trimmed_address() {
        val plan = assertIs<EventDirectionsPlan.OpenUrl>(
            eventDirectionsPlan(event(address = " 123 Main St "))
        )

        // The launch scheme is platform-specific (`geo:` on Android and Apple Maps on iOS),
        // but both must preserve the normalized, encoded destination.
        assertTrue(plan.url.contains("123%20Main%20St"))
    }

    @Test
    fun directions_plan_uses_coordinates_when_address_missing() {
        val plan = assertIs<EventDirectionsPlan.OpenUrl>(
            eventDirectionsPlan(event(address = null, lat = 40.1, long = -70.2))
        )

        assertTrue(plan.url.contains("40.1,-70.2"))
    }

    @Test
    fun directions_plan_reports_missing_location() {
        val plan = assertIs<EventDirectionsPlan.Unavailable>(
            eventDirectionsPlan(event(address = null, lat = 0.0, long = 0.0))
        )

        assertEquals("No event location available for directions.", plan.message)
    }

    private fun event(
        id: String = "event-1",
        name: String = "Event",
        state: String = "",
        paidDivision: Boolean = false,
        address: String? = "123 Main St",
        lat: Double = 0.0,
        long: Double = 0.0,
    ): Event = Event(
        id = id,
        name = name,
        state = state,
        address = address,
        coordinates = listOf(long, lat),
        divisions = if (paidDivision) listOf("open") else emptyList(),
        divisionDetails = if (paidDivision) {
            listOf(DivisionDetail(id = "open", price = 1000))
        } else {
            emptyList()
        },
    )
}
