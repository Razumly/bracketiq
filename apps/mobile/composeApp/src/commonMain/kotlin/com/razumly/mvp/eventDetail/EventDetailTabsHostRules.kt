package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.presentation.EventDetailInitialTab
import com.razumly.mvp.core.presentation.guides.EventGuideTargets
import com.razumly.mvp.eventDetail.composables.ParticipantsSection

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

internal fun resolveAvailableEventDetailTab(
    selectedTab: DetailTab,
    availableTabs: List<DetailTab>,
): DetailTab = selectedTab.takeIf { it in availableTabs } ?: availableTabs.first()

internal fun resolveRequestedEventDetailTab(
    initialTab: EventDetailInitialTab,
    selectedTab: DetailTab,
    availableTabs: List<DetailTab>,
): DetailTab = if (
    initialTab == EventDetailInitialTab.SCHEDULE &&
    selectedTab == DetailTab.PARTICIPANTS &&
    DetailTab.SCHEDULE in availableTabs
) {
    DetailTab.SCHEDULE
} else {
    selectedTab
}

internal fun eventDetailParticipantSections(teamSignup: Boolean): List<ParticipantsSection> = if (teamSignup) {
    listOf(
        ParticipantsSection.TEAMS,
        ParticipantsSection.PARTICIPANTS,
        ParticipantsSection.FREE_AGENTS,
    )
} else {
    listOf(ParticipantsSection.PARTICIPANTS)
}

internal fun resolveAvailableParticipantSection(
    selectedSection: ParticipantsSection,
    availableSections: List<ParticipantsSection>,
): ParticipantsSection = selectedSection.takeIf { it in availableSections } ?: availableSections.first()

internal fun selectedEventDetailTabTargetDivisionId(
    selectedTab: DetailTab,
    selectedStandingsDataDivisionId: String?,
    selectedBracketDivisionId: String?,
): String? = when (selectedTab) {
    DetailTab.LEAGUES -> selectedStandingsDataDivisionId
    DetailTab.BRACKET -> selectedBracketDivisionId
    DetailTab.PARTICIPANTS,
    DetailTab.SCHEDULE,
    -> null
}

internal fun selectedEventDetailTabGuideTarget(selectedTab: DetailTab): String = when (selectedTab) {
    DetailTab.BRACKET -> EventGuideTargets.BracketContent
    DetailTab.SCHEDULE -> EventGuideTargets.ScheduleContent
    DetailTab.LEAGUES -> EventGuideTargets.StandingsContent
    DetailTab.PARTICIPANTS -> EventGuideTargets.ParticipantsContent
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
