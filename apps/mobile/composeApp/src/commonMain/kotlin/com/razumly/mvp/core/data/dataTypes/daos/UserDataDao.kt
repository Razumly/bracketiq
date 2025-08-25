package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentUserCrossRef
import io.github.aakira.napier.Napier
import kotlinx.coroutines.flow.Flow

@Dao
interface UserDataDao {
    @Upsert
    suspend fun upsertUserData(userData: UserData)

    @Upsert
    suspend fun upsertUsersData(usersData: List<UserData>)

    @Query("DELETE FROM UserData WHERE id IN (:ids)")
    suspend fun deleteUsersById(ids: List<String>)

    @Upsert
    suspend fun upsertUserTournamentCrossRef(crossRef: TournamentUserCrossRef)

    @Upsert
    suspend fun upsertUserTournamentCrossRefs(crossRefs: List<TournamentUserCrossRef>)

    @Upsert
    suspend fun upsertUserEventCrossRef(crossRef: EventUserCrossRef)

    @Upsert
    suspend fun upsertUserEventCrossRefs(crossRefs: List<EventUserCrossRef>)

    @Upsert
    suspend fun upsertUserTeamCrossRefs(crossRefs: List<TeamPlayerCrossRef>)

    @Delete
    suspend fun deleteUserData(userData: UserData)

    @Query("DELETE FROM user_tournament_cross_ref WHERE userId IN (:userIds)")
    suspend fun deleteTournamentCrossRefById(userIds: List<String>)

    @Query("DELETE FROM team_user_cross_ref WHERE userId IN (:userIds)")
    suspend fun deleteTeamCrossRefById(userIds: List<String>)

    @Query("SELECT * FROM UserData WHERE id = :id")
    suspend fun getUserDataById(id: String): UserData?

    @Query("SELECT * FROM UserData WHERE id in (:ids)")
    suspend fun getUserDatasById(ids: List<String>): List<UserData>

    @Query("SELECT * FROM UserData WHERE id in (:ids)")
    fun getUserDatasByIdFlow(ids: List<String>): Flow<List<UserData>>

    @Transaction
    suspend fun upsertUserWithRelations(userData: UserData) {
        deleteTeamCrossRefById(listOf(userData.id))
        upsertUserData(userData)
        try {
            upsertUserTeamCrossRefs(userData.teamIds.map { TeamPlayerCrossRef(it, userData.id) })
        } catch(e: Exception) {
            Napier.d("Failed to add user team crossRef for user: ${userData.id}")
        }
    }

    @Transaction
    suspend fun upsertUsersWithRelations(usersData: List<UserData>) {
        usersData.forEach { userData ->
            upsertUserWithRelations(userData)
        }
    }

    @Transaction
    @Query("SELECT * FROM UserData WHERE id = :id")
    fun getUserFlowById(id: String): Flow<UserData?>

    @Query(
        "SELECT * FROM UserData " +
                "WHERE userName LIKE '%' || :search || '%' " +
                "OR firstName LIKE '%' || :search || '%' " +
                "OR lastName LIKE '%' || :search || '%'"
    )
    suspend fun searchUsers(search: String): List<UserData>
}