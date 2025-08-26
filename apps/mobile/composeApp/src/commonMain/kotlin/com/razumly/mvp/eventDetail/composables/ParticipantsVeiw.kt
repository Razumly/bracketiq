package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.background
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.PlayerInteractionComponent
import com.razumly.mvp.core.presentation.composables.PlayerCardWithActions
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import org.koin.mp.KoinPlatform.getKoin

@Composable
fun ParticipantsView(
    showFab: (Boolean) -> Unit,
    onNavigateToChat: (ChatGroupWithRelations) -> Unit
) {
    val component = LocalTournamentComponent.current
    val divisionTeams by component.divisionTeams.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val participants = selectedEvent.players
    val teamSignup = selectedEvent.event.teamSignup
    val navPadding = LocalNavBarPadding.current
    val lazyColumnState = rememberLazyListState()
    val isScrollingUp by lazyColumnState.isScrollingUp()
    val popUpHandler = LocalPopupHandler.current
    val loadingHandler = LocalLoadingHandler.current

    val playerInteractionComponent = remember {
        getKoin().get<PlayerInteractionComponent>()
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
        item(key = "header") {
            Text("Participants", style = MaterialTheme.typography.titleLarge)
        }

        if (teamSignup) {
            items(
                divisionTeams.values.toList(),
                key = { it.team.id },
            ) { team ->
                TeamCard(team)
            }
        } else {
            items(participants, key = { it.id }) { participant ->
                PlayerCardWithActions(
                    player = participant,
                    currentUser = currentUser,
                    onMessage = { user ->
                        playerInteractionComponent.createDirectMessage(user) { chat ->
                            onNavigateToChat(chat)
                        }
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
