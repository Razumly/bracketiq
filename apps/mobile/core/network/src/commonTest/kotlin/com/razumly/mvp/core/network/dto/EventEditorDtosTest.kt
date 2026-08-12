package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class EventEditorDtosTest {
    @Test
    fun create_command_decodes_with_operation_identity_and_nested_state() {
        val command = jsonMVP.decodeFromString<EventEditorCreateCommandDto>(
            """
                {
                  "contractVersion": 2,
                  "createOperationId": "create-operation-1",
                  "draft": {
                    "basics": {
                      "name": "Canonical event",
                      "description": "Description",
                      "eventType": "LEAGUE",
                      "sportIds": ["sport-1"],
                      "start": "2026-09-01T10:00:00Z",
                      "timeZone": "UTC",
                      "location": "Main venue",
                      "address": "1 Main Street",
                      "coordinates": [-73.0, 40.0],
                      "affiliateUrl": "",
                      "parentEvent": null,
                      "organizationId": null,
                      "hostId": "host-1",
                      "state": "UNPUBLISHED",
                      "imageId": null,
                      "tags": [{"${'$'}id":"tag-1","slug":"summer","name":"Summer"}]
                    },
                    "participation": {
                      "teamSignup": true,
                      "singleDivision": false,
                      "registrationByDivisionType": true,
                      "teamSizeLimit": 2,
                      "maxParticipants": 64,
                      "minAge": null,
                      "maxAge": null,
                      "cancellationRefundHours": null,
                      "registrationCutoffHours": 12,
                      "allowTeamSplitDefault": true,
                      "waitListIds": [],
                      "freeAgentIds": []
                    },
                    "registration": {
                      "payment": {
                        "mode":"FREE",
                        "priceCents":0,
                        "taxHandling":"INCLUSIVE",
                        "organizerManualTaxRateBps":0,
                        "manualPaymentInstructions":null,
                        "manualPaymentLinks":[],
                        "allowPaymentPlans":false,
                        "installmentCount":null,
                        "installmentDueDates":[],
                        "installmentDueRelativeDays":[],
                        "installmentAmounts":[]
                      },
                      "questions":[{"clientId":"question-client-1","prompt":"Preferred side?","answerType":"TEXT","required":true,"sortOrder":0},{"id":"question-1","prompt":"Existing answer?","answerType":"LONG_TEXT","required":false,"sortOrder":1}],
                      "requiredDocumentIds":[]
                    },
                    "competition": {
                      "divisionIds":[],
                      "divisionDetails":[],
                      "playoffDivisionDetails":[],
                      "divisionFieldIds":{},
                      "winnerSetCount":null,
                      "loserSetCount":null,
                      "doubleElimination":false,
                      "includePlayoffs":false,
                      "splitLeaguePlayoffDivisions":false,
                      "playoffTeamCount":null,
                      "pointsToVictory":[],
                      "winnerBracketPointsToVictory":[],
                      "loserBracketPointsToVictory":[],
                      "usesSets":false,
                      "setsPerMatch":null,
                      "setDurationMinutes":null,
                      "restTimeMinutes":null,
                      "matchDurationMinutes":null,
                      "gamesPerOpponent":null,
                      "matchRulesOverride":null,
                      "leagueScoringConfig":null
                    },
                    "schedule":{"mode":"FIXED_END","endConstraint":"2026-09-01T14:00:00Z"},
                    "resources":{"fieldIds":[],"fields":[],"timeSlotIds":[],"timeSlots":[],"requiredTemplateIds":[],"immutableFieldIds":[],"rentalBookingId":null,"rentalBookingItemId":null},
                    "staff": {
                      "officialSchedulingMode":"SCHEDULE",
                      "teamOfficialsMaySwap":false,
                      "teamCheckInMode":"OFF",
                      "teamCheckInOpenMinutesBefore":0,
                      "allowMatchRosterEdits":false,
                      "allowTemporaryMatchPlayers":false,
                      "autoCreatePointMatchIncidents":false,
                      "officialIds":[],
                      "officialPositions":[],
                      "eventOfficials":[],
                      "assistantHostIds":[],
                      "pendingInvites":[]
                    }
                  }
                }
            """.trimIndent(),
        )

        assertEquals(EVENT_EDITOR_CONTRACT_VERSION, command.contractVersion)
        assertEquals("create-operation-1", command.createOperationId)
        assertEquals("question-client-1", command.draft.registration.questions.first().clientId)
        assertEquals("tag-1", command.draft.basics.tags.single().legacyId)
        val wire = encodeEventEditorCreateCommand(command)
        val wireDraft = wire.getValue("draft").jsonObject
        val wireBasics = wireDraft.getValue("basics").jsonObject
        val wireRegistration = wireDraft.getValue("registration").jsonObject
        val wireCompetition = wireDraft.getValue("competition").jsonObject
        val wireSchedule = wireDraft.getValue("schedule").jsonObject
        val wireResources = wireDraft.getValue("resources").jsonObject

        assertEquals(JsonNull, wireBasics.getValue("parentEvent"))
        assertEquals(JsonNull, wireBasics.getValue("organizationId"))
        assertEquals(JsonNull, wireBasics.getValue("imageId"))
        assertEquals(JsonNull, wireDraft.getValue("participation").jsonObject.getValue("minAge"))
        assertEquals(JsonNull, wireRegistration.getValue("payment").jsonObject.getValue("manualPaymentInstructions"))
        assertEquals(JsonNull, wireCompetition.getValue("matchRulesOverride"))
        assertEquals(JsonNull, wireResources.getValue("rentalBookingId"))
        assertFalse(wireSchedule.containsKey("generatedScheduleEnd"))

        val wireQuestions = wireRegistration.getValue("questions").jsonArray
        assertTrue(wireQuestions[0].jsonObject.containsKey("clientId"))
        assertFalse(wireQuestions[0].jsonObject.containsKey("id"))
        assertTrue(wireQuestions[1].jsonObject.containsKey("id"))
        assertFalse(wireQuestions[1].jsonObject.containsKey("clientId"))
        assertTrue(wire.toString().isNotBlank())
    }

    @Test
    fun bootstrap_query_and_error_round_trip_preserve_wire_fields() {
        val query = EventEditorBootstrapQueryDto(
            organizationId = "org-1",
            eventType = "LEAGUE",
            sportId = "sport-1",
            parentEventId = "parent-1",
            templateId = "template-1",
            rentalBookingId = "booking-1",
            start = "2026-09-01T10:00:00Z",
        )
        val queryRoundTrip = jsonMVP.decodeFromString<EventEditorBootstrapQueryDto>(
            jsonMVP.encodeToString(query),
        )
        val error = jsonMVP.decodeFromString<EventEditorErrorDto>(
            """
                {
                  "error":"Create operation already belongs to another command.",
                  "code":"CREATE_OPERATION_CONFLICT",
                  "field":"createOperationId",
                  "editorRevision":"revision-1",
                  "staffRevision":"staff-revision-1",
                  "requestId":"request-1",
                  "details":{"operationId":"create-operation-1"}
                }
            """.trimIndent(),
        )

        assertEquals(query, queryRoundTrip)
        assertEquals("CREATE_OPERATION_CONFLICT", error.code)
        assertEquals("createOperationId", error.field)
        assertNotNull(error.details)
        assertEquals("request-1", error.requestId)
    }
}
