package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.teamCapacityPlayerCount
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class EventCheckoutTeamEditorState(
    val team: TeamWithPlayers,
    val name: String = team.team.name,
    val size: String = team.team.teamSize.toString(),
    val busy: Boolean = false,
    val error: String? = null,
) {
    val valid: Boolean get() = name.isNotBlank() &&
        (size.toIntOrNull() ?: 0) >= maxOf(1, team.team.teamCapacityPlayerCount())
}

internal class EventCheckoutTeamEditorCoordinator(
    private val scope: CoroutineScope,
    private val updateTeam: suspend (Team) -> Result<Team>,
) {
    private val _state = MutableStateFlow<EventCheckoutTeamEditorState?>(null)
    val state = _state.asStateFlow()

    fun open(team: TeamWithPlayers) { if (_state.value?.busy != true) _state.value = EventCheckoutTeamEditorState(team) }
    fun dismiss() { if (_state.value?.busy != true) _state.value = null }
    fun changeName(value: String) { _state.value?.takeUnless { it.busy }?.let { _state.value = it.copy(name = value, error = null) } }
    fun changeSize(value: String) { _state.value?.takeUnless { it.busy }?.let { _state.value = it.copy(size = value.filter(Char::isDigit), error = null) } }

    fun save() {
        val draft = _state.value?.takeIf { it.valid && !it.busy } ?: return
        _state.value = draft.copy(busy = true)
        scope.launch {
            try {
                updateTeam(draft.team.team.copy(name = draft.name.trim(), teamSize = draft.size.toInt()))
                    .onSuccess { _state.value = null }
                    .onFailure { _state.value = draft.copy(error = it.message ?: "Could not save the Team.") }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                _state.value = draft.copy(error = error.message ?: "Could not save the Team.")
            } finally {
                _state.value?.let { _state.value = it.copy(busy = false) }
            }
        }
    }
}
