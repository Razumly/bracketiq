package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantsSyncResult
import io.github.aakira.napier.Napier
import kotlinx.coroutines.delay
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.ExperimentalTime
import kotlin.time.Duration.Companion.seconds

@OptIn(ExperimentalTime::class)
internal class EventJoinConfirmationCoordinator {
    suspend fun waitForUserInEventWithTimeout(
        confirmationTarget: JoinConfirmationTarget?,
        timeoutS: Duration = 30.seconds,
        checkIntervalS: Duration = 1.seconds,
        isUserInEvent: () -> Boolean,
        refreshAfterParticipantMutation: suspend () -> Unit,
        isJoinConfirmationSatisfied: suspend (JoinConfirmationTarget) -> Boolean,
    ): Boolean {
        if (confirmationTarget == null) {
            val startTime = Clock.System.now()
            while (!isUserInEvent()) {
                if (Clock.System.now() - startTime > timeoutS) {
                    return false
                }

                try {
                    refreshAfterParticipantMutation()
                    delay(checkIntervalS)
                } catch (_: Exception) {
                    delay(checkIntervalS * 2)
                }
            }
            return true
        }

        val startTime = Clock.System.now()
        while (Clock.System.now() - startTime <= timeoutS) {
            try {
                if (isJoinConfirmationSatisfied(confirmationTarget)) {
                    return true
                }
                delay(checkIntervalS)
            } catch (_: Exception) {
                delay(checkIntervalS * 2)
            }
        }

        return false
    }

    suspend fun isJoinConfirmationSatisfied(
        confirmationTarget: JoinConfirmationTarget,
        cachedCurrentUserRegistrations: () -> List<EventRegistrationCacheEntry>,
        selectedEvent: () -> Event,
        currentWeeklyOccurrenceSelection: () -> EventOccurrenceSelection?,
        syncCurrentUserRegistrationCache: suspend () -> Result<*>,
        getEvent: suspend (String) -> Result<Event>,
        syncEventParticipants: suspend (
            event: Event,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<EventParticipantsSyncResult>,
        getTeams: suspend (List<String>) -> Result<List<Team>>,
        applyParticipantSyncResult: (EventParticipantsSyncResult) -> Unit,
        refreshCurrentUserMembershipState: suspend (Event) -> Unit,
        rememberWeeklyOccurrenceSummary: (
            occurrence: EventOccurrenceSelection,
            summary: WeeklyOccurrenceSummary,
        ) -> Unit,
    ): Boolean {
        syncCurrentUserRegistrationCache()
            .onFailure { throwable ->
                Napier.w(
                    "Failed to sync current-user registrations while confirming join.",
                    throwable,
                )
            }
        if (cachedCurrentUserRegistrations().any { registration ->
                registrationMatchesJoinConfirmationTarget(registration, confirmationTarget)
            }
        ) {
            if (occurrencesMatch(confirmationTarget.occurrence, currentWeeklyOccurrenceSelection())) {
                refreshCurrentUserMembershipState(selectedEvent())
            }
            return true
        }

        val refreshedEvent = getEvent(confirmationTarget.eventId)
            .onFailure { throwable ->
                Napier.w(
                    "Failed to refresh event ${confirmationTarget.eventId} while confirming join.",
                    throwable,
                )
            }
            .getOrNull()
            ?: selectedEvent()

        val syncResult = syncEventParticipants(refreshedEvent, confirmationTarget.occurrence)
            .onFailure { throwable ->
                Napier.w("Failed to sync participants while confirming join.", throwable)
            }.getOrNull() ?: return false

        refreshUiForJoinConfirmation(
            syncResult = syncResult,
            confirmationTarget = confirmationTarget,
            currentWeeklyOccurrenceSelection = currentWeeklyOccurrenceSelection,
            applyParticipantSyncResult = applyParticipantSyncResult,
            refreshCurrentUserMembershipState = refreshCurrentUserMembershipState,
            rememberWeeklyOccurrenceSummary = rememberWeeklyOccurrenceSummary,
        )
        if (confirmationTarget.registrantType == JoinConfirmationRegistrantType.TEAM) {
            val eventTeams = getTeams(syncResult.event.teamIds)
                .getOrElse { emptyList() }
            if (eventTeams.any { team ->
                    team.id == confirmationTarget.registrantId || team.parentTeamId == confirmationTarget.registrantId
                }
            ) {
                return true
            }
        }
        return eventSnapshotMatchesJoinConfirmationTarget(syncResult.event, confirmationTarget)
    }

    fun teamIncludesUser(teamWithPlayers: TeamWithPlayers, userId: String): Boolean {
        val normalizedUserId = userId.trim()
        if (normalizedUserId.isBlank()) return false
        return teamWithPlayers.team.playerIds.any { playerId -> playerId.trim() == normalizedUserId } ||
            teamWithPlayers.players.any { player -> player.id.trim() == normalizedUserId } ||
            teamWithPlayers.pendingPlayers.any { player -> player.id.trim() == normalizedUserId }
    }

    suspend fun waitForTeamRegistrationWithTimeout(
        teamId: String,
        currentUserId: String,
        timeoutS: Duration = 30.seconds,
        checkIntervalS: Duration = 1.seconds,
        getTeamWithPlayers: suspend (String) -> Result<TeamWithPlayers>,
    ): Boolean {
        val normalizedTeamId = teamId.trim()
        if (normalizedTeamId.isBlank()) return false

        val startTime = Clock.System.now()
        while (Clock.System.now() - startTime <= timeoutS) {
            val refreshedTeam = getTeamWithPlayers(normalizedTeamId)
                .getOrNull()
            if (refreshedTeam?.let { team -> teamIncludesUser(team, currentUserId) } == true) {
                return true
            }
            delay(checkIntervalS)
        }

        return false
    }

    private suspend fun refreshUiForJoinConfirmation(
        syncResult: EventParticipantsSyncResult,
        confirmationTarget: JoinConfirmationTarget,
        currentWeeklyOccurrenceSelection: () -> EventOccurrenceSelection?,
        applyParticipantSyncResult: (EventParticipantsSyncResult) -> Unit,
        refreshCurrentUserMembershipState: suspend (Event) -> Unit,
        rememberWeeklyOccurrenceSummary: (
            occurrence: EventOccurrenceSelection,
            summary: WeeklyOccurrenceSummary,
        ) -> Unit,
    ) {
        applyParticipantSyncResult(syncResult)
        val currentSelection = currentWeeklyOccurrenceSelection()
        if (!occurrencesMatch(confirmationTarget.occurrence, currentSelection)) {
            return
        }
        refreshCurrentUserMembershipState(syncResult.event)
        confirmationTarget.occurrence?.let { occurrence ->
            if (!syncResult.weeklySelectionRequired) {
                rememberWeeklyOccurrenceSummary(
                    occurrence,
                    WeeklyOccurrenceSummary(
                        participantCount = syncResult.participantCount,
                        participantCapacity = syncResult.participantCapacity,
                    ),
                )
            }
        }
    }
}
