package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
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

    @Query("SELECT * FROM UserData WHERE eventIds LIKE '%' || :eventId || '%'")
    suspend fun getUsersInEvent(eventId: String): List<UserData>

    @Query("SELECT * FROM UserData WHERE eventIds LIKE '%' || :eventId || '%'")
    fun getUsersInEventFlow(eventId: String): Flow<List<UserData>>

    @Query("SELECT * FROM UserData WHERE tournamentIds LIKE '%' || :tournamentId || '%'")
    suspend fun getUsersInTournament(tournamentId: String): List<UserData>

    @Query("SELECT * FROM UserData WHERE tournamentIds LIKE '%' || :tournamentId || '%'")
    fun getUsersInTournamentFlow(tournamentId: String): Flow<List<UserData>>

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

    @Query("DELETE FROM user_event_cross_ref WHERE userId IN (:userIds)")
    suspend fun deleteEventCrossRefById(userIds: List<String>)

    @Query("DELETE FROM team_user_cross_ref WHERE userId IN (:userIds)")
    suspend fun deleteTeamCrossRefById(userIds: List<String>)

    @Query("SELECT * FROM UserData WHERE id = :id")
    suspend fun getUserDataById(id: String): UserData?

    @Query("SELECT * FROM UserData WHERE id in (:ids)")
    suspend fun getUserDatasById(ids: List<String>): List<UserData>

    @Transaction
    suspend fun upsertUserWithRelations(userData: UserData) {
        deleteTournamentCrossRefById(listOf(userData.id))
        deleteEventCrossRefById(listOf(userData.id))
        deleteTeamCrossRefById(listOf(userData.id))
        try {
            upsertUserTournamentCrossRefs(userData.tournamentIds.map {
                TournamentUserCrossRef(
                    userData.id,
                    it
                )
            })
        } catch(e: Exception) {
            Napier.d("Failed to add user tournament crossRef for user: ${userData.id}")
        }
        try {
            upsertUserEventCrossRefs(userData.eventIds.map { EventUserCrossRef(userData.id, it) })
        } catch(e: Exception) {
            Napier.d("Failed to add user event crossRef for user: ${userData.id}")
        }
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
    suspend fun getUserWithRelationsById(id: String): UserWithRelations

    @Transaction
    @Query("SELECT * FROM UserData WHERE id = :id")
    fun getUserWithRelationsFlowById(id: String): Flow<UserWithRelations?>

    @Transaction
    @Query("SELECT * FROM UserData WHERE id = :id")
    fun getUserFlowById(id: String): Flow<UserData?>

    @Transaction
    @Query("SELECT * FROM UserData WHERE id in (:ids)")
    fun getUserByIdFlow(ids: List<String>): Flow<List<UserWithRelations>>

    @Query(
        "SELECT * FROM UserData " +
                "WHERE userName LIKE '%' || :search || '%' " +
                "OR firstName LIKE '%' || :search || '%' " +
                "OR lastName LIKE '%' || :search || '%'"
    )
    suspend fun searchUsers(search: String): List<UserData>
}