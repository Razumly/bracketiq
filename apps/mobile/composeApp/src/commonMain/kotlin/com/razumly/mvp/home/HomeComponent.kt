package com.razumly.mvp.home

import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.value.Value
import com.razumly.mvp.Message.MessagesComponent
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.eventCreate.CreateEventComponent
import com.razumly.mvp.eventDetailScreen.EventContentComponent
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.eventSearch.SearchEventListComponent
import com.razumly.mvp.matchDetailScreen.MatchContentComponent
import com.razumly.mvp.profile.ProfileComponent
import com.razumly.mvp.teamManagement.TeamManagementComponent
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable


interface HomeComponent {
    val childStack: Value<ChildStack<*, Child>>
    val selectedPage: StateFlow<Config>
    fun onTabSelected(page: Config)

    fun onBack()

    sealed class Child {
        data class Search(
            val component: SearchEventListComponent,
            val mapComponent: MapComponent
        ) : Child()
        data class EventContent(val component: EventContentComponent) : Child()
        data class MatchContent(val component: MatchContentComponent) : Child()
        data class Messages(val component: MessagesComponent) : Child()
        data class Create(val component: CreateEventComponent) : Child()
        data class Profile(val component: ProfileComponent) : Child()
        data class Teams(val component: TeamManagementComponent) : Child()
    }

    @Serializable
    sealed class Config{
        @Serializable
        data class EventDetail(
            val event: EventAbs,
        ) : Config()

        @Serializable
        data class MatchDetail(
            val match: MatchWithRelations,
            val tournament: Tournament,
        ) : Config()

        @Serializable
        data object Messages : Config()

        @Serializable
        data object Create : Config()

        @Serializable
        data object Profile : Config()

        @Serializable
        data object Search : Config()

        @Serializable
        data class Teams(val freeAgents: List<String>, val event: EventAbs?) : Config()
    }
}