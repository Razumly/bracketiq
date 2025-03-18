package com.razumly.mvp.teamManagement

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.MVPRepository
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class TeamManagementComponent(
    componentContext: ComponentContext,
    val mvpRepository: MVPRepository,
) : ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val currentUser = mvpRepository.getCurrentUserFlow().stateIn(
        scope, SharingStarted.Eagerly, null
    )

    private val _friends = MutableStateFlow<List<UserData>>(listOf())
    val friends = _friends.asStateFlow()

    @OptIn(ExperimentalCoroutinesApi::class)
    val currentTeams = currentUser.map { user ->
        user?.teams?.map { it.id } ?: emptyList()
    }.distinctUntilChanged().flatMapLatest { teamIds ->
        mvpRepository.getTeamsWithPlayers(teamIds)
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _selectedTeam = MutableStateFlow<TeamWithPlayers?>(null)
    val selectedTeam = _selectedTeam.asStateFlow()

    private val _suggestedPlayers = MutableStateFlow<List<UserData>>(listOf())
    val suggestedPlayers = _suggestedPlayers.asStateFlow()

    init {
        scope.launch {
            currentUser.collect { user ->
                _friends.value = mvpRepository.getPlayers(user?.user?.friendIds) ?: listOf()
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
        scope.launch { mvpRepository.createTeam() }
    }

    fun deselectTeam() {
        _selectedTeam.value = null
    }

    fun changeTeamName(newName: String) {
        scope.launch {
            selectedTeam.value?.team?.let { mvpRepository.changeTeamName(it.copy(name = newName)) }
        }
    }

    fun addPlayer(player: UserData) {
        scope.launch {
            selectedTeam.value?.team?.let { mvpRepository.addPlayerToTeam(it, player) }
        }
    }

    fun removePlayer(player: UserData) {
        scope.launch {
            selectedTeam.value?.team?.let { mvpRepository.removePlayerFromTeam(it, player) }
        }
    }

    fun searchPlayers(query: String) {
        scope.launch { _suggestedPlayers.value = mvpRepository.getPlayers(query = query) ?: listOf() }
    }
}