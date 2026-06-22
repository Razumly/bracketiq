package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.RegistrationProgressDraft
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class EventRegistrationFlowCoordinatorTest {

    @Test
    fun update_question_answer_trims_question_id_and_ignores_blank_ids() {
        val coordinator = EventRegistrationFlowCoordinator()

        assertTrue(coordinator.updateQuestionAnswer(" question-1 ", "Blue"))
        assertFalse(coordinator.updateQuestionAnswer(" ", "Ignored"))

        assertEquals(mapOf("question-1" to "Blue"), coordinator.answers.value)
    }

    @Test
    fun replace_registration_questions_preserves_known_answers_and_adds_empty_defaults() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.replaceRegistrationQuestions(
            listOf(
                question("q1"),
                question("q2"),
            ),
        )
        coordinator.updateQuestionAnswer("q1", "Answer 1")
        coordinator.updateQuestionAnswer("unknown", "Unknown")

        coordinator.replaceRegistrationQuestions(
            listOf(
                question("q1"),
                question("q3"),
            ),
        )

        assertEquals(
            mapOf("q1" to "Answer 1", "q3" to ""),
            coordinator.answers.value,
        )
    }

    @Test
    fun ensure_questions_answered_opens_dialog_until_required_answers_are_confirmed() {
        val coordinator = EventRegistrationFlowCoordinator()
        var continued = false
        val requiredQuestion = question("q1", prompt = "Required question", required = true)
        coordinator.replaceRegistrationQuestions(listOf(requiredQuestion))

        assertFalse(coordinator.ensureQuestionsAnswered(eventName = "Summer League") { continued = true })
        assertEquals("Summer League", coordinator.questionDialog.value?.eventName)
        assertEquals(listOf(requiredQuestion), coordinator.questionDialog.value?.questions)
        assertTrue(coordinator.questionsExpanded.value)

        val missingResult = coordinator.submitQuestionDialogAnswers(mapOf("q1" to " "))
        assertSame(requiredQuestion, missingResult?.missingQuestion)
        assertFalse(continued)
        assertFalse(coordinator.ensureQuestionsAnswered(eventName = "Summer League") { continued = true })

        val submittedResult = coordinator.submitQuestionDialogAnswers(mapOf("q1" to "Answered"))
        submittedResult?.continuation?.invoke()

        assertNull(submittedResult?.missingQuestion)
        assertTrue(continued)
        assertNull(coordinator.questionDialog.value)
        assertTrue(coordinator.ensureQuestionsAnswered(eventName = "Summer League") {})
    }

    @Test
    fun progress_key_and_draft_normalize_scope_and_preserve_answers() {
        val coordinator = EventRegistrationFlowCoordinator()
        val scope = EventRegistrationProgressScope(
            userId = " user-1 ",
            eventId = " event-1 ",
            occurrence = EventOccurrenceSelection(
                slotId = " slot-1 ",
                occurrenceDate = " 2026-07-01 ",
            ),
        )
        coordinator.updateQuestionAnswer("q1", "Answer 1")
        coordinator.setRegistrationHoldExpiresAt(" 2026-07-01T10:00:00Z ")

        assertEquals(
            "event:user-1:event-1:slot-1:2026-07-01",
            coordinator.registrationProgressKey(scope),
        )

        val draft = coordinator.buildRegistrationProgressDraft(
            scope = scope,
            selectedDivisionId = "division-1",
            step = "checkout",
            registrationId = "registration-1",
        )

        assertEquals("event", draft?.scope)
        assertEquals("user-1", draft?.userId)
        assertEquals("event-1", draft?.eventId)
        assertEquals("checkout", draft?.step)
        assertEquals(mapOf("q1" to "Answer 1"), draft?.answers)
        assertEquals("division-1", draft?.selectedDivisionId)
        assertEquals(" slot-1 ", draft?.slotId)
        assertEquals(" 2026-07-01 ", draft?.occurrenceDate)
        assertEquals("registration-1", draft?.registrationId)
        assertEquals("2026-07-01T10:00:00Z", draft?.holdExpiresAt)
    }

    @Test
    fun apply_progress_draft_restores_answers_hold_and_selected_division() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.replaceRegistrationQuestions(listOf(question("q1")))

        val selectedDivision = coordinator.applyRegistrationProgressDraft(
            RegistrationProgressDraft(
                scope = "event",
                userId = "user-1",
                eventId = "event-1",
                step = "checkout",
                answers = mapOf("q1" to "Saved answer"),
                selectedDivisionId = " division-1 ",
                holdExpiresAt = "2026-07-01T10:00:00Z",
                updatedAt = "2026-06-22T12:00:00Z",
            ),
        )

        assertEquals("division-1", selectedDivision)
        assertEquals(mapOf("q1" to "Saved answer"), coordinator.answers.value)
        assertEquals("2026-07-01T10:00:00Z", coordinator.holdExpiresAt.value)
        assertTrue(coordinator.ensureQuestionsAnswered(eventName = "Event") {})

        assertNull(coordinator.applyRegistrationProgressDraft(null))
        assertNull(coordinator.holdExpiresAt.value)
        assertFalse(coordinator.ensureQuestionsAnswered(eventName = "Event") {})
    }

    @Test
    fun clear_after_hold_expired_dismisses_dialog_and_resets_hold() {
        val coordinator = EventRegistrationFlowCoordinator()
        coordinator.replaceRegistrationQuestions(listOf(question("q1", required = true)))
        coordinator.setRegistrationHoldExpiresAt("2026-07-01T10:00:00Z")
        coordinator.ensureQuestionsAnswered(eventName = "Event") {}

        coordinator.clearAfterRegistrationHoldExpired()

        assertNull(coordinator.questionDialog.value)
        assertNull(coordinator.holdExpiresAt.value)
        assertFalse(coordinator.ensureQuestionsAnswered(eventName = "Event") {})
    }

    private fun question(
        id: String,
        prompt: String = "Prompt $id",
        required: Boolean = false,
    ): TeamJoinQuestion {
        return TeamJoinQuestion(
            id = id,
            prompt = prompt,
            required = required,
        )
    }
}
