package com.razumly.mvp.android.createEvent.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventCreate.presentation.CreateEventViewModel


@Composable
fun BasicInfoStep(viewModel: CreateEventViewModel) {
    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("") }

    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        OutlinedTextField(
            value = name,
            onValueChange = {
                name = it
                viewModel.updateTournamentTextFields(name, description, type)
            },
            label = { Text("Tournament Name") },
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = description,
            onValueChange = {
                description = it
                viewModel.updateTournamentTextFields(name, description, type)
            },
            label = { Text("Description") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3
        )

        OutlinedTextField(
            value = type,
            onValueChange = {
                type = it
                viewModel.updateTournamentTextFields(name, description, type)
            },
            label = { Text("Tournament Type") },
            modifier = Modifier.fillMaxWidth()
        )
    }
}