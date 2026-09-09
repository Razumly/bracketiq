package com.razumly.mvp.core.network

import kotlin.test.Test
import kotlin.test.assertEquals

class ApiErrorMessageTest {
    @Test
    fun given_match_boundary_failure_when_decoded_then_both_platforms_use_the_same_error() {
        val message = "The Match must be within the Event bounds. Set or extend Planned End before moving the Match."
        val error = ApiException(409, "http://localhost/api/events/event/matches", """
            {"code":"MATCH_OUTSIDE_EVENT_BOUNDS","error":"$message","eventId":"event",
             "eventStart":"2027-01-04T08:00:00.000Z","eventEnd":"2027-01-04T20:00:00.000Z","matchIds":["match"]}
        """.trimIndent())
        val boundary = kotlin.test.assertNotNull(error.matchBoundaryError)
        assertEquals(listOf("match"), boundary.matchIds)
        assertEquals("event", boundary.eventId)
        assertEquals(message, error.userMessage())
    }

    @Test
    fun extractApiErrorMessage_returns_error_field_from_http_envelope() {
        val message = extractApiErrorMessage(
            """HTTP 401 for http://10.0.2.2:3000/api/auth/login: {"error":"Invalid credentials"}"""
        )

        assertEquals("Invalid credentials", message)
    }

    @Test
    fun extractApiErrorMessage_handles_nested_message_payload() {
        val message = extractApiErrorMessage(
            """{"status":"error","data":{"message":"Team is full"}}"""
        )

        assertEquals("Team is full", message)
    }

    @Test
    fun apiException_userMessage_prefers_response_body_message() {
        val throwable = ApiException(
            statusCode = 403,
            url = "http://example.test/api/teams/join",
            responseBody = """{"message":"You do not have permission to join this team."}""",
        )

        assertEquals(
            "You do not have permission to join this team.",
            throwable.userMessage("Failed to join team."),
        )
    }

    @Test
    fun userMessage_returns_fallback_for_blank_messages() {
        assertEquals("Unable to load.", Throwable("").userMessage("Unable to load."))
    }
}
