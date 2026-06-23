package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal class EventMembershipCoordinator(
    initialEvent: Event,
    initialCurrentUserId: String,
    initialCurrentUserTeamIds: Set<String>,
    initialWeeklyParentWithoutSelection: Boolean,
    initialCachedMembership: CurrentUserRegistrationMembershipState? = null,
) {
    private val _usersTeam = MutableStateFlow<TeamWithPlayers?>(null)

    private val _isUserInEvent = MutableStateFlow(false)
    val isUserInEvent = _isUserInEvent.asStateFlow()

    private val _isRegistrationPaymentPending = MutableStateFlow(false)
    val isRegistrationPaymentPending = _isRegistrationPaymentPending.asStateFlow()

    private val _isRegistrationPaymentFailed = MutableStateFlow(false)
    val isRegistrationPaymentFailed = _isRegistrationPaymentFailed.asStateFlow()

    private val _isUserInWaitlist = MutableStateFlow(false)
    val isUserInWaitlist = _isUserInWaitlist.asStateFlow()

    private val _isUserFreeAgent = MutableStateFlow(false)
    val isUserFreeAgent = _isUserFreeAgent.asStateFlow()

    private val _isUserCaptain = MutableStateFlow(false)
    val isUserCaptain = _isUserCaptain.asStateFlow()

    init {
        if (initialWeeklyParentWithoutSelection) {
            clearForMissingWeeklySelection()
        } else if (initialCachedMembership != null) {
            applyCachedMembership(
                membership = initialCachedMembership,
                team = null,
                currentUserId = initialCurrentUserId,
            )
        } else {
            refreshFromSnapshot(
                event = initialEvent,
                currentUserId = initialCurrentUserId,
                currentUserTeamIds = initialCurrentUserTeamIds,
            )
        }
    }

    fun usersTeam(): TeamWithPlayers? = _usersTeam.value

    fun setUsersTeam(team: TeamWithPlayers?, currentUserId: String) {
        _usersTeam.value = team
        _isUserCaptain.value = isCaptain(currentUserId)
    }

    fun currentUserTeamIds(profileTeamIds: List<String>): Set<String> {
        val teamIdsFromProfile = profileTeamIds
            .map(String::trim)
            .filter(String::isNotBlank)
        val activeTeamId = _usersTeam.value?.team?.id
            ?.trim()
            ?.takeIf(String::isNotBlank)
        return (teamIdsFromProfile + listOfNotNull(activeTeamId)).toSet()
    }

    fun clearForMissingWeeklySelection() {
        _isUserInEvent.value = false
        _isRegistrationPaymentPending.value = false
        _isRegistrationPaymentFailed.value = false
        _isUserInWaitlist.value = false
        _isUserFreeAgent.value = false
        _isUserCaptain.value = false
        _usersTeam.value = null
    }

    fun resolveCachedMembership(
        registrations: List<EventRegistrationCacheEntry>,
        selectedOccurrence: EventOccurrenceSelection?,
        currentUserId: String,
        profileTeamIds: List<String>,
        isWeeklyParentEvent: Boolean,
    ): CurrentUserRegistrationMembershipState? {
        return resolveCurrentUserRegistrationMembership(
            registrations = registrations,
            selectedOccurrence = selectedOccurrence,
            currentUserId = currentUserId,
            currentUserTeamIds = currentUserTeamIds(profileTeamIds),
            isWeeklyParentEvent = isWeeklyParentEvent,
        )
    }

    fun applyCachedMembership(
        membership: CurrentUserRegistrationMembershipState,
        team: TeamWithPlayers?,
        currentUserId: String,
    ) {
        _isUserInEvent.value = membership.participant || membership.waitlist || membership.freeAgent
        _isRegistrationPaymentPending.value = membership.paymentPending
        _isRegistrationPaymentFailed.value = membership.paymentFailed
        _isUserInWaitlist.value = membership.waitlist
        _isUserFreeAgent.value = membership.freeAgent
        setUsersTeam(team, currentUserId)
    }

    fun refreshFromSnapshot(
        event: Event,
        currentUserId: String,
        currentUserTeamIds: Set<String>,
    ): List<String> {
        val participant = isUserParticipantInEventSnapshot(
            event = event,
            currentUserId = currentUserId,
            currentUserTeamIds = currentUserTeamIds,
        )
        val waitlist = isUserWaitListedInSnapshot(
            event = event,
            currentUserId = currentUserId,
            currentUserTeamIds = currentUserTeamIds,
        )
        val freeAgent = isUserFreeAgentInSnapshot(
            event = event,
            currentUserId = currentUserId,
            currentUserTeamIds = currentUserTeamIds,
        )
        _isUserInEvent.value = participant || waitlist || freeAgent
        _isRegistrationPaymentPending.value = false
        _isRegistrationPaymentFailed.value = false
        _isUserInWaitlist.value = waitlist
        _isUserFreeAgent.value = freeAgent

        val teamIds = if (_isUserInEvent.value) {
            listOfNotNull(
                matchingParticipantTeamId(event, currentUserTeamIds),
                event.waitList
                    .map(String::trim)
                    .firstOrNull { candidate -> candidate.isNotBlank() && currentUserTeamIds.contains(candidate) },
                event.freeAgents
                    .map(String::trim)
                    .firstOrNull { candidate -> candidate.isNotBlank() && currentUserTeamIds.contains(candidate) },
            ).distinct()
        } else {
            emptyList()
        }
        if (teamIds.isEmpty()) {
            setUsersTeam(null, currentUserId)
        }
        return teamIds
    }

    fun checkIsUserWaitListed(
        event: Event,
        currentUserId: String,
        currentUserTeamIds: Set<String>,
        cachedMembership: CurrentUserRegistrationMembershipState?,
        weeklyParentWithoutSelection: Boolean,
    ): Boolean {
        if (weeklyParentWithoutSelection) return false
        return cachedMembership?.waitlist
            ?: isUserWaitListedInSnapshot(event, currentUserId, currentUserTeamIds)
    }

    fun checkIsUserFreeAgent(
        event: Event,
        currentUserId: String,
        currentUserTeamIds: Set<String>,
        cachedMembership: CurrentUserRegistrationMembershipState?,
        weeklyParentWithoutSelection: Boolean,
    ): Boolean {
        if (weeklyParentWithoutSelection) return false
        return cachedMembership?.freeAgent
            ?: isUserFreeAgentInSnapshot(event, currentUserId, currentUserTeamIds)
    }

    fun checkIsUserParticipant(
        event: Event,
        currentUserId: String,
        currentUserTeamIds: Set<String>,
        cachedMembership: CurrentUserRegistrationMembershipState?,
        weeklyParentWithoutSelection: Boolean,
    ): Boolean {
        if (weeklyParentWithoutSelection) return false
        return cachedMembership?.participant
            ?: isUserParticipantInEventSnapshot(event, currentUserId, currentUserTeamIds)
    }

    fun checkIsUserInEvent(
        event: Event,
        currentUserId: String,
        currentUserTeamIds: Set<String>,
        cachedMembership: CurrentUserRegistrationMembershipState?,
        weeklyParentWithoutSelection: Boolean,
    ): Boolean {
        return checkIsUserParticipant(
            event = event,
            currentUserId = currentUserId,
            currentUserTeamIds = currentUserTeamIds,
            cachedMembership = cachedMembership,
            weeklyParentWithoutSelection = weeklyParentWithoutSelection,
        ) || checkIsUserFreeAgent(
            event = event,
            currentUserId = currentUserId,
            currentUserTeamIds = currentUserTeamIds,
            cachedMembership = cachedMembership,
            weeklyParentWithoutSelection = weeklyParentWithoutSelection,
        ) || checkIsUserWaitListed(
            event = event,
            currentUserId = currentUserId,
            currentUserTeamIds = currentUserTeamIds,
            cachedMembership = cachedMembership,
            weeklyParentWithoutSelection = weeklyParentWithoutSelection,
        )
    }

    private fun isCaptain(currentUserId: String): Boolean {
        val normalizedUserId = currentUserId.trim()
        if (normalizedUserId.isBlank()) return false
        return _usersTeam.value?.team?.captainId == normalizedUserId ||
            _usersTeam.value?.team?.managerId == normalizedUserId
    }

    private fun isUserWaitListedInSnapshot(
        event: Event,
        currentUserId: String,
        currentUserTeamIds: Set<String>,
    ): Boolean {
        val normalizedUserId = currentUserId.trim()
        return event.waitList.any { participant ->
            participant == normalizedUserId || currentUserTeamIds.contains(participant)
        }
    }

    private fun isUserFreeAgentInSnapshot(
        event: Event,
        currentUserId: String,
        currentUserTeamIds: Set<String>,
    ): Boolean {
        val normalizedUserId = currentUserId.trim()
        return event.freeAgents.any { participant ->
            participant == normalizedUserId || currentUserTeamIds.contains(participant)
        }
    }
}
