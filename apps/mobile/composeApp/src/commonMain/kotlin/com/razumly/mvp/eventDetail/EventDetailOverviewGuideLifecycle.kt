package com.razumly.mvp.eventDetail

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.presentation.guides.EventGuideIds
import com.razumly.mvp.core.presentation.guides.EventGuideTargets
import com.razumly.mvp.core.presentation.guides.LocalGuideController
import com.razumly.mvp.core.presentation.guides.eventOverviewGuide
import com.razumly.mvp.core.util.resolvedTimeZone
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlinx.datetime.toLocalDateTime

@Composable
@OptIn(ExperimentalTime::class)
internal fun EventDetailOverviewGuideLifecycle(
    selectedEvent: EventWithFullRelations,
    scheduleTrackedUserIds: Set<String>,
    currentUserTeamIds: List<String>,
    validTeams: List<TeamWithPlayers>,
    showDetails: Boolean,
    isEditing: Boolean,
    showMap: Boolean,
    isUserInEvent: Boolean,
    showStickyActions: Boolean,
) {
    val guideController = LocalGuideController.current
    val guideEventId = selectedEvent.event.id.trim()
    val overviewJoinedGuideId = remember(guideEventId) {
        EventGuideIds.eventOverviewJoined(guideEventId)
    }
    val overviewMatchDayGuideId = remember(guideEventId) {
        EventGuideIds.eventOverviewMatchDay(guideEventId)
    }
    val overviewJoinedGuide = remember(overviewJoinedGuideId) {
        eventOverviewGuide(overviewJoinedGuideId)
    }
    val overviewMatchDayGuide = remember(overviewMatchDayGuideId) {
        eventOverviewGuide(overviewMatchDayGuideId)
    }
    val currentUserEventTeamIds = remember(currentUserTeamIds, validTeams) {
        (currentUserTeamIds + validTeams.map { team -> team.team.id })
            .map(String::trim)
            .filter(String::isNotBlank)
            .toSet()
    }
    val eventTimeZone = selectedEvent.event.resolvedTimeZone()
    val eventToday = remember(eventTimeZone) {
        Clock.System.now().toLocalDateTime(eventTimeZone).date
    }
    val isFirstMatchDayForCurrentUser = remember(
        selectedEvent.matches,
        scheduleTrackedUserIds,
        currentUserEventTeamIds,
        eventToday,
        eventTimeZone,
    ) {
        isFirstMatchDayForTrackedUsers(
            matches = selectedEvent.matches,
            trackedUserIds = scheduleTrackedUserIds,
            currentUserTeamIds = currentUserEventTeamIds,
            today = eventToday,
            timeZone = eventTimeZone,
        )
    }
    val completedGuideIds = guideController?.completedGuideIds.orEmpty()
    val hasOverviewHeaderTarget = guideController?.hasTarget(EventGuideTargets.OverviewHeader) == true
    val hasOverviewPrimaryActionTarget = guideController?.hasTarget(EventGuideTargets.OverviewPrimaryAction) == true
    val hasOverviewFormatTarget = guideController?.hasTarget(EventGuideTargets.OverviewFormat) == true

    LaunchedEffect(
        guideController,
        guideEventId,
        showDetails,
        isEditing,
        showMap,
        isUserInEvent,
        showStickyActions,
        isFirstMatchDayForCurrentUser,
        completedGuideIds,
        hasOverviewHeaderTarget,
        hasOverviewPrimaryActionTarget,
        hasOverviewFormatTarget,
    ) {
        val controller = guideController ?: return@LaunchedEffect
        if (guideEventId.isBlank()) return@LaunchedEffect
        if (showDetails || isEditing || showMap || !isUserInEvent || !showStickyActions) return@LaunchedEffect

        val requiredTargets = setOf(
            EventGuideTargets.OverviewHeader,
            EventGuideTargets.OverviewPrimaryAction,
        )
        if (!controller.isGuideCompleted(overviewJoinedGuideId)) {
            controller.maybeStartGuide(
                guide = overviewJoinedGuide,
                requiredTargetIds = requiredTargets,
            )
            return@LaunchedEffect
        }

        if (isFirstMatchDayForCurrentUser) {
            controller.maybeStartGuide(
                guide = overviewMatchDayGuide,
                requiredTargetIds = requiredTargets,
            )
        }
    }
}
