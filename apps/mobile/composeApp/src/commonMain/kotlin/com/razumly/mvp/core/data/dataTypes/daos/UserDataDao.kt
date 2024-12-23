package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.UserData

@Dao
interface UserDataDao {
    @Upsert
    suspend fun upsertUserData(userData: UserData)

    @Upsert
    suspend fun upsertUsersData(userData: List<UserData>)

    @Delete
    suspend fun deleteUserData(userData: UserData)

    @Query("SELECT * FROM UserData WHERE id = :id")
    suspend fun getUserDataById(id: String): UserData?

    @Query("SELECT * FROM UserData WHERE tournamentId = :tournamentId")
    suspend fun getUserDataByTournamentId(tournamentId: String): List<UserData>
}