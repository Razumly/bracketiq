package com.razumly.mvp.eventCreate.steps

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
import com.razumly.mvp.eventCreate.CreateEventComponent
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.tournament_description
import mvp.composeapp.generated.resources.tournament_name
import mvp.composeapp.generated.resources.tournament_type
import org.jetbrains.compose.resources.stringResource


@Composable
fun BasicInfoStep(component: CreateEventComponent) {
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
                component.updateTournamentTextFields(name, description, type)
            },
            label = { Text(stringResource(Res.string.tournament_name)) },
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = description,
            onValueChange = {
                description = it
                component.updateTournamentTextFields(name, description, type)
            },
            label = { Text(stringResource(Res.string.tournament_description)) },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3
        )

        OutlinedTextField(
            value = type,
            onValueChange = {
                type = it
                component.updateTournamentTextFields(name, description, type)
            },
            label = { Text(stringResource(Res.string.tournament_type)) },
            modifier = Modifier.fillMaxWidth()
        )
    }
}
