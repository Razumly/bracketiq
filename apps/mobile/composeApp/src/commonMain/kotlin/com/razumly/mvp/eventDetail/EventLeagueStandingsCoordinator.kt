package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.repositories.LeagueStandingsConfirmResult
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal data class LeagueStandingsLoadTarget(
    val eventId: String,
    val divisionId: String,
)

internal class EventLeagueStandingsCoordinator {
    private val _divisionStandings = MutableStateFlow<LeagueDivisionStandings?>(null)
    val divisionStandings = _divisionStandings.asStateFlow()

    private val _divisionStandingsLoading = MutableStateFlow(false)
    val divisionStandingsLoading = _divisionStandingsLoading.asStateFlow()

    private val _standingsConfirming = MutableStateFlow(false)
    val standingsConfirming = _standingsConfirming.asStateFlow()

    fun resolveLoadTarget(
        event: Event,
        selectedDivisionId: String?,
        isPlayoffPlacementDivision: (String) -> Boolean,
    ): LeagueStandingsLoadTarget? {
        val normalizedDivision = selectedDivisionId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
            ?: return null
        val supportsStandings = event.eventType == EventType.LEAGUE ||
            event.isTournamentPoolPlayEnabled()
        if (!supportsStandings || isPlayoffPlacementDivision(normalizedDivision)) {
            return null
        }
        return LeagueStandingsLoadTarget(
            eventId = event.id,
            divisionId = normalizedDivision,
        )
    }

    fun resolveCurrentLoadTarget(
        eventId: String,
        divisionId: String?,
    ): LeagueStandingsLoadTarget? {
        val normalizedDivision = divisionId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
            ?: return null
        return LeagueStandingsLoadTarget(
            eventId = eventId,
            divisionId = normalizedDivision,
        )
    }

    fun resolveScheduleRefreshTarget(
        event: Event,
        divisionId: String?,
    ): LeagueStandingsLoadTarget? {
        val supportsStandings = event.eventType == EventType.LEAGUE ||
            event.isTournamentPoolPlayEnabled()
        if (!supportsStandings) return null
        return resolveCurrentLoadTarget(event.id, divisionId)
    }

    fun resolveCurrentDivisionId(
        selectedDivisionId: String?,
        isSelectedDivisionEligible: (String) -> Boolean,
    ): String? =
        _divisionStandings.value?.divisionId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
            ?: selectedDivisionId
                ?.normalizeDivisionIdentifier()
                ?.takeIf { divisionId ->
                    divisionId.isNotBlank() && isSelectedDivisionEligible(divisionId)
                }

    fun clearUnavailableSelection() {
        _divisionStandings.value = null
        _divisionStandingsLoading.value = false
    }

    fun clearStandingsForSelectionLoad() {
        _divisionStandings.value = null
    }

    fun beginLoad(showLoading: Boolean) {
        if (showLoading) {
            _divisionStandingsLoading.value = true
        }
    }

    fun applyLoadSuccess(standings: LeagueDivisionStandings) {
        _divisionStandings.value = standings
    }

    fun finishLoad(showLoading: Boolean) {
        if (showLoading) {
            _divisionStandingsLoading.value = false
        }
    }

    suspend fun loadDivisionStandings(
        target: LeagueStandingsLoadTarget,
        showLoading: Boolean,
        reportErrors: Boolean,
        getStandings: suspend (eventId: String, divisionId: String) -> Result<LeagueDivisionStandings>,
    ): ErrorMessage? {
        beginLoad(showLoading)
        return try {
            getStandings(target.eventId, target.divisionId)
                .fold(
                    onSuccess = { standings ->
                        applyLoadSuccess(standings)
                        null
                    },
                    onFailure = { throwable ->
                        if (reportErrors) {
                            ErrorMessage(throwable.userMessage("Failed to load league standings."))
                        } else {
                            null
                        }
                    },
                )
        } finally {
            finishLoad(showLoading)
        }
    }

    suspend fun loadStandingsForSelection(
        target: LeagueStandingsLoadTarget?,
        showLoading: Boolean,
        reportErrors: Boolean,
        getStandings: suspend (eventId: String, divisionId: String) -> Result<LeagueDivisionStandings>,
    ): ErrorMessage? {
        if (target == null) {
            clearUnavailableSelection()
            return null
        }
        clearStandingsForSelectionLoad()
        return loadDivisionStandings(
            target = target,
            showLoading = showLoading,
            reportErrors = reportErrors,
            getStandings = getStandings,
        )
    }

    fun beginConfirming() {
        _standingsConfirming.value = true
    }

    fun applyConfirmSuccess(result: LeagueStandingsConfirmResult): String {
        _divisionStandings.value = result.division
        return if (result.applyReassignment && result.seededTeamIds.isNotEmpty()) {
            "Standings confirmed. Playoff assignments updated."
        } else {
            "Standings confirmed."
        }
    }

    fun finishConfirming() {
        _standingsConfirming.value = false
    }

    suspend fun confirmStandings(
        target: LeagueStandingsLoadTarget,
        applyReassignment: Boolean,
        loadingHandler: LoadingHandler,
        confirmStandings: suspend (
            eventId: String,
            divisionId: String,
            applyReassignment: Boolean,
        ) -> Result<LeagueStandingsConfirmResult>,
        refreshMatches: suspend (eventId: String) -> Result<*>,
        refreshEvent: suspend (eventId: String) -> Result<*>,
    ): ErrorMessage {
        beginConfirming()
        loadingHandler.showLoading("Confirming standings...")
        return try {
            confirmStandings(target.eventId, target.divisionId, applyReassignment)
                .fold(
                    onSuccess = { result ->
                        val message = applyConfirmSuccess(result)
                        refreshMatches(target.eventId)
                        refreshEvent(target.eventId)
                        ErrorMessage(message)
                    },
                    onFailure = { throwable ->
                        ErrorMessage(throwable.userMessage("Failed to confirm standings."))
                    },
                )
        } finally {
            finishConfirming()
            loadingHandler.hideLoading()
        }
    }
}
