package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import kotlinx.coroutines.flow.Flow

interface IUserRepository {
    suspend fun login(email: String, password: String): Result<UserData>
    suspend fun logout(): Result<Unit>
    suspend fun getCurrentUserFlow(): Flow<Result<UserData>>
    suspend fun getUsersOfTournament(tournamentId: String): Result<List<UserData>>
    suspend fun getUsersOfTournamentFlow(tournamentId: String): Flow<Result<List<UserData>>>
    suspend fun createNewUser(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        userName: String
    ): Result<UserData>

    suspend fun updateUser(user: UserData): Result<UserData>
}