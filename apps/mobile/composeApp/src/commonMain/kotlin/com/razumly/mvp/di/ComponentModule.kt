package com.razumly.mvp.di

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.chat.DefaultChatGroupComponent
import com.razumly.mvp.chat.DefaultChatListComponent
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.presentation.RootComponent
import com.razumly.mvp.core.presentation.RootComponent.DeepLinkNav
import com.razumly.mvp.eventCreate.DefaultCreateEventComponent
import com.razumly.mvp.eventDetail.DefaultEventDetailComponent
import com.razumly.mvp.eventManagement.DefaultEventManagementComponent
import com.razumly.mvp.eventSearch.DefaultEventSearchComponent
import com.razumly.mvp.home.DefaultHomeComponent
import com.razumly.mvp.matchDetail.DefaultMatchContentComponent
import com.razumly.mvp.profile.DefaultProfileComponent
import com.razumly.mvp.refundManager.DefaultRefundManagerComponent
import com.razumly.mvp.teamManagement.DefaultTeamManagementComponent
import com.razumly.mvp.userAuth.DefaultAuthComponent
import org.koin.dsl.module

val componentModule = module {
    factory { (componentContext: ComponentContext, deepLinkNav: DeepLinkNav?) ->
        RootComponent(
            componentContext = componentContext,
            permissionsController = get(),
            locationTracker = get(),
            deepLinkNav = deepLinkNav
        )
    }

    factory { (componentContext: ComponentContext, onNavigateToHome: () -> Unit) ->
        DefaultAuthComponent(
            componentContext = componentContext,
            userRepository = get(),
            onNavigateToHome = onNavigateToHome
        )
    }

    factory { (componentContext: ComponentContext, deepLinkNav: DeepLinkNav?, onNavigateToLogin: () -> Unit) ->
        DefaultHomeComponent(
            componentContext = componentContext,
            onNavigateToLogin = onNavigateToLogin,
            deepLinkNav = deepLinkNav,
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

    factory { (componentContext: ComponentContext, event: EventAbs, onMatchSelected: (MatchWithRelations, Tournament) -> Unit, onNavigateToTeamSettings: (freeAgents: List<String>, event: EventAbs?) -> Unit, onBack: () -> Unit) ->
        DefaultEventDetailComponent(
            componentContext = componentContext,
            event = event,
            onMatchSelected = onMatchSelected,
            eventAbsRepository = get(),
            userRepository = get(),
            matchRepository = get(),
            teamRepository = get(),
            fieldRepository = get(),
            onNavigateToTeamSettings = onNavigateToTeamSettings,
            onBack = onBack,
            billingRepository = get(),
        )
    }

    factory { (componentContext: ComponentContext, onCreatedEvent: () -> Unit) ->
        DefaultCreateEventComponent(
            componentContext = componentContext,
            onEventCreated = onCreatedEvent,
            userRepository = get(),
            eventRepository = get(),
            fieldRepository = get(),
            billingRepository = get()
        )
    }

    factory { (componentContext: ComponentContext, onEventSelected: (event: EventAbs) -> Unit, eventId: String?, tournamentId: String?) ->
        DefaultEventSearchComponent(
            componentContext = componentContext,
            locationTracker = get(),
            onEventSelected = onEventSelected,
            eventAbsRepository = get(),
            eventRepository = get(),
            tournamentRepository = get(),
            eventId = eventId,
            tournamentId = tournamentId
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

    factory { (componentContext: ComponentContext, onNavigateToLogin: () -> Unit, onNavigateToTeamSettings: (List<String>, EventAbs?) -> Unit, onNavigateToEvents: () -> Unit, onNavigateToRefundManager: () -> Unit) ->
        DefaultProfileComponent(
            componentContext = componentContext,
            onNavigateToLogin = onNavigateToLogin,
            onNavigateToTeamSettings = onNavigateToTeamSettings,
            userRepository = get(),
            onNavigateToEvents = onNavigateToEvents,
            billingRepository = get(),
            onNavigateToRefundManager = onNavigateToRefundManager,
        )
    }

    factory { (componentContext: ComponentContext, freeAgents: List<String>, selectedEvent: EventAbs?, onBack: () -> Unit) ->
        DefaultTeamManagementComponent(
            componentContext = componentContext,
            teamRepository = get(),
            userRepository = get(),
            freeAgents = freeAgents,
            selectedEvent = selectedEvent,
            onBack = onBack,
            eventAbsRepository = get()
        )
    }

    factory { (componentContext: ComponentContext) ->
        DefaultRefundManagerComponent(
            componentContext = componentContext,
            userRepository = get(),
            billingRepository = get(),
        )
    }

    factory { (componentContext: ComponentContext, onEventSelected: (event: EventAbs) -> Unit, onBack: () -> Unit) ->
        DefaultEventManagementComponent(
            componentContext = componentContext,
            onEventSelected = onEventSelected,
            eventAbsRepository = get(),
            onBack = onBack,
        )
    }
}