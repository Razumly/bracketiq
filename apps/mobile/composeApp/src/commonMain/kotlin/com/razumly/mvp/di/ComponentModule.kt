package com.razumly.mvp.di

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.chat.DefaultChatGroupComponent
import com.razumly.mvp.chat.DefaultChatListComponent
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.presentation.RootComponent
import com.razumly.mvp.eventCreate.DefaultCreateEventComponent
import com.razumly.mvp.eventDetail.DefaultEventDetailComponent
import com.razumly.mvp.eventSearch.DefaultSearchEventListComponent
import com.razumly.mvp.home.DefaultHomeComponent
import com.razumly.mvp.matchDetail.DefaultMatchContentComponent
import com.razumly.mvp.profile.DefaultProfileComponent
import com.razumly.mvp.teamManagement.DefaultTeamManagementComponent
import com.razumly.mvp.userAuth.DefaultAuthComponent
import org.koin.dsl.module

val componentModule = module {
    single { (componentContext: ComponentContext) ->
        RootComponent(
            componentContext = componentContext,
            permissionsController = get(),
            locationTracker = get()
        )
    }

    factory { (componentContext: ComponentContext, onNavigateToHome: () -> Unit) ->
        DefaultAuthComponent(
            componentContext = componentContext,
            userRepository = get(),
            onNavigateToHome = onNavigateToHome
        )
    }

    factory { (componentContext: ComponentContext, onNavigateToLogin: () -> Unit) ->
        DefaultHomeComponent(
            componentContext = componentContext,
            onNavigateToLogin = onNavigateToLogin
        )
    }

    factory { (componentContext: ComponentContext, selectedMatch: MatchWithRelations, selectedTournament: Tournament) ->
        DefaultMatchContentComponent(
            componentContext = componentContext,
            selectedMatch = selectedMatch,
            selectedTournament = selectedTournament,
            tournamentRepository = get(),
            matchRepository = get(),
            userRepository = get(),
            teamRepository = get(),
        )
    }

    factory { (
                  componentContext: ComponentContext,
                  event: EventAbs,
                  onMatchSelected: (MatchWithRelations, Tournament) -> Unit,
                  onNavigateToTeamSettings: (freeAgents: List<String>, event: EventAbs?) -> Unit
              ) ->
        DefaultEventDetailComponent(
            componentContext = componentContext,
            event = event,
            onMatchSelected = onMatchSelected,
            eventAbsRepository = get(),
            userRepository = get(),
            matchRepository = get(),
            teamRepository = get(),
            onNavigateToTeamSettings = onNavigateToTeamSettings
        )
    }

    factory { (componentContext: ComponentContext, onCreatedEvent: () -> Unit) ->
        DefaultCreateEventComponent(
            componentContext = componentContext,
            locationTracker = get(),
            onEventCreated = onCreatedEvent,
            userRepository = get(),
            eventRepository = get(),
        )
    }

    factory { (
                  componentContext: ComponentContext,
                  onEventSelected: (event: EventAbs) -> Unit,
              ) ->
        DefaultSearchEventListComponent(
            componentContext = componentContext,
            locationTracker = get(),
            onEventSelected = onEventSelected,
            eventAbsRepository = get()
        )
    }

    factory { (componentContext: ComponentContext, onNavigateToChat: (chat: ChatGroupWithRelations) -> Unit) ->
        DefaultChatListComponent(
            componentContext = componentContext,
            chatGroupRepository = get(),
            userRepository = get(),
            onNavigateToChat = onNavigateToChat
        )
    }

    factory { (componentContext: ComponentContext, chatGroup: ChatGroupWithRelations) ->
        DefaultChatGroupComponent(
            componentContext = componentContext,
            userRepository = get(),
            messagesRepository = get(),
            pushNotificationsRepository = get(),
            chatGroupInit = chatGroup,
            chatGroupRepository = get(),
        )
    }

    factory { (componentContext: ComponentContext, onNavigateToLogin: () -> Unit, onNavigateToTeamSettings: (List<String>, EventAbs?) -> Unit) ->
        DefaultProfileComponent(
            componentContext = componentContext,
            onNavigateToLogin = onNavigateToLogin,
            onNavigateToTeamSettings = onNavigateToTeamSettings,
            userRepository = get(),
            mvpDatabase = get()
        )
    }

    factory { (componentContext: ComponentContext, freeAgents: List<String>, selectedEvent: EventAbs?) ->
        DefaultTeamManagementComponent(
            componentContext = componentContext,
            teamRepository = get(),
            userRepository = get(),
            freeAgents = freeAgents,
            selectedEvent = selectedEvent
        )
    }
}