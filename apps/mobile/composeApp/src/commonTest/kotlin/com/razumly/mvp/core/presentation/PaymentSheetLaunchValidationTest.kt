package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.repositories.PurchaseIntent
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PaymentSheetLaunchValidationTest {

    @Test
    fun missing_purchase_intent_returns_a_terminal_error() {
        assertEquals(
            "Payment details are unavailable. Please try again.",
            paymentSheetLaunchError(null),
        )
    }

    @Test
    fun missing_publishable_key_returns_a_terminal_error() {
        assertEquals(
            "Payment setup is unavailable. Please try again.",
            paymentSheetLaunchError(PurchaseIntent(paymentIntent = "pi_secret")),
        )
    }

    @Test
    fun missing_client_secret_returns_a_terminal_error() {
        assertEquals(
            "Payment details are incomplete. Please refresh and try again.",
            paymentSheetLaunchError(PurchaseIntent(publishableKey = "pk_test")),
        )
    }

    @Test
    fun complete_purchase_intent_can_launch_payment_sheet() {
        assertNull(
            paymentSheetLaunchError(
                PurchaseIntent(
                    publishableKey = "pk_test",
                    paymentIntent = "pi_secret",
                ),
            ),
        )
    }
}
