package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.CreateInvitesRequestDto
import com.razumly.mvp.core.network.dto.DeleteInvitesRequestDto
import com.razumly.mvp.core.network.dto.InviteCreateDto
import com.razumly.mvp.core.network.dto.InvitesResponseDto
import com.razumly.mvp.core.network.dto.TeamApiDto
import com.razumly.mvp.core.network.dto.TeamsResponseDto
import com.razumly.mvp.core.network.dto.UpdateTeamRequestDto
import com.razumly.mvp.core.network.dto.toUpdateDto
import com.razumly.mvp.core.util.newId
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

interface ITeamRepository : IMVPRepository {
    fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>>
    suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers>
    suspend fun getTeams(ids: List<String>): Result<List<Team>>
    suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>>
    suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit>
    suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit>
    suspend fun createTeam(newTeam: Team): Result<Team>
    suspend fun updateTeam(newTeam: Team): Result<Team>
    suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit>
    fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>>
    fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>>
    suspend fun listTeamInvites(userId: String): Result<List<Invite>>
    suspend fun deleteInvite(inviteId: String): Result<Unit>
    suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit>
}

class TeamRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
    private val userRepository: IUserRepository,
    private val pushNotificationRepository: IPushNotificationsRepository,
) : ITeamRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> =
        databaseService.getTeamDao.getTeamsWithPlayersFlowByIds(ids)
            .map { teams -> Result.success(teams) }

    override suspend fun getTeams(ids: List<String>): Result<List<Team>> {
        val teamIds = ids.distinct().filter(String::isNotBlank)
        if (teamIds.isEmpty()) return Result.success(emptyList())

        return multiResponse(
            getRemoteData = { fetchRemoteTeamsByIds(teamIds) },
            getLocalData = { databaseService.getTeamDao.getTeams(teamIds) },
            saveData = { teams -> databaseService.getTeamDao.upsertTeamsWithRelations(teams) },
            deleteData = { staleIds -> databaseService.getTeamDao.deleteTeamsByIds(staleIds) },
        )
    }

    override suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>> =
        runCatching {
            if (ids.isEmpty()) return@runCatching emptyList()
            getTeams(ids).getOrThrow()
            databaseService.getTeamDao.getTeamsWithPlayersFlowByIds(ids).first()
        }

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> {
        val addResult = runCatching {
            databaseService.getTeamDao.upsertTeamPlayerCrossRef(
                TeamPlayerCrossRef(team.id, player.id)
            )
        }

        if (!team.playerIds.contains(player.id) || team.pending.contains(player.id)) {
            val updatedTeam = team.copy(
                playerIds = (team.playerIds + player.id).distinct(),
                pending = team.pending - player.id,
            )
            updateTeam(updatedTeam).onFailure {
                databaseService.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(team.id, player.id))
                return Result.failure(it)
            }
        }

        if (!player.teamIds.contains(team.id)) {
            val updatedUserData = player.copy(teamIds = player.teamIds + team.id)
            userRepository.updateUser(updatedUserData).onFailure {
                databaseService.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(team.id, player.id))
                return Result.failure(it)
            }
        }

        pushNotificationRepository.subscribeUserToTeamNotifications(player.id, team.id)
        return addResult
    }

    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> {
        val deleteResult = runCatching {
            databaseService.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(team.id, player.id))
        }

        if (team.playerIds.contains(player.id)) {
            val updatedTeam = team.copy(playerIds = team.playerIds - player.id)
            updateTeam(updatedTeam).onFailure {
                databaseService.getTeamDao.upsertTeamPlayerCrossRef(TeamPlayerCrossRef(team.id, player.id))
                return Result.failure(it)
            }
        }

        if (player.teamIds.contains(team.id)) {
            val updatedUserData = player.copy(teamIds = player.teamIds - team.id)
            userRepository.updateUser(updatedUserData).onFailure {
                databaseService.getTeamDao.upsertTeamPlayerCrossRef(TeamPlayerCrossRef(team.id, player.id))
                return Result.failure(it)
            }
        }

        pushNotificationRepository.unsubscribeUserFromTeamNotifications(player.id, team.id)
        if (player.id != userRepository.currentUser.value.getOrThrow().id) {
            pushNotificationRepository.sendUserNotification(
                player.id,
                team.name ?: "Team Update",
                "You have been removed from a team",
            )
        }
        return deleteResult
    }

    override suspend fun createTeam(newTeam: Team): Result<Team> {
        val id = newId()
        val currentUser = userRepository.currentUser.value.getOrThrow()

        return singleResponse(
            networkCall = {
                val created = api.post<Team, TeamApiDto>(
                    path = "api/teams",
                    body = newTeam.copy(id = id),
                ).toTeamOrNull() ?: error("Create team response missing team")

                ensureUsersCachedForTeam(created)
                created
            },
            saveCall = { created ->
                databaseService.getTeamDao.upsertTeamWithRelations(created)
                userRepository.updateUser(currentUser.copy(teamIds = currentUser.teamIds + created.id))
                    .getOrThrow()

                syncInvitesForPendingDiff(
                    teamId = created.id,
                    oldPending = emptyList(),
                    newPending = created.pending,
                    createdBy = created.captainId,
                )
            },
            onReturn = { it },
        )
    }

    override suspend fun updateTeam(newTeam: Team): Result<Team> = singleResponse(
        networkCall = {
            val updated = api.patch<UpdateTeamRequestDto, TeamApiDto>(
                path = "api/teams/${newTeam.id}",
                body = UpdateTeamRequestDto(team = newTeam.toUpdateDto()),
            ).toTeamOrNull() ?: error("Update team response missing team")

            ensureUsersCachedForTeam(updated)
            updated
        },
        saveCall = { newData ->
            val oldTeam = runCatching { databaseService.getTeamDao.getTeam(newData.id) }.getOrNull()

            databaseService.getTeamDao.upsertTeamWithRelations(newData)

            if (oldTeam != null) {
                // Propagate player removals to user profiles and notifications.
                userRepository.getUsers(oldTeam.playerIds.filterNot { it in newData.playerIds })
                    .onSuccess { removedPlayers ->
                        removedPlayers.forEach { player -> removePlayerFromTeam(newData, player) }
                    }

                syncInvitesForPendingDiff(
                    teamId = newData.id,
                    oldPending = oldTeam.pending,
                    newPending = newData.pending,
                    createdBy = newData.captainId,
                )
            } else {
                syncInvitesForPendingDiff(
                    teamId = newData.id,
                    oldPending = emptyList(),
                    newPending = newData.pending,
                    createdBy = newData.captainId,
                )
            }
        },
        onReturn = { team -> team },
    )

    override suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit> = runCatching {
        api.deleteNoResponse("api/teams/${team.team.id}")

        team.players.forEach { player ->
            userRepository.updateUser(player.copy(teamIds = player.teamIds - team.team.id))
        }

        databaseService.getTeamDao.deleteTeam(team.team)
    }

    override fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>> {
        val localTeamsFlow = databaseService.getTeamDao.getTeamsForUserFlow(id).map { Result.success(it) }

        scope.launch {
            fetchRemoteTeamsForUser(userId = id)
        }

        return localTeamsFlow
    }

    private suspend fun fetchRemoteTeamsForUser(userId: String): Result<List<Team>> {
        return multiResponse(
            getRemoteData = { fetchRemoteTeamsByPlayerId(userId) },
            getLocalData = { databaseService.getTeamDao.getTeamsForUser(userId) },
            saveData = { teams -> databaseService.getTeamDao.upsertTeamsWithRelations(teams) },
            deleteData = { staleIds -> databaseService.getTeamDao.deleteTeamsByIds(staleIds) },
        )
    }

    override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> =
        singleResponse(
            networkCall = { fetchRemoteTeam(teamId) },
            saveCall = { team -> databaseService.getTeamDao.upsertTeamWithRelations(team) },
            onReturn = { _ -> databaseService.getTeamDao.getTeamWithPlayers(teamId) },
        )

    override fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>> {
        val localFlow = databaseService.getTeamDao.getTeamWithPlayersFlow(id).map { Result.success(it) }
        scope.launch { getTeamWithPlayers(id) }
        return localFlow
    }

    override suspend fun listTeamInvites(userId: String): Result<List<Invite>> = runCatching {
        val encodedUserId = userId.encodeURLQueryComponent()
        val res = api.get<InvitesResponseDto>("api/invites?userId=$encodedUserId&type=player")
        res.invites.filter { it.teamId != null }
    }

    override suspend fun deleteInvite(inviteId: String): Result<Unit> = runCatching {
        api.deleteNoResponse("api/invites/$inviteId")
    }

	    override suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit> = runCatching {
	        // Accepting an invite mutates team membership; this must be done server-side (non-captains cannot PATCH teams).
	        api.postNoResponse("api/invites/$inviteId/accept")

	        // Some servers may already delete the invite as part of acceptance; ignore failures here.
	        runCatching { deleteInvite(inviteId).getOrThrow() }

	        // Refresh local caches so UI updates (team membership + relations).
	        getTeamWithPlayers(teamId).getOrThrow()

	        // Keep current user profile in sync (teamIds is used across the app). This is a refresh, not a mutation.
	        runCatching { userRepository.getCurrentAccount().getOrThrow() }
	    }

    private suspend fun fetchRemoteTeamsByIds(ids: List<String>): List<Team> {
        val encodedIds = ids.joinToString(",") { it.trim() }.encodeURLQueryComponent()
        val res = api.get<TeamsResponseDto>("api/teams?ids=$encodedIds&limit=200")
        val teams = res.teams.mapNotNull { it.toTeamOrNull() }
        ensureUsersCachedForTeams(teams)
        return teams
    }

    private suspend fun fetchRemoteTeamsByPlayerId(playerId: String): List<Team> {
        val encoded = playerId.encodeURLQueryComponent()
        val res = api.get<TeamsResponseDto>("api/teams?playerId=$encoded&limit=200")
        val teams = res.teams.mapNotNull { it.toTeamOrNull() }
        ensureUsersCachedForTeams(teams)
        return teams
    }

    private suspend fun fetchRemoteTeam(teamId: String): Team {
        val dto = api.get<TeamApiDto>("api/teams/$teamId")
        val team = dto.toTeamOrNull() ?: error("Team response missing team")
        ensureUsersCachedForTeam(team)
        return team
    }

    private suspend fun ensureUsersCachedForTeams(teams: List<Team>) {
        val userIds = buildSet {
            teams.forEach { team ->
                add(team.captainId)
                team.playerIds.forEach(::add)
                team.pending.forEach(::add)
            }
        }.filter(String::isNotBlank)

        if (userIds.isNotEmpty()) {
            userRepository.getUsers(userIds).getOrThrow()
        }
    }

    private suspend fun ensureUsersCachedForTeam(team: Team) {
        val userIds = buildList {
            add(team.captainId)
            addAll(team.playerIds)
            addAll(team.pending)
        }.distinct().filter(String::isNotBlank)

        if (userIds.isNotEmpty()) {
            userRepository.getUsers(userIds).getOrThrow()
        }
    }

    private suspend fun syncInvitesForPendingDiff(
        teamId: String,
        oldPending: List<String>,
        newPending: List<String>,
        createdBy: String,
    ) {
        val oldSet = oldPending.toSet()
        val newSet = newPending.toSet()

        val added = (newSet - oldSet).filter(String::isNotBlank)
        if (added.isNotEmpty()) {
            api.post<CreateInvitesRequestDto, InvitesResponseDto>(
                path = "api/invites",
                body = CreateInvitesRequestDto(
                    invites = added.map { userId ->
                        InviteCreateDto(
                            type = "player",
                            status = "pending",
                            teamId = teamId,
                            userId = userId,
                            createdBy = createdBy,
                        )
                    }
                ),
            )

            added.forEach { invitedUserId ->
                pushNotificationRepository.sendUserNotification(
                    userId = invitedUserId,
                    title = "Team invite",
                    body = "You have been invited to join a team.",
                )
            }
        }

        val removed = (oldSet - newSet).filter(String::isNotBlank)
        if (removed.isNotEmpty()) {
            removed.forEach { userId ->
                api.deleteNoResponse(
                    path = "api/invites",
                    body = DeleteInvitesRequestDto(
                        userId = userId,
                        teamId = teamId,
                        type = "player",
                    )
                )
            }
        }
    }
}
