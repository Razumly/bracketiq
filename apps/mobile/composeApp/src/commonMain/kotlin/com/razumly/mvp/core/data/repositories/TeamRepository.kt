package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.dto.CreateInvitesRequestDto
import com.razumly.mvp.core.network.dto.DeleteInvitesRequestDto
import com.razumly.mvp.core.network.dto.InviteCreateDto
import com.razumly.mvp.core.network.dto.InvitesResponseDto
import com.razumly.mvp.core.network.dto.TeamApiDto
import com.razumly.mvp.core.network.dto.TeamInviteFreeAgentsResponseDto
import com.razumly.mvp.core.network.dto.TeamPlayerRegistrationApiDto
import com.razumly.mvp.core.network.dto.TeamRegistrationResponseDto
import com.razumly.mvp.core.network.dto.TeamsResponseDto
import com.razumly.mvp.core.network.dto.UpdateTeamRequestDto
import com.razumly.mvp.core.network.dto.toTeamPlayerRegistrationOrNull
import com.razumly.mvp.core.network.dto.toUpdateDto
import com.razumly.mvp.core.network.dto.toUserDataOrNull
import com.razumly.mvp.core.util.jsonMVP
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
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

interface ITeamRepository : IMVPRepository {
    fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>>
    suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers>
    suspend fun getTeams(ids: List<String>): Result<List<Team>>
    suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>>
    suspend fun getTeamsByOrganization(
        organizationId: String,
        limit: Int = 200,
    ): Result<List<TeamWithPlayers>> = Result.failure(NotImplementedError("Organization team lookup is not implemented."))
    suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit>
    suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit>
    suspend fun createTeam(newTeam: Team): Result<Team>
    suspend fun updateTeam(newTeam: Team): Result<Team>
    suspend fun requestTeamRegistration(teamId: String): Result<TeamRegistrationResult>
    suspend fun requestChildTeamRegistration(
        teamId: String,
        childId: String,
    ): Result<TeamRegistrationResult> = Result.failure(
        NotImplementedError("Child team registration is not implemented."),
    )
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

@Serializable
private data class TeamChildRegistrationRequestDto(
    val childId: String,
)

data class TeamRegistrationConsent(
    val documentId: String? = null,
    val status: String? = null,
    val childEmail: String? = null,
    val requiresChildEmail: Boolean = false,
)

data class TeamRegistrationResult(
    val team: Team,
    val registrationId: String? = null,
    val registration: TeamPlayerRegistration? = null,
    val registrationStatus: String? = null,
    val consent: TeamRegistrationConsent? = null,
    val warnings: List<String> = emptyList(),
)

fun TeamRegistrationResult.isActive(): Boolean =
    registrationStatus.equals("ACTIVE", ignoreCase = true) ||
        registration?.status.equals("ACTIVE", ignoreCase = true)

fun TeamRegistrationResult.requiresAdditionalSigning(): Boolean =
    consent != null && !consent.status.equals("completed", ignoreCase = true)

fun TeamRegistrationResult.requiresChildEmail(): Boolean = consent?.requiresChildEmail == true

fun TeamRegistrationResult.userMessage(defaultMessage: String): String {
    if (requiresChildEmail()) {
        return warnings.firstOrNull()
            ?: "Add the child's email before requesting child-signature documents."
    }
    if (warnings.isNotEmpty()) {
        return warnings.first()
    }
    if (requiresAdditionalSigning()) {
        return "Complete the required team documents before continuing."
    }
    return defaultMessage
}

private fun TeamRegistrationResponseDto.toTeamRegistrationResult(): TeamRegistrationResult {
    error?.takeIf(String::isNotBlank)?.let(::error)
    val resolvedTeam = team?.toTeamOrNull() ?: error("Team registration response missing team")
    return TeamRegistrationResult(
        team = resolvedTeam,
        registrationId = registrationId?.trim()?.takeIf(String::isNotBlank),
        registration = registration?.toTeamPlayerRegistrationOrNull(),
        registrationStatus = status?.trim()?.takeIf(String::isNotBlank)
            ?: registration?.status?.trim()?.takeIf(String::isNotBlank),
        consent = consent?.toConsentOrNull(),
        warnings = warnings.map(String::trim).filter(String::isNotBlank),
    )
}

private fun com.razumly.mvp.core.network.dto.TeamRegistrationConsentDto.toConsentOrNull(): TeamRegistrationConsent? {
    val normalizedStatus = status?.trim()?.takeIf(String::isNotBlank)
    val normalizedDocumentId = documentId?.trim()?.takeIf(String::isNotBlank)
    val normalizedChildEmail = childEmail?.trim()?.takeIf(String::isNotBlank)
    val childEmailRequired = requiresChildEmail == true
    if (normalizedStatus == null && normalizedDocumentId == null && normalizedChildEmail == null && !childEmailRequired) {
        return null
    }
    return TeamRegistrationConsent(
        documentId = normalizedDocumentId,
        status = normalizedStatus,
        childEmail = normalizedChildEmail,
        requiresChildEmail = childEmailRequired,
    )
}

class TeamRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
    private val userRepository: IUserRepository,
    private val pushNotificationRepository: IPushNotificationsRepository,
) : ITeamRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val userTeamsLoadingState = MutableStateFlow<Map<String, Boolean>>(emptyMap())

    private companion object {
        val TEAM_UPDATE_FIELDS = setOf(
            "name",
            "division",
            "playerIds",
            "captainId",
            "managerId",
            "headCoachId",
            "assistantCoachIds",
            "coachIds",
            "parentTeamId",
            "pending",
            "teamSize",
            "profileImageId",
            "sport",
            "divisionTypeId",
            "divisionTypeName",
            "openRegistration",
            "registrationPriceCents",
            "requiredTemplateIds",
            "playerRegistrations",
        )
        val RETRYABLE_TEAM_UPDATE_FIELDS = setOf(
            "assistantCoachIds",
            "parentTeamId",
            "playerRegistrations",
            "openRegistration",
            "registrationPriceCents",
            "requiredTemplateIds",
        )
        val UNRECOGNIZED_KEYS_REGEX = Regex(
            pattern = "Unrecognized key\\(s\\) in object:\\s*(.+)",
            option = RegexOption.IGNORE_CASE,
        )
        val QUOTED_FIELD_REGEX = Regex("'([^']+)'|`([^`]+)`|\"([^\"]+)\"")
    }

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

    override suspend fun getTeamsByOrganization(
        organizationId: String,
        limit: Int,
    ): Result<List<TeamWithPlayers>> = runCatching {
        val normalizedOrganizationId = organizationId.trim()
        if (normalizedOrganizationId.isBlank()) return@runCatching emptyList()
        val teams = fetchRemoteTeamsByOrganization(normalizedOrganizationId, limit)
        if (teams.isEmpty()) {
            return@runCatching emptyList()
        }
        databaseService.getTeamDao.upsertTeamsWithRelations(teams)
        databaseService.getTeamDao.getTeamsWithPlayersFlowByIds(teams.map(Team::id)).first()
    }

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> {
        val syncedTeam = team.withSynchronizedMembership()
        val membershipChanged = !syncedTeam.playerIds.contains(player.id) || syncedTeam.pending.contains(player.id)
        val addResult = runCatching {
            databaseService.getTeamDao.upsertTeamPlayerCrossRef(
                TeamPlayerCrossRef(syncedTeam.id, player.id)
            )
        }

        if (membershipChanged) {
            val updatedTeam = syncedTeam.copy(
                playerIds = (syncedTeam.playerIds + player.id).distinct(),
                pending = syncedTeam.pending - player.id,
            ).withSynchronizedMembership()
            updateTeam(updatedTeam).onFailure {
                databaseService.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(syncedTeam.id, player.id))
                return Result.failure(it)
            }
        }
        if (membershipChanged) {
            refreshCurrentUserProfileIfAffected(player.id)
        }

        pushNotificationRepository.subscribeUserToTeamNotifications(player.id, syncedTeam.id)
        return addResult
    }

    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> {
        val syncedTeam = team.withSynchronizedMembership()
        val membershipChanged = syncedTeam.playerIds.contains(player.id)
        val deleteResult = runCatching {
            databaseService.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(syncedTeam.id, player.id))
        }

        if (membershipChanged) {
            val updatedTeam = syncedTeam.copy(playerIds = syncedTeam.playerIds - player.id)
                .withSynchronizedMembership()
            updateTeam(updatedTeam).onFailure {
                databaseService.getTeamDao.upsertTeamPlayerCrossRef(TeamPlayerCrossRef(syncedTeam.id, player.id))
                return Result.failure(it)
            }
        }
        if (membershipChanged) {
            refreshCurrentUserProfileIfAffected(player.id)
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
                refreshCurrentUserProfileIfAffected(currentUser.id)

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
            val cachedTeam = runCatching { databaseService.getTeamDao.getTeam(syncedTeam.id) }.getOrNull()
            val preparedUpdate = prepareTeamUpdate(
                newTeam = syncedTeam,
                cachedTeam = cachedTeam,
            )
            if (preparedUpdate == null) {
                return@singleResponse syncedTeam
            }

            val updated = try {
                patchTeamUpdate(teamId = syncedTeam.id, request = preparedUpdate.request)
            } catch (error: ApiException) {
                if (error.statusCode != 400) {
                    throw error
                }
                val retryFields = extractRetryableUnknownTeamUpdateFields(error.responseBody)
                    .intersect(preparedUpdate.includedFields)
                if (retryFields.isEmpty()) {
                    throw error
                }
                val retryPreparedUpdate = prepareTeamUpdate(
                    newTeam = syncedTeam,
                    cachedTeam = cachedTeam,
                    omitFields = retryFields,
                )
                if (retryPreparedUpdate == null || retryPreparedUpdate.includedFields.isEmpty()) {
                    throw error
                }
                patchTeamUpdate(
                    teamId = syncedTeam.id,
                    request = retryPreparedUpdate.request,
                )
            }

            ensureUsersCachedForTeam(updated)
            updated
        },
        saveCall = { newData ->
            val oldTeam = runCatching { databaseService.getTeamDao.getTeam(newData.id) }.getOrNull()

            databaseService.getTeamDao.upsertTeamWithRelations(newData)

            if (oldTeam != null) {
                // Propagate player removals to local membership cache and notifications.
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

    override suspend fun requestTeamRegistration(teamId: String): Result<TeamRegistrationResult> = runCatching {
        val response = api.post<TeamRegistrationRequestDto, TeamRegistrationResponseDto>(
            path = "api/teams/$teamId/registrations/self",
            body = TeamRegistrationRequestDto(),
        )
        val result = response.toTeamRegistrationResult()
        ensureUsersCachedForTeam(result.team)
        databaseService.getTeamDao.upsertTeamWithRelations(result.team)
        runCatching { userRepository.getCurrentAccount().getOrThrow() }
        result
    }

    override suspend fun requestChildTeamRegistration(
        teamId: String,
        childId: String,
    ): Result<TeamRegistrationResult> = runCatching {
        val normalizedChildId = childId.trim().takeIf(String::isNotBlank)
            ?: error("Child id is required.")
        val response = api.post<TeamChildRegistrationRequestDto, TeamRegistrationResponseDto>(
            path = "api/teams/$teamId/registrations/child",
            body = TeamChildRegistrationRequestDto(childId = normalizedChildId),
        )
        val result = response.toTeamRegistrationResult()
        ensureUsersCachedForTeam(result.team)
        databaseService.getTeamDao.upsertTeamWithRelations(result.team)
        runCatching { userRepository.getCurrentAccount().getOrThrow() }
        result
    }

    override suspend fun registerForTeam(teamId: String): Result<Team> =
        requestTeamRegistration(teamId).mapCatching { result ->
            if (!result.isActive()) {
                error(result.userMessage("Team registration requires additional steps."))
            }
            result.team
        }

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
        val syncedTeam = team.team.withSynchronizedMembership()
        api.deleteNoResponse("api/teams/${syncedTeam.id}")
        databaseService.getTeamDao.deleteTeam(syncedTeam)
        refreshCurrentUserProfileIfTeamMember(syncedTeam)
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

    private suspend fun refreshCurrentUserProfileIfAffected(vararg userIds: String?) {
        val currentUserId = userRepository.currentUser.value.getOrNull()?.id
            ?: userRepository.currentAccount.value.getOrNull()?.id
            ?: return
        if (userIds.any { candidateId -> candidateId == currentUserId }) {
            runCatching { userRepository.refreshCurrentUserProfile().getOrThrow() }
        }
    }

    private suspend fun refreshCurrentUserProfileIfTeamMember(team: Team) {
        val currentUserId = userRepository.currentUser.value.getOrNull()?.id
            ?: userRepository.currentAccount.value.getOrNull()?.id
            ?: return
        val syncedTeam = team.withSynchronizedMembership()
        val isCurrentUserMember = currentUserId in syncedTeam.playerIds ||
            syncedTeam.managerId == currentUserId ||
            syncedTeam.headCoachId == currentUserId ||
            currentUserId in syncedTeam.coachIds
        if (isCurrentUserMember) {
            runCatching { userRepository.refreshCurrentUserProfile().getOrThrow() }
        }
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

    private suspend fun fetchRemoteTeamsByOrganization(
        organizationId: String,
        limit: Int,
    ): List<Team> {
        val encodedOrganizationId = organizationId.encodeURLQueryComponent()
        val safeLimit = limit.coerceAtLeast(1)
        val res = api.get<TeamsResponseDto>("api/teams?organizationId=$encodedOrganizationId&limit=$safeLimit")
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

    private suspend fun patchTeamUpdate(
        teamId: String,
        request: UpdateTeamRequestDto,
    ): Team {
        return api.patch<UpdateTeamRequestDto, TeamApiDto>(
            path = "api/teams/$teamId",
            body = request,
        ).toTeamOrNull() ?: error("Update team response missing team")
    }

    private fun prepareTeamUpdate(
        newTeam: Team,
        cachedTeam: Team?,
        omitFields: Set<String> = emptySet(),
    ): PreparedTeamUpdate? {
        val syncedNewTeam = newTeam.withSynchronizedMembership()
        val syncedCachedTeam = cachedTeam?.withSynchronizedMembership()
        val changedFields = syncedCachedTeam
            ?.let { existingTeam -> diffTeamUpdateFields(existingTeam = existingTeam, updatedTeam = syncedNewTeam) }
            ?: TEAM_UPDATE_FIELDS
        if (changedFields.isEmpty()) {
            return null
        }

        val includedFields = changedFields - omitFields
        return PreparedTeamUpdate(
            request = UpdateTeamRequestDto(
                team = syncedNewTeam.toUpdateDto(
                    omitFields = omitFields,
                    includeFields = syncedCachedTeam?.let { includedFields },
                ),
            ),
            includedFields = includedFields,
        )
    }

    private fun diffTeamUpdateFields(
        existingTeam: Team,
        updatedTeam: Team,
    ): Set<String> = buildSet {
        if (existingTeam.name != updatedTeam.name) add("name")
        if (existingTeam.division != updatedTeam.division) add("division")
        if (existingTeam.playerIds != updatedTeam.playerIds) add("playerIds")
        if (existingTeam.captainId != updatedTeam.captainId) add("captainId")
        if (existingTeam.managerId != updatedTeam.managerId) add("managerId")
        if (existingTeam.headCoachId != updatedTeam.headCoachId) add("headCoachId")
        if (existingTeam.assistantCoachIds != updatedTeam.assistantCoachIds) {
            add("assistantCoachIds")
            add("coachIds")
        }
        if (existingTeam.parentTeamId != updatedTeam.parentTeamId) add("parentTeamId")
        if (existingTeam.pending != updatedTeam.pending) add("pending")
        if (existingTeam.teamSize != updatedTeam.teamSize) add("teamSize")
        if (existingTeam.profileImageId != updatedTeam.profileImageId) add("profileImageId")
        if (existingTeam.sport != updatedTeam.sport) add("sport")
        if (existingTeam.divisionTypeId != updatedTeam.divisionTypeId) add("divisionTypeId")
        if (existingTeam.divisionTypeName != updatedTeam.divisionTypeName) add("divisionTypeName")
        if (existingTeam.openRegistration != updatedTeam.openRegistration) add("openRegistration")
        if (existingTeam.registrationPriceCents != updatedTeam.registrationPriceCents) add("registrationPriceCents")
        if (existingTeam.requiredTemplateIds != updatedTeam.requiredTemplateIds) add("requiredTemplateIds")
        if (!playerRegistrationsEquivalent(existingTeam, updatedTeam)) add("playerRegistrations")
    }

    private fun playerRegistrationsEquivalent(
        existingTeam: Team,
        updatedTeam: Team,
    ): Boolean {
        return existingTeam.toUpdateDto(includeFields = setOf("playerRegistrations")).playerRegistrations ==
            updatedTeam.toUpdateDto(includeFields = setOf("playerRegistrations")).playerRegistrations
    }

    private fun extractRetryableUnknownTeamUpdateFields(responseBody: String?): Set<String> {
        val normalizedBody = responseBody?.trim()?.takeIf(String::isNotBlank) ?: return emptySet()
        val fields = mutableSetOf<String>()
        val json = runCatching { jsonMVP.parseToJsonElement(normalizedBody) }.getOrNull()
        if (json != null) {
            collectUnknownKeysFromJson(json, fields)
            collectStringLeaves(json).forEach { message ->
                fields += extractUnknownKeysFromMessage(message)
            }
        } else {
            fields += extractUnknownKeysFromMessage(normalizedBody)
        }
        return fields.intersect(RETRYABLE_TEAM_UPDATE_FIELDS)
    }

    private fun collectUnknownKeysFromJson(
        element: JsonElement,
        fields: MutableSet<String>,
    ) {
        when (element) {
            is JsonObject -> {
                (element["unknownKeys"] as? JsonArray)
                    ?.mapNotNull { entry -> (entry as? JsonPrimitive)?.contentOrNull?.trim() }
                    ?.filter(String::isNotBlank)
                    ?.forEach(fields::add)
                element.values.forEach { value -> collectUnknownKeysFromJson(value, fields) }
            }

            is JsonArray -> element.forEach { value -> collectUnknownKeysFromJson(value, fields) }
            is JsonPrimitive -> Unit
        }
    }

    private fun collectStringLeaves(element: JsonElement): Sequence<String> = sequence {
        when (element) {
            is JsonObject -> element.values.forEach { value -> yieldAll(collectStringLeaves(value)) }
            is JsonArray -> element.forEach { value -> yieldAll(collectStringLeaves(value)) }
            is JsonPrimitive -> {
                element.contentOrNull?.takeIf(String::isNotBlank)?.let { value -> yield(value) }
            }
        }
    }

    private fun extractUnknownKeysFromMessage(message: String): Set<String> {
        val normalizedMessage = message.trim()
        val unknownKeysMessage = UNRECOGNIZED_KEYS_REGEX.find(normalizedMessage)
            ?.groupValues
            ?.getOrNull(1)
            ?: return emptySet()
        return QUOTED_FIELD_REGEX.findAll(unknownKeysMessage)
            .mapNotNull { match ->
                match.groupValues.drop(1).firstOrNull(String::isNotBlank)
            }
            .toSet()
    }

    private data class PreparedTeamUpdate(
        val request: UpdateTeamRequestDto,
        val includedFields: Set<String>,
    )

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
