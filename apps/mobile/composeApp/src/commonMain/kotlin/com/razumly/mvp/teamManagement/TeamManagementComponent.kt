package com.razumly.mvp.teamManagement

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.INavigationHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.update

interface TeamManagementComponent {
    val selectedEvent: Event?
    val currentUser: UserData
    val selectedFreeAgentId: String?
    val selectedFreeAgent: StateFlow<UserData?>
    val friends: StateFlow<List<UserData>>
    val currentTeams: StateFlow<List<TeamWithPlayers>>
    val teamInvites: StateFlow<List<TeamInvite>>
    val selectedTeam: StateFlow<TeamWithPlayers?>
    val suggestedPlayers: StateFlow<List<UserData>>
    val freeAgentsFiltered: StateFlow<List<UserData>>
    val enableDeleteTeam: StateFlow<Boolean>
    val onBack: () -> Unit

    fun selectTeam(team: TeamWithPlayers?)
    fun createTeam(team: Team)
    fun joinTeam(team: Team)
    fun updateTeam(team: Team)
    fun deselectTeam()
    fun deleteTeam(team: TeamWithPlayers)
    fun searchPlayers(query: String)
    fun inviteUserToRole(teamId: String, userId: String, roleInviteType: String)
    fun acceptTeamInvite(invite: TeamInvite)
    fun declineTeamInvite(invite: TeamInvite)
    suspend fun ensureUserByEmail(email: String): Result<UserData>
}

data class TeamInvite(
    val invite: Invite,
    val team: TeamWithPlayers?
)

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultTeamManagementComponent(
    componentContext: ComponentContext,
    private val eventRepository: IEventRepository,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
    private val freeAgents: List<String>,
    override val selectedEvent: Event?,
    override val selectedFreeAgentId: String?,
    private val navigationHandler: INavigationHandler
) : ComponentContext by componentContext, TeamManagementComponent {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override val onBack = navigationHandler::navigateBack
    private val _errorState = MutableStateFlow<String?>(null)

    override val currentUser = userRepository.currentUser.value.getOrThrow()
    private val normalizedSelectedFreeAgentId = selectedFreeAgentId
        ?.trim()
        ?.takeIf(String::isNotBlank)

    private val _friends = MutableStateFlow<List<UserData>>(listOf())
    override val friends = _friends.asStateFlow()

    override val currentTeams =
        teamRepository.getTeamsWithPlayersFlow(currentUser.id).map { team ->
            team.getOrElse {
                _errorState.value = it.message
                emptyList()
            }
        }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _teamInvites = MutableStateFlow<List<TeamInvite>>(emptyList())
    override val teamInvites = _teamInvites.asStateFlow()

    private val _selectedTeam = MutableStateFlow<TeamWithPlayers?>(null)
    override val selectedTeam = _selectedTeam.asStateFlow()

    private val _suggestedPlayers = MutableStateFlow<List<UserData>>(listOf())
    override val suggestedPlayers = _suggestedPlayers.asStateFlow()

    override val freeAgentsFiltered = selectedTeam
        .flatMapLatest { team ->
            val playerIdsToExclude = buildSet {
                add(currentUser.id) // uses direct value, not flow
                team?.players?.forEach { add(it.id) }
            }

            flow {
                val filteredFreeAgents = freeAgents.filterNot { it in playerIdsToExclude }
                val orderedFreeAgents = normalizedSelectedFreeAgentId?.let { selectedId ->
                    if (filteredFreeAgents.contains(selectedId)) {
                        listOf(selectedId) + filteredFreeAgents.filterNot { it == selectedId }
                    } else {
                        filteredFreeAgents
                    }
                } ?: filteredFreeAgents
                val result = userRepository.getUsers(orderedFreeAgents)
                emit(result.getOrElse {
                    _errorState.value = it.message
                    emptyList()
                })
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

    private val hostEventsFlow =
        eventRepository.getEventsByHostFlow(currentUser.id)

    override val enableDeleteTeam = combine(selectedTeam, hostEventsFlow) { team, eventsResult ->
        val hostEvents = eventsResult.getOrElse {
            _errorState.value = it.message
            emptyList()
        }
        val teamAssigned =
            team?.team?.id?.let { teamId -> hostEvents.any { it.teamIds.contains(teamId) } } == true
        team != null && !teamAssigned
    }.stateIn(scope, SharingStarted.Eagerly, false)

    init {
        scope.launch {
            _friends.value = userRepository.getUsers(currentUser.friendIds).getOrElse {
                _errorState.value = it.message
                emptyList()
            }
        }
        scope.launch {
            currentTeams.collect { teams ->
                if (_selectedTeam.value != null) {
                    _selectedTeam.value =
                        teams.find { team -> team.team.id == _selectedTeam.value!!.team.id }
                }
            }
        }
        scope.launch { refreshInvites() }
    }

    override fun selectTeam(team: TeamWithPlayers?) {
        _selectedTeam.value = team ?: TeamWithPlayers(
            Team(currentUser.id), currentUser,listOf(currentUser), listOf()
        )
    }

    override fun createTeam(team: Team) {
        scope.launch {
            teamRepository.createTeam(
                team.copy(
                    captainId = currentUser.id,
                    managerId = currentUser.id,
                )
            ).onFailure {
                _errorState.value = it.message
            }
        }
        deselectTeam()
    }

    override fun joinTeam(team: Team) {
        scope.launch {
            teamRepository.addPlayerToTeam(team, currentUser).onFailure {
                _errorState.value = it.message
            }
        }
    }

    override fun updateTeam(team: Team) {
        scope.launch {
            teamRepository.updateTeam(team).onFailure {
                _errorState.value = it.message
            }
        }
        deselectTeam()
    }

    override fun deselectTeam() {
        _selectedTeam.value = null
    }

    override fun deleteTeam(team: TeamWithPlayers) {
        scope.launch {
            teamRepository.deleteTeam(team).onFailure {
                _errorState.value = it.message
            }
        }
    }

    override fun searchPlayers(query: String) {
        scope.launch {
            _suggestedPlayers.value = userRepository.searchPlayers(search = query).getOrElse {
                _errorState.value = it.message
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
                _errorState.value = it.message
                return@launch
            }
            refreshInvites()
        }
    }

    override fun acceptTeamInvite(invite: TeamInvite) {
        scope.launch {
            val teamId = invite.invite.teamId
            if (teamId.isNullOrBlank()) {
                _errorState.value = "Invite is missing teamId"
                return@launch
            }

            teamRepository.acceptTeamInvite(invite.invite.id, teamId).onFailure {
                _errorState.value = it.message
                return@launch
            }
            refreshInvites()
        }
    }

    override fun declineTeamInvite(invite: TeamInvite) {
        scope.launch {
            teamRepository.deleteInvite(invite.invite.id)
            refreshInvites()
        }
    }

    override suspend fun ensureUserByEmail(email: String): Result<UserData> {
        return userRepository.ensureUserByEmail(email)
    }

    private suspend fun refreshInvites() {
        val invites = teamRepository.listTeamInvites(currentUser.id).getOrElse {
            _errorState.value = it.message
            emptyList()
        }
        val teamIds = invites.mapNotNull { it.teamId }
        val teams = teamRepository.getTeamsWithPlayers(teamIds).getOrElse {
            _errorState.value = it.message
            emptyList()
        }
        val teamMap = teams.associateBy { it.team.id }
        _teamInvites.update {
            invites.map { invite ->
                TeamInvite(invite = invite, team = invite.teamId?.let(teamMap::get))
            }
        }
    }
}
