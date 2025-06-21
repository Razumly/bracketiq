package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.repositories.PurchaseIntent

actual open class PaymentProcessor: IPaymentProcessor {
    actual override fun presentPaymentSheet() {
    }

    actual override suspend fun setPaymentIntent(intent: PurchaseIntent) {
    }

}