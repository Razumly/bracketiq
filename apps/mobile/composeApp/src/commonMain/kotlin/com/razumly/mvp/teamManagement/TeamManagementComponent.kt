package com.razumly.mvp.teamManagement

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ISportsRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserVisibilityContext
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.util.LoadingHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

interface TeamManagementComponent {
    val selectedEvent: Event?
    val currentUser: UserData
    val selectedFreeAgentId: String?
    val selectedFreeAgent: StateFlow<UserData?>
    val sports: StateFlow<List<Sport>>
    val friends: StateFlow<List<UserData>>
    val currentTeams: StateFlow<List<TeamWithPlayers>>
    val selectedTeam: StateFlow<TeamWithPlayers?>
    val staffUsersById: StateFlow<Map<String, UserData>>
    val suggestedPlayers: StateFlow<List<UserData>>
    val freeAgentsFiltered: StateFlow<List<UserData>>
    val enableDeleteTeam: StateFlow<Boolean>
    val onBack: () -> Unit

    fun setLoadingHandler(handler: LoadingHandler)
    fun selectTeam(team: TeamWithPlayers?)
    fun createTeam(team: Team)
    fun joinTeam(team: Team)
    fun updateTeam(team: Team)
    fun deselectTeam()
    fun deleteTeam(team: TeamWithPlayers)
    fun searchPlayers(query: String)
    fun inviteUserToRole(teamId: String, userId: String, roleInviteType: String)
    suspend fun ensureUserByEmail(email: String): Result<UserData>
}

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultTeamManagementComponent(
    componentContext: ComponentContext,
    private val eventRepository: IEventRepository,
    private val sportsRepository: ISportsRepository,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
    @Suppress("UNUSED_PARAMETER")
    _legacyFreeAgents: List<String>,
    override val selectedEvent: Event?,
    override val selectedFreeAgentId: String?,
    private val navigationHandler: INavigationHandler
) : ComponentContext by componentContext, TeamManagementComponent {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var loadingHandler: LoadingHandler? = null

    override val onBack = navigationHandler::navigateBack
    private val _errorState = MutableStateFlow<String?>(null)

    private val currentUserState = userRepository.currentUser
        .map { result -> result.getOrNull() ?: UserData() }
        .stateIn(scope, SharingStarted.Eagerly, UserData())
    override val currentUser: UserData
        get() = currentUserState.value
    private val currentUserIdFlow = currentUserState
        .map { user -> user.id.trim() }
        .distinctUntilChanged()
    private val normalizedSelectedFreeAgentId = selectedFreeAgentId
        ?.trim()
        ?.takeIf(String::isNotBlank)

    private val _friends = MutableStateFlow<List<UserData>>(listOf())
    override val friends = _friends.asStateFlow()

    private val _sports = MutableStateFlow<List<Sport>>(emptyList())
    override val sports = _sports.asStateFlow()

    override val currentTeams = currentUserIdFlow
        .flatMapLatest { currentUserId ->
            if (currentUserId.isBlank()) {
                flowOf(Result.success(emptyList()))
            } else {
                teamRepository.getTeamsWithPlayersFlow(currentUserId)
            }
        }.map { team ->
            team.getOrElse {
                _errorState.value = it.userMessage()
                emptyList()
            }
        }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _selectedTeam = MutableStateFlow<TeamWithPlayers?>(null)
    override val selectedTeam = _selectedTeam.asStateFlow()

    private val _staffUsersById = MutableStateFlow<Map<String, UserData>>(emptyMap())
    override val staffUsersById = _staffUsersById.asStateFlow()

    private val _suggestedPlayers = MutableStateFlow<List<UserData>>(listOf())
    override val suggestedPlayers = _suggestedPlayers.asStateFlow()

    override val freeAgentsFiltered = combine(selectedTeam, currentUserState) { team, user ->
        team to user
    }.flatMapLatest { (team, currentUserValue) ->
            val teamId = team?.team?.id?.trim()?.takeIf(String::isNotBlank)
            val playerIdsToExclude = buildSet {
                currentUserValue.id.takeIf(String::isNotBlank)?.let(::add)
                team?.players?.forEach { add(it.id) }
            }

            flow {
                if (teamId == null) {
                    emit(emptyList())
                    return@flow
                }

                val inviteFreeAgents = teamRepository.getInviteFreeAgents(teamId).getOrElse {
                    _errorState.value = it.userMessage()
                    emptyList()
                }
                val filteredFreeAgents = inviteFreeAgents.filterNot { it.id in playerIdsToExclude }
                val orderedFreeAgents = normalizedSelectedFreeAgentId?.let { selectedId ->
                    if (filteredFreeAgents.any { it.id == selectedId }) {
                        val prioritized = filteredFreeAgents.firstOrNull { it.id == selectedId }
                        listOfNotNull(prioritized) + filteredFreeAgents.filterNot { it.id == selectedId }
                    } else {
                        filteredFreeAgents
                    }
                } ?: filteredFreeAgents
                emit(orderedFreeAgents)
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    override val selectedFreeAgent = freeAgentsFiltered
        .map { users ->
            normalizedSelectedFreeAgentId?.let { selectedId ->
                users.firstOrNull { it.id == selectedId }
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, null)

    private val hostEventsFlow = currentUserIdFlow.flatMapLatest { currentUserId ->
        if (currentUserId.isBlank()) {
            flowOf(Result.success(emptyList()))
        } else {
            eventRepository.getEventsByHostFlow(currentUserId)
        }
    }

    override val enableDeleteTeam = combine(selectedTeam, hostEventsFlow) { team, eventsResult ->
        val hostEvents = eventsResult.getOrElse {
            _errorState.value = it.userMessage()
            emptyList()
        }
        val teamAssigned =
            team?.team?.id?.let { teamId -> hostEvents.any { it.teamIds.contains(teamId) } } == true
        team != null && !teamAssigned
    }.stateIn(scope, SharingStarted.Eagerly, false)

    init {
        scope.launch {
            currentUserState
                .map { user -> user.friendIds }
                .distinctUntilChanged()
                .collect { friendIds ->
                    _friends.value = if (friendIds.isEmpty()) {
                        emptyList()
                    } else {
                        userRepository.getUsers(friendIds).getOrElse {
                            _errorState.value = it.userMessage()
                            emptyList()
                        }
                    }
                }
            }
        scope.launch {
            _sports.value = sportsRepository.getSports().getOrElse {
                _errorState.value = it.userMessage()
                emptyList()
            }
        }
        scope.launch {
            currentTeams.collect { teams ->
                if (_selectedTeam.value != null) {
                    val updatedSelectedTeam =
                        teams.find { team -> team.team.id == _selectedTeam.value!!.team.id }
                    _selectedTeam.value = updatedSelectedTeam
                    refreshSelectedTeamStaffUsers(updatedSelectedTeam)
                }
            }
        }
    }

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    override fun selectTeam(team: TeamWithPlayers?) {
        val resolvedTeam = team ?: TeamWithPlayers(
            Team(currentUser.id), currentUser, listOf(currentUser), listOf()
        )
        _selectedTeam.value = resolvedTeam
        refreshSelectedTeamStaffUsers(resolvedTeam)
    }

    override fun createTeam(team: Team) {
        deselectTeam()
        scope.launch {
            try {
                loadingHandler?.showLoading("Creating team...")
                val createResult = teamRepository.createTeam(
                    team.copy(
                        captainId = currentUser.id,
                        managerId = currentUser.id,
                    )
                )

                createResult.onFailure {
                    _errorState.value = it.userMessage()
                    return@launch
                }

                val createdTeam = createResult.getOrNull() ?: return@launch

                loadingHandler?.showLoading("Fetching teams...")
                val teamIdsToRefresh = (currentTeams.value.map { teamWithPlayers ->
                    teamWithPlayers.team.id
                } + createdTeam.id)
                    .filter(String::isNotBlank)
                    .distinct()

                if (teamIdsToRefresh.isNotEmpty()) {
                    teamRepository.getTeamsWithPlayers(teamIdsToRefresh).onFailure {
                        _errorState.value = it.userMessage()
                    }
                }
            } finally {
                loadingHandler?.hideLoading()
            }
        }
    }

    override fun joinTeam(team: Team) {
        scope.launch {
            teamRepository.addPlayerToTeam(team, currentUser).onFailure {
                _errorState.value = it.userMessage()
            }
        }
    }

    override fun updateTeam(team: Team) {
        scope.launch {
            teamRepository.updateTeam(team).onFailure {
                _errorState.value = it.userMessage()
            }
        }
        deselectTeam()
    }

    override fun deselectTeam() {
        _selectedTeam.value = null
        _staffUsersById.value = emptyMap()
    }

    override fun deleteTeam(team: TeamWithPlayers) {
        scope.launch {
            teamRepository.deleteTeam(team).onFailure {
                _errorState.value = it.userMessage()
            }
        }
    }

    override fun searchPlayers(query: String) {
        scope.launch {
            _suggestedPlayers.value = userRepository.searchPlayers(search = query).getOrElse {
                _errorState.value = it.userMessage()
                emptyList()
            }.filterNot { user ->
                currentUser.id == user.id
            }
        }
    }

    override fun inviteUserToRole(teamId: String, userId: String, roleInviteType: String) {
        scope.launch {
            teamRepository.createTeamInvite(
                teamId = teamId,
                userId = userId,
                createdBy = currentUser.id,
                inviteType = roleInviteType,
            ).onFailure {
                _errorState.value = it.userMessage()
                return@launch
            }
        }
    }

    override suspend fun ensureUserByEmail(email: String): Result<UserData> {
        return userRepository.ensureUserByEmail(email)
    }

    private fun refreshSelectedTeamStaffUsers(team: TeamWithPlayers?) {
        if (team == null) {
            _staffUsersById.value = emptyMap()
            return
        }

        val selectedTeamId = team.team.id
        val knownUsers = buildKnownUsers(team)
        val staffIds = buildSet {
            add(team.team.managerId ?: team.team.captainId)
            team.team.headCoachId?.takeIf(String::isNotBlank)?.let(::add)
            team.team.coachIds.filter(String::isNotBlank).forEach(::add)
        }

        val missingUserIds = staffIds.filterNot { knownUsers.containsKey(it) }
        if (missingUserIds.isEmpty()) {
            _staffUsersById.value = knownUsers
            return
        }

        scope.launch {
            val fetchedUsers = userRepository.getUsers(
                userIds = missingUserIds,
                visibilityContext = UserVisibilityContext(teamId = selectedTeamId),
            ).getOrElse {
                _errorState.value = it.userMessage()
                emptyList()
            }
            if (_selectedTeam.value?.team?.id != selectedTeamId) {
                return@launch
            }
            _staffUsersById.value = knownUsers + fetchedUsers.associateBy { it.id }
        }
    }

    private fun buildKnownUsers(team: TeamWithPlayers): Map<String, UserData> = buildMap {
        team.captain?.let { captain -> put(captain.id, captain) }
        team.players.forEach { put(it.id, it) }
        team.pendingPlayers.forEach { put(it.id, it) }
    }
}
