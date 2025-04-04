package com.razumly.mvp.di

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.Message.DefaultMessagesComponent
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.presentation.RootComponent
import com.razumly.mvp.eventCreate.DefaultCreateEventComponent
import com.razumly.mvp.eventDetailScreen.DefaultEventContentComponent
import com.razumly.mvp.eventSearch.SearchEventListComponent
import com.razumly.mvp.home.DefaultHomeComponent
import com.razumly.mvp.matchDetailScreen.DefaultMatchContentComponent
import com.razumly.mvp.profile.DefaultProfileComponent
import com.razumly.mvp.teamManagement.TeamManagementComponent
import com.razumly.mvp.userAuth.loginScreen.AuthComponent
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
        AuthComponent(
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

    factory {
        (
            componentContext: ComponentContext,
            event: EventAbs,
            onMatchSelected: (MatchWithRelations, Tournament) -> Unit,
            onNavigateToTeamSettings: (freeAgents: List<String>, event: EventAbs?) -> Unit
        ) ->
            DefaultEventContentComponent(
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
            tournamentRepository = get()
        )
    }

    factory {
        (
            componentContext: ComponentContext,
            onEventSelected: (event: EventAbs) -> Unit,
        ) ->
            SearchEventListComponent(
                componentContext = componentContext,
                locationTracker = get(),
                onEventSelected = onEventSelected,
                userRepository = get(),
                teamRepository = get(),
                eventAbsRepository = get()
            )
    }

    factory {
        (
            componentContext: ComponentContext,
            onEventSelected: (tournamentId: String) -> Unit
        ) ->
        DefaultMessagesComponent(
            componentContext = componentContext,
            onEventSelected = onEventSelected
        )
    }

    factory { (componentContext: ComponentContext, onNavigateToLogin: () -> Unit, onNavigateToTeamSettings: (List<String>, EventAbs?) -> Unit) ->
        DefaultProfileComponent(
            componentContext = componentContext,
            onNavigateToLogin = onNavigateToLogin,
            onNavigateToTeamSettings = onNavigateToTeamSettings,
            userRepository = get()
        )
    }

    factory { (componentContext: ComponentContext, freeAgents: List<String>, selectedEvent: EventAbs?) ->
        TeamManagementComponent(
            componentContext = componentContext,
            teamRepository = get(),
            userRepository = get(),
            freeAgents = freeAgents,
            selectedEvent = selectedEvent
        )
    }
}