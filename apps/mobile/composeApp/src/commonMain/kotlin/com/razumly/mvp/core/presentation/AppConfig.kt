package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.serialization.Serializable

@Serializable
enum class OrganizationDetailTab {
    OVERVIEW,
    EVENTS,
    TEAMS,
    RENTALS,
    STORE,
}

@Serializable
sealed class AppConfig {
    @Serializable
    data object Login : AppConfig()

    @Serializable
    data class EventDetail(
        val event: Event,
    ) : AppConfig()

    @Serializable
    data class MatchDetail(
        val match: MatchWithRelations,
        val event: Event,
    ) : AppConfig()

    @Serializable
    data object ChatList : AppConfig()

    @Serializable
    data class Chat(
        val user: UserData?,
        val chat: ChatGroupWithRelations?
    ) : AppConfig()

    @Serializable
    data class Create(
        val rentalContext: RentalCreateContext? = null,
    ) : AppConfig()

    @Serializable
    data object ProfileHome : AppConfig()

    @Serializable
    data object ProfileDetails : AppConfig()

    @Serializable
    data class Search(val eventId: String? = null) : AppConfig()

    @Serializable
    data class OrganizationDetail(
        val organizationId: String,
        val initialTab: OrganizationDetailTab = OrganizationDetailTab.OVERVIEW,
    ) : AppConfig()

    @Serializable
    data class Teams(
        val freeAgents: List<String>,
        val event: Event?,
        val selectedFreeAgentId: String? = null,
    ) : AppConfig()

    @Serializable
    data object Events : AppConfig()

    @Serializable
    data object RefundManager : AppConfig()
}
