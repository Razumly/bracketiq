package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import kotlinx.serialization.Serializable

@Serializable
sealed class AppConfig {
    @Serializable
    data object Login : AppConfig()

    @Serializable
    data class EventDetail(
        val event: EventAbs,
    ) : AppConfig()

    @Serializable
    data class MatchDetail(
        val match: MatchWithRelations,
        val tournament: Tournament,
    ) : AppConfig()

    @Serializable
    data object ChatList : AppConfig()

    @Serializable
    data class Chat(
        val chatGroup: ChatGroupWithRelations,
    ) : AppConfig()

    @Serializable
    data object Create : AppConfig()

    @Serializable
    data object ProfileHome : AppConfig()

    @Serializable
    data object ProfileDetails : AppConfig()

    @Serializable
    data class Search(val eventId: String? = null, val tournamentId: String? = null) : AppConfig()

    @Serializable
    data class Teams(val freeAgents: List<String>, val event: EventAbs?) : AppConfig()

    @Serializable
    data object Events : AppConfig()

    @Serializable
    data object RefundManager : AppConfig()
}