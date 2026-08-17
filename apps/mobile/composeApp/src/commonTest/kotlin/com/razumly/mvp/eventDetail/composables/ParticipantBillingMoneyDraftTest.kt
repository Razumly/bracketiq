package com.razumly.mvp.eventDetail.composables

import kotlin.test.Test
import kotlin.test.assertEquals

class ParticipantBillingMoneyDraftTest {
    @Test
    fun givenDollarAmounts_whenRoundTrippingParticipantBillingDrafts_thenCentsArePreserved() {
        val cases = listOf(
            "\$0.10" to 10,
            "\$10.00" to 1_000,
            "\$1,234.56" to 123_456,
        )

        cases.forEach { (displayValue, expectedCents) ->
            val draft = participantBillingMoneyDraftFromCents(expectedCents)

            assertEquals(displayValue.removePrefix("\$").replace(",", ""), draft)
            assertEquals(expectedCents, participantBillingMoneyDraftToCents(draft))
            assertEquals(expectedCents, participantBillingMoneyDraftToCents(displayValue))
        }
    }
}
