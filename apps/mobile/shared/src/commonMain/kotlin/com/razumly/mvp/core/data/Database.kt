package com.razumly.mvp.core.data

expect class Database {
    val currentUser: UserData?
    suspend fun getTournament(tournamentId: String): Tournament?
    suspend fun getTeam(teamId: String): Team?
    suspend fun getMatch(matchId: String): Match?
    suspend fun getField(fieldId: String): Field?
    suspend fun login(email: String, password: String): UserData?
    suspend fun logout()
    suspend fun getCurrentUser(): UserData?
}