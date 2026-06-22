package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.RegistrationProgressDraft
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

    private var pendingQuestionContinuation: (() -> Unit)? = null
    private var questionsConfirmed = false

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
