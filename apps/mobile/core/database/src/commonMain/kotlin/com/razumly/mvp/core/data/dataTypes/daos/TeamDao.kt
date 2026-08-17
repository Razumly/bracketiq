package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.RewriteQueriesToDropUnusedColumns
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamMembershipRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.withCanonicalMembershipIds
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

@Dao
interface TeamDao {
    @Upsert
    suspend fun upsertTeamRow(team: Team)

    @Upsert
    suspend fun upsertTeamRows(teams: List<Team>)

    @Transaction
    suspend fun upsertTeam(team: Team) {
        upsertTeamWithRelations(team)
    }

    @Transaction
    suspend fun upsertTeams(teams: List<Team>) {
        upsertTeamsWithRelations(teams)
    }

    @Transaction
    @Query("SELECT * FROM Team WHERE id = :teamId")
    suspend fun getTeamMembershipRelations(teamId: String): TeamMembershipRelations?

    suspend fun getTeam(teamId: String): Team =
        requireNotNull(getTeamMembershipRelations(teamId)) { "Team $teamId was not found in Room." }
            .toDomain()

    @Transaction
    @Query("SELECT * FROM Team WHERE id IN (:teamIds)")
    suspend fun getTeamsMembershipRelations(teamIds: List<String>): List<TeamMembershipRelations>

    suspend fun getTeams(teamIds: List<String>): List<Team> =
        getTeamsMembershipRelations(teamIds).map(TeamMembershipRelations::toDomain)

    @Transaction
    @Query(
        """
        SELECT DISTINCT Team.* FROM Team
        LEFT JOIN team_user_cross_ref ON Team.id = team_user_cross_ref.teamId
        WHERE team_user_cross_ref.userId = :userId OR Team.managerId = :userId
        """,
    )
    suspend fun getTeamMembershipRelationsForUser(userId: String): List<TeamMembershipRelations>

    suspend fun getTeamsForUser(userId: String): List<Team> =
        getTeamMembershipRelationsForUser(userId).map(TeamMembershipRelations::toDomain)

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query(
        """
        SELECT DISTINCT Team.* FROM Team
        LEFT JOIN team_user_cross_ref ON Team.id = team_user_cross_ref.teamId
        WHERE team_user_cross_ref.userId = :userId OR Team.managerId = :userId
        """,
    )
    fun getTeamRelationsForUserFlow(userId: String): Flow<List<TeamWithPlayers>>

    fun getTeamsForUserFlow(userId: String): Flow<List<TeamWithPlayers>> =
        getTeamRelationsForUserFlow(userId).map { teams ->
            teams.map(TeamWithPlayers::withCanonicalMembership)
        }

    @Transaction
    @Query(
        """
        SELECT Team.* FROM Team
        INNER JOIN team_pending_player_cross_ref
            ON Team.id = team_pending_player_cross_ref.teamId
        WHERE team_pending_player_cross_ref.userId = :userId
        """,
    )
    suspend fun getTeamInviteMembershipRelations(userId: String): List<TeamMembershipRelations>

    suspend fun getTeamInvitesForUser(userId: String): List<Team> =
        getTeamInviteMembershipRelations(userId).map(TeamMembershipRelations::toDomain)

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query(
        """
        SELECT Team.* FROM Team
        INNER JOIN team_pending_player_cross_ref
            ON Team.id = team_pending_player_cross_ref.teamId
        WHERE team_pending_player_cross_ref.userId = :userId
        """,
    )
    fun getTeamInviteRelationsForUserFlow(userId: String): Flow<List<TeamWithPlayers>>

    fun getTeamInvitesForUserFlow(userId: String): Flow<List<TeamWithPlayers>> =
        getTeamInviteRelationsForUserFlow(userId).map { teams ->
            teams.map(TeamWithPlayers::withCanonicalMembership)
        }

    @Query("DELETE FROM Team WHERE id IN (:ids)")
    suspend fun deleteTeamsByIds(ids: List<String>)

    @Query("SELECT * FROM team_user_cross_ref WHERE teamId = :teamId")
    suspend fun getTeamPlayerCrossRefsByTeamId(teamId: String): List<TeamPlayerCrossRef>

    @Query("SELECT * FROM team_pending_player_cross_ref WHERE teamId = :teamId")
    suspend fun getTeamPendingPlayerCrossRefsByTeamId(teamId: String): List<TeamPendingPlayerCrossRef>

    @Delete
    suspend fun deleteTeam(team: Team)

    @Upsert
    suspend fun upsertTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef)

    @Upsert
    suspend fun upsertTeamPendingPlayerCrossRef(crossRef: TeamPendingPlayerCrossRef)

    @Upsert
    suspend fun upsertTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>)

    @Upsert
    suspend fun upsertTeamPendingPlayerCrossRefs(crossRefs: List<TeamPendingPlayerCrossRef>)

    @Delete
    suspend fun deleteTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef)

    @Delete
    suspend fun deleteTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>)

    @Delete
    suspend fun deleteTeamPendingPlayerCrossRef(crossRef: TeamPendingPlayerCrossRef)

    @Query("DELETE FROM team_user_cross_ref WHERE teamId = :teamId")
    suspend fun deleteTeamPlayerCrossRefsByTeamId(teamId: String)

    @Query("DELETE FROM team_pending_player_cross_ref WHERE teamId = :teamId")
    suspend fun deleteTeamPendingPlayerCrossRefsByTeamId(teamId: String)

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query("SELECT * FROM Team WHERE id = :teamId")
    suspend fun getTeamWithPlayersRelations(teamId: String): TeamWithPlayers

    suspend fun getTeamWithPlayers(teamId: String): TeamWithPlayers =
        getTeamWithPlayersRelations(teamId).withCanonicalMembership()

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query("SELECT * FROM Team WHERE id = :teamId")
    fun getTeamWithRelationsFlow(teamId: String): Flow<TeamWithRelations?>

    fun getTeamWithPlayersFlow(teamId: String): Flow<TeamWithRelations?> =
        getTeamWithRelationsFlow(teamId).map { team -> team?.withCanonicalMembership() }

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query("SELECT * FROM Team WHERE id IN (:teamIds)")
    suspend fun getTeamsWithPlayerRelations(teamIds: List<String>): List<TeamWithRelations>

    suspend fun getTeamsWithPlayers(teamIds: List<String>): List<TeamWithRelations> =
        getTeamsWithPlayerRelations(teamIds).map(TeamWithRelations::withCanonicalMembership)

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query("SELECT * FROM Team WHERE id IN (:ids)")
    fun getTeamsWithPlayerRelationsFlow(ids: List<String>): Flow<List<TeamWithPlayers>>

    fun getTeamsWithPlayersFlowByIds(ids: List<String>): Flow<List<TeamWithPlayers>> =
        getTeamsWithPlayerRelationsFlow(ids).map { teams ->
            teams.map(TeamWithPlayers::withCanonicalMembership)
        }

    @Transaction
    suspend fun upsertTeamWithRelations(team: Team) {
        // Reconcile the persisted rich snapshot with the caller-facing arrays before replacing the
        // canonical junctions, so later domain normalization cannot resurrect stale membership.
        val persistedTeam = team.withCanonicalMembershipIds()
        val playerIds = persistedTeam.playerIds
        val pendingPlayerIds = persistedTeam.pending
        deleteTeamPlayerCrossRefsByTeamId(persistedTeam.id)
        deleteTeamPendingPlayerCrossRefsByTeamId(persistedTeam.id)
        upsertTeamRow(persistedTeam)
        if (playerIds.isNotEmpty()) {
            upsertTeamPlayerCrossRefs(
                playerIds.map { playerId ->
                    TeamPlayerCrossRef(persistedTeam.id, playerId)
                },
            )
        }
        if (pendingPlayerIds.isNotEmpty()) {
            upsertTeamPendingPlayerCrossRefs(
                pendingPlayerIds.map { playerId ->
                    TeamPendingPlayerCrossRef(persistedTeam.id, playerId)
                },
            )
        }
    }

    @Transaction
    suspend fun upsertTeamsWithRelations(teams: List<Team>) {
        teams.forEach { team -> upsertTeamWithRelations(team) }
    }
}
