package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Invite
import kotlinx.coroutines.flow.Flow

@Dao
interface InviteDao {
    @Upsert
    suspend fun upsertInvite(invite: Invite)

    @Upsert
    suspend fun upsertInvites(invites: List<Invite>)

    @Query(
        """
        SELECT * FROM Invite
        WHERE userId = :userId
          AND (:type IS NULL OR UPPER(type) = UPPER(:type))
        """
    )
    suspend fun getInvitesForUser(userId: String, type: String?): List<Invite>

    @Query(
        """
        SELECT * FROM Invite
        WHERE userId = :userId
          AND (:type IS NULL OR UPPER(type) = UPPER(:type))
        """
    )
    fun getInvitesForUserFlow(userId: String, type: String?): Flow<List<Invite>>

    @Query("DELETE FROM Invite WHERE id = :inviteId")
    suspend fun deleteInviteById(inviteId: String)

    @Query("UPDATE Invite SET status = :status WHERE id = :inviteId")
    suspend fun updateInviteStatus(inviteId: String, status: String)

    @Query(
        """
        DELETE FROM Invite
        WHERE userId = :userId
          AND (:type IS NULL OR UPPER(type) = UPPER(:type))
        """
    )
    suspend fun deleteInvitesForUser(userId: String, type: String?)

    @Query(
        """
        DELETE FROM Invite
        WHERE userId = :userId
          AND (:type IS NULL OR UPPER(type) = UPPER(:type))
          AND id NOT IN (:ids)
        """
    )
    suspend fun deleteMissingInvitesForUser(userId: String, type: String?, ids: List<String>)

    @Transaction
    suspend fun replaceInvitesForUser(userId: String, type: String?, invites: List<Invite>) {
        val ids = invites.map { it.id.trim() }.filter(String::isNotBlank)
        if (ids.isEmpty()) {
            deleteInvitesForUser(userId, type)
        } else {
            deleteMissingInvitesForUser(userId, type, ids)
            upsertInvites(invites)
        }
    }
}
