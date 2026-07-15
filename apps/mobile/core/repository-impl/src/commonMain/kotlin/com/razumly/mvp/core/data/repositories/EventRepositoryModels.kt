package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.BillDiscountSummary
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import kotlinx.serialization.Serializable
import kotlin.time.Instant

data class OrganizationEventPage(
    val events: List<Event>,
    val nextOffset: Int,
    val hasMore: Boolean,
)

data class HostEventPage(
    val events: List<Event>,
    val nextOffset: Int,
    val hasMore: Boolean,
)

enum class EventParticipantRefundMode(val wireValue: String) {
    AUTO("auto"),
    REQUEST("request"),
}

data class SelfRegistrationResult(
    val requiresParentApproval: Boolean = false,
    val joinedWaitlist: Boolean = false,
)

data class EventOccurrenceSelection(
    val slotId: String,
    val occurrenceDate: String,
    val label: String? = null,
)

data class EventParticipantsSyncResult(
    val event: Event,
    val participantCount: Int = 0,
    val participantCapacity: Int? = null,
    val divisionWarnings: List<EventParticipantDivisionWarning> = emptyList(),
    val weeklySelectionRequired: Boolean = false,
)

data class EventDetailSyncResult(
    val participants: EventParticipantsSyncResult,
    val matches: List<MatchMVP> = emptyList(),
    val fields: List<Field> = emptyList(),
    val timeSlots: List<TimeSlot> = emptyList(),
    val leagueScoringConfig: LeagueScoringConfig? = null,
    val staffInvites: List<Invite> = emptyList(),
    val staffRevision: String? = null,
) {
    val event: Event get() = participants.event
}

data class EventParticipantDivisionWarning(
    val divisionId: String,
    val code: String,
    val message: String,
    val filledCount: Int = 0,
    val slotCount: Int = 0,
    val maxTeams: Int = 0,
)

data class EventParticipantsSummary(
    val participantCount: Int = 0,
    val participantCapacity: Int? = null,
    val weeklySelectionRequired: Boolean = false,
)

data class EventParticipantManagementEntry(
    val registrationId: String,
    val registrantId: String,
    val registrantType: String,
    val rosterRole: String? = null,
    val status: String? = null,
    val parentId: String? = null,
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
    val consentDocumentId: String? = null,
    val consentStatus: String? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

data class EventParticipantManagementSnapshot(
    val teamRegistrations: List<EventParticipantManagementEntry> = emptyList(),
    val userRegistrations: List<EventParticipantManagementEntry> = emptyList(),
    val childRegistrations: List<EventParticipantManagementEntry> = emptyList(),
    val waitlistRegistrations: List<EventParticipantManagementEntry> = emptyList(),
    val freeAgentRegistrations: List<EventParticipantManagementEntry> = emptyList(),
)

data class EventCompliancePaymentSummary(
    val hasBill: Boolean = false,
    val billId: String? = null,
    val totalAmountCents: Int = 0,
    val paidAmountCents: Int = 0,
    val originalAmountCents: Int = totalAmountCents,
    val discountAmountCents: Int = 0,
    val discountedAmountCents: Int = totalAmountCents,
    val discounts: List<BillDiscountSummary> = emptyList(),
    val status: String? = null,
    val isPaidInFull: Boolean = false,
    val paymentPending: Boolean = false,
    val inheritedFromTeamBill: Boolean = false,
    val manualPaymentProofStatus: String? = null,
    val manualPaymentProofCount: Int = 0,
)

data class EventComplianceDocumentCounts(
    val signedCount: Int = 0,
    val requiredCount: Int = 0,
)

data class EventTemplateSummary(
    val id: String,
    val name: String,
    val description: String? = null,
    val sourceEventId: String? = null,
    val ownerUserId: String? = null,
    val organizationId: String? = null,
    val sportId: String? = null,
    val eventType: String? = null,
    val createdAt: Instant? = null,
    val updatedAt: Instant? = null,
)

@Serializable
data class SeededEventTemplateDraft(
    val event: Event,
    val fields: List<Field> = emptyList(),
    val timeSlots: List<TimeSlot> = emptyList(),
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
)

@Serializable
data class EventComplianceRequiredDocument(
    val key: String,
    val templateId: String,
    val title: String,
    val type: String,
    val signerContext: String,
    val signerLabel: String,
    val signOnce: Boolean,
    val status: String,
    val signedDocumentRecordId: String? = null,
    val signedAt: String? = null,
)

@Serializable
data class RegistrationQuestionAnswerSummary(
    val questionId: String,
    val prompt: String,
    val answerType: String = "TEXT",
    val required: Boolean = false,
    val sortOrder: Int = 0,
    val answer: String = "",
)

@Serializable
data class RegistrationQuestionDraft(
    val id: String? = null,
    val prompt: String = "",
    val answerType: String = "TEXT",
    val required: Boolean = false,
    val sortOrder: Int = 0,
)

const val REGISTRATION_SHORT_ANSWER_CHARACTER_LIMIT = 200
const val REGISTRATION_LONG_ANSWER_CHARACTER_LIMIT = 2_000

fun registrationAnswerCharacterLimit(answerType: String): Int =
    if (answerType.equals("LONG_TEXT", ignoreCase = true)) {
        REGISTRATION_LONG_ANSWER_CHARACTER_LIMIT
    } else {
        REGISTRATION_SHORT_ANSWER_CHARACTER_LIMIT
    }

data class EventComplianceUserSummary(
    val userId: String,
    val fullName: String,
    val userName: String? = null,
    val isMinorAtEvent: Boolean = false,
    val registrationType: String = "ADULT",
    val payment: EventCompliancePaymentSummary = EventCompliancePaymentSummary(),
    val documents: EventComplianceDocumentCounts = EventComplianceDocumentCounts(),
    val requiredDocuments: List<EventComplianceRequiredDocument> = emptyList(),
    val registrationAnswers: List<RegistrationQuestionAnswerSummary> = emptyList(),
)

data class EventTeamComplianceSummary(
    val teamId: String,
    val teamName: String,
    val payment: EventCompliancePaymentSummary = EventCompliancePaymentSummary(),
    val documents: EventComplianceDocumentCounts = EventComplianceDocumentCounts(),
    val users: List<EventComplianceUserSummary> = emptyList(),
    val registrationAnswers: List<RegistrationQuestionAnswerSummary> = emptyList(),
)

data class ChildRegistrationResult(
    val registrationStatus: String? = null,
    val consentStatus: String? = null,
    val requiresParentApproval: Boolean = false,
    val requiresChildEmail: Boolean = false,
    val joinedWaitlist: Boolean = false,
    val warnings: List<String> = emptyList(),
)

data class UserScheduleSnapshot(
    val events: List<Event> = emptyList(),
    val matches: List<MatchMVP> = emptyList(),
    val teams: List<Team> = emptyList(),
    val fields: List<Field> = emptyList(),
)

sealed interface UserScheduleNextAction {
    data object CreateEvent : UserScheduleNextAction

    data class EventShortcut(
        val eventId: String,
        val eventName: String,
        val eventImageId: String,
    ) : UserScheduleNextAction

    data class MatchShortcut(
        val eventId: String,
        val matchId: String,
        val eventName: String,
        val eventImageId: String,
    ) : UserScheduleNextAction
}
