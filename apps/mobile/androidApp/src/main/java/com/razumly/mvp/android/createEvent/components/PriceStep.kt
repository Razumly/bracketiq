package com.razumly.mvp.android.createEvent.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventCreate.presentation.CreateEventViewModel
import java.lang.reflect.Modifier

@Composable
fun PriceStep(viewModel: CreateEventViewModel) {
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
                        viewModel.updateTournamentPrice(amount)
                    } else {
                        showPriceError = true
                    }
                } ?: run {
                    showPriceError = true
                }
            },
            label = { Text("Entry Fee") },
            leadingIcon = { Text("$") },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Decimal,
                imeAction = ImeAction.Done
            ),
            isError = showPriceError,
            supportingText = if (showPriceError) {
                { Text("Please enter a valid price") }
            } else null,
        )

        Text(
            text = "Set to 0 for free entry",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
