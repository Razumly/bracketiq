package com.razumly.mvp.core.presentation.composables

import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.stripe.android.paymentsheet.PaymentSheet

@Composable
actual fun PreparePaymentProcessor(paymentProcessor: IPaymentProcessor) {
    paymentProcessor as PaymentProcessor
    val paymentSheet =
        remember { PaymentSheet.Builder(paymentProcessor::onPaymentSheetResult) }.build()

    paymentProcessor.setPaymentSheet(paymentSheet)
    paymentProcessor.setContext(LocalContext.current)
}

@Composable
actual fun StripeButton(
    onClick: () -> Unit, paymentProcessor: IPaymentProcessor, text: String, colors: ButtonColors?
) {
    PreparePaymentProcessor(paymentProcessor)

    Button(
        onClick = onClick, colors = colors ?: ButtonDefaults.buttonColors()
    ) { Text(text) }
}
