package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserTeamMembershipRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

@Dao
interface UserDataDao {
    @Upsert
    suspend fun upsertUserData(userData: UserData)

    @Upsert
    suspend fun upsertUsersData(usersData: List<UserData>)

    @Query("DELETE FROM UserData WHERE id IN (:ids)")
    suspend fun deleteUsersById(ids: List<String>)

    @Upsert
    suspend fun upsertUserEventCrossRef(crossRef: EventUserCrossRef)

    @Upsert
    suspend fun upsertUserEventCrossRefs(crossRefs: List<EventUserCrossRef>)

    /** TeamDao owns membership replacement; retained for targeted relation operations. */
    @Upsert
    suspend fun upsertUserTeamCrossRefs(crossRefs: List<TeamPlayerCrossRef>)

    @Delete
    suspend fun deleteUserData(userData: UserData)

    /** TeamDao owns membership replacement; do not call this from a user profile refresh. */
    @Query("DELETE FROM team_user_cross_ref WHERE userId IN (:userIds)")
    suspend fun deleteTeamCrossRefById(userIds: List<String>)

    @Transaction
    @Query("SELECT * FROM UserData WHERE id = :id")
    suspend fun getUserMembershipRelationsById(id: String): UserTeamMembershipRelations?

    suspend fun getUserDataById(id: String): UserData? =
        getUserMembershipRelationsById(id)?.toDomain()

    @Transaction
    @Query("SELECT * FROM UserData WHERE id IN (:ids)")
    suspend fun getUserMembershipRelationsByIds(ids: List<String>): List<UserTeamMembershipRelations>

    suspend fun getUserDatasById(ids: List<String>): List<UserData> =
        getUserMembershipRelationsByIds(ids).map(UserTeamMembershipRelations::toDomain)

    @Transaction
    @Query("SELECT * FROM UserData WHERE id IN (:ids)")
    fun getUserMembershipRelationsByIdsFlow(ids: List<String>): Flow<List<UserTeamMembershipRelations>>

    fun getUserDatasByIdFlow(ids: List<String>): Flow<List<UserData>> =
        getUserMembershipRelationsByIdsFlow(ids).map { users ->
            users.map(UserTeamMembershipRelations::toDomain)
        }

    @Transaction
    suspend fun upsertUserWithRelations(userData: UserData) {
        // User payloads may omit teamIds. Team rows and their junction replacements are the
        // canonical local membership source, so a profile refresh must not delete those rows.
        upsertUserData(userData)
    }

    @Transaction
    suspend fun upsertUsersWithRelations(usersData: List<UserData>) {
        usersData.forEach { userData -> upsertUserWithRelations(userData) }
    }

    @Transaction
    @Query("SELECT * FROM UserData WHERE id = :id")
    fun getUserMembershipRelationsFlowById(id: String): Flow<UserTeamMembershipRelations?>

    fun getUserFlowById(id: String): Flow<UserData?> =
        getUserMembershipRelationsFlowById(id).map { user -> user?.toDomain() }

    @Transaction
    @Query(
        """
        SELECT * FROM UserData
        WHERE userName LIKE '%' || :search || '%'
            OR firstName LIKE '%' || :search || '%'
            OR lastName LIKE '%' || :search || '%'
        """,
    )
    suspend fun searchUserMembershipRelations(search: String): List<UserTeamMembershipRelations>

    suspend fun searchUsers(search: String): List<UserData> =
        searchUserMembershipRelations(search).map(UserTeamMembershipRelations::toDomain)
}
