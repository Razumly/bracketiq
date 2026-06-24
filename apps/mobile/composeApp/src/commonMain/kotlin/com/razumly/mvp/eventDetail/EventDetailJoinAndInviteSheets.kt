package com.razumly.mvp.eventDetail

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.composables.StripeButton
import com.razumly.mvp.core.util.emailAddressRegex
import com.razumly.mvp.eventDetail.composables.DropdownField

internal data class JoinOption(
    val label: String,
    val requiresPayment: Boolean,
    val onClick: () -> Unit
)

internal fun shouldRenderJoinOptionsActions(
    isWeeklyParentEvent: Boolean,
    selectedWeeklyOccurrenceLabel: String?,
    selectedWeeklyOccurrenceJoined: Boolean,
    selectedWeeklyOccurrenceStarted: Boolean,
): Boolean = !isWeeklyParentEvent || (
    !selectedWeeklyOccurrenceLabel.isNullOrBlank() &&
        !selectedWeeklyOccurrenceJoined &&
        !selectedWeeklyOccurrenceStarted
)

private enum class EventPlayerInviteMode(val label: String) {
    Search("Search"),
    Email("Email"),
}

@Composable
internal fun EventTeamInviteDialog(
    teams: List<Team>,
    isLoading: Boolean,
    selectedDivisionId: String?,
    divisionOptions: List<EventDetailDivisionOption>,
    onSearch: (String) -> Unit,
    onDivisionSelected: (String) -> Unit,
    onTeamSelected: (Team) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val resolvedDivisionId = divisionOptions.resolveSelectedEventDivisionId(selectedDivisionId)
    val selectedDivisionLabel = divisionOptions
        .firstOrNull { option -> option.id == resolvedDivisionId }
        ?.label
        .orEmpty()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Invite Team") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (divisionOptions.size > 1) {
                    DropdownField(
                        modifier = Modifier.fillMaxWidth(),
                        value = selectedDivisionLabel,
                        label = "Assign to division",
                    ) { dismiss ->
                        divisionOptions.sortedEventDivisionOptionsAlphabetically().forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option.label) },
                                onClick = {
                                    dismiss()
                                    onDivisionSelected(option.id)
                                },
                                leadingIcon = {
                                    if (option.id == resolvedDivisionId) {
                                        Icon(
                                            imageVector = Icons.Default.Check,
                                            contentDescription = null,
                                        )
                                    }
                                },
                            )
                        }
                    }
                }
                StandardTextField(
                    value = query,
                    onValueChange = { value ->
                        query = value
                        onSearch(value)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = "Search teams",
                )
                when {
                    isLoading -> Text(
                        text = "Loading teams...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    query.trim().length < 2 -> Text(
                        text = "Type at least 2 characters to search.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    teams.isEmpty() -> Text(
                        text = "No teams match your search.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    else -> LazyColumn(
                        modifier = Modifier.heightIn(max = 320.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(teams, key = { it.id }) { team ->
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onTeamSelected(team) },
                                shape = RoundedCornerShape(8.dp),
                                tonalElevation = 1.dp,
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(
                                        modifier = Modifier.weight(1f),
                                        verticalArrangement = Arrangement.spacedBy(4.dp),
                                    ) {
                                        Text(
                                            text = team.name.ifBlank { "Team" },
                                            style = MaterialTheme.typography.titleSmall,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        Text(
                                            text = team.inviteSubtitle(),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                    TextButton(onClick = { onTeamSelected(team) }) {
                                        Text("Invite")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EventPlayerInviteDialog(
    eventName: String,
    suggestions: List<UserData>,
    existingParticipantIds: Set<String>,
    onSearch: (String) -> Unit,
    onPlayerSelected: (UserData) -> Unit,
    onInviteByEmail: (firstName: String, lastName: String, email: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var mode by remember { mutableStateOf(EventPlayerInviteMode.Search) }
    var query by remember { mutableStateOf("") }
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    val filteredSuggestions = remember(suggestions, existingParticipantIds) {
        suggestions.filterNot { user -> existingParticipantIds.contains(user.id.trim()) }
    }
    val canSendEmail = firstName.trim().isNotBlank() &&
        lastName.trim().isNotBlank() &&
        email.trim().isValidInviteEmail()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Invite Player") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PrimaryTabRow(selectedTabIndex = mode.ordinal) {
                    EventPlayerInviteMode.values().forEach { tab ->
                        Tab(
                            selected = mode == tab,
                            onClick = {
                                mode = tab
                                query = ""
                                onSearch("")
                            },
                            text = { Text(tab.label) },
                        )
                    }
                }

                when (mode) {
                    EventPlayerInviteMode.Search -> {
                        StandardTextField(
                            value = query,
                            onValueChange = { value ->
                                query = value
                                onSearch(value)
                            },
                            modifier = Modifier.fillMaxWidth(),
                            label = "Search players",
                        )
                        when {
                            query.trim().length < 2 -> Text(
                                text = "Type at least 2 characters to search.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )

                            filteredSuggestions.isEmpty() -> Text(
                                text = "No players match your search.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )

                            else -> LazyColumn(
                                modifier = Modifier.heightIn(max = 320.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                items(filteredSuggestions, key = { it.id }) { user ->
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { onPlayerSelected(user) }
                                            .padding(vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        PlayerCard(
                                            player = user,
                                            modifier = Modifier.weight(1f),
                                            trailingContent = {
                                                TextButton(onClick = { onPlayerSelected(user) }) {
                                                    Text("Invite")
                                                }
                                            },
                                        )
                                    }
                                }
                            }
                        }
                    }

                    EventPlayerInviteMode.Email -> {
                        Text(
                            text = "Invite a player to $eventName by email.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            StandardTextField(
                                value = firstName,
                                onValueChange = { firstName = it },
                                modifier = Modifier.weight(1f),
                                label = "First name",
                            )
                            StandardTextField(
                                value = lastName,
                                onValueChange = { lastName = it },
                                modifier = Modifier.weight(1f),
                                label = "Last name",
                            )
                        }
                        StandardTextField(
                            value = email,
                            onValueChange = { email = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = "Email",
                            keyboardType = "email",
                            supportingText = if (email.isNotBlank() && !email.trim().isValidInviteEmail()) {
                                "Enter a valid email address."
                            } else {
                                ""
                            },
                        )
                    }
                }
            }
        },
        confirmButton = {
            if (mode == EventPlayerInviteMode.Email) {
                Button(
                    onClick = { onInviteByEmail(firstName, lastName, email) },
                    enabled = canSendEmail,
                ) {
                    Text("Send Invite")
                }
            } else {
                TextButton(onClick = onDismiss) {
                    Text("Close")
                }
            }
        },
        dismissButton = {
            if (mode == EventPlayerInviteMode.Email) {
                OutlinedButton(onClick = onDismiss) {
                    Text("Cancel")
                }
            }
        },
    )
}

private fun Team.inviteSubtitle(): String {
    val parts = listOf(
        sport?.trim()?.takeIf(String::isNotBlank),
        division.trim().takeIf(String::isNotBlank),
    ).filterNotNull()
    val rosterLabel = "${playerIds.distinct().size}/${teamSize} players"
    return (parts + rosterLabel).joinToString(" | ")
}

private fun String.isValidInviteEmail(): Boolean {
    val normalized = trim()
    return normalized.isNotBlank() && normalized.matches(emailAddressRegex)
}

@Composable
internal fun JoinOptionsSheet(
    state: EventDetailJoinSheetsState,
    actions: EventDetailJoinSheetsActions,
) {
    val options = state.options
    val paymentProcessor = state.paymentProcessor
    val registrationHoldExpiresAt = state.registrationHoldExpiresAt
    val isWeeklyParentEvent = state.isWeeklyParentEvent
    val weeklySessionOptions = state.weeklySessionOptions
    val weeklyOccurrenceSummaries = state.weeklyOccurrenceSummaries
    val selectedWeeklyOccurrenceLabel = state.selectedWeeklyOccurrenceLabel
    val selectedWeeklyOccurrenceSummary = state.selectedWeeklyOccurrenceSummary
    val selectedWeeklyOccurrenceJoined = state.selectedWeeklyOccurrenceJoined
    val selectedWeeklyOccurrenceStarted = state.selectedWeeklyOccurrenceStarted
    val selectedDivisionId = state.selectedDivisionId
    val divisionOptions = state.divisionOptions
    val onDivisionSelected = actions.onDivisionSelected
    val onDismiss = actions.onDismiss
    val onSelectOption = actions.onSelectOption
    val onSelectWeeklySession = actions.onSelectWeeklySession
    val onRegistrationHoldExpired = actions.onRegistrationHoldExpired
    var isDivisionMenuExpanded by remember { mutableStateOf(false) }
    var divisionMenuAnchorSize by remember { mutableStateOf(IntSize.Zero) }
    val density = LocalDensity.current
    val sheetScrollState = rememberScrollState()
    val hasRequiredDivisionSelection = remember(selectedDivisionId, divisionOptions) {
        selectedDivisionId?.let { selectedId ->
            divisionOptions.any { option -> option.id == selectedId }
        } == true
    }
    val shouldEnableJoinActions = divisionOptions.isEmpty() || hasRequiredDivisionSelection
    val selectedDivisionLabel = remember(selectedDivisionId, divisionOptions) {
        val selected = divisionOptions.firstOrNull { it.id == selectedDivisionId }
        selected?.label.orEmpty()
    }
    val showWeeklySelectionList = isWeeklyParentEvent

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxHeight(0.9f),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = maxHeight)
                .verticalScroll(sheetScrollState)
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Join options",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold
            )
            RegistrationHoldDialogTimer(
                expiresAt = registrationHoldExpiresAt,
                onExpired = onRegistrationHoldExpired,
            )
            if (showWeeklySelectionList) {
                Text(
                    text = "Select a weekly occurrence",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                if (weeklySessionOptions.isEmpty()) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                    ) {
                        Text(
                            text = "No upcoming weekly occurrences are available.",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        weeklySessionOptions.forEach { session ->
                            val summary = weeklyOccurrenceSummaryKey(
                                slotId = session.slotId,
                                occurrenceDate = session.occurrenceDate,
                            )?.let(weeklyOccurrenceSummaries::get)
                            Button(
                                onClick = { onSelectWeeklySession(session) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                    horizontalAlignment = Alignment.Start,
                                ) {
                                    Text(
                                        text = session.label,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        text = "Divisions: ${session.divisionLabel}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                    )
                                    Text(
                                        text = summary?.let(::formatWeeklyOccurrenceFullness) ?: "Tap to continue",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                    )
                                }
                            }
                        }
                    }
                }
            }
            if (isWeeklyParentEvent && !selectedWeeklyOccurrenceLabel.isNullOrBlank()) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = "Occurrence: $selectedWeeklyOccurrenceLabel",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (selectedWeeklyOccurrenceSummary != null) {
                        Text(
                            text = formatWeeklyOccurrenceFullness(selectedWeeklyOccurrenceSummary),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = if (selectedWeeklyOccurrenceSummary.isFull()) {
                                MaterialTheme.colorScheme.error
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }
            }
            if (isWeeklyParentEvent && selectedWeeklyOccurrenceStarted) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.45f),
                ) {
                    Text(
                        text = "This occurrence has already started.",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            } else if (isWeeklyParentEvent && selectedWeeklyOccurrenceJoined) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                ) {
                    Text(
                        text = "Already registered for this occurrence. Select another occurrence to continue.",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            val shouldRenderJoinOptions = shouldRenderJoinOptionsActions(
                isWeeklyParentEvent = isWeeklyParentEvent,
                selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrenceLabel,
                selectedWeeklyOccurrenceJoined = selectedWeeklyOccurrenceJoined,
                selectedWeeklyOccurrenceStarted = selectedWeeklyOccurrenceStarted,
            )
            if (shouldRenderJoinOptions) {
                if (divisionOptions.isNotEmpty()) {
                    Box(modifier = Modifier.fillMaxWidth()) {
                        Button(
                            onClick = { isDivisionMenuExpanded = true },
                            modifier = Modifier
                                .fillMaxWidth()
                                .onSizeChanged { size -> divisionMenuAnchorSize = size }
                        ) {
                            val label = if (selectedDivisionLabel.isNotBlank()) {
                                "Division: $selectedDivisionLabel"
                            } else {
                                "select a division"
                            }
                            Text(label)
                        }
                        DropdownMenu(
                            expanded = isDivisionMenuExpanded,
                            onDismissRequest = { isDivisionMenuExpanded = false },
                            modifier = if (divisionMenuAnchorSize.width > 0) {
                                Modifier.width(with(density) { divisionMenuAnchorSize.width.toDp() })
                            } else {
                                Modifier
                            }
                        ) {
                            divisionOptions.sortedAlphabetically().forEach { option ->
                                DropdownMenuItem(
                                    text = { Text(option.label) },
                                    onClick = {
                                        isDivisionMenuExpanded = false
                                        onDivisionSelected(option.id)
                                    },
                                    leadingIcon = {
                                        if (option.id == selectedDivisionId) {
                                            Icon(
                                                imageVector = Icons.Default.Check,
                                                contentDescription = null
                                            )
                                        }
                                    }
                                )
                            }
                        }
                    }
                }
                options.forEach { option ->
                    if (option.requiresPayment) {
                        if (shouldEnableJoinActions) {
                            StripeButton(
                                onClick = { onSelectOption(option) },
                                paymentProcessor = paymentProcessor,
                                text = option.label,
                                colors = ButtonDefaults.buttonColors(),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        } else {
                            Button(
                                onClick = {},
                                enabled = false,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(option.label)
                            }
                        }
                    } else {
                        Button(
                            onClick = { onSelectOption(option) },
                            enabled = shouldEnableJoinActions,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(option.label)
                        }
                    }
                }
            }
            TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.End)) {
                Text("Close")
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

@Composable
internal fun ChildJoinSelectionDialog(
    dialogState: ChildJoinSelectionDialogState,
    onDismiss: () -> Unit,
    onChildSelected: (String) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select Child") },
        text = {
            LazyColumn {
                items(dialogState.children, key = { it.userId }) { child ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onChildSelected(child.userId) }
                            .padding(vertical = 8.dp),
                    ) {
                        Text(text = child.fullName, style = MaterialTheme.typography.bodyLarge)
                        val subtitle = if (child.hasEmail) {
                            child.email ?: "Email available"
                        } else {
                            "Missing email. Registration can start, but child signature stays pending until email is added."
                        }
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (child.hasEmail) {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            } else {
                                MaterialTheme.colorScheme.error
                            },
                        )
                    }
                    HorizontalDivider()
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) {
                Text("Close")
            }
        },
    )
}

@Composable
private fun RegistrationHoldDialogTimer(
    expiresAt: String?,
    onExpired: () -> Unit,
) {
    val remainingLabel = rememberRegistrationHoldRemainingLabel(
        expiresAt = expiresAt,
        onExpired = onExpired,
    ) ?: return

    Surface(
        modifier = Modifier.widthIn(max = 360.dp),
        shape = RoundedCornerShape(12.dp),
        tonalElevation = 6.dp,
        shadowElevation = 6.dp,
        color = MaterialTheme.colorScheme.surface,
    ) {
        Text(
            text = "Your registration is held for $remainingLabel",
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
internal fun EventRegistrationQuestionsDialog(
    dialogState: EventRegistrationQuestionDialogState,
    onDismiss: () -> Unit,
    onSubmit: (Map<String, String>) -> Unit,
) {
    var answers by remember(dialogState.eventName, dialogState.questions, dialogState.answers) {
        mutableStateOf(
            dialogState.questions.associate { question ->
                question.id to dialogState.answers[question.id].orEmpty()
            },
        )
    }
    var validationMessage by remember(dialogState.eventName, dialogState.questions) {
        mutableStateOf<String?>(null)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Registration questions") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = dialogState.eventName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                validationMessage?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Text(
                    text = "${dialogState.questions.size} ${if (dialogState.questions.size == 1) "question" else "questions"}",
                    modifier = Modifier
                        .fillMaxWidth(),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 360.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(dialogState.questions, key = { question -> question.id }) { question ->
                        val answer = answers[question.id].orEmpty()
                        StandardTextField(
                            value = answer,
                            onValueChange = { value ->
                                answers = answers + (question.id to value)
                                validationMessage = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                            label = if (question.required) "${question.prompt} *" else question.prompt,
                            placeholder = "Answer",
                            supportingText = if (question.answerType.equals("LONG_TEXT", ignoreCase = true)) {
                                "A short paragraph is fine."
                            } else {
                                ""
                            },
                            height = if (question.answerType.equals("LONG_TEXT", ignoreCase = true)) 128.dp else null,
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val missingQuestion = dialogState.questions.firstOrNull { question ->
                        question.required && answers[question.id].orEmpty().trim().isBlank()
                    }
                    if (missingQuestion != null) {
                        validationMessage = "Answer \"${missingQuestion.prompt}\" before continuing."
                        return@Button
                    }
                    onSubmit(answers)
                },
            ) {
                Text("Continue")
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}

@Composable
internal fun TeamJoinQuestionsDialog(
    dialogState: TeamJoinQuestionDialogState,
    onDismiss: () -> Unit,
    onSubmit: (Map<String, String>) -> Unit,
) {
    var answers by remember(dialogState.teamId, dialogState.joinPolicy, dialogState.questions) {
        mutableStateOf(dialogState.questions.associate { question -> question.id to "" })
    }
    var validationMessage by remember(dialogState.teamId, dialogState.joinPolicy, dialogState.questions) {
        mutableStateOf<String?>(null)
    }
    val isRequestOnly = dialogState.joinPolicy.equals("REQUEST_TO_JOIN", ignoreCase = true)
    val submitLabel = if (isRequestOnly) "Send request" else "Join team"

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isRequestOnly) "Request to join" else "Join team") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = dialogState.teamName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                validationMessage?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Text(
                    text = "Registration questions",
                    modifier = Modifier
                        .fillMaxWidth(),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 360.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(dialogState.questions, key = { question -> question.id }) { question ->
                        val answer = answers[question.id].orEmpty()
                        StandardTextField(
                            value = answer,
                            onValueChange = { value ->
                                answers = answers + (question.id to value)
                                validationMessage = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                            label = if (question.required) "${question.prompt} *" else question.prompt,
                            placeholder = "Answer",
                            supportingText = if (question.answerType.equals("LONG_TEXT", ignoreCase = true)) {
                                "A short paragraph is fine."
                            } else {
                                ""
                            },
                            height = if (question.answerType.equals("LONG_TEXT", ignoreCase = true)) 128.dp else null,
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val missingQuestion = dialogState.questions.firstOrNull { question ->
                        question.required && answers[question.id].orEmpty().trim().isBlank()
                    }
                    if (missingQuestion != null) {
                        validationMessage = "Answer \"${missingQuestion.prompt}\" before continuing."
                        return@Button
                    }
                    onSubmit(answers)
                },
            ) {
                Text(submitLabel)
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}
