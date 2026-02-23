package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.PlayerInteractionComponent
import com.razumly.mvp.core.presentation.composables.PlayerAction
import com.razumly.mvp.core.presentation.composables.PlayerCardWithActions
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.composables.TeamDetailsDialog
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

private const val MOBILE_BREAKPOINT_DP = 600

enum class ParticipantsSection(val label: String) {
    TEAMS("Teams"),
    PARTICIPANTS("Participants"),
    FREE_AGENTS("Free Agents"),
}

@Composable
fun ParticipantsView(
    showFab: (Boolean) -> Unit,
    section: ParticipantsSection = ParticipantsSection.TEAMS,
    onNavigateToChat: (UserData) -> Unit
) {
    val component = LocalTournamentComponent.current
    val divisionTeams by component.divisionTeams.collectAsState()
    val selectedEvent by component.eventWithRelations.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val participants = selectedEvent.players
    val teamSignup = selectedEvent.event.teamSignup
    val participantIds = remember(selectedEvent.event.playerIds) {
        selectedEvent.event.playerIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
    }
    val participantUsersFromEvent = remember(participantIds, selectedEvent.players) {
        val playersById = selectedEvent.players.associateBy(UserData::id)
        participantIds.mapNotNull(playersById::get)
    }
    val freeAgentIds = remember(selectedEvent.event.freeAgentIds) {
        selectedEvent.event.freeAgentIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
    }
    val freeAgentUsers = remember(freeAgentIds, selectedEvent.players) {
        val playersById = selectedEvent.players.associateBy(UserData::id)
        freeAgentIds.mapNotNull(playersById::get)
    }
    val participantUsers = remember(selectedEvent.players, selectedEvent.teams, freeAgentUsers) {
        val teamPlayers = selectedEvent.teams.flatMap { team -> team.players }
        (teamPlayers + selectedEvent.players + freeAgentUsers).distinctBy(UserData::id)
    }
    val canInviteToTeam = remember(selectedEvent.teams, currentUser.id) {
        selectedEvent.teams.any { teamWithPlayers ->
            teamWithPlayers.team.captainId == currentUser.id ||
                teamWithPlayers.team.managerId == currentUser.id
        }
    }
    val navPadding = LocalNavBarPadding.current
    val lazyColumnState = rememberLazyListState()
    val isScrollingUp by lazyColumnState.isScrollingUp()
    val showParticipantsTitle = getScreenWidth() >= MOBILE_BREAKPOINT_DP
    val popUpHandler = LocalPopupHandler.current
    val loadingHandler = LocalLoadingHandler.current

    // Team dialog state
    var selectedTeam by remember { mutableStateOf<TeamWithPlayers?>(null) }
    var showTeamDialog by remember { mutableStateOf(false) }

    val playerInteractionComponent = remember {
        getKoin().get<PlayerInteractionComponent> { parametersOf(component) }
    }

    LaunchedEffect(Unit) {
        playerInteractionComponent.setLoadingHandler(loadingHandler)
        playerInteractionComponent.errorState.collect { error ->
            if (error != null) {
                popUpHandler.showPopup(error)
            }
        }
    }

    showFab(isScrollingUp)

    LazyColumn(
        Modifier
            .background(MaterialTheme.colorScheme.background)
            .fillMaxSize(),
        state = lazyColumnState,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = navPadding
    ) {
        if (showParticipantsTitle) {
            item(key = "header") {
                Text("Participants", style = MaterialTheme.typography.titleLarge)
            }
        }

        item(key = "section-header") {
            Text(section.label, style = MaterialTheme.typography.titleLarge)
        }

        when (section) {
            ParticipantsSection.TEAMS -> {
                if (!teamSignup || divisionTeams.isEmpty()) {
                    item(key = "teams-empty") {
                        Text(
                            "No teams yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    items(
                        divisionTeams.values.toList(),
                        key = { it.team.id },
                    ) { team ->
                        TeamCard(
                            team = team,
                            modifier = Modifier.clickable {
                                selectedTeam = team
                                showTeamDialog = true
                            }
                        )
                    }
                }
            }

            ParticipantsSection.FREE_AGENTS -> {
                if (!teamSignup || freeAgentUsers.isEmpty()) {
                    item(key = "free-agents-empty") {
                        Text(
                            "No free agents yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    items(freeAgentUsers, key = { it.id }) { freeAgent ->
                        PlayerCardWithActions(
                            player = freeAgent,
                            currentUser = currentUser,
                            onMessage = { user ->
                                onNavigateToChat(user)
                            },
                            onSendFriendRequest = { user ->
                                playerInteractionComponent.sendFriendRequest(user)
                            },
                            onFollow = { user ->
                                playerInteractionComponent.followUser(user)
                            },
                            onUnfollow = { user ->
                                playerInteractionComponent.unfollowUser(user)
                            },
                            onInviteToTeam = if (canInviteToTeam) {
                                { user -> component.inviteFreeAgentToTeam(user.id) }
                            } else {
                                null
                            }
                        )
                    }
                }
            }

            ParticipantsSection.PARTICIPANTS -> {
                val visibleParticipants = if (teamSignup) {
                    participantUsers
                } else {
                    participantUsersFromEvent.ifEmpty { participants }
                }
                if (visibleParticipants.isEmpty()) {
                    item(key = "participants-empty") {
                        Text(
                            "No participants yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    items(visibleParticipants, key = { it.id }) { participant ->
                        PlayerCardWithActions(
                            player = participant,
                            currentUser = currentUser,
                            onMessage = { user ->
                                onNavigateToChat(user)
                            },
                            onSendFriendRequest = { user ->
                                playerInteractionComponent.sendFriendRequest(user)
                            },
                            onFollow = { user ->
                                playerInteractionComponent.followUser(user)
                            },
                            onUnfollow = { user ->
                                playerInteractionComponent.unfollowUser(user)
                            }
                        )
                    }
                }
            }
        }

    }

    // Show team details dialog
    if (showTeamDialog && selectedTeam != null) {
        TeamDetailsDialog(
            team = selectedTeam!!,
            currentUser = currentUser,
            onDismiss = {
                showTeamDialog = false
                selectedTeam = null
            },
            onPlayerMessage = { user ->
                onNavigateToChat(user)
                showTeamDialog = false
                selectedTeam = null
            },
            onPlayerAction = { user, action ->
                when (action) {
                    PlayerAction.FRIEND_REQUEST -> playerInteractionComponent.sendFriendRequest(user)
                    PlayerAction.FOLLOW -> playerInteractionComponent.followUser(user)
                    PlayerAction.UNFOLLOW -> playerInteractionComponent.unfollowUser(user)
                }
            }
        )
    }
}
