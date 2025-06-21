package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import com.razumly.mvp.core.presentation.IPaymentProcessor

@Composable
actual fun MakePurchaseButton(
    onClick: () -> Unit,
    paymentProcessor: IPaymentProcessor,
    text: String
) {
}