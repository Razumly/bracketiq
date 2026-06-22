package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.RegistrationProgressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    private val _paymentPlanPreviewDialog = MutableStateFlow<PaymentPlanPreviewDialogState?>(null)
    val paymentPlanPreviewDialog = _paymentPlanPreviewDialog.asStateFlow()

    private val _withdrawTargets = MutableStateFlow<List<WithdrawTargetOption>>(emptyList())
    val withdrawTargets = _withdrawTargets.asStateFlow()

    private val _billingAddressPrompt = MutableStateFlow<BillingAddressDraft?>(null)
    val billingAddressPrompt = _billingAddressPrompt.asStateFlow()

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
    private var pendingTeamJoinQuestionTeam: TeamWithPlayers? = null

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
        _joinChoiceDialog.value = JoinChoiceDialogState(children = children)
        _childJoinSelectionDialog.value = null
    }

    fun dismissJoinChoiceDialog() {
        _joinChoiceDialog.value = null
    }

    fun showChildJoinSelectionDialog(children: List<JoinChildOption>) {
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

    fun showTeamJoinQuestionDialog(
        dialog: TeamJoinQuestionDialogState,
        team: TeamWithPlayers,
    ) {
        pendingTeamJoinQuestionTeam = team
        _teamJoinQuestionDialog.value = dialog
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
}
