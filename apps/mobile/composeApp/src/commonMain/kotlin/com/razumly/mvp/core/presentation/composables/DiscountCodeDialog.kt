package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.repositories.DiscountPreview
import com.razumly.mvp.core.presentation.util.MoneyInputUtils

@Composable
fun DiscountCodeDialog(
    title: String = "Price preview",
    description: String = "Review the registration price before checkout. Add a discount code here if you have one.",
    initialCode: String = "",
    originalAmountCents: Int? = null,
    preview: DiscountPreview? = null,
    error: String? = null,
    loading: Boolean = false,
    onApply: (String) -> Unit = {},
    onContinue: (String?) -> Unit,
    onDismiss: () -> Unit,
) {
    var code by remember(initialCode) { mutableStateOf(initialCode) }
    var localError by remember { mutableStateOf<String?>(null) }
    val normalizedCode = code.trim()
    val appliedCode = preview?.code?.trim().orEmpty()
    val codeIsApplied = normalizedCode.isNotBlank() && appliedCode.equals(normalizedCode, ignoreCase = true)
    val canContinue = !loading && (normalizedCode.isBlank() || codeIsApplied)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodyMedium,
                )
                StandardTextField(
                    value = code,
                    onValueChange = {
                        code = it
                        localError = null
                    },
                    label = "Discount code",
                    imeAction = ImeAction.Done,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(
                        enabled = normalizedCode.isNotBlank() && !loading,
                        onClick = {
                            localError = null
                            onApply(normalizedCode)
                        },
                    ) {
                        Text("Apply")
                    }
                }
                if (loading) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CircularProgressIndicator()
                        Text("Applying discount...")
                    }
                }
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.surfaceVariant,
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        val displayedOriginalAmount = preview?.originalAmountCents ?: originalAmountCents
                        val displayedNewAmount = preview?.discountedAmountCents ?: originalAmountCents
                        displayedOriginalAmount?.let { amount ->
                            DiscountPreviewRow("Original price", amount)
                        }
                        preview?.let { appliedPreview ->
                            DiscountPreviewRow("Discount", -appliedPreview.discountAmountCents)
                        }
                        displayedNewAmount?.let { amount ->
                            DiscountPreviewRow("New price", amount)
                        }
                    }
                }
                listOfNotNull(localError, error).firstOrNull()?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (normalizedCode.isNotBlank() && !codeIsApplied) {
                        localError = "Apply the discount code before continuing."
                        return@Button
                    }
                    onContinue(normalizedCode.takeIf(String::isNotBlank))
                },
                enabled = canContinue,
            ) {
                Text("Checkout")
            }
        },
    )
}

@Composable
private fun DiscountPreviewRow(label: String, amountCents: Int) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall)
        Text(formatDiscountCurrency(amountCents), style = MaterialTheme.typography.bodySmall)
    }
}

private fun formatDiscountCurrency(amountCents: Int): String {
    val sign = if (amountCents < 0) "-" else ""
    val absoluteCents = if (amountCents < 0) -amountCents else amountCents
    return "${sign}$${MoneyInputUtils.centsToDisplayValue(absoluteCents)}"
}
