package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypeModifiers.validTournament
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.flow.Flow

class AppwriteRepositoryFake(
    private val doubleElinament: Boolean = false,
    private val teamsCount: Int = 30,
    private val divisions: List<String> = listOf("B", "BB", "A", "AA", "Open"),
    private val days: Int = 1,
    private val fieldCount: Int = 8, override val matchUpdates: Flow<MatchWithRelations>
) : IMVPRepository {
    override suspend fun getTournament(tournamentId: String): Tournament {
        return Tournament.validTournament(
            tournamentId,
            doubleElinament,
            teamsCount,
            fieldCount,
            days,
            divisions
        )
    }

    override suspend fun getTeams(
        tournamentId: String,
        update: Boolean
    ): Map<String, TeamWithPlayers> {
        TODO("Not yet implemented")
    }

    override suspend fun getMatches(
        tournamentId: String,
        update: Boolean
    ): Map<String, MatchWithRelations> {
        TODO("Not yet implemented")
    }

    override suspend fun getMatch(matchId: String, update: Boolean): MatchWithRelations? {
        TODO("Not yet implemented")
    }

    override suspend fun getFields(tournamentId: String, update: Boolean): Map<String, Field> {
        TODO("Not yet implemented")
    }

    override suspend fun getPlayers(tournamentId: String, update: Boolean): Map<String, UserData> {
        TODO("Not yet implemented")
    }

    override suspend fun getEvents(bounds: Bounds): List<EventAbs> {
        TODO("Not yet implemented")
    }

    override suspend fun getCurrentUser(update: Boolean): UserData? {
        TODO("Not yet implemented")
    }

    override suspend fun login(email: String, password: String): UserData? {
        TODO("Not yet implemented")
    }

    override suspend fun logout() {
        TODO("Not yet implemented")
    }

    override suspend fun subscribeToMatches() {
        TODO("Not yet implemented")
    }

    override suspend fun unsubscribeFromRealtime() {
        TODO("Not yet implemented")
    }

    override suspend fun updateMatch(match: MatchWithRelations) {
        TODO("Not yet implemented")
    }

    override suspend fun createTournament(newTournament: Tournament) {
        TODO("Not yet implemented")
    }
}