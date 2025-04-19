package com.razumly.mvp.di

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.presentation.RootComponent
import com.razumly.mvp.eventCreate.CreateEventComponent
import com.razumly.mvp.eventCreate.DefaultCreateEventComponent
import com.razumly.mvp.eventFollowing.FollowingEventListComponent
import com.razumly.mvp.eventSearch.SearchEventListComponent
import com.razumly.mvp.home.DefaultHomeComponent
import com.razumly.mvp.matchDetail.DefaultMatchContentComponent
import com.razumly.mvp.matchDetail.MatchContentComponent
import com.razumly.mvp.profile.DefaultProfileComponent
import com.razumly.mvp.profile.ProfileComponent
import com.razumly.mvp.eventDetail.DefaultEventContentComponent
import com.razumly.mvp.eventDetail.EventContentComponent
import com.razumly.mvp.userAuth.loginScreen.AuthComponent
import org.koin.dsl.bind
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
    } bind AuthComponent::class

    factory { (componentContext: ComponentContext, onNavigateToLogin: () -> Unit) ->
        DefaultHomeComponent(
            componentContext = componentContext,
            onNavigateToLogin = onNavigateToLogin
        )
    }

    factory { (componentContext: ComponentContext, selectedMatch: MatchWithRelations, name: String) ->
        DefaultMatchContentComponent(
            componentContext = componentContext,
            mvpRepository = get(),
            selectedMatch = selectedMatch,
        )
    } bind MatchContentComponent::class

    factory {
        (
            componentContext: ComponentContext,
            tournamentId: String,
            onMatchSelected: (MatchWithRelations) -> Unit,
            name: String,
        ) ->
        DefaultEventContentComponent(
            componentContext = componentContext,
            mvpRepository = get(),
            tournamentId = tournamentId,
            onMatchSelected = onMatchSelected,
        )
    } bind EventContentComponent::class

    factory { (componentContext: ComponentContext, onEventCreated: () -> Unit) ->
        DefaultCreateEventComponent(
            componentContext = componentContext,
            mvpRepository = get(),
            locationTracker = get(),
            onEventCreated
        )
    } bind CreateEventComponent::class

    factory { (componentContext: ComponentContext, onTournamentSelected: (String) -> Unit) ->
        SearchEventListComponent(
            componentContext = componentContext,
            mvpRepository = get(),
            locationTracker = get(),
            onEventSelected = onTournamentSelected
        )
    } bind EventListComponent::class

    factory { (componentContext: ComponentContext, onTournamentSelected: (EventAbs) -> Unit) ->
        FollowingEventListComponent(
            componentContext = componentContext,
            mvpRepository = get(),
            onTournamentSelected = onTournamentSelected
        )
    } bind EventListComponent::class

    factory { (componentContext: ComponentContext, onNavigateToLogin: () -> Unit) ->
        DefaultProfileComponent(
            componentContext = componentContext,
            mvpRepository = get(),
            onNavigateToLogin = onNavigateToLogin
        )
    } bind ProfileComponent::class

}