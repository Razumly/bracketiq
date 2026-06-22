package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class EventPaymentPlanHelpersTest {

    @Test
    fun preview_uses_selected_division_payment_plan_details() {
        val event = paidMultiDivisionEvent(
            selectedDivision = DivisionDetail(
                id = "division-b",
                name = " Advanced ",
                price = 4500,
                allowPaymentPlans = true,
                installmentAmounts = listOf(1500, 3000),
                installmentDueDates = listOf(" 2026-07-01 ", "", "2026-08-01"),
            ),
        )

        val preview = buildPaymentPlanPreviewDialogState(
            event = event,
            ownerLabel = "You",
            forTeamJoin = false,
            preferredDivisionId = "division-b",
            currentUserIsMinor = false,
            isEventFull = false,
        )

        assertEquals(
            PaymentPlanPreviewDialogState(
                ownerLabel = "You",
                totalAmountCents = 4500,
                installmentAmounts = listOf(1500, 3000),
                installmentDueDates = listOf("2026-07-01", "2026-08-01"),
                divisionLabel = "Advanced",
            ),
            preview,
        )
    }

    @Test
    fun preview_is_suppressed_for_self_join_when_event_uses_team_signup() {
        val event = paidMultiDivisionEvent(teamSignup = true)

        assertNull(
            buildPaymentPlanPreviewDialogState(
                event = event,
                ownerLabel = "You",
                forTeamJoin = false,
                preferredDivisionId = "division-b",
                currentUserIsMinor = false,
                isEventFull = false,
            ),
        )
        assertNotNull(
            buildPaymentPlanPreviewDialogState(
                event = event,
                ownerLabel = "Your team",
                forTeamJoin = true,
                preferredDivisionId = "division-b",
                currentUserIsMinor = false,
                isEventFull = false,
            ),
        )
    }

    @Test
    fun preview_is_suppressed_for_minor_or_full_event() {
        val event = paidMultiDivisionEvent()

        assertNull(
            buildPaymentPlanPreviewDialogState(
                event = event,
                ownerLabel = "You",
                forTeamJoin = false,
                preferredDivisionId = "division-b",
                currentUserIsMinor = true,
                isEventFull = false,
            ),
        )
        assertNull(
            buildPaymentPlanPreviewDialogState(
                event = event,
                ownerLabel = "You",
                forTeamJoin = false,
                preferredDivisionId = "division-b",
                currentUserIsMinor = false,
                isEventFull = true,
            ),
        )
    }

    @Test
    fun weekly_payment_plan_preview_uses_relative_due_offsets() {
        val event = paidMultiDivisionEvent(
            eventType = EventType.WEEKLY_EVENT,
            timeSlotIds = listOf("slot-1"),
            selectedDivision = DivisionDetail(
                id = "division-b",
                name = "Advanced",
                price = 4500,
                allowPaymentPlans = true,
                installmentAmounts = listOf(1500, 3000),
                installmentDueDates = listOf("2026-07-01", "2026-08-01"),
                installmentDueRelativeDays = listOf(0, 14),
            ),
        )

        val preview = buildPaymentPlanPreviewDialogState(
            event = event,
            ownerLabel = "You",
            forTeamJoin = false,
            preferredDivisionId = "division-b",
            currentUserIsMinor = false,
            isEventFull = false,
        )

        assertEquals(emptyList(), preview?.installmentDueDates)
        assertEquals(listOf(0, 14), preview?.installmentDueRelativeDays)
    }

    @Test
    fun effective_payment_plan_preserves_missing_division_price() {
        val event = paidMultiDivisionEvent(
            selectedDivision = DivisionDetail(
                id = "division-b",
                name = "Advanced",
                price = null,
                allowPaymentPlans = true,
                installmentAmounts = listOf(1500, 3000),
                installmentDueDates = listOf("2026-07-01", "2026-08-01"),
            ),
        )

        val paymentPlan = resolveEffectivePaymentPlan(event, preferredDivisionId = "division-b")

        assertNull(paymentPlan.priceCents)
        assertEquals(0, paymentPlan.configuredPriceCents)
        assertNull(
            buildPaymentPlanPreviewDialogState(
                event = event,
                ownerLabel = "You",
                forTeamJoin = false,
                preferredDivisionId = "division-b",
                currentUserIsMinor = false,
                isEventFull = false,
            ),
        )
    }

    private fun paidMultiDivisionEvent(
        teamSignup: Boolean = false,
        eventType: EventType = EventType.EVENT,
        timeSlotIds: List<String> = emptyList(),
        selectedDivision: DivisionDetail = DivisionDetail(
            id = "division-b",
            name = "Advanced",
            price = 4500,
            allowPaymentPlans = true,
            installmentAmounts = listOf(1500, 3000),
            installmentDueDates = listOf("2026-07-01", "2026-08-01"),
        ),
    ): Event {
        return Event(
            id = "event-1",
            name = "Paid Event",
            divisions = listOf("division-a", "division-b"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "division-a",
                    name = "Beginner",
                    price = 2500,
                    allowPaymentPlans = false,
                ),
                selectedDivision,
            ),
            singleDivision = false,
            teamSignup = teamSignup,
            eventType = eventType,
            timeSlotIds = timeSlotIds,
        )
    }
}
