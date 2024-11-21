package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.flow.Flow

interface IAppwriteRepository {
    val matchUpdates: Flow<MatchWithRelations>
    suspend fun getTournament(tournamentId: String): Tournament?
    suspend fun getTeams(
        tournamentId: String, update: Boolean = false
    ): Map<String, TeamWithPlayers>

    suspend fun getMatches(
        tournamentId: String,
        update: Boolean = false
    ): Map<String, MatchWithRelations>

    suspend fun getMatch(matchId: String, update: Boolean = false): MatchWithRelations?

    suspend fun getFields(tournamentId: String, update: Boolean = false): Map<String, Field>

    suspend fun getPlayers(tournamentId: String, update: Boolean = false): Map<String, UserData>
    suspend fun getEvents(bounds: Bounds): List<EventAbs>
    suspend fun getCurrentUser(update: Boolean = false): UserData?
    suspend fun login(email: String, password: String): UserData?
    suspend fun logout()
    suspend fun subscribeToMatches()
    suspend fun unsubscribeFromRealtime()
    suspend fun updateMatch(match: MatchWithRelations)
}

expect class AppwriteRepositoryImplementation : IAppwriteRepository