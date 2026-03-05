package com.razumly.mvp.core.presentation.composables

import androidx.compose.material3.ButtonColors
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.presentation.IPaymentProcessor

@Composable
expect fun PreparePaymentProcessor(paymentProcessor: IPaymentProcessor)

/**
 * Renders a payment CTA only.
 * Call [PreparePaymentProcessor] once at the screen root to keep launcher registration stable.
 */
@Composable
expect fun StripeButton(
    onClick: () -> Unit,
    paymentProcessor: IPaymentProcessor,
    text: String,
    colors: ButtonColors? = null,
    modifier: Modifier = Modifier,
)
