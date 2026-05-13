package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MobileEventEditSupportTest {

    @Test
    fun host_can_edit_organization_owned_event_when_mobile_supported() {
        val event = Event(
            organizationId = "org-1",
            hostId = "host-1",
            state = "PUBLISHED",
        )

        assertTrue(
            canEditEventDetailsOnMobile(
                event = event,
                isHost = true,
                canManageTemplate = false,
            )
        )
    }

    @Test
    fun payment_plan_configuration_prevents_mobile_editing() {
        val event = Event(
            allowPaymentPlans = true,
            installmentCount = 2,
            installmentAmounts = listOf(2500, 2500),
        )

        val features = mobileEventEditUnsupportedFeatures(event)

        assertEquals(listOf(MobileEventEditUnsupportedFeature.PAYMENT_PLANS), features)
        assertFalse(
            canEditEventDetailsOnMobile(
                event = event,
                isHost = true,
                canManageTemplate = false,
            )
        )
    }

    @Test
    fun division_payment_plan_configuration_prevents_mobile_editing() {
        val event = Event(
            singleDivision = false,
            divisionDetails = listOf(
                DivisionDetail(
                    id = "event-1__division__open",
                    allowPaymentPlans = true,
                    installmentCount = 2,
                    installmentAmounts = listOf(2000, 2000),
                )
            ),
        )

        assertEquals(
            listOf(MobileEventEditUnsupportedFeature.PAYMENT_PLANS),
            mobileEventEditUnsupportedFeatures(event),
        )
    }

    @Test
    fun split_league_playoff_divisions_prevent_mobile_editing() {
        val event = Event(
            eventType = EventType.LEAGUE,
            includePlayoffs = true,
            divisionDetails = listOf(
                DivisionDetail(
                    id = "event-1__division__open",
                    playoffPlacementDivisionIds = listOf("event-1__division__playoff"),
                ),
                DivisionDetail(
                    id = "event-1__division__playoff",
                    kind = "PLAYOFF",
                ),
            ),
        )

        assertEquals(
            listOf(MobileEventEditUnsupportedFeature.SPLIT_LEAGUE_PLAYOFFS),
            mobileEventEditUnsupportedFeatures(event),
        )
        assertFalse(
            canEditEventDetailsOnMobile(
                event = event,
                isHost = true,
                canManageTemplate = false,
            )
        )
    }

    @Test
    fun unsupported_message_lists_enabled_mobile_blockers() {
        val message = mobileEventEditUnsupportedMessage(
            listOf(
                MobileEventEditUnsupportedFeature.SPLIT_LEAGUE_PLAYOFFS,
                MobileEventEditUnsupportedFeature.PAYMENT_PLANS,
            )
        )

        assertEquals(
            "This event can't be edited on mobile because it uses split league/playoff divisions and payment plans/installments. Teams and matches can still be managed here.",
            message,
        )
    }
}
