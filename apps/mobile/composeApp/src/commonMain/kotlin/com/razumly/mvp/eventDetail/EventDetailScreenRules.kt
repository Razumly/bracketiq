package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.assignedOfficialUserIds
import com.razumly.mvp.core.data.dataTypes.canManageEventsForViewer
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.guides.EventGuideTargets
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

internal fun eventDetailTabGuideRequiredTargetIds(
    selectedTab: DetailTab,
    selectedTabContentTarget: String,
): Set<String> =
    if (selectedTab == DetailTab.PARTICIPANTS) {
        setOf(EventGuideTargets.DetailTabs, selectedTabContentTarget)
    } else {
        setOf(selectedTabContentTarget)
    }

internal fun canViewOfficialsPanel(
    currentUserId: String,
    event: Event,
    organization: Organization?,
): Boolean {
    val normalizedCurrentUserId = currentUserId.trim()
    if (normalizedCurrentUserId.isBlank()) {
        return false
    }
    return event.hostId == normalizedCurrentUserId ||
        event.assistantHostIds.any { assistantHostId -> assistantHostId == normalizedCurrentUserId } ||
        isCurrentUserEventOfficial(normalizedCurrentUserId, event) ||
        organization?.canManageEventsForViewer(normalizedCurrentUserId) == true
}

internal fun isCurrentUserEventOfficial(
    currentUserId: String,
    event: Event,
): Boolean {
    val normalizedCurrentUserId = currentUserId.trim()
    if (normalizedCurrentUserId.isBlank()) {
        return false
    }
    val activeEventOfficialIds = event.eventOfficials
        .asSequence()
        .filter { official -> official.isActive }
        .map { official -> official.userId.trim() }
        .filter { officialId -> officialId.isNotBlank() }
        .toList()
    return if (activeEventOfficialIds.isNotEmpty()) {
        activeEventOfficialIds.any { officialId -> officialId == normalizedCurrentUserId }
    } else {
        event.officialIds.any { officialId -> officialId.trim() == normalizedCurrentUserId }
    }
}

internal fun shouldUseViewSchedulePrimaryAction(
    isWeeklyParentEvent: Boolean,
    isAffiliateEvent: Boolean,
    isUserInEvent: Boolean,
    isHost: Boolean,
    isAssistantHost: Boolean,
    isEventOfficial: Boolean,
): Boolean = !isWeeklyParentEvent && !isAffiliateEvent && (
    isUserInEvent || isHost || isAssistantHost || isEventOfficial
)

internal fun shouldShowScheduleMatchManagement(eventType: EventType): Boolean =
    eventType == EventType.LEAGUE || eventType == EventType.TOURNAMENT

internal fun isFirstMatchDayForTrackedUsers(
    matches: List<MatchWithRelations>,
    trackedUserIds: Set<String>,
    currentUserTeamIds: Set<String>,
    today: LocalDate,
    timeZone: TimeZone,
): Boolean {
    val normalizedTrackedUserIds = trackedUserIds
        .map(String::trim)
        .filter(String::isNotBlank)
        .toSet()
    val normalizedTeamIds = currentUserTeamIds
        .map(String::trim)
        .filter(String::isNotBlank)
        .toSet()
    if (normalizedTrackedUserIds.isEmpty() && normalizedTeamIds.isEmpty()) {
        return false
    }

    val trackedMatchDates = matches
        .asSequence()
        .filter { match -> match.isMatchForTrackedUserOrTeam(normalizedTrackedUserIds, normalizedTeamIds) }
        .mapNotNull { match -> match.match.start ?: match.match.end }
        .map { instant -> instant.toLocalDateTime(timeZone).date }
        .distinct()
        .sorted()
        .toList()

    return trackedMatchDates.firstOrNull() == today
}

private fun MatchWithRelations.isMatchForTrackedUserOrTeam(
    trackedUserIds: Set<String>,
    currentUserTeamIds: Set<String>,
): Boolean {
    val matchTeamIds = setOfNotNull(
        match.team1Id?.trim()?.takeIf(String::isNotBlank),
        match.team2Id?.trim()?.takeIf(String::isNotBlank),
        match.teamOfficialId?.trim()?.takeIf(String::isNotBlank),
    )
    if (matchTeamIds.any(currentUserTeamIds::contains)) {
        return true
    }

    if (match.assignedOfficialUserIds().any { userId -> trackedUserIds.contains(userId.trim()) }) {
        return true
    }

    val teamUserIds = listOfNotNull(team1, team2)
        .flatMap { team -> team.playerIds }
        .map(String::trim)
        .filter(String::isNotBlank)

    return teamUserIds.any(trackedUserIds::contains)
}
