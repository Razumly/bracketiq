package com.razumly.mvp.teamManagement

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
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

interface TeamManagementComponent {
    val selectedEvent: EventAbs?
    val currentUser: UserData
    val friends: StateFlow<List<UserData>>
    val currentTeams: StateFlow<List<TeamWithPlayers>>
    val teamInvites: StateFlow<List<TeamWithPlayers>>
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
}

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultTeamManagementComponent(
    componentContext: ComponentContext,
    eventAbsRepository: IEventAbsRepository,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
    private val freeAgents: List<String>,
    override val selectedEvent: EventAbs?,
    private val navigationHandler: INavigationHandler
) : ComponentContext by componentContext, TeamManagementComponent {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override val onBack = navigationHandler::navigateBack
    private val _errorState = MutableStateFlow<String?>(null)

    override val currentUser = userRepository.currentUser.value.getOrThrow()

    private val _friends = MutableStateFlow<List<UserData>>(listOf())
    override val friends = _friends.asStateFlow()

    override val currentTeams =
        teamRepository.getTeamsWithPlayersFlow(currentUser.id).map { team ->
            team.getOrElse {
                _errorState.value = it.message
                emptyList()
            }
        }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    override val teamInvites =
        teamRepository.getTeamInvitesWithPlayersFlow(currentUser.id).map { team ->
            team.getOrElse {
                _errorState.value = it.message
                emptyList()
            }
        }.stateIn(scope, SharingStarted.Eagerly, emptyList())

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
                val result = userRepository.getUsers(freeAgents.filterNot { it in playerIdsToExclude })
                emit(result.getOrElse {
                    _errorState.value = it.message
                    emptyList()
                })
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    override val enableDeleteTeam = combine(selectedTeam, eventAbsRepository.getUsersEventsFlow()) { team, events ->
        if (events.getOrNull()?.any { it.teamIds.contains(team?.team?.id)} == true)
            false
        else
            team != null
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
    }

    override fun selectTeam(team: TeamWithPlayers?) {
        _selectedTeam.value = team ?: TeamWithPlayers(
            Team(currentUser.id), listOf(currentUser), listOf()
        )
    }

    override fun createTeam(team: Team) {
        scope.launch {
            teamRepository.createTeam(team.copy(captainId = currentUser.id)).onFailure {
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
}