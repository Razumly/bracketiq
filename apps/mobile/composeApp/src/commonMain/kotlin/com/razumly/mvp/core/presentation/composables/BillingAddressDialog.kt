package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft

@Composable
fun BillingAddressDialog(
    initialAddress: BillingAddressDraft = BillingAddressDraft(),
    onConfirm: (BillingAddressDraft) -> Unit,
    onDismiss: () -> Unit,
) {
    var line1 by remember(initialAddress) { mutableStateOf(initialAddress.line1) }
    var line2 by remember(initialAddress) { mutableStateOf(initialAddress.line2.orEmpty()) }
    var city by remember(initialAddress) { mutableStateOf(initialAddress.city) }
    var state by remember(initialAddress) { mutableStateOf(initialAddress.state) }
    var postalCode by remember(initialAddress) { mutableStateOf(initialAddress.postalCode) }
    var attemptedSubmit by remember { mutableStateOf(false) }

    val draft = remember(line1, line2, city, state, postalCode) {
        BillingAddressDraft(
            line1 = line1,
            line2 = line2.ifBlank { null },
            city = city,
            state = state,
            postalCode = postalCode,
            countryCode = "US",
        ).normalized()
    }
    val showError = attemptedSubmit && !draft.isCompleteForUsTax()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Billing Address Required") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = "We need a US billing address before we can calculate tax and create the payment.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                StandardTextField(
                    value = line1,
                    onValueChange = { line1 = it },
                    label = "Address line 1",
                    isError = showError && draft.line1.isBlank(),
                )
                StandardTextField(
                    value = line2,
                    onValueChange = { line2 = it },
                    label = "Address line 2",
                    supportingText = "Optional",
                )
                StandardTextField(
                    value = city,
                    onValueChange = { city = it },
                    label = "City",
                    isError = showError && draft.city.isBlank(),
                )
                StandardTextField(
                    value = state,
                    onValueChange = { state = it.uppercase() },
                    label = "State",
                    isError = showError && draft.state.isBlank(),
                )
                StandardTextField(
                    value = postalCode,
                    onValueChange = { postalCode = it },
                    label = "ZIP code",
                    keyboardType = "number",
                    imeAction = ImeAction.Done,
                    isError = showError && draft.postalCode.isBlank(),
                )
                if (showError) {
                    Text(
                        text = "Enter address line 1, city, state, and ZIP code.",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                attemptedSubmit = true
                if (draft.isCompleteForUsTax()) {
                    onConfirm(draft)
                }
            }) {
                Text("Save")
            }
        },
        dismissButton = {
            Button(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}
