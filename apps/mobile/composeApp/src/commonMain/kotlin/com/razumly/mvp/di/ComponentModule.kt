package com.razumly.mvp.di

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.Message.DefaultMessagesComponent
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.presentation.RootComponent
import com.razumly.mvp.eventCreate.DefaultCreateEventComponent
import com.razumly.mvp.eventSearch.SearchEventListComponent
import com.razumly.mvp.home.DefaultHomeComponent
import com.razumly.mvp.matchDetailScreen.DefaultMatchContentComponent
import com.razumly.mvp.profile.DefaultProfileComponent
import com.razumly.mvp.eventDetailScreen.DefaultEventContentComponent
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
            mvpRepository = get(),
            onNavigateToHome = onNavigateToHome
        )
    }

    factory { (componentContext: ComponentContext, onNavigateToLogin: () -> Unit) ->
        DefaultHomeComponent(
            componentContext = componentContext,
            onNavigateToLogin = onNavigateToLogin
            )
    }

    factory { (componentContext: ComponentContext, selectedMatch: MatchWithRelations) ->
        DefaultMatchContentComponent(
            componentContext = componentContext,
            mvpRepository = get(),
            selectedMatch = selectedMatch,
        )
    }

    factory {
        (
            componentContext: ComponentContext,
            event: EventAbs,
            onMatchSelected: (MatchWithRelations) -> Unit,
        ) ->
            DefaultEventContentComponent(
                componentContext = componentContext,
                mvpRepository = get(),
                event = event,
                onMatchSelected = onMatchSelected,
            )
    }

    factory { (componentContext: ComponentContext, onCreatedEvent: () -> Unit) ->
        DefaultCreateEventComponent(
            componentContext = componentContext,
            mvpRepository = get(),
            locationTracker = get(),
            onEventCreated = onCreatedEvent
        )
    }

    factory {
        (
            componentContext: ComponentContext,
            onEventSelected: (event: EventAbs) -> Unit,
        ) ->
            SearchEventListComponent(
                componentContext = componentContext,
                mvpRepository = get(),
                locationTracker = get(),
                onEventSelected = onEventSelected
            )
    }

    factory {
        (
            componentContext: ComponentContext,
            onEventSelected: (tournamentId: String) -> Unit
        ) ->
        DefaultMessagesComponent(
            componentContext = componentContext,
            mvpRepository = get(),
            onEventSelected = onEventSelected
        )
    }

    factory { (componentContext: ComponentContext, onNavigateToLogin: () -> Unit) ->
        DefaultProfileComponent(
            componentContext = componentContext,
            mvpRepository = get(),
            onNavigateToLogin = onNavigateToLogin
        )
    }
}