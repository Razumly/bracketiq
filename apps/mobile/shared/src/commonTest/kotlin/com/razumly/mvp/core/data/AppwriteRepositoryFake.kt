package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypeModifiers.validTournament
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData

class AppwriteRepositoryFake(
    private val doubleElinament: Boolean = false,
    private val teamsCount: Int = 30,
    private val divisions: List<String> = listOf("B", "BB", "A", "AA", "Open"),
    private val days: Int = 1,
    private val fieldCount: Int = 8
) : IAppwriteRepository {
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
        currentPlayers: Map<String, UserData>
    ): Map<String, Team> {
        TODO("Not yet implemented")
    }

    override suspend fun getMatches(
        tournamentId: String,
        currentTeams: Map<String, Team>,
        currentMatches: MutableMap<String, MatchMVP>
    ) {
        TODO("Not yet implemented")
    }

    override suspend fun getFields(
        tournamentId: String,
        currentMatches: Map<String, MatchMVP>
    ): Map<String, Field> {
        TODO("Not yet implemented")
    }

    override suspend fun getPlayers(tournamentId: String): Map<String, UserData> {
        TODO("Not yet implemented")
    }

    override suspend fun getEvents(bounds: Bounds): List<EventAbs> {
        TODO("Not yet implemented")
    }

    override suspend fun getCurrentUser(): UserData? {
        TODO("Not yet implemented")
    }

    override suspend fun login(email: String, password: String): UserData? {
        TODO("Not yet implemented")
    }

    override suspend fun logout() {
        TODO("Not yet implemented")
    }

}