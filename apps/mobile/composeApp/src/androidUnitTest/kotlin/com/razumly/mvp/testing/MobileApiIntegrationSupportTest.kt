package com.razumly.mvp.testing

import com.razumly.mvp.core.network.dto.EventEditorBasicsDto
import com.razumly.mvp.core.network.dto.EventEditorCompetitionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionMode
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorExpectedCreateRevisionsDto
import com.razumly.mvp.core.network.dto.EventEditorFieldDto
import com.razumly.mvp.core.network.dto.EventEditorParticipationDto
import com.razumly.mvp.core.network.dto.EventEditorPaymentDto
import com.razumly.mvp.core.network.dto.EventEditorRegistrationDto
import com.razumly.mvp.core.network.dto.EventEditorResourcesDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleDto
import com.razumly.mvp.core.network.dto.EventEditorStaffDto
import com.razumly.mvp.core.network.dto.EventEditorTimeSlotDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class MobileApiIntegrationSupportTest {
    @Test
    fun seed_failure_does_not_probe_fixture_readiness() {
        var fixturesChecked = false

        val prepared = runBackendSeedThenCheck(
            seed = { error("seed unavailable") },
            fixturesReady = {
                fixturesChecked = true
                true
            },
        )

        assertFalse(prepared)
        assertFalse(fixturesChecked)
    }

    @Test
    fun post_seed_fixture_contract_failure_is_not_swallowed() {
        val failure = assertFailsWith<AssertionError> {
            runBackendSeedThenCheck(
                seed = {},
                fixturesReady = { throw AssertionError("editor contract mismatch") },
            )
        }

        assertEquals("editor contract mismatch", failure.message)
    }

    @Test
    fun successful_seed_checks_fixture_readiness() {
        var fixturesChecked = false

        val prepared = runBackendSeedThenCheck(
            seed = {},
            fixturesReady = {
                fixturesChecked = true
                true
            },
        )

        assertTrue(prepared)
        assertTrue(fixturesChecked)
    }

    @Test
    fun given_database_url_with_target_override_when_validated_then_rejected() {
        val overrideParameters = listOf(
            "host",
            "hostaddr",
            "port",
            "socket",
            "connectionString",
            "%68ost",
        )

        overrideParameters.forEach { parameter ->
            val value = if (parameter == "connectionString") {
                "postgresql%3A%2F%2Fu%3Ap%40remote%2Fprod"
            } else {
                "remote.example"
            }
            assertFailsWith<IllegalArgumentException> {
                validateLocalTestDatabaseUrl(
                    "postgresql://mvp:mvp_password@127.0.0.1:5433/mvp_test?$parameter=$value",
                )
            }
        }
    }

    @Test
    fun given_database_url_with_target_session_attrs_when_validated_then_rejected() {
        assertFailsWith<IllegalArgumentException> {
            validateLocalTestDatabaseUrl(
                "postgresql://mvp:mvp_password@127.0.0.1:5433/mvp_test?target_session_attrs=read-write",
            )
        }
    }

    @Test
    fun given_database_url_with_schema_query_when_validated_then_accepted() {
        val raw = "postgresql://mvp:mvp_password@127.0.0.1:5433/mvp_test?schema=public"

        assertEquals(raw, validateLocalTestDatabaseUrl(raw))
    }

    @Test
    fun given_repeating_time_slots_database_url_when_validated_then_accepted() {
        val raw =
            "postgresql://bracketiq:bracketiq_repeating_time_slots_local@127.0.0.1:5434/" +
                "bracketiq_repeating_time_slots?schema=public"

        assertEquals(raw, validateLocalTestDatabaseUrl(raw))
    }

    @Test
    fun given_unrelated_repeating_time_slots_database_url_when_validated_then_rejected() {
        assertFailsWith<IllegalArgumentException> {
            validateLocalTestDatabaseUrl(
                "postgresql://bracketiq:bracketiq_repeating_time_slots_local@127.0.0.1:5434/" +
                    "customer_repeating_time_slots?schema=public",
            )
        }
    }

    @Test
    fun given_declared_and_embedded_resources_when_building_purge_request_then_unions_nonblank_ids() {
        val prepared = PreparedEventEditorCreate(
            eventId = "draft-event",
            command = EventEditorCreateCommandDto(
                contractVersion = 3,
                createOperationId = "operation",
                expectedRevisions = EventEditorExpectedCreateRevisionsDto(
                    editorRevision = "editor",
                    staffRevision = null,
                    scheduleRevision = "schedule",
                ),
                draft = EventEditorDraftDto(
                    basics = EventEditorBasicsDto(
                        name = "Tournament",
                        description = "",
                        eventType = "TOURNAMENT",
                        start = "2026-08-30T12:00:00Z",
                        timeZone = "UTC",
                        location = "",
                        address = "",
                        affiliateUrl = "",
                        state = "DRAFT",
                    ),
                    participation = EventEditorParticipationDto(
                        teamSignup = true,
                        singleDivision = false,
                        registrationByDivisionType = false,
                        registrationCutoffHours = 0,
                        allowTeamSplitDefault = false,
                    ),
                    registration = EventEditorRegistrationDto(
                        payment = EventEditorPaymentDto(
                            mode = "FREE",
                            priceCents = 0,
                            taxHandling = "NONE",
                            organizerManualTaxRateBps = 0,
                            allowPaymentPlans = false,
                        ),
                    ),
                    competition = EventEditorCompetitionDto(
                        doubleElimination = false,
                        includePlayoffs = false,
                        splitLeaguePlayoffDivisions = false,
                        usesSets = false,
                    ),
                    schedule = EventEditorScheduleDto(mode = "MANUAL"),
                    resources = EventEditorResourcesDto(
                        fieldIds = listOf(" declared-field ", "duplicate-field", "", " "),
                        fields = listOf(
                            EventEditorFieldDto(id = "embedded-field"),
                            EventEditorFieldDto(
                                id = "duplicate-field",
                                legacyId = "ignored-field",
                            ),
                            EventEditorFieldDto(legacyId = " legacy-field "),
                            EventEditorFieldDto(id = " "),
                        ),
                        timeSlotIds = listOf(" declared-slot ", "duplicate-slot", "", " "),
                        timeSlots = listOf(
                            EventEditorTimeSlotDto(id = "embedded-slot"),
                            EventEditorTimeSlotDto(
                                id = "duplicate-slot",
                                legacyId = "ignored-slot",
                            ),
                            EventEditorTimeSlotDto(legacyId = " legacy-slot "),
                            EventEditorTimeSlotDto(id = " "),
                        ),
                    ),
                    staff = EventEditorStaffDto(
                        teamCheckInMode = "OFF",
                        teamCheckInOpenMinutesBefore = 0,
                        allowMatchRosterEdits = false,
                        allowTemporaryMatchPlayers = false,
                        autoCreatePointMatchIncidents = false,
                    ),
                ),
                completion = EventEditorCreateCompletionDto(
                    mode = EventEditorCreateCompletionMode.CREATE_ONLY,
                ),
            ),
        )

        val operation = Json.parseToJsonElement(
            mobileTournamentPurgeRequest(
                eventIds = emptyList(),
                preparedCreates = listOf(prepared),
                seededOrganizationId = "organization",
                seededTeamIds = emptyList(),
            ),
        ).jsonObject.getValue("operations").jsonArray.single().jsonObject

        assertEquals(
            listOf("declared-field", "duplicate-field", "embedded-field", "legacy-field"),
            operation.getValue("fieldIds").jsonArray.map { value -> value.jsonPrimitive.content },
        )
        assertEquals(
            listOf("declared-slot", "duplicate-slot", "embedded-slot", "legacy-slot"),
            operation.getValue("timeSlotIds").jsonArray.map { value -> value.jsonPrimitive.content },
        )
    }

    @Test
    fun acceptance_put_observer_matches_the_observed_create_operation() {
        val matchingBody = Json.parseToJsonElement(
            """{"createOperationId":"operation-observed","proposalRevision":"revision"}""",
        )
        val unrelatedBody = Json.parseToJsonElement(
            """{"createOperationId":"operation-unrelated","proposalRevision":"revision"}""",
        )

        assertTrue(
            acceptanceRequestMatchesOperation(matchingBody, "operation-observed"),
        )
        assertFalse(
            acceptanceRequestMatchesOperation(unrelatedBody, "operation-observed"),
        )
    }

}
