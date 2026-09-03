package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.configureMvpHttpClient
import com.razumly.mvp.core.network.dto.EventEditorBasicsDto
import com.razumly.mvp.core.network.dto.EventEditorCapabilitiesDto
import com.razumly.mvp.core.network.dto.EventEditorCatalogsDto
import com.razumly.mvp.core.network.dto.EventEditorCompetitionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionMode
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorCreateProposalDto
import com.razumly.mvp.core.network.dto.EventEditorCreateResponseDto
import com.razumly.mvp.core.network.dto.EventEditorCreateProposalGraphDto
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventEditorExpectedCreateRevisionsDto
import com.razumly.mvp.core.network.dto.EventEditorDivisionDetailDto
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorFieldDto
import com.razumly.mvp.core.network.dto.EventEditorImmutableDto
import com.razumly.mvp.core.network.dto.EventEditorManualPaymentLinkDto
import com.razumly.mvp.core.network.dto.EventEditorOfficialPositionDto
import com.razumly.mvp.core.network.dto.EventEditorParticipationDto
import com.razumly.mvp.core.network.dto.EventEditorPaymentDto
import com.razumly.mvp.core.network.dto.EventEditorQuestionDto
import com.razumly.mvp.core.network.dto.EventEditorRegistrationDto
import com.razumly.mvp.core.network.dto.EventEditorResourcesDto
import com.razumly.mvp.core.network.dto.EventEditorErrorDto
import com.razumly.mvp.core.network.dto.EventEditorAcceptMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceAcceptedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRejectedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRequestDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseStatus
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorRejectMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorRevisionBindingDto
import com.razumly.mvp.core.network.dto.EventEditorSaveResultDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorMatchDemandDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleDiagnosticsDto
import com.razumly.mvp.core.network.dto.EventEditorAffectedCompetitionPhaseDto
import com.razumly.mvp.core.network.dto.EventEditorUnscheduledMatchDto
import com.razumly.mvp.core.network.dto.MatchApiDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleStateDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleDto
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.dto.EventEditorStaffDto
import com.razumly.mvp.core.network.dto.EventEditorStaffInviteDto
import com.razumly.mvp.core.network.dto.EventEditorTagDto
import com.razumly.mvp.core.network.dto.EventEditorTimeSlotDto
import com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.http.content.TextContent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlin.test.assertTrue
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertFalse
import kotlin.test.assertNotNull

class EventEditorRemoteGatewayTest {
    @Test
    fun given_create_command_when_sent_then_wire_tree_contains_required_rows() = runTest {
        val command = editorCreateCommand()
        var requestBody: String? = null
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("/api/events/editor", request.url.encodedPath)
            assertEquals("Bearer session-token", request.headers[HttpHeaders.Authorization])
            requestBody = (request.body as TextContent).text
            respond(
                content = jsonMVP.encodeToString(savedResult(command)),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            http = HttpClient(engine) { configureMvpHttpClient() },
            baseUrl = "http://example.test",
            tokenStore = GatewayTestTokenStore,
        )

        val result = EventEditorRemoteGateway(api).create(command)
        val body = jsonMVP.parseToJsonElement(requestBody ?: "").jsonObject
        val wireExpectedRevisions = body.getValue("expectedRevisions").jsonObject
        assertEquals("editor-revision-1", wireExpectedRevisions.getValue("editorRevision").jsonPrimitive.content)
        assertEquals("staff-revision-1", wireExpectedRevisions.getValue("staffRevision").jsonPrimitive.content)
        assertEquals("schedule-revision-1", wireExpectedRevisions.getValue("scheduleRevision").jsonPrimitive.content)
        val draft = body.getValue("draft").jsonObject
        val basics = draft.getValue("basics").jsonObject
        val payment = draft.getValue("registration").jsonObject.getValue("payment").jsonObject
        val schedule = draft.getValue("schedule").jsonObject
        val field = draft.getValue("resources").jsonObject
            .getValue("fields").jsonArray.single().jsonObject
        val timeSlot = draft.getValue("resources").jsonObject
            .getValue("timeSlots").jsonArray.single().jsonObject
        val division = draft.getValue("competition").jsonObject
            .getValue("divisionDetails").jsonArray.single().jsonObject
        val invite = draft.getValue("staff").jsonObject
            .getValue("pendingInvites").jsonArray.single().jsonObject
        val question = draft.getValue("registration").jsonObject
            .getValue("questions").jsonArray.single().jsonObject

        assertTrue(result is EventEditorCreateResponseDto.Saved)
        assertEquals(true, body.getValue("hasScheduleProposalSupport").jsonPrimitive.booleanOrNull)
        assertEquals("create-operation-1", body.getValue("createOperationId").jsonPrimitive.content)
        assertEquals(JsonNull, payment.getValue("manualPaymentInstructions"))
        assertEquals(JsonNull, draft.getValue("resources").jsonObject.getValue("rentalBookingId"))
        assertFalse(schedule.containsKey("generatedScheduleEnd"))
        assertFalse(field.containsValue(JsonNull))
        assertFalse(timeSlot.containsValue(JsonNull))
        assertFalse(division.containsValue(JsonNull))

        assertFalse(invite.containsValue(JsonNull))
        assertEquals("question-client-1", question.getValue("clientId").jsonPrimitive.content)
        assertFalse(question.containsKey("id"))
        assertNotNull(body.getValue("draft"))
    }
    @Test
    fun given_schedule_proposal_when_created_then_proposal_graph_and_revision_binding_are_decoded() = runTest {
        val command = editorCreateCommand()
        val proposal = scheduleProposal(command)
        val engine = MockEngine {
            respond(
                content = jsonMVP.encodeToString(proposal),
                status = HttpStatusCode.Accepted,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            http = HttpClient(engine) { configureMvpHttpClient() },
            baseUrl = "http://example.test",
            tokenStore = GatewayTestTokenStore,
        )

        val result = EventEditorRemoteGateway(api).create(command)

        assertTrue(result is EventEditorCreateResponseDto.Proposed)
        val decoded = (result as EventEditorCreateResponseDto.Proposed).proposal
        assertEquals("proposal-operation-1", decoded.createOperationId)
        assertEquals("proposal-revision-1", decoded.proposalRevision)
        assertEquals("field-revision-1", decoded.revisionBinding.fieldRevisions.getValue("field-1"))
        assertEquals(1, decoded.graph.matches.size)
        assertEquals(1, decoded.scheduleOutcome.matchCount)
    }
    @Test
    fun given_proposal_when_accepted_and_rejected_then_wire_bodies_match_contract() = runTest {
        val command = editorCreateCommand()
        val requestBodies = mutableListOf<Pair<HttpMethod, String>>()
        val engine = MockEngine { request ->
            val body = (request.body as TextContent).text
            requestBodies += request.method to body
            if (request.method == HttpMethod.Put) {
                respond(
                    content = jsonMVP.encodeToString(savedResult(command)),
                    status = HttpStatusCode.Created,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            } else {
                respond(content = "", status = HttpStatusCode.NoContent)
            }
        }
        val api = MvpApiClient(
            http = HttpClient(engine) { configureMvpHttpClient() },
            baseUrl = "http://example.test",
            tokenStore = GatewayTestTokenStore,
        )
        val gateway = EventEditorRemoteGateway(api)

        gateway.acceptProposal(
            createOperationId = "proposal-operation-1",
            proposalRevision = "proposal-revision-1",
            draft = command.draft,
        )
        gateway.rejectProposal(
            createOperationId = "proposal-operation-1",
            proposalRevision = "proposal-revision-1",
        )

        assertEquals(2, requestBodies.size)
        val accept = requestBodies[0]
        assertEquals(HttpMethod.Put, accept.first)
        val acceptBody = jsonMVP.parseToJsonElement(accept.second).jsonObject
        val acceptDraft = acceptBody.getValue("draft").jsonObject
        val acceptBasics = acceptDraft.getValue("basics").jsonObject
        listOf("parentEvent", "organizationId", "hostId", "imageId").forEach { key ->
            assertEquals(JsonNull, acceptBasics.getValue(key))
        }
        val acceptParticipation = acceptDraft.getValue("participation").jsonObject
        listOf(
            "teamSizeLimit",
            "maxParticipants",
            "minAge",
            "maxAge",
            "cancellationRefundHours",
        ).forEach { key ->
            assertEquals(JsonNull, acceptParticipation.getValue(key))
        }
        val acceptPayment = acceptDraft.getValue("registration")
            .jsonObject.getValue("payment").jsonObject
        assertEquals(JsonNull, acceptPayment.getValue("manualPaymentInstructions"))
        assertEquals(JsonNull, acceptPayment.getValue("installmentCount"))
        val acceptCompetition = acceptDraft.getValue("competition").jsonObject
        listOf(
            "winnerSetCount",
            "loserSetCount",
            "playoffTeamCount",
            "setsPerMatch",
            "setDurationMinutes",
            "restTimeMinutes",
            "gamesPerOpponent",
            "matchRulesOverride",
            "leagueScoringConfig",
        ).forEach { key ->
            assertEquals(JsonNull, acceptCompetition.getValue(key))
        }
        val acceptResources = acceptDraft.getValue("resources").jsonObject
        assertEquals(JsonNull, acceptResources.getValue("rentalBookingId"))
        assertEquals(JsonNull, acceptResources.getValue("rentalBookingItemId"))

        assertEquals(
            command.draft,
            jsonMVP.decodeFromJsonElement(
                EventEditorDraftDto.serializer(),
                acceptDraft,
            ),
        )
        assertEquals("4", acceptBody.getValue("contractVersion").jsonPrimitive.content)
        assertEquals(
            "proposal-operation-1",
            acceptBody.getValue("createOperationId").jsonPrimitive.content,
        )
        assertEquals(
            "proposal-revision-1",
            acceptBody.getValue("proposalRevision").jsonPrimitive.content,
        )

        val reject = requestBodies[1]
        assertEquals(HttpMethod.Delete, reject.first)
        val rejectBody = jsonMVP.parseToJsonElement(reject.second).jsonObject
        assertEquals("4", rejectBody.getValue("contractVersion").jsonPrimitive.content)
        assertEquals(
            "proposal-operation-1",
            rejectBody.getValue("createOperationId").jsonPrimitive.content,
        )
        assertEquals(
            "proposal-revision-1",
            rejectBody.getValue("proposalRevision").jsonPrimitive.content,
        )
    }

    @Test
    fun given_partial_proposal_acceptance_when_sent_then_explicit_mode_and_identity_are_on_wire() = runTest {
        val command = editorCreateCommand()
        val projection = EventEditorMatchProjectionDto(
            id = "match-1",
            eventId = "event-1",
            placementState = "UNPLACED",
            phaseDivisionId = "phase-1",
            phase = "POOL",
        )
        val response = savedResult(command).copy(
            acceptanceOperationId = "acceptance-operation-1",
            scheduleOutcome = EventEditorScheduleOutcomeDto(
                status = EventEditorScheduleOutcomeStatus.PARTIAL,
                matchCount = 1,
                placedMatchCount = 0,
                unplacedMatchCount = 1,
                matches = listOf(projection),
                unscheduledMatches = listOf(
                    EventEditorUnscheduledMatchDto(
                        id = "match-1",
                        phaseDivisionId = "phase-1",
                        phase = "POOL",
                    ),
                ),
                affectedCompetitionPhases = listOf(
                    EventEditorAffectedCompetitionPhaseDto(
                        id = "phase-1",
                        name = "Pool",
                        phase = "POOL",
                    ),
                ),
            ),
        )
        var requestBody: String? = null
        val engine = MockEngine { request ->
            requestBody = (request.body as TextContent).text
            respond(
                content = jsonMVP.encodeToString(response),
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            http = HttpClient(engine) { configureMvpHttpClient() },
            baseUrl = "http://example.test",
            tokenStore = GatewayTestTokenStore,
        )
        val result = EventEditorRemoteGateway(api).acceptPartialProposal(
            createOperationId = "proposal-operation-1",
            proposalRevision = "proposal-revision-1",
            acceptanceOperationId = "acceptance-operation-1",
            draft = command.draft,
        )
        assertEquals(EventEditorScheduleOutcomeStatus.PARTIAL, result.scheduleOutcome.status)
        assertEquals(listOf("match-1"), result.scheduleOutcome.unscheduledMatches.map { it.id })
        assertEquals(
            listOf("phase-1"),
            result.scheduleOutcome.affectedCompetitionPhases.map { it.id },
        )
        val body = jsonMVP.parseToJsonElement(requestBody ?: "").jsonObject
        assertEquals("PARTIAL", body.getValue("acceptanceMode").jsonPrimitive.content)
        assertEquals(
            "acceptance-operation-1",
            body.getValue("acceptanceOperationId").jsonPrimitive.content,
        )
    }

    @Test
    fun given_stale_proposal_error_when_api_fails_then_typed_stale_exception_is_preserved() = runTest {
        val engine = MockEngine {
            respond(
                content = """{"error":"Proposal is stale.","code":"EDITOR_PROPOSAL_STALE","scheduleRevision":"new"}""",
                status = HttpStatusCode.Conflict,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            http = HttpClient(engine) { configureMvpHttpClient() },
            baseUrl = "http://example.test",
            tokenStore = GatewayTestTokenStore,
        )
        val exception = assertFailsWith<EventEditorProposalStaleException> {
            EventEditorRemoteGateway(api).acceptProposal(
                createOperationId = "proposal-operation-1",
                proposalRevision = "proposal-revision-1",
                draft = editorCreateCommand().draft,
            )
        }
        assertEquals("EDITOR_PROPOSAL_STALE", exception.payload?.code)
        assertEquals("new", exception.payload?.scheduleRevision)
    }
    @Test
    fun given_invalid_registration_unit_when_api_fails_then_code_field_and_details_are_preserved() = runTest {
        val errorPayload = EventEditorErrorDto(
            error = "Team registration is not allowed for this event type.",
            code = "INVALID_EVENT_REGISTRATION_UNIT",
            field = "teamSignup",
            editorRevision = "revision-1",
            details = jsonMVP.parseToJsonElement(
                """{"allowed":["individual"],"eventType":"TRYOUT"}""",
            ),
        )
        val engine = MockEngine {
            respond(
                content = jsonMVP.encodeToString(errorPayload),
                status = HttpStatusCode.UnprocessableEntity,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            http = HttpClient(engine) { configureMvpHttpClient() },
            baseUrl = "http://example.test",
            tokenStore = GatewayTestTokenStore,
        )
        val exception = assertFailsWith<EventEditorApiException> {
            EventEditorRemoteGateway(api).openEdit("event-1")
        }
        assertEquals("INVALID_EVENT_REGISTRATION_UNIT", exception.payload?.code)
        assertEquals("teamSignup", exception.payload?.field)
        assertEquals(errorPayload.details, exception.payload?.details)
    }
    @Test
    fun given_maintenance_operations_when_sent_then_v3_paths_bodies_and_statuses_are_used() = runTest {
        val request = EventEditorMaintenanceRequestDto(
            contractVersion = 3,
            eventId = "event-1",
            operation = EventEditorMaintenanceOperation.BUILD,
            operationId = "maintenance-operation-1",
            expectedRevisions = maintenanceRevisionBinding(),
            participantCount = 12,
            includePlaceholderTeams = true,
        )
        val proposal = maintenanceProposal(request)
        val accepted = maintenanceAcceptedResult(proposal)
        val rejected = maintenanceRejectedResult(proposal)
        val requests = mutableListOf<Triple<HttpMethod, String, String>>()
        val engine = MockEngine { httpRequest ->
            val body = (httpRequest.body as TextContent).text
            requests += Triple(httpRequest.method, httpRequest.url.encodedPath, body)
            when (httpRequest.method) {
                HttpMethod.Post -> respond(
                    content = maintenanceProposalBody(proposal),
                    status = HttpStatusCode.OK,
                    headers = headersOf(
                        HttpHeaders.ContentType,
                        ContentType.Application.Json.toString(),
                    ),
                )
                HttpMethod.Put -> respond(
                    content = maintenanceAcceptedBody(accepted),
                    status = HttpStatusCode.OK,
                    headers = headersOf(
                        HttpHeaders.ContentType,
                        ContentType.Application.Json.toString(),
                    ),
                )
                HttpMethod.Delete -> respond(
                    content = maintenanceRejectedBody(rejected),
                    status = HttpStatusCode.OK,
                    headers = headersOf(
                        HttpHeaders.ContentType,
                        ContentType.Application.Json.toString(),
                    ),
                )
                else -> error("Unexpected HTTP method ${httpRequest.method}.")
            }
        }
        val api = MvpApiClient(
            http = HttpClient(engine) { configureMvpHttpClient() },
            baseUrl = "http://example.test",
            tokenStore = GatewayTestTokenStore,
        )
        val gateway = EventEditorRemoteGateway(api)

        val proposed = gateway.proposeMaintenance(request)
        val acceptedResult = gateway.acceptMaintenance(
            EventEditorAcceptMaintenanceProposalDto(
                contractVersion = 3,
                eventId = "event-1",
                operation = EventEditorMaintenanceOperation.BUILD,
                operationId = "maintenance-operation-1",
                proposalRevision = "proposal-revision-1",
                acceptanceOperationId = "acceptance-operation-1",
            ),
        )
        val rejectedResult = gateway.rejectMaintenance(
            EventEditorRejectMaintenanceProposalDto(
                contractVersion = 3,
                eventId = "event-1",
                operation = EventEditorMaintenanceOperation.BUILD,
                operationId = "maintenance-operation-1",
                proposalRevision = "proposal-revision-1",
            ),
        )

        val decodedProposal = assertIs<EventEditorMaintenanceResponseDto.Proposed>(proposed).proposal
        assertEquals("proposal-revision-1", decodedProposal.proposalRevision)
        assertEquals(listOf("match-protected"), decodedProposal.protectedMatchIds)
        assertEquals("availability-revision-1", decodedProposal.revisionBinding.availabilityRevision)
        assertEquals("acceptance-operation-1", acceptedResult.acceptanceOperationId)
        assertEquals(EventEditorMaintenanceResponseStatus.ACCEPTED, acceptedResult.status)
        assertEquals(EventEditorMaintenanceResponseStatus.REJECTED, rejectedResult.status)
        assertEquals(3, requests.size)
        assertEquals(
            listOf(HttpMethod.Post, HttpMethod.Put, HttpMethod.Delete),
            requests.map { it.first },
        )
        assertEquals(
            listOf(
                "/api/events/event-1/schedule",
                "/api/events/event-1/schedule",
                "/api/events/event-1/schedule",
            ),
            requests.map { it.second },
        )

        val postBody = jsonMVP.parseToJsonElement(requests[0].third).jsonObject
        assertEquals(
            setOf(
                "contractVersion",
                "eventId",
                "operation",
                "operationId",
                "expectedRevisions",
                "participantCount",
                "includePlaceholderTeams",
            ),
            postBody.keys,
        )
        assertEquals("3", postBody.getValue("contractVersion").jsonPrimitive.content)
        assertEquals("BUILD", postBody.getValue("operation").jsonPrimitive.content)
        assertEquals("maintenance-operation-1", postBody.getValue("operationId").jsonPrimitive.content)
        assertEquals("12", postBody.getValue("participantCount").jsonPrimitive.content)
        assertEquals("true", postBody.getValue("includePlaceholderTeams").jsonPrimitive.content)
        assertEquals(
            "schedule-revision-1",
            postBody.getValue("expectedRevisions").jsonObject
                .getValue("scheduleRevision").jsonPrimitive.content,
        )
        assertEquals(
            setOf(
                "editorRevision",
                "staffRevision",
                "scheduleRevision",
                "fieldRevisions",
                "timeSlotRevisions",
                "rentalBookingRevision",
                "rentalBookingRevisions",
                "rentalBookingItemRevisions",
                "availabilityRevision",
            ),
            postBody.getValue("expectedRevisions").jsonObject.keys,
        )
        assertFalse(postBody.containsKey("expectedScheduleRevision"))
        assertFalse(postBody.containsKey("replaceExistingMatches"))

        val putBody = jsonMVP.parseToJsonElement(requests[1].third).jsonObject
        assertEquals(
            setOf(
                "contractVersion",
                "eventId",
                "operation",
                "operationId",
                "proposalRevision",
                "acceptanceOperationId",
            ),
            putBody.keys,
        )
        assertEquals("ACCEPTED", acceptedResult.status.name)
        assertFalse(putBody.containsKey("expectedScheduleRevision"))
        assertFalse(putBody.containsKey("replaceExistingMatches"))

        val deleteBody = jsonMVP.parseToJsonElement(requests[2].third).jsonObject
        assertEquals(
            setOf(
                "contractVersion",
                "eventId",
                "operation",
                "operationId",
                "proposalRevision",
            ),
            deleteBody.keys,
        )
        assertFalse(deleteBody.containsKey("expectedScheduleRevision"))
        assertFalse(deleteBody.containsKey("replaceExistingMatches"))
    }
    @Test
    fun given_maintenance_replay_when_post_returns_accepted_without_expectations_then_accepted_graph_is_decoded() = runTest {
        val request = EventEditorMaintenanceRequestDto(
            contractVersion = 3,
            eventId = "event-1",
            operation = EventEditorMaintenanceOperation.BUILD,
            operationId = "maintenance-replay-1",
        )
        val accepted = maintenanceAcceptedResult(maintenanceProposal(request))
        val engine = MockEngine { httpRequest ->
            assertEquals(HttpMethod.Post, httpRequest.method)
            respond(
                content = maintenanceAcceptedBody(accepted),
                status = HttpStatusCode.OK,
                headers = headersOf(
                    HttpHeaders.ContentType,
                    ContentType.Application.Json.toString(),
                ),
            )
        }
        val gateway = EventEditorRemoteGateway(
            MvpApiClient(
                http = HttpClient(engine) { configureMvpHttpClient() },
                baseUrl = "http://example.test",
                tokenStore = GatewayTestTokenStore,
            ),
        )

        val result = gateway.proposeMaintenance(request)

        val decoded = assertIs<EventEditorMaintenanceResponseDto.Accepted>(result).result
        assertEquals(EventEditorMaintenanceResponseStatus.ACCEPTED, decoded.status)
        assertEquals("proposal-revision-1", decoded.proposalRevision)
        assertEquals("acceptance-operation-1", decoded.acceptanceOperationId)
        assertEquals("event-1", decoded.graph.event.id)
        assertEquals(1, decoded.graph.canonicalMatches.size)
    }


    @Test
    fun given_maintenance_request_with_nullable_revisions_when_sent_then_wire_keys_are_explicit() = runTest {
        val request = EventEditorMaintenanceRequestDto(
            contractVersion = 3,
            eventId = "event-1",
            operation = EventEditorMaintenanceOperation.BUILD,
            operationId = "maintenance-operation-nullable",
            expectedRevisions = EventEditorRevisionBindingDto(
                editorRevision = "editor-revision-1",
                staffRevision = null,
                scheduleRevision = "schedule-revision-1",
                fieldRevisions = emptyMap(),
                timeSlotRevisions = emptyMap(),
                rentalBookingRevision = null,
                rentalBookingRevisions = emptyMap(),
                rentalBookingItemRevisions = emptyMap(),
                availabilityRevision = "availability-revision-1",
            ),
            participantCount = null,
            includePlaceholderTeams = null,
        )
        val proposal = maintenanceProposal(request)
        var requestBody = ""
        val engine = MockEngine { httpRequest ->
            requestBody = (httpRequest.body as TextContent).text
            respond(
                content = maintenanceProposalBody(proposal),
                status = HttpStatusCode.OK,
                headers = headersOf(
                    HttpHeaders.ContentType,
                    ContentType.Application.Json.toString(),
                ),
            )
        }
        val gateway = EventEditorRemoteGateway(
            MvpApiClient(
                http = HttpClient(engine) { configureMvpHttpClient() },
                baseUrl = "http://example.test",
                tokenStore = GatewayTestTokenStore,
            ),
        )

        gateway.proposeMaintenance(request)

        val body = jsonMVP.parseToJsonElement(requestBody).jsonObject
        assertEquals(
            setOf("contractVersion", "eventId", "operation", "operationId", "expectedRevisions"),
            body.keys,
        )
        val revisions = body.getValue("expectedRevisions").jsonObject
        assertEquals(
            setOf(
                "editorRevision",
                "staffRevision",
                "scheduleRevision",
                "fieldRevisions",
                "timeSlotRevisions",
                "rentalBookingRevision",
                "rentalBookingRevisions",
                "rentalBookingItemRevisions",
                "availabilityRevision",
            ),
            revisions.keys,
        )
        assertEquals(JsonNull, revisions.getValue("staffRevision"))
        assertEquals(JsonNull, revisions.getValue("rentalBookingRevision"))
        assertEquals(JsonObject(emptyMap()), revisions.getValue("fieldRevisions"))
        assertEquals(JsonObject(emptyMap()), revisions.getValue("rentalBookingRevisions"))
        assertEquals(JsonObject(emptyMap()), revisions.getValue("rentalBookingItemRevisions"))
    }

    @Test
    fun given_maintenance_acceptance_response_with_mismatched_identity_when_decoded_then_contract_error_is_raised() = runTest {
        val proposal = maintenanceProposal(
            EventEditorMaintenanceRequestDto(
                contractVersion = 3,
                eventId = "event-1",
                operation = EventEditorMaintenanceOperation.BUILD,
                operationId = "maintenance-operation-1",
            ),
        )
        val request = EventEditorAcceptMaintenanceProposalDto(
            contractVersion = 3,
            eventId = "event-1",
            operation = EventEditorMaintenanceOperation.BUILD,
            operationId = "maintenance-operation-1",
            proposalRevision = proposal.proposalRevision,
            acceptanceOperationId = "acceptance-operation-1",
        )
        val accepted = maintenanceAcceptedResult(proposal)
        val canonical = canonicalMaintenanceResponse(
            jsonMVP.encodeToJsonElement(accepted).jsonObject,
        )
        var responseBody = canonical.toString()
        val engine = MockEngine {
            respond(
                content = responseBody,
                status = HttpStatusCode.OK,
                headers = headersOf(
                    HttpHeaders.ContentType,
                    ContentType.Application.Json.toString(),
                ),
            )
        }
        val gateway = EventEditorRemoteGateway(
            MvpApiClient(
                http = HttpClient(engine) { configureMvpHttpClient() },
                baseUrl = "http://example.test",
                tokenStore = GatewayTestTokenStore,
            ),
        )
        listOf(
            "eventId" to JsonPrimitive("event-2"),
            "operation" to JsonPrimitive(EventEditorMaintenanceOperation.COMPLETE.name),
            "operationId" to JsonPrimitive("maintenance-operation-2"),
            "proposalRevision" to JsonPrimitive("proposal-revision-2"),
            "acceptanceOperationId" to JsonPrimitive("acceptance-operation-2"),
        ).forEach { (key, replacement) ->
            responseBody = JsonObject(canonical.toMutableMap().apply { this[key] = replacement }).toString()
            assertFailsWith<EventEditorContractException> {
                gateway.acceptMaintenance(request)
            }
        }
    }
    @Test
    fun given_maintenance_rejection_response_with_mismatched_revision_when_decoded_then_contract_error_is_raised() = runTest {
        val proposal = maintenanceProposal(
            EventEditorMaintenanceRequestDto(
                contractVersion = 3,
                eventId = "event-1",
                operation = EventEditorMaintenanceOperation.BUILD,
                operationId = "maintenance-operation-1",
            ),
        )
        val request = EventEditorRejectMaintenanceProposalDto(
            contractVersion = 3,
            eventId = "event-1",
            operation = EventEditorMaintenanceOperation.BUILD,
            operationId = "maintenance-operation-1",
            proposalRevision = proposal.proposalRevision,
        )
        val rejected = maintenanceRejectedResult(proposal)
        var responseBody = JsonObject(
            jsonMVP.encodeToJsonElement(rejected).jsonObject.toMutableMap().apply {
                this["proposalRevision"] = JsonPrimitive("proposal-revision-2")
            },
        ).toString()
        val engine = MockEngine {
            respond(
                content = responseBody,
                status = HttpStatusCode.OK,
                headers = headersOf(
                    HttpHeaders.ContentType,
                    ContentType.Application.Json.toString(),
                ),
            )
        }
        val gateway = EventEditorRemoteGateway(
            MvpApiClient(
                http = HttpClient(engine) { configureMvpHttpClient() },
                baseUrl = "http://example.test",
                tokenStore = GatewayTestTokenStore,
            ),
        )

        assertFailsWith<EventEditorContractException> {
            gateway.rejectMaintenance(request)
        }
    }


    @Test
    fun given_maintenance_response_with_missing_graph_key_when_decoded_then_contract_error_is_raised() = runTest {
        val proposal = maintenanceProposal(
            EventEditorMaintenanceRequestDto(
                contractVersion = 3,
                eventId = "event-1",
                operation = EventEditorMaintenanceOperation.BUILD,
                operationId = "maintenance-operation-1",
            ),
        )
        val request = EventEditorAcceptMaintenanceProposalDto(
            contractVersion = 3,
            eventId = "event-1",
            operation = EventEditorMaintenanceOperation.BUILD,
            operationId = "maintenance-operation-1",
            proposalRevision = proposal.proposalRevision,
            acceptanceOperationId = "acceptance-operation-1",
        )
        val accepted = maintenanceAcceptedResult(proposal)
        val canonical = canonicalMaintenanceResponse(
            jsonMVP.encodeToJsonElement(accepted).jsonObject,
        )
        val graph = canonical.getValue("graph").jsonObject
        val event = graph.getValue("event").jsonObject
        val malformedGraph = JsonObject(graph.toMutableMap().apply {
            this["event"] = JsonObject(event.toMutableMap().apply { remove("maxParticipants") })
        })
        val malformed = JsonObject(canonical.toMutableMap().apply { this["graph"] = malformedGraph })
        val engine = MockEngine {
            respond(
                content = malformed.toString(),
                status = HttpStatusCode.OK,
                headers = headersOf(
                    HttpHeaders.ContentType,
                    ContentType.Application.Json.toString(),
                ),
            )
        }
        val gateway = EventEditorRemoteGateway(
            MvpApiClient(
                http = HttpClient(engine) { configureMvpHttpClient() },
                baseUrl = "http://example.test",
                tokenStore = GatewayTestTokenStore,
            ),
        )

        assertFailsWith<EventEditorContractException> {
            gateway.acceptMaintenance(request)
        }
    }

    @Test
    fun given_maintenance_response_with_missing_nested_graph_key_when_decoded_then_contract_error_is_raised() = runTest {
        val proposal = maintenanceProposal(
            EventEditorMaintenanceRequestDto(
                contractVersion = 3,
                eventId = "event-1",
                operation = EventEditorMaintenanceOperation.BUILD,
                operationId = "maintenance-operation-1",
            ),
        )
        val request = EventEditorAcceptMaintenanceProposalDto(
            contractVersion = 3,
            eventId = "event-1",
            operation = EventEditorMaintenanceOperation.BUILD,
            operationId = "maintenance-operation-1",
            proposalRevision = proposal.proposalRevision,
            acceptanceOperationId = "acceptance-operation-1",
        )
        val accepted = maintenanceAcceptedResult(proposal)
        val canonical = canonicalMaintenanceResponse(
            jsonMVP.encodeToJsonElement(accepted).jsonObject,
        )
        val match = canonical.getValue("graph").jsonObject
            .getValue("matches").jsonArray.first().jsonObject
        val malformedSegment = JsonObject(
            mapOf(
                "id" to JsonPrimitive("segment-1"),
                "matchId" to JsonPrimitive("match-1"),
                "status" to JsonPrimitive("PENDING"),
                "scores" to JsonObject(emptyMap()),
            ),
        )
        val malformedMatch = JsonObject(match.toMutableMap().apply {
            this["segments"] = JsonArray(listOf(malformedSegment))
        })
        val malformedGraph = JsonObject(
            canonical.getValue("graph").jsonObject.toMutableMap().apply {
                this["matches"] = JsonArray(listOf(malformedMatch))
            },
        )
        val malformed = JsonObject(canonical.toMutableMap().apply { this["graph"] = malformedGraph })
        val engine = MockEngine {
            respond(
                content = malformed.toString(),
                status = HttpStatusCode.OK,
                headers = headersOf(
                    HttpHeaders.ContentType,
                    ContentType.Application.Json.toString(),
                ),
            )
        }
        val gateway = EventEditorRemoteGateway(
            MvpApiClient(
                http = HttpClient(engine) { configureMvpHttpClient() },
                baseUrl = "http://example.test",
                tokenStore = GatewayTestTokenStore,
            ),
        )

        assertFailsWith<EventEditorContractException> {
            gateway.acceptMaintenance(request)
        }
    }

    @Test
    fun given_maintenance_stale_and_rejected_errors_when_api_fails_then_typed_errors_are_preserved() = runTest {
        var callCount = 0
        val engine = MockEngine {
            val payload = if (callCount++ == 0) {
                EventEditorErrorDto(
                    error = "The schedule changed while you were editing.",
                    code = "EDITOR_MAINTENANCE_STALE",
                    scheduleRevision = "schedule-revision-2",
                )
            } else {
                EventEditorErrorDto(
                    error = "The schedule proposal was rejected.",
                    code = "EDITOR_MAINTENANCE_REJECTED",
                )
            }
            respond(
                content = jsonMVP.encodeToString(payload),
                status = HttpStatusCode.Conflict,
                headers = headersOf(
                    HttpHeaders.ContentType,
                    ContentType.Application.Json.toString(),
                ),
            )
        }
        val api = MvpApiClient(
            http = HttpClient(engine) { configureMvpHttpClient() },
            baseUrl = "http://example.test",
            tokenStore = GatewayTestTokenStore,
        )
        val gateway = EventEditorRemoteGateway(api)

        val stale = assertFailsWith<EventEditorProposalStaleException> {
            gateway.acceptMaintenance(
                EventEditorAcceptMaintenanceProposalDto(
                    contractVersion = 3,
                    eventId = "event-1",
                    operation = EventEditorMaintenanceOperation.COMPLETE,
                    operationId = "maintenance-operation-1",
                    proposalRevision = "proposal-revision-1",
                    acceptanceOperationId = "acceptance-operation-1",
                ),
            )
        }
        val rejected = assertFailsWith<EventEditorMaintenanceRejectedException> {
            gateway.rejectMaintenance(
                EventEditorRejectMaintenanceProposalDto(
                    contractVersion = 3,
                    eventId = "event-1",
                    operation = EventEditorMaintenanceOperation.COMPLETE,
                    operationId = "maintenance-operation-1",
                    proposalRevision = "proposal-revision-1",
                ),
            )
        }

        assertEquals("EDITOR_MAINTENANCE_STALE", stale.payload?.code)
        assertEquals("schedule-revision-2", stale.payload?.scheduleRevision)
        assertEquals("EDITOR_MAINTENANCE_REJECTED", rejected.payload?.code)
        assertEquals(409, stale.statusCode)
        assertEquals(409, rejected.statusCode)
    }

    @Test
    fun given_maintenance_acceptance_conflict_when_api_fails_then_typed_conflict_exception_is_preserved() = runTest {
        val engine = MockEngine {
            respond(
                content = """{"error":"The proposal was already accepted by another acceptance operation.","code":"EDITOR_MAINTENANCE_ACCEPTANCE_CONFLICT"}""",
                status = HttpStatusCode.Conflict,
                headers = headersOf(
                    HttpHeaders.ContentType,
                    ContentType.Application.Json.toString(),
                ),
            )
        }
        val api = MvpApiClient(
            http = HttpClient(engine) { configureMvpHttpClient() },
            baseUrl = "http://example.test",
            tokenStore = GatewayTestTokenStore,
        )
        val exception = assertFailsWith<EventEditorMaintenanceAcceptanceConflictException> {
            EventEditorRemoteGateway(api).rejectMaintenance(
                EventEditorRejectMaintenanceProposalDto(
                    contractVersion = 3,
                    eventId = "event-1",
                    operation = EventEditorMaintenanceOperation.COMPLETE,
                    operationId = "maintenance-operation-1",
                    proposalRevision = "proposal-revision-1",
                ),
            )
        }

        assertEquals("EDITOR_MAINTENANCE_ACCEPTANCE_CONFLICT", exception.payload?.code)
        assertEquals(409, exception.statusCode)
    }

}

private object GatewayTestTokenStore : AuthTokenStore {
    override suspend fun get(): String = "session-token"
    override suspend fun set(token: String) = Unit
    override suspend fun clear() = Unit
}

private fun editorCreateCommand(): EventEditorCreateCommandDto = EventEditorCreateCommandDto(
    contractVersion = 3,
    createOperationId = "create-operation-1",
    expectedRevisions = EventEditorExpectedCreateRevisionsDto(
        editorRevision = "editor-revision-1",
        staffRevision = "staff-revision-1",
        scheduleRevision = "schedule-revision-1",
    ),
    draft = EventEditorDraftDto(
        basics = EventEditorBasicsDto(
            name = "Canonical event",
            description = "Description",
            eventType = "LEAGUE",
            sportIds = listOf("sport-1"),
            start = "2026-09-01T10:00:00Z",
            timeZone = "UTC",
            location = "Main venue",
            address = "1 Main Street",
            affiliateUrl = "",
            parentEvent = null,
            organizationId = null,
            hostId = null,
            state = "UNPUBLISHED",
            imageId = null,
            tags = listOf(EventEditorTagDto(legacyId = "tag-1", name = "Summer")),
        ),
        participation = EventEditorParticipationDto(
            teamSignup = true,
            singleDivision = false,
            registrationByDivisionType = true,
            registrationCutoffHours = 12,
            allowTeamSplitDefault = true,
        ),
        registration = EventEditorRegistrationDto(
            payment = EventEditorPaymentDto(
                mode = "MANUAL",
                priceCents = 1000,
                taxHandling = "INCLUSIVE",
                organizerManualTaxRateBps = 0,
                manualPaymentInstructions = null,
                manualPaymentLinks = listOf(EventEditorManualPaymentLinkDto(provider = "Stripe")),
                allowPaymentPlans = false,
            ),
            questions = listOf(
                EventEditorQuestionDto(
                    clientId = "question-client-1",
                    prompt = "Preferred side?",
                    answerType = "TEXT",
                    required = true,
                    sortOrder = 0,
                ),
            ),
        ),
        competition = EventEditorCompetitionDto(
            doubleElimination = false,
            includePlayoffs = false,
            splitLeaguePlayoffDivisions = false,
            usesSets = false,
            divisionDetails = listOf(
                EventEditorDivisionDetailDto(
                    id = "division-1",
                    key = "open",
                    name = "Open",
                    kind = "LEAGUE",
                    divisionTypeId = "division-type-1",
                    skillDivisionTypeId = "skill-1",
                    ageDivisionTypeId = "age-1",
                    divisionTypeName = "Open",
                    ratingType = "NONE",
                    gender = null,
                    fieldIds = listOf("field-1"),
                ),
            ),
        ),
        schedule = EventEditorScheduleDto(
            mode = "FIXED_END",
            endConstraint = "2026-09-01T14:00:00Z",
        ),
        resources = EventEditorResourcesDto(
            fields = listOf(EventEditorFieldDto(id = "field-1", name = "Court 1")),
            timeSlots = listOf(EventEditorTimeSlotDto(id = "slot-1")),
            rentalBookingId = null,
            rentalBookingItemId = null,
        ),
        staff = EventEditorStaffDto(
            staffingPriority = "BEST_AVAILABLE_COVERAGE",
            doTeamsOfficiate = false,
            teamOfficialsMaySwap = false,
            teamCheckInMode = "OFF",
            teamCheckInOpenMinutesBefore = 0,
            allowMatchRosterEdits = false,
            allowTemporaryMatchPlayers = false,
            autoCreatePointMatchIncidents = false,
            officialPositions = listOf(EventEditorOfficialPositionDto("position-1", "Referee", 1, 0)),
            pendingInvites = listOf(
                EventEditorStaffInviteDto(
                    email = "staff@example.com",
                    roles = listOf("OFFICIAL"),
                ),
            ),
        ),
    ),

    completion = EventEditorCreateCompletionDto(EventEditorCreateCompletionMode.CREATE_AND_BUILD_SCHEDULE),
    hasScheduleProposalSupport = true,
)
private fun scheduleProposal(command: EventEditorCreateCommandDto) = EventEditorCreateProposalDto(
    status = "PROPOSED",
    createOperationId = "proposal-operation-1",
    eventId = "event-1",
    proposalRevision = "proposal-revision-1",
    expectedRevisions = command.expectedRevisions,
    completion = command.completion,
    snapshot = savedResult(command).snapshot,
    revisionBinding = EventEditorRevisionBindingDto(
        editorRevision = "revision-1",
        staffRevision = "staff-revision-1",
        scheduleRevision = "schedule-revision-1",
        fieldRevisions = mapOf("field-1" to "field-revision-1"),
        timeSlotRevisions = mapOf("slot-1" to "slot-revision-1"),
        availabilityRevision = "availability-revision-1",
    ),
    scheduleOutcome = EventEditorScheduleOutcomeDto(
        status = EventEditorScheduleOutcomeStatus.BUILT,
        matchCount = 1,
        matches = listOf(
            EventEditorMatchProjectionDto(
                id = "match-1",
                eventId = "event-1",
                fieldId = "field-1",
                officialId = "official-1",
            ),
        ),
        diagnostics = scheduleDiagnostics(),
    ),
    graph = EventEditorCreateProposalGraphDto(
        event = EventApiDto(
            id = "event-1",
            name = "Proposal",
            hostId = "host-1",
            start = "2026-08-24T10:00:00Z",
            end = "2026-08-24T11:00:00Z",
            eventType = "LEAGUE",
        ),
        matches = listOf(MatchApiDto(id = "match-1")),
    ),
)

private fun savedResult(command: EventEditorCreateCommandDto) = EventEditorSaveResultDto(
    status = "SAVED",
    snapshot = EventEditorSnapshotDto(
        contractVersion = 3,
        draft = command.draft,
        mode = "CREATE",
        eventId = "event-1",
        editorRevision = "revision-1",
        capabilities = EventEditorCapabilitiesDto(
            canUseOnlinePayments = true,
            canManageStaff = true,
            canEdit = true,
            supportsTeamStaffing = true,
        ),
        catalogs = EventEditorCatalogsDto(),
        immutable = EventEditorImmutableDto(),
        scheduleState = EventEditorScheduleStateDto(
            sourceType = null,
            matchCount = 0,
            revision = "new",
            hasProtectedHistory = false,
        ),
    ),
    staffEmailDelivery = "NOT_REQUESTED",
    scheduleOutcome = EventEditorScheduleOutcomeDto(
        status = EventEditorScheduleOutcomeStatus.NOT_REQUESTED,
        matchCount = 0,
    ),
)

private fun maintenanceRevisionBinding(): EventEditorRevisionBindingDto =
    EventEditorRevisionBindingDto(
        editorRevision = "editor-revision-1",
        staffRevision = "staff-revision-1",
        scheduleRevision = "schedule-revision-1",
        fieldRevisions = mapOf("field-1" to "field-revision-1"),
        timeSlotRevisions = mapOf("slot-1" to "slot-revision-1"),
        rentalBookingRevision = "booking-revision-1",
        availabilityRevision = "availability-revision-1",
    )

private fun maintenanceMatches(): List<EventEditorMatchProjectionDto> = listOf(
    EventEditorMatchProjectionDto(
        id = "match-1",
        matchId = 1,
        eventId = "event-1",
        placementState = "PLACED",
        fieldId = "field-1",
    ),
)

private fun maintenanceScheduleOutcome(): com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeDto =
    com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeDto(
        status = EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE,
        isComplete = true,
        matchCount = 1,
        placedMatchCount = 1,
        unplacedMatchCount = 0,
        matches = maintenanceMatches(),
        unscheduledMatches = emptyList(),
        affectedCompetitionPhases = emptyList(),
        diagnostics = scheduleDiagnostics(),
        warnings = emptyList(),
    )

private fun scheduleDiagnostics(): EventEditorScheduleDiagnosticsDto = EventEditorScheduleDiagnosticsDto(
    message = "Total Resource capacity is not proven insufficient.",
    matchDemand = EventEditorMatchDemandDto(
        total = 1,
        byDivision = mapOf("division-1" to 1),
        byPhase = mapOf("LEAGUE" to 1),
        placed = 1,
        unplaced = 0,
    ),
    estimatedCapacity = 1,
    estimatedCapacityIsUpperBound = true,
    minimumDeficitMatches = 0,
    searchComplete = true,
)

private fun maintenanceProposal(
    request: EventEditorMaintenanceRequestDto,
): EventEditorMaintenanceProposalDto {
    val matches = maintenanceMatches()
    return EventEditorMaintenanceProposalDto(
        status = EventEditorMaintenanceResponseStatus.PROPOSED,
        contractVersion = request.contractVersion,
        eventId = request.eventId,
        operation = request.operation,
        operationId = request.operationId,
        proposalRevision = "proposal-revision-1",
        revisionBinding = request.expectedRevisions ?: maintenanceRevisionBinding(),
        graph = EventEditorMaintenanceGraphDto(
            event = EventApiDto(id = request.eventId, eventType = "LEAGUE"),
            matches = matches,
        ),
        protectedMatchIds = listOf("match-protected"),
        scheduleOutcome = maintenanceScheduleOutcome(),
    )
}

private fun maintenanceAcceptedResult(
    proposal: EventEditorMaintenanceProposalDto,
): EventEditorMaintenanceAcceptedResultDto = EventEditorMaintenanceAcceptedResultDto(
    status = EventEditorMaintenanceResponseStatus.ACCEPTED,
    contractVersion = proposal.contractVersion,
    eventId = proposal.eventId,
    operation = proposal.operation,
    operationId = proposal.operationId,
    proposalRevision = proposal.proposalRevision,
    revisionBinding = proposal.revisionBinding,
    graph = proposal.graph,
    protectedMatchIds = proposal.protectedMatchIds,
    scheduleOutcome = proposal.scheduleOutcome,
    acceptanceOperationId = "acceptance-operation-1",
)

private fun maintenanceRejectedResult(
    proposal: EventEditorMaintenanceProposalDto,
): EventEditorMaintenanceRejectedResultDto = EventEditorMaintenanceRejectedResultDto(
    status = EventEditorMaintenanceResponseStatus.REJECTED,
    contractVersion = proposal.contractVersion,
    eventId = proposal.eventId,
    operation = proposal.operation,
    operationId = proposal.operationId,
    proposalRevision = proposal.proposalRevision,
)
private fun maintenanceProposalBody(value: EventEditorMaintenanceProposalDto): String =
    canonicalMaintenanceResponse(jsonMVP.encodeToJsonElement(value).jsonObject).toString()

private fun maintenanceAcceptedBody(value: EventEditorMaintenanceAcceptedResultDto): String =
    canonicalMaintenanceResponse(jsonMVP.encodeToJsonElement(value).jsonObject).toString()

private fun maintenanceRejectedBody(value: EventEditorMaintenanceRejectedResultDto): String =
    jsonMVP.encodeToJsonElement(value).toString()

private fun canonicalMaintenanceResponse(value: JsonObject): JsonObject {
    val graph = value.getValue("graph").jsonObject
    val graphEvent = graph.getValue("event").jsonObject.withMissing(
        "name" to JsonPrimitive("Maintenance"),
        "description" to JsonPrimitive(""),
        "start" to JsonPrimitive("2026-08-24T10:00:00Z"),
        "end" to JsonPrimitive("2026-08-24T11:00:00Z"),
        "location" to JsonPrimitive("Court 1"),
        "coordinates" to JsonNull,
        "price" to JsonNull,
        "minAge" to JsonNull,
        "maxAge" to JsonNull,
        "rating" to JsonNull,
        "imageId" to JsonNull,
        "hostId" to JsonPrimitive("host-1"),
        "noFixedEndDateTime" to JsonPrimitive(false),
        "scheduleEndConstraint" to JsonNull,
        "generatedScheduleEnd" to JsonNull,
        "state" to JsonPrimitive("UNPUBLISHED"),
        "maxParticipants" to JsonPrimitive(0),
        "teamSizeLimit" to JsonNull,
        "restTimeMinutes" to JsonPrimitive(0),
        "teamSignup" to JsonPrimitive(true),
        "singleDivision" to JsonPrimitive(true),
        "waitListIds" to JsonArray(emptyList()),
        "freeAgentIds" to JsonArray(emptyList()),
        "teamIds" to JsonArray(emptyList()),
        "userIds" to JsonArray(emptyList()),
        "fieldIds" to JsonArray(listOf(JsonPrimitive("field-1"))),
        "timeSlotIds" to JsonArray(emptyList()),
        "officialIds" to JsonArray(emptyList()),
        "officialSchedulingMode" to JsonPrimitive("NONE"),
        "staffingPriority" to JsonPrimitive("BEST_AVAILABLE_COVERAGE"),
        "officialPositions" to JsonArray(emptyList()),
        "eventOfficials" to JsonArray(emptyList()),
        "matchRulesOverride" to JsonNull,
        "autoCreatePointMatchIncidents" to JsonPrimitive(false),
        "resolvedMatchRules" to JsonNull,
        "cancellationRefundHours" to JsonNull,
        "registrationCutoffHours" to JsonNull,
        "seedColor" to JsonNull,
        "eventType" to JsonPrimitive("LEAGUE"),
        "sportIds" to JsonArray(emptyList()),
        "leagueScoringConfigId" to JsonNull,
        "organizationId" to JsonNull,
        "requiredTemplateIds" to JsonArray(emptyList()),
        "allowPaymentPlans" to JsonPrimitive(false),
        "installmentCount" to JsonPrimitive(0),
        "installmentDueDates" to JsonArray(emptyList()),
        "installmentDueRelativeDays" to JsonArray(emptyList()),
        "installmentAmounts" to JsonArray(emptyList()),
        "allowTeamSplitDefault" to JsonPrimitive(false),
        "splitLeaguePlayoffDivisions" to JsonPrimitive(false),
        "divisions" to JsonArray(emptyList()),
        "divisionDetails" to JsonArray(emptyList()),
        "playoffDivisionDetails" to JsonArray(emptyList()),
        "fields" to JsonArray(emptyList()),
        "teams" to JsonArray(emptyList()),
        "timeSlots" to JsonArray(emptyList()),
        "officials" to JsonArray(emptyList()),
    ).onlyMaintenanceGraphEventKeys()
    val graphMatches = JsonArray(
        graph.getValue("matches").jsonArray.map(::canonicalMaintenanceGraphMatch),
    )
    val canonicalGraph = JsonObject(graph.toMutableMap().apply {
        this["event"] = graphEvent
        this["matches"] = graphMatches
    })
    val binding = value.getValue("revisionBinding").jsonObject.withMissing(
        "staffRevision" to JsonNull,
        "rentalBookingRevision" to JsonNull,
        "rentalBookingRevisions" to JsonObject(emptyMap()),
        "rentalBookingItemRevisions" to JsonObject(emptyMap()),
    )
    val outcome = value.getValue("scheduleOutcome").jsonObject
    val canonicalOutcome = JsonObject(outcome.toMutableMap().apply {
        this["matches"] = JsonArray(
            outcome.getValue("matches").jsonArray.map(::canonicalMaintenanceProjectionMatch),
        )
        this["unscheduledMatches"] = JsonArray(emptyList())
        this["affectedCompetitionPhases"] = JsonArray(emptyList())
        this["warnings"] = JsonArray(emptyList())
    })
    return JsonObject(value.toMutableMap().apply {
        this["revisionBinding"] = binding
        this["graph"] = canonicalGraph
        this["scheduleOutcome"] = canonicalOutcome
    })
}

private fun canonicalMaintenanceGraphMatch(value: JsonElement): JsonElement =
    value.jsonObject.withMissing(
        "matchId" to JsonPrimitive(1),
        "start" to JsonNull,
        "end" to JsonNull,
        "locked" to JsonPrimitive(false),
        "phase" to JsonPrimitive("POOL"),
        "sourceDivisionId" to JsonNull,
        "phaseDivisionId" to JsonPrimitive("phase-1"),
        "division" to JsonNull,
        "fieldId" to JsonPrimitive("field-1"),
        "team1Id" to JsonNull,
        "team2Id" to JsonNull,
        "team1Seed" to JsonNull,
        "team2Seed" to JsonNull,
        "status" to JsonPrimitive("SCHEDULED"),
        "resultStatus" to JsonPrimitive("PENDING"),
        "resultType" to JsonPrimitive("NONE"),
        "actualStart" to JsonNull,
        "actualEnd" to JsonNull,
        "statusReason" to JsonNull,
        "winnerEventTeamId" to JsonNull,
        "matchRulesSnapshot" to JsonNull,
        "resolvedMatchRules" to JsonNull,
        "segments" to JsonArray(emptyList()),
        "incidents" to JsonArray(emptyList()),
        "officialIds" to JsonArray(emptyList()),
        "officialAssignments" to JsonArray(emptyList()),
        "teamOfficialId" to JsonNull,
        "teamOfficialSeed" to JsonNull,
        "team1Points" to JsonArray(emptyList()),
        "team2Points" to JsonArray(emptyList()),
        "losersBracket" to JsonPrimitive(false),
        "winnerNextMatchId" to JsonNull,
        "loserNextMatchId" to JsonNull,
        "previousLeftId" to JsonNull,
        "previousRightId" to JsonNull,
        "side" to JsonNull,
        "officialCheckedIn" to JsonPrimitive(false),
        "team1" to JsonNull,
        "team2" to JsonNull,
        "teamOfficial" to JsonNull,
        "official" to JsonNull,
        "field" to JsonNull,
    ).onlyMaintenanceGraphMatchKeys()

private fun canonicalMaintenanceProjectionMatch(value: JsonElement): JsonElement =
    value.jsonObject.withMissing(
        "matchId" to JsonPrimitive(1),
        "start" to JsonNull,
        "end" to JsonNull,
        "locked" to JsonPrimitive(false),
        "placementState" to JsonPrimitive("PLACED"),
        "phase" to JsonPrimitive("POOL"),
        "sourceDivisionId" to JsonNull,
        "phaseDivisionId" to JsonPrimitive("phase-1"),
        "division" to JsonNull,
        "fieldId" to JsonPrimitive("field-1"),
        "team1Id" to JsonNull,
        "team2Id" to JsonNull,
        "team1Seed" to JsonNull,
        "team2Seed" to JsonNull,
        "status" to JsonPrimitive("SCHEDULED"),
        "resultStatus" to JsonPrimitive("PENDING"),
        "resultType" to JsonPrimitive("NONE"),
        "actualStart" to JsonNull,
        "actualEnd" to JsonNull,
        "statusReason" to JsonNull,
        "winnerEventTeamId" to JsonNull,
        "matchRulesSnapshot" to JsonNull,
        "resolvedMatchRules" to JsonNull,
        "segments" to JsonArray(emptyList()),
        "incidents" to JsonArray(emptyList()),
        "officialId" to JsonNull,
        "officialIds" to JsonArray(emptyList()),
        "teamOfficialId" to JsonNull,
        "team1Points" to JsonArray(emptyList()),
        "team2Points" to JsonArray(emptyList()),
        "losersBracket" to JsonPrimitive(false),
        "winnerNextMatchId" to JsonNull,
        "loserNextMatchId" to JsonNull,
        "previousLeftId" to JsonNull,
        "previousRightId" to JsonNull,
        "side" to JsonNull,
        "officialCheckedIn" to JsonPrimitive(false),
    )

private fun JsonObject.withMissing(vararg fields: Pair<String, JsonElement>): JsonObject {
    val result = toMutableMap()
    fields.forEach { (key, field) ->
        if (!result.containsKey(key)) {
            result[key] = field
        }
    }
    return JsonObject(result)
}
private fun JsonObject.onlyMaintenanceGraphEventKeys(): JsonObject =
    JsonObject(
        filterKeys {
            it in setOf(
                "id", "name", "description", "start", "end", "location", "coordinates", "price",
                "minAge", "maxAge", "rating", "imageId", "hostId", "noFixedEndDateTime",
                "scheduleEndConstraint", "generatedScheduleEnd", "state", "maxParticipants",
                "teamSizeLimit", "restTimeMinutes", "teamSignup", "singleDivision", "waitListIds",
                "freeAgentIds", "teamIds", "userIds", "fieldIds", "timeSlotIds", "officialIds",
                "officialSchedulingMode", "staffingPriority", "officialPositions", "eventOfficials",
                "matchRulesOverride", "autoCreatePointMatchIncidents", "resolvedMatchRules",
                "cancellationRefundHours", "registrationCutoffHours", "seedColor", "eventType",
                "sportIds", "leagueScoringConfigId", "organizationId", "requiredTemplateIds",
                "allowPaymentPlans", "installmentCount", "installmentDueDates",
                "installmentDueRelativeDays", "installmentAmounts", "allowTeamSplitDefault",
                "splitLeaguePlayoffDivisions", "divisions", "divisionDetails",
                "playoffDivisionDetails", "fields", "teams", "timeSlots", "officials",
                "doubleElimination", "winnerSetCount", "loserSetCount",
                "winnerBracketPointsToVictory", "loserBracketPointsToVictory", "prize",
                "fieldCount", "matches", "usesSets", "matchDurationMinutes", "setDurationMinutes",
                "setsPerMatch", "doTeamsOfficiate", "teamOfficialsMaySwap", "teamCheckInMode",
                "teamCheckInOpenMinutesBefore", "allowMatchRosterEdits", "allowTemporaryMatchPlayers",
                "gamesPerOpponent", "includePlayoffs", "playoffTeamCount", "pointsToVictory",
            )
        },
    )

private fun JsonObject.onlyMaintenanceGraphMatchKeys(): JsonObject =
    JsonObject(
        filterKeys {
            it in setOf(
                "id", "matchId", "eventId", "start", "end", "locked", "placementState",
                "phase", "sourceDivisionId", "phaseDivisionId", "division", "fieldId",
                "team1Id", "team2Id", "team1Seed", "team2Seed", "status", "resultStatus",
                "resultType", "actualStart", "actualEnd", "statusReason", "winnerEventTeamId",
                "matchRulesSnapshot", "resolvedMatchRules", "segments", "incidents", "officialIds",
                "officialAssignments", "teamOfficialId", "teamOfficialSeed", "team1Points",
                "team2Points", "losersBracket", "winnerNextMatchId", "loserNextMatchId",
                "previousLeftId", "previousRightId", "side", "officialCheckedIn", "team1",
                "team2", "teamOfficial", "official", "field",
            )
        },
    )
