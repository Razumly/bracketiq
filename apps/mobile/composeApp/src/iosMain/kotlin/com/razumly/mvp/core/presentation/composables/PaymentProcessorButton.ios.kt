package com.razumly.mvp.core.presentation.composables

import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.LocalNativeViewFactory
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor

@Composable
actual fun PreparePaymentProcessor(paymentProcessor: IPaymentProcessor) {
    val factory = LocalNativeViewFactory.current
    paymentProcessor as PaymentProcessor
    paymentProcessor.setNativeViewFactory(factory)
}

@Composable
actual fun StripeButton(
    onClick: () -> Unit,
    paymentProcessor: IPaymentProcessor,
    text: String,
    colors: ButtonColors?,
    modifier: Modifier,
) {
    PreparePaymentProcessor(paymentProcessor)

    Button(
        onClick = onClick,
        colors = colors ?: ButtonDefaults.buttonColors(),
        modifier = modifier,
    ) {
        Text(text)
    }
}
