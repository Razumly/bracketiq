package com.razumly.mvp.android

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import kotlinx.serialization.Serializable


interface Route

@Serializable
data object HomeRoute : Route

@Serializable
data object LoginRoute : Route

@Serializable
data class TournamentDetailRoute(
    val tournamentId: String,
) : Route

@Serializable
data object EventListRoute : Route

@Serializable
data object FollowingRoute : Route

@Serializable
data object CreateRoute : Route

@Serializable
data object ProfileRoute : Route

@Serializable
data class MatchDetailRoute(
    val match: MatchMVP,
) : Route