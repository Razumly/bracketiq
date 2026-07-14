package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.util.isPlaceholderSlot
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.EventChildRegistrationRequestDto
import com.razumly.mvp.core.network.dto.EventChildRegistrationResponseDto
import com.razumly.mvp.core.network.dto.EventParticipantsRequestDto
import com.razumly.mvp.core.network.dto.EventParticipantsResponseDto
import com.razumly.mvp.core.network.dto.EventResponseDto

private fun Event.registrationAnalyticsProperties(): Map<String, String> = buildMap {
    put("event_id", id)
    put("event_type", eventType.name)
    put("team_signup", teamSignup.toString())
    organizationId?.trim()?.takeIf(String::isNotBlank)?.let { put("organization_id", it) }
    sportId?.trim()?.takeIf(String::isNotBlank)?.let { put("sport_id", it) }
}

/** Owns event participant registration mutations and their Room convergence. */
internal class EventRegistrationMutationCoordinator(
    private val api: MvpApiClient,
    private val roomStore: EventRoomStore,
    private val detailRemoteGateway: EventDetailRemoteGateway,
    private val participantSyncCoordinator: EventParticipantSyncCoordinator,
    private val registrationCacheCoordinator: EventRegistrationCacheCoordinator,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
) {
    suspend fun addCurrentUser(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
        answers: Map<String, String>,
    ): Result<SelfRegistrationResult> = runCatching {
        val currentUser = userRepository.currentUser.value.getOrThrow()
        val eventAtCapacity = if (event.teamSignup) {
            false
        } else {
            isEventAtCapacity(
                event = event,
                preferredDivisionId = preferredDivisionId,
                occurrence = occurrence,
            )
        }
        val divisionPayload = resolveRegistrationDivisionPayload(
            event = event,
            preferredDivisionId = preferredDivisionId,
        )
        val request = EventParticipantsRequestDto(
            userId = currentUser.id,
            divisionId = divisionPayload.divisionId,
            divisionTypeId = divisionPayload.divisionTypeId,
            divisionTypeKey = divisionPayload.divisionTypeKey,
            slotId = occurrence?.slotId,
            occurrenceDate = occurrence?.occurrenceDate,
            answers = answers.toEventRegistrationQuestionAnswerDtos(),
        )
        AnalyticsTracker.capture(
            AnalyticsEvent.EventRegistrationStarted,
            event.registrationAnalyticsProperties() + mapOf(
                "registration_type" to if (event.teamSignup) "free_agent" else "self",
                "joined_waitlist" to eventAtCapacity.toString(),
            ),
        )
        val response = when {
            eventAtCapacity -> api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                path = "api/events/${event.id}/waitlist",
                body = request,
            )

            event.teamSignup -> api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                path = "api/events/${event.id}/free-agents",
                body = EventParticipantsRequestDto(
                    userId = currentUser.id,
                    slotId = occurrence?.slotId,
                    occurrenceDate = occurrence?.occurrenceDate,
                    answers = answers.toEventRegistrationQuestionAnswerDtos(),
                ),
            )

            else -> api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                path = "api/events/${event.id}/participants",
                body = request,
            )
        }

        response.error?.takeIf(String::isNotBlank)?.let { error(it) }
        val updatedEvent = response.event?.toEventOrNull() ?: event
        syncParticipantsAfterMutation(updatedEvent, occurrence)

        AnalyticsTracker.capture(
            AnalyticsEvent.EventRegistrationCompleted,
            event.registrationAnalyticsProperties() + mapOf(
                "registration_type" to "self",
                "joined_waitlist" to (eventAtCapacity && response.requiresParentApproval != true).toString(),
                "requires_parent_approval" to (response.requiresParentApproval == true).toString(),
            ),
        )
        SelfRegistrationResult(
            requiresParentApproval = response.requiresParentApproval == true,
            joinedWaitlist = eventAtCapacity && response.requiresParentApproval != true,
        )
    }

    suspend fun addPlayer(
        event: Event,
        player: UserData,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> = runCatching {
        val normalizedUserId = player.id.trim()
        if (normalizedUserId.isBlank()) error("User id is required.")
        val divisionPayload = resolveRegistrationDivisionPayload(event, preferredDivisionId)
        val response = api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
            path = "api/events/${event.id}/participants",
            body = EventParticipantsRequestDto(
                userId = normalizedUserId,
                divisionId = divisionPayload.divisionId,
                divisionTypeId = divisionPayload.divisionTypeId,
                divisionTypeKey = divisionPayload.divisionTypeKey,
                slotId = occurrence?.slotId,
                occurrenceDate = occurrence?.occurrenceDate,
            ),
        )
        response.error?.takeIf(String::isNotBlank)?.let { error(it) }
        syncParticipantsAfterMutation(response.event?.toEventOrNull() ?: event, occurrence)
        SelfRegistrationResult(
            requiresParentApproval = response.requiresParentApproval == true,
            joinedWaitlist = false,
        )
    }

    suspend fun requestCurrentUserRegistration(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> = runCatching {
        val currentUser = userRepository.currentUser.value.getOrThrow()
        val divisionPayload = resolveRegistrationDivisionPayload(event, preferredDivisionId)
        val response = api.post<EventParticipantsRequestDto, EventChildRegistrationResponseDto>(
            path = "api/events/${event.id}/registrations/self",
            body = EventParticipantsRequestDto(
                userId = currentUser.id,
                divisionId = divisionPayload.divisionId,
                divisionTypeId = divisionPayload.divisionTypeId,
                divisionTypeKey = divisionPayload.divisionTypeKey,
                slotId = occurrence?.slotId,
                occurrenceDate = occurrence?.occurrenceDate,
            ),
        )
        AnalyticsTracker.capture(
            AnalyticsEvent.EventRegistrationStarted,
            event.registrationAnalyticsProperties() + mapOf(
                "registration_type" to "self",
                "requires_parent_approval" to "true",
            ),
        )
        response.error?.takeIf(String::isNotBlank)?.let { error(it) }
        SelfRegistrationResult(
            requiresParentApproval = response.requiresParentApproval == true,
            joinedWaitlist = response.registration?.status?.trim()?.uppercase() == "WAITLISTED",
        )
    }

    suspend fun registerChild(
        eventId: String,
        childUserId: String,
        joinWaitlist: Boolean,
        occurrence: EventOccurrenceSelection?,
    ): Result<ChildRegistrationResult> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedChildUserId = childUserId.trim()
        if (normalizedEventId.isBlank() || normalizedChildUserId.isBlank()) {
            error("Event id and child user id are required.")
        }

        if (joinWaitlist) {
            AnalyticsTracker.capture(
                AnalyticsEvent.EventRegistrationStarted,
                mapOf(
                    "event_id" to normalizedEventId,
                    "registration_type" to "waitlist",
                    "requires_parent_approval" to "true",
                ),
            )
            val waitlistResponse = api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                path = "api/events/$normalizedEventId/waitlist",
                body = EventParticipantsRequestDto(
                    userId = normalizedChildUserId,
                    slotId = occurrence?.slotId,
                    occurrenceDate = occurrence?.occurrenceDate,
                ),
            )
            waitlistResponse.error?.takeIf(String::isNotBlank)?.let { error(it) }
            val baseEvent = waitlistResponse.event?.toEventOrNull()
                ?: roomStore.getEvent(normalizedEventId)
                ?: error("Updated event not found after waitlist response.")
            syncParticipantsAfterMutation(baseEvent, occurrence)

            AnalyticsTracker.capture(
                AnalyticsEvent.EventRegistrationCompleted,
                mapOf(
                    "event_id" to normalizedEventId,
                    "registration_type" to "child",
                    "joined_waitlist" to (waitlistResponse.requiresParentApproval != true).toString(),
                    "requires_parent_approval" to (waitlistResponse.requiresParentApproval == true).toString(),
                ),
            )
            return@runCatching ChildRegistrationResult(
                registrationStatus = if (waitlistResponse.requiresParentApproval == true) null else "WAITLISTED",
                requiresParentApproval = waitlistResponse.requiresParentApproval == true,
                joinedWaitlist = waitlistResponse.requiresParentApproval != true,
            )
        }

        AnalyticsTracker.capture(
            AnalyticsEvent.EventRegistrationStarted,
            mapOf(
                "event_id" to normalizedEventId,
                "registration_type" to "child",
                "requires_parent_approval" to "true",
            ),
        )
        val response = api.post<EventChildRegistrationRequestDto, EventChildRegistrationResponseDto>(
            path = "api/events/$normalizedEventId/registrations/child",
            body = EventChildRegistrationRequestDto(
                childId = normalizedChildUserId,
                slotId = occurrence?.slotId,
                occurrenceDate = occurrence?.occurrenceDate,
            ),
        )
        response.error?.takeIf(String::isNotBlank)?.let { error(it) }
        AnalyticsTracker.capture(
            AnalyticsEvent.EventRegistrationCompleted,
            mapOf(
                "event_id" to normalizedEventId,
                "registration_type" to "child",
                "joined_waitlist" to "false",
                "requires_parent_approval" to (response.requiresParentApproval == true).toString(),
                "requires_child_email" to (response.consent?.requiresChildEmail == true).toString(),
            ),
        )
        ChildRegistrationResult(
            registrationStatus = response.registration?.status,
            consentStatus = response.consent?.status ?: response.registration?.consentStatus,
            requiresParentApproval = response.requiresParentApproval == true,
            requiresChildEmail = response.consent?.requiresChildEmail == true,
            joinedWaitlist = false,
            warnings = response.warnings,
        )
    }

    suspend fun addTeam(
        event: Event,
        team: Team,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
        answers: Map<String, String>,
    ): Result<Unit> = runCatching {
        if (event.waitList.contains(team.id)) throw Exception("Team already in waitlist")
        val divisionPreference = preferredDivisionId?.trim()?.takeIf(String::isNotBlank) ?: team.division
        val divisionPayload = resolveRegistrationDivisionPayload(event, divisionPreference)
        val request = EventParticipantsRequestDto(
            teamId = team.id,
            divisionId = divisionPayload.divisionId,
            divisionTypeId = divisionPayload.divisionTypeId,
            divisionTypeKey = divisionPayload.divisionTypeKey,
            slotId = occurrence?.slotId,
            occurrenceDate = occurrence?.occurrenceDate,
            answers = answers.toEventRegistrationQuestionAnswerDtos(),
        )
        AnalyticsTracker.capture(
            AnalyticsEvent.EventRegistrationStarted,
            event.registrationAnalyticsProperties() + mapOf(
                "registration_type" to "team",
                "team_id" to team.id,
            ),
        )
        val updated = if (isEventAtCapacity(event, divisionPreference, occurrence)) {
            api.post<EventParticipantsRequestDto, EventResponseDto>(
                path = "api/events/${event.id}/waitlist",
                body = request,
            )
        } else {
            api.post<EventParticipantsRequestDto, EventResponseDto>(
                path = "api/events/${event.id}/participants",
                body = request,
            )
        }.event?.toEventOrNull() ?: event

        syncParticipantsAfterMutation(updated, occurrence)
        AnalyticsTracker.capture(
            AnalyticsEvent.EventRegistrationCompleted,
            event.registrationAnalyticsProperties() + mapOf(
                "registration_type" to "team",
                "joined_waitlist" to updated.waitList.contains(team.id).toString(),
            ),
        )
    }

    suspend fun moveTeamDivision(
        event: Event,
        team: Team,
        preferredDivisionId: String,
        occurrence: EventOccurrenceSelection?,
    ): Result<EventParticipantsSyncResult> = runCatching {
        val normalizedTeamId = team.id.trim().takeIf(String::isNotBlank)
            ?: error("Team id is required.")
        val divisionPreference = preferredDivisionId.trim().takeIf(String::isNotBlank)
            ?: error("Division id is required.")
        val divisionPayload = resolveRegistrationDivisionPayload(event, divisionPreference)
        val updated = api.post<EventParticipantsRequestDto, EventResponseDto>(
            path = "api/events/${event.id}/participants",
            body = EventParticipantsRequestDto(
                teamId = normalizedTeamId,
                divisionId = divisionPayload.divisionId,
                divisionTypeId = divisionPayload.divisionTypeId,
                divisionTypeKey = divisionPayload.divisionTypeKey,
                slotId = occurrence?.slotId,
                occurrenceDate = occurrence?.occurrenceDate,
            ),
        ).event?.toEventOrNull() ?: event

        syncParticipantsAfterMutation(updated, occurrence)
            ?: error("Failed to refresh event participants after moving team division.")
    }

    suspend fun removeTeam(
        event: Event,
        teamWithPlayers: TeamWithPlayers,
        refundMode: EventParticipantRefundMode?,
        refundReason: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> = runCatching {
        val updated = api.delete<EventParticipantsRequestDto, EventResponseDto>(
            path = "api/events/${event.id}/participants",
            body = EventParticipantsRequestDto(
                teamId = teamWithPlayers.team.id,
                slotId = occurrence?.slotId,
                occurrenceDate = occurrence?.occurrenceDate,
                refundMode = refundMode?.wireValue,
                refundReason = refundReason?.trim()?.takeIf(String::isNotBlank),
            ),
        ).event?.toEventOrNull() ?: event
        syncParticipantsAfterMutation(updated, occurrence)
    }

    suspend fun removeCurrentUser(
        event: Event,
        targetUserId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> {
        val currentUser = userRepository.currentUser.value.getOrThrow()
        val resolvedUserId = targetUserId?.trim()?.takeIf(String::isNotBlank) ?: currentUser.id
        return runCatching {
            val updated = api.delete<EventParticipantsRequestDto, EventResponseDto>(
                path = "api/events/${event.id}/participants",
                body = EventParticipantsRequestDto(
                    userId = resolvedUserId,
                    slotId = occurrence?.slotId,
                    occurrenceDate = occurrence?.occurrenceDate,
                ),
            ).event?.toEventOrNull() ?: event
            syncParticipantsAfterMutation(updated, occurrence)
        }
    }

    private suspend fun syncParticipantsAfterMutation(
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ): EventParticipantsSyncResult? {
        runCatching { registrationCacheCoordinator.syncAll() }.getOrNull()
        return runCatching { participantSyncCoordinator.syncParticipants(event, occurrence) }
            .onFailure {
                roomStore.cacheEvent(event)
                participantSyncCoordinator.persistEventRelations(event)
            }
            .getOrNull()
    }

    private fun resolveSelectedDivisionDetail(
        event: Event,
        preferredDivisionId: String?,
    ): DivisionDetail? {
        if (event.divisions.isEmpty()) return null
        val normalizedPreferredDivision = preferredDivisionId
            ?.normalizeDivisionIdentifier()
            ?.ifEmpty { null }
        val divisionDetails = event.divisions.normalizeDivisionIdentifiers().mapNotNull { divisionId ->
            event.divisionDetails.firstOrNull { detail ->
                detail.id.normalizeDivisionIdentifier() == divisionId
            }
        }
        if (divisionDetails.isEmpty()) return null
        return if (!normalizedPreferredDivision.isNullOrBlank()) {
            divisionDetails.firstOrNull { detail ->
                detail.id.normalizeDivisionIdentifier() == normalizedPreferredDivision
            } ?: divisionDetails.firstOrNull()
        } else {
            divisionDetails.firstOrNull()
        }
    }

    private fun resolveRegistrationDivisionPayload(
        event: Event,
        preferredDivisionId: String?,
    ): RegistrationDivisionPayload {
        val selectedDivision = resolveSelectedDivisionDetail(event, preferredDivisionId)
            ?: return RegistrationDivisionPayload()
        return RegistrationDivisionPayload(
            divisionId = selectedDivision.id.normalizeDivisionIdentifier().ifEmpty { null },
            divisionTypeId = selectedDivision.divisionTypeId.normalizeDivisionIdentifier().ifEmpty { null },
            divisionTypeKey = selectedDivision.key.normalizeDivisionIdentifier().ifEmpty { null },
        )
    }

    private suspend fun isEventAtCapacity(
        event: Event,
        preferredDivisionId: String? = null,
        occurrence: EventOccurrenceSelection? = null,
    ): Boolean {
        val participantSnapshot = runCatching {
            detailRemoteGateway.fetchParticipantsSnapshot(event.id, occurrence)
        }.getOrNull()
        if (participantSnapshot?.weeklySelectionRequired == true) return false

        val selectedDivision = if (event.divisions.isEmpty()) {
            null
        } else {
            resolveSelectedDivisionDetail(event, preferredDivisionId)
        }
        val missingCapacityMessage =
            "Set ${if (event.teamSignup) "max teams" else "max participants"} for this division before joining."
        val maxParticipants = participantSnapshot?.participantCapacity?.takeIf { it > 0 }
            ?: if (event.divisions.isEmpty()) {
                event.maxParticipants.takeIf { it > 0 }
            } else {
                selectedDivision?.maxParticipants?.takeIf { it > 0 }
            }
            ?: throw IllegalStateException(missingCapacityMessage)

        val participantCount = participantSnapshot?.participantCount ?: if (event.teamSignup) {
            val teamIds = event.teamIds.map(String::trim).filter(String::isNotBlank)
            if (teamIds.isEmpty()) {
                0
            } else {
                val teams = teamRepository.getTeamsWithPlayers(teamIds).getOrElse { emptyList() }
                val divisionId = selectedDivision?.id?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
                val shouldFilterDivision = event.divisions.isNotEmpty() && divisionId != null
                teams.count { teamWithPlayers ->
                    val team = teamWithPlayers.team
                    val teamDivision = team.division.normalizeDivisionIdentifier()
                    !team.isPlaceholderSlot(event.eventType) && (
                        !shouldFilterDivision ||
                            (divisionId != null && teamDivision == divisionId)
                        )
                }
            }
        } else {
            event.playerIds.size
        }
        return participantCount >= maxParticipants
    }
}
