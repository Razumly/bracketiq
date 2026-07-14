package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.repositories.SeededEventTemplateDraft
import kotlinx.serialization.Serializable

@Serializable
enum class OrganizationDetailTab {
    OVERVIEW,
    REVIEWS,
    EVENTS,
    TEAMS,
    RENTALS,
    STORE,
}

@Serializable
enum class EventDetailInitialTab {
    DEFAULT,
    SCHEDULE,
}

@Serializable
sealed class AppConfig {
    @Serializable
    data object Splash : AppConfig()

    @Serializable
    data object Login : AppConfig()

    @Serializable
    data object ProfileCompletion : AppConfig()

    @Serializable
    data class EventDetail(
        val eventId: String,
        val initialTab: EventDetailInitialTab = EventDetailInitialTab.DEFAULT,
    ) : AppConfig()

    @Serializable
    data class MatchDetail(
        val matchId: String,
        val eventId: String,
    ) : AppConfig()

    @Serializable
    data object ChatList : AppConfig()

    @Serializable
    data class Chat(
        val messageUserId: String? = null,
        val chatId: String? = null,
    ) : AppConfig()

    @Serializable
    data class Create(
        val seed: SeededEventTemplateDraft? = null,
        val rentalBookingId: String? = null,
        val rentalBookingItems: List<RentalBookingItemManifest> = emptyList(),
    ) : AppConfig()

    @Serializable
    data object ProfileHome : AppConfig()

    @Serializable
    data object ProfileInvites : AppConfig()

    @Serializable
    data object Schedule : AppConfig()

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
        val freeAgentIds: List<String>,
        val eventId: String?,
        val selectedFreeAgentId: String? = null,
    ) : AppConfig()

    @Serializable
    data object Events : AppConfig()

    @Serializable
    data object RefundManager : AppConfig()
}
