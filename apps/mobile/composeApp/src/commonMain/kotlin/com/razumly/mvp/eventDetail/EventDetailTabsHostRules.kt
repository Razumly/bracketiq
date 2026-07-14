package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.presentation.EventDetailInitialTab

internal fun availableEventDetailTabs(
    hasBracketView: Boolean,
    hasScheduleView: Boolean,
    hasStandingsView: Boolean,
): List<DetailTab> = buildList {
    add(DetailTab.PARTICIPANTS)
    if (hasScheduleView) add(DetailTab.SCHEDULE)
    if (hasStandingsView) add(DetailTab.LEAGUES)
    if (hasBracketView) add(DetailTab.BRACKET)
}

internal fun resolveInitialEventDetailTab(
    initialTab: EventDetailInitialTab,
    availableTabs: List<DetailTab>,
): DetailTab = when {
    initialTab == EventDetailInitialTab.SCHEDULE && DetailTab.SCHEDULE in availableTabs -> DetailTab.SCHEDULE
    else -> DetailTab.PARTICIPANTS
}

internal fun filterScheduleMatchesForDivision(
    matches: List<MatchWithRelations>,
    tournamentPoolPlayEnabled: Boolean,
    selectedSchedulePoolDivisionId: String?,
    selectedScheduleDivisionId: String?,
    schedulePoolDivisionOptions: List<BracketDivisionOption>,
    singleDivision: Boolean,
    selectedDivisionId: String?,
): List<MatchWithRelations> = when {
    tournamentPoolPlayEnabled && !selectedSchedulePoolDivisionId.isNullOrBlank() -> {
        val normalizedPoolDivisionId = selectedSchedulePoolDivisionId.normalizeDivisionIdentifier()
        matches.filter { match ->
            match.match.division?.normalizeDivisionIdentifier() == normalizedPoolDivisionId
        }
    }

    tournamentPoolPlayEnabled && !selectedScheduleDivisionId.isNullOrBlank() -> {
        val poolDivisionIds = schedulePoolDivisionOptions.map { option -> option.id }
        val normalizedScheduleDivisionId = selectedScheduleDivisionId.normalizeDivisionIdentifier()
        matches.filter { match ->
            val normalizedMatchDivision = match.match.division?.normalizeDivisionIdentifier()
            normalizedMatchDivision == normalizedScheduleDivisionId ||
                poolDivisionIds.any { poolDivisionId ->
                    normalizedMatchDivision == poolDivisionId.normalizeDivisionIdentifier()
                }
        }
    }

    singleDivision || selectedDivisionId.isNullOrBlank() -> matches

    else -> {
        val normalizedSelectedDivision = selectedDivisionId.normalizeDivisionIdentifier()
        matches.filter { match ->
            match.match.division?.normalizeDivisionIdentifier() == normalizedSelectedDivision
        }
    }
}
