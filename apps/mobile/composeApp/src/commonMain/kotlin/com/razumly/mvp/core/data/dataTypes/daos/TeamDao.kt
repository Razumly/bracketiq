package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.RewriteQueriesToDropUnusedColumns
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.MatchTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentTeamCrossRef
import io.github.aakira.napier.Napier
import kotlinx.coroutines.flow.Flow

@Dao
interface TeamDao {
    @Upsert
    suspend fun upsertTeam(team: Team)

    @Upsert
    suspend fun upsertTeams(teams: List<Team>)

    @Query("SELECT * FROM Team WHERE id = :teamId")
    suspend fun getTeam(teamId: String): Team

    @Query("SELECT * FROM Team WHERE id in (:teamIds)")
    suspend fun getTeams(teamIds: List<String>): List<Team>

    @Query("SELECT * FROM Team WHERE playerIds LIKE '%' || :userId || '%'")
    suspend fun getTeamsForUser(userId: String): List<Team>

    @Query("SELECT * FROM Team WHERE playerIds LIKE '%' || :userId || '%'")
    fun getTeamsForUserFlow(userId: String): Flow<List<TeamWithPlayers>>

    @Query("SELECT * FROM Team WHERE pending LIKE '%' || :userId || '%'")
    suspend fun getTeamInvitesForUser(userId: String): List<Team>

    @Query("SELECT * FROM Team WHERE pending LIKE '%' || :userId || '%'")
    fun getTeamInvitesForUserFlow(userId: String): Flow<List<TeamWithPlayers>>

    @Query("DELETE FROM Team WHERE id IN (:ids)")
    suspend fun deleteTeamsByIds(ids: List<String>)

    @Query("SELECT * FROM team_user_cross_ref WHERE teamId == :teamId")
    suspend fun getTeamPlayerCrossRefsByTeamId(teamId: String): List<TeamPlayerCrossRef>

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

    @Upsert
    suspend fun upsertMatchTeamCrossRefs(crossRefs: List<MatchTeamCrossRef>)

    @Upsert
    suspend fun upsertTournamentTeamCrossRefs(crossRefs: List<TournamentTeamCrossRef>)

    @Delete
    suspend fun deleteTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef)

    @Delete
    suspend fun deleteTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>)

    @Delete
    suspend fun deleteTeamPendingPlayerCrossRef(crossRef: TeamPendingPlayerCrossRef)

    @Query("DELETE FROM team_user_cross_ref WHERE teamId == :teamId")
    suspend fun deleteTeamPlayerCrossRefsByTeamId(teamId: String)

    @Query("DELETE FROM team_pending_player_cross_ref WHERE teamId == :teamId")
    suspend fun deleteTeamPendingPlayerCrossRefsByTeamId(teamId: String)

    @Query("DELETE FROM tournament_team_cross_ref WHERE teamId == :teamId")
    suspend fun deleteTournamentTeamCrossRefsByTeamId(teamId: String)

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query("SELECT * FROM Team WHERE id = :teamId")
    suspend fun getTeamWithPlayers(teamId: String): TeamWithPlayers

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query("SELECT * FROM Team WHERE id = :teamId")
    fun getTeamWithPlayersFlow(teamId: String): Flow<TeamWithRelations>

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query("SELECT * FROM Team WHERE id in (:teamIds)")
    suspend fun getTeamsWithPlayers(teamIds: List<String>): List<TeamWithRelations>

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query("SELECT * FROM Team WHERE id In (:ids)")
    fun getTeamsWithPlayersFlowByIds(ids: List<String>): Flow<List<TeamWithPlayers>>

    @Transaction
    suspend fun upsertTeamWithRelations(team: Team) {
        deleteTeamPlayerCrossRefsByTeamId(team.id)
        deleteTeamPendingPlayerCrossRefsByTeamId(team.id)
        upsertTeam(team)
        try {
            upsertTeamPlayerCrossRefs(team.playerIds.map { playerId ->
                TeamPlayerCrossRef(team.id, playerId)
            })
        } catch (e: Exception) {
            Napier.d("Failed to add user team crossRef for team: ${team.id} players- ${team.playerIds}\n" +
                    "${e.message}")
        }
        try {
            upsertTeamPendingPlayerCrossRefs(team.pending.map { playerId ->
                TeamPendingPlayerCrossRef(team.id, playerId)
            })
        } catch (e: Exception) {
            Napier.d("Failed to add pending user team crossRef for team: ${team.id}\n${e.message}")
        }
    }

    // Add player to team
    @Transaction
    suspend fun upsertTeamsWithRelations(teams: List<Team>) {
        teams.forEach { team ->
            upsertTeamWithRelations(team)
        }
    }
}