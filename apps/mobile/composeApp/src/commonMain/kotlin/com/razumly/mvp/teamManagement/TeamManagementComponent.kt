package com.razumly.mvp.teamManagement

import com.arkivanov.decompose.ComponentContext
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
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class TeamManagementComponent(
    componentContext: ComponentContext,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
) : ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<String?>(null)

    private val currentUser = userRepository.currentUserFlow

    private val _friends = MutableStateFlow<List<UserData>>(listOf())
    val friends = _friends.asStateFlow()

    @OptIn(ExperimentalCoroutinesApi::class)
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

    private val _selectedTeam = MutableStateFlow<TeamWithPlayers?>(null)
    val selectedTeam = _selectedTeam.asStateFlow()

    private val _suggestedPlayers = MutableStateFlow<List<UserData>>(listOf())
    val suggestedPlayers = _suggestedPlayers.asStateFlow()

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
            currentTeams.collect{ teams ->
                if (_selectedTeam.value != null) {
                    _selectedTeam.value =
                        teams.find { team -> team.team.id == _selectedTeam.value!!.team.id }
                }
            }
        }
    }

    fun selectTeam(team: TeamWithPlayers) {
        _selectedTeam.value = team
    }

    fun createTeam() {
        scope.launch { teamRepository.createTeam() }
    }

    fun deselectTeam() {
        _selectedTeam.value = null
    }

    fun changeTeamName(newName: String) {
        scope.launch {
            selectedTeam.value?.team?.let { teamRepository.updateTeam(it.copy(name = newName)) }
        }
    }

    fun addPlayer(player: UserData) {
        scope.launch {
            selectedTeam.value?.team?.let { teamRepository.addPlayerToTeam(it, player) }
        }
    }

    fun removePlayer(player: UserData) {
        scope.launch {
            selectedTeam.value?.team?.let { teamRepository.removePlayerFromTeam(it, player) }
        }
    }

    fun searchPlayers(query: String) {
        scope.launch {
            _suggestedPlayers.value = userRepository.searchPlayers(search = query).getOrElse {
                _errorState.value = it.message
                emptyList()
            }
        }
    }
}