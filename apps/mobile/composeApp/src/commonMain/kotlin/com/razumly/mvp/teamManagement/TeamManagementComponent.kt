package com.razumly.mvp.teamManagement

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
@OptIn(ExperimentalCoroutinesApi::class)

class TeamManagementComponent(
    componentContext: ComponentContext,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
    private val freeAgents: List<String>,
    val selectedEvent: EventAbs?
) : ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<String?>(null)

    val currentUser = userRepository.currentUser

    private val _friends = MutableStateFlow<List<UserData>>(listOf())
    val friends = _friends.asStateFlow()

    val currentTeams = currentUser.map { user ->
        user?.teamIds ?: emptyList()
    }.flatMapLatest { teamIds ->
        teamRepository.getTeamsWithPlayersFlow(teamIds).map { team ->
            team.getOrElse {
                _errorState.value = it.message
                emptyList()
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    val teamInvites = currentUser.map { user ->
        user?.teamInvites ?: emptyList()
    }.flatMapLatest { teamIds ->
        teamRepository.getTeamsWithPlayersFlow(teamIds).map { team ->
            team.getOrElse {
                _errorState.value = it.message
                emptyList()
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _selectedTeam = MutableStateFlow<TeamWithPlayers?>(null)
    val selectedTeam = _selectedTeam.asStateFlow()

    private val _suggestedPlayers = MutableStateFlow<List<UserData>>(listOf())
    val suggestedPlayers = _suggestedPlayers.asStateFlow()

    val freeAgentsFiltered = combine(currentUser, selectedTeam) { user, team ->
        val playerIdsToExclude = buildSet {
            user?.id?.let { add(it) }
            team?.players?.forEach { add(it.id) }
        }
        userRepository.getUsers(freeAgents.filterNot { it in playerIdsToExclude }).getOrElse {
            _errorState.value = it.message
            emptyList()
        }
    }.stateIn(scope, SharingStarted.Eagerly, listOf())

    init {
        scope.launch {
            currentUser.collect { user ->
                _friends.value = user?.friendIds?.let { friends ->
                    userRepository.getUsers(friends).getOrElse {
                        _errorState.value = it.message
                        emptyList()
                    }
                } ?: emptyList()
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

    fun selectTeam(team: TeamWithPlayers?) {
        _selectedTeam.value = team ?: TeamWithPlayers(
            Team(currentUser.value!!.id), listOf(currentUser.value!!), listOf()
        )
    }

    fun createTeam(team: Team) {
        scope.launch {
            teamRepository.createTeam(team).onFailure {
                _errorState.value = it.message
            }
        }
        deselectTeam()
    }

    fun joinTeam(team: Team) {
        scope.launch {
            teamRepository.addPlayerToTeam(team, currentUser.value!!).onFailure {
                _errorState.value = it.message
            }
        }
    }

    fun updateTeam(team: Team) {
        scope.launch {
            teamRepository.updateTeam(team).onFailure {
                _errorState.value = it.message
            }
        }
        deselectTeam()
    }

    fun deselectTeam() {
        _selectedTeam.value = null
    }

    fun searchPlayers(query: String) {
        scope.launch {
            _suggestedPlayers.value = userRepository.searchPlayers(search = query).getOrElse {
                _errorState.value = it.message
                emptyList()
            }.filterNot { user ->
                currentUser.value?.id == user.id
            }
        }
    }
}