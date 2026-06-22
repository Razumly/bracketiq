package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantDivisionWarning
import com.razumly.mvp.core.data.repositories.EventParticipantManagementSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal data class ParticipantManagementRoomTarget(
    val eventId: String,
    val slotId: String?,
    val occurrenceDate: String?,
    val teamSignup: Boolean,
) {
    fun toOccurrence(): EventOccurrenceSelection? {
        val resolvedSlotId = slotId ?: return null
        val resolvedOccurrenceDate = occurrenceDate ?: return null
        return EventOccurrenceSelection(
            slotId = resolvedSlotId,
            occurrenceDate = resolvedOccurrenceDate,
        )
    }
}

internal data class ParticipantManagementLocalState(
    val snapshot: EventParticipantManagementSnapshot = EventParticipantManagementSnapshot(),
    val teamSummaries: Map<String, EventTeamComplianceSummary> = emptyMap(),
    val userSummaries: Map<String, EventComplianceUserSummary> = emptyMap(),
)

internal class EventParticipantManagementCoordinator(
    eventTeamsAndParticipantsLoadingInitially: Boolean,
) {
    private val _eventTeamsAndParticipantsLoading = MutableStateFlow(eventTeamsAndParticipantsLoadingInitially)
    val eventTeamsAndParticipantsLoading = _eventTeamsAndParticipantsLoading.asStateFlow()

    private val _participantManagementSnapshot = MutableStateFlow(EventParticipantManagementSnapshot())
    val participantManagementSnapshot = _participantManagementSnapshot.asStateFlow()

    private val _participantDivisionWarnings = MutableStateFlow<List<EventParticipantDivisionWarning>>(emptyList())
    val participantDivisionWarnings = _participantDivisionWarnings.asStateFlow()

    private val _participantManagementLoading = MutableStateFlow(false)
    val participantManagementLoading = _participantManagementLoading.asStateFlow()

    private val _teamComplianceSummaries = MutableStateFlow<Map<String, EventTeamComplianceSummary>>(emptyMap())
    val teamComplianceSummaries = _teamComplianceSummaries.asStateFlow()

    private val _userComplianceSummaries = MutableStateFlow<Map<String, EventComplianceUserSummary>>(emptyMap())
    val userComplianceSummaries = _userComplianceSummaries.asStateFlow()

    private val _participantComplianceLoading = MutableStateFlow(false)
    val participantComplianceLoading = _participantComplianceLoading.asStateFlow()

    private var managedDetailBootstrapRequest: ParticipantManagementRoomTarget? = null
    private var participantManagementRequestToken: Long = 0L
    private var participantComplianceRequestToken: Long = 0L

    fun setEventTeamsAndParticipantsLoading(loading: Boolean) {
        _eventTeamsAndParticipantsLoading.value = loading
    }

    fun replaceParticipantDivisionWarnings(warnings: List<EventParticipantDivisionWarning>) {
        _participantDivisionWarnings.value = warnings
    }

    fun applyLocalState(localState: ParticipantManagementLocalState) {
        _participantManagementSnapshot.value = localState.snapshot
        _teamComplianceSummaries.value = localState.teamSummaries
        _userComplianceSummaries.value = localState.userSummaries
    }

    fun clearParticipantManagementState() {
        _participantManagementSnapshot.value = EventParticipantManagementSnapshot()
        _participantManagementLoading.value = false
        _teamComplianceSummaries.value = emptyMap()
        _userComplianceSummaries.value = emptyMap()
        _participantComplianceLoading.value = false
    }

    fun markManagedBootstrapRequested(target: ParticipantManagementRoomTarget?, manage: Boolean) {
        if (manage) {
            managedDetailBootstrapRequest = target
        }
    }

    fun clearManagedBootstrapRequestIfCurrent(target: ParticipantManagementRoomTarget?) {
        if (managedDetailBootstrapRequest == target) {
            managedDetailBootstrapRequest = null
        }
    }

    fun beginManagedDetailBootstrap(target: ParticipantManagementRoomTarget?): Boolean {
        if (target == null) {
            _participantManagementLoading.value = false
            _participantComplianceLoading.value = false
            return false
        }
        if (target == managedDetailBootstrapRequest) {
            _participantManagementLoading.value = false
            _participantComplianceLoading.value = false
            return false
        }
        managedDetailBootstrapRequest = target
        _participantManagementLoading.value = true
        _participantComplianceLoading.value = true
        return true
    }

    fun finishManagedDetailBootstrap() {
        _participantManagementLoading.value = false
        _participantComplianceLoading.value = false
    }

    fun beginParticipantManagementRequest(eventId: String): Long? {
        if (eventId.trim().isEmpty()) {
            _participantManagementLoading.value = false
            return null
        }
        participantManagementRequestToken += 1
        _participantManagementLoading.value = true
        return participantManagementRequestToken
    }

    fun isCurrentParticipantManagementRequest(token: Long): Boolean =
        token == participantManagementRequestToken

    fun finishParticipantManagementRequest(token: Long) {
        if (isCurrentParticipantManagementRequest(token)) {
            _participantManagementLoading.value = false
        }
    }

    fun beginParticipantComplianceRequest(eventId: String): Long? {
        if (eventId.trim().isEmpty()) {
            _participantComplianceLoading.value = false
            return null
        }
        participantComplianceRequestToken += 1
        _participantComplianceLoading.value = true
        return participantComplianceRequestToken
    }

    fun isCurrentParticipantComplianceRequest(token: Long): Boolean =
        token == participantComplianceRequestToken

    fun finishParticipantComplianceRequest(token: Long) {
        if (isCurrentParticipantComplianceRequest(token)) {
            _participantComplianceLoading.value = false
        }
    }
}
