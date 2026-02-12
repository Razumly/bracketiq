package com.razumly.mvp.core.presentation.composables

import androidx.compose.material3.ButtonColors
import androidx.compose.runtime.Composable
import com.razumly.mvp.core.presentation.IPaymentProcessor

@Composable
expect fun PreparePaymentProcessor(paymentProcessor: IPaymentProcessor)

@Composable
expect fun StripeButton(
    onClick: () -> Unit,
    paymentProcessor: IPaymentProcessor,
    text: String,
    colors: ButtonColors? = null,
)
