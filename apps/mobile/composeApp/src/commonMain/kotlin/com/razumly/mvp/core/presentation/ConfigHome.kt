package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Tournament
import kotlinx.serialization.Serializable

@Serializable
sealed class ConfigHome{
    @Serializable
    data class TournamentDetail(
        val tournamentId: String
    ) : ConfigHome()

    @Serializable
    data class MatchDetail(
        val match: MatchMVP
    ) : ConfigHome()

    @Serializable
    data object Following : ConfigHome()

    @Serializable
    data object Create : ConfigHome()

    @Serializable
    data object Profile : ConfigHome()

    @Serializable
    data object Search : ConfigHome()
}

enum class Tab {
    EventList, Following, Create, Profile
}