package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.CreateInvitesRequestDto
import com.razumly.mvp.core.network.dto.DeleteInvitesRequestDto
import com.razumly.mvp.core.network.dto.InviteCreateDto
import com.razumly.mvp.core.network.dto.InvitesResponseDto
import com.razumly.mvp.core.network.dto.TeamApiDto
import com.razumly.mvp.core.network.dto.TeamInviteFreeAgentsResponseDto
import com.razumly.mvp.core.network.dto.TeamRegistrationResponseDto
import com.razumly.mvp.core.network.dto.TeamsResponseDto
import com.razumly.mvp.core.network.dto.UpdateTeamRequestDto
import com.razumly.mvp.core.network.dto.toUpdateDto
import com.razumly.mvp.core.network.dto.toUserDataOrNull
import com.razumly.mvp.core.util.newId
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

interface ITeamRepository : IMVPRepository {
    fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>>
    suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers>
    suspend fun getTeams(ids: List<String>): Result<List<Team>>
    suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>>
    suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit>
    suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit>
    suspend fun createTeam(newTeam: Team): Result<Team>
    suspend fun updateTeam(newTeam: Team): Result<Team>
    suspend fun registerForTeam(teamId: String): Result<Team>
    suspend fun leaveTeam(teamId: String): Result<Team>
    suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit>
    fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>>
    fun getTeamsWithPlayersLoadingFlow(id: String): Flow<Boolean> = flowOf(false)
    fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>>
    suspend fun listTeamInvites(userId: String): Result<List<Invite>>
    suspend fun getInviteFreeAgents(teamId: String): Result<List<UserData>>
    suspend fun createTeamInvite(
        teamId: String,
        userId: String,
        createdBy: String,
        inviteType: String = "player",
    ): Result<Unit>
    suspend fun deleteInvite(inviteId: String): Result<Unit>
    suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit>
}

@Serializable
private data class TeamRegistrationRequestDto(
    val noop: Boolean = true,
)

class TeamRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
    private val userRepository: IUserRepository,
    private val pushNotificationRepository: IPushNotificationsRepository,
) : ITeamRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val userTeamsLoadingState = MutableStateFlow<Map<String, Boolean>>(emptyMap())

    override fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> {
        val teamIds = ids.distinct().filter(String::isNotBlank)
        if (teamIds.isEmpty()) {
            return flowOf(Result.success(emptyList()))
        }

        val localFlow = databaseService.getTeamDao.getTeamsWithPlayersFlowByIds(teamIds)
            .map { teams -> Result.success(teams) }

        scope.launch {
            getTeams(teamIds)
        }

        return localFlow
    }

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
        val syncedTeam = team.withSynchronizedMembership()
        val addResult = runCatching {
            databaseService.getTeamDao.upsertTeamPlayerCrossRef(
                TeamPlayerCrossRef(syncedTeam.id, player.id)
            )
        }

        if (!syncedTeam.playerIds.contains(player.id) || syncedTeam.pending.contains(player.id)) {
            val updatedTeam = syncedTeam.copy(
                playerIds = (syncedTeam.playerIds + player.id).distinct(),
                pending = syncedTeam.pending - player.id,
            ).withSynchronizedMembership()
            updateTeam(updatedTeam).onFailure {
                databaseService.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(syncedTeam.id, player.id))
                return Result.failure(it)
            }
        }

        if (!player.teamIds.contains(syncedTeam.id)) {
            val updatedUserData = player.copy(teamIds = player.teamIds + syncedTeam.id)
            userRepository.updateUser(updatedUserData).onFailure {
                databaseService.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(syncedTeam.id, player.id))
                return Result.failure(it)
            }
        }

        pushNotificationRepository.subscribeUserToTeamNotifications(player.id, syncedTeam.id)
        return addResult
    }

    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> {
        val syncedTeam = team.withSynchronizedMembership()
        val deleteResult = runCatching {
            databaseService.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(syncedTeam.id, player.id))
        }

        if (syncedTeam.playerIds.contains(player.id)) {
            val updatedTeam = syncedTeam.copy(playerIds = syncedTeam.playerIds - player.id)
                .withSynchronizedMembership()
            updateTeam(updatedTeam).onFailure {
                databaseService.getTeamDao.upsertTeamPlayerCrossRef(TeamPlayerCrossRef(syncedTeam.id, player.id))
                return Result.failure(it)
            }
        }

        if (player.teamIds.contains(syncedTeam.id)) {
            val updatedUserData = player.copy(teamIds = player.teamIds - syncedTeam.id)
            userRepository.updateUser(updatedUserData).onFailure {
                databaseService.getTeamDao.upsertTeamPlayerCrossRef(TeamPlayerCrossRef(syncedTeam.id, player.id))
                return Result.failure(it)
            }
        }

        pushNotificationRepository.unsubscribeUserFromTeamNotifications(player.id, syncedTeam.id)
        if (player.id != userRepository.currentUser.value.getOrThrow().id) {
            pushNotificationRepository.sendUserNotification(
                player.id,
                syncedTeam.name.ifBlank { "Team Update" },
                "You have been removed from a team",
            )
        }
        return deleteResult
    }

    override suspend fun createTeam(newTeam: Team): Result<Team> {
        val id = newId()
        val currentUser = userRepository.currentUser.value.getOrThrow()
        val syncedNewTeam = newTeam.withSynchronizedMembership()

        return singleResponse(
            networkCall = {
                val created = api.post<Team, TeamApiDto>(
                    path = "api/teams",
                    body = syncedNewTeam.copy(id = id).withSynchronizedMembership(),
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
            val syncedTeam = newTeam.withSynchronizedMembership()
            val updated = api.patch<UpdateTeamRequestDto, TeamApiDto>(
                path = "api/teams/${syncedTeam.id}",
                body = UpdateTeamRequestDto(team = syncedTeam.toUpdateDto()),
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

    override suspend fun registerForTeam(teamId: String): Result<Team> = singleResponse(
        networkCall = {
            val response = api.post<TeamRegistrationRequestDto, TeamRegistrationResponseDto>(
                path = "api/teams/$teamId/registrations/self",
                body = TeamRegistrationRequestDto(),
            )
            response.error?.takeIf(String::isNotBlank)?.let { message -> error(message) }
            val team = response.team?.toTeamOrNull() ?: error("Team registration response missing team")
            ensureUsersCachedForTeam(team)
            team
        },
        saveCall = { team ->
            databaseService.getTeamDao.upsertTeamWithRelations(team)
            runCatching { userRepository.getCurrentAccount().getOrThrow() }
        },
        onReturn = { team -> team },
    )

    override suspend fun leaveTeam(teamId: String): Result<Team> = singleResponse(
        networkCall = {
            val response = api.delete<TeamRegistrationRequestDto, TeamRegistrationResponseDto>(
                path = "api/teams/$teamId/registrations/self",
                body = TeamRegistrationRequestDto(),
            )
            response.error?.takeIf(String::isNotBlank)?.let { message -> error(message) }
            val team = response.team?.toTeamOrNull() ?: error("Team leave response missing team")
            ensureUsersCachedForTeam(team)
            team
        },
        saveCall = { team ->
            databaseService.getTeamDao.upsertTeamWithRelations(team)
            runCatching { userRepository.getCurrentAccount().getOrThrow() }
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
            setTeamsLoading(userId = id, isLoading = true)
            try {
                fetchRemoteTeamsForUser(userId = id)
            } finally {
                setTeamsLoading(userId = id, isLoading = false)
            }
        }

        return localTeamsFlow
    }

    override fun getTeamsWithPlayersLoadingFlow(id: String): Flow<Boolean> {
        if (id.isBlank()) return flowOf(false)
        return userTeamsLoadingState
            .map { it[id] == true }
            .distinctUntilChanged()
    }

    private suspend fun fetchRemoteTeamsForUser(userId: String): Result<List<Team>> {
        return multiResponse(
            getRemoteData = { fetchRemoteTeamsByMembership(userId) },
            getLocalData = { databaseService.getTeamDao.getTeamsForUser(userId) },
            saveData = { teams -> databaseService.getTeamDao.upsertTeamsWithRelations(teams) },
            deleteData = { staleIds -> databaseService.getTeamDao.deleteTeamsByIds(staleIds) },
        )
    }

    private fun setTeamsLoading(userId: String, isLoading: Boolean) {
        if (userId.isBlank()) return
        val current = userTeamsLoadingState.value.toMutableMap()
        if (isLoading) {
            current[userId] = true
        } else {
            current.remove(userId)
        }
        userTeamsLoadingState.value = current
    }

    override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> =
        singleResponse(
            networkCall = { fetchRemoteTeam(teamId) },
            saveCall = { team -> databaseService.getTeamDao.upsertTeamWithRelations(team) },
            onReturn = { _ -> databaseService.getTeamDao.getTeamWithPlayers(teamId) },
        )

    override fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>> {
        val localFlow = databaseService.getTeamDao.getTeamWithPlayersFlow(id).map { team ->
            team?.let { Result.success(it) }
                ?: Result.failure(
                    NoSuchElementException("Team $id is not available in local cache yet.")
                )
        }
        scope.launch { getTeamWithPlayers(id) }
        return localFlow
    }

    override suspend fun listTeamInvites(userId: String): Result<List<Invite>> = runCatching {
        userRepository.listInvites(userId = userId, type = "TEAM").getOrThrow()
            .filter { it.teamId != null }
    }

    override suspend fun getInviteFreeAgents(teamId: String): Result<List<UserData>> = runCatching {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank)
            ?: return@runCatching emptyList()
        val encodedTeamId = normalizedTeamId.encodeURLQueryComponent()
        val response = api.get<TeamInviteFreeAgentsResponseDto>(
            path = "api/teams/$encodedTeamId/invite-free-agents",
        )
        val users = response.users.mapNotNull { it.toUserDataOrNull() }
        if (users.isNotEmpty()) {
            databaseService.getUserDataDao.upsertUsersData(users)
        }
        users
    }

    override suspend fun createTeamInvite(
        teamId: String,
        userId: String,
        createdBy: String,
        inviteType: String,
    ): Result<Unit> = runCatching {
        api.post<CreateInvitesRequestDto, InvitesResponseDto>(
            path = "api/invites",
            body = CreateInvitesRequestDto(
                invites = listOf(
                    InviteCreateDto(
                        type = inviteType,
                        status = "pending",
                        teamId = teamId,
                        userId = userId,
                        createdBy = createdBy,
                    )
                )
            ),
        )
    }.map { Unit }

    override suspend fun deleteInvite(inviteId: String): Result<Unit> = runCatching {
        api.deleteNoResponse("api/invites/$inviteId")
    }

	    override suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit> = runCatching {
	        // Accepting an invite mutates team membership; this must be done server-side (non-captains cannot PATCH teams).
	        userRepository.acceptInvite(inviteId).getOrThrow()

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

    private suspend fun fetchRemoteTeamsByMembership(userId: String): List<Team> {
        val encoded = userId.encodeURLQueryComponent()
        val res = api.get<TeamsResponseDto>("api/teams?playerId=$encoded&managerId=$encoded&limit=200")
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
        teams.forEach { team ->
            ensureUsersCachedForTeam(team)
        }
    }

    private suspend fun ensureUsersCachedForTeam(team: Team) {
        val syncedTeam = team.withSynchronizedMembership()
        val userIds = buildList {
            syncedTeam.playerRegistrations.forEach { registration ->
                registration.userId.trim().takeIf(String::isNotBlank)?.let(::add)
            }
            syncedTeam.staffAssignments.forEach { assignment ->
                assignment.userId.trim().takeIf(String::isNotBlank)?.let(::add)
            }
        }.distinct().filter(String::isNotBlank)

        if (userIds.isNotEmpty()) {
            userRepository.getUsers(
                userIds = userIds,
                visibilityContext = UserVisibilityContext(teamId = syncedTeam.id),
            ).getOrThrow()
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
