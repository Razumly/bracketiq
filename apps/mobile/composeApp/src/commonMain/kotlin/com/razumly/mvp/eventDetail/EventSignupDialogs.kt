package com.razumly.mvp.eventDetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.network.dto.TeamMemberInviteRequestDto
import com.razumly.mvp.teamManagement.CreateTeamBuilderScreen
import kotlinx.coroutines.launch

@Composable
internal fun EventSignupDialogs(
    component: EventDetailComponent,
    event: Event,
    currentUser: UserData,
    sports: List<Sport>,
    form: TeamWithPlayers?,
    formStep: String,
    review: TeamWithPlayers?,
    onFormChange: (TeamWithPlayers?, String) -> Unit,
    onReviewChange: (TeamWithPlayers?) -> Unit,
    onChangeTeam: () -> Unit,
) {
    DisposableEffect(form?.team?.id, formStep) {
        onDispose { component.searchRegistrationPlayers("") }
    }
    val scope = rememberCoroutineScope()
    val busy by component.registrationSignupBusy.collectAsState()
    val suggestions by component.registrationPlayerSuggestions.collectAsState()
    val teams by component.registrationTeams.collectAsState()
    var error by remember(form?.team?.id) { mutableStateOf<String?>(null) }
    val currentForm = teams.firstOrNull { it.team.id == form?.team?.id } ?: form
    if (currentForm != null) {
        Dialog(onDismissRequest = { if (!busy) onFormChange(null, formStep) }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(Modifier.fillMaxSize()) {
                CreateTeamBuilderScreen(
                    draft = currentForm, sports = sports, freeAgents = emptyList(), suggestions = suggestions,
                    currentUser = currentUser, selectedEvent = event, eventSignupStep = formStep,
                    isSaving = busy, saveError = error,
                    onSearch = component::searchRegistrationPlayers,
                    onDismiss = { if (!busy) onFormChange(null, formStep) },
                    onSavePerson = { person ->
                        component.addRegistrationPlayer(currentForm.team.id, TeamMemberInviteRequestDto(
                            firstName = person.firstName, lastName = person.lastName,
                            email = person.email.takeIf(String::isNotBlank), phone = person.phone.takeIf(String::isNotBlank),
                            shareOnly = person.email.isBlank(), isMinor = person.isMinor,
                            dateOfBirth = person.dateOfBirth.takeIf(String::isNotBlank), guardianEmail = person.guardianEmail.takeIf(String::isNotBlank),
                            idempotencyKey = person.id,
                        ))
                    },
                    onSaveAccount = { player ->
                        component.addRegistrationPlayer(currentForm.team.id, TeamMemberInviteRequestDto(userId = player.id))
                    },
                    onFinish = { team, _, _ ->
                        if (formStep == "players") {
                            component.continueRegistrationReview {
                                onFormChange(null, "players")
                                onReviewChange(currentForm)
                            }
                        } else scope.launch {
                            component.saveRegistrationTeam(team).onSuccess { saved ->
                                val roster = component.registrationTeams.value.firstOrNull { it.team.id == saved.id }
                                    ?: TeamWithPlayers(saved, currentUser.takeIf { saved.captainId == it.id },
                                        listOf(currentUser).filter { it.id in saved.playerIds }, emptyList())
                                onFormChange(roster, "players")
                                error = null
                            }.onFailure { error = it.message ?: "Could not save the Team." }
                        }
                    },
                )
            }
        }
    }
    if (review != null) {
        val currentReview = teams.firstOrNull { it.team.id == review.team.id } ?: review
        AlertDialog(
            onDismissRequest = { onReviewChange(null) },
            title = { Text("Review Event registration") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(event.name)
                    Text(currentReview.team.name)
                    Row {
                        TextButton(onClick = { onReviewChange(null); onChangeTeam() }) { Text("Change team") }
                        TextButton(onClick = {
                            component.setRegistrationPlayersStep {
                                onReviewChange(null)
                                onFormChange(currentReview, "players")
                            }
                        }, enabled = !busy) { Text("Add players") }
                    }
                    Text("Confirm to continue with the Event requirements and payment options.")
                }
            },
            confirmButton = {
                Button(onClick = { onReviewChange(null); component.joinEventAsTeam(currentReview) }, enabled = !busy) {
                    Text("Confirm registration")
                }
            },
            dismissButton = { TextButton(onClick = { onReviewChange(null) }) { Text("Back") } },
        )
    }
}
