package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.BillDiscountSummary
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.BillDiscountSummaryDto
import com.razumly.mvp.core.network.dto.CreateInvitesRequestDto
import com.razumly.mvp.core.network.dto.EventComplianceDocumentCountsDto
import com.razumly.mvp.core.network.dto.EventCompliancePaymentSummaryDto
import com.razumly.mvp.core.network.dto.EventComplianceRequiredDocumentDto
import com.razumly.mvp.core.network.dto.EventComplianceUserSummaryDto
import com.razumly.mvp.core.network.dto.EventTeamComplianceSummaryDto
import com.razumly.mvp.core.network.dto.InviteCreateDto
import com.razumly.mvp.core.network.dto.InvitesResponseDto
import com.razumly.mvp.core.network.dto.RegistrationQuestionAnswerSnapshotDto
import com.razumly.mvp.core.network.dto.TeamApiDto
import com.razumly.mvp.core.network.dto.TeamInviteEventTeamOptionDto
import com.razumly.mvp.core.network.dto.TeamInviteFreeAgentsResponseDto
import com.razumly.mvp.core.network.dto.TeamMemberInviteRequestDto
import com.razumly.mvp.core.network.dto.TeamMemberInviteResponseDto
import com.razumly.mvp.core.network.dto.TeamMemberComplianceResponseDto
import com.razumly.mvp.core.network.dto.TeamPlayerRegistrationApiDto
import com.razumly.mvp.core.network.dto.TeamRegistrationResponseDto
import com.razumly.mvp.core.network.dto.TeamRefundRequestDto
import com.razumly.mvp.core.network.dto.TeamRefundResponseDto
import com.razumly.mvp.core.network.dto.TeamsResponseDto
import com.razumly.mvp.core.network.dto.UpdateTeamRequestDto
import com.razumly.mvp.core.network.dto.toTeamPlayerRegistrationOrNull
import com.razumly.mvp.core.network.dto.toUpdateDto
import com.razumly.mvp.core.network.dto.toUserDataOrNull
import com.razumly.mvp.core.util.jsonMVP
import com.razumly.mvp.core.util.newId
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject

data class OrganizationTeamPage(
    val teams: List<TeamWithPlayers>,
    val nextOffset: Int,
    val hasMore: Boolean,
)

data class TeamMemberInviteResult(
    val invite: Invite? = null,
    val shareUrl: String? = null,
)

interface ITeamRepository : IMVPRepository {
    fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>>
    fun getCachedTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> = getTeamsFlow(ids)
    suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers>
    suspend fun getTeams(ids: List<String>): Result<List<Team>>
    suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>>
    suspend fun getTeamsByOrganization(
        organizationId: String,
        limit: Int = 200,
    ): Result<List<TeamWithPlayers>> = Result.failure(NotImplementedError("Organization team lookup is not implemented."))
    suspend fun getOrganizationTeamsPage(
        organizationId: String,
        limit: Int = 50,
        offset: Int = 0,
    ): Result<OrganizationTeamPage> {
        return getTeamsByOrganization(organizationId, limit).map { teams ->
            OrganizationTeamPage(
                teams = teams,
                nextOffset = offset.coerceAtLeast(0) + teams.size,
                hasMore = false,
            )
        }
    }
    suspend fun searchTeamsForEventInvite(
        query: String,
        eventId: String? = null,
        organizationId: String? = null,
        sportName: String? = null,
        excludeTeamIds: Set<String> = emptySet(),
        limit: Int = 200,
    ): Result<List<Team>> = Result.failure(NotImplementedError("Team invite search is not implemented."))
    suspend fun searchOpenRegistrationTeams(
        query: String = "",
        limit: Int = 100,
    ): Result<List<Team>> = Result.failure(NotImplementedError("Open team registration search is not implemented."))
    suspend fun searchOpenRegistrationTeamsPage(
        query: String = "",
        limit: Int = 100,
        offset: Int = 0,
    ): Result<RepositoryPage<Team>> =
        searchOpenRegistrationTeams(query = query, limit = limit).map { teams ->
            RepositoryPage(
                items = teams,
                pagination = RepositoryPagination(
                    limit = limit,
                    offset = offset,
                    nextOffset = offset + teams.size,
                    hasMore = teams.size >= limit,
                ),
            )
        }
    suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit>
    suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit>
    suspend fun createTeam(newTeam: Team): Result<Team>
    suspend fun updateTeam(newTeam: Team): Result<Team>
    suspend fun getTeamsForUser(userId: String): Result<List<Team>> =
        Result.failure(NotImplementedError("Team membership lookup is not implemented."))
    suspend fun getTeamJoinRequestContext(teamId: String): Result<TeamJoinRequestContext> =
        Result.failure(NotImplementedError("Team join request context is not implemented."))
    suspend fun requestTeamRegistration(
        teamId: String,
        answers: Map<String, String> = emptyMap(),
    ): Result<TeamRegistrationResult>
    suspend fun submitTeamJoinRequest(
        teamId: String,
        answers: Map<String, String> = emptyMap(),
    ): Result<TeamJoinRequestResult> =
        Result.failure(NotImplementedError("Team join requests are not implemented."))
    suspend fun requestChildTeamRegistration(
        teamId: String,
        childId: String,
    ): Result<TeamRegistrationResult> = Result.failure(
        NotImplementedError("Child team registration is not implemented."),
    )
    suspend fun getTeamMemberCompliance(teamId: String): Result<EventTeamComplianceSummary> =
        Result.failure(NotImplementedError("Team member compliance is not implemented."))
    suspend fun requestTeamRegistrationRefund(teamId: String, reason: String): Result<Unit> =
        Result.failure(NotImplementedError("Team registration refunds are not implemented."))
    suspend fun registerForTeam(teamId: String): Result<Team>
    suspend fun leaveTeam(teamId: String): Result<Team>
    suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit>
    fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>>
    fun getTeamsWithPlayersLoadingFlow(id: String): Flow<Boolean> = flowOf(false)
    fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>>
    suspend fun listTeamInvites(userId: String): Result<List<Invite>>
    suspend fun getInviteFreeAgentContext(teamId: String): Result<TeamInviteFreeAgentContext> =
        getInviteFreeAgents(teamId).map { users -> TeamInviteFreeAgentContext(users = users) }
    suspend fun getInviteFreeAgents(teamId: String): Result<List<UserData>>
    suspend fun createTeamMemberInvite(
        teamId: String,
        userId: String? = null,
        email: String? = null,
        roleInviteType: String = "player",
        firstName: String? = null,
        lastName: String? = null,
        phone: String? = null,
        shareOnly: Boolean = false,
    ): Result<TeamMemberInviteResult> = userId
        ?.takeIf(String::isNotBlank)
        ?.let {
            createTeamInvite(teamId = teamId, userId = it, createdBy = "", inviteType = roleInviteType)
                .map { TeamMemberInviteResult() }
        }
        ?: Result.failure(IllegalArgumentException("A user id is required for this repository implementation."))
    suspend fun createTeamInvite(
        teamId: String,
        userId: String,
        createdBy: String,
        inviteType: String = "player",
    ): Result<Unit>
    suspend fun deleteInvite(inviteId: String): Result<Unit>
    suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit>
}

@Serializable
private data class TeamRegistrationRequestDto(
    val noop: Boolean = true,
    val answers: Map<String, String> = emptyMap(),
)

@Serializable
private data class TeamChildRegistrationRequestDto(
    val childId: String,
    val answers: Map<String, String> = emptyMap(),
)

@Serializable
private data class TeamJoinQuestionDto(
    val id: String = "",
    val prompt: String = "",
    val answerType: String = "TEXT",
    val required: Boolean = false,
    val sortOrder: Int = 0,
)

@Serializable
private data class TeamJoinRequestContextDto(
    val teamId: String = "",
    val joinPolicy: String = "CLOSED",
    val openRegistration: Boolean = false,
    val registrationPriceCents: Int = 0,
    val questions: List<TeamJoinQuestionDto> = emptyList(),
)

@Serializable
private data class TeamJoinRequestSubmitDto(
    val answers: Map<String, String> = emptyMap(),
)

@Serializable
private data class TeamJoinRequestApiDto(
    val id: String = "",
    val teamId: String = "",
    val status: String = "",
    val registrantUserId: String = "",
    val requesterUserId: String = "",
)

@Serializable
private data class TeamJoinRequestResponseDto(
    val request: TeamJoinRequestApiDto? = null,
    val error: String? = null,
)

data class TeamJoinQuestion(
    val id: String,
    val prompt: String,
    val answerType: String = "TEXT",
    val required: Boolean = false,
    val sortOrder: Int = 0,
)

data class TeamJoinRequestContext(
    val teamId: String,
    val joinPolicy: String,
    val openRegistration: Boolean,
    val registrationPriceCents: Int,
    val questions: List<TeamJoinQuestion> = emptyList(),
)

data class TeamJoinRequestResult(
    val requestId: String,
    val status: String,
    val teamId: String,
)

data class TeamRegistrationConsent(
    val documentId: String? = null,
    val status: String? = null,
    val childEmail: String? = null,
    val requiresChildEmail: Boolean = false,
)

data class TeamRegistrationResult(
    val team: Team,
    val registrationId: String? = null,
    val registration: TeamPlayerRegistration? = null,
    val registrationStatus: String? = null,
    val consent: TeamRegistrationConsent? = null,
    val warnings: List<String> = emptyList(),
    val requiresParentApproval: Boolean = false,
    val message: String? = null,
    val invite: com.razumly.mvp.core.data.dataTypes.Invite? = null,
)

data class TeamInviteEventTeamOption(
    val eventId: String,
    val eventTeamId: String,
    val eventName: String,
    val eventStart: String?,
    val eventEnd: String?,
    val teamName: String,
)

data class TeamInviteFreeAgentContext(
    val users: List<UserData> = emptyList(),
    val eventIds: List<String> = emptyList(),
    val freeAgentIds: List<String> = emptyList(),
    val eventTeams: List<TeamInviteEventTeamOption> = emptyList(),
    val freeAgentEventsByUserId: Map<String, List<String>> = emptyMap(),
    val freeAgentEventTeamIdsByUserId: Map<String, List<String>> = emptyMap(),
)

private fun String?.isJoinedTeamRegistrationStatus(): Boolean =
    equals("ACTIVE", ignoreCase = true) || equals("PENDING", ignoreCase = true)

private fun String?.normalizeTeamJoinPolicy(openRegistration: Boolean = false): String {
    val normalized = this?.trim()?.uppercase()?.takeIf(String::isNotBlank)
    return when (normalized) {
        "OPEN_REGISTRATION", "REQUEST_TO_JOIN", "CLOSED" -> normalized
        else -> if (openRegistration) "OPEN_REGISTRATION" else "CLOSED"
    }
}

private fun Map<String, String>.normalizeAnswerMap(): Map<String, String> =
    mapNotNull { (questionId, answer) ->
        val normalizedQuestionId = questionId.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
        normalizedQuestionId to answer.trim()
    }.toMap()

private fun TeamJoinQuestionDto.toQuestionOrNull(): TeamJoinQuestion? {
    val normalizedId = id.trim().takeIf(String::isNotBlank) ?: return null
    val normalizedPrompt = prompt.trim().takeIf(String::isNotBlank) ?: return null
    return TeamJoinQuestion(
        id = normalizedId,
        prompt = normalizedPrompt,
        answerType = answerType.trim().uppercase().takeIf(String::isNotBlank) ?: "TEXT",
        required = required,
        sortOrder = sortOrder,
    )
}

private fun TeamJoinRequestContextDto.toContext(): TeamJoinRequestContext {
    val resolvedTeamId = teamId.trim().takeIf(String::isNotBlank)
        ?: error("Team join context response missing team id.")
    return TeamJoinRequestContext(
        teamId = resolvedTeamId,
        joinPolicy = joinPolicy.normalizeTeamJoinPolicy(openRegistration),
        openRegistration = openRegistration,
        registrationPriceCents = registrationPriceCents.coerceAtLeast(0),
        questions = questions
            .mapNotNull(TeamJoinQuestionDto::toQuestionOrNull)
            .sortedBy(TeamJoinQuestion::sortOrder),
    )
}

private fun TeamJoinRequestResponseDto.toJoinRequestResult(): TeamJoinRequestResult {
    error?.trim()?.takeIf(String::isNotBlank)?.let(::error)
    val row = request ?: error("Join request response missing request.")
    val requestId = row.id.trim().takeIf(String::isNotBlank)
        ?: error("Join request response missing request id.")
    val teamId = row.teamId.trim().takeIf(String::isNotBlank)
        ?: error("Join request response missing team id.")
    return TeamJoinRequestResult(
        requestId = requestId,
        status = row.status.trim().takeIf(String::isNotBlank) ?: "PENDING",
        teamId = teamId,
    )
}

fun TeamRegistrationResult.isActive(): Boolean =
    registrationStatus.isJoinedTeamRegistrationStatus() ||
        registration?.status.isJoinedTeamRegistrationStatus()

fun TeamRegistrationResult.requiresAdditionalSigning(): Boolean =
    consent != null && !consent.status.equals("completed", ignoreCase = true)

fun TeamRegistrationResult.requiresChildEmail(): Boolean = consent?.requiresChildEmail == true

fun TeamRegistrationResult.userMessage(defaultMessage: String): String {
    if (requiresParentApproval) {
        return message?.trim()?.takeIf(String::isNotBlank)
            ?: "A parent or guardian must approve this team request before registration can continue."
    }
    if (requiresChildEmail()) {
        return warnings.firstOrNull()
            ?: "Add the child's email before requesting child-signature documents."
    }
    if (warnings.isNotEmpty()) {
        return warnings.first()
    }
    if (requiresAdditionalSigning()) {
        return "Complete the required team documents before continuing."
    }
    return defaultMessage
}

private fun TeamRegistrationResponseDto.toTeamRegistrationResult(): TeamRegistrationResult {
    error?.takeIf(String::isNotBlank)?.let(::error)
    val resolvedTeam = team?.toTeamOrNull() ?: error("Team registration response missing team")
    return TeamRegistrationResult(
        team = resolvedTeam,
        registrationId = registrationId?.trim()?.takeIf(String::isNotBlank),
        registration = registration?.toTeamPlayerRegistrationOrNull(),
        registrationStatus = status?.trim()?.takeIf(String::isNotBlank)
            ?: registration?.status?.trim()?.takeIf(String::isNotBlank),
        consent = consent?.toConsentOrNull(),
        warnings = warnings.map(String::trim).filter(String::isNotBlank),
        requiresParentApproval = requiresParentApproval == true,
        message = message?.trim()?.takeIf(String::isNotBlank),
        invite = invite,
    )
}

private fun com.razumly.mvp.core.network.dto.TeamRegistrationConsentDto.toConsentOrNull(): TeamRegistrationConsent? {
    val normalizedStatus = status?.trim()?.takeIf(String::isNotBlank)
    val normalizedDocumentId = documentId?.trim()?.takeIf(String::isNotBlank)
    val normalizedChildEmail = childEmail?.trim()?.takeIf(String::isNotBlank)
    val childEmailRequired = requiresChildEmail == true
    if (normalizedStatus == null && normalizedDocumentId == null && normalizedChildEmail == null && !childEmailRequired) {
        return null
    }
    return TeamRegistrationConsent(
        documentId = normalizedDocumentId,
        status = normalizedStatus,
        childEmail = normalizedChildEmail,
        requiresChildEmail = childEmailRequired,
    )
}

private fun EventCompliancePaymentSummaryDto?.toCompliancePaymentSummary(): EventCompliancePaymentSummary {
    if (this == null) return EventCompliancePaymentSummary()
    return EventCompliancePaymentSummary(
        hasBill = hasBill == true,
        billId = billId?.trim()?.takeIf(String::isNotBlank),
        totalAmountCents = totalAmountCents ?: 0,
        paidAmountCents = paidAmountCents ?: 0,
        originalAmountCents = originalAmountCents ?: totalAmountCents ?: 0,
        discountAmountCents = discountAmountCents ?: 0,
        discountedAmountCents = discountedAmountCents ?: totalAmountCents ?: 0,
        discounts = discounts.mapNotNull(BillDiscountSummaryDto::toBillDiscountSummaryOrNull),
        status = status?.trim()?.takeIf(String::isNotBlank),
        isPaidInFull = isPaidInFull == true,
        paymentPending = paymentPending == true,
        inheritedFromTeamBill = inheritedFromTeamBill == true,
    )
}

private fun BillDiscountSummaryDto.toBillDiscountSummaryOrNull(): BillDiscountSummary? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDiscountId = discountId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDiscountCodeId = discountCodeId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedCode = code?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedOriginal = originalAmountCents ?: return null
    val resolvedDiscounted = discountedAmountCents ?: return null
    return BillDiscountSummary(
        id = resolvedId,
        discountId = resolvedDiscountId,
        discountCodeId = resolvedDiscountCodeId,
        code = resolvedCode,
        name = name?.trim()?.takeIf(String::isNotBlank),
        originalAmountCents = resolvedOriginal.coerceAtLeast(0),
        discountedAmountCents = resolvedDiscounted.coerceAtLeast(0),
        discountAmountCents = (discountAmountCents ?: (resolvedOriginal - resolvedDiscounted)).coerceAtLeast(0),
        paymentIntentId = paymentIntentId?.trim()?.takeIf(String::isNotBlank),
        registrationId = registrationId?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun EventComplianceDocumentCountsDto?.toComplianceDocumentCounts(): EventComplianceDocumentCounts {
    if (this == null) return EventComplianceDocumentCounts()
    return EventComplianceDocumentCounts(
        signedCount = signedCount ?: 0,
        requiredCount = requiredCount ?: 0,
    )
}

private fun EventComplianceRequiredDocumentDto.toComplianceRequiredDocumentOrNull(): EventComplianceRequiredDocument? {
    val normalizedKey = key?.trim()?.takeIf(String::isNotBlank)
    val normalizedTemplateId = templateId?.trim()?.takeIf(String::isNotBlank)
    if (normalizedKey == null || normalizedTemplateId == null) return null
    return EventComplianceRequiredDocument(
        key = normalizedKey,
        templateId = normalizedTemplateId,
        title = title?.trim()?.takeIf(String::isNotBlank) ?: "Required document",
        type = type?.trim()?.takeIf(String::isNotBlank) ?: "PDF",
        signerContext = signerContext?.trim()?.takeIf(String::isNotBlank) ?: "participant",
        signerLabel = signerLabel?.trim()?.takeIf(String::isNotBlank) ?: "Participant",
        signOnce = signOnce == true,
        status = status?.trim()?.takeIf(String::isNotBlank) ?: "UNSIGNED",
        signedDocumentRecordId = signedDocumentRecordId?.trim()?.takeIf(String::isNotBlank),
        signedAt = signedAt?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun RegistrationQuestionAnswerSnapshotDto.toRegistrationQuestionAnswerOrNull(): RegistrationQuestionAnswerSummary? {
    val normalizedQuestionId = questionId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedPrompt = prompt?.trim()?.takeIf(String::isNotBlank) ?: return null
    return RegistrationQuestionAnswerSummary(
        questionId = normalizedQuestionId,
        prompt = normalizedPrompt,
        answerType = answerType?.trim()?.takeIf(String::isNotBlank) ?: "TEXT",
        required = required == true,
        sortOrder = sortOrder ?: 0,
        answer = answer?.trim().orEmpty(),
    )
}

private fun EventComplianceUserSummaryDto.toComplianceUserSummaryOrNull(): EventComplianceUserSummary? {
    val normalizedUserId = userId?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventComplianceUserSummary(
        userId = normalizedUserId,
        fullName = fullName?.trim()?.takeIf(String::isNotBlank) ?: normalizedUserId,
        userName = userName?.trim()?.takeIf(String::isNotBlank),
        isMinorAtEvent = isMinorAtEvent == true,
        registrationType = registrationType?.trim()?.takeIf(String::isNotBlank) ?: "ADULT",
        payment = payment.toCompliancePaymentSummary(),
        documents = documents.toComplianceDocumentCounts(),
        requiredDocuments = requiredDocuments.mapNotNull(EventComplianceRequiredDocumentDto::toComplianceRequiredDocumentOrNull),
        registrationAnswers = registrationAnswers.mapNotNull(RegistrationQuestionAnswerSnapshotDto::toRegistrationQuestionAnswerOrNull),
    )
}

private fun EventTeamComplianceSummaryDto.toTeamComplianceSummaryOrNull(): EventTeamComplianceSummary? {
    val normalizedTeamId = teamId?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventTeamComplianceSummary(
        teamId = normalizedTeamId,
        teamName = teamName?.trim()?.takeIf(String::isNotBlank) ?: "Team",
        payment = payment.toCompliancePaymentSummary(),
        documents = documents.toComplianceDocumentCounts(),
        users = users.mapNotNull(EventComplianceUserSummaryDto::toComplianceUserSummaryOrNull),
        registrationAnswers = registrationAnswers.mapNotNull(RegistrationQuestionAnswerSnapshotDto::toRegistrationQuestionAnswerOrNull),
    )
}

private fun TeamInviteEventTeamOptionDto.toDomainOrNull(): TeamInviteEventTeamOption? {
    val normalizedEventId = eventId.trim().takeIf(String::isNotBlank) ?: return null
    val normalizedEventTeamId = eventTeamId.trim().takeIf(String::isNotBlank) ?: return null
    return TeamInviteEventTeamOption(
        eventId = normalizedEventId,
        eventTeamId = normalizedEventTeamId,
        eventName = eventName.trim().ifBlank { "Event" },
        eventStart = eventStart?.trim()?.takeIf(String::isNotBlank),
        eventEnd = eventEnd?.trim()?.takeIf(String::isNotBlank),
        teamName = teamName.trim().ifBlank { "Team" },
    )
}

private fun TeamInviteFreeAgentsResponseDto.toDomain(users: List<UserData>): TeamInviteFreeAgentContext =
    TeamInviteFreeAgentContext(
        users = users,
        eventIds = eventIds.map(String::trim).filter(String::isNotBlank).distinct(),
        freeAgentIds = freeAgentIds.map(String::trim).filter(String::isNotBlank).distinct(),
        eventTeams = eventTeams.mapNotNull(TeamInviteEventTeamOptionDto::toDomainOrNull),
        freeAgentEventsByUserId = freeAgentEventsByUserId.normalizeStringListMap(),
        freeAgentEventTeamIdsByUserId = freeAgentEventTeamIdsByUserId.normalizeStringListMap(),
    )

private fun Map<String, List<String>>.normalizeStringListMap(): Map<String, List<String>> =
    mapNotNull { (key, values) ->
        val normalizedKey = key.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
        normalizedKey to values.map(String::trim).filter(String::isNotBlank).distinct()
    }.toMap()

private fun Team.isEventTeamSnapshot(): Boolean =
    !kind.isNullOrBlank() || !parentTeamId.isNullOrBlank()

class TeamRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
    private val userRepository: IUserRepository,
    private val pushNotificationRepository: IPushNotificationsRepository,
) : ITeamRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val userTeamsLoadingState = MutableStateFlow<Map<String, Boolean>>(emptyMap())

    private companion object {
        val TEAM_UPDATE_FIELDS = setOf(
            "name",
            "division",
            "playerIds",
            "captainId",
            "managerId",
            "headCoachId",
            "assistantCoachIds",
            "coachIds",
            "parentTeamId",
            "pending",
            "teamSize",
            "profileImageId",
            "sport",
            "divisionTypeId",
            "joinPolicy",
            "openRegistration",
            "registrationPriceCents",
            "requiredTemplateIds",
            "playerRegistrations",
        )
    }

    override fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> {
        val teamIds = ids.distinct().filter(String::isNotBlank)
        if (teamIds.isEmpty()) {
            return flowOf(Result.success(emptyList()))
        }

        val localFlow = databaseService.getTeamDao.getTeamsWithPlayersFlowByIds(teamIds)
            .map { teams -> Result.success(teams) }

        scope.launch {
            getTeams(teamIds)
        }

        return localFlow
    }

    override fun getCachedTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> {
        val teamIds = ids.distinct().filter(String::isNotBlank)
        if (teamIds.isEmpty()) {
            return flowOf(Result.success(emptyList()))
        }
        return databaseService.getTeamDao.getTeamsWithPlayersFlowByIds(teamIds)
            .map { teams -> Result.success(teams) }
    }

    override suspend fun getTeams(ids: List<String>): Result<List<Team>> {
        val teamIds = ids.distinct().filter(String::isNotBlank)
        if (teamIds.isEmpty()) return Result.success(emptyList())

        return runCatching {
            val remoteTeams = fetchRemoteTeamsByIds(teamIds)
            val localTeams = databaseService.getTeamDao.getTeams(teamIds)
            if (remoteTeams.isNotEmpty()) {
                databaseService.getTeamDao.upsertTeamsWithRelations(remoteTeams)
            }

            val teamsById = (localTeams + remoteTeams)
                .mapNotNull { team ->
                    team.id.trim()
                        .takeIf(String::isNotBlank)
                        ?.let { teamId -> teamId to team }
                }
                .toMap()
            teamIds.mapNotNull(teamsById::get)
        }
    }

    override suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>> =
        runCatching {
            if (ids.isEmpty()) return@runCatching emptyList()
            getTeams(ids).getOrThrow()
            databaseService.getTeamDao.getTeamsWithPlayersFlowByIds(ids).first()
        }

    override suspend fun getTeamsByOrganization(
        organizationId: String,
        limit: Int,
    ): Result<List<TeamWithPlayers>> = runCatching {
        val normalizedOrganizationId = organizationId.trim()
        if (normalizedOrganizationId.isBlank()) return@runCatching emptyList()
        val teams = fetchRemoteTeamsByOrganization(normalizedOrganizationId, limit)
        if (teams.isEmpty()) {
            return@runCatching emptyList()
        }
        databaseService.getTeamDao.upsertTeamsWithRelations(teams)
        databaseService.getTeamDao.getTeamsWithPlayersFlowByIds(teams.map(Team::id)).first()
    }

    override suspend fun getOrganizationTeamsPage(
        organizationId: String,
        limit: Int,
        offset: Int,
    ): Result<OrganizationTeamPage> = runCatching {
        val normalizedOrganizationId = organizationId.trim()
        val safeOffset = offset.coerceAtLeast(0)
        if (normalizedOrganizationId.isBlank()) {
            return@runCatching OrganizationTeamPage(
                teams = emptyList(),
                nextOffset = 0,
                hasMore = false,
            )
        }

        val page = fetchRemoteTeamsPageByOrganization(
            organizationId = normalizedOrganizationId,
            limit = limit,
            offset = safeOffset,
        )
        if (page.teams.isEmpty()) {
            return@runCatching OrganizationTeamPage(
                teams = emptyList(),
                nextOffset = page.nextOffset,
                hasMore = page.hasMore,
            )
        }

        databaseService.getTeamDao.upsertTeamsWithRelations(page.teams)
        val remoteTeamIds = page.teams.map(Team::id)
        val hydratedById = databaseService.getTeamDao
            .getTeamsWithPlayersFlowByIds(remoteTeamIds)
            .first()
            .associateBy { teamWithPlayers -> teamWithPlayers.team.id }
        OrganizationTeamPage(
            teams = remoteTeamIds.mapNotNull(hydratedById::get),
            nextOffset = page.nextOffset,
            hasMore = page.hasMore,
        )
    }

    override suspend fun searchTeamsForEventInvite(
        query: String,
        eventId: String?,
        organizationId: String?,
        sportName: String?,
        excludeTeamIds: Set<String>,
        limit: Int,
    ): Result<List<Team>> = runCatching {
        val normalizedQuery = query.trim().lowercase()
        if (normalizedQuery.length < 2) {
            return@runCatching emptyList()
        }
        val safeLimit = limit.coerceIn(1, 200)
        val normalizedOrganizationId = organizationId?.trim()?.takeIf(String::isNotBlank)
        val normalizedSportName = sportName.toInviteSportKey()
        val excludedIds = excludeTeamIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .toSet()

        val teamsById = linkedMapOf<String, Team>()
        if (normalizedOrganizationId != null) {
            fetchRemoteTeamsByOrganization(normalizedOrganizationId, safeLimit).forEach { team ->
                teamsById[team.id] = team
            }
        }
        fetchRemoteTeamsForSearch(safeLimit).forEach { team ->
            if (!teamsById.containsKey(team.id)) {
                teamsById[team.id] = team
            }
        }

        val filteredTeams = teamsById.values
            .asSequence()
            .filterNot { team ->
                val parentTeamId = team.parentTeamId?.trim()?.takeIf(String::isNotBlank)
                team.id in excludedIds ||
                    (parentTeamId != null && parentTeamId in excludedIds)
            }
            .filter { team ->
                normalizedSportName.isBlank() || team.sport.toInviteSportKey() == normalizedSportName
            }
            .filter { team ->
                team.inviteSearchText().contains(normalizedQuery)
            }
            .take(24)
            .toList()

        if (filteredTeams.isNotEmpty()) {
            databaseService.getTeamDao.upsertTeamsWithRelations(filteredTeams)
        }
        filteredTeams
    }

    override suspend fun searchOpenRegistrationTeams(
        query: String,
        limit: Int,
    ): Result<List<Team>> =
        searchOpenRegistrationTeamsPage(query = query, limit = limit, offset = 0)
            .map { page -> page.items }

    override suspend fun searchOpenRegistrationTeamsPage(
        query: String,
        limit: Int,
        offset: Int,
    ): Result<RepositoryPage<Team>> = runCatching {
        val safeLimit = limit.coerceIn(1, 200)
        val safeOffset = offset.coerceAtLeast(0)
        val normalizedQuery = query.trim()
        val queryParam = normalizedQuery
            .takeIf(String::isNotBlank)
            ?.let { "&query=${it.encodeURLQueryComponent()}" }
            .orEmpty()
        val res = api.get<TeamsResponseDto>("api/teams?openRegistration=true&limit=$safeLimit&offset=$safeOffset$queryParam")
        val teams = res.teams
            .mapNotNull { it.toTeamOrNull() }
            .filter { team -> team.openRegistration }
        if (teams.isNotEmpty()) {
            databaseService.getTeamDao.upsertTeamsWithRelations(teams)
        }
        ensureUsersCachedForTeams(teams)
        RepositoryPage(
            items = teams,
            pagination = RepositoryPagination(
                limit = res.pagination?.limit ?: safeLimit,
                offset = res.pagination?.offset ?: safeOffset,
                nextOffset = res.pagination?.nextOffset ?: safeOffset + teams.size,
                hasMore = res.pagination?.hasMore ?: (teams.size >= safeLimit),
            ),
        )
    }

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> {
        val syncedTeam = team.withSynchronizedMembership()
        val membershipChanged = !syncedTeam.playerIds.contains(player.id) || syncedTeam.pending.contains(player.id)
        val addResult = runCatching {
            databaseService.getTeamDao.upsertTeamPlayerCrossRef(
                TeamPlayerCrossRef(syncedTeam.id, player.id)
            )
        }

        if (membershipChanged) {
            val updatedTeam = syncedTeam.copy(
                playerIds = (syncedTeam.playerIds + player.id).distinct(),
                pending = syncedTeam.pending - player.id,
            ).withSynchronizedMembership()
            updateTeam(updatedTeam).onFailure {
                databaseService.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(syncedTeam.id, player.id))
                return Result.failure(it)
            }
        }
        if (membershipChanged) {
            refreshCurrentUserProfileIfAffected(player.id)
        }

        pushNotificationRepository.subscribeUserToTeamNotifications(player.id, syncedTeam.id)
        return addResult
    }

    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> {
        val syncedTeam = team.withSynchronizedMembership()
        val membershipChanged = syncedTeam.playerIds.contains(player.id)
        val deleteResult = runCatching {
            databaseService.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(syncedTeam.id, player.id))
        }

        if (membershipChanged) {
            val updatedTeam = syncedTeam.copy(playerIds = syncedTeam.playerIds - player.id)
                .withSynchronizedMembership()
            updateTeam(updatedTeam).onFailure {
                databaseService.getTeamDao.upsertTeamPlayerCrossRef(TeamPlayerCrossRef(syncedTeam.id, player.id))
                return Result.failure(it)
            }
        }
        if (membershipChanged) {
            refreshCurrentUserProfileIfAffected(player.id)
        }

        pushNotificationRepository.unsubscribeUserFromTeamNotifications(player.id, syncedTeam.id)
        if (player.id != userRepository.currentUser.value.getOrThrow().id) {
            pushNotificationRepository.sendUserNotification(
                player.id,
                syncedTeam.name.ifBlank { "Team Update" },
                "You have been removed from a team",
            )
        }
        return deleteResult
    }

    override suspend fun createTeam(newTeam: Team): Result<Team> {
        val id = newId()
        val currentUser = userRepository.currentUser.value.getOrThrow()
        val syncedNewTeam = newTeam.withSynchronizedMembership()

        return singleResponse(
            networkCall = {
                val created = api.post<Team, TeamApiDto>(
                    path = "api/teams",
                    body = syncedNewTeam.copy(id = id).withSynchronizedMembership(),
                ).toTeamOrNull() ?: error("Create team response missing team")

                ensureUsersCachedForTeam(created)
                created
            },
            saveCall = { created ->
                databaseService.getTeamDao.upsertTeamWithRelations(created)
                refreshCurrentUserProfileIfAffected(currentUser.id)
            },
            onReturn = { created ->
                AnalyticsTracker.capture(
                    AnalyticsEvent.TeamCreated,
                    mapOf(
                        "team_id" to created.id,
                        "has_organization" to (!created.organizationId.isNullOrBlank()).toString(),
                    ),
                )
                created
            },
        )
    }

    override suspend fun updateTeam(newTeam: Team): Result<Team> = singleResponse(
        networkCall = {
            val syncedTeam = newTeam.withSynchronizedMembership()
            val cachedTeam = runCatching { databaseService.getTeamDao.getTeam(syncedTeam.id) }.getOrNull()
            val preparedUpdate = prepareTeamUpdate(
                newTeam = syncedTeam,
                cachedTeam = cachedTeam,
            )
            if (preparedUpdate == null) {
                return@singleResponse syncedTeam
            }

            val updated = patchTeamUpdate(teamId = syncedTeam.id, prepared = preparedUpdate)

            ensureUsersCachedForTeam(updated)
            updated
        },
        saveCall = { newData ->
            val oldTeam = runCatching { databaseService.getTeamDao.getTeam(newData.id) }.getOrNull()

            databaseService.getTeamDao.upsertTeamWithRelations(newData)

            if (oldTeam != null) {
                // Propagate player removals to local membership cache and notifications.
                userRepository.getUsers(oldTeam.playerIds.filterNot { it in newData.playerIds })
                    .onSuccess { removedPlayers ->
                        removedPlayers.forEach { player -> removePlayerFromTeam(newData, player) }
                    }

            }
        },
        onReturn = { team -> team },
    )

    override suspend fun getTeamsForUser(userId: String): Result<List<Team>> {
        val normalizedUserId = userId.trim().takeIf(String::isNotBlank)
            ?: return Result.failure(IllegalArgumentException("User id is required."))
        return fetchRemoteTeamsForUser(normalizedUserId)
    }

    override suspend fun getTeamJoinRequestContext(teamId: String): Result<TeamJoinRequestContext> = runCatching {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank)
            ?: error("Team id is required.")
        val response = api.get<TeamJoinRequestContextDto>(
            path = "api/teams/${normalizedTeamId.encodeURLQueryComponent()}/join-request-context",
        )
        response.toContext()
    }

    override suspend fun requestTeamRegistration(
        teamId: String,
        answers: Map<String, String>,
    ): Result<TeamRegistrationResult> = runCatching {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank)
            ?: error("Team id is required.")
        val response = api.post<TeamRegistrationRequestDto, TeamRegistrationResponseDto>(
            path = "api/teams/${normalizedTeamId.encodeURLQueryComponent()}/registrations/self",
            body = TeamRegistrationRequestDto(answers = answers.normalizeAnswerMap()),
        )
        val result = response.toTeamRegistrationResult()
        ensureUsersCachedForTeam(result.team)
        databaseService.getTeamDao.upsertTeamWithRelations(result.team)
        runCatching { userRepository.getCurrentAccount().getOrThrow() }
        AnalyticsTracker.capture(
            if (result.isActive()) AnalyticsEvent.TeamRegistrationCompleted else AnalyticsEvent.TeamRegistrationStarted,
            mapOf(
                "team_id" to result.team.id,
                "requires_parent_approval" to result.requiresParentApproval.toString(),
                "requires_additional_signing" to result.requiresAdditionalSigning().toString(),
                "status" to (result.registrationStatus ?: result.registration?.status ?: "unknown"),
            ),
        )
        result
    }

    override suspend fun submitTeamJoinRequest(
        teamId: String,
        answers: Map<String, String>,
    ): Result<TeamJoinRequestResult> = runCatching {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank)
            ?: error("Team id is required.")
        val response = api.post<TeamJoinRequestSubmitDto, TeamJoinRequestResponseDto>(
            path = "api/teams/${normalizedTeamId.encodeURLQueryComponent()}/join-requests",
            body = TeamJoinRequestSubmitDto(answers = answers.normalizeAnswerMap()),
        )
        response.toJoinRequestResult()
    }

    override suspend fun requestChildTeamRegistration(
        teamId: String,
        childId: String,
    ): Result<TeamRegistrationResult> = runCatching {
        val normalizedChildId = childId.trim().takeIf(String::isNotBlank)
            ?: error("Child id is required.")
        val response = api.post<TeamChildRegistrationRequestDto, TeamRegistrationResponseDto>(
            path = "api/teams/$teamId/registrations/child",
            body = TeamChildRegistrationRequestDto(childId = normalizedChildId),
        )
        val result = response.toTeamRegistrationResult()
        ensureUsersCachedForTeam(result.team)
        databaseService.getTeamDao.upsertTeamWithRelations(result.team)
        runCatching { userRepository.getCurrentAccount().getOrThrow() }
        result
    }

    override suspend fun getTeamMemberCompliance(teamId: String): Result<EventTeamComplianceSummary> = runCatching {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank)
            ?: error("Team id is required.")
        val response = api.get<TeamMemberComplianceResponseDto>(
            path = "api/teams/${normalizedTeamId.encodeURLQueryComponent()}/compliance",
        )
        response.team?.toTeamComplianceSummaryOrNull()
            ?: error("Team compliance response missing team.")
    }

    override suspend fun requestTeamRegistrationRefund(teamId: String, reason: String): Result<Unit> = runCatching {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank)
            ?: error("Team id is required.")
        val normalizedReason = reason.trim().takeIf(String::isNotBlank)
            ?: error("Refund reason is required.")
        val response = api.post<TeamRefundRequestDto, TeamRefundResponseDto>(
            path = "api/teams/${normalizedTeamId.encodeURLQueryComponent()}/refund",
            body = TeamRefundRequestDto(reason = normalizedReason),
        )
        response.error?.trim()?.takeIf(String::isNotBlank)?.let(::error)
        if (!response.success) {
            error("Refund request failed.")
        }
        val currentUserId = userRepository.currentUser.value.getOrNull()?.id
            ?: userRepository.currentAccount.value.getOrNull()?.id
        if (!currentUserId.isNullOrBlank()) {
            fetchRemoteTeamsForUser(currentUserId).getOrThrow()
            runCatching { userRepository.refreshCurrentUserProfile().getOrThrow() }
        }
    }

    override suspend fun registerForTeam(teamId: String): Result<Team> =
        requestTeamRegistration(teamId, emptyMap()).mapCatching { result ->
            if (!result.isActive()) {
                error(result.userMessage("Team registration requires additional steps."))
            }
            result.team
        }

    override suspend fun leaveTeam(teamId: String): Result<Team> = singleResponse(
        networkCall = {
            val response = api.delete<TeamRegistrationRequestDto, TeamRegistrationResponseDto>(
                path = "api/teams/$teamId/registrations/self",
                body = TeamRegistrationRequestDto(),
            )
            response.error?.takeIf(String::isNotBlank)?.let { message -> error(message) }
            val team = response.team?.toTeamOrNull() ?: error("Team leave response missing team")
            ensureUsersCachedForTeam(team)
            team
        },
        saveCall = { team ->
            databaseService.getTeamDao.upsertTeamWithRelations(team)
            runCatching { userRepository.getCurrentAccount().getOrThrow() }
        },
        onReturn = { team -> team },
    )

    override suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit> = runCatching {
        val syncedTeam = team.team.withSynchronizedMembership()
        api.deleteNoResponse("api/teams/${syncedTeam.id}")
        databaseService.getTeamDao.deleteTeam(syncedTeam)
        refreshCurrentUserProfileIfTeamMember(syncedTeam)
    }

    override fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>> {
        val localTeamsFlow = databaseService.getTeamDao.getTeamsForUserFlow(id)
            .map { teams -> Result.success(teams.filterNot { it.team.isEventTeamSnapshot() }) }

        scope.launch {
            setTeamsLoading(userId = id, isLoading = true)
            try {
                fetchRemoteTeamsForUser(userId = id)
            } finally {
                setTeamsLoading(userId = id, isLoading = false)
            }
        }

        return localTeamsFlow
    }

    override fun getTeamsWithPlayersLoadingFlow(id: String): Flow<Boolean> {
        if (id.isBlank()) return flowOf(false)
        return userTeamsLoadingState
            .map { it[id] == true }
            .distinctUntilChanged()
    }

    private suspend fun fetchRemoteTeamsForUser(userId: String): Result<List<Team>> {
        return runCatching {
            val remoteTeams = fetchRemoteTeamsByMembership(userId)
            val localCanonicalTeams = databaseService.getTeamDao.getTeamsForUser(userId)
                .filterNot(Team::isEventTeamSnapshot)
            val remoteIds = remoteTeams.map(Team::id).toSet()
            val staleCanonicalIds = localCanonicalTeams
                .map(Team::id)
                .filter { teamId -> teamId !in remoteIds }
            if (staleCanonicalIds.isNotEmpty()) {
                databaseService.getTeamDao.deleteTeamsByIds(staleCanonicalIds)
            }
            if (remoteTeams.isNotEmpty()) {
                databaseService.getTeamDao.upsertTeamsWithRelations(remoteTeams)
            }
            remoteTeams
        }
    }

    private fun setTeamsLoading(userId: String, isLoading: Boolean) {
        if (userId.isBlank()) return
        val current = userTeamsLoadingState.value.toMutableMap()
        if (isLoading) {
            current[userId] = true
        } else {
            current.remove(userId)
        }
        userTeamsLoadingState.value = current
    }

    override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> =
        singleResponse(
            networkCall = { fetchRemoteTeam(teamId) },
            saveCall = { team -> databaseService.getTeamDao.upsertTeamWithRelations(team) },
            onReturn = { _ -> databaseService.getTeamDao.getTeamWithPlayers(teamId) },
        )

    override fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>> {
        val localFlow = databaseService.getTeamDao.getTeamWithPlayersFlow(id).map { team ->
            team?.let { Result.success(it) }
                ?: Result.failure(
                    NoSuchElementException("Team $id is not available in local cache yet.")
                )
        }
        scope.launch { getTeamWithPlayers(id) }
        return localFlow
    }

    override suspend fun listTeamInvites(userId: String): Result<List<Invite>> = runCatching {
        userRepository.listInvites(userId = userId, type = "TEAM").getOrThrow()
            .filter { it.teamId != null }
    }

    override suspend fun getInviteFreeAgentContext(teamId: String): Result<TeamInviteFreeAgentContext> = runCatching {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank)
            ?: return@runCatching TeamInviteFreeAgentContext()
        val encodedTeamId = normalizedTeamId.encodeURLQueryComponent()
        val response = api.get<TeamInviteFreeAgentsResponseDto>(
            path = "api/teams/$encodedTeamId/invite-free-agents",
        )
        val users = response.users.mapNotNull { it.toUserDataOrNull() }
        if (users.isNotEmpty()) {
            databaseService.getUserDataDao.upsertUsersData(users)
        }
        response.toDomain(users)
    }

    override suspend fun getInviteFreeAgents(teamId: String): Result<List<UserData>> =
        getInviteFreeAgentContext(teamId).map { context -> context.users }

    override suspend fun createTeamMemberInvite(
        teamId: String,
        userId: String?,
        email: String?,
        roleInviteType: String,
        firstName: String?,
        lastName: String?,
        phone: String?,
        shareOnly: Boolean,
    ): Result<TeamMemberInviteResult> = runCatching {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank)
            ?: error("Team id is required.")
        val normalizedUserId = userId?.trim()?.takeIf(String::isNotBlank)
        val normalizedEmail = email?.trim()?.lowercase()?.takeIf(String::isNotBlank)
        val normalizedFirstName = firstName?.trim()?.takeIf(String::isNotBlank)
        val normalizedLastName = lastName?.trim()?.takeIf(String::isNotBlank)
        val normalizedPhone = phone?.trim()?.takeIf(String::isNotBlank)
        if (normalizedUserId == null && normalizedEmail == null && normalizedPhone == null && !shareOnly) {
            error("A user, email, phone, or share-only invite is required.")
        }
        val encodedTeamId = normalizedTeamId.encodeURLQueryComponent()
        val response = api.post<TeamMemberInviteRequestDto, TeamMemberInviteResponseDto>(
            path = "api/teams/$encodedTeamId/member-invites",
            body = TeamMemberInviteRequestDto(
                userId = normalizedUserId,
                email = normalizedEmail,
                role = roleInviteType.trim().ifBlank { "player" },
                firstName = normalizedFirstName,
                lastName = normalizedLastName,
                phone = normalizedPhone,
                shareOnly = shareOnly,
            ),
        )
        response.team?.toTeamOrNull()?.let { updatedTeam ->
            ensureUsersCachedForTeam(updatedTeam)
            databaseService.getTeamDao.upsertTeamWithRelations(updatedTeam)
        }
        TeamMemberInviteResult(
            invite = response.invite,
            shareUrl = response.shareUrl?.trim()?.takeIf(String::isNotBlank),
        )
    }

    override suspend fun createTeamInvite(
        teamId: String,
        userId: String,
        createdBy: String,
        inviteType: String,
    ): Result<Unit> = runCatching {
        api.post<CreateInvitesRequestDto, InvitesResponseDto>(
            path = "api/invites",
            body = CreateInvitesRequestDto(
                invites = listOf(
                    InviteCreateDto(
                        type = inviteType,
                        status = "pending",
                        teamId = teamId,
                        userId = userId,
                        createdBy = createdBy,
                    )
                )
            ),
        )
    }.map { Unit }

    override suspend fun deleteInvite(inviteId: String): Result<Unit> = runCatching {
        api.deleteNoResponse("api/invites/$inviteId")
    }

    override suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit> = runCatching {
        // Accepting an invite mutates team membership; this must be done server-side (non-captains cannot PATCH teams).
        userRepository.acceptInvite(inviteId).getOrThrow()

        // Refresh local caches so UI updates (team membership + relations).
        getTeamWithPlayers(teamId).getOrThrow()

        // Keep current user profile in sync (teamIds is used across the app). This is a refresh, not a mutation.
        runCatching { userRepository.getCurrentAccount().getOrThrow() }
    }

    private suspend fun refreshCurrentUserProfileIfAffected(vararg userIds: String?) {
        val currentUserId = userRepository.currentUser.value.getOrNull()?.id
            ?: userRepository.currentAccount.value.getOrNull()?.id
            ?: return
        if (userIds.any { candidateId -> candidateId == currentUserId }) {
            runCatching { userRepository.refreshCurrentUserProfile().getOrThrow() }
        }
    }

    private suspend fun refreshCurrentUserProfileIfTeamMember(team: Team) {
        val currentUserId = userRepository.currentUser.value.getOrNull()?.id
            ?: userRepository.currentAccount.value.getOrNull()?.id
            ?: return
        val syncedTeam = team.withSynchronizedMembership()
        val isCurrentUserMember = currentUserId in syncedTeam.playerIds ||
            syncedTeam.managerId == currentUserId ||
            syncedTeam.headCoachId == currentUserId ||
            currentUserId in syncedTeam.coachIds
        if (isCurrentUserMember) {
            runCatching { userRepository.refreshCurrentUserProfile().getOrThrow() }
        }
    }

    private suspend fun fetchRemoteTeamsByIds(ids: List<String>): List<Team> {
        val idChunks = collectionIdChunks(ids)
        val requestedIds = idChunks.flatten()
        if (requestedIds.isEmpty()) return emptyList()

        val teamsById = LinkedHashMap<String, Team>()
        for (idChunk in idChunks) {
            val encodedIds = idChunk.joinToString(",").encodeURLQueryComponent()
            val res = api.get<TeamsResponseDto>("api/teams?ids=$encodedIds&limit=${idChunk.size}")
            res.teams.mapNotNull { it.toTeamOrNull() }.forEach { team ->
                teamsById[team.id] = team
            }
        }
        val teams = requestedIds.mapNotNull(teamsById::get)
        ensureUsersCachedForTeams(teams)
        return teams
    }

    private suspend fun fetchRemoteTeamsByMembership(userId: String): List<Team> {
        val encoded = userId.encodeURLQueryComponent()
        val res = api.get<TeamsResponseDto>("api/teams?playerId=$encoded&managerId=$encoded&limit=200")
        val teams = res.teams.mapNotNull { it.toTeamOrNull() }
        ensureUsersCachedForTeams(teams)
        return teams
    }

    private suspend fun fetchRemoteTeamsByOrganization(
        organizationId: String,
        limit: Int,
    ): List<Team> {
        val encodedOrganizationId = organizationId.encodeURLQueryComponent()
        val safeLimit = limit.coerceAtLeast(1)
        val res = api.get<TeamsResponseDto>("api/teams?organizationId=$encodedOrganizationId&limit=$safeLimit")
        val teams = res.teams.mapNotNull { it.toTeamOrNull() }
        ensureUsersCachedForTeams(teams)
        return teams
    }

    private suspend fun fetchRemoteTeamsPageByOrganization(
        organizationId: String,
        limit: Int,
        offset: Int,
    ): RemoteOrganizationTeamPage {
        val encodedOrganizationId = organizationId.encodeURLQueryComponent()
        val safeLimit = limit.coerceIn(1, 200)
        val safeOffset = offset.coerceAtLeast(0)
        val response = api.get<TeamsResponseDto>(
            "api/teams?organizationId=$encodedOrganizationId&limit=$safeLimit&offset=$safeOffset",
        )
        val teams = response.teams.mapNotNull { it.toTeamOrNull() }
        ensureUsersCachedForTeams(teams)
        val fallbackNextOffset = safeOffset + teams.size
        val nextOffset = response.pagination?.nextOffset?.takeIf { candidate -> candidate > safeOffset }
        return RemoteOrganizationTeamPage(
            teams = teams,
            nextOffset = nextOffset ?: fallbackNextOffset,
            hasMore = response.pagination?.hasMore == true && nextOffset != null,
        )
    }

    private data class RemoteOrganizationTeamPage(
        val teams: List<Team>,
        val nextOffset: Int,
        val hasMore: Boolean,
    )

    private suspend fun fetchRemoteTeamsForSearch(limit: Int): List<Team> {
        val safeLimit = limit.coerceIn(1, 200)
        val res = api.get<TeamsResponseDto>("api/teams?limit=$safeLimit")
        val teams = res.teams.mapNotNull { it.toTeamOrNull() }
        ensureUsersCachedForTeams(teams)
        return teams
    }

    private fun Team.inviteSearchText(): String {
        return listOf(
            name,
            sport.orEmpty(),
            division,
            skillDivisionTypeName.orEmpty(),
            ageDivisionTypeName.orEmpty(),
        ).joinToString(" ").lowercase()
    }

    private fun String?.toInviteSportKey(): String {
        return this
            ?.trim()
            ?.lowercase()
            ?.filter { it.isLetterOrDigit() }
            .orEmpty()
    }

    private suspend fun fetchRemoteTeam(teamId: String): Team {
        val dto = api.get<TeamApiDto>("api/teams/$teamId")
        val team = dto.toTeamOrNull() ?: error("Team response missing team")
        ensureUsersCachedForTeam(team)
        return team
    }

    private suspend fun ensureUsersCachedForTeams(teams: List<Team>) {
        teams.forEach { team ->
            ensureUsersCachedForTeam(team)
        }
    }

    private suspend fun ensureUsersCachedForTeam(team: Team) {
        val syncedTeam = team.withSynchronizedMembership()
        val userIds = buildList {
            syncedTeam.playerRegistrations.forEach { registration ->
                registration.userId.trim().takeIf(String::isNotBlank)?.let(::add)
            }
            syncedTeam.staffAssignments.forEach { assignment ->
                assignment.userId.trim().takeIf(String::isNotBlank)?.let(::add)
            }
        }.distinct().filter(String::isNotBlank)

        if (userIds.isNotEmpty()) {
            userRepository.getUsers(
                userIds = userIds,
                visibilityContext = UserVisibilityContext(teamId = syncedTeam.id),
            ).getOrThrow()
        }
    }

    private suspend fun patchTeamUpdate(
        teamId: String,
        prepared: PreparedTeamUpdate,
    ): Team {
        val encodedRequest = jsonMVP.encodeToJsonElement(prepared.request).jsonObject
        val encodedTeam = (encodedRequest["team"] as? JsonObject).orEmpty()
        val teamPatch = JsonObject(
            encodedTeam + prepared.includedFields
                .filterNot(encodedTeam::containsKey)
                .associateWith { JsonNull },
        )
        val requestBody = JsonObject(mapOf("team" to teamPatch))
        return api.patch<JsonObject, TeamApiDto>(
            path = "api/teams/$teamId",
            body = requestBody,
        ).toTeamOrNull() ?: error("Update team response missing team")
    }

    private fun prepareTeamUpdate(
        newTeam: Team,
        cachedTeam: Team?,
    ): PreparedTeamUpdate? {
        val syncedNewTeam = newTeam.withSynchronizedMembership()
        val syncedCachedTeam = cachedTeam?.withSynchronizedMembership()
        val changedFields = syncedCachedTeam
            ?.let { existingTeam -> diffTeamUpdateFields(existingTeam = existingTeam, updatedTeam = syncedNewTeam) }
            ?: TEAM_UPDATE_FIELDS
        if (changedFields.isEmpty()) {
            return null
        }

        val includedFields = changedFields
        return PreparedTeamUpdate(
            request = UpdateTeamRequestDto(
                team = syncedNewTeam.toUpdateDto(
                    includeFields = syncedCachedTeam?.let { includedFields },
                ),
            ),
            includedFields = includedFields,
        )
    }

    private fun diffTeamUpdateFields(
        existingTeam: Team,
        updatedTeam: Team,
    ): Set<String> = buildSet {
        if (existingTeam.name != updatedTeam.name) add("name")
        if (existingTeam.division != updatedTeam.division) add("division")
        if (existingTeam.playerIds != updatedTeam.playerIds) add("playerIds")
        if (existingTeam.captainId != updatedTeam.captainId) add("captainId")
        if (existingTeam.managerId != updatedTeam.managerId) add("managerId")
        if (existingTeam.headCoachId != updatedTeam.headCoachId) add("headCoachId")
        if (existingTeam.assistantCoachIds != updatedTeam.assistantCoachIds) {
            add("assistantCoachIds")
            add("coachIds")
        }
        if (existingTeam.parentTeamId != updatedTeam.parentTeamId) add("parentTeamId")
        if (existingTeam.pending != updatedTeam.pending) add("pending")
        if (existingTeam.teamSize != updatedTeam.teamSize) add("teamSize")
        if (existingTeam.profileImageId != updatedTeam.profileImageId) add("profileImageId")
        if (existingTeam.sport != updatedTeam.sport) add("sport")
        if (existingTeam.divisionTypeId != updatedTeam.divisionTypeId) add("divisionTypeId")
        if (existingTeam.joinPolicy != updatedTeam.joinPolicy) add("joinPolicy")
        if (existingTeam.openRegistration != updatedTeam.openRegistration) add("openRegistration")
        if (existingTeam.registrationPriceCents != updatedTeam.registrationPriceCents) add("registrationPriceCents")
        if (existingTeam.requiredTemplateIds != updatedTeam.requiredTemplateIds) add("requiredTemplateIds")
        if (!playerRegistrationsEquivalent(existingTeam, updatedTeam)) add("playerRegistrations")
    }

    private fun playerRegistrationsEquivalent(
        existingTeam: Team,
        updatedTeam: Team,
    ): Boolean {
        return existingTeam.toUpdateDto(includeFields = setOf("playerRegistrations")).playerRegistrations ==
            updatedTeam.toUpdateDto(includeFields = setOf("playerRegistrations")).playerRegistrations
    }

    private data class PreparedTeamUpdate(
        val request: UpdateTeamRequestDto,
        val includedFields: Set<String>,
    )

}
