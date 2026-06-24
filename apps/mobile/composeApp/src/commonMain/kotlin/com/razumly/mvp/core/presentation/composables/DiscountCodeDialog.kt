package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp

@Composable
fun DiscountCodeDialog(
    title: String = "Discount code",
    description: String = "Enter a discount code for this checkout, or continue without one.",
    initialCode: String = "",
    onContinue: (String?) -> Unit,
    onDismiss: () -> Unit,
) {
    var code by remember(initialCode) { mutableStateOf(initialCode) }

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
                    onValueChange = { code = it },
                    label = "Discount code",
                    imeAction = ImeAction.Done,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onContinue(code.trim().takeIf(String::isNotBlank))
                },
            ) {
                Text("Continue")
            }
        },
        dismissButton = {
            OutlinedButton(
                onClick = {
                    onContinue(null)
                },
            ) {
                Text("Skip")
            }
        },
    )
}
