package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.RegistrationProgressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.hasAnyPaidDivision
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.ChildRegistrationResult
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.DiscountPreview
import com.razumly.mvp.core.data.repositories.SelfRegistrationResult
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
import com.razumly.mvp.core.data.repositories.TeamRegistrationResult
import com.razumly.mvp.core.data.repositories.isActive
import com.razumly.mvp.core.data.repositories.requiresAdditionalSigning
import com.razumly.mvp.core.data.repositories.requiresChildEmail
import com.razumly.mvp.core.data.repositories.userMessage
import kotlinx.coroutines.Job
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.coroutines.resume
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

internal data class EventRegistrationProgressScope(
    val userId: String,
    val eventId: String,
    val occurrence: EventOccurrenceSelection?,
)

internal data class EventRegistrationQuestionSubmitResult(
    val missingQuestion: TeamJoinQuestion?,
    val continuation: (() -> Unit)?,
)

internal data class TeamJoinQuestionSubmitResult(
    val missingQuestion: TeamJoinQuestion?,
    val dialog: TeamJoinQuestionDialogState?,
    val team: TeamWithPlayers?,
)

internal data class TeamJoinPolicyDecision(
    val kind: TeamJoinPolicyKind,
    val errorMessage: String? = null,
) {
    val isAccepted: Boolean
        get() = kind != TeamJoinPolicyKind.CLOSED
}

internal data class TeamRegistrationResultDecision(
    val action: TeamRegistrationResultAction,
    val message: String? = null,
)

internal data class TeamRegistrationContinuationDecision(
    val action: TeamRegistrationContinuationAction,
    val teamId: String,
    val message: String? = null,
)

internal data class SelfJoinBeforePaymentPlanDecision(
    val joinedByThisFlow: Boolean,
    val shouldContinueToPaymentPlan: Boolean,
    val shouldReloadEvent: Boolean = false,
    val message: String? = null,
    val failure: Throwable? = null,
)

internal data class TeamJoinBeforePaymentPlanDecision(
    val joinedByThisFlow: Boolean,
    val shouldContinueToPaymentPlan: Boolean,
    val failure: Throwable? = null,
)

internal data class SignatureFlowTarget(
    val signerContext: SignerContext,
    val child: JoinChildOption?,
    val teamId: String?,
)

internal data class PendingSignatureStepState(
    val step: SignStep,
    val currentStep: Int,
    val totalSteps: Int,
)

data class DiscountCodePromptState(
    val title: String = "Discount code",
    val description: String = "Enter a discount code for this checkout, or continue without one.",
    val initialCode: String = "",
    val originalAmountCents: Int? = null,
    val preview: DiscountPreview? = null,
    val error: String? = null,
    val loading: Boolean = false,
)

internal enum class WithdrawalActionKind {
    REQUEST_REFUND,
    WITHDRAW_AND_REFUND,
    LEAVE,
}

internal enum class JoinExecutionAction {
    REQUEST_PARENT_APPROVAL,
    REQUIRE_PRICE,
    START_PAYMENT_PLAN,
    START_MANUAL_PAYMENT,
    JOIN_DIRECTLY,
    CREATE_PURCHASE_INTENT,
}

internal enum class PaymentPlanBillStatus {
    CREATED,
    ALREADY_EXISTS,
}

internal enum class TeamJoinPolicyKind {
    OPEN_REGISTRATION,
    REQUEST_TO_JOIN,
    CLOSED,
}

internal enum class TeamRegistrationResultAction {
    WAIT_FOR_PARENT_APPROVAL,
    REQUIRE_CHILD_EMAIL,
    REQUIRE_ADDITIONAL_SIGNING,
    CONTINUE,
}

internal enum class TeamRegistrationContinuationAction {
    MISSING_TEAM_ID,
    START_CHECKOUT,
    REJECT_INACTIVE,
    COMPLETE_ACTIVE,
}

internal data class WithdrawalActionDecision(
    val targetUserId: String,
    val membership: WithdrawTargetMembership?,
    val useTeamWithdrawal: Boolean = false,
    val errorMessage: String? = null,
)

@OptIn(ExperimentalTime::class)
internal class EventRegistrationFlowCoordinator {
    private val _questionDialog = MutableStateFlow<EventRegistrationQuestionDialogState?>(null)
    val questionDialog = _questionDialog.asStateFlow()

    private val _questions = MutableStateFlow<List<TeamJoinQuestion>>(emptyList())
    val questions = _questions.asStateFlow()

    private val _answers = MutableStateFlow<Map<String, String>>(emptyMap())
    val answers = _answers.asStateFlow()

    private val _questionsExpanded = MutableStateFlow(false)
    val questionsExpanded = _questionsExpanded.asStateFlow()

    private val _holdExpiresAt = MutableStateFlow<String?>(null)
    val holdExpiresAt = _holdExpiresAt.asStateFlow()

    private val _startingTeamRegistrationId = MutableStateFlow<String?>(null)
    val startingTeamRegistrationId = _startingTeamRegistrationId.asStateFlow()

    private val _paymentPlanPreviewDialog = MutableStateFlow<PaymentPlanPreviewDialogState?>(null)
    val paymentPlanPreviewDialog = _paymentPlanPreviewDialog.asStateFlow()

    private val _withdrawTargets = MutableStateFlow<List<WithdrawTargetOption>>(emptyList())
    val withdrawTargets = _withdrawTargets.asStateFlow()

    private val _billingAddressPrompt = MutableStateFlow<BillingAddressDraft?>(null)
    val billingAddressPrompt = _billingAddressPrompt.asStateFlow()

    private val _discountCodePrompt = MutableStateFlow<DiscountCodePromptState?>(null)
    val discountCodePrompt = _discountCodePrompt.asStateFlow()

    private val _joinChoiceDialog = MutableStateFlow<JoinChoiceDialogState?>(null)
    val joinChoiceDialog = _joinChoiceDialog.asStateFlow()

    private val _childJoinSelectionDialog = MutableStateFlow<ChildJoinSelectionDialogState?>(null)
    val childJoinSelectionDialog = _childJoinSelectionDialog.asStateFlow()

    private val _teamJoinQuestionDialog = MutableStateFlow<TeamJoinQuestionDialogState?>(null)
    val teamJoinQuestionDialog = _teamJoinQuestionDialog.asStateFlow()

    private val _textSignaturePrompt = MutableStateFlow<TextSignaturePromptState?>(null)
    val textSignaturePrompt = _textSignaturePrompt.asStateFlow()

    private val _webSignaturePrompt = MutableStateFlow<WebSignaturePromptState?>(null)
    val webSignaturePrompt = _webSignaturePrompt.asStateFlow()

    private var pendingQuestionContinuation: (() -> Unit)? = null
    private var questionsConfirmed = false
    private var pendingPaymentPlanPreviewAction: (() -> Unit)? = null
    private var pendingBillingAddressAction: (() -> Unit)? = null
    private var pendingDiscountCodeAction: ((String?) -> Unit)? = null
    private var pendingDiscountCodePreviewAction: ((String) -> Unit)? = null
    private var pendingJoinableChildren: List<JoinChildOption> = emptyList()
    private var pendingTeamJoinQuestionTeam: TeamWithPlayers? = null
    private var pendingJoinConfirmationTarget: JoinConfirmationTarget? = null
    private var pendingTeamRegistration: TeamWithPlayers? = null
    private var pendingPaymentSheetIntent: PurchaseIntent? = null
    private var pendingSignatureSteps: List<SignStep> = emptyList()
    private var pendingSignatureStepIndex = 0
    private var pendingPostSignatureAction: (suspend () -> Unit)? = null
    private var pendingSignatureContext: SignerContext = SignerContext.PARTICIPANT
    private var pendingSignatureContexts: List<SignerContext> = emptyList()
    private var pendingSignatureContextIndex = 0
    private var pendingSignatureChild: JoinChildOption? = null
    private var pendingSignatureTeamId: String? = null
    private var pendingSignaturePollJob: Job? = null

    fun updateQuestionAnswer(questionId: String, answer: String): Boolean {
        val answerUpdate = registrationQuestionAnswerUpdate(questionId, answer) ?: return false
        _answers.value = _answers.value + answerUpdate
        return true
    }

    fun toggleQuestionsExpanded() {
        _questionsExpanded.value = !_questionsExpanded.value
    }

    fun dismissQuestionDialog() {
        _questionDialog.value = null
        pendingQuestionContinuation = null
    }

    fun showDiscountCodePrompt(
        title: String = "Discount code",
        description: String = "Enter a discount code for this checkout, or continue without one.",
        initialCode: String = "",
        originalAmountCents: Int? = null,
        onPreview: ((String) -> Unit)? = null,
        onContinue: (String?) -> Unit,
    ) {
        pendingDiscountCodeAction = onContinue
        pendingDiscountCodePreviewAction = onPreview
        _discountCodePrompt.value = DiscountCodePromptState(
            title = title,
            description = description,
            initialCode = initialCode,
            originalAmountCents = originalAmountCents,
        )
    }

    suspend fun requestDiscountCode(
        title: String = "Discount code",
        description: String = "Enter a discount code for this checkout, or continue without one.",
        originalAmountCents: Int? = null,
        onPreview: ((String) -> Unit)? = null,
    ): String? = suspendCancellableCoroutine { continuation ->
        showDiscountCodePrompt(
            title = title,
            description = description,
            originalAmountCents = originalAmountCents,
            onPreview = onPreview,
        ) { code ->
            if (continuation.isActive) {
                continuation.resume(code?.trim()?.takeIf(String::isNotBlank))
            }
        }
        continuation.invokeOnCancellation {
            pendingDiscountCodeAction = null
            pendingDiscountCodePreviewAction = null
            _discountCodePrompt.value = null
        }
    }

    fun applyDiscountCodePrompt(code: String) {
        val normalizedCode = code.trim()
        if (normalizedCode.isBlank()) {
            _discountCodePrompt.value = _discountCodePrompt.value?.copy(
                preview = null,
                error = "Enter a discount code to apply.",
                loading = false,
            )
            return
        }
        _discountCodePrompt.value = _discountCodePrompt.value?.copy(
            preview = null,
            error = null,
            loading = true,
        )
        pendingDiscountCodePreviewAction?.invoke(normalizedCode)
    }

    fun clearDiscountCodePromptFeedback() {
        _discountCodePrompt.value = _discountCodePrompt.value?.copy(
            preview = null,
            error = null,
            loading = false,
        )
    }

    fun updateDiscountCodePreview(result: Result<DiscountPreview>) {
        _discountCodePrompt.value = _discountCodePrompt.value?.let { state ->
            result.fold(
                onSuccess = { preview ->
                    state.copy(
                        initialCode = preview.code ?: state.initialCode,
                        preview = preview,
                        error = null,
                        loading = false,
                    )
                },
                onFailure = { error ->
                    state.copy(
                        preview = null,
                        error = error.message ?: "Unable to apply discount code.",
                        loading = false,
                    )
                },
            )
        }
    }

    fun continueFromDiscountCodePrompt(code: String?) {
        val action = pendingDiscountCodeAction
        pendingDiscountCodeAction = null
        pendingDiscountCodePreviewAction = null
        _discountCodePrompt.value = null
        action?.invoke(code?.trim()?.takeIf(String::isNotBlank))
    }

    fun dismissDiscountCodePrompt() {
        continueFromDiscountCodePrompt(null)
    }

    fun submitQuestionDialogAnswers(answers: Map<String, String>): EventRegistrationQuestionSubmitResult? {
        val dialog = _questionDialog.value ?: return null
        val normalizedAnswers = registrationQuestionDialogAnswers(dialog.questions, answers)
        val missingQuestion = firstMissingRequiredRegistrationQuestion(dialog.questions, normalizedAnswers)
        if (missingQuestion != null) {
            return EventRegistrationQuestionSubmitResult(
                missingQuestion = missingQuestion,
                continuation = null,
            )
        }

        _answers.value = _answers.value + normalizedAnswers
        questionsConfirmed = true
        _questionDialog.value = null
        val continuation = pendingQuestionContinuation
        pendingQuestionContinuation = null
        return EventRegistrationQuestionSubmitResult(
            missingQuestion = null,
            continuation = continuation,
        )
    }

    fun clearForMissingRegistrationScope() {
        _questions.value = emptyList()
        _answers.value = emptyMap()
        _holdExpiresAt.value = null
        questionsConfirmed = false
    }

    fun replaceRegistrationQuestions(questions: List<TeamJoinQuestion>) {
        val previousQuestionIds = _questions.value.map { question -> question.id }
        val nextQuestionIds = questions.map { question -> question.id }
        if (previousQuestionIds != nextQuestionIds) {
            questionsConfirmed = false
        }
        _questions.value = questions
        val currentAnswers = _answers.value
        _answers.value = currentAnswers.filterKeys { questionId ->
            questions.any { question -> question.id == questionId }
        } + questions.associate { question ->
            question.id to currentAnswers[question.id].orEmpty()
        }
    }

    fun clearRegistrationQuestionsAfterLoadFailure() {
        _questions.value = emptyList()
        _answers.value = emptyMap()
        questionsConfirmed = false
    }

    fun clearAfterRegistrationHoldExpired() {
        pendingQuestionContinuation = null
        _questionDialog.value = null
        _holdExpiresAt.value = null
        questionsConfirmed = false
    }

    fun missingRegistrationQuestion(): TeamJoinQuestion? =
        firstMissingRequiredRegistrationQuestion(
            questions = _questions.value,
            answers = _answers.value,
        )

    fun ensureQuestionsAnswered(eventName: String, onReady: () -> Unit): Boolean {
        val questions = _questions.value
        if (questions.isEmpty()) return true
        val missingQuestion = missingRegistrationQuestion()
        if (missingQuestion == null && questionsConfirmed) {
            return true
        }

        _questionsExpanded.value = true
        _questionDialog.value = EventRegistrationQuestionDialogState(
            eventName = eventName.ifBlank { "this event" },
            questions = questions,
            answers = _answers.value,
        )
        pendingQuestionContinuation = onReady
        return false
    }

    fun answersForRequest(): Map<String, String> =
        registrationAnswersForRequest(
            questions = _questions.value,
            answers = _answers.value,
        )

    suspend fun addCurrentUserToEventWithRegistrationAnswers(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
        addWithoutAnswers: suspend (
            event: Event,
            preferredDivisionId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<SelfRegistrationResult>,
        addWithAnswers: suspend (
            event: Event,
            preferredDivisionId: String?,
            occurrence: EventOccurrenceSelection?,
            answers: Map<String, String>,
        ) -> Result<SelfRegistrationResult>,
    ): Result<SelfRegistrationResult> {
        val answers = answersForRequest()
        return if (answers.isEmpty()) {
            addWithoutAnswers(event, preferredDivisionId, occurrence)
        } else {
            addWithAnswers(event, preferredDivisionId, occurrence, answers)
        }
    }

    suspend fun addTeamToEventWithRegistrationAnswers(
        event: Event,
        team: Team,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
        addWithoutAnswers: suspend (
            event: Event,
            team: Team,
            preferredDivisionId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
        addWithAnswers: suspend (
            event: Event,
            team: Team,
            preferredDivisionId: String?,
            occurrence: EventOccurrenceSelection?,
            answers: Map<String, String>,
        ) -> Result<Unit>,
    ): Result<Unit> {
        val answers = answersForRequest()
        return if (answers.isEmpty()) {
            addWithoutAnswers(event, team, preferredDivisionId, occurrence)
        } else {
            addWithAnswers(event, team, preferredDivisionId, occurrence, answers)
        }
    }

    suspend fun createPurchaseIntentWithRegistrationAnswers(
        event: Event,
        teamId: String?,
        priceCents: Int,
        occurrence: EventOccurrenceSelection?,
        divisionId: String?,
        createWithoutAnswers: suspend (
            event: Event,
            teamId: String?,
            priceCents: Int,
            occurrence: EventOccurrenceSelection?,
            divisionId: String?,
        ) -> Result<PurchaseIntent>,
        createWithAnswers: suspend (
            event: Event,
            teamId: String?,
            priceCents: Int,
            occurrence: EventOccurrenceSelection?,
            divisionId: String?,
            answers: Map<String, String>,
        ) -> Result<PurchaseIntent>,
    ): Result<PurchaseIntent> {
        val answers = answersForRequest()
        return if (answers.isEmpty()) {
            createWithoutAnswers(event, teamId, priceCents, occurrence, divisionId)
        } else {
            createWithAnswers(event, teamId, priceCents, occurrence, divisionId, answers)
        }
    }

    fun setRegistrationHoldExpiresAt(holdExpiresAt: String?) {
        _holdExpiresAt.value = holdExpiresAt?.trim()?.takeIf(String::isNotBlank)
    }

    fun showPaymentPlanPreviewDialog(
        dialogState: PaymentPlanPreviewDialogState,
        onContinue: () -> Unit,
    ) {
        _paymentPlanPreviewDialog.value = dialogState
        pendingPaymentPlanPreviewAction = onContinue
    }

    fun dismissPaymentPlanPreviewDialog() {
        _paymentPlanPreviewDialog.value = null
        pendingPaymentPlanPreviewAction = null
    }

    fun confirmPaymentPlanPreviewDialog(): (() -> Unit)? {
        val continuation = pendingPaymentPlanPreviewAction
        dismissPaymentPlanPreviewDialog()
        return continuation
    }

    fun replaceWithdrawTargets(targets: List<WithdrawTargetOption>) {
        _withdrawTargets.value = targets
    }

    fun clearWithdrawTargets() {
        _withdrawTargets.value = emptyList()
    }

    fun buildWithdrawTargets(
        currentUserId: String,
        currentUserFullName: String,
        children: List<JoinChildOption>,
        resolveMembership: (String) -> WithdrawTargetMembership?,
    ): List<WithdrawTargetOption> {
        val normalizedCurrentUserId = currentUserId.trim()
        val targets = LinkedHashMap<String, WithdrawTargetOption>()

        if (normalizedCurrentUserId.isNotBlank()) {
            resolveMembership(normalizedCurrentUserId)?.let { membership ->
                targets[normalizedCurrentUserId] = WithdrawTargetOption(
                    userId = normalizedCurrentUserId,
                    fullName = currentUserFullName.trim().ifBlank { "My Registration" },
                    membership = membership,
                    isSelf = true,
                )
            }
        }

        children.forEach { child ->
            val childId = child.userId.trim().takeIf(String::isNotBlank) ?: return@forEach
            val membership = resolveMembership(childId) ?: return@forEach
            targets[childId] = WithdrawTargetOption(
                userId = childId,
                fullName = child.fullName.trim().ifBlank { "Child" },
                membership = membership,
                isSelf = false,
            )
        }

        return targets.values.toList()
    }

    fun normalizedWithdrawalTargetUserId(
        targetUserId: String?,
        currentUserId: String,
    ): String =
        targetUserId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: currentUserId

    fun prepareWithdrawalAction(
        event: Event,
        action: WithdrawalActionKind,
        targetUserId: String,
        currentUserId: String,
        membership: WithdrawTargetMembership?,
        weeklyOccurrence: EventOccurrenceSelection?,
        currentUserIsFreeAgent: Boolean,
        eventOrOccurrenceStarted: Boolean,
    ): WithdrawalActionDecision {
        val normalizedTargetUserId = normalizedWithdrawalTargetUserId(targetUserId, currentUserId)
        if (membership == null) {
            return WithdrawalActionDecision(
                targetUserId = normalizedTargetUserId,
                membership = null,
                errorMessage = "Selected profile is not registered for this event.",
            )
        }

        val canRequestRefund = canRequestPaidRefund(event, membership)
        if (action == WithdrawalActionKind.REQUEST_REFUND || action == WithdrawalActionKind.WITHDRAW_AND_REFUND) {
            if (!canRequestRefund) {
                return WithdrawalActionDecision(
                    targetUserId = normalizedTargetUserId,
                    membership = membership,
                    errorMessage = if (!event.hasAnyPaidDivision()) {
                        "Refund requests are only available for paid events."
                    } else {
                        "Only registered participants can request refunds."
                    },
                )
            }
        }

        if (action == WithdrawalActionKind.WITHDRAW_AND_REFUND && eventOrOccurrenceStarted) {
            return WithdrawalActionDecision(
                targetUserId = normalizedTargetUserId,
                membership = membership,
                errorMessage = "Automatic refunds are no longer available after the event starts.",
            )
        }

        if (action == WithdrawalActionKind.LEAVE && eventOrOccurrenceStarted) {
            return WithdrawalActionDecision(
                targetUserId = normalizedTargetUserId,
                membership = membership,
                errorMessage = if (canRequestRefund) {
                    "This event has already started. Leaving is disabled. Request a refund instead."
                } else {
                    "This event has already started. Leaving is no longer available."
                },
            )
        }

        val useTeamWithdrawal = usesRegisteredTeamWithdrawal(
            event = event,
            targetUserId = normalizedTargetUserId,
            currentUserId = currentUserId,
            membership = membership,
            currentUserIsFreeAgent = currentUserIsFreeAgent,
        )

        if (
            (action == WithdrawalActionKind.REQUEST_REFUND || action == WithdrawalActionKind.WITHDRAW_AND_REFUND) &&
            weeklyOccurrence != null &&
            !useTeamWithdrawal
        ) {
            return WithdrawalActionDecision(
                targetUserId = normalizedTargetUserId,
                membership = membership,
                errorMessage = "Refunds for individual weekly registrations are not available here yet. Contact the host for help.",
            )
        }

        return WithdrawalActionDecision(
            targetUserId = normalizedTargetUserId,
            membership = membership,
            useTeamWithdrawal = useTeamWithdrawal,
        )
    }

    fun showBillingAddressPrompt(
        billingAddress: BillingAddressDraft?,
        onReady: () -> Unit,
    ) {
        pendingBillingAddressAction = onReady
        _billingAddressPrompt.value = billingAddress ?: BillingAddressDraft()
    }

    fun dismissBillingAddressPrompt() {
        _billingAddressPrompt.value = null
        pendingBillingAddressAction = null
    }

    fun completeBillingAddressPrompt(): (() -> Unit)? {
        val action = pendingBillingAddressAction
        _billingAddressPrompt.value = null
        pendingBillingAddressAction = null
        return action
    }

    fun showJoinChoiceDialog(children: List<JoinChildOption>) {
        pendingJoinableChildren = children
        _joinChoiceDialog.value = JoinChoiceDialogState(children = children)
        _childJoinSelectionDialog.value = null
    }

    fun dismissJoinChoiceDialog() {
        _joinChoiceDialog.value = null
    }

    fun showChildJoinSelectionDialog(children: List<JoinChildOption>) {
        pendingJoinableChildren = children
        _joinChoiceDialog.value = null
        _childJoinSelectionDialog.value = ChildJoinSelectionDialogState(children = children)
    }

    fun dismissChildJoinSelectionDialog() {
        _childJoinSelectionDialog.value = null
    }

    fun clearJoinDialogs() {
        _joinChoiceDialog.value = null
        _childJoinSelectionDialog.value = null
    }

    fun currentJoinableChildren(): List<JoinChildOption> =
        pendingJoinableChildren.ifEmpty {
            _joinChoiceDialog.value?.children.orEmpty()
        }

    fun findJoinableChild(userId: String): JoinChildOption? {
        val normalizedUserId = userId.trim().takeIf(String::isNotBlank) ?: return null
        return currentJoinableChildren().firstOrNull { child -> child.userId == normalizedUserId }
    }

    fun childRegistrationResultMessage(
        child: JoinChildOption,
        registration: ChildRegistrationResult,
    ): String {
        val status = registration.registrationStatus?.lowercase()
        val message = when {
            registration.joinedWaitlist -> "${child.fullName} added to waitlist."
            status == "active" -> "${child.fullName} registration completed."
            registration.requiresParentApproval ->
                "${child.fullName} request sent. A parent/guardian must approve before registration can continue."
            registration.requiresChildEmail ->
                "${child.fullName} registration started. Add child email to continue child-signature document steps."
            !registration.consentStatus.isNullOrBlank() ->
                "${child.fullName} registration is pending. Consent status: ${registration.consentStatus}."
            !status.isNullOrBlank() ->
                "${child.fullName} registration is pending. Status: $status."
            else -> "${child.fullName} registration request submitted and is pending processing."
        }
        val warning = registration.warnings.firstOrNull()?.takeIf(String::isNotBlank)
        return listOfNotNull(message, warning).joinToString(" ")
    }

    fun selfRegistrationResultMessage(
        registration: SelfRegistrationResult,
        defaultMessage: String? = null,
    ): String? {
        return when {
            registration.requiresParentApproval ->
                "Join request sent. A parent/guardian must approve before registration can continue."
            registration.joinedWaitlist -> "Added to event waitlist."
            else -> defaultMessage
        }
    }

    fun selfJoinBeforePaymentPlanDecision(
        result: Result<SelfRegistrationResult>,
    ): SelfJoinBeforePaymentPlanDecision {
        val registration = result.getOrNull()
        if (registration != null) {
            val message = selfRegistrationResultMessage(registration)
            if (message != null) {
                return SelfJoinBeforePaymentPlanDecision(
                    joinedByThisFlow = false,
                    shouldContinueToPaymentPlan = false,
                    shouldReloadEvent = true,
                    message = message,
                )
            }
            return SelfJoinBeforePaymentPlanDecision(
                joinedByThisFlow = true,
                shouldContinueToPaymentPlan = true,
            )
        }

        val failure = result.exceptionOrNull()
        if (failure != null && !failure.isAlreadyRegisteredJoinError()) {
            return SelfJoinBeforePaymentPlanDecision(
                joinedByThisFlow = false,
                shouldContinueToPaymentPlan = false,
                failure = failure,
            )
        }

        return SelfJoinBeforePaymentPlanDecision(
            joinedByThisFlow = false,
            shouldContinueToPaymentPlan = true,
        )
    }

    fun teamJoinBeforePaymentPlanDecision(
        result: Result<Unit>,
    ): TeamJoinBeforePaymentPlanDecision {
        if (result.isSuccess) {
            return TeamJoinBeforePaymentPlanDecision(
                joinedByThisFlow = true,
                shouldContinueToPaymentPlan = true,
            )
        }

        val failure = result.exceptionOrNull()
        if (failure != null && !failure.isAlreadyRegisteredJoinError()) {
            return TeamJoinBeforePaymentPlanDecision(
                joinedByThisFlow = false,
                shouldContinueToPaymentPlan = false,
                failure = failure,
            )
        }

        return TeamJoinBeforePaymentPlanDecision(
            joinedByThisFlow = false,
            shouldContinueToPaymentPlan = true,
        )
    }

    fun paymentPlanBillSuccessMessage(
        status: PaymentPlanBillStatus,
        forTeamJoin: Boolean,
        manualPayment: Boolean = false,
    ): String {
        if (manualPayment) {
            return if (forTeamJoin) {
                if (status == PaymentPlanBillStatus.ALREADY_EXISTS) {
                    "Team joined. Manual payment bill already exists. Upload proof from your Profile."
                } else {
                    "Team joined. Manual payment bill created. Upload proof from your Profile."
                }
            } else {
                if (status == PaymentPlanBillStatus.ALREADY_EXISTS) {
                    "Joined. Manual payment bill already exists. Upload proof from your Profile."
                } else {
                    "Joined. Manual payment bill created. Upload proof from your Profile."
                }
            }
        }
        return if (forTeamJoin) {
            if (status == PaymentPlanBillStatus.ALREADY_EXISTS) {
                "Team joined. Payment plan already exists. Manage installments from your Profile."
            } else {
                "Team joined. Payment plan started. A bill was created. Manage installments from your Profile."
            }
        } else {
            if (status == PaymentPlanBillStatus.ALREADY_EXISTS) {
                "Joined. Payment plan already exists. You can manage installments from your Profile."
            } else {
                "Joined. Payment plan started. A bill was created for you. Pay installments from your Profile."
            }
        }
    }

    fun determineJoinExecutionAction(
        paymentPlan: EffectivePaymentPlan,
        currentUserIsMinor: Boolean,
        isEventFull: Boolean,
        isTeamSignup: Boolean,
        forTeamJoin: Boolean,
        manualPayment: Boolean = false,
    ): JoinExecutionAction {
        if (currentUserIsMinor) {
            return JoinExecutionAction.REQUEST_PARENT_APPROVAL
        }
        if (paymentPlan.priceCents == null) {
            return JoinExecutionAction.REQUIRE_PRICE
        }
        if (
            paymentPlan.allowPaymentPlans &&
            paymentPlan.configuredPriceCents > 0 &&
            !isEventFull &&
            (forTeamJoin || !isTeamSignup)
        ) {
            return JoinExecutionAction.START_PAYMENT_PLAN
        }
        if (
            manualPayment &&
            paymentPlan.configuredPriceCents > 0 &&
            !isEventFull &&
            (forTeamJoin || !isTeamSignup)
        ) {
            return JoinExecutionAction.START_MANUAL_PAYMENT
        }
        if (paymentPlan.configuredPriceCents <= 0 || isEventFull || (!forTeamJoin && isTeamSignup)) {
            return JoinExecutionAction.JOIN_DIRECTLY
        }
        return JoinExecutionAction.CREATE_PURCHASE_INTENT
    }

    fun showTeamJoinQuestionDialog(
        dialog: TeamJoinQuestionDialogState,
        team: TeamWithPlayers,
    ) {
        pendingTeamJoinQuestionTeam = team
        _teamJoinQuestionDialog.value = dialog
    }

    fun teamJoinPolicyDecision(joinPolicy: String?): TeamJoinPolicyDecision {
        return when {
            joinPolicy.equals("OPEN_REGISTRATION", ignoreCase = true) ->
                TeamJoinPolicyDecision(TeamJoinPolicyKind.OPEN_REGISTRATION)
            joinPolicy.equals("REQUEST_TO_JOIN", ignoreCase = true) ->
                TeamJoinPolicyDecision(TeamJoinPolicyKind.REQUEST_TO_JOIN)
            else ->
                TeamJoinPolicyDecision(
                    kind = TeamJoinPolicyKind.CLOSED,
                    errorMessage = "This team is not accepting registrations.",
                )
        }
    }

    fun teamJoinSubmitLoadingMessage(joinPolicy: String?): String =
        if (teamJoinPolicyDecision(joinPolicy).kind == TeamJoinPolicyKind.REQUEST_TO_JOIN) {
            "Submitting join request..."
        } else {
            "Starting team registration..."
        }

    fun isRequestToJoinPolicy(joinPolicy: String?): Boolean =
        teamJoinPolicyDecision(joinPolicy).kind == TeamJoinPolicyKind.REQUEST_TO_JOIN

    fun registrationTargetTeamId(team: Team): String =
        team.parentTeamId?.trim()?.takeIf(String::isNotBlank) ?: team.id.trim()

    fun teamRegistrationResultDecision(result: TeamRegistrationResult): TeamRegistrationResultDecision {
        if (result.requiresParentApproval) {
            return TeamRegistrationResultDecision(
                action = TeamRegistrationResultAction.WAIT_FOR_PARENT_APPROVAL,
                message = result.userMessage(
                    "A parent or guardian must approve this team request before registration can continue.",
                ),
            )
        }
        if (result.requiresChildEmail()) {
            return TeamRegistrationResultDecision(
                action = TeamRegistrationResultAction.REQUIRE_CHILD_EMAIL,
                message = result.userMessage("Add the child's email before continuing."),
            )
        }
        if (result.requiresAdditionalSigning()) {
            return TeamRegistrationResultDecision(TeamRegistrationResultAction.REQUIRE_ADDITIONAL_SIGNING)
        }
        return TeamRegistrationResultDecision(TeamRegistrationResultAction.CONTINUE)
    }

    fun teamRegistrationContinuationDecision(
        team: Team,
        result: TeamRegistrationResult,
    ): TeamRegistrationContinuationDecision {
        val teamId = team.id.trim()
        if (teamId.isBlank()) {
            return TeamRegistrationContinuationDecision(
                action = TeamRegistrationContinuationAction.MISSING_TEAM_ID,
                teamId = teamId,
                message = "This team is missing an id.",
            )
        }
        if (team.registrationPriceCents > 0) {
            return TeamRegistrationContinuationDecision(
                action = TeamRegistrationContinuationAction.START_CHECKOUT,
                teamId = teamId,
            )
        }
        if (!result.isActive()) {
            return TeamRegistrationContinuationDecision(
                action = TeamRegistrationContinuationAction.REJECT_INACTIVE,
                teamId = teamId,
                message = result.userMessage("Unable to join this team."),
            )
        }
        return TeamRegistrationContinuationDecision(
            action = TeamRegistrationContinuationAction.COMPLETE_ACTIVE,
            teamId = teamId,
        )
    }

    fun submitTeamJoinQuestionAnswers(answers: Map<String, String>): TeamJoinQuestionSubmitResult? {
        val dialog = _teamJoinQuestionDialog.value ?: return null
        val missingQuestion = dialog.questions.firstOrNull { question ->
            question.required && answers[question.id].orEmpty().trim().isBlank()
        }
        if (missingQuestion != null) {
            return TeamJoinQuestionSubmitResult(
                missingQuestion = missingQuestion,
                dialog = dialog,
                team = pendingTeamJoinQuestionTeam,
            )
        }

        val team = pendingTeamJoinQuestionTeam
        _teamJoinQuestionDialog.value = null
        pendingTeamJoinQuestionTeam = null
        return TeamJoinQuestionSubmitResult(
            missingQuestion = null,
            dialog = dialog,
            team = team,
        )
    }

    fun dismissTeamJoinQuestionDialog() {
        _teamJoinQuestionDialog.value = null
        pendingTeamJoinQuestionTeam = null
    }

    fun setPendingJoinConfirmationTarget(target: JoinConfirmationTarget?) {
        pendingJoinConfirmationTarget = target
    }

    fun currentJoinConfirmationTarget(): JoinConfirmationTarget? =
        pendingJoinConfirmationTarget

    fun clearPendingJoinConfirmationTarget() {
        pendingJoinConfirmationTarget = null
    }

    fun startTeamRegistration(teamId: String): Boolean {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank) ?: return false
        if (_startingTeamRegistrationId.value != null) return false
        _startingTeamRegistrationId.value = normalizedTeamId
        return true
    }

    fun setStartingTeamRegistrationId(teamId: String?) {
        _startingTeamRegistrationId.value = teamId?.trim()?.takeIf(String::isNotBlank)
    }

    fun clearStartingTeamRegistrationId() {
        _startingTeamRegistrationId.value = null
    }

    fun setPendingTeamRegistration(team: TeamWithPlayers?) {
        pendingTeamRegistration = team
    }

    fun currentPendingTeamRegistration(): TeamWithPlayers? =
        pendingTeamRegistration

    fun clearPendingTeamRegistration() {
        pendingTeamRegistration = null
    }

    fun clearStartingTeamRegistrationIfNoPendingTeam() {
        if (pendingTeamRegistration == null) {
            _startingTeamRegistrationId.value = null
        }
    }

    fun clearTeamRegistrationState() {
        _startingTeamRegistrationId.value = null
        pendingTeamRegistration = null
    }

    fun setPendingPaymentSheetIntent(intent: PurchaseIntent) {
        pendingPaymentSheetIntent = intent
    }

    fun consumePendingPaymentSheetIntent(): PurchaseIntent? {
        val intent = pendingPaymentSheetIntent
        pendingPaymentSheetIntent = null
        return intent
    }

    fun clearPendingPaymentSheetIntent() {
        pendingPaymentSheetIntent = null
    }

    fun showTextSignaturePrompt(prompt: TextSignaturePromptState) {
        _textSignaturePrompt.value = prompt
    }

    fun clearTextSignaturePrompt() {
        _textSignaturePrompt.value = null
    }

    fun showWebSignaturePrompt(prompt: WebSignaturePromptState) {
        _webSignaturePrompt.value = prompt
    }

    fun clearWebSignaturePrompt() {
        _webSignaturePrompt.value = null
    }

    fun clearSignaturePrompts() {
        _textSignaturePrompt.value = null
        _webSignaturePrompt.value = null
    }

    fun replacePendingSignaturePollJob(job: Job?) {
        pendingSignaturePollJob?.cancel()
        pendingSignaturePollJob = job
    }

    fun clearPendingSignaturePollJob() {
        pendingSignaturePollJob?.cancel()
        pendingSignaturePollJob = null
    }

    fun hasPendingSignaturePollJob(): Boolean =
        pendingSignaturePollJob != null

    fun startRequiredSignatureFlow(
        signerContext: SignerContext,
        child: JoinChildOption?,
        currentAccountEmail: String?,
        teamId: String?,
        onReady: suspend () -> Unit,
    ) {
        pendingSignatureContexts = buildSignatureContextQueue(
            baseContext = signerContext,
            child = child,
            currentAccountEmail = currentAccountEmail,
        )
        pendingSignatureContextIndex = 0
        pendingSignatureChild = child
        pendingSignatureTeamId = teamId?.trim()?.takeIf(String::isNotBlank)
        pendingPostSignatureAction = onReady
    }

    fun hasPendingSignatureFlow(): Boolean =
        pendingPostSignatureAction != null && pendingSignatureContexts.isNotEmpty()

    fun hasSignatureContexts(): Boolean =
        pendingSignatureContexts.isNotEmpty()

    fun currentSignatureFetchTarget(): SignatureFlowTarget {
        val context = signatureContextAt(pendingSignatureContexts, pendingSignatureContextIndex)
        pendingSignatureContext = context
        return SignatureFlowTarget(
            signerContext = context,
            child = pendingSignatureChild,
            teamId = pendingSignatureTeamId,
        )
    }

    fun currentSignatureRecordingTarget(): SignatureFlowTarget =
        SignatureFlowTarget(
            signerContext = pendingSignatureContext,
            child = pendingSignatureChild,
            teamId = pendingSignatureTeamId,
        )

    fun replacePendingSignatureSteps(steps: List<SignStep>) {
        pendingSignatureSteps = steps
        pendingSignatureStepIndex = 0
    }

    fun clearPendingSignatureSteps() {
        pendingSignatureSteps = emptyList()
        pendingSignatureStepIndex = 0
    }

    fun currentPendingSignatureStep(): PendingSignatureStepState? {
        val step = pendingSignatureSteps.getOrNull(pendingSignatureStepIndex) ?: return null
        return PendingSignatureStepState(
            step = step,
            currentStep = pendingSignatureStepIndex + 1,
            totalSteps = pendingSignatureSteps.size,
        )
    }

    fun advanceSignatureContext(): Boolean {
        if (
            pendingSignatureContexts.isNotEmpty() &&
            pendingSignatureContextIndex < pendingSignatureContexts.lastIndex
        ) {
            pendingSignatureContextIndex += 1
            return true
        }
        return false
    }

    fun completePendingSignatureFlow(): (suspend () -> Unit)? {
        val action = pendingPostSignatureAction
        clearPendingSignatureFlow()
        return action
    }

    fun clearPendingSignatureFlow() {
        clearPendingSignaturePollJob()
        pendingSignatureSteps = emptyList()
        pendingSignatureStepIndex = 0
        pendingSignatureContext = SignerContext.PARTICIPANT
        pendingSignatureContexts = emptyList()
        pendingSignatureContextIndex = 0
        pendingSignatureChild = null
        pendingSignatureTeamId = null
        pendingPostSignatureAction = null
        clearSignaturePrompts()
    }

    fun applyRegistrationProgressDraft(draft: RegistrationProgressDraft?): String? {
        if (draft == null) {
            _holdExpiresAt.value = null
            questionsConfirmed = false
            return null
        }

        questionsConfirmed = draft.step == "checkout" ||
            !draft.holdExpiresAt.isNullOrBlank()
        if (draft.answers.isNotEmpty()) {
            _answers.value = _answers.value + draft.answers
        }
        _holdExpiresAt.value = draft.holdExpiresAt
        return draft.selectedDivisionId
            ?.trim()
            ?.takeIf(String::isNotBlank)
    }

    fun clearRegistrationProgressState() {
        _holdExpiresAt.value = null
        questionsConfirmed = false
    }

    fun registrationProgressKey(scope: EventRegistrationProgressScope): String? {
        val userId = scope.userId.trim().takeIf(String::isNotBlank) ?: return null
        val eventId = scope.eventId.trim().takeIf(String::isNotBlank) ?: return null
        return listOf(
            "event",
            userId,
            eventId,
            scope.occurrence?.slotId?.trim()?.takeIf(String::isNotBlank) ?: "none",
            scope.occurrence?.occurrenceDate?.trim()?.takeIf(String::isNotBlank) ?: "none",
        ).joinToString(":")
    }

    fun buildRegistrationProgressDraft(
        scope: EventRegistrationProgressScope,
        selectedDivisionId: String?,
        step: String?,
        registrationId: String?,
        holdExpiresAt: String? = _holdExpiresAt.value,
    ): RegistrationProgressDraft? {
        val userId = scope.userId.trim().takeIf(String::isNotBlank) ?: return null
        val eventId = scope.eventId.trim().takeIf(String::isNotBlank) ?: return null
        val occurrence = scope.occurrence
        return RegistrationProgressDraft(
            scope = "event",
            userId = userId,
            eventId = eventId,
            step = step,
            answers = _answers.value,
            selectedDivisionId = selectedDivisionId,
            slotId = occurrence?.slotId,
            occurrenceDate = occurrence?.occurrenceDate,
            registrationId = registrationId,
            holdExpiresAt = holdExpiresAt,
            updatedAt = Clock.System.now().toString(),
        )
    }

    suspend fun saveRegistrationProgress(
        scope: EventRegistrationProgressScope,
        selectedDivisionId: String?,
        step: String?,
        registrationId: String?,
        holdExpiresAt: String? = _holdExpiresAt.value,
        saveProgress: suspend (key: String, draft: RegistrationProgressDraft) -> Unit,
    ) {
        val key = registrationProgressKey(scope) ?: return
        val draft = buildRegistrationProgressDraft(
            scope = scope,
            selectedDivisionId = selectedDivisionId,
            step = step,
            registrationId = registrationId,
            holdExpiresAt = holdExpiresAt,
        ) ?: return
        saveProgress(key, draft)
    }

    suspend fun loadRegistrationProgress(
        scope: EventRegistrationProgressScope,
        loadProgress: suspend (key: String) -> RegistrationProgressDraft?,
    ): String? {
        val key = registrationProgressKey(scope) ?: run {
            clearRegistrationProgressState()
            return null
        }
        return applyRegistrationProgressDraft(loadProgress(key))
    }

    suspend fun clearRegistrationProgress(
        scope: EventRegistrationProgressScope,
        clearProgress: suspend (key: String) -> Unit,
    ) {
        registrationProgressKey(scope)?.let { key ->
            clearProgress(key)
        }
        clearRegistrationProgressState()
    }
}
