package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserTournamentCrossRef
import com.razumly.mvp.core.data.dataTypes.UserWithRelations

@Dao
interface UserDataDao {
    @Upsert
    suspend fun upsertUserData(userData: UserData)

    @Upsert
    suspend fun upsertUsersData(usersData: List<UserData>)

    @Upsert
    suspend fun upsertUserTournamentCrossRef(crossRef: UserTournamentCrossRef)

    @Upsert
    suspend fun upsertUserTournamentCrossRefs(crossRefs: List<UserTournamentCrossRef>)

    @Delete
    suspend fun deleteUserData(userData: UserData)

    @Query("SELECT * FROM UserData WHERE id = :id")
    suspend fun getUserDataById(id: String): UserData?
}