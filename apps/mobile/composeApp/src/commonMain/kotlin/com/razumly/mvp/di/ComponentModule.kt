package com.razumly.mvp.di

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.chat.ChatGroupComponent
import com.razumly.mvp.chat.ChatListComponent
import com.razumly.mvp.chat.DefaultChatGroupComponent
import com.razumly.mvp.chat.DefaultChatListComponent
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.DefaultPlayerInteractionComponent
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.PlayerInteractionComponent
import com.razumly.mvp.core.presentation.RentalCreateContext
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
import com.razumly.mvp.organizationDetail.DefaultOrganizationDetailComponent
import com.razumly.mvp.organizationDetail.OrganizationDetailComponent
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
            pushNotificationsRepository = get(),
        )
    }

    factory<AuthComponent> { (componentContext: ComponentContext, navHandler: INavigationHandler) ->
        DefaultAuthComponent(
            componentContext = componentContext,
            userRepository = get(),
            navigationHandler = navHandler,
        )
    }

    factory<MatchContentComponent> { (componentContext: ComponentContext, selectedMatch: MatchWithRelations, selectedEvent: Event) ->
        DefaultMatchContentComponent(
            componentContext = componentContext,
            selectedMatch = selectedMatch,
            selectedEvent = selectedEvent,
            eventRepository = get(),
            matchRepository = get(),
            userRepository = get(),
            teamRepository = get(),
        )
    }

    factory<EventDetailComponent> { (componentContext: ComponentContext, event: Event, navHandler: INavigationHandler) ->
        DefaultEventDetailComponent(
            componentContext = componentContext,
            event = event,
            eventRepository = get(),
            userRepository = get(),
            matchRepository = get(),
            teamRepository = get(),
            sportsRepository = get(),
            fieldRepository = get(),
            billingRepository = get(),
            imageRepository = get(),
            notificationsRepository = get(),
            navigationHandler = navHandler,
        )
    }

    factory<CreateEventComponent> { (componentContext: ComponentContext, rentalContext: RentalCreateContext?, onCreatedEvent: (Event) -> Unit) ->
        DefaultCreateEventComponent(
            componentContext = componentContext,
            onEventCreated = onCreatedEvent,
            rentalContext = rentalContext,
            userRepository = get(),
            eventRepository = get(),
            matchRepository = get(),
            fieldRepository = get(),
            sportsRepository = get(),
            billingRepository = get(),
            imageRepository = get()
        )
    }

    factory<EventSearchComponent> { (componentContext: ComponentContext, eventId: String?, navHandler: INavigationHandler) ->
        DefaultEventSearchComponent(
            componentContext = componentContext,
            locationTracker = get(),
            eventRepository = get(),
            matchRepository = get(),
            billingRepository = get(),
            fieldRepository = get(),
            eventId = eventId,
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
            eventRepository = get(),
            teamRepository = get(),
            navigationHandler = navHandler,
        )
    }

    factory<OrganizationDetailComponent> { (
        componentContext: ComponentContext,
        organizationId: String,
        initialTab: com.razumly.mvp.core.presentation.OrganizationDetailTab,
        navHandler: INavigationHandler,
    ) ->
        DefaultOrganizationDetailComponent(
            componentContext = componentContext,
            organizationId = organizationId,
            initialTab = initialTab,
            billingRepository = get(),
            eventRepository = get(),
            teamRepository = get(),
            fieldRepository = get(),
            matchRepository = get(),
            userRepository = get(),
            navigationHandler = navHandler,
        )
    }

    factory<TeamManagementComponent> { (
        componentContext: ComponentContext,
        freeAgents: List<String>,
        selectedEvent: Event?,
        selectedFreeAgentId: String?,
        navHandler: INavigationHandler,
    ) ->
        DefaultTeamManagementComponent(
            componentContext = componentContext,
            teamRepository = get(),
            userRepository = get(),
            freeAgents = freeAgents,
            selectedEvent = selectedEvent,
            selectedFreeAgentId = selectedFreeAgentId,
            eventRepository = get(),
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
            eventRepository = get(),
            navigationHandler = navHandler,
            userRepository = get(),
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
