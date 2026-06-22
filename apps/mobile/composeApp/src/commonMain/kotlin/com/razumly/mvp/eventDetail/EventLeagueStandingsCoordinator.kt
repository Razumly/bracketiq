package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.repositories.LeagueStandingsConfirmResult
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
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
}
