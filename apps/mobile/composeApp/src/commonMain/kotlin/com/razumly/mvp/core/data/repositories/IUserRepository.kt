package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import kotlinx.coroutines.flow.Flow

interface IUserRepository : IMVPRepository {
    suspend fun login(email: String, password: String): Result<UserData>
    suspend fun logout(): Result<Unit>
    fun getCurrentUserFlow(): Flow<Result<UserWithRelations>>
    suspend fun getUsersOfTournament(tournamentId: String): Result<List<UserData>>
    suspend fun getUsersOfEvent(eventId: String): Result<List<UserData>>
    suspend fun getUsers(userIds: List<String>): Result<List<UserData>>
    fun getUsersOfEventFlow(eventId: String): Flow<Result<List<UserData>>>
    fun getUsersOfTournamentFlow(tournamentId: String): Flow<Result<List<UserData>>>
    suspend fun searchPlayers(query: String): Result<List<UserData>>
    suspend fun createNewUser(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        userName: String
    ): Result<UserData>

    suspend fun updateUser(user: UserData): Result<UserData>
}