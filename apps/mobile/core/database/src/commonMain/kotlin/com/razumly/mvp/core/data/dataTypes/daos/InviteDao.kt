package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Insert
import androidx.room.OnConflictStrategy
import com.razumly.mvp.core.data.dataTypes.InvitationOperation
import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Invite
import kotlinx.coroutines.flow.Flow

@Dao
interface InviteDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertOperation(operation: InvitationOperation)

    @Query("SELECT requestKey FROM InvitationOperation WHERE viewerId = :viewerId AND identity = :identity")
    suspend fun getOperationKey(viewerId: String, identity: String): String?

    @Query("DELETE FROM InvitationOperation WHERE viewerId = :viewerId AND identity = :identity AND requestKey = :requestKey")
    suspend fun completeOperation(viewerId: String, identity: String, requestKey: String)

    @Transaction
    suspend fun reserveOperation(viewerId: String, identity: String, proposedKey: String): String {
        insertOperation(InvitationOperation(viewerId, identity, proposedKey))
        return requireNotNull(getOperationKey(viewerId, identity))
    }

    @Query("SELECT * FROM Invite WHERE type = 'TEAM' AND teamId = :teamId AND userId = :userId ORDER BY createdAt DESC, id DESC LIMIT 1")
    suspend fun getLatestTeamAttempt(teamId: String, userId: String): Invite?

    @Query("UPDATE Invite SET isCurrentAttempt = 0 WHERE type = 'TEAM' AND teamId = :teamId AND userId = :userId AND id != :currentId")
    suspend fun clearPreviousAttempts(teamId: String, userId: String, currentId: String)

    @Transaction
    suspend fun saveInvitationAttempt(invite: Invite) {
        upsertInvite(invite)
        val teamId = invite.teamId
        val userId = invite.userId
        if (invite.type == "TEAM" && teamId != null && userId != null) {
            getLatestTeamAttempt(teamId, userId)?.let { latest ->
                clearPreviousAttempts(teamId, userId, latest.id)
            }
        }
    }

    @Query("SELECT * FROM Invite WHERE (userId = :userId OR (viewerCanAcceptForChild = 1 AND viewerId = :userId)) AND (:type IS NULL OR UPPER(type) = UPPER(:type))")
    suspend fun getRecipientInvitations(userId: String, type: String?): List<Invite>

    @Query("SELECT * FROM Invite WHERE id = :id")
    suspend fun getInvite(id: String): Invite?

    @Query("SELECT * FROM Invite WHERE teamId = :teamId AND viewerId = :viewerId ORDER BY createdAt DESC, id DESC")
    fun observeTeamInvitations(teamId: String, viewerId: String): Flow<List<Invite>>

    @Query("SELECT * FROM Invite WHERE userId = :userId OR (viewerCanAcceptForChild = 1 AND viewerId = :userId)")
    fun observeRecipientInvitations(userId: String): Flow<List<Invite>>

    @Query("DELETE FROM Invite WHERE teamId = :teamId")
    suspend fun deleteTeamInvitations(teamId: String)

    @Transaction
    suspend fun replaceTeamInvitations(teamId: String, invites: List<Invite>) {
        deleteTeamInvitations(teamId)
        upsertInvites(invites)
    }

    @Upsert
    suspend fun upsertTeamBlocks(blocks: List<com.razumly.mvp.core.data.dataTypes.TeamBlock>)

    @Query("SELECT * FROM TeamBlock WHERE viewerId = :viewerId ORDER BY createdAt DESC")
    fun observeTeamBlocks(viewerId: String): Flow<List<com.razumly.mvp.core.data.dataTypes.TeamBlock>>

    @Query("DELETE FROM TeamBlock WHERE viewerId = :viewerId")
    suspend fun deleteTeamBlocks(viewerId: String)

    @Query("DELETE FROM TeamBlock WHERE teamId = :teamId AND playerId = :playerId")
    suspend fun deleteTeamBlock(teamId: String, playerId: String)

    @Transaction
    suspend fun replaceTeamBlocks(viewerId: String, blocks: List<com.razumly.mvp.core.data.dataTypes.TeamBlock>) {
        deleteTeamBlocks(viewerId)
        upsertTeamBlocks(blocks.map { it.copy(viewerId = viewerId) })
    }

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
        WHERE viewerCanAcceptForChild = 1
          AND (:type IS NULL OR UPPER(type) = UPPER(:type))
        """
    )
    suspend fun deleteDelegatedInvites(type: String?)

    @Query(
        """
        DELETE FROM Invite
        WHERE userId = :userId
          AND (:type IS NULL OR UPPER(type) = UPPER(:type))
          AND id NOT IN (:ids)
        """
    )
    suspend fun deleteMissingInvitesForUser(userId: String, type: String?, ids: List<String>)

    @Query(
        """
        DELETE FROM Invite
        WHERE viewerCanAcceptForChild = 1
          AND (:type IS NULL OR UPPER(type) = UPPER(:type))
          AND id NOT IN (:ids)
        """
    )
    suspend fun deleteMissingDelegatedInvites(type: String?, ids: List<String>)

    @Transaction
    suspend fun replaceInvitesForUser(userId: String, type: String?, invites: List<Invite>) {
        // Guardian-visible rows retain the child's canonical userId. Treat the
        // viewerCanAcceptForChild projection as transient viewer-owned cache so
        // an authoritative parent refresh can evict child rows that disappeared.
        val ids = invites.map { it.id.trim() }.filter(String::isNotBlank)
        if (ids.isEmpty()) {
            deleteInvitesForUser(userId, type)
            deleteDelegatedInvites(type)
        } else {
            deleteMissingInvitesForUser(userId, type, ids)
            deleteMissingDelegatedInvites(type, ids)
            upsertInvites(invites.map { it.copy(viewerId = userId) })
        }
    }
}
