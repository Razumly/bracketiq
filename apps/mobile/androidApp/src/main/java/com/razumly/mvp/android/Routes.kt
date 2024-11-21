package com.razumly.mvp.android

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Tournament
import kotlinx.serialization.Serializable


@Serializable
data object HomeRoute

@Serializable
data object LoginRoute

@Serializable
data class TournamentDetailRoute(
    val tournamentId: String,
)

@Serializable
data object EventListRoute

@Serializable
data object FollowingRoute

@Serializable
data object PlayRoute

@Serializable
data object ProfileRoute

@Serializable
data class MatchDetailRoute(
    val match: MatchMVP,
)