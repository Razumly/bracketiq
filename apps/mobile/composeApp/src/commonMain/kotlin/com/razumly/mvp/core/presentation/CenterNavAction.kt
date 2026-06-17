package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.repositories.UserScheduleSnapshot
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

sealed class CenterNavAction {
    data object CreateEvent : CenterNavAction()

    data class EventShortcut(
        val eventId: String,
        val eventName: String,
        val eventImageId: String,
    ) : CenterNavAction()

    data class MatchShortcut(
        val eventId: String,
        val matchId: String,
        val eventName: String,
        val eventImageId: String,
    ) : CenterNavAction()
}

internal fun resolveCenterNavAction(
    snapshot: UserScheduleSnapshot,
    now: Instant = Clock.System.now(),
): CenterNavAction {
    val eventsById = snapshot.events
        .mapNotNull { event ->
            val eventId = event.id.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
            eventId to event
        }
        .toMap()

    val matchShortcut = snapshot.matches
        .asSequence()
        .filter { match -> match.isCenterActionEligible(now) }
        .mapNotNull { match ->
            val event = eventsById[match.eventId.trim()] ?: return@mapNotNull null
            CenterMatchCandidate(
                match = match,
                event = event,
                sortInstant = match.start ?: now,
            )
        }
        .minWithOrNull(compareBy<CenterMatchCandidate> { it.sortInstant }.thenBy { it.match.matchId })

    if (matchShortcut != null) {
        return CenterNavAction.MatchShortcut(
            eventId = matchShortcut.event.id,
            matchId = matchShortcut.match.id,
            eventName = matchShortcut.event.name,
            eventImageId = matchShortcut.event.imageId,
        )
    }

    val eventShortcut = snapshot.events
        .asSequence()
        .filter { event -> event.isCenterActionEligible(now) }
        .minWithOrNull(compareBy<Event> { event ->
            if (event.start < now) now else event.start
        }.thenBy { it.name })

    return eventShortcut?.let { event ->
        CenterNavAction.EventShortcut(
            eventId = event.id,
            eventName = event.name,
            eventImageId = event.imageId,
        )
    } ?: CenterNavAction.CreateEvent
}

private data class CenterMatchCandidate(
    val match: MatchMVP,
    val event: Event,
    val sortInstant: Instant,
)

private fun Event.isCenterActionEligible(now: Instant): Boolean {
    val normalizedState = state.trim().uppercase()
    if (normalizedState in setOf("CANCELLED", "CANCELED", "DELETED", "ARCHIVED")) {
        return false
    }

    val effectiveEnd = end.takeIf { it > start } ?: start.plus(24.hours)
    return effectiveEnd >= now && start <= now.plus(24.hours)
}

private fun MatchMVP.isCenterActionEligible(now: Instant): Boolean {
    if (isTerminalForCenterAction()) return false
    val scheduledStart = start ?: return isStartedForCenterAction()
    val scheduledEnd = end?.takeIf { it > scheduledStart } ?: scheduledStart.plus(1.hours)
    val startsWithinOneHour = scheduledStart >= now && scheduledStart <= now.plus(1.hours)
    val inScheduledWindow = scheduledStart <= now && scheduledEnd >= now
    return startsWithinOneHour || inScheduledWindow
}

private fun MatchMVP.isStartedForCenterAction(): Boolean {
    val normalizedStatus = status?.trim()?.uppercase().orEmpty()
    return !actualStart.isNullOrBlank() ||
        normalizedStatus == "IN_PROGRESS" ||
        normalizedStatus == "STARTED" ||
        segments.any { segment ->
            val segmentStatus = segment.status.trim().uppercase()
            !segment.startedAt.isNullOrBlank() ||
                segmentStatus == "IN_PROGRESS" ||
                segmentStatus == "STARTED"
        }
}

private fun MatchMVP.isTerminalForCenterAction(): Boolean {
    val normalizedStatus = status?.trim()?.uppercase().orEmpty()
    val normalizedResultStatus = resultStatus?.trim()?.uppercase().orEmpty()
    return normalizedStatus in setOf("COMPLETE", "COMPLETED", "CANCELLED", "CANCELED", "FORFEIT", "SUSPENDED") ||
        normalizedResultStatus in setOf("FINAL", "COMPLETE", "COMPLETED", "CANCELLED", "CANCELED", "FORFEIT")
}
