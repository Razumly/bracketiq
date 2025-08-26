package com.razumly.mvp.di

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.chat.ChatGroupComponent
import com.razumly.mvp.chat.ChatListComponent
import com.razumly.mvp.chat.DefaultChatGroupComponent
import com.razumly.mvp.chat.DefaultChatListComponent
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.DefaultPlayerInteractionComponent
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.PlayerInteractionComponent
import com.razumly.mvp.core.presentation.RootComponent
import com.razumly.mvp.core.presentation.RootComponent.DeepLinkNav
import com.razumly.mvp.eventCreate.CreateEventComponent
import com.razumly.mvp.eventCreate.DefaultCreateEventComponent
import com.razumly.mvp.eventDetail.DefaultEventDetailComponent
import com.razumly.mvp.eventDetail.EventDetailComponent
import com.razumly.mvp.eventManagement.DefaultEventManagementComponent
import com.razumly.mvp.eventManagement.EventManagementComponent
import com.razumly.mvp.eventSearch.DefaultEventSearchComponent
import com.razumly.mvp.eventSearch.EventSearchComponent
import com.razumly.mvp.matchDetail.DefaultMatchContentComponent
import com.razumly.mvp.matchDetail.MatchContentComponent
import com.razumly.mvp.profile.DefaultProfileComponent
import com.razumly.mvp.profile.ProfileComponent
import com.razumly.mvp.profile.profileDetails.DefaultProfileDetailsComponent
import com.razumly.mvp.profile.profileDetails.ProfileDetailsComponent
import com.razumly.mvp.refundManager.DefaultRefundManagerComponent
import com.razumly.mvp.refundManager.RefundManagerComponent
import com.razumly.mvp.teamManagement.DefaultTeamManagementComponent
import com.razumly.mvp.teamManagement.TeamManagementComponent
import com.razumly.mvp.userAuth.AuthComponent
import com.razumly.mvp.userAuth.DefaultAuthComponent
import org.koin.dsl.module

val componentModule = module {
    factory { (componentContext: ComponentContext, deepLinkNav: DeepLinkNav?) ->
        RootComponent(
            componentContext = componentContext,
            permissionsController = get(),
            locationTracker = get(),
            deepLinkNavStart = deepLinkNav,
            userRepository = get(),
        )
    }

    factory<AuthComponent> { (componentContext: ComponentContext, navHandler: INavigationHandler) ->
        DefaultAuthComponent(
            componentContext = componentContext,
            userRepository = get(),
            navigationHandler = navHandler,
        )
    }

    factory<MatchContentComponent> { (componentContext: ComponentContext, selectedMatch: MatchWithRelations, selectedTournament: Tournament) ->
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

    factory<EventDetailComponent> { (componentContext: ComponentContext, event: EventAbs, navHandler: INavigationHandler) ->
        DefaultEventDetailComponent(
            componentContext = componentContext,
            event = event,
            eventAbsRepository = get(),
            userRepository = get(),
            matchRepository = get(),
            teamRepository = get(),
            fieldRepository = get(),
            billingRepository = get(),
            imageRepository = get(),
            notificationsRepository = get(),
            navigationHandler = navHandler,
        )
    }

    factory<CreateEventComponent> { (componentContext: ComponentContext, onCreatedEvent: () -> Unit) ->
        DefaultCreateEventComponent(
            componentContext = componentContext,
            onEventCreated = onCreatedEvent,
            userRepository = get(),
            eventRepository = get(),
            fieldRepository = get(),
            billingRepository = get(),
            imageRepository = get()
        )
    }

    factory<EventSearchComponent> { (componentContext: ComponentContext, eventId: String?, tournamentId: String?, navHandler: INavigationHandler) ->
        DefaultEventSearchComponent(
            componentContext = componentContext,
            locationTracker = get(),
            eventAbsRepository = get(),
            eventRepository = get(),
            tournamentRepository = get(),
            eventId = eventId,
            tournamentId = tournamentId,
            navigationHandler = navHandler
        )
    }

    factory<ChatListComponent> { (componentContext: ComponentContext, navHandler: INavigationHandler) ->
        DefaultChatListComponent(
            componentContext = componentContext,
            chatGroupRepository = get(),
            userRepository = get(),
            navigationHandler = navHandler
        )
    }

    factory<ChatGroupComponent> { (componentContext: ComponentContext, user: UserData?, chat: ChatGroupWithRelations?) ->
        DefaultChatGroupComponent(
            componentContext = componentContext,
            messageUser = user,
            chatGroup = chat,
            userRepository = get(),
            messagesRepository = get(),
            pushNotificationsRepository = get(),
            chatGroupRepository = get(),
        )
    }

    factory<ProfileComponent> { (componentContext: ComponentContext, navHandler: INavigationHandler) ->
        DefaultProfileComponent(
            componentContext = componentContext,
            userRepository = get(),
            billingRepository = get(),
            navigationHandler = navHandler,
        )
    }

    factory<TeamManagementComponent> { (componentContext: ComponentContext, freeAgents: List<String>, selectedEvent: EventAbs?, navHandler: INavigationHandler) ->
        DefaultTeamManagementComponent(
            componentContext = componentContext,
            teamRepository = get(),
            userRepository = get(),
            freeAgents = freeAgents,
            selectedEvent = selectedEvent,
            eventAbsRepository = get(),
            navigationHandler = navHandler,
        )
    }

    factory<RefundManagerComponent> { (componentContext: ComponentContext) ->
        DefaultRefundManagerComponent(
            componentContext = componentContext,
            userRepository = get(),
            billingRepository = get(),
        )
    }

    factory<EventManagementComponent> { (componentContext: ComponentContext, navHandler: INavigationHandler) ->
        DefaultEventManagementComponent(
            componentContext = componentContext,
            eventAbsRepository = get(),
            navigationHandler = navHandler
        )
    }

    factory<ProfileDetailsComponent> { params ->
        DefaultProfileDetailsComponent(
            componentContext = params.get(),
            userRepository = get(),
            onNavigateBack = params.get()
        )
    }

    factory<PlayerInteractionComponent> { params ->
        DefaultPlayerInteractionComponent(
            componentContext = params.get(),
            userRepository = get(),
            chatRepository = get()
        )
    }
}