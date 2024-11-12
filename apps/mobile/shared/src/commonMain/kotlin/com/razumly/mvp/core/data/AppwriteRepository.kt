package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Match
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.flow.Flow

interface IAppwriteRepository {
    val matchUpdates: Flow<Match>
    suspend fun getTournament(tournamentId: String): Tournament?
    suspend fun getTeams(
        tournamentId: String,
        currentPlayers: Map<String, UserData>
    ): Map<String, Team>

    suspend fun getMatches(
        tournamentId: String,
        currentTeams: Map<String, Team>,
        currentMatches: MutableMap<String, Match>
    )

    suspend fun getFields(
        tournamentId: String,
        currentMatches: Map<String, Match>
    ): Map<String, Field>

    suspend fun getPlayers(tournamentId: String): Map<String, UserData>
    suspend fun getEvents(bounds: Bounds): List<EventAbs>
    suspend fun getCurrentUser(): UserData?
    suspend fun login(email: String, password: String): UserData?
    suspend fun logout()
    suspend fun subscribeToMatches(tournament: Tournament)
    suspend fun unsubscribeFromMatches()
}

expect class AppwriteRepositoryImplementation : IAppwriteRepository