package com.razumly.mvp.core.presentation

import androidx.test.core.app.ApplicationProvider
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PaymentProcessorFailureTest {

    @Test
    fun missing_purchase_intent_publishes_failed_result() {
        val processor = PaymentProcessor()

        processor.presentPaymentSheet(email = "payer@example.test", name = "Payer", billingAddress = null)

        assertEquals(
            PaymentResult.Failed("Payment details are unavailable. Please try again."),
            processor.paymentResult.value,
        )
    }

    @Test
    fun missing_client_secret_publishes_failed_result() = runTest {
        val processor = PaymentProcessor()
        processor.setPaymentIntent(PurchaseIntent(publishableKey = "pk_test"))

        processor.presentPaymentSheet(email = "payer@example.test", name = "Payer", billingAddress = null)

        assertEquals(
            PaymentResult.Failed("Payment details are incomplete. Please refresh and try again."),
            processor.paymentResult.value,
        )
    }

    @Test
    fun missing_compose_context_publishes_failed_result() = runTest {
        val processor = PaymentProcessor()
        processor.setPaymentIntent(validPurchaseIntent())

        processor.presentPaymentSheet(email = "payer@example.test", name = "Payer", billingAddress = null)

        assertEquals(
            PaymentResult.Failed("Payment setup is unavailable. Please try again."),
            processor.paymentResult.value,
        )
    }

    @Test
    fun missing_payment_sheet_publishes_failed_result() = runTest {
        val processor = PaymentProcessor()
        processor.setContext(ApplicationProvider.getApplicationContext())
        processor.setPaymentIntent(validPurchaseIntent())

        processor.presentPaymentSheet(email = "payer@example.test", name = "Payer", billingAddress = null)

        assertEquals(
            PaymentResult.Failed("Payment setup is unavailable. Please try again."),
            processor.paymentResult.value,
        )
    }

    private fun validPurchaseIntent() = PurchaseIntent(
        publishableKey = "pk_test",
        paymentIntent = "pi_secret",
    )
}
