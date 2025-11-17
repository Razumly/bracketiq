package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.TeamDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toTeam
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.convert
import io.appwrite.ID
import io.appwrite.Query
import io.appwrite.services.TablesDB
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

interface ITeamRepository : IMVPRepository {
    fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>>
    suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers>
    suspend fun getTeams(ids: List<String>): Result<List<Team>>
    suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit>
    suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit>
    suspend fun createTeam(newTeam: Team): Result<Team>
    suspend fun updateTeam(newTeam: Team): Result<Team>
    suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit>
    fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>>
    fun getTeamInvitesWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>>
    fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>>
}

class TeamRepository(
    private val tablesDb: TablesDB,
    private val databaseService: DatabaseService,
    private val userRepository: IUserRepository,
    private val pushNotificationRepository: PushNotificationsRepository
) : ITeamRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    override fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> =
        databaseService.getTeamDao.getTeamsWithPlayersFlowByIds(ids)
            .map { teams -> Result.success(teams) }

    override suspend fun getTeams(ids: List<String>): Result<List<Team>> =
        multiResponse(getRemoteData = {
            tablesDb.listRows<TeamDTO>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.VOLLEYBALL_TEAMS_TABLE,
                queries = listOf(
                    Query.equal("\$id", ids), Query.limit(200)
                ),
                nestedType = TeamDTO::class
            ).rows.map { dtoRow -> dtoRow.convert { it.toTeam(dtoRow.id) }.data }
        }, getLocalData = { databaseService.getTeamDao.getTeams(ids) }, saveData = { teams ->
            databaseService.getTeamDao.upsertTeams(teams)
        }, deleteData = { teamIds ->
            databaseService.getTeamDao.deleteTeamsByIds(teamIds)
        })

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> {
        val addResult = runCatching {
            databaseService.getTeamDao.upsertTeamPlayerCrossRef(
                TeamPlayerCrossRef(
                    team.id, player.id
                )
            )
        }

        if (!team.playerIds.contains(player.id) || team.pending.contains(player.id)) {
            val updatedTeam = team.copy(
                playerIds = team.playerIds + player.id, pending = team.pending - player.id
            )
            updateTeam(updatedTeam).onFailure {
                databaseService.getTeamDao.deleteTeamPlayerCrossRef(
                    TeamPlayerCrossRef(
                        team.id, player.id
                    )
                )
                return Result.failure(it)
            }
        }
        if (!player.teamIds.contains(team.id) || player.teamInvites.contains(team.id)) {
            val updatedUserData = player.copy(
                teamIds = player.teamIds + team.id, teamInvites = player.teamInvites - team.id
            )
            userRepository.updateUser(updatedUserData).onFailure {
                databaseService.getTeamDao.deleteTeamPlayerCrossRef(
                    TeamPlayerCrossRef(
                        team.id, player.id
                    )
                )
                return Result.failure(it)
            }
        }

        pushNotificationRepository.subscribeUserToTeamNotifications(player.id, team.id)
        return addResult
    }

    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> {
        val deleteResult = runCatching {
            databaseService.getTeamDao.deleteTeamPlayerCrossRef(
                TeamPlayerCrossRef(
                    team.id, player.id
                )
            )
        }
        if (team.playerIds.contains(player.id)) {
            val updatedTeam = team.copy(playerIds = team.playerIds - player.id)
            updateTeam(updatedTeam).onFailure {
                databaseService.getTeamDao.upsertTeamPlayerCrossRef(
                    TeamPlayerCrossRef(
                        team.id, player.id
                    )
                )
                return Result.failure(it)
            }
        }
        if (player.teamIds.contains(team.id)) {
            val updatedUserData = player.copy(teamIds = player.teamIds - team.id)
            userRepository.updateUser(updatedUserData).onFailure {
                databaseService.getTeamDao.upsertTeamPlayerCrossRef(
                    TeamPlayerCrossRef(
                        team.id, player.id
                    )
                )
                return Result.failure(it)
            }
        }

        pushNotificationRepository.unsubscribeUserFromTeamNotifications(player.id, team.id)
        if (player.id != userRepository.currentUser.value.getOrThrow().id) {
            pushNotificationRepository.sendUserNotification(
                player.id, team.name ?: "Team Update", "You have been removed from a team"
            )
        }
        return deleteResult
    }

    override suspend fun createTeam(newTeam: Team): Result<Team> {
        val id = ID.unique()
        val currentUser = userRepository.currentUser.value.getOrThrow()

        return singleResponse(networkCall = {
            val remoteTeam = tablesDb.createRow<TeamDTO>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.VOLLEYBALL_TEAMS_TABLE,
                rowId = id,
                data = newTeam.toTeamDTO(),
                nestedType = TeamDTO::class
            ).data.toTeam(id)
            remoteTeam
        }, saveCall = { remoteTeam ->
            databaseService.getTeamDao.upsertTeamWithRelations(remoteTeam)
            userRepository.updateUser(currentUser.copy(teamIds = currentUser.teamIds + id))
                .getOrThrow()
            userRepository.getUsers(newTeam.pending).onSuccess { players ->
                players.forEach { player ->
                    userRepository.updateUser(
                        player.copy(teamInvites = player.teamInvites + newTeam.id)
                    )
                    pushNotificationRepository.sendUserNotification(
                        player.id, "Team Invite", "You have been invited to a team"
                    )
                }
            }
        }, onReturn = { it })
    }

    override suspend fun updateTeam(newTeam: Team): Result<Team> = singleResponse(networkCall = {
        tablesDb.updateRow<TeamDTO>(
            databaseId = DbConstants.DATABASE_NAME,
            tableId = DbConstants.VOLLEYBALL_TEAMS_TABLE,
            rowId = newTeam.id,
            data = newTeam.toTeamDTO(),
            nestedType = TeamDTO::class
        ).data.toTeam(newTeam.id)
    }, saveCall = { newData ->
        val oldTeam = databaseService.getTeamDao.getTeam(newData.id)
        databaseService.getTeamDao.upsertTeamWithRelations(newData)
        userRepository.getUsers(oldTeam.playerIds.filterNot {
            newTeam.playerIds.contains(it)
        }).onSuccess { removedPlayers ->
            removedPlayers.forEach { player ->
                removePlayerFromTeam(newData, player)
            }
        }
        userRepository.getUsers(newData.pending).onSuccess { players ->
            players.forEach { player ->
                userRepository.updateUser(
                    player.copy(teamInvites = player.teamInvites + newData.id)
                )
                pushNotificationRepository.sendUserNotification(
                    player.id, "Team Invite", "You have been invited to a team"
                )
            }
        }
    }, onReturn = { team ->
        team
    })

    override suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit> = runCatching {
        tablesDb.deleteRow(
            databaseId = DbConstants.DATABASE_NAME,
            tableId = DbConstants.VOLLEYBALL_TEAMS_TABLE,
            rowId = team.team.id
        )
        team.players.forEach { player ->
            userRepository.updateUser(
                player.copy(
                    teamIds = player.teamIds - team.team.id,
                )
            )
        }
        team.pendingPlayers.forEach { player ->
            userRepository.updateUser(
                player.copy(
                    teamInvites = player.teamInvites - team.team.id
                )
            )
        }
        databaseService.getTeamDao.deleteTeam(team.team)
    }

    override fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>> {
        val localTeamsFlow = databaseService.getTeamDao.getTeamsForUserFlow(id).map {
            Result.success(it)
        }

        scope.launch {
            fetchRemoteTeams(query = Query.contains(DbConstants.TEAMS_PLAYERS_ATTRIBUTE, id),
                getLocalData = { databaseService.getTeamDao.getTeamsForUser(id) })
        }

        return localTeamsFlow
    }

    override fun getTeamInvitesWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>> {
        val localTeamsFlow = databaseService.getTeamDao.getTeamInvitesForUserFlow(id).map {
            Result.success(it)
        }
        scope.launch {
            fetchRemoteTeams(query = Query.contains(DbConstants.TEAMS_PENDING_ATTRIBUTE, id),
                getLocalData = { databaseService.getTeamDao.getTeamInvitesForUser(id) })
        }

        return localTeamsFlow
    }

    private suspend fun fetchRemoteTeams(
        query: String, getLocalData: suspend () -> List<Team>
    ): Result<List<Team>> {
        return multiResponse(getRemoteData = {
            val teams = tablesDb.listRows<TeamDTO>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.VOLLEYBALL_TEAMS_TABLE,
                queries = listOf(query),
                nestedType = TeamDTO::class
            ).rows.map { dtoRow ->
                dtoRow.convert { it.toTeam(dtoRow.id) }.data
            }
            teams.forEach { team ->
                userRepository.getUsers(team.playerIds)
            }
            teams
        }, getLocalData = {
            getLocalData()
        }, saveData = { teams ->
            databaseService.getTeamDao.upsertTeamsWithRelations(teams)
        }, deleteData = { teamIds ->
            databaseService.getTeamDao.deleteTeamsByIds(teamIds)
        })
    }

    override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> =
        singleResponse(
            networkCall = {
                tablesDb.getRow<TeamDTO>(
                    databaseId = DbConstants.DATABASE_NAME,
                    tableId = DbConstants.VOLLEYBALL_TEAMS_TABLE,
                    rowId = teamId,
                    nestedType = TeamDTO::class
                ).data.toTeam(teamId)
            },
            saveCall = { team -> databaseService.getTeamDao.upsertTeam(team) },
            onReturn = { _ -> databaseService.getTeamDao.getTeamWithPlayers(teamId) },
        )

    override fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>> {
        val localFlow =
            databaseService.getTeamDao.getTeamWithPlayersFlow(id).map { Result.success(it) }
        scope.launch {
            getTeamWithPlayers(id)
        }
        return localFlow
    }
}
