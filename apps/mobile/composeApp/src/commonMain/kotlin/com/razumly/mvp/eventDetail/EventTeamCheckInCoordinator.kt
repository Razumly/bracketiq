@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.network.dto.TeamCheckInDto
import com.razumly.mvp.core.network.dto.TeamCheckInsResponseDto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

internal class EventTeamCheckInCoordinator(
    private val getEventTeamCheckInsRequest: suspend (eventId: String) -> Result<TeamCheckInsResponseDto>,
    private val checkInEventTeamRequest: suspend (
        eventId: String,
        eventTeamId: String,
    ) -> Result<TeamCheckInDto>,
    private val scope: CoroutineScope,
    private val now: () -> Instant = { Clock.System.now() },
) {
    private val _eventTeamCheckIns = MutableStateFlow<Map<String, TeamCheckInDto>>(emptyMap())
    val eventTeamCheckIns = _eventTeamCheckIns.asStateFlow()

    private val _showEventTeamCheckInDialog = MutableStateFlow(false)
    val showEventTeamCheckInDialog = _showEventTeamCheckInDialog.asStateFlow()

    private val _eventTeamCheckInSaving = MutableStateFlow(false)
    val eventTeamCheckInSaving = _eventTeamCheckInSaving.asStateFlow()

    private val shownPromptKeys = mutableSetOf<String>()
    private val confirmedPromptKeys = mutableSetOf<String>()
    private var lastLoadedEventId: String? = null

    fun dismissDialog() {
        _showEventTeamCheckInDialog.value = false
    }

    fun confirm(
        event: Event,
        eventTeamId: String?,
        onFailure: (Throwable) -> Unit,
    ) {
        if (_eventTeamCheckInSaving.value) return
        if (!eventTeamCheckInEnabled(event) || eventTeamId.isNullOrBlank()) {
            _showEventTeamCheckInDialog.value = false
            return
        }

        _eventTeamCheckInSaving.value = true
        scope.launch {
            try {
                checkInEventTeamRequest(event.id, eventTeamId)
                    .onSuccess { checkIn ->
                        confirmedPromptKeys += eventTeamCheckInPromptKey(event.id, eventTeamId)
                        _eventTeamCheckIns.value = _eventTeamCheckIns.value + (eventTeamId to checkIn)
                        _showEventTeamCheckInDialog.value = false
                    }
                    .onFailure(onFailure)
            } finally {
                _eventTeamCheckInSaving.value = false
            }
        }
    }

    fun refreshIfAllowed(
        event: Event,
        canViewCheckIns: Boolean,
    ) {
        if (!eventTeamCheckInEnabled(event)) {
            lastLoadedEventId = null
            _eventTeamCheckIns.value = emptyMap()
            return
        }
        if (!canViewCheckIns) return

        val eventId = event.id.trim()
        if (eventId.isBlank() || lastLoadedEventId == eventId) return

        lastLoadedEventId = eventId
        scope.launch {
            getEventTeamCheckInsRequest(event.id)
                .onSuccess { response ->
                    _eventTeamCheckIns.value = response.checkIns
                        .mapNotNull { checkIn ->
                            val eventTeamId = checkIn.eventTeamId
                                ?.trim()
                                ?.takeIf(String::isNotBlank)
                            eventTeamId?.let { it to checkIn }
                        }
                        .toMap()
                }
                .onFailure {
                    // Managers/coaches can submit event check-ins, but read access is host/official scoped.
                }
        }
    }

    fun evaluatePrompt(
        event: Event,
        eventTeamId: String?,
    ) {
        if (!eventTeamCheckInEnabled(event) || !isEventTeamCheckInWindowOpen(event, now())) {
            _showEventTeamCheckInDialog.value = false
            return
        }
        if (eventTeamId.isNullOrBlank() || eventTeamHasCheckedIn(event.id, eventTeamId)) {
            _showEventTeamCheckInDialog.value = false
            return
        }

        val promptKey = eventTeamCheckInPromptKey(event.id, eventTeamId)
        if (shownPromptKeys.add(promptKey)) {
            _showEventTeamCheckInDialog.value = true
        }
    }

    private fun eventTeamHasCheckedIn(
        eventId: String,
        eventTeamId: String,
    ): Boolean {
        if (eventTeamCheckInPromptKey(eventId, eventTeamId) in confirmedPromptKeys) return true
        val checkIn = _eventTeamCheckIns.value[eventTeamId] ?: return false
        return checkIn.status?.trim()?.uppercase().orEmpty() in setOf("", "CHECKED_IN")
    }
}

internal fun eventTeamCheckInEnabled(event: Event): Boolean =
    event.teamSignup && event.teamCheckInMode.name == "EVENT"

internal fun eventTeamCheckInPromptKey(
    eventId: String,
    eventTeamId: String,
): String = "${eventId.trim()}:${eventTeamId.trim()}"

internal fun isEventTeamCheckInWindowOpen(
    event: Event,
    now: Instant,
): Boolean {
    val openAt = event.start - event.teamCheckInOpenMinutesBefore.coerceAtLeast(0).minutes
    return now >= openAt
}
