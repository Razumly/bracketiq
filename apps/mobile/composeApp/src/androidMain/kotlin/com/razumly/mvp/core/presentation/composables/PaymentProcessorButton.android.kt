package com.razumly.mvp.core.presentation.composables

import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.stripe.android.paymentsheet.PaymentSheet

@Composable
actual fun PaymentProcessorButton(
    onClick: () -> Unit,
    paymentProcessor: IPaymentProcessor,
    text: String
) {
    paymentProcessor as PaymentProcessor
    val paymentSheet = remember { PaymentSheet.Builder(paymentProcessor::onPaymentSheetResult) }.build()
    paymentProcessor.setPaymentSheet(paymentSheet)
    paymentProcessor.setContext(LocalContext.current)

    Button(
        onClick = onClick,
        content = { Text(text) }
    )
}