package com.razumly.mvp.eventCreate.presentation.steps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventCreate.presentation.CreateEventComponent
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.entry_fee
import mvp.composeapp.generated.resources.free_entry_hint
import mvp.composeapp.generated.resources.invalid_price
import org.jetbrains.compose.resources.stringResource

@Composable
fun PriceStep(component: CreateEventComponent) {
    var price by remember { mutableStateOf("") }
    var showPriceError by remember { mutableStateOf(false) }

    Column(
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        OutlinedTextField(
            value = price,
            onValueChange = {
                price = it
                showPriceError = false
                it.toDoubleOrNull()?.let { amount ->
                    if (amount >= 0) {
                        component.updateTournamentPrice(amount)
                    } else {
                        showPriceError = true
                    }
                } ?: run {
                    showPriceError = true
                }
            },
            label = { Text(stringResource(Res.string.entry_fee)) },
            leadingIcon = { Text("$") },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Decimal,
                imeAction = ImeAction.Done
            ),
            isError = showPriceError,
            modifier = Modifier.fillMaxWidth(),
        )

        if (showPriceError) {
            Text(
                text = stringResource(Res.string.invalid_price),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(start = 16.dp, top = 4.dp)
            )
        }

        Text(
            text = stringResource(Res.string.free_entry_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
