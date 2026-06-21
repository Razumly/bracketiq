package com.razumly.mvp.wear

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.razumly.mvp.wear.auth.WearAuthSyncEvents
import com.razumly.mvp.wear.auth.WearMatchSyncEvents
import com.razumly.mvp.wear.data.WearApiClient
import com.razumly.mvp.wear.data.WearAuthTokenStore
import com.razumly.mvp.wear.data.WearIncidentTypeDefinitionDto
import com.razumly.mvp.wear.data.WearMatch
import com.razumly.mvp.wear.data.WearMatchDto
import com.razumly.mvp.wear.data.WearMatchIncidentDto
import com.razumly.mvp.wear.data.WearMatchOperationStore
import com.razumly.mvp.wear.data.WearMatchPhoneSync
import com.razumly.mvp.wear.data.WearMatchRepository
import com.razumly.mvp.wear.data.WearPlayer
import com.razumly.mvp.wear.data.WearTeam
import com.razumly.mvp.wear.data.isScoring
import com.razumly.mvp.wear.data.normalizedId
import com.razumly.mvp.wear.data.resolvedId
import com.razumly.mvp.wear.data.requiresPlayer
import com.razumly.mvp.wear.data.toUserMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MvpWearViewModel(application: Application) : AndroidViewModel(application) {
    private val tokenStore = WearAuthTokenStore(application.applicationContext)
    private val operationStore = WearMatchOperationStore(application.applicationContext)
    private val phoneSync = WearMatchPhoneSync(application.applicationContext)
    private val repository = WearMatchRepository(
        api = WearApiClient(tokenStore),
        tokenStore = tokenStore,
        operationStore = operationStore,
        phoneSync = phoneSync,
    )

    private val _state = MutableStateFlow(MvpWearUiState())
    val state: StateFlow<MvpWearUiState> = _state.asStateFlow()
    private var demoMode = false

    init {
        bootstrap()
        viewModelScope.launch {
            WearAuthSyncEvents.tokenUpdates.collect {
                if (!demoMode) bootstrap()
            }
        }
        viewModelScope.launch {
            WearMatchSyncEvents.matchUpdates.collect { matchId ->
                refreshCachedMatch(matchId)
            }
        }
    }

    internal fun applyDebugDemoState(state: MvpWearUiState) {
        demoMode = true
        _state.value = state.copy(isDemo = true)
    }

    fun updateEmail(value: String) {
        _state.update { it.copy(email = value, error = null, message = null) }
    }

    fun updatePassword(value: String) {
        _state.update { it.copy(password = value, error = null, message = null) }
    }

    fun signIn() {
        val email = state.value.email.trim()
        val password = state.value.password
        if (email.isBlank() || password.isBlank()) {
            _state.update { it.copy(error = "Enter email and password.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            val session = try {
                withContext(Dispatchers.IO) { repository.login(email, password) }
            } catch (throwable: Throwable) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = throwable.toUserMessage(),
                    )
                }
                return@launch
            }
            _state.update {
                it.copy(
                    route = WearRoute.MATCHES,
                    isAuthenticated = true,
                    currentUserId = session.userId,
                    currentUserLabel = session.label,
                    password = "",
                    error = null,
                    message = null,
                    isLoading = false,
                )
            }
            viewModelScope.launch { refreshMatchesAfterAuth() }
        }
    }

    fun logout() {
        repository.logout()
        _state.value = MvpWearUiState(route = WearRoute.LOGIN)
    }

    fun refresh() {
        if (!state.value.isAuthenticated) return
        launchBusy {
            reloadMatches(preserveSelection = true)
        }
    }

    private fun refreshCachedMatch(matchId: String) {
        val raw = repository.cachedMatch(matchId) ?: return
        _state.update { current ->
            val match = current.matches.firstOrNull { it.id == matchId } ?: return@update current
            current.withUpdatedMatch(match.withUpdatedRaw(raw, current.currentUserId))
        }
    }

    fun selectMatch(matchId: String) {
        _state.update {
            it.copy(
                route = WearRoute.MATCH_DETAIL,
                selectedMatchId = matchId,
                selectedTeamId = null,
                selectedIncidentCode = null,
                selectedPlayerUserId = null,
                selectedIncidentId = null,
                incidentMode = null,
                error = null,
                message = null,
            )
        }
    }

    fun back() {
        _state.update { current ->
            when (current.route) {
                WearRoute.LOGIN -> current
                WearRoute.MATCHES -> current
                WearRoute.MATCH_DETAIL -> current.copy(route = WearRoute.MATCHES)
                WearRoute.TIMER -> current.copy(route = WearRoute.MATCH_DETAIL)
                WearRoute.TEAM_PICK -> current.copy(route = WearRoute.TIMER)
                WearRoute.ACTION_MENU -> current.copy(route = WearRoute.TEAM_PICK)
                WearRoute.INCIDENT_LIST -> current.copy(route = WearRoute.ACTION_MENU)
                WearRoute.INCIDENT_EDITOR -> {
                    current.clearIncidentDraft().copy(
                        route = if (current.incidentMode == WearIncidentMode.EDIT) {
                            WearRoute.INCIDENT_LIST
                        } else {
                            WearRoute.TEAM_PICK
                        },
                    )
                }
                WearRoute.INCIDENT_TYPES -> current.copy(
                    route = if (current.incidentMode == WearIncidentMode.CREATE) {
                        WearRoute.TEAM_PICK
                    } else {
                        WearRoute.INCIDENT_EDITOR
                    },
                    error = null,
                )
                WearRoute.INCIDENT_TEAMS -> current.copy(
                    route = if (current.incidentMode == WearIncidentMode.CREATE) {
                        WearRoute.INCIDENT_TYPES
                    } else {
                        WearRoute.INCIDENT_EDITOR
                    },
                    error = null,
                )
                WearRoute.PLAYERS -> current.copy(
                    route = if (current.incidentMode == WearIncidentMode.CREATE) {
                        WearRoute.INCIDENT_TYPES
                    } else {
                        WearRoute.INCIDENT_EDITOR
                    },
                    error = null,
                )
                WearRoute.TIME_PICK -> current.copy(
                    route = if (current.incidentMode == WearIncidentMode.CREATE) {
                        current.routeBeforeIncidentTime()
                    } else {
                        WearRoute.INCIDENT_EDITOR
                    },
                    error = null,
                )
            }
        }
    }

    fun checkIn() = runMatchAction(null, WearRoute.MATCH_DETAIL) { repository.checkIn(it) }

    fun startTimer() = runMatchAction(null, WearRoute.TIMER) { repository.startCurrentSegment(it) }

    fun openTimer() {
        if (state.value.selectedMatch == null) return
        _state.update { it.copy(route = WearRoute.TIMER, error = null, message = null) }
    }

    fun resetTimer() = runMatchAction("Timer reset.", WearRoute.MATCH_DETAIL) { repository.resetCurrentSegment(it) }

    fun endSegment() = runMatchAction("Segment ended.", WearRoute.MATCH_DETAIL) { repository.endCurrentSegment(it) }

    fun startNextSegment() = runMatchAction(null, WearRoute.TIMER) { repository.startNextSegmentOrOvertime(it) }

    fun endMatch() = runMatchAction("Match ended.", WearRoute.MATCH_DETAIL) { repository.endMatch(it) }

    fun showTeamPicker() {
        if (state.value.selectedMatch == null) return
        _state.update {
            it.copy(
                route = WearRoute.TEAM_PICK,
                selectedTeamId = null,
                selectedIncidentId = null,
                incidentMode = null,
                error = null,
                message = null,
            )
        }
    }

    fun showActionMenu() {
        if (state.value.selectedMatch == null) return
        _state.update {
            it.copy(
                route = WearRoute.ACTION_MENU,
                selectedTeamId = null,
                selectedIncidentId = null,
                incidentMode = null,
                error = null,
                message = null,
            )
        }
    }

    fun showIncidentList() {
        if (state.value.selectedMatch == null) return
        _state.update {
            it.copy(
                route = WearRoute.INCIDENT_LIST,
                selectedIncidentId = null,
                incidentMode = null,
                error = null,
                message = null,
            )
        }
    }

    fun selectTeam(teamId: String) {
        when (state.value.route) {
            WearRoute.TEAM_PICK -> beginIncidentCreate(teamId)
            WearRoute.INCIDENT_TEAMS -> selectIncidentTeam(teamId)
            else -> beginIncidentCreate(teamId)
        }
    }

    fun openIncidentEditor(incidentId: String) {
        val current = state.value
        val match = current.selectedMatch ?: return
        val incident = match.raw.incidents.firstOrNull { it.resolvedId() == incidentId } ?: return
        val clockSeconds = incident.clockSeconds ?: secondsForMinute(incident.minute ?: 0)
        _state.update {
            it.copy(
                route = WearRoute.INCIDENT_EDITOR,
                selectedIncidentId = incident.resolvedId(),
                selectedTeamId = incident.eventTeamId.normalizedId(),
                selectedIncidentCode = incident.incidentType,
                selectedPlayerUserId = incident.participantUserId.normalizedId(),
                incidentMinute = incident.minute ?: minuteForClockSeconds(clockSeconds),
                incidentClockSeconds = clockSeconds,
                incidentMode = WearIncidentMode.EDIT,
                error = null,
                message = null,
            )
        }
    }

    fun editIncidentField(field: WearIncidentField) {
        val current = state.value
        val match = current.selectedMatch ?: return
        val nextRoute = when (field) {
            WearIncidentField.TYPE -> WearRoute.INCIDENT_TYPES
            WearIncidentField.TEAM -> WearRoute.INCIDENT_TEAMS
            WearIncidentField.PLAYER -> {
                val type = current.selectedIncidentType
                val team = current.selectedTeam
                when {
                    type == null -> WearRoute.INCIDENT_TYPES
                    team == null -> WearRoute.INCIDENT_TEAMS
                    type.isScoring() && !type.requiresPlayer(match.rules) -> WearRoute.TIME_PICK
                    else -> WearRoute.PLAYERS
                }
            }
            WearIncidentField.TIME -> WearRoute.TIME_PICK
        }
        _state.update { it.copy(route = nextRoute, error = null, message = null) }
    }

    fun selectIncident(code: String) {
        val current = state.value
        val match = current.selectedMatch ?: return
        val type = match.rules.incidentTypes().firstOrNull { it.code == code } ?: return
        val selectedTeam = current.selectedTeam
        val nextRoute = if (current.incidentMode == WearIncidentMode.CREATE && selectedTeam != null) {
            when {
                type.isScoring() && !type.requiresPlayer(match.rules) -> WearRoute.TIME_PICK
                type.requiresPlayer(match.rules) && selectedTeam.players.isEmpty() -> WearRoute.INCIDENT_TYPES
                selectedTeam.players.isNotEmpty() -> WearRoute.PLAYERS
                else -> WearRoute.TIME_PICK
            }
        } else {
            WearRoute.INCIDENT_TEAMS
        }
        _state.update {
            it.copy(
                selectedIncidentCode = type.code,
                selectedPlayerUserId = null,
                route = nextRoute,
                error = if (nextRoute == WearRoute.INCIDENT_TYPES && type.requiresPlayer(match.rules)) {
                    "Selected team has no roster players."
                } else {
                    null
                },
                message = null,
            )
        }
    }

    fun selectPlayer(playerUserId: String?) {
        _state.update {
            it.copy(
                selectedPlayerUserId = playerUserId,
                route = WearRoute.TIME_PICK,
                error = null,
                message = null,
            )
        }
    }

    fun adjustMinute(delta: Int) {
        _state.update {
            val nextMinute = (it.incidentMinute + delta).coerceAtLeast(1)
            it.copy(
                incidentClockSeconds = secondsForMinute(nextMinute),
                incidentMinute = nextMinute,
                error = null,
            )
        }
    }

    fun returnToIncidentEditor() {
        _state.update { it.copy(route = WearRoute.INCIDENT_EDITOR, error = null) }
    }

    fun finishIncident() {
        val current = state.value
        val match = current.selectedMatch ?: return
        val team = current.selectedTeam
        val incidentType = current.selectedIncidentType
        if (team == null) {
            _state.update { it.copy(error = "Select a team.") }
            return
        }
        if (incidentType == null) {
            _state.update { it.copy(error = "Select an incident type.") }
            return
        }
        val player = current.selectedPlayer
        if (incidentType.requiresPlayer(match.rules) && player == null) {
            _state.update { it.copy(error = "Select a player.") }
            return
        }
        if (
            current.incidentMode == WearIncidentMode.EDIT &&
            incidentType.isScoring() &&
            !incidentType.requiresPlayer(match.rules)
        ) {
            _state.update { it.copy(error = "Playerless scoring cannot be edited as an incident.") }
            return
        }

        launchBusy {
            val updatedRaw = withContext(Dispatchers.IO) {
                if (current.incidentMode == WearIncidentMode.EDIT) {
                    val incident = current.selectedIncident
                        ?: throw IllegalStateException("Select an incident to edit.")
                    repository.updateIncident(
                        match = match,
                        incident = incident,
                        teamId = team.id,
                        incidentType = incidentType,
                        player = player,
                        minute = current.incidentMinute,
                        clockSeconds = current.incidentClockSeconds,
                    )
                } else {
                    repository.recordIncident(
                        match = match,
                        teamId = team.id,
                        incidentType = incidentType,
                        player = player,
                        minute = current.incidentMinute,
                        clockSeconds = current.incidentClockSeconds,
                    )
                }
            }
            val updatedMatch = match.withUpdatedRaw(updatedRaw, current.currentUserId)
            _state.update {
                it.withUpdatedMatch(updatedMatch).clearIncidentDraft().copy(
                    route = if (current.incidentMode == WearIncidentMode.EDIT) {
                        WearRoute.INCIDENT_LIST
                    } else {
                        WearRoute.TEAM_PICK
                    },
                    message = if (incidentType.isScoring()) "Score updated." else "Incident saved.",
                    error = null,
                )
            }
            runCatching { reloadMatches(preserveSelection = true) }
        }
    }

    fun cancelIncident() {
        _state.update { current ->
            current.clearIncidentDraft().copy(
                route = if (current.incidentMode == WearIncidentMode.EDIT) {
                    WearRoute.INCIDENT_LIST
                } else {
                    WearRoute.TEAM_PICK
                },
                error = null,
                message = null,
            )
        }
    }

    private fun beginIncidentCreate(teamId: String) {
        val match = state.value.selectedMatch ?: return
        val clockSeconds = repository.defaultIncidentClockSeconds(match)
        _state.update {
            it.copy(
                route = WearRoute.INCIDENT_TYPES,
                selectedTeamId = teamId,
                selectedIncidentId = null,
                selectedIncidentCode = null,
                selectedPlayerUserId = null,
                incidentMinute = minuteForClockSeconds(clockSeconds),
                incidentClockSeconds = clockSeconds,
                incidentMode = WearIncidentMode.CREATE,
                error = null,
                message = null,
            )
        }
    }

    private fun selectIncidentTeam(teamId: String) {
        val current = state.value
        val match = current.selectedMatch ?: return
        val type = current.selectedIncidentType
        val team = listOfNotNull(match.team1, match.team2).firstOrNull { it.id == teamId }
        if (team == null) {
            _state.update { it.copy(error = "Select a match team.") }
            return
        }
        val nextRoute = when {
            type == null -> {
                if (current.incidentMode == WearIncidentMode.CREATE) {
                    WearRoute.INCIDENT_TYPES
                } else {
                    WearRoute.INCIDENT_EDITOR
                }
            }
            type.isScoring() && !type.requiresPlayer(match.rules) -> WearRoute.TIME_PICK
            type.requiresPlayer(match.rules) && team.players.isEmpty() -> WearRoute.INCIDENT_TEAMS
            team.players.isNotEmpty() -> WearRoute.PLAYERS
            else -> WearRoute.TIME_PICK
        }
        _state.update {
            it.copy(
                selectedTeamId = teamId,
                selectedPlayerUserId = null,
                route = nextRoute,
                error = if (nextRoute == WearRoute.INCIDENT_TEAMS) {
                    "Selected team has no roster players."
                } else {
                    null
                },
                message = null,
            )
        }
    }

    private fun bootstrap() {
        viewModelScope.launch {
            if (demoMode) return@launch
            _state.update { it.copy(isLoading = true, error = null) }
            val session = try {
                withContext(Dispatchers.IO) { repository.bootstrapSession() }
            } catch (throwable: Throwable) {
                if (demoMode) return@launch
                _state.update {
                    it.copy(
                        route = WearRoute.LOGIN,
                        isAuthenticated = false,
                        isLoading = false,
                        error = throwable.toUserMessage(),
                    )
                }
                return@launch
            }
            if (demoMode) return@launch
            if (session == null) {
                _state.update {
                    it.copy(
                        route = WearRoute.LOGIN,
                        isAuthenticated = false,
                        isLoading = false,
                    )
                }
                return@launch
            }
            _state.update {
                it.copy(
                    route = WearRoute.MATCHES,
                    isAuthenticated = true,
                    currentUserId = session.userId,
                    currentUserLabel = session.label,
                    error = null,
                    message = null,
                    isLoading = false,
                )
            }
            viewModelScope.launch { refreshMatchesAfterAuth() }
        }
    }

    private fun runMatchAction(
        successMessage: String?,
        successRoute: WearRoute,
        action: suspend (WearMatch) -> WearMatchDto,
    ) {
        val match = state.value.selectedMatch ?: return
        viewModelScope.launch {
            _state.update { it.copy(isLoading = false, error = null, message = null) }
            val updatedRaw = try {
                withContext(Dispatchers.IO) { action(match) }
            } catch (throwable: Throwable) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = throwable.toUserMessage(),
                    )
                }
                return@launch
            }
            val updatedMatch = match.withUpdatedRaw(updatedRaw, state.value.currentUserId)
            _state.update {
                it.withUpdatedMatch(updatedMatch).copy(
                    route = successRoute,
                    message = successMessage,
                    error = null,
                    isLoading = false,
                )
            }
            viewModelScope.launch {
                runCatching { reloadMatches(preserveSelection = true) }
            }
        }
    }

    private suspend fun reloadMatches(preserveSelection: Boolean) {
        val selectedId = state.value.selectedMatchId
        val matches = withContext(Dispatchers.IO) { repository.loadOfficialSchedule() }
        _state.update {
            it.copy(
                matches = matches,
                selectedMatchId = if (preserveSelection && matches.any { match -> match.id == selectedId }) {
                    selectedId
                } else {
                    matches.firstOrNull()?.id
                },
            )
        }
    }

    private suspend fun refreshMatchesAfterAuth() {
        runCatching { reloadMatches(preserveSelection = false) }
            .onFailure { throwable ->
                _state.update {
                    it.copy(
                        matches = emptyList(),
                        selectedMatchId = null,
                        error = throwable.toUserMessage(),
                    )
                }
            }
    }

    private fun launchBusy(block: suspend () -> Unit) {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching { block() }
                .onFailure { throwable ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            error = throwable.toUserMessage(),
                        )
                    }
                }
                .onSuccess {
                    _state.update { it.copy(isLoading = false) }
                }
        }
    }
}

enum class WearRoute {
    LOGIN,
    MATCHES,
    MATCH_DETAIL,
    TIMER,
    TEAM_PICK,
    ACTION_MENU,
    INCIDENT_LIST,
    INCIDENT_EDITOR,
    INCIDENT_TYPES,
    INCIDENT_TEAMS,
    PLAYERS,
    TIME_PICK,
}

enum class WearIncidentMode {
    CREATE,
    EDIT,
}

enum class WearIncidentField {
    TYPE,
    TEAM,
    PLAYER,
    TIME,
}

data class MvpWearUiState(
    val route: WearRoute = WearRoute.LOGIN,
    val isDemo: Boolean = false,
    val isLoading: Boolean = false,
    val isAuthenticated: Boolean = false,
    val email: String = "",
    val password: String = "",
    val currentUserId: String? = null,
    val currentUserLabel: String? = null,
    val matches: List<WearMatch> = emptyList(),
    val selectedMatchId: String? = null,
    val selectedTeamId: String? = null,
    val selectedIncidentCode: String? = null,
    val selectedPlayerUserId: String? = null,
    val selectedIncidentId: String? = null,
    val incidentMinute: Int = 1,
    val incidentClockSeconds: Int = 0,
    val incidentMode: WearIncidentMode? = null,
    val message: String? = null,
    val error: String? = null,
) {
    val selectedMatch: WearMatch?
        get() = matches.firstOrNull { it.id == selectedMatchId }

    val selectedTeam: WearTeam?
        get() {
            val match = selectedMatch ?: return null
            return listOfNotNull(match.team1, match.team2).firstOrNull { it.id == selectedTeamId }
        }

    val selectedIncident: WearMatchIncidentDto?
        get() {
            val incidentId = selectedIncidentId ?: return null
            return selectedMatch?.raw?.incidents?.firstOrNull { it.resolvedId() == incidentId }
        }

    val selectedIncidentType: WearIncidentTypeDefinitionDto?
        get() {
            val match = selectedMatch ?: return null
            return match.rules.incidentTypes().firstOrNull { it.code == selectedIncidentCode }
        }

    val selectedPlayer: WearPlayer?
        get() {
            val playerUserId = selectedPlayerUserId ?: return null
            return selectedTeam?.players?.firstOrNull { it.participantUserId == playerUserId }
        }

    fun clearIncidentDraft(): MvpWearUiState = copy(
        selectedTeamId = null,
        selectedIncidentCode = null,
        selectedPlayerUserId = null,
        selectedIncidentId = null,
        incidentMinute = 1,
        incidentClockSeconds = 0,
        incidentMode = null,
    )
}

private fun MvpWearUiState.routeBeforeIncidentTime(): WearRoute {
    val match = selectedMatch ?: return WearRoute.INCIDENT_TYPES
    val type = selectedIncidentType ?: return WearRoute.INCIDENT_TYPES
    val team = selectedTeam ?: return WearRoute.INCIDENT_TYPES
    return if (type.requiresPlayer(match.rules) && team.players.isNotEmpty()) {
        WearRoute.PLAYERS
    } else {
        WearRoute.INCIDENT_TYPES
    }
}

private fun MvpWearUiState.withUpdatedMatch(match: WearMatch): MvpWearUiState =
    copy(
        matches = matches.map { current ->
            if (current.id == match.id) match else current
        },
        selectedMatchId = match.id,
    )

private fun WearMatch.withUpdatedRaw(raw: WearMatchDto, currentUserId: String?): WearMatch {
    val normalizedUserId = currentUserId.normalizedId()
    val checkedIn = normalizedUserId?.let { userId ->
        raw.officialIds.any { assignment ->
            assignment.userId.normalizedId() == userId && assignment.checkedIn == true
        } || (raw.officialId.normalizedId() == userId && raw.officialCheckedIn == true)
    } ?: officialCheckedIn
    return copy(
        status = raw.status,
        officialCheckedIn = checkedIn,
        raw = raw,
    )
}

private fun secondsForMinute(minute: Int): Int = (minute.coerceAtLeast(1) - 1) * 60

private fun minuteForClockSeconds(seconds: Int): Int =
    (seconds.coerceAtLeast(0) / 60) + 1
