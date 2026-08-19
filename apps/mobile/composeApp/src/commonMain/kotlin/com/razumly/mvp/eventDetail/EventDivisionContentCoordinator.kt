package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.util.isGraphMatch
import com.razumly.mvp.core.data.util.matchesDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal class EventDivisionContentCoordinator {
    private val _divisionMatches = MutableStateFlow<Map<String, MatchWithRelations>>(emptyMap())
    val divisionMatches = _divisionMatches.asStateFlow()

    private val _divisionTeams = MutableStateFlow<Map<String, TeamWithPlayers>>(emptyMap())
    val divisionTeams = _divisionTeams.asStateFlow()

    private val _selectedDivision = MutableStateFlow<String?>(null)
    val selectedDivision = _selectedDivision.asStateFlow()

    fun currentSelectedDivision(): String? = _selectedDivision.value

    fun restoreSelectedDivision(divisionId: String?) {
        _selectedDivision.value = divisionId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
    }

    fun selectDivision(
        division: String,
        selectedEvent: Event,
        relations: EventWithFullRelations,
    ) {
        val normalizedDivision = division.normalizeDivisionIdentifier()
        _selectedDivision.value = normalizedDivision.ifEmpty { null }
        refreshSelectedDivisionContent(
            selectedEvent = selectedEvent,
            relations = relations,
        )
    }

    fun refreshSelectedDivisionContent(
        selectedEvent: Event,
        relations: EventWithFullRelations,
    ) {
        _divisionTeams.value = relations.teams.associateBy { team -> team.team.id }
        val divisionFilter = _selectedDivision.value
        _divisionMatches.value = relations.matches
            .filter { match ->
                match.isGraphMatch() && (
                    selectedEvent.singleDivision ||
                        divisionFilter.isNullOrBlank() ||
                        match.matchesDivisionIdentifier(divisionFilter)
                    )
            }
            .associateBy { match -> match.match.id }
    }

}
