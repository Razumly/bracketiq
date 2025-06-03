package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import com.razumly.mvp.core.presentation.composables.CardSection
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.eventDetail.composables.DropdownField
import com.razumly.mvp.eventDetail.composables.MultiSelectDropdownField
import com.razumly.mvp.eventDetail.composables.NumberInputField
import com.razumly.mvp.eventDetail.composables.PointsTextField
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.materials.CupertinoMaterials
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.free_entry_hint
import mvp.composeapp.generated.resources.invalid_price
import mvp.composeapp.generated.resources.max_players
import mvp.composeapp.generated.resources.max_teams
import mvp.composeapp.generated.resources.team_size_error
import mvp.composeapp.generated.resources.team_size_limit
import mvp.composeapp.generated.resources.value_too_low
import org.jetbrains.compose.resources.stringResource

@Composable
fun EditDetails(
    host: UserData,
    event: EventAbs,
    hazeState: HazeState,
    onEditEvent: (EventImp.() -> EventImp) -> Unit,
    onEditTournament: (Tournament.() -> Tournament) -> Unit,
    onIsValid: (Boolean) -> Unit,
    onShowStartPicker: () -> Unit,
    onShowEndPicker: () -> Unit,
    onSelectFieldCount: (Int) -> Unit,
    isNewEvent: Boolean,
    onEventTypeSelected: (EventType) -> Unit,
    onAddCurrentUser: (Boolean) -> Unit
) {
    var isPriceValid by remember { mutableStateOf(event.price >= 0) }
    var isMaxParticipantsValid by remember { mutableStateOf(event.maxParticipants > 2) }
    var isTeamSizeValid by remember { mutableStateOf(event.teamSizeLimit >= 2) }
    var isWinnerSetCountValid by remember { mutableStateOf(true) }
    var isLoserSetCountValid by remember { mutableStateOf(true) }
    var isWinnerPointsValid by remember { mutableStateOf(true) }
    var isLoserPointsValid by remember { mutableStateOf(true) }
    var isLocationValid by remember { mutableStateOf(event.location.isNotBlank() && event.lat != 0.0 && event.long != 0.0) }
    var selectedDivisions by remember { mutableStateOf(emptyList<Division>()) }
    var isFieldCountValid by remember { mutableStateOf(true) }
    var fieldCount by remember { mutableStateOf(0) }

    LaunchedEffect(event) {
        isPriceValid = event.price >= 0
        isMaxParticipantsValid = event.maxParticipants > 2
        isTeamSizeValid = event.teamSizeLimit >= 2
        isLocationValid = event.location.isNotBlank() && event.lat != 0.0 && event.long != 0.0
        if (event is Tournament) {
            isWinnerSetCountValid = event.winnerSetCount > 0
            isWinnerPointsValid = event.winnerBracketPointsToVictory.all { it > 0 }
            isFieldCountValid = fieldCount > 0
            if (event.doubleElimination) {
                isLoserSetCountValid = event.loserSetCount > 0
                isLoserPointsValid = event.loserBracketPointsToVictory.all { it > 0 }
            } else {
                isLoserSetCountValid = true
                isLoserPointsValid = true
            }
        } else {
            isWinnerSetCountValid = true
            isWinnerPointsValid = true
            isLoserSetCountValid = true
            isLoserPointsValid = true
        }
        onIsValid(
            isPriceValid &&
                    isMaxParticipantsValid &&
                    isTeamSizeValid &&
                    isWinnerSetCountValid &&
                    isWinnerPointsValid &&
                    isLoserSetCountValid &&
                    isLoserPointsValid
        )
    }

    CardSection(
        "Hosted by ${host.firstName.toTitleCase()} ${host.lastName.toTitleCase()}",
        event.description,
        hazeState
    )

    EditCardSection(hazeState) {
        Row(
            modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            DropdownField(
                modifier = Modifier.weight(1.2f), value = event.eventType.name, label = "Event Type"
            ) { dismiss ->
                EventType.entries.forEach { eventType ->
                    DropdownMenuItem(onClick = {
                        dismiss()
                        onEventTypeSelected(eventType)
                    }, text = { Text(text = eventType.name) })
                }
            }
            DropdownField(
                modifier = Modifier.weight(1f),
                value = event.fieldType.name,
                label = "Field Type",
            ) { dismiss ->
                FieldType.entries.forEach { fieldType ->
                    DropdownMenuItem(onClick = {
                        dismiss()
                        onEditEvent { copy(fieldType = fieldType) }
                    }, text = { Text(text = fieldType.name) })
                }
            }
        }
    }

    EditCardSection(hazeState) {
        NumberInputField(
            value = (event.price * 100).toInt().toString(),
            label = "",
            onValueChange = { newText ->
                if (newText.isBlank()) {
                    onEditEvent { copy(price = 0.0) }
                    return@NumberInputField
                }
                val newCleaned = newText.filter { it.isDigit() }
                onEditEvent { copy(price = newCleaned.toDouble() / 100) }
            },
            isError = !isPriceValid,
            isMoney = true,
            errorMessage = stringResource(Res.string.invalid_price),
            supportingText = stringResource(Res.string.free_entry_hint),
        )
    }
    EditCardSection(hazeState) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = event.start.toLocalDateTime(TimeZone.currentSystemDefault())
                .format(
                    dateTimeFormat
                ),
                onValueChange = {},
                label = { Text("Start Date & Time") },
                modifier = Modifier.weight(1f),
                readOnly = true,
                interactionSource = remember { MutableInteractionSource() }.also { interactionSource ->
                    LaunchedEffect(interactionSource) {
                        interactionSource.interactions.collect {
                            if (it is PressInteraction.Release) {
                                onShowStartPicker()
                            }
                        }
                    }
                },
                singleLine = true
            )

            OutlinedTextField(value = event.end.toLocalDateTime(TimeZone.currentSystemDefault())
                .format(
                    dateTimeFormat
                ),
                onValueChange = { },
                label = { Text("End Date & Time") },
                readOnly = true,
                modifier = Modifier.weight(1f),
                interactionSource = remember { MutableInteractionSource() }.also { interactionSource ->
                    LaunchedEffect(interactionSource) {
                        interactionSource.interactions.collect {
                            if (it is PressInteraction.Release) {
                                onShowEndPicker()
                            }
                        }
                    }
                },
                singleLine = true
            )
        }
    }

    EditCardSection(hazeState) {
        MultiSelectDropdownField(
            selectedItems = selectedDivisions,
            label = "Skill levels",
        ) { newSelection ->
            selectedDivisions = newSelection
            onEditEvent { copy(divisions = selectedDivisions) }
        }
    }

    EditCardSection(hazeState) {
        Text("Specifics", style = MaterialTheme.typography.titleMedium)
        NumberInputField(
            value = event.maxParticipants.toString(),
            label = if (!event.teamSignup) stringResource(Res.string.max_players) else stringResource(
                Res.string.max_teams
            ),
            onValueChange = { newValue ->
                if (newValue.all { it.isDigit() }) {
                    if (newValue.isBlank()) {
                        onEditEvent { copy(maxParticipants = 0) }
                    } else {
                        onEditEvent { copy(maxParticipants = newValue.toInt()) }
                    }
                }
            },
            isError = !isMaxParticipantsValid,
            errorMessage = stringResource(Res.string.value_too_low),
            isMoney = false,
        )
        NumberInputField(
            value = event.teamSizeLimit.toString(),
            label = stringResource(Res.string.team_size_limit),
            onValueChange = { newValue ->
                if (newValue.all { it.isDigit() }) {
                    if (newValue.isBlank()) {
                        onEditEvent { copy(teamSizeLimit = 0) }
                    } else {
                        onEditEvent { copy(teamSizeLimit = newValue.toInt()) }
                    }
                }
            },
            isError = !isTeamSizeValid,
            errorMessage = stringResource(Res.string.team_size_error),
            isMoney = false,
            placeholder = "2-6"
        )


        Row(
            verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)
        ) {
            Checkbox(checked = !event.singleDivision, onCheckedChange = {
                onEditEvent { copy(singleDivision = !it) }
            })
            Text(text = "Split Signup Into Divisions")
        }
        Row(
            verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)
        ) {
            Checkbox(checked = event.teamSignup, onCheckedChange = {
                onEditEvent { copy(teamSignup = it) }
            })
            Text(text = "Team Event")
        }
        if (isNewEvent) {
            var addSelfToEvent by remember { mutableStateOf(false) }
            AnimatedVisibility(!event.teamSignup) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = 8.dp)
                ) {
                    Checkbox(checked = addSelfToEvent, onCheckedChange = {
                        addSelfToEvent = it
                        onAddCurrentUser(it)
                    })
                    Text(text = "Join as participant")
                }
            }
        }
        if (event is Tournament) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Checkbox(checked = event.doubleElimination, onCheckedChange = { checked ->
                    onEditTournament { copy(doubleElimination = checked) }
                })
                Text("Double Elimination")
            }
            NumberInputField(
                value = fieldCount.toString(),
                onValueChange = { newValue ->
                    if (newValue.all { it.isDigit() }) {
                        if (newValue.isBlank()) {
                            fieldCount = 0
                            onSelectFieldCount(0)
                        } else {
                            fieldCount = newValue.toInt()
                            onSelectFieldCount(newValue.toInt())
                        }
                    }
                },
                label = "Field Count",
                isError = !isFieldCountValid,
                isMoney = false,
                errorMessage = stringResource(Res.string.value_too_low),
            )
            NumberInputField(
                value = event.winnerSetCount.toString(),
                onValueChange = { newValue ->
                    if (newValue.all { it.isDigit() }) {
                        if (newValue.isBlank()) {
                            onEditTournament { copy(winnerSetCount = 0) }
                        } else {
                            onEditTournament {
                                copy(
                                    winnerSetCount = newValue.toInt(),
                                    winnerBracketPointsToVictory = List(newValue.toInt()) { 0 })
                            }
                        }
                    }
                },
                label = "Winner Set Count",
                isError = !isWinnerSetCountValid,
                isMoney = false,
                errorMessage = stringResource(Res.string.value_too_low),
            )
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                val focusRequesters = remember { List(4) { FocusRequester() } }
                repeat(event.winnerSetCount) { index ->
                    PointsTextField(value = event.winnerBracketPointsToVictory.getOrNull(index)
                        ?.toString() ?: "",
                        label = "Set ${index + 1} Points to Win",
                        onValueChange = { newValue ->
                            if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                                val winnerPoints = if (newValue.isBlank()) {
                                    0
                                } else {
                                    newValue.toInt()
                                }
                                onEditTournament {
                                    copy(
                                        winnerBracketPointsToVictory = event.winnerBracketPointsToVictory.toMutableList()
                                            .apply { set(index, winnerPoints) })
                                }
                            }
                        },
                        focusRequester = focusRequesters[index],
                        nextFocus = { if (index < event.winnerSetCount - 1) focusRequesters[index + 1].requestFocus() })
                }
            }
            if (event.doubleElimination) {
                NumberInputField(
                    value = event.loserSetCount.toString(),
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            if (newValue.isBlank()) {
                                onEditTournament { copy(loserSetCount = 0) }
                            } else {
                                onEditTournament { copy(loserSetCount = newValue.toInt()) }
                            }
                        }
                    },
                    label = "Loser Set Count",
                    isError = !isLoserSetCountValid,
                    isMoney = false,
                    errorMessage = stringResource(Res.string.value_too_low),
                )
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    val loserPoints by remember { mutableStateOf(event.loserBracketPointsToVictory.toMutableList()) }
                    val focusRequesters = remember { List(4) { FocusRequester() } }
                    repeat(event.loserSetCount) { index ->
                        PointsTextField(value = event.loserBracketPointsToVictory.getOrNull(index)
                            ?.toString() ?: "",
                            label = "Set ${index + 1} Points to Win",
                            onValueChange = { newValue ->
                                if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                                    if (newValue.isBlank()) {
                                        loserPoints[index] = 0
                                    } else {
                                        loserPoints[index] = newValue.toInt()
                                    }
                                    onEditTournament { copy(loserBracketPointsToVictory = loserPoints) }
                                }
                            },
                            focusRequester = focusRequesters[index],
                            nextFocus = { if (index < event.loserSetCount - 1) focusRequesters[index + 1].requestFocus() })
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun EditCardSection(hazeState: HazeState, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        color = Color.Transparent,
        shape = RoundedCornerShape(16.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().hazeEffect(hazeState, CupertinoMaterials.thin())
                .padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally
        ) {
            content()
        }
    }
}