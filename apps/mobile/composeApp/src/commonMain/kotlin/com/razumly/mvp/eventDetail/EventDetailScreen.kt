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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Announcement
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.FeeBreakdown
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.composables.StripeButton
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.util.buttonTransitionSpec
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventDetail.composables.CollapsableHeader
import com.razumly.mvp.eventDetail.composables.MatchEditControls
import com.razumly.mvp.eventDetail.composables.MatchEditDialog
import com.razumly.mvp.eventDetail.composables.ParticipantsView
import com.razumly.mvp.eventDetail.composables.ScheduleView
import com.razumly.mvp.eventDetail.composables.SendNotificationDialog
import com.razumly.mvp.eventDetail.composables.TeamSelectionDialog
import com.razumly.mvp.eventDetail.composables.TournamentBracketView
import com.razumly.mvp.eventMap.MapComponent
import kotlin.math.absoluteValue
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.ExperimentalTime

val LocalTournamentComponent =
    compositionLocalOf<EventDetailComponent> { error("No tournament provided") }

private enum class DetailTab(val label: String) {
    PARTICIPANTS("Participants"),
    BRACKET("Bracket"),
    SCHEDULE("Schedule"),
    LEAGUES("Leagues")
}

@Composable
@OptIn(ExperimentalTime::class)
fun EventDetailScreen(
    component: EventDetailComponent, mapComponent: MapComponent
) {
    val popupHandler = LocalPopupHandler.current
    val loadingHandler = LocalLoadingHandler.current
    val selectedEvent by component.eventWithRelations.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val validTeams by component.validTeams.collectAsState()
    val showDetails by component.showDetails.collectAsState()
    val editedEvent by component.editedEvent.collectAsState()
    val showMap by mapComponent.showMap.collectAsState()
    val showFeeBreakdown by component.showFeeBreakdown.collectAsState()
    val currentFeeBreakdown by component.currentFeeBreakdown.collectAsState()
    val editableMatches by component.editableMatches.collectAsState()
    val showTeamDialog by component.showTeamSelectionDialog.collectAsState()
    val showMatchEditDialog by component.showMatchEditDialog.collectAsState()
    val joinChoiceDialog by component.joinChoiceDialog.collectAsState()
    val childJoinSelectionDialog by component.childJoinSelectionDialog.collectAsState()
    val textSignaturePrompt by component.textSignaturePrompt.collectAsState()
    val eventImageIds by component.eventImageIds.collectAsState()

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
    val eventType = selectedEvent.event.eventType
    val isTournamentEvent = eventType == EventType.TOURNAMENT
    val hasBracketView = isTournamentEvent ||
        (eventType == EventType.LEAGUE && selectedEvent.event.includePlayoffs)
    val hasScheduleView = selectedEvent.matches.isNotEmpty()
    val hasStandingsView = eventType == EventType.LEAGUE
    val leagueStandings = remember(
        selectedEvent.teams,
        selectedEvent.matches,
        selectedEvent.leagueScoringConfig
    ) {
        buildLeagueStandings(
            teams = selectedEvent.teams,
            matches = selectedEvent.matches,
            config = selectedEvent.leagueScoringConfig
        )
    }

    var showTeamSelectionDialog by remember { mutableStateOf(false) }
    var showFab by remember { mutableStateOf(false) }
    var showOptionsDropdown by remember { mutableStateOf(false) }
    var showDeleteConfirmation by remember { mutableStateOf(false) }
    var showRefundReasonDialog by remember { mutableStateOf(false) }
    var refundReason by remember { mutableStateOf("") }
    var showNotifyDialog by remember { mutableStateOf(false) }

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
                popupHandler.showPopup(error)
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
                            eventWithRelations = selectedEvent,
                            editEvent = editedEvent,
                            navPadding = LocalNavBarPadding.current,
                            editView = isEditing,
                            isNewEvent = false,
                            onAddCurrentUser = {},
                            imageScheme = imageScheme,
                            imageIds = eventImageIds,
                            onHostCreateAccount = component::onHostCreateAccount,
                            onPlaceSelected = component::selectPlace,
                            onEditEvent = component::editEventField,
                            onEditTournament = component::editTournamentField,
                            onEventTypeSelected = component::onTypeSelected,
                            onSelectFieldCount = component::selectFieldCount,
                            onUploadSelected = component::onUploadSelected,
                            onDeleteImage = component::deleteImage,
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
                                                        StripeButton(
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
                                                        StripeButton(
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
                                                        StripeButton(
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
                                                        StripeButton(
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

                                DropdownMenu(
                                    expanded = showOptionsDropdown,
                                    onDismissRequest = { showOptionsDropdown = false }) {
                                    // Edit option
                                    if (isHost) {
                                        DropdownMenuItem(
                                            text = { Text("Edit") }, onClick = {
                                            component.toggleEdit()
                                            showOptionsDropdown = false
                                        }, leadingIcon = {
                                            Icon(Icons.Default.Edit, contentDescription = null)
                                        }, enabled = isHost
                                        )
                                    }

                                    if (isHost && selectedEvent.event.state == "UNPUBLISHED") {
                                        DropdownMenuItem(
                                            text = { Text("Publish") },
                                            onClick = {
                                                component.publishEvent()
                                                showOptionsDropdown = false
                                            },
                                            leadingIcon = {
                                                Icon(Icons.Default.Check, contentDescription = null)
                                            },
                                        )
                                    }

                                    DropdownMenuItem(text = { Text("Share") }, onClick = {
                                        component.shareEvent()
                                        showOptionsDropdown = false
                                    }, leadingIcon = {
                                        Icon(Icons.Default.Share, contentDescription = null)
                                    })

                                    if (isHost) {
                                        DropdownMenuItem(
                                            text = { Text("Notify Players") },
                                            onClick = {
                                                showNotifyDialog = true
                                                showOptionsDropdown = false
                                            },
                                            leadingIcon = {
                                                Icon(
                                                    Icons.AutoMirrored.Filled.Announcement,
                                                    contentDescription = null,
                                                )
                                            })
                                    }

                                    if (isHost) {
                                        DropdownMenuItem(
                                            text = { Text("Delete") }, onClick = {
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
                        if (isHost && isTournamentEvent) {
                            MatchEditControls(
                                isEditing = isEditingMatches,
                                onStartEdit = component::startEditingMatches,
                                onCancelEdit = component::cancelEditingMatches,
                                onCommitEdit = component::commitMatchChanges
                            )
                        }
                        val availableTabs = remember(hasBracketView, hasScheduleView, hasStandingsView) {
                            buildList {
                                add(DetailTab.PARTICIPANTS)
                                if (hasScheduleView) add(DetailTab.SCHEDULE)
                                if (hasStandingsView) add(DetailTab.LEAGUES)
                                if (hasBracketView) add(DetailTab.BRACKET)
                            }
                        }
                        var selectedTab by rememberSaveable { mutableStateOf(DetailTab.PARTICIPANTS) }
                        LaunchedEffect(availableTabs) {
                            if (selectedTab !in availableTabs) {
                                selectedTab = availableTabs.first()
                            }
                        }
                        val selectedTabIndex =
                            availableTabs.indexOf(selectedTab).takeIf { it >= 0 } ?: 0
                        PrimaryTabRow(
                            selectedTabIndex = selectedTabIndex,
                            modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
                        ) {
                            availableTabs.forEachIndexed { index, tab ->
                                Tab(
                                    selected = index == selectedTabIndex,
                                    onClick = { selectedTab = tab },
                                    text = { Text(tab.label) }
                                )
                            }
                        }
                        Box(Modifier.fillMaxSize()) {
                            when (selectedTab) {
                                DetailTab.BRACKET -> {
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
                                }

                                DetailTab.SCHEDULE -> {
                                    ScheduleView(
                                        matches = selectedEvent.matches,
                                        showFab = { showFab = it },
                                        onMatchClick = { match ->
                                            if (!isEditingMatches) {
                                                component.matchSelected(match)
                                            }
                                        }
                                    )
                                }
                                DetailTab.LEAGUES -> {
                                    LeagueStandingsTab(
                                        standings = leagueStandings,
                                        pointPrecision = selectedEvent.leagueScoringConfig?.pointPrecision,
                                        showFab = { showFab = it }
                                    )
                                }

                                DetailTab.PARTICIPANTS -> {
                                    ParticipantsView(
                                        showFab = { showFab = it },
                                        onNavigateToChat = component::onNavigateToChat
                                    )
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
                    dialogState = dialogState, onTeamSelected = { teamId ->
                        component.selectTeamForMatch(
                            dialogState.matchId, dialogState.position, teamId
                        )
                    }, onDismiss = component::dismissTeamSelection
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
                TeamSelectionDialog(
                    teams = validTeams,
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
            joinChoiceDialog?.let {
                AlertDialog(
                    onDismissRequest = component::dismissJoinChoiceDialog,
                    title = { Text("Join Event") },
                    text = {
                        Text("You have linked children. Do you want to join yourself or register a child instead?")
                    },
                    confirmButton = {
                        Button(onClick = component::confirmJoinAsSelf) {
                            Text("Join Myself")
                        }
                    },
                    dismissButton = {
                        Button(onClick = component::showChildJoinSelection) {
                            Text("Register Child")
                        }
                    },
                )
            }
            childJoinSelectionDialog?.let { dialogState ->
                ChildJoinSelectionDialog(
                    dialogState = dialogState,
                    onDismiss = component::dismissChildJoinSelectionDialog,
                    onChildSelected = component::selectChildForJoin,
                )
            }
            if (showDeleteConfirmation) {
                AlertDialog(
                    onDismissRequest = { showDeleteConfirmation = false },
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

            if (showNotifyDialog) {
                SendNotificationDialog(onSend = {
                    component.sendNotification(
                        title = "Event Notification", message = "Event Notification"
                    )
                    showNotifyDialog = false
                }, onDismiss = {
                    showNotifyDialog = false
                })
            }

            if (showRefundReasonDialog) {
                RefundReasonDialog(
                    currentReason = refundReason,
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

            textSignaturePrompt?.let { prompt ->
                TextSignatureDialog(
                    prompt = prompt,
                    onConfirm = component::confirmTextSignature,
                    onDismiss = component::dismissTextSignature,
                )
            }

            if (showFeeBreakdown && currentFeeBreakdown != null) {
                FeeBreakdownDialog(
                    feeBreakdown = currentFeeBreakdown!!,
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
    AlertDialog(
        onDismissRequest = onDismiss,
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
private fun ChildJoinSelectionDialog(
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
                            .clickable(enabled = child.hasEmail) { onChildSelected(child.userId) }
                            .padding(vertical = 8.dp),
                    ) {
                        Text(text = child.fullName, style = MaterialTheme.typography.bodyLarge)
                        val subtitle = if (child.hasEmail) {
                            child.email ?: "Email available"
                        } else {
                            "Missing email. Add an email before registration."
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
private fun LeagueStandingsTab(
    standings: List<TeamStanding>,
    pointPrecision: Int?,
    showFab: (Boolean) -> Unit
) {
    LaunchedEffect(standings) {
        showFab(true)
    }

    if (standings.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "Standings will appear once scores are reported.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
    ) {
        LeagueStandingsHeader()
        LazyColumn {
            items(standings, key = { it.team.team.id }) { standing ->
                LeagueStandingRow(
                    standing = standing,
                    pointPrecision = pointPrecision
                )
            }
        }
    }
}

@Composable
private fun LeagueStandingsHeader() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Team",
            modifier = Modifier.weight(1.6f),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(
            modifier = Modifier
                .weight(0.8f)
                .padding(start = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "Score",
                modifier = Modifier.weight(1.2f),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = "W",
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = "L",
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = "D",
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun LeagueStandingRow(
    standing: TeamStanding,
    pointPrecision: Int?,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(modifier = Modifier.weight(1.6f)) {
            TeamCard(team = standing.team)
        }
        Row(
            modifier = Modifier
                .weight(0.8f)
                .padding(start = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            StandingsCell(
                label = "Score",
                value = standing.score.formatPoints(pointPrecision),
                modifier = Modifier.weight(1.2f)
            )
            StandingsCell(
                label = "W",
                value = standing.wins.toString(),
                modifier = Modifier.weight(1f)
            )
            StandingsCell(
                label = "L",
                value = standing.losses.toString(),
                modifier = Modifier.weight(1f)
            )
            StandingsCell(
                label = "D",
                value = standing.draws.toString(),
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun StandingsCell(
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

private data class TeamStanding(
    val team: TeamWithPlayers,
    val wins: Int,
    val losses: Int,
    val draws: Int,
    val goalsFor: Int,
    val goalsAgainst: Int,
    val score: Double
) {
    val goalDifferential: Int get() = goalsFor - goalsAgainst
}

private data class StandingAccumulator(
    var wins: Int = 0,
    var losses: Int = 0,
    var draws: Int = 0,
    var goalsFor: Int = 0,
    var goalsAgainst: Int = 0,
    var score: Double = 0.0
)

private enum class MatchOutcome { WIN, LOSS, DRAW }

private fun buildLeagueStandings(
    teams: List<TeamWithPlayers>,
    matches: List<MatchWithRelations>,
    config: LeagueScoringConfig?
): List<TeamStanding> {
    if (teams.isEmpty()) return emptyList()

    val teamMap = teams.associateBy { it.team.id }
    val accumulators = teams.associate { it.team.id to StandingAccumulator() }.toMutableMap()

    matches.forEach { match ->
        val teamOneId = match.match.team1Id ?: return@forEach
        val teamTwoId = match.match.team2Id ?: return@forEach
        if (teamOneId == teamTwoId) return@forEach

        val teamOneScore = match.match.team1Points.takeIf { it.isNotEmpty() }?.sum()
        val teamTwoScore = match.match.team2Points.takeIf { it.isNotEmpty() }?.sum()
        if (teamOneScore == null || teamTwoScore == null) return@forEach

        if (!teamMap.containsKey(teamOneId) || !teamMap.containsKey(teamTwoId)) return@forEach

        val outcome = when {
            teamOneScore > teamTwoScore -> MatchOutcome.WIN to MatchOutcome.LOSS
            teamOneScore < teamTwoScore -> MatchOutcome.LOSS to MatchOutcome.WIN
            else -> MatchOutcome.DRAW to MatchOutcome.DRAW
        }

        accumulators[teamOneId]?.applyMatchResult(
            goalsFor = teamOneScore,
            goalsAgainst = teamTwoScore,
            outcome = outcome.first,
            config = config
        )
        accumulators[teamTwoId]?.applyMatchResult(
            goalsFor = teamTwoScore,
            goalsAgainst = teamOneScore,
            outcome = outcome.second,
            config = config
        )
    }

    return teams.map { team ->
        val stats = accumulators[team.team.id] ?: StandingAccumulator()
        TeamStanding(
            team = team,
            wins = stats.wins,
            losses = stats.losses,
            draws = stats.draws,
            goalsFor = stats.goalsFor,
            goalsAgainst = stats.goalsAgainst,
            score = stats.score
        )
    }.sortedWith(
        compareByDescending<TeamStanding> { it.score }
            .thenByDescending { it.wins }
            .thenByDescending { it.goalDifferential }
            .thenBy { it.team.team.seed }
            .thenBy { it.team.team.name ?: it.team.team.id }
    )
}

private fun StandingAccumulator.applyMatchResult(
    goalsFor: Int,
    goalsAgainst: Int,
    outcome: MatchOutcome,
    config: LeagueScoringConfig?
) {
    this.goalsFor += goalsFor
    this.goalsAgainst += goalsAgainst

    when (outcome) {
        MatchOutcome.WIN -> wins++
        MatchOutcome.LOSS -> losses++
        MatchOutcome.DRAW -> draws++
    }

    var matchPoints = when (outcome) {
        MatchOutcome.WIN -> (config?.pointsForWin ?: DEFAULT_POINTS_FOR_WIN).toDouble()
        MatchOutcome.LOSS -> (config?.pointsForLoss ?: DEFAULT_POINTS_FOR_LOSS).toDouble()
        MatchOutcome.DRAW -> (config?.pointsForDraw ?: DEFAULT_POINTS_FOR_DRAW).toDouble()
    }

    config?.pointsPerGoalScored?.let { matchPoints += it * goalsFor }
    config?.pointsPerGoalConceded?.let { matchPoints += it * goalsAgainst }
    config?.pointsForParticipation?.let { matchPoints += it }

    val goalDiff = goalsFor - goalsAgainst
    if (goalDiff > 0) {
        config?.pointsPerGoalDifference?.let { perDiff ->
            val cappedDiff =
                config.maxGoalDifferencePoints?.let { min(goalDiff, it) } ?: goalDiff
            matchPoints += cappedDiff * perDiff
        }
    } else if (goalDiff < 0) {
        config?.pointsPenaltyPerGoalDifference?.let { penalty ->
            val cappedPenalty =
                config.maxGoalDifferencePoints?.let { min(goalDiff.absoluteValue, it) }
                    ?: goalDiff.absoluteValue
            matchPoints -= cappedPenalty * penalty
        }
    }

    config?.maxPointsPerMatch?.toDouble()?.let { maxPoints ->
        matchPoints = min(matchPoints, maxPoints)
    }
    config?.minPointsPerMatch?.toDouble()?.let { minPoints ->
        matchPoints = max(matchPoints, minPoints)
    }

    score += matchPoints
}

private fun Double.formatPoints(precisionOverride: Int?): String {
    val decimals = when {
        precisionOverride != null -> precisionOverride
        (this % 1.0).absoluteValue < 0.0001 -> 0
        else -> 2
    }
    if (decimals <= 0) return this.toLong().toString()

    var factor = 1.0
    repeat(decimals) { factor *= 10 }
    val roundedValue = (round(this * factor) / factor).let { if (it == -0.0) 0.0 else it }
    val rawText = roundedValue.toString()
    val decimalIndex = rawText.indexOf('.')
    return if (decimalIndex == -1) {
        buildString {
            append(rawText)
            append('.')
            repeat(decimals) { append('0') }
        }
    } else {
        val digits = rawText.length - decimalIndex - 1
        when {
            digits == decimals -> rawText
            digits > decimals -> rawText.substring(0, decimalIndex + 1 + decimals)
            else -> buildString {
                append(rawText)
                repeat(decimals - digits) { append('0') }
            }
        }
    }
}

private const val DEFAULT_POINTS_FOR_WIN = 3
private const val DEFAULT_POINTS_FOR_DRAW = 1
private const val DEFAULT_POINTS_FOR_LOSS = 0

@Composable
fun TextSignatureDialog(
    prompt: TextSignaturePromptState,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    var accepted by remember(prompt.step.templateId) { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(prompt.step.title ?: "Required Document Signature") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Document ${prompt.currentStep} of ${prompt.totalSteps}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                prompt.step.requiredSignerLabel?.let { signerLabel ->
                    Text(
                        text = "Required signer: $signerLabel",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = prompt.step.content ?: "No document text was provided.",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 120.dp, max = 320.dp)
                        .verticalScroll(rememberScrollState())
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(checked = accepted, onCheckedChange = { accepted = it })
                    Text("I have read and agree to this document.")
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = accepted
            ) {
                Text("Accept and Continue")
            }
        },
        dismissButton = {
            Button(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
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
