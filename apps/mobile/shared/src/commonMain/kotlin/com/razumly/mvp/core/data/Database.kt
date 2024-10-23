package com.razumly.mvp.core.data

expect class Database {
    suspend fun getTournament(tournamentId: String): Tournament?
    suspend fun getTeam(teamId: String): Team?
    suspend fun getMatch(matchId: String): Match?
    suspend fun getField(fieldId: String): Field?
    suspend fun login(email: String, password: String)
}