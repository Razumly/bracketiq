package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import com.razumly.mvp.core.data.repositories.FeeBreakdown
import com.razumly.mvp.core.presentation.composables.PaymentProcessorButton
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.util.buttonTransitionSpec
import com.razumly.mvp.core.util.LocalErrorHandler
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.eventDetail.composables.CollapsableHeader
import com.razumly.mvp.eventDetail.composables.MatchEditControls
import com.razumly.mvp.eventDetail.composables.MatchEditDialog
import com.razumly.mvp.eventDetail.composables.ParticipantsView
import com.razumly.mvp.eventDetail.composables.TeamSelectionDialog
import com.razumly.mvp.eventDetail.composables.TournamentBracketView
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.home.LocalNavBarPadding
import kotlin.math.round
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.ExperimentalTime

val LocalTournamentComponent =
    compositionLocalOf<EventDetailComponent> { error("No tournament provided") }

@Composable
@OptIn(ExperimentalTime::class)
fun EventDetailScreen(
    component: EventDetailComponent, mapComponent: MapComponent
) {
    val errorHandler = LocalErrorHandler.current
    val loadingHandler = LocalLoadingHandler.current
    val selectedEvent by component.selectedEvent.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    var showTeamSelectionDialog by remember { mutableStateOf(false) }
    val validTeams by component.validTeams.collectAsState()
    val showDetails by component.showDetails.collectAsState()
    val editedEvent by component.editedEvent.collectAsState()
    var showFab by remember { mutableStateOf(false) }
    var showOptionsDropdown by remember { mutableStateOf(false) }
    var showDeleteConfirmation by remember { mutableStateOf(false) }
    val showMap by mapComponent.showMap.collectAsState()
    var showRefundReasonDialog by remember { mutableStateOf(false) }
    var refundReason by remember { mutableStateOf("") }
    val showFeeBreakdown by component.showFeeBreakdown.collectAsState()
    val currentFeeBreakdown by component.currentFeeBreakdown.collectAsState()
    val editableMatches by component.editableMatches.collectAsState()
    val showTeamDialog by component.showTeamSelectionDialog.collectAsState()
    val showMatchEditDialog by component.showMatchEditDialog.collectAsState()

    val isBracketView by component.isBracketView.collectAsState()
    var isRefundAutomatic by remember { mutableStateOf(false) }
    val isHost by component.isHost.collectAsState()
    val isEditing by component.isEditing.collectAsState()
    val isEventFull by component.isEventFull.collectAsState()
    val isUserInEvent by component.isUserInEvent.collectAsState()
    val isFreeAgent by component.isUserFreeAgent.collectAsState()
    val isWaitListed by component.isUserInWaitlist.collectAsState()
    val isCaptain by component.isUserCaptain.collectAsState()
    val isDark = isSystemInDarkTheme()
    val isEditingMatches by component.isEditingMatches.collectAsState()

    var imageScheme by remember {
        mutableStateOf(
            DynamicScheme(
                seedColor = Color(selectedEvent.event.seedColor),
                isDark = isDark,
                specVersion = ColorSpec.SpecVersion.SPEC_2025,
                style = PaletteStyle.Neutral,
            )
        )
    }

    LaunchedEffect(isEditing, selectedEvent, editedEvent) {
        imageScheme = DynamicScheme(
            seedColor = if (isEditing) Color(editedEvent.seedColor) else Color(selectedEvent.event.seedColor),
            isDark = isDark,
            specVersion = ColorSpec.SpecVersion.SPEC_2025,
            style = PaletteStyle.Neutral,
        )
    }

    val cutoffHours = when (selectedEvent.event.cancellationRefundHours) {
        0 -> 0
        1 -> 24
        2 -> 48
        else -> null
    }
    val timeDiff = selectedEvent.event.start.minus(Clock.System.now())
    isRefundAutomatic = (cutoffHours != null && timeDiff <= cutoffHours.hours)
    val teamSignup = selectedEvent.event.teamSignup

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                errorHandler.showError(error.message)
            }
        }
    }

    CompositionLocalProvider(LocalTournamentComponent provides component) {
        Scaffold(Modifier.fillMaxSize()) { innerPadding ->
            Column(
                Modifier.background(MaterialTheme.colorScheme.background).fillMaxSize()
            ) {
                AnimatedVisibility(
                    !showDetails, enter = expandVertically(), exit = shrinkVertically()
                ) {
                    Box {
                        EventDetails(
                            paymentProcessor = component,
                            mapComponent = mapComponent,
                            hostHasAccount = currentUser.hasStripeAccount == true,
                            onHostCreateAccount = { component.onHostCreateAccount() },
                            eventWithRelations = selectedEvent,
                            editEvent = editedEvent,
                            navPadding = LocalNavBarPadding.current,
                            onPlaceSelected = { component.selectPlace(it) },
                            editView = isEditing,
                            onEditEvent = { update -> component.editEventField(update) },
                            onEditTournament = { update -> component.editTournamentField(update) },
                            isNewEvent = false,
                            onEventTypeSelected = { component.onTypeSelected(it) },
                            onAddCurrentUser = {},
                            onSelectFieldCount = { component.selectFieldCount(it) },
                            imageScheme = imageScheme
                        ) { isValid ->
                            val buttonColors = ButtonColors(
                                containerColor = Color(imageScheme.primary),
                                contentColor = Color(imageScheme.onPrimary),
                                disabledContainerColor = Color(imageScheme.onSurface),
                                disabledContentColor = Color(imageScheme.onSurfaceVariant)
                            )
                            AnimatedContent(
                                targetState = isEditing,
                                transitionSpec = { buttonTransitionSpec() },
                                label = "buttonTransition"
                            ) { editMode ->
                                Column(
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    if (editMode) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Button(
                                                onClick = {
                                                    component.updateEvent()
                                                    component.toggleEdit()
                                                }, enabled = isValid, colors = buttonColors
                                            ) {
                                                Text("Confirm")
                                            }
                                            Button(
                                                onClick = {
                                                    component.toggleEdit()
                                                }, colors = buttonColors
                                            ) {
                                                Text("Cancel")
                                            }
                                        }
                                    } else {
                                        Button(
                                            onClick = {
                                                component.viewEvent()
                                            }, colors = buttonColors
                                        ) { Text("View") }
                                        // In your EventDetailScreen composable, update the button section
                                        if (!isUserInEvent) {
                                            if (isEventFull) {
                                                // Show waitlist options when event is full
                                                if (teamSignup) {
                                                    if (selectedEvent.event.price > 0) {
                                                        PaymentProcessorButton(
                                                            onClick = {
                                                                showTeamSelectionDialog = true
                                                            },
                                                            component,
                                                            "Join Waitlist as Team (Payment Not Required)",
                                                            colors = buttonColors
                                                        )
                                                    } else {
                                                        Button(
                                                            onClick = {
                                                                showTeamSelectionDialog = true
                                                            }, colors = buttonColors
                                                        ) {
                                                            Text("Join Waitlist as Team")
                                                        }
                                                    }
                                                } else {
                                                    if (selectedEvent.event.price > 0) {
                                                        PaymentProcessorButton(
                                                            {
                                                                component.joinEvent()
                                                            },
                                                            component,
                                                            "Join Waitlist (Payment Not Required)",
                                                            colors = buttonColors
                                                        )
                                                    } else {
                                                        Button(
                                                            onClick = {
                                                                component.joinEvent()
                                                            }, colors = buttonColors
                                                        ) {
                                                            Text("Join Waitlist")
                                                        }
                                                    }
                                                }
                                            } else {
                                                if (teamSignup) {
                                                    Button(onClick = {
                                                        component.joinEvent()
                                                    }, colors = buttonColors) {
                                                        Text("Join as free agent")
                                                    }
                                                    if (selectedEvent.event.price > 0) {
                                                        PaymentProcessorButton(
                                                            onClick = {
                                                                showTeamSelectionDialog = true
                                                            },
                                                            component,
                                                            "Purchase Ticket for Team",
                                                            colors = buttonColors
                                                        )
                                                    } else {
                                                        Button(
                                                            onClick = {
                                                                showTeamSelectionDialog = true
                                                            }, colors = buttonColors
                                                        ) { Text("Join as Team") }
                                                    }
                                                } else {
                                                    if (selectedEvent.event.price > 0) {
                                                        PaymentProcessorButton(
                                                            {
                                                                component.joinEvent()
                                                            },
                                                            component,
                                                            "Purchase Ticket",
                                                            colors = buttonColors
                                                        )
                                                    } else {
                                                        Button(
                                                            onClick = {
                                                                component.joinEvent()
                                                            }, colors = buttonColors
                                                        ) { Text("Join") }
                                                    }
                                                }
                                            }
                                        } else if (!teamSignup || isCaptain || isFreeAgent) {
                                            val leaveMessage = if (isFreeAgent) {
                                                "Leave as Free Agent"
                                            } else if (isWaitListed) {
                                                "Leave Waitlist"
                                            } else if (selectedEvent.event.price > 0) {
                                                if (isRefundAutomatic) {
                                                    "Leave and Request Refund (Not Automatic)"
                                                } else {
                                                    "Leave and Get Refund"
                                                }
                                            } else {
                                                "Leave Event"
                                            }
                                            Button(
                                                onClick = {
                                                    if (selectedEvent.event.price > 0 && !isFreeAgent && !isWaitListed) {
                                                        showRefundReasonDialog = true
                                                    } else {
                                                        component.leaveEvent()
                                                    }
                                                }, colors = buttonColors
                                            ) {
                                                Text(leaveMessage)
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if (!showMap) {
                            Box(
                                Modifier.padding(top = 64.dp, start = 16.dp)
                                    .align(Alignment.TopStart)
                            ) {
                                IconButton(
                                    { component.backCallback.onBack() },
                                    modifier = Modifier.background(
                                        Color(imageScheme.surface).copy(alpha = 0.7f),
                                        shape = CircleShape
                                    ),
                                ) {
                                    Icon(
                                        Icons.Default.Close,
                                        contentDescription = "Close",
                                        tint = Color(imageScheme.onSurface)
                                    )
                                }
                            }
                            Box(
                                modifier = Modifier.align(Alignment.TopEnd)
                                    .padding(top = 64.dp, end = 16.dp)
                            ) {
                                IconButton(
                                    onClick = { showOptionsDropdown = true },
                                    modifier = Modifier.background(
                                        Color(imageScheme.surface).copy(alpha = 0.7f),
                                        shape = CircleShape
                                    )
                                ) {
                                    Icon(
                                        Icons.Default.MoreVert,
                                        contentDescription = "More options",
                                        tint = Color(imageScheme.onSurface)
                                    )
                                }

                                DropdownMenu(expanded = showOptionsDropdown,
                                    onDismissRequest = { showOptionsDropdown = false }) {
                                    // Edit option
                                    if (isHost) {
                                        DropdownMenuItem(text = { Text("Edit") }, onClick = {
                                            component.toggleEdit()
                                            showOptionsDropdown = false
                                        }, leadingIcon = {
                                            Icon(Icons.Default.Edit, contentDescription = null)
                                        }, enabled = isHost
                                        )
                                    }

                                    DropdownMenuItem(text = { Text("Share") }, onClick = {
                                        component.shareEvent()
                                        showOptionsDropdown = false
                                    }, leadingIcon = {
                                        Icon(Icons.Default.Share, contentDescription = null)
                                    })

                                    if (isHost) {
                                        DropdownMenuItem(text = { Text("Delete") }, onClick = {
                                            showDeleteConfirmation = true
                                            showOptionsDropdown = false
                                        }, leadingIcon = {
                                            Icon(
                                                Icons.Default.Delete,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.error
                                            )
                                        }, colors = MenuDefaults.itemColors(
                                            textColor = MaterialTheme.colorScheme.error
                                        )
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                AnimatedVisibility(
                    showDetails,
                    enter = expandVertically(expandFrom = Alignment.Top),
                    exit = shrinkVertically(shrinkTowards = Alignment.Top)
                ) {
                    Column(Modifier.padding(innerPadding).padding(top = 32.dp)) {
                        CollapsableHeader(component)
                        if (isHost && selectedEvent is TournamentWithRelations) {
                            MatchEditControls(
                                isEditing = isEditingMatches,
                                onStartEdit = component::startEditingMatches,
                                onCancelEdit = component::cancelEditingMatches,
                                onCommitEdit = component::commitMatchChanges
                            )
                        }
                        Box(Modifier.fillMaxSize()) {
                            when (selectedEvent) {
                                is TournamentWithRelations -> {
                                    if (isBracketView) {
                                        TournamentBracketView(
                                            showFab = { showFab = it },
                                            onMatchClick = { match ->
                                                if (!isEditingMatches) {
                                                    component.matchSelected(match)
                                                }
                                            },
                                            isEditingMatches = isEditingMatches,
                                            editableMatches = editableMatches,
                                            onEditMatch = { match ->
                                                component.showMatchEditDialog(match)
                                            }
                                        )
                                    } else {
                                        ParticipantsView(showFab = {
                                            showFab = it
                                        })
                                    }
                                }

                                is EventWithRelations -> {
                                    ParticipantsView(showFab = {
                                        showFab = it
                                    })
                                }
                            }
                            androidx.compose.animation.AnimatedVisibility(
                                visible = showFab,
                                modifier = Modifier.align(Alignment.BottomCenter)
                                    .padding(LocalNavBarPadding.current).padding(bottom = 64.dp),
                                enter = slideInVertically() + fadeIn(),
                                exit = slideOutVertically() + fadeOut()
                            ) {
                                Button(
                                    { component.toggleDetails() },
                                ) {
                                    Text("Show Details")
                                }
                            }
                        }
                    }
                }
            }

            showTeamDialog?.let { dialogState ->
                TeamSelectionDialog(
                    dialogState = dialogState,
                    onTeamSelected = { teamId ->
                        component.selectTeamForMatch(
                            dialogState.matchId,
                            dialogState.position,
                            teamId
                        )
                    },
                    onDismiss = component::dismissTeamSelection
                )
            }
            showMatchEditDialog?.let { dialogState ->
                MatchEditDialog(
                    match = dialogState.match,
                    teams = dialogState.teams,
                    fields = dialogState.fields,
                    onDismissRequest = component::dismissMatchEditDialog,
                    onConfirm = component::updateMatchFromDialog
                )
            }
            if (showTeamSelectionDialog) {
                TeamSelectionDialog(teams = validTeams,
                    onTeamSelected = { selectedTeam ->
                        showTeamSelectionDialog = false
                        component.joinEventAsTeam(selectedTeam)
                    },
                    onDismiss = {
                        showTeamSelectionDialog = false
                    },
                    onCreateTeam = { component.createNewTeam() },
                    sizeLimit = selectedEvent.event.teamSizeLimit
                )
            }
            if (showDeleteConfirmation) {
                AlertDialog(onDismissRequest = { showDeleteConfirmation = false },
                    title = { Text("Delete Event") },
                    text = {
                        Text(
                            if (selectedEvent.event.price > 0) {
                                "Are you sure you want to delete this event? All participants will receive a full refund. This action cannot be undone."
                            } else {
                                "Are you sure you want to delete this event? This action cannot be undone."
                            }
                        )
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                component.deleteEvent()
                                showDeleteConfirmation = false
                            }, colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error
                            )
                        ) {
                            Text("Delete")
                        }
                    },
                    dismissButton = {
                        Button(onClick = { showDeleteConfirmation = false }) {
                            Text("Cancel")
                        }
                    })
            }

            if (showRefundReasonDialog) {
                RefundReasonDialog(currentReason = refundReason,
                    onReasonChange = { refundReason = it },
                    onConfirm = {
                        component.requestRefund(refundReason)
                        showRefundReasonDialog = false
                        refundReason = ""
                    },
                    onDismiss = {
                        showRefundReasonDialog = false
                        refundReason = ""
                    })
            }

            if (showFeeBreakdown && currentFeeBreakdown != null) {
                FeeBreakdownDialog(feeBreakdown = currentFeeBreakdown!!,
                    onConfirm = { component.confirmFeeBreakdown() },
                    onCancel = { component.dismissFeeBreakdown() })
            }
        }
    }
}


@Composable
fun TeamSelectionDialog(
    sizeLimit: Int,
    teams: List<TeamWithPlayers>,
    onTeamSelected: (TeamWithPlayers) -> Unit,
    onDismiss: () -> Unit,
    onCreateTeam: () -> Unit
) {
    AlertDialog(onDismissRequest = onDismiss,
        title = { Text("Select a Team of size $sizeLimit") },
        text = {
            // List only valid teams
            LazyColumn {
                items(teams) { team ->
                    Row(modifier = Modifier.fillMaxWidth().clickable { onTeamSelected(team) }
                        .padding(8.dp)) {
                        TeamCard(team)
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onCreateTeam) {
                Text("Manage Teams")
            }
        })
}

@Composable
fun RefundReasonDialog(
    currentReason: String,
    onReasonChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Refund Request") }, text = {
        Column {
            Text(
                "Please provide a reason for your refund request:",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            PlatformTextField(
                value = currentReason,
                onValueChange = onReasonChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = "Enter reason...",
            )
        }
    }, confirmButton = {
        Button(
            onClick = onConfirm, enabled = currentReason.isNotBlank()
        ) {
            Text("Submit Refund Request")
        }
    }, dismissButton = {
        Button(onClick = onDismiss) {
            Text("Cancel")
        }
    })
}

private fun Int.centsToDollars(): String {
    val dollars = this / 100.0
    val rounded = round(dollars * 100) / 100
    val wholePart = rounded.toInt()
    val decimalPart = ((rounded - wholePart) * 100).toInt()
    return if (decimalPart == 0) {
        "$wholePart.00"
    } else if (decimalPart < 10) {
        "$wholePart.0$decimalPart"
    } else {
        "$wholePart.$decimalPart"
    }
}

@Composable
fun FeeBreakdownDialog(
    feeBreakdown: FeeBreakdown, onConfirm: () -> Unit, onCancel: () -> Unit
) {
    AlertDialog(onDismissRequest = onCancel, title = { Text("Payment Breakdown") }, text = {
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                "Review the charges before proceeding:", style = MaterialTheme.typography.bodyMedium
            )

            HorizontalDivider()

            FeeRow("Event Price", "$${feeBreakdown.eventPrice.centsToDollars()}")
            FeeRow("Processing Fee", "$${feeBreakdown.processingFee.centsToDollars()}")
            FeeRow("Stripe Fee", "$${feeBreakdown.stripeFee.centsToDollars()}")

            HorizontalDivider()

            FeeRow(
                "Total Charge", "$${feeBreakdown.totalCharge.centsToDollars()}", isTotal = true
            )

            Text(
                "Host receives: $${feeBreakdown.hostReceives.centsToDollars()}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }, confirmButton = {
        Button(onClick = onConfirm) {
            Text("Proceed to Payment")
        }
    }, dismissButton = {
        Button(onClick = onCancel) {
            Text("Cancel")
        }
    })
}

@Composable
private fun FeeRow(
    label: String, amount: String, isTotal: Boolean = false
) {
    Row(
        modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = if (isTotal) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            fontWeight = if (isTotal) FontWeight.Bold else FontWeight.Normal
        )
        Text(
            text = amount,
            style = if (isTotal) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            fontWeight = if (isTotal) FontWeight.Bold else FontWeight.Normal
        )
    }
}
