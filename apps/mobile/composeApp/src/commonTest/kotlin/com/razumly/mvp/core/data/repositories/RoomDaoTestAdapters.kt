package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupMembershipRelations
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamMembershipRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserTeamMembershipRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.ChatUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import kotlinx.coroutines.flow.Flow

/**
 * Test fakes override the public domain-facing DAO methods. These adapters isolate the generated
 * Room-only projections so repository tests do not duplicate database mapping behavior.
 */
abstract class RoomTeamDaoTestAdapter : TeamDao {
    override suspend fun upsertTeamRow(team: Team): Unit = roomOnly()
    override suspend fun upsertTeamRows(teams: List<Team>): Unit = roomOnly()
    override suspend fun getTeamMembershipRelations(teamId: String): TeamMembershipRelations? = roomOnly()
    override suspend fun getTeamsMembershipRelations(teamIds: List<String>): List<TeamMembershipRelations> = roomOnly()
    override suspend fun getTeamMembershipRelationsForUser(userId: String): List<TeamMembershipRelations> = roomOnly()
    override fun getTeamRelationsForUserFlow(userId: String): Flow<List<TeamWithPlayers>> = roomOnly()
    override suspend fun getTeamInviteMembershipRelations(userId: String): List<TeamMembershipRelations> = roomOnly()
    override fun getTeamInviteRelationsForUserFlow(userId: String): Flow<List<TeamWithPlayers>> = roomOnly()
    override suspend fun getTeamPendingPlayerCrossRefsByTeamId(teamId: String): List<TeamPendingPlayerCrossRef> = roomOnly()
    override suspend fun getTeamWithPlayersRelations(teamId: String): TeamWithPlayers = roomOnly()
    override fun getTeamWithRelationsFlow(teamId: String): Flow<TeamWithRelations?> = roomOnly()
    override suspend fun getTeamsWithPlayerRelations(teamIds: List<String>): List<TeamWithRelations> = roomOnly()
    override fun getTeamsWithPlayerRelationsFlow(ids: List<String>): Flow<List<TeamWithPlayers>> = roomOnly()
}

abstract class RoomUserDataDaoTestAdapter : UserDataDao {
    override suspend fun getUserMembershipRelationsById(id: String): UserTeamMembershipRelations? = roomOnly()
    override suspend fun getUserMembershipRelationsByIds(ids: List<String>): List<UserTeamMembershipRelations> = roomOnly()
    override fun getUserMembershipRelationsByIdsFlow(ids: List<String>): Flow<List<UserTeamMembershipRelations>> = roomOnly()
    override fun getUserMembershipRelationsFlowById(id: String): Flow<UserTeamMembershipRelations?> = roomOnly()
    override suspend fun searchUserMembershipRelations(search: String): List<UserTeamMembershipRelations> = roomOnly()
}

abstract class RoomChatGroupDaoTestAdapter : ChatGroupDao {
    override suspend fun upsertChatGroupRow(chatGroup: ChatGroup): Unit = roomOnly()
    override suspend fun upsertChatGroupRows(chatGroups: List<ChatGroup>): Unit = roomOnly()
    override suspend fun getChatGroupUserCrossRefsByChatId(id: String): List<ChatUserCrossRef> = roomOnly()
    override fun getChatGroupRelationsFlowByUserId(userId: String): Flow<List<ChatGroupWithRelations>> = roomOnly()
    override suspend fun getChatGroupMembershipRelationsByUserId(userId: String): List<ChatGroupMembershipRelations> = roomOnly()
    override suspend fun getChatGroupRelationsByUserId(userId: String): ChatGroupWithRelations = roomOnly()
    override fun getChatGroupRelationsFlowById(id: String): Flow<ChatGroupWithRelations> = roomOnly()
}

private fun roomOnly(): Nothing = error("Room-only DAO projection should not be called by a repository fake.")
