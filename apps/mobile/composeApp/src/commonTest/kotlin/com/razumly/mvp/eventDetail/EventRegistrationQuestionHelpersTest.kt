package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertSame

class EventRegistrationQuestionHelpersTest {

    @Test
    fun registration_question_answer_update_trims_question_id_and_ignores_blank_ids() {
        assertEquals(
            "question-1" to "Blue",
            registrationQuestionAnswerUpdate(" question-1 ", "Blue"),
        )
        assertNull(registrationQuestionAnswerUpdate(" ", "Blue"))
    }

    @Test
    fun registration_question_dialog_answers_include_all_dialog_questions() {
        val questions = listOf(
            question("q1", required = true),
            question("q2", required = false),
        )

        assertEquals(
            mapOf("q1" to "Answer 1", "q2" to ""),
            registrationQuestionDialogAnswers(
                questions = questions,
                submittedAnswers = mapOf("q1" to "Answer 1", "unknown" to "ignored"),
            ),
        )
    }

    @Test
    fun first_missing_required_registration_question_returns_first_blank_required_answer() {
        val firstRequired = question("q1", prompt = "First required", required = true)
        val secondRequired = question("q2", prompt = "Second required", required = true)
        val questions = listOf(firstRequired, secondRequired)

        assertSame(
            firstRequired,
            firstMissingRequiredRegistrationQuestion(
                questions = questions,
                answers = mapOf("q1" to " ", "q2" to "Answered"),
            ),
        )
        assertSame(
            secondRequired,
            firstMissingRequiredRegistrationQuestion(
                questions = questions,
                answers = mapOf("q1" to "Answered", "q2" to ""),
            ),
        )
        assertNull(
            firstMissingRequiredRegistrationQuestion(
                questions = questions,
                answers = mapOf("q1" to "Answered", "q2" to "Answered"),
            ),
        )
    }

    @Test
    fun registration_answers_for_request_trims_ids_and_filters_blank_or_unknown_answers() {
        val questions = listOf(
            question("q1"),
            question(" q2 "),
        )

        assertEquals(
            mapOf("q1" to "Answer 1", "q2" to " Answer 2 "),
            registrationAnswersForRequest(
                questions = questions,
                answers = mapOf(
                    " q1 " to "Answer 1",
                    "q2" to " Answer 2 ",
                    "q3" to "Unknown",
                    "blank" to " ",
                    " " to "No id",
                ),
            ),
        )
    }

    @Test
    fun registration_answers_for_request_allows_nonblank_answers_when_question_list_is_empty() {
        assertEquals(
            mapOf("q1" to "Answer 1", "q2" to "Answer 2"),
            registrationAnswersForRequest(
                questions = emptyList(),
                answers = mapOf(
                    " q1 " to "Answer 1",
                    "q2" to "Answer 2",
                    "q3" to "",
                ),
            ),
        )
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
