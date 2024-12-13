package com.razumly.mvp.android.createEvent.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventCreate.presentation.CreateEventViewModel

@Composable
fun LocationStep(viewModel: CreateEventViewModel) {
    var location by remember { mutableStateOf("") }
    var latitude by remember { mutableStateOf("") }
    var longitude by remember { mutableStateOf("") }
    var showMap by remember { mutableStateOf(false) }

    Column(
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        OutlinedTextField(
            value = location,
            onValueChange = {
                location = it
                val lat = latitude.toDoubleOrNull() ?: 0.0
                val long = longitude.toDoubleOrNull() ?: 0.0
                viewModel.updateTournamentLocation(location, lat, long)
            },
            label = { Text("Location Name") },
            modifier = Modifier.fillMaxWidth()
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = latitude,
                onValueChange = {
                    latitude = it
                    val lat = it.toDoubleOrNull() ?: 0.0
                    val long = longitude.toDoubleOrNull() ?: 0.0
                    viewModel.updateTournamentLocation(location, lat, long)
                },
                label = { Text("Latitude") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f)
            )

            OutlinedTextField(
                value = longitude,
                onValueChange = {
                    longitude = it
                    val lat = latitude.toDoubleOrNull() ?: 0.0
                    val long = it.toDoubleOrNull() ?: 0.0
                    viewModel.updateTournamentLocation(location, lat, long)
                },
                label = { Text("Longitude") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f)
            )
        }

        OutlinedButton(
            onClick = { showMap = true },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Select on Map")
        }
    }

    if (showMap) {
        // Implement map selection dialog here
        // When location is selected, update the coordinates and location name
        MapSelectionDialog(
            viewModel = viewModel,
            onDismiss = { showMap = false },
            onLocationSelected = { name, lat, long ->
                location = name
                latitude = lat.toString()
                longitude = long.toString()
                viewModel.updateTournamentLocation(name, lat, long)
                showMap = false
            }
        )
    }
}