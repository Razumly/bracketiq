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
import com.razumly.mvp.core.network.dto.EventEditorSaveResultDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorScheduleStateDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleDto
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.dto.EventEditorStaffDto
import com.razumly.mvp.core.network.dto.EventEditorStaffInviteDto
import com.razumly.mvp.core.network.dto.EventEditorTagDto
import com.razumly.mvp.core.network.dto.EventEditorTimeSlotDto
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
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull

class EventEditorRemoteGatewayTest {
    @Test
    fun create_sends_editor_wire_tree_with_required_nulls_and_strict_nested_rows() = runTest {
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

        assertEquals("SAVED", result.status)
        assertEquals("create-operation-1", body.getValue("createOperationId").jsonPrimitive.content)
        assertEquals(JsonNull, basics.getValue("parentEvent"))
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
}

private object GatewayTestTokenStore : AuthTokenStore {
    override suspend fun get(): String = "session-token"
    override suspend fun set(token: String) = Unit
    override suspend fun clear() = Unit
}

private fun editorCreateCommand(): EventEditorCreateCommandDto = EventEditorCreateCommandDto(
    contractVersion = 3,
    createOperationId = "create-operation-1",
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
            officialSchedulingMode = "SCHEDULE",
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
