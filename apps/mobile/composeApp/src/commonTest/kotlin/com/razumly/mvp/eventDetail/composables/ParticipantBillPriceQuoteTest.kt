package com.razumly.mvp.eventDetail.composables

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ParticipantBillPriceQuoteTest {

    @Test
    fun unconfirmed_price_cannot_build_a_participant_bill_request() {
        val request = buildConfirmedParticipantBillRequest(
            isPriceQuoteConfirmed = false,
            ownerType = "TEAM",
            ownerId = "team-owner",
            confirmedEventAmountCents = 9_876,
            taxAmountCents = 0,
            allowSplit = true,
            label = "Registration",
        )

        assertNull(request)
    }

    @Test
    fun confirmed_server_total_is_the_exact_participant_bill_amount() {
        val sentinelServerTotalCents = 9_876

        val request = buildConfirmedParticipantBillRequest(
            isPriceQuoteConfirmed = true,
            ownerType = "TEAM",
            ownerId = "team-owner",
            confirmedEventAmountCents = sentinelServerTotalCents,
            taxAmountCents = 321,
            allowSplit = true,
            label = " Registration ",
        )

        assertEquals(sentinelServerTotalCents, request?.eventAmountCents)
        assertEquals(321, request?.taxAmountCents)
        assertEquals("Registration", request?.label)
    }
}
