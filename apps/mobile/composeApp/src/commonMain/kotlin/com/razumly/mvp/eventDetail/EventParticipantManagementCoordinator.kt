package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventTeamBillCreateRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillingSnapshot
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantDivisionWarning
import com.razumly.mvp.core.data.repositories.EventParticipantManagementSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckout
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckoutRequest
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.ErrorMessage
import io.github.aakira.napier.Napier
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

private data class ParticipantBillingTarget(
    val eventId: String,
    val teamId: String,
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

    suspend fun refreshParticipantManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        reportErrors: Boolean,
        loadSnapshot: suspend (
            eventId: String,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<EventParticipantManagementSnapshot>,
    ): ErrorMessage? {
        val normalizedEventId = eventId.trim()
        val requestToken = beginParticipantManagementRequest(normalizedEventId)
            ?: return null
        try {
            return loadSnapshot(normalizedEventId, occurrence).fold(
                onSuccess = { null },
                onFailure = { throwable ->
                    if (!isCurrentParticipantManagementRequest(requestToken)) {
                        null
                    } else if (reportErrors) {
                        ErrorMessage(throwable.userMessage("Failed to load participant registrations."))
                    } else {
                        Napier.w("Failed to refresh participant registrations.", throwable)
                        null
                    }
                },
            )
        } finally {
            finishParticipantManagementRequest(requestToken)
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

    suspend fun refreshParticipantComplianceSummaries(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        teamSignup: Boolean,
        reportErrors: Boolean,
        loadTeamCompliance: suspend (
            eventId: String,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<List<EventTeamComplianceSummary>>,
        loadUserCompliance: suspend (
            eventId: String,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<List<EventComplianceUserSummary>>,
    ): ErrorMessage? {
        val normalizedEventId = eventId.trim()
        val requestToken = beginParticipantComplianceRequest(normalizedEventId)
            ?: return null

        try {
            val result = if (teamSignup) {
                loadTeamCompliance(normalizedEventId, occurrence)
            } else {
                loadUserCompliance(normalizedEventId, occurrence)
            }
            return result.fold(
                onSuccess = { null },
                onFailure = { throwable ->
                    if (!isCurrentParticipantComplianceRequest(requestToken)) {
                        null
                    } else if (reportErrors) {
                        ErrorMessage(throwable.userMessage("Failed to load participant payment and document status."))
                    } else {
                        Napier.w("Failed to refresh participant compliance.", throwable)
                        null
                    }
                },
            )
        } finally {
            finishParticipantComplianceRequest(requestToken)
        }
    }

    suspend fun refreshParticipantManagementData(
        target: ParticipantManagementRoomTarget,
        reportErrors: Boolean,
        loadSnapshot: suspend (
            eventId: String,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<EventParticipantManagementSnapshot>,
        loadTeamCompliance: suspend (
            eventId: String,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<List<EventTeamComplianceSummary>>,
        loadUserCompliance: suspend (
            eventId: String,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<List<EventComplianceUserSummary>>,
    ): ErrorMessage? {
        val occurrence = target.toOccurrence()
        val snapshotError = refreshParticipantManagementSnapshot(
            eventId = target.eventId,
            occurrence = occurrence,
            reportErrors = reportErrors,
            loadSnapshot = loadSnapshot,
        )
        val complianceError = refreshParticipantComplianceSummaries(
            eventId = target.eventId,
            occurrence = occurrence,
            teamSignup = target.teamSignup,
            reportErrors = reportErrors,
            loadTeamCompliance = loadTeamCompliance,
            loadUserCompliance = loadUserCompliance,
        )
        return complianceError ?: snapshotError
    }

    suspend fun getParticipantBillingSnapshot(
        eventId: String,
        teamId: String,
        loadSnapshot: suspend (eventId: String, teamId: String) -> Result<EventTeamBillingSnapshot>,
    ): Result<EventTeamBillingSnapshot> {
        val target = participantBillingTarget(eventId, teamId).getOrElse { throwable ->
            return Result.failure(throwable)
        }
        return loadSnapshot(target.eventId, target.teamId)
    }

    suspend fun createParticipantBill(
        eventId: String,
        teamId: String,
        request: EventTeamBillCreateRequest,
        createBill: suspend (
            eventId: String,
            teamId: String,
            request: EventTeamBillCreateRequest,
        ) -> Result<Any?>,
        refreshAfterSuccess: suspend () -> Unit,
    ): Result<Unit> {
        val target = participantBillingTarget(eventId, teamId).getOrElse { throwable ->
            return Result.failure(throwable)
        }
        val result = createBill(target.eventId, target.teamId, request).map { }
        if (result.isSuccess) {
            refreshAfterSuccess()
        }
        return result
    }

    suspend fun createParticipantPaymentCheckout(
        eventId: String,
        teamId: String,
        request: EventTeamPaymentCheckoutRequest,
        createCheckout: suspend (
            eventId: String,
            teamId: String,
            request: EventTeamPaymentCheckoutRequest,
        ) -> Result<EventTeamPaymentCheckout>,
    ): Result<EventTeamPaymentCheckout> {
        val target = participantBillingTarget(eventId, teamId).getOrElse { throwable ->
            return Result.failure(throwable)
        }
        return createCheckout(target.eventId, target.teamId, request)
    }

    suspend fun refundParticipantPayment(
        eventId: String,
        teamId: String,
        billPaymentId: String,
        amountCents: Int,
        refundPayment: suspend (
            eventId: String,
            teamId: String,
            billPaymentId: String,
            amountCents: Int,
        ) -> Result<Unit>,
        refreshAfterSuccess: suspend () -> Unit,
    ): Result<Unit> {
        val target = participantBillingTarget(eventId, teamId).getOrElse { throwable ->
            return Result.failure(throwable)
        }
        val result = refundPayment(target.eventId, target.teamId, billPaymentId, amountCents)
        if (result.isSuccess) {
            refreshAfterSuccess()
        }
        return result
    }
}

private fun participantBillingTarget(
    eventId: String,
    teamId: String,
): Result<ParticipantBillingTarget> {
    val normalizedEventId = eventId.trim()
    val normalizedTeamId = teamId.trim()
    if (normalizedEventId.isEmpty() || normalizedTeamId.isEmpty()) {
        return Result.failure(
            IllegalArgumentException("Event and participant team ids are required."),
        )
    }
    return Result.success(
        ParticipantBillingTarget(
            eventId = normalizedEventId,
            teamId = normalizedTeamId,
        ),
    )
}
