package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.shouldReplaceOfficialPositionsWithSportDefaults
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal class EventSportsCatalogCoordinator {
    private val _sports = MutableStateFlow<List<Sport>>(emptyList())
    val sports = _sports.asStateFlow()

    private val _divisionTypeParameters = MutableStateFlow(DivisionTypeParameters())
    val divisionTypeParameters = _divisionTypeParameters.asStateFlow()

    private var catalogLoaded = false
    private var reportLoadErrors = false

    fun isCatalogLoaded(): Boolean = catalogLoaded

    fun currentSports(): List<Sport> = _sports.value

    fun prepareLoad(reportErrors: Boolean, loadInProgress: Boolean): Boolean {
        reportLoadErrors = reportLoadErrors || reportErrors
        return !loadInProgress
    }

    fun shouldReportLoadErrors(isEditing: Boolean): Boolean =
        reportLoadErrors || isEditing

    fun applySportsSuccess(sports: List<Sport>) {
        _sports.value = sports
    }

    fun applyDivisionTypeParametersSuccess(parameters: DivisionTypeParameters) {
        _divisionTypeParameters.value = parameters
    }

    fun finishLoad(loadedSports: Boolean, loadedDivisionTypes: Boolean) {
        catalogLoaded = loadedSports && loadedDivisionTypes
        reportLoadErrors = false
    }

    fun syncOfficialStaffingForSportTransition(previous: Event, updated: Event): Event {
        val updatedWithSportRules = updated.withSportRules(_sports.value)
        val previousSport = sportForId(previous.sportId)
        val nextSport = sportForId(updatedWithSportRules.sportId)
        val shouldReplaceDefaults = previous.sportId != updatedWithSportRules.sportId &&
            previous.shouldReplaceOfficialPositionsWithSportDefaults(
                previousSport = previousSport,
                nextSport = nextSport,
            )
        return updatedWithSportRules.syncOfficialStaffing(
            sport = nextSport,
            replacePositionsWithSportDefaults = shouldReplaceDefaults,
        )
    }

    fun sportForId(sportId: String?): Sport? = sportId
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { selectedSportId -> _sports.value.firstOrNull { sport -> sport.id == selectedSportId } }
}
