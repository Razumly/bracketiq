package com.razumly.mvp.eventCreate.steps

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
import com.razumly.mvp.eventCreate.CreateEventComponent
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.latitude
import mvp.composeapp.generated.resources.location_name
import mvp.composeapp.generated.resources.longitude
import mvp.composeapp.generated.resources.select_on_map
import org.jetbrains.compose.resources.stringResource

@Composable
fun LocationStep(component: CreateEventComponent) {
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
                component.updateTournamentLocation(location, lat, long)
            },
            label = { Text(stringResource(Res.string.location_name)) },
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
                    component.updateTournamentLocation(location, lat, long)
                },
                label = { Text(stringResource(Res.string.latitude)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f)
            )

            OutlinedTextField(
                value = longitude,
                onValueChange = {
                    longitude = it
                    val lat = latitude.toDoubleOrNull() ?: 0.0
                    val long = it.toDoubleOrNull() ?: 0.0
                    component.updateTournamentLocation(location, lat, long)
                },
                label = { Text(stringResource(Res.string.longitude)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f)
            )
        }

        OutlinedButton(
            onClick = { showMap = true },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(stringResource(Res.string.select_on_map))
        }
    }

//    if (showMap) {
//        MapSelectionDialog(
//            component = component,
//            onDismiss = { showMap = false },
//            onLocationSelected = { name, lat, long ->
//                location = name
//                latitude = lat.toString()
//                longitude = long.toString()
//                component.updateTournamentLocation(name, lat, long)
//                showMap = false
//            }
//        )
//    }
}
