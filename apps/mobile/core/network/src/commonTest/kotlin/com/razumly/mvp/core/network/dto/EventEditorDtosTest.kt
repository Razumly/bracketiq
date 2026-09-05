package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class EventEditorDtosTest {
    @Test
    fun given_editor_command_json_when_decoded_then_operation_identity_and_nested_state_round_trip() {
        val command = jsonMVP.decodeFromString<EventEditorCreateCommandDto>(
            """
                {
                  "contractVersion": 3,
                  "createOperationId": "create-operation-1",
                  "expectedRevisions": {
                    "editorRevision": "editor-revision-1",
                    "staffRevision": null,
                    "scheduleRevision": "schedule-revision-1"
                  },
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
                      "divisionDetails":[{
                        "id":"regular-1",
                        "key":"regular",
                        "name":"Regular",
                        "kind":"LEAGUE",
                        "divisionTypeId":"regular-type",
                        "skillDivisionTypeId":"regular-skill",
                        "ageDivisionTypeId":"regular-age",
                        "divisionTypeName":"Regular",
                        "ratingType":"NONE"
                      }],
                      "playoffDivisionDetails":[{
                        "id":"playoff-1",
                        "key":"playoff",
                        "name":"Playoff",
                        "kind":"PLAYOFF",
                        "divisionTypeId":"playoff-type",
                        "skillDivisionTypeId":"playoff-skill",
                        "ageDivisionTypeId":"playoff-age",
                        "divisionTypeName":"Playoff",
                        "ratingType":"NONE",
                        "price":null,
                        "playoffConfig":null
                      }],
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
                    "schedule":{"mode":"FIXED_END","endConstraint":"2026-09-01T14:00:00Z","automatedScheduling":true},
                    "resources":{"fieldIds":[],"fields":[],"timeSlotIds":[],"timeSlots":[],"requiredTemplateIds":[],"immutableFieldIds":[],"rentalBookingId":null,"rentalBookingItemId":null},
                    "staff": {
                      "staffingPriority":"BEST_AVAILABLE_COVERAGE",
                      "doTeamsOfficiate":false,
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
                  },
                  "completion":{"mode":"CREATE_AND_BUILD_SCHEDULE"}
                }
            """.trimIndent(),
        )

        assertEquals(EVENT_EDITOR_LEGACY_CONTRACT_VERSION, command.contractVersion)
        assertEquals("create-operation-1", command.createOperationId)
        assertEquals("editor-revision-1", command.expectedRevisions.editorRevision)
        assertEquals(null, command.expectedRevisions.staffRevision)
        assertEquals("schedule-revision-1", command.expectedRevisions.scheduleRevision)
        assertEquals(
            EventEditorCreateCompletionMode.CREATE_AND_BUILD_SCHEDULE,
            command.completion.mode,
        )
        assertEquals(true, command.draft.schedule.isAutomatedScheduling)
        assertEquals("question-client-1", command.draft.registration.questions.first().clientId)
        assertEquals("tag-1", command.draft.basics.tags.single().legacyId)
        val wire = encodeEventEditorCreateCommand(command)
        val weeklyWire = encodeEventEditorCreateCommand(
            command.copy(
                draft = command.draft.copy(
                    basics = command.draft.basics.copy(eventType = "WEEKLY_EVENT"),
                ),
            ),
        )
        assertFalse(weeklyWire.containsKey("hasScheduleProposalSupport"))
        val wireExpectedRevisions = wire.getValue("expectedRevisions").jsonObject
        assertEquals("editor-revision-1", wireExpectedRevisions.getValue("editorRevision").jsonPrimitive.content)
        assertEquals(JsonNull, wireExpectedRevisions.getValue("staffRevision"))
        assertEquals("schedule-revision-1", wireExpectedRevisions.getValue("scheduleRevision").jsonPrimitive.content)
        val wireDraft = wire.getValue("draft").jsonObject
        val wireBasics = wireDraft.getValue("basics").jsonObject
        val wireRegistration = wireDraft.getValue("registration").jsonObject
        val wireCompetition = wireDraft.getValue("competition").jsonObject
        val wireRegularDetail =
            wireCompetition.getValue("divisionDetails").jsonArray.single().jsonObject
        assertFalse(wireRegularDetail.containsKey("playoffConfig"))

        val wirePlayoffDetail =
            wireCompetition.getValue("playoffDivisionDetails").jsonArray.single().jsonObject
        assertEquals(JsonNull, wirePlayoffDetail.getValue("playoffConfig"))
        assertFalse(wirePlayoffDetail.containsKey("price"))
        val explicitClearCommand = command.copy(
            draft = command.draft.copy(
                competition = command.draft.competition.copy(
                    divisionDetails = command.draft.competition.divisionDetails.map { detail ->
                        detail.copy(playoffConfigPresent = true)
                    },
                ),
            ),
        )
        val explicitClearDetail = encodeEventEditorCreateCommand(explicitClearCommand)
            .getValue("draft")
            .jsonObject
            .getValue("competition")
            .jsonObject
            .getValue("divisionDetails")
            .jsonArray
            .single()
            .jsonObject
        assertEquals(JsonNull, explicitClearDetail.getValue("playoffConfig"))
        assertFalse(explicitClearDetail.containsKey("__playoffConfigPresent"))

        val saveWire = encodeEventEditorSaveCommand(
            EventEditorSaveCommandDto(
                contractVersion = command.contractVersion,
                editorRevision = "editor-revision-1",
                draft = command.draft,
                scheduleTransition = EventEditorSaveScheduleTransitionDto(
                    mode = EventEditorScheduleTransitionMode.PRESERVE,
                ),
            ),
        )
        val savePlayoffDetail = saveWire
            .getValue("draft")
            .jsonObject
            .getValue("competition")
            .jsonObject
            .getValue("playoffDivisionDetails")
            .jsonArray
            .single()
            .jsonObject
        assertEquals(JsonNull, savePlayoffDetail.getValue("playoffConfig"))
        assertFalse(savePlayoffDetail.containsKey("price"))
        val wireSchedule = wireDraft.getValue("schedule").jsonObject
        assertEquals(true, wireSchedule.getValue("automatedScheduling").toString().toBoolean())
        assertFalse(wireSchedule.containsKey("isAutomatedScheduling"))
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
    fun given_bootstrap_query_and_error_json_when_round_tripped_then_wire_fields_are_preserved() {
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
                  "scheduleRevision":"schedule-revision-1",
                  "slotIds":["slot-1"],
                  "occurrenceDate":"2026-09-01",
                  "divisionId":"division-1",
                  "matchCount":2,
                  "capacity":8,
                  "participantCount":8,
                  "requestId":"request-1",
                  "details":{"operationId":"create-operation-1"}
                }
            """.trimIndent(),
        )

        assertEquals(query, queryRoundTrip)
        assertEquals("CREATE_OPERATION_CONFLICT", error.code)
        assertEquals("createOperationId", error.field)
        assertEquals("schedule-revision-1", error.scheduleRevision)
        assertEquals(listOf("slot-1"), error.slotIds)
        assertEquals("2026-09-01", error.occurrenceDate)
        assertEquals("division-1", error.divisionId)
        assertEquals(2, error.matchCount)
        assertEquals(8, error.capacity)
        assertEquals(8, error.participantCount)
        assertNotNull(error.details)
        assertEquals("request-1", error.requestId)
    }
    @Test
    fun given_partial_schedule_outcome_when_decoded_then_exact_incomplete_graph_metadata_is_preserved() {
        val outcome = jsonMVP.decodeFromString<EventEditorScheduleOutcomeDto>(
            """
            {
              "status":"PARTIAL",
              "isComplete":false,
              "matchCount":2,
              "placedMatchCount":1,
              "unplacedMatchCount":1,
              "matches":[
                {"id":"match-1","eventId":"event-1","placementState":"PLACED","start":"2026-09-01T10:00:00Z","end":"2026-09-01T11:00:00Z","fieldId":"field-1"},
                {"id":"match-2","eventId":"event-1","placementState":"UNPLACED","phase":"PLAYOFF","phaseDivisionId":"phase-1","sourceDivisionId":"source-1"}
              ],
              "unscheduledMatches":[{"id":"match-2","matchId":null,"phaseDivisionId":"phase-1","phase":"PLAYOFF","sourceDivisionId":"source-1"}],
              "affectedCompetitionPhases":[{"id":"phase-1","name":"Playoff","phase":"PLAYOFF","sourceDivisionId":"source-1"}],
              "warnings":[]
            }
            """.trimIndent(),
        )
        assertFalse(outcome.isComplete)
        assertEquals(1, outcome.placedMatchCount)
        assertEquals(1, outcome.unplacedMatchCount)
        assertEquals(listOf("match-2"), outcome.unscheduledMatches.map { it.id })
        assertEquals(listOf("phase-1"), outcome.affectedCompetitionPhases.map { it.id })
        val unplaced = outcome.matches.single { it.id == "match-2" }
        assertEquals("UNPLACED", unplaced.placementState)
        assertEquals("PLAYOFF", unplaced.phase)
        assertEquals("phase-1", unplaced.phaseDivisionId)
        assertEquals("source-1", unplaced.sourceDivisionId)
        assertEquals(null, outcome.unscheduledMatches.single().matchId)
        assertEquals("PLAYOFF", outcome.unscheduledMatches.single().phase)
        assertEquals("source-1", outcome.unscheduledMatches.single().sourceDivisionId)
        assertEquals("Playoff", outcome.affectedCompetitionPhases.single().name)
        assertEquals("PLAYOFF", outcome.affectedCompetitionPhases.single().phase)
        assertEquals("source-1", outcome.affectedCompetitionPhases.single().sourceDivisionId)
    }
    @Test
    fun given_maintenance_operations_when_json_decoded_then_v3_values_are_preserved() {
        val decoded = listOf("BUILD", "COMPLETE", "REBUILD").map { operation ->
            jsonMVP.decodeFromString<EventEditorMaintenanceRequestDto>(
                """
                    {
                      "contractVersion": 3,
                      "eventId": "event-1",
                      "operation": "$operation",
                      "operationId": "operation-$operation"
                    }
                """.trimIndent(),
            )
        }

        assertEquals(
            listOf(
                EventEditorMaintenanceOperation.BUILD,
                EventEditorMaintenanceOperation.COMPLETE,
                EventEditorMaintenanceOperation.REBUILD,
            ),
            decoded.map(EventEditorMaintenanceRequestDto::operation),
        )
        assertEquals(
            listOf(
                EVENT_EDITOR_LEGACY_CONTRACT_VERSION,
                EVENT_EDITOR_LEGACY_CONTRACT_VERSION,
                EVENT_EDITOR_LEGACY_CONTRACT_VERSION,
            ),
            decoded.map(EventEditorMaintenanceRequestDto::contractVersion),
        )
    }

    @Test
    fun given_editor_snapshot_json_when_decoded_then_available_maintenance_operations_are_preserved() {
        val snapshot = EventEditorSnapshotDto(
            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
            draft = EventEditorDraftDto(
                basics = EventEditorBasicsDto(
                    name = "Maintenance event",
                    description = "",
                    eventType = "LEAGUE",
                    start = "2026-09-01T10:00:00Z",
                    timeZone = "UTC",
                    location = "",
                    address = "",
                    affiliateUrl = "",
                    state = "PUBLISHED",
                ),
                participation = EventEditorParticipationDto(
                    teamSignup = true,
                    singleDivision = true,
                    registrationByDivisionType = false,
                    registrationCutoffHours = 0,
                    allowTeamSplitDefault = false,
                ),
                registration = EventEditorRegistrationDto(
                    payment = EventEditorPaymentDto(
                        mode = "FREE",
                        priceCents = 0,
                        taxHandling = "INCLUSIVE",
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
                schedule = EventEditorScheduleDto(mode = "FIXED_END"),
                resources = EventEditorResourcesDto(),
                staff = EventEditorStaffDto(
                    teamCheckInMode = "OFF",
                    teamCheckInOpenMinutesBefore = 0,
                    allowMatchRosterEdits = false,
                    allowTemporaryMatchPlayers = false,
                    autoCreatePointMatchIncidents = false,
                ),
            ),
            mode = "EDIT",
            eventId = "event-1",
            editorRevision = "editor-revision-1",
            capabilities = EventEditorCapabilitiesDto(
                canUseOnlinePayments = true,
                canManageStaff = true,
                canEdit = true,
                supportsTeamStaffing = true,
            ),
            catalogs = EventEditorCatalogsDto(),
            immutable = EventEditorImmutableDto(),
            scheduleState = EventEditorScheduleStateDto(
                sourceType = "GENERATED",
                matchCount = 4,
                revision = "schedule-revision-1",
                hasProtectedHistory = true,
                availableMaintenanceOperations = listOf(
                    EventEditorMaintenanceOperation.BUILD,
                    EventEditorMaintenanceOperation.COMPLETE,
                    EventEditorMaintenanceOperation.REBUILD,
                ),
            ),
            revisionBinding = EventEditorRevisionBindingDto(
                editorRevision = "binding-editor-revision-1",
                staffRevision = "binding-staff-revision-1",
                scheduleRevision = "binding-schedule-revision-1",
                fieldRevisions = mapOf("field-1" to "field-revision-1"),
                timeSlotRevisions = mapOf("slot-1" to "slot-revision-1"),
                rentalBookingRevision = "booking-revision-1",
                rentalBookingRevisions = mapOf("booking-1" to "booking-revision-1"),
                rentalBookingItemRevisions = mapOf("item-1" to "item-revision-1"),
                availabilityRevision = "availability-revision-1",
            ),
        )
        val decoded = jsonMVP.decodeFromString<EventEditorSnapshotDto>(
            jsonMVP.encodeToString(snapshot),
        )

        assertEquals(snapshot, decoded)
        assertEquals(
            listOf(
                EventEditorMaintenanceOperation.BUILD,
                EventEditorMaintenanceOperation.COMPLETE,
                EventEditorMaintenanceOperation.REBUILD,
            ),
            decoded.scheduleState.availableMaintenanceOperations,
        )
        assertTrue(decoded.scheduleState.hasProtectedHistory)
        val legacyJson = JsonObject(
            jsonMVP.encodeToJsonElement(snapshot).jsonObject.toMutableMap().apply {
                remove("revisionBinding")
            },
        )
        val decodedLegacy = jsonMVP.decodeFromJsonElement<EventEditorSnapshotDto>(legacyJson)
        assertEquals(null, decodedLegacy.revisionBinding)
    }

    @Test
    fun given_complete_maintenance_outcome_json_when_decoded_then_placed_graph_and_warning_are_preserved() {
        val outcome = jsonMVP.decodeFromString<EventEditorMaintenanceScheduleOutcomeDto>(
            """
            {
              "status": "COMPLETE",
              "isComplete": true,
              "matchCount": 1,
              "placedMatchCount": 1,
              "unplacedMatchCount": 0,
              "matches": [
                {
                  "id": "match-placed",
                  "matchId": 10,
                  "eventId": "event-1",
                  "start": "2026-09-01T10:00:00Z",
                  "end": "2026-09-01T11:00:00Z",
                  "placementState": "PLACED",
                  "fieldId": "field-1"
                }
              ],
              "unscheduledMatches": [],
              "affectedCompetitionPhases": [],
              "warnings": [
                {
                  "code": "RESOURCE_LIMIT",
                  "message": "One resource limited concurrency.",
                  "matchIds": ["match-placed"],
                  "restrictingFactor": "RESOURCE"
                }
              ]
            }
            """.trimIndent(),
        )

        assertEquals(EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE, outcome.status)
        assertTrue(outcome.isComplete)
        assertEquals(1, outcome.matchCount)
        assertEquals(1, outcome.placedMatchCount)
        assertEquals(0, outcome.unplacedMatchCount)
        assertEquals(listOf("match-placed"), outcome.matches.map(EventEditorMatchProjectionDto::id))
        assertEquals("RESOURCE", outcome.warnings.single().restrictingFactor)
        assertEquals(listOf("match-placed"), outcome.warnings.single().matchIds)
    }

    @Test
    fun given_incomplete_maintenance_outcome_json_when_decoded_then_unscheduled_phases_and_warnings_are_preserved() {
        val outcome = jsonMVP.decodeFromString<EventEditorMaintenanceScheduleOutcomeDto>(
            """
            {
              "status": "INCOMPLETE",
              "isComplete": false,
              "matchCount": 2,
              "placedMatchCount": 1,
              "unplacedMatchCount": 1,
              "matches": [
                {
                  "id": "match-placed",
                  "matchId": 10,
                  "eventId": "event-1",
                  "start": "2026-09-01T10:00:00Z",
                  "end": "2026-09-01T11:00:00Z",
                  "placementState": "PLACED",
                  "fieldId": "field-1"
                },
                {
                  "id": "match-unplaced",
                  "matchId": 11,
                  "eventId": "event-1",
                  "placementState": "UNPLACED",
                  "phase": "PLAYOFF",
                  "phaseDivisionId": "phase-1",
                  "sourceDivisionId": "source-1"
                }
              ],
              "unscheduledMatches": [
                {
                  "id": "match-unplaced",
                  "matchId": 11,
                  "phaseDivisionId": "phase-1",
                  "phase": "PLAYOFF",
                  "sourceDivisionId": "source-1"
                }
              ],
              "affectedCompetitionPhases": [
                {
                  "id": "phase-1",
                  "name": "Playoff",
                  "phase": "PLAYOFF",
                  "sourceDivisionId": "source-1"
                }
              ],
              "warnings": [
                {
                  "code": "OFFICIAL_LIMIT",
                  "message": "A named official limited concurrency.",
                  "matchIds": ["match-unplaced"],
                  "restrictingFactor": "NAMED_OFFICIAL_POSITION"
                }
              ]
            }
            """.trimIndent(),
        )

        assertEquals(EventEditorMaintenanceScheduleOutcomeStatus.INCOMPLETE, outcome.status)
        assertFalse(outcome.isComplete)
        assertEquals(1, outcome.placedMatchCount)
        assertEquals(1, outcome.unplacedMatchCount)
        assertEquals(listOf("match-unplaced"), outcome.unscheduledMatches.map { it.id })
        assertEquals(listOf("phase-1"), outcome.affectedCompetitionPhases.map { it.id })
        assertEquals("NAMED_OFFICIAL_POSITION", outcome.warnings.single().restrictingFactor)
        assertEquals(11, outcome.unscheduledMatches.single().matchId)
    }

    @Test
    fun given_maintenance_proposal_json_when_decoded_then_graph_protected_ids_and_revision_binding_are_preserved() {
        val proposal = jsonMVP.decodeFromString<EventEditorMaintenanceProposalDto>(
            """
            {
              "status": "PROPOSED",
              "contractVersion": 3,
              "eventId": "event-1",
              "operation": "REBUILD",
              "operationId": "operation-rebuild-1",
              "proposalRevision": "proposal-revision-1",
              "revisionBinding": {
                "editorRevision": "editor-revision-1",
                "staffRevision": "staff-revision-1",
                "scheduleRevision": "schedule-revision-1",
                "fieldRevisions": {"field-1": "field-revision-1"},
                "timeSlotRevisions": {"slot-1": "slot-revision-1"},
                "rentalBookingRevision": "booking-revision-1",
                "rentalBookingRevisions": {},
                "rentalBookingItemRevisions": {},
                "availabilityRevision": "availability-revision-1"
              },
              "graph": {
                "event": {
                  "id": "event-1",
                  "name": "Event",
                  "description": "Graph event",
                  "start": "2026-09-01T10:00:00Z",
                  "end": "2026-09-01T12:00:00Z",
                  "location": "Main venue",
                  "coordinates": null,
                  "price": null,
                  "minAge": null,
                  "maxAge": null,
                  "rating": null,
                  "imageId": null,
                  "hostId": "host-1",
                  "noFixedEndDateTime": false,
                  "scheduleEndConstraint": null,
                  "generatedScheduleEnd": null,
                  "state": "PUBLISHED",
                  "maxParticipants": 32,
                  "teamSizeLimit": 2,
                  "restTimeMinutes": 10,
                  "teamSignup": true,
                  "singleDivision": false,
                  "waitListIds": [],
                  "freeAgentIds": [],
                  "teamIds": ["team-1"],
                  "userIds": ["user-1"],
                  "fieldIds": ["field-1"],
                  "timeSlotIds": ["slot-1"],
                  "officialIds": ["user-1"],
                  "officialSchedulingMode": "SCHEDULE",
                  "staffingPriority": "BEST_AVAILABLE_COVERAGE",
                  "officialPositions": [
                    {"id":"position-referee","name":"Referee","count":1,"order":0}
                  ],
                  "eventOfficials": [
                    {"id":"event-official-1","userId":"user-1","positionIds":["position-referee"],"fieldIds":["field-1"],"isActive":true}
                  ],
                  "matchRulesOverride": null,
                  "autoCreatePointMatchIncidents": false,
                  "resolvedMatchRules": null,
                  "cancellationRefundHours": null,
                  "registrationCutoffHours": 12,
                  "seedColor": null,
                  "eventType": "LEAGUE",
                  "sportIds": ["sport-1"],
                  "leagueScoringConfigId": null,
                  "organizationId": "org-1",
                  "requiredTemplateIds": [],
                  "allowPaymentPlans": false,
                  "installmentCount": 0,
                  "installmentDueDates": [],
                  "installmentDueRelativeDays": [],
                  "installmentAmounts": [],
                  "allowTeamSplitDefault": false,
                  "splitLeaguePlayoffDivisions": false,
                  "divisions": ["division-1"],
                  "divisionDetails": [
                    {
                      "id":"division-1",
                      "name":"Open",
                      "kind":"LEAGUE",
                      "role":"SOURCE",
                      "phase":"LEAGUE",
                      "sourceDivisionId":null,
                      "isSystemGenerated":false,
                      "phaseSettings":{
                        "LEAGUE":{
                          "doTeamsOfficiate":true,
                          "officialPositions":[
                            {"id":"position-referee","name":"Referee","count":1,"order":0}
                          ]
                        }
                      },
                      "teamIds":["team-1"],
                      "playoffTeamCount":4,
                      "playoffPlacementDivisionIds":[],
                      "standingsOverrides":{"team-1":12.5},
                      "standingsConfirmedAt":"2026-09-01T09:00:00Z",
                      "standingsConfirmedBy":"user-1",
                      "playoffConfig":null,
                      "leagueConfig":{
                        "gamesPerOpponent":3,
                        "includePlayoffs":true,
                        "playoffTeamCount":4,
                        "usesSets":true,
                        "matchDurationMinutes":30,
                        "setDurationMinutes":5,
                        "setsPerMatch":3,
                        "pointsToVictory":[21,15],
                        "restTimeMinutes":10
                      }
                    }
                  ],
                  "playoffDivisionDetails": [],
                  "fields": [
                    {"id":"field-1","organizationId":"org-1","divisions":["division-1"],"name":"Court 1"}
                  ],
                  "teams": [],
                  "timeSlots": [],
                  "officials": [
                    {"id":"user-1","firstName":"Alex","lastName":"Official","userName":"alex"}
                  ]
                },
                "matches": [
                  {
                    "id": "match-1",
                    "matchId": 1,
                    "eventId": "event-1",
                    "start": "2026-09-01T10:00:00Z",
                    "end": "2026-09-01T11:00:00Z",
                    "locked": false,
                    "placementState": "PLACED",
                    "phase": "LEAGUE",
                    "sourceDivisionId": "division-1",
                    "phaseDivisionId": "division-1",
                    "division": "division-1",
                    "fieldId": "field-1",
                    "team1Id": null,
                    "team2Id": null,
                    "team1Seed": null,
                    "team2Seed": null,
                    "status": "SCHEDULED",
                    "resultStatus": "PENDING",
                    "resultType": "NONE",
                    "actualStart": null,
                    "actualEnd": null,
                    "statusReason": null,
                    "winnerEventTeamId": null,
                    "segments": [],
                    "incidents": [],
                    "officialIds": [
                      {"positionId":"position-referee","slotIndex":0,"holderType":"OFFICIAL","userId":null,"eventOfficialId":null,"checkedIn":false,"hasConflict":false}
                    ],
                    "officialAssignments": [
                      {"positionId":"position-referee","slotIndex":0,"holderType":"OFFICIAL","userId":null,"eventOfficialId":null,"checkedIn":false,"hasConflict":false},
                      {"positionId":"team-duty","slotIndex":0,"holderType":"PLAYER","userId":null,"eventOfficialId":null,"checkedIn":false,"hasConflict":false}
                    ],
                    "teamOfficialId": null,
                    "teamOfficialSeed": null,
                    "matchRulesSnapshot": null,
                    "resolvedMatchRules": null,
                    "team1Points": [],
                    "team2Points": [],
                    "losersBracket": false,
                    "winnerNextMatchId": null,
                    "loserNextMatchId": null,
                    "previousLeftId": null,
                    "previousRightId": null,
                    "side": null,
                    "officialCheckedIn": false,
                    "team1": null,
                    "team2": null,
                    "teamOfficial": null,
                    "official": null,
                    "field": null
                  }
                ]
              },
              "protectedMatchIds": ["match-protected", "match-locked"],
              "scheduleOutcome": {
                "status": "COMPLETE",
                "isComplete": true,
                "matchCount": 1,
                "placedMatchCount": 1,
                "unplacedMatchCount": 0,
                "matches": [
                  {
                    "id": "match-1",
                    "matchId": 1,
                    "eventId": "event-1",
                    "placementState": "PLACED",
                    "fieldId": "field-1"
                  }
                ],
                "unscheduledMatches": [],
                "affectedCompetitionPhases": [],
                "warnings": []
              }
            }
            """.trimIndent(),
        )

        assertEquals(EventEditorMaintenanceResponseStatus.PROPOSED, proposal.status)
        assertEquals(EventEditorMaintenanceOperation.REBUILD, proposal.operation)
        assertEquals("event-1", proposal.graph.event.id)
        assertEquals(listOf("match-1"), proposal.graph.matches.map { it.id })
        assertEquals(listOf("match-protected", "match-locked"), proposal.protectedMatchIds)
        assertEquals("field-revision-1", proposal.revisionBinding.fieldRevisions.getValue("field-1"))
        assertEquals("availability-revision-1", proposal.revisionBinding.availabilityRevision)
        val canonicalEvent = assertNotNull(proposal.graph.canonicalEvent)
        val canonicalDivision = canonicalEvent.divisionDetails.single()
        assertEquals("SOURCE", canonicalDivision.role)
        assertEquals("LEAGUE", canonicalDivision.phase)
        assertEquals(12.5, canonicalDivision.standingsOverrides?.get("team-1"))
        assertEquals(3, canonicalDivision.leagueConfig?.gamesPerOpponent)
        assertEquals(true, canonicalDivision.leagueConfig?.usesSets)
        assertEquals(30, canonicalDivision.leagueConfig?.matchDurationMinutes)
        val canonicalMatch = proposal.graph.canonicalMatches.single()
        assertEquals(2, canonicalMatch.officialAssignments.size)
        assertEquals("OFFICIAL", canonicalMatch.officialAssignments[0].holderType)
        assertEquals(null, canonicalMatch.officialAssignments[0].userId)
        assertEquals("PLAYER", canonicalMatch.officialAssignments[1].holderType)
        assertEquals(null, canonicalMatch.officialAssignments[1].userId)
    }

    @Test
    fun given_inconsistent_maintenance_outcome_when_constructed_then_counts_and_required_incomplete_fields_are_rejected() {
        assertFailsWith<IllegalArgumentException> {
            EventEditorMaintenanceScheduleOutcomeDto(
                status = EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE,
                isComplete = true,
                matchCount = 1,
                placedMatchCount = 0,
                unplacedMatchCount = 0,
                matches = listOf(maintenanceProjection("match-1", "PLACED")),
                unscheduledMatches = emptyList(),
                affectedCompetitionPhases = emptyList(),
                warnings = emptyList(),
            )
        }

        assertFailsWith<IllegalArgumentException> {
            EventEditorMaintenanceScheduleOutcomeDto(
                status = EventEditorMaintenanceScheduleOutcomeStatus.INCOMPLETE,
                isComplete = false,
                matchCount = 1,
                placedMatchCount = 0,
                unplacedMatchCount = 1,
                matches = listOf(maintenanceProjection("match-1", "UNPLACED")),
                unscheduledMatches = emptyList(),
                affectedCompetitionPhases = emptyList(),
                warnings = emptyList(),
            )
        }
    }

    @Test
    fun given_fractional_maintenance_graph_when_decoded_then_scores_and_canonical_values_are_lossless() {
        val graph = jsonMVP.decodeFromString<EventEditorMaintenanceGraphDto>(
            maintenanceGraphJson(),
        )

        assertEquals(42.5, graph.canonicalEvent?.price)
        assertEquals(listOf(12.5), graph.canonicalMatches.single().team1Points)
        assertEquals(listOf(9.25), graph.canonicalMatches.single().team2Points)
        assertEquals(listOf(12.5), graph.matches.single().team1Points)
        assertEquals(listOf(9.25), graph.matches.single().team2Points)

        val encoded = jsonMVP.parseToJsonElement(jsonMVP.encodeToString(graph)).jsonObject
        assertEquals(
            "42.5",
            encoded.getValue("event").jsonObject.getValue("price").jsonPrimitive.content,
        )
        assertEquals(
            "12.5",
            encoded.getValue("matches").jsonArray.single().jsonObject
                .getValue("team1Points").jsonArray.single().jsonPrimitive.content,
        )
        assertEquals(
            "alternating",
            encoded.getValue("event").jsonObject
                .getValue("matchRulesOverride").jsonObject.getValue("serveOrder").jsonPrimitive.content,
        )
    }

    @Test
    fun given_fractional_maintenance_graph_when_legacy_event_decode_falls_back_then_relations_are_retained() {
        val graph = jsonMVP.decodeFromString<EventEditorMaintenanceGraphDto>(
            maintenanceGraphJson(),
        )
        val event = graph.event

        assertEquals(42, event.price)
        assertEquals(10, event.restTimeMinutes)
        assertEquals(12, event.registrationCutoffHours)
        assertEquals("BEST_AVAILABLE_COVERAGE", event.staffingPriority)
        assertEquals(listOf("division-1"), event.divisions)
        assertEquals(listOf("division-1"), event.divisionDetails?.map { detail -> detail.id })
        assertEquals(listOf("field-1"), event.fields.map { field -> field.id })
        assertEquals(listOf("team-1"), event.teams.map { team -> team.id })
        assertEquals(listOf("slot-1"), event.timeSlots.map { slot -> slot.id })
        assertEquals(listOf("user-1"), event.officials.map { official -> official.id })
        assertEquals(listOf("position-referee"), event.officialPositions?.map { position -> position.id })
        assertEquals(listOf("event-official-1"), event.eventOfficials?.map { official -> official.id })
        assertEquals(listOf("match-1"), event.matches?.map { match -> match.id })
        assertEquals(listOf(12), event.matches?.single()?.team1Points)
        assertEquals(listOf("user-1"), event.teams.single().playerIds)
        assertEquals(listOf("registration-1"), event.teams.single().playerRegistrationIds)
        assertEquals(listOf("division-1"), event.timeSlots.single().divisions)
        assertEquals(listOf("division-1"), event.fields.single().divisions)
    }

    private fun maintenanceGraphJson(): String {
        val user = EventEditorMaintenanceGraphUserDto(
            id = "user-1",
            firstName = "Alex",
            lastName = "Official",
            userName = "alex",
        )
        val registration = EventEditorMaintenanceGraphPlayerRegistrationDto(
            id = "registration-1",
            teamId = "team-1",
            userId = "user-1",
            status = "ACTIVE",
            jerseyNumber = "7",
            position = "Setter",
            isCaptain = true,
        )
        val team = EventEditorMaintenanceGraphTeamDto(
            id = "team-1",
            captainId = "user-1",
            division = "division-1",
            kind = "TEAM",
            name = "Team One",
            playerIds = listOf("user-1"),
            players = listOf(user),
            playerRegistrations = listOf(registration),
        )
        val field = EventEditorMaintenanceGraphFieldDto(
            id = "field-1",
            organizationId = "org-1",
            divisions = listOf("division-1"),
            name = "Court 1",
        )
        val timeSlot = EventEditorMaintenanceGraphTimeSlotDto(
            id = "slot-1",
            dayOfWeek = 1,
            daysOfWeek = listOf(1, 3),
            startDate = "2026-09-01T10:00:00Z",
            endDate = "2026-09-01T12:00:00Z",
            repeating = true,
            startTimeMinutes = 600,
            endTimeMinutes = 720,
            price = 10.5,
            scheduledFieldId = "field-1",
            scheduledFieldIds = listOf("field-1"),
            divisions = listOf("division-1"),
        )
        val position = EventEditorOfficialPositionDto(
            id = "position-referee",
            name = "Referee",
            count = 1,
            order = 0,
        )
        val eventOfficial = EventEditorMaintenanceGraphEventOfficialDto(
            id = "event-official-1",
            userId = "user-1",
            positionIds = listOf(position.id),
            fieldIds = listOf(field.id),
            isActive = true,
        )
        val division = EventEditorMaintenanceGraphDivisionDto(
            id = "division-1",
            name = "Open",
            kind = "LEAGUE",
            role = "SOURCE",
            phase = "LEAGUE",
            sourceDivisionId = null,
            isSystemGenerated = false,
            phaseSettings = mapOf(
                "LEAGUE" to EventEditorMaintenanceGraphPhaseSettingsDto(
                    officialPositions = listOf(position),
                ),
            ),
            teamIds = listOf(team.id),
            playoffTeamCount = 4,
            playoffPlacementDivisionIds = emptyList(),
            standingsOverrides = mapOf(team.id to 12.5),
            standingsConfirmedAt = "2026-09-01T09:00:00Z",
            standingsConfirmedBy = user.id,
            playoffConfig = null,
            leagueConfig = EventEditorMaintenanceGraphLeagueConfigDto(
                gamesPerOpponent = 3,
                includePlayoffs = true,
                playoffTeamCount = 4,
                usesSets = true,
                matchDurationMinutes = 30,
                setDurationMinutes = 5,
                setsPerMatch = 3,
                pointsToVictory = listOf(21.0, 15.0),
                restTimeMinutes = 10,
            ),
        )
        val assignment = EventEditorMaintenanceGraphOfficialAssignmentDto(
            positionId = position.id,
            slotIndex = 0,
            holderType = "OFFICIAL",
            userId = user.id,
            eventOfficialId = eventOfficial.id,
            checkedIn = false,
            hasConflict = false,
        )
        val match = EventEditorMaintenanceGraphMatchDto(
            id = "match-1",
            matchId = 1,
            eventId = "event-1",
            start = "2026-09-01T10:00:00Z",
            end = "2026-09-01T11:00:00Z",
            locked = false,
            placementState = "PLACED",
            phase = "LEAGUE",
            sourceDivisionId = division.id,
            phaseDivisionId = division.id,
            division = division.id,
            fieldId = field.id,
            team1Id = team.id,
            team2Id = null,
            team1Seed = 1,
            team2Seed = null,
            status = "SCHEDULED",
            resultStatus = "PENDING",
            resultType = "NONE",
            actualStart = null,
            actualEnd = null,
            statusReason = null,
            winnerEventTeamId = null,
            segments = emptyList(),
            incidents = emptyList(),
            officialIds = listOf(assignment),
            officialAssignments = listOf(assignment),
            teamOfficialId = null,
            teamOfficialSeed = JsonNull,
            matchRulesSnapshot = null,
            resolvedMatchRules = null,
            team1Points = listOf(12.5),
            team2Points = listOf(9.25),
            losersBracket = false,
            winnerNextMatchId = null,
            loserNextMatchId = null,
            previousLeftId = null,
            previousRightId = null,
            side = null,
            officialCheckedIn = false,
            team1 = team,
            team2 = null,
            teamOfficial = null,
            official = user,
            field = field,
        )
        val event = EventEditorMaintenanceGraphEventDto(
            id = "event-1",
            name = "Maintenance Event",
            description = "Graph event",
            start = "2026-09-01T10:00:00Z",
            end = "2026-09-01T12:00:00Z",
            location = "Main venue",
            coordinates = listOf(1.0, 2.0),
            price = 42.5,
            minAge = 18,
            maxAge = 40,
            rating = 4.5,
            imageId = "image-1",
            hostId = "host-1",
            noFixedEndDateTime = false,
            scheduleEndConstraint = null,
            generatedScheduleEnd = null,
            state = "PUBLISHED",
            maxParticipants = 32,
            teamSizeLimit = 2,
            restTimeMinutes = 10,
            teamSignup = true,
            singleDivision = false,
            waitListIds = emptyList(),
            freeAgentIds = emptyList(),
            teamIds = listOf(team.id),
            userIds = listOf(user.id),
            fieldIds = listOf(field.id),
            timeSlotIds = listOf(timeSlot.id),
            officialIds = listOf(user.id),
            staffingPriority = "BEST_AVAILABLE_COVERAGE",
            officialPositions = listOf(position),
            eventOfficials = listOf(eventOfficial),
            matchRulesOverride = jsonMVP.parseToJsonElement(
                """{"serveOrder":"alternating","rules":{"sideout":true}}""",
            ),
            autoCreatePointMatchIncidents = false,
            resolvedMatchRules = null,
            cancellationRefundHours = null,
            registrationCutoffHours = 12,
            seedColor = null,
            eventType = "LEAGUE",
            sportIds = listOf("sport-1"),
            leagueScoringConfigId = null,
            organizationId = "org-1",
            requiredTemplateIds = emptyList(),
            allowPaymentPlans = false,
            installmentCount = 0,
            installmentDueDates = emptyList(),
            installmentDueRelativeDays = emptyList(),
            installmentAmounts = emptyList(),
            allowTeamSplitDefault = false,
            splitLeaguePlayoffDivisions = false,
            divisions = listOf(division.id),
            divisionDetails = listOf(division),
            playoffDivisionDetails = emptyList(),
            fields = listOf(field),
            teams = listOf(team),
            timeSlots = listOf(timeSlot),
            officials = listOf(user),
            matches = null,
            usesSets = true,
            matchDurationMinutes = 30,
            setDurationMinutes = 5,
            setsPerMatch = 3,
            doTeamsOfficiate = false,
            teamOfficialsMaySwap = false,
            teamCheckInMode = "MATCH",
            teamCheckInOpenMinutesBefore = 60,
            allowMatchRosterEdits = true,
            allowTemporaryMatchPlayers = true,
            gamesPerOpponent = 3,
            includePlayoffs = true,
            playoffTeamCount = 4,
            pointsToVictory = listOf(21.0, 15.0),
        )
        return """{"event":${jsonMVP.encodeToString(event)},"matches":[${jsonMVP.encodeToString(match)}]}"""
    }

}

private fun maintenanceProjection(
    id: String,
    placementState: String,
): EventEditorMatchProjectionDto = EventEditorMatchProjectionDto(
    id = id,
    eventId = "event-1",
    placementState = placementState,
)
 
