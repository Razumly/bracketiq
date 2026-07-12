package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.lockedEventTypeTagSlugs
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.eventDetail.selectableMobileEventTypes
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class CreateEventSelectionRulesTest {

    @Test
    fun league_selection_enforces_team_signup_and_mobile_defaults() {
        val start = Instant.fromEpochMilliseconds(1_000L)
        val end = Instant.fromEpochMilliseconds(2_000L)
        val draft = Event(
            eventType = EventType.LEAGUE,
            teamSignup = false,
            singleDivision = false,
            noFixedEndDateTime = true,
            allowPaymentPlans = true,
            installmentCount = 2,
            installmentDueDates = listOf("2026-02-24", "2026-03-24"),
            installmentAmounts = listOf(1000, 1000),
            start = start,
            end = end,
        )

        val updated = draft.applyCreateSelectionRules()

        assertEquals(EventType.LEAGUE, updated.eventType)
        assertTrue(updated.teamSignup)
        assertFalse(updated.singleDivision)
        assertTrue(updated.noFixedEndDateTime)
        assertFalse(updated.allowPaymentPlans == true)
        assertEquals(null, updated.installmentCount)
        assertTrue(updated.installmentDueDates.isEmpty())
        assertTrue(updated.installmentAmounts.isEmpty())
        assertEquals(end, updated.end)
    }

    @Test
    fun tournament_selection_enforces_team_signup_and_mobile_defaults() {
        val start = Instant.fromEpochMilliseconds(5_000L)
        val end = Instant.fromEpochMilliseconds(8_000L)
        val draft = Event(
            eventType = EventType.TOURNAMENT,
            teamSignup = false,
            singleDivision = false,
            noFixedEndDateTime = true,
            start = start,
            end = end,
        )

        val updated = draft.applyCreateSelectionRules()

        assertEquals(EventType.TOURNAMENT, updated.eventType)
        assertTrue(updated.teamSignup)
        assertFalse(updated.singleDivision)
        assertTrue(updated.noFixedEndDateTime)
        assertFalse(updated.allowPaymentPlans == true)
        assertEquals(end, updated.end)
    }

    @Test
    fun event_selection_preserves_event_specific_flags() {
        val start = Instant.fromEpochMilliseconds(10_000L)
        val end = Instant.fromEpochMilliseconds(12_000L)
        val draft = Event(
            eventType = EventType.EVENT,
            teamSignup = false,
            singleDivision = false,
            start = start,
            end = end,
        )

        val updated = draft.applyCreateSelectionRules()

        assertEquals(EventType.EVENT, updated.eventType)
        assertFalse(updated.teamSignup)
        assertFalse(updated.singleDivision)
        assertFalse(updated.noFixedEndDateTime)
        assertFalse(updated.allowPaymentPlans == true)
        assertEquals(end, updated.end)
    }

    @Test
    fun weekly_selection_preserves_team_signup_choice() {
        val start = Instant.fromEpochMilliseconds(13_000L)
        val end = Instant.fromEpochMilliseconds(15_000L)
        val draft = Event(
            eventType = EventType.WEEKLY_EVENT,
            teamSignup = false,
            singleDivision = false,
            noFixedEndDateTime = false,
            start = start,
            end = end,
        )

        val updated = draft.applyCreateSelectionRules()

        assertEquals(EventType.WEEKLY_EVENT, updated.eventType)
        assertFalse(updated.teamSignup)
        assertFalse(updated.singleDivision)
        assertFalse(updated.allowPaymentPlans == true)
        assertEquals(end, updated.end)
    }

    @Test
    fun mobile_creation_and_conversion_do_not_offer_tryouts() {
        assertFalse(
            EventType.TRYOUT in selectableMobileEventTypes(
                isNewEvent = true,
                rentalTimeLocked = false,
                currentEventType = EventType.EVENT,
            ),
        )
        assertFalse(
            EventType.TRYOUT in selectableMobileEventTypes(
                isNewEvent = false,
                rentalTimeLocked = false,
                currentEventType = EventType.EVENT,
            ),
        )
        assertTrue(
            EventType.TRYOUT in selectableMobileEventTypes(
                isNewEvent = false,
                rentalTimeLocked = false,
                currentEventType = EventType.TRYOUT,
            ),
        )
        assertEquals(setOf("tryouts"), lockedEventTypeTagSlugs(EventType.TRYOUT))
    }

    @Test
    fun apply_create_selection_rules_clears_division_payment_plan_data() {
        val draft = Event(
            eventType = EventType.EVENT,
            singleDivision = false,
            divisionDetails = listOf(
                DivisionDetail(
                    id = "division-1",
                    allowPaymentPlans = true,
                    installmentCount = 3,
                    installmentDueDates = listOf("2026-03-01", "2026-04-01", "2026-05-01"),
                    installmentAmounts = listOf(1000, 1000, 1000),
                ),
            ),
        )

        val updated = draft.applyCreateSelectionRules()

        assertFalse(updated.singleDivision)
        assertEquals(1, updated.divisionDetails.size)
        val detail = updated.divisionDetails.first()
        assertFalse(detail.allowPaymentPlans == true)
        assertEquals(null, detail.installmentCount)
        assertTrue(detail.installmentDueDates.isEmpty())
        assertTrue(detail.installmentAmounts.isEmpty())
    }
}
