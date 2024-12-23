package com.razumly.mvp.di

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.DefaultHomeComponent
import com.razumly.mvp.core.presentation.RootComponent
import com.razumly.mvp.eventContent.presentation.DefaultMatchContentComponent
import com.razumly.mvp.eventContent.presentation.DefaultTournamentContentComponent
import com.razumly.mvp.eventCreate.presentation.DefaultCreateEventComponent
import com.razumly.mvp.eventFollowing.presentation.FollowingEventListComponent
import com.razumly.mvp.eventSearch.presentation.SearchEventListComponent
import com.razumly.mvp.profile.presentation.DefaultProfileComponent
import com.razumly.mvp.userAuth.presentation.loginScreen.DefaultLoginComponent
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
        DefaultLoginComponent(
            componentContext = componentContext,
            appwriteRepository = get(),
            onNavigateToHome = onNavigateToHome
        )
    }

    factory { (componentContext: ComponentContext) ->
        DefaultHomeComponent(componentContext = componentContext)
    }

    factory { (componentContext: ComponentContext, selectedMatch: MatchMVP) ->
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
            onMatchSelected: (MatchMVP) -> Unit
        ) ->
        DefaultTournamentContentComponent(
            componentContext = componentContext,
            appwriteRepository = get(),
            tournamentId = tournamentId,
            onMatchSelected = onMatchSelected
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

    factory { (componentContext: ComponentContext, onTournamentSelected: (String) -> Unit) ->
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