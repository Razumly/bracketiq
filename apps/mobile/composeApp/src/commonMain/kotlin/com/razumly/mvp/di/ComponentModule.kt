package com.razumly.mvp.di

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.presentation.RootComponent
import com.razumly.mvp.matchDetailScreen.DefaultMatchContentComponent
import com.razumly.mvp.tournamentDetailScreen.DefaultTournamentContentComponent
import com.razumly.mvp.eventCreate.DefaultCreateEventComponent
import com.razumly.mvp.eventFollowing.FollowingEventListComponent
import com.razumly.mvp.eventSearch.SearchEventListComponent
import com.razumly.mvp.home.DefaultHomeComponent
import com.razumly.mvp.profile.DefaultProfileComponent
import com.razumly.mvp.userAuth.loginScreen.DefaultLoginComponent
import org.koin.dsl.module

val componentModule = module {
    single { (componentContext: ComponentContext) ->
        RootComponent(
            componentContext = componentContext,
            permissionsController = get(),
            locationTracker = get()
        )
    }

    factory { (componentContext: ComponentContext, onNavigateToHome: (() -> Unit)?) ->
        DefaultLoginComponent(
            componentContext = componentContext,
            appwriteRepository = get(),
            onNavigateToHome = onNavigateToHome ?: {}
        )
    }

    factory { (componentContext: ComponentContext) ->
        DefaultHomeComponent(componentContext = componentContext)
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
            tournamentId: String,
            onMatchSelected: (MatchWithRelations) -> Unit,
        ) ->
            DefaultTournamentContentComponent(
                componentContext = componentContext,
                mvpRepository = get(),
                tournamentId = tournamentId,
                onMatchSelected = onMatchSelected,
            )
    }

    factory { (componentContext: ComponentContext) ->
        DefaultCreateEventComponent(
            componentContext = componentContext,
            appwriteRepository = get(),
            permissionsController = get(),
            locationTracker = get()
        )
    }

    factory {
        (
            componentContext: ComponentContext,
            onTournamentSelected: (tournamentId: String) -> Unit,
        ) ->
            SearchEventListComponent(
                componentContext = componentContext,
                appwriteRepository = get(),
                locationTracker = get(),
                onTournamentSelected = onTournamentSelected
            )
    }

    factory { (componentContext: ComponentContext, onTournamentSelected: (EventAbs) -> Unit) ->
        FollowingEventListComponent(
            componentContext = componentContext,
            mvpRepository = get(),
            onTournamentSelected = onTournamentSelected
        )
    }

    factory { (componentContext: ComponentContext) ->
        DefaultProfileComponent(
            componentContext = componentContext
        )
    }
}