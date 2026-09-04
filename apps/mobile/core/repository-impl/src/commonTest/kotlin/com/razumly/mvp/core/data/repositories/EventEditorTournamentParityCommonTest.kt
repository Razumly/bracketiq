package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.DivisionPhaseSettingsMVP
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.network.dto.EVENT_EDITOR_CONTRACT_VERSION
import com.razumly.mvp.core.network.dto.EventEditorBasicsDto
import com.razumly.mvp.core.network.dto.EventEditorCapabilitiesDto
import com.razumly.mvp.core.network.dto.EventEditorCatalogsDto
import com.razumly.mvp.core.network.dto.EventEditorCompetitionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateBootstrapDto
import com.razumly.mvp.core.network.dto.EventEditorDivisionDetailDto
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorExpectedCreateRevisionsDto
import com.razumly.mvp.core.network.dto.EventEditorFieldDto
import com.razumly.mvp.core.network.dto.EventEditorImmutableDto
import com.razumly.mvp.core.network.dto.EventEditorOfficialDto
import com.razumly.mvp.core.network.dto.EventEditorOfficialPositionDto
import com.razumly.mvp.core.network.dto.EventEditorParticipationDto
import com.razumly.mvp.core.network.dto.EventEditorPaymentDto
import com.razumly.mvp.core.network.dto.EventEditorQuestionDto
import com.razumly.mvp.core.network.dto.EventEditorRegistrationDto
import com.razumly.mvp.core.network.dto.EventEditorResourcesDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleStateDto
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.dto.EventEditorStaffDto
import com.razumly.mvp.core.network.dto.EventEditorStaffInviteDto
import com.razumly.mvp.core.network.dto.EventEditorTagDto
import com.razumly.mvp.core.network.dto.EventEditorTimeSlotDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionMode
import com.razumly.mvp.core.network.dto.encodeEventEditorCreateCommand
import com.razumly.mvp.core.util.jsonMVP
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.configureMvpHttpClient
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventEditorAcceptMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceAcceptedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphDivisionDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphEventDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphMatchDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphPhaseSettingsDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphFieldDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphTimeSlotDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRequestDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseStatus
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto
import com.razumly.mvp.core.network.dto.EventEditorRevisionBindingDto
import com.razumly.mvp.core.network.dto.MatchApiDto
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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.assertIs
import kotlin.time.ExperimentalTime
import kotlinx.serialization.json.jsonArray
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertNotNull
import kotlin.test.assertNull

private const val TOURNAMENT_MAINTENANCE_EVENT_ID = "event-tournament-maintenance-parity"
private const val TOURNAMENT_MAINTENANCE_PROPOSAL_REVISION = "tournament-maintenance-proposal-revision"
private const val TOURNAMENT_MAINTENANCE_ACCEPTANCE_ID = "tournament-maintenance-acceptance"
private const val TOURNAMENT_MAINTENANCE_FIELD_ID = "field-tournament-maintenance"
private const val TOURNAMENT_MAINTENANCE_SLOT_ID = "slot-tournament-maintenance"
private const val TOURNAMENT_MAINTENANCE_DIVISION_ID = "division_tournament_maintenance"
private const val TOURNAMENT_MAINTENANCE_PROTECTED_MATCH_ID = "match-tournament-protected"
private const val TOURNAMENT_MAINTENANCE_GENERATED_MATCH_ID = "match-tournament-generated"
private const val TOURNAMENT_MAINTENANCE_START = "2026-10-03T08:00:00Z"
private const val TOURNAMENT_MAINTENANCE_END = "2026-10-03T20:00:00Z"
private const val TOURNAMENT_MAINTENANCE_PROTECTED_START = "2026-10-03T09:00:00Z"
private const val TOURNAMENT_MAINTENANCE_PROTECTED_END = "2026-10-03T10:00:00Z"
private const val TOURNAMENT_MAINTENANCE_GENERATED_START = "2026-10-03T10:00:00Z"
private const val TOURNAMENT_MAINTENANCE_GENERATED_END = "2026-10-03T11:00:00Z"

private val TOURNAMENT_MAINTENANCE_RESPONSE_JSON = Json {
    encodeDefaults = true
    explicitNulls = true
    isLenient = false
    allowStructuredMapKeys = true
    useArrayPolymorphism = false
    ignoreUnknownKeys = false
    coerceInputValues = false
}

private object TournamentParityTokenStore : AuthTokenStore {
    override suspend fun get(): String = "tournament-parity-token"
    override suspend fun set(token: String) = Unit
    override suspend fun clear() = Unit
}

private const val TOURNAMENT_OPERATION_ID = "create-operation-tournament-parity"
private const val SCHEDULED_TOURNAMENT_OPERATION_ID = "create-operation-tournament-parity-scheduled"
private const val TOURNAMENT_START = "2026-10-03T08:00:00Z"
private const val TOURNAMENT_END = "2026-10-03T20:00:00Z"
private const val TOURNAMENT_EDITOR_REVISION = "new"
private const val TOURNAMENT_SCHEDULE_REVISION = "new"

@OptIn(ExperimentalTime::class)
class EventEditorTournamentParityCommonTest {
    @Test
    fun given_shared_tournament_draft_when_command_is_encoded_then_complete_canonical_wire_is_preserved() {
        val draft = sharedTournamentParityDraft()
        val bootstrap = EventEditorCreateBootstrapDto(
            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
            createOperationId = TOURNAMENT_OPERATION_ID,
            snapshot = EventEditorSnapshotDto(
                contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                draft = draft,
                mode = "CREATE",
                editorRevision = TOURNAMENT_EDITOR_REVISION,
                staffRevision = null,
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
                    revision = TOURNAMENT_SCHEDULE_REVISION,
                    hasProtectedHistory = false,
                ),
            ),
        )
        val session = EventEditorSessionMapper.fromCreateBootstrap(bootstrap)
        val command = EventEditorSessionMapper.toCreateCommand(
            session = session,
            mutation = EventEditorMutation(session.canonicalState),
        ).command

        assertCanonicalTournamentState(session.canonicalState)
        assertFalse(command.draft.schedule.isAutomatedScheduling)
        assertEquals(EventEditorCreateCompletionMode.CREATE_ONLY, command.completion.mode)
        assertFalse(command.hasScheduleProposalSupport)

        val actualWire = encodeEventEditorCreateCommand(command)
        val expectedWire = jsonMVP.parseToJsonElement(EXPECTED_TOURNAMENT_PARITY_WIRE).jsonObject
        // This is a complete, independently authored DTO wire oracle. Do not
        // replace it with a subset assertion or a re-encoding of `command`.
        assertEquals(expectedWire, actualWire, actualWire.toString())
    }

    @Test
    fun given_scheduled_tournament_draft_when_command_is_encoded_then_proposal_wire_is_preserved() {
        val baseDraft = sharedTournamentParityDraft()
        val draft = baseDraft.copy(
            schedule = baseDraft.schedule.copy(isAutomatedScheduling = true),
        )
        val bootstrap = EventEditorCreateBootstrapDto(
            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
            createOperationId = SCHEDULED_TOURNAMENT_OPERATION_ID,
            snapshot = EventEditorSnapshotDto(
                contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                draft = draft,
                mode = "CREATE",
                editorRevision = TOURNAMENT_EDITOR_REVISION,
                staffRevision = null,
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
                    revision = TOURNAMENT_SCHEDULE_REVISION,
                    hasProtectedHistory = false,
                ),
            ),
        )
        val session = EventEditorSessionMapper.fromCreateBootstrap(bootstrap)
        val command = EventEditorSessionMapper.toCreateCommand(
            session = session,
            mutation = EventEditorMutation(session.canonicalState),
        ).command
        assertEquals(SCHEDULED_TOURNAMENT_OPERATION_ID, command.createOperationId)
        assertFalse(command.createOperationId == TOURNAMENT_OPERATION_ID)

        assertEquals(true, session.canonicalState.event.isAutomatedScheduling)
        assertEquals(true, command.draft.schedule.isAutomatedScheduling)
        assertEquals("FIXED_END", command.draft.schedule.mode)
        assertEquals(TOURNAMENT_END, command.draft.schedule.endConstraint)
        assertEquals(
            EventEditorCreateCompletionMode.CREATE_AND_BUILD_SCHEDULE,
            command.completion.mode,
        )
        assertEquals(true, command.hasScheduleProposalSupport)

        val actualWire = encodeEventEditorCreateCommand(command)
        assertEquals(
            scheduledTournamentParityWire(),
            actualWire,
            actualWire.toString(),
        )
    }


    @Test
    fun given_changed_existing_tournament_division_when_save_command_is_built_then_current_detail_values_win() {
        val existingPhaseSettings = jsonMVP.parseToJsonElement(
            """{"BRACKET":{"segmentLengthMinutes":10,"segmentBreakMinutes":1,"doTeamsOfficiate":false,"futurePhaseSetting":{"enabled":true}}}""",
        ).jsonObject
        val existingPlayoffConfig = jsonObject(
            "doubleElimination" to true,
            "winnerSetCount" to 4,
            "loserSetCount" to 1,
            "winnerBracketPointsToVictory" to listOf(25, 25, 15),
            "loserBracketPointsToVictory" to listOf(25, 15),
            "prize" to "Original prize",
            "fieldCount" to 1,
            "restTimeMinutes" to 8,
            "usesSets" to true,
            "setDurationMinutes" to 12,
            "futurePlayoffSetting" to "web-authored",
        )
        val baseDraft = sharedTournamentParityDraft()
        val existingDraft = baseDraft.copy(
            competition = baseDraft.competition.copy(
                playoffDivisionDetails = baseDraft.competition.playoffDivisionDetails.map { detail ->
                    if (detail.id == "tournament-pool-a") {
                        detail.copy(
                            phaseSettings = existingPhaseSettings,
                            playoffConfig = existingPlayoffConfig,
                            standingsOverrides = mapOf("1" to 7.0),
                        )
                    } else {
                        detail
                    }
                },
            ),
        )
        val snapshot = EventEditorSnapshotDto(
            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
            draft = existingDraft,
            mode = "EDIT",
            editorRevision = "revision-1",
            staffRevision = null,
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
                revision = TOURNAMENT_SCHEDULE_REVISION,
                hasProtectedHistory = false,
            ),
        )
        val session = EventEditorSessionMapper.fromEditSnapshot(snapshot)
        val baselineBracket = session.canonicalState.event.divisionDetails.first { detail ->
            detail.id == "tournament-pool-a" && detail.kind == "PLAYOFF"
        }
        val editedPhaseSettings = mapOf(
            "BRACKET" to DivisionPhaseSettingsMVP(
                segmentLengthMinutes = 18,
                segmentBreakMinutes = 3,
                doTeamsOfficiate = true,
                officialPositions = listOf(
                    EventOfficialPosition(
                        id = "head-referee",
                        name = "Head referee",
                        count = 2,
                        order = 0,
                    ),
                ),
            ),
        )
        val editedPlayoffConfig = TournamentConfig(
            doubleElimination = false,
            winnerSetCount = 2,
            loserSetCount = 1,
            winnerBracketPointsToVictory = listOf(21, 19),
            loserBracketPointsToVictory = listOf(15),
            prize = "Updated prize",
            fieldCount = 2,
            restTimeMinutes = 14,
            usesSets = false,
            matchDurationMinutes = 54,
            setDurationMinutes = null,
        )
        val editedBracket = baselineBracket.copy(
            phaseSettings = editedPhaseSettings,
            playoffConfig = editedPlayoffConfig,
        )
        val mutation = EventEditorMutation(
            canonicalState = session.canonicalState.copy(
                event = session.canonicalState.event.copy(
                    divisionDetails = session.canonicalState.event.divisionDetails.map { detail ->
                        if (detail.id == editedBracket.id && detail.kind == editedBracket.kind) {
                            editedBracket
                        } else {
                            detail
                        }
                    },
                ),
            ),
        )

        val command = EventEditorSessionMapper.toSaveCommand(session, mutation)
        val mappedBracket = command.draft.competition.playoffDivisionDetails.single { detail ->
            detail.id == "tournament-pool-a"
        }
        val mappedPlayoffConfig = mappedBracket.playoffConfig?.let {
            jsonMVP.decodeFromJsonElement<TournamentConfig>(it)
        }

        assertEquals(editedPhaseSettings, mappedBracket.phaseSettings?.let {
            jsonMVP.decodeFromJsonElement<Map<String, DivisionPhaseSettingsMVP>>(it)
        })
        assertEquals(editedPlayoffConfig, mappedPlayoffConfig)
        assertEquals(54, mappedPlayoffConfig?.matchDurationMinutes)
        assertEquals(
            existingPhaseSettings["BRACKET"]?.jsonObject?.get("futurePhaseSetting"),
            mappedBracket.phaseSettings?.get("BRACKET")?.jsonObject?.get("futurePhaseSetting"),
        )
        assertEquals(
            existingPlayoffConfig["futurePlayoffSetting"],
            mappedBracket.playoffConfig?.get("futurePlayoffSetting"),
        )
        assertEquals("tournament-entry-a", mappedBracket.sourceDivisionId)
        assertEquals(baselineBracket.playoffPlacementDivisionIds, mappedBracket.playoffPlacementDivisionIds)
        assertEquals(baselineBracket.teamIds, mappedBracket.teamIds)
        assertEquals(mapOf("1" to 7.0), mappedBracket.standingsOverrides)

        val clearedBracket = baselineBracket.copy(
            phaseSettings = emptyMap(),
            playoffConfig = null,
            matchDurationMinutes = null,
            setDurationMinutes = null,
        )
        val clearMutation = EventEditorMutation(
            canonicalState = session.canonicalState.copy(
                event = session.canonicalState.event.copy(
                    divisionDetails = session.canonicalState.event.divisionDetails.map { detail ->
                        if (detail.id == clearedBracket.id && detail.kind == clearedBracket.kind) {
                            clearedBracket
                        } else {
                            detail
                        }
                    },
                ),
            ),
        )
        val clearCommand = EventEditorSessionMapper.toSaveCommand(session, clearMutation)
        val clearedMappedBracket = clearCommand.draft.competition.playoffDivisionDetails.single { detail ->
            detail.id == "tournament-pool-a"
        }

        assertEquals(JsonObject(emptyMap()), clearedMappedBracket.phaseSettings)
        assertNull(clearedMappedBracket.playoffConfig)
        assertNull(clearedMappedBracket.matchDurationMinutes)
        assertNull(clearedMappedBracket.setDurationMinutes)
        assertEquals("tournament-entry-a", clearedMappedBracket.sourceDivisionId)
        assertEquals(baselineBracket.playoffPlacementDivisionIds, clearedMappedBracket.playoffPlacementDivisionIds)
        assertEquals(baselineBracket.teamIds, clearedMappedBracket.teamIds)
        assertEquals(mapOf("1" to 7.0), clearedMappedBracket.standingsOverrides)
    }

    @Test
    fun given_unchanged_typed_division_json_when_only_name_changes_then_raw_json_is_preserved() {
        val existingPhaseSettings = jsonMVP.parseToJsonElement(
            """{"BRACKET":{"segmentLengthMinutes":10,"officialPositions":[{"id":"head-referee","name":"Head referee","count":2,"order":0,"futureOfficialSetting":{"enabled":true}}],"futurePhaseSetting":{"enabled":true}}}""",
        ).jsonObject
        val existingPlayoffConfig = jsonMVP.parseToJsonElement(
            """{"doubleElimination":true,"winnerSetCount":4,"futurePlayoffSetting":{"seedStrategy":"web"}}""",
        ).jsonObject
        val baseDraft = sharedTournamentParityDraft()
        val existingDraft = baseDraft.copy(
            competition = baseDraft.competition.copy(
                playoffDivisionDetails = baseDraft.competition.playoffDivisionDetails.map { detail ->
                    if (detail.id == "tournament-pool-a") {
                        detail.copy(
                            phaseSettings = existingPhaseSettings,
                            playoffConfig = existingPlayoffConfig,
                        )
                    } else {
                        detail
                    }
                },
            ),
        )
        val snapshot = EventEditorSnapshotDto(
            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
            draft = existingDraft,
            mode = "EDIT",
            editorRevision = "revision-1",
            staffRevision = null,
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
                revision = TOURNAMENT_SCHEDULE_REVISION,
                hasProtectedHistory = false,
            ),
        )
        val session = EventEditorSessionMapper.fromEditSnapshot(snapshot)
        val baselineBracket = session.canonicalState.event.divisionDetails.first { detail ->
            detail.id == "tournament-pool-a" && detail.kind == "PLAYOFF"
        }
        val mutation = EventEditorMutation(
            canonicalState = session.canonicalState.copy(
                event = session.canonicalState.event.copy(
                    divisionDetails = session.canonicalState.event.divisionDetails.map { detail ->
                        if (detail.id == baselineBracket.id && detail.kind == baselineBracket.kind) {
                            detail.copy(name = "Renamed Pool A Bracket")
                        } else {
                            detail
                        }
                    },
                ),
            ),
        )

        val command = EventEditorSessionMapper.toSaveCommand(session, mutation)
        val mappedBracket = command.draft.competition.playoffDivisionDetails.single { detail ->
            detail.id == "tournament-pool-a"
        }

        assertEquals(existingPhaseSettings, mappedBracket.phaseSettings)
        assertEquals(existingPlayoffConfig, mappedBracket.playoffConfig)
        assertEquals(
            jsonMVP.parseToJsonElement(
                """{"id":"head-referee","name":"Head referee","count":2,"order":0,"futureOfficialSetting":{"enabled":true}}""",
            ),
            mappedBracket.phaseSettings
                ?.get("BRACKET")
                ?.jsonObject
                ?.get("officialPositions")
                ?.jsonArray
                ?.single(),
        )
    }

    private fun sharedTournamentParityDraft(): EventEditorDraftDto = EventEditorDraftDto(
        basics = EventEditorBasicsDto(
            name = "Canonical Tournament",
            description = "A complete Tournament parity fixture with pool play and championship brackets.",
            eventType = "TOURNAMENT",
            sportIds = listOf("sport_pickleball"),
            start = TOURNAMENT_START,
            timeZone = "UTC",
            location = "Building B",
            address = "2 Main Street",
            coordinates = listOf(0.0, 0.0),
            affiliateUrl = "",
            parentEvent = "parent-tournament-1",
            organizationId = "organization-tournament-1",
            hostId = "host-tournament-1",
            state = "UNPUBLISHED",
            imageId = "image-tournament-1",
            tags = listOf(
                EventEditorTagDto(
                    id = "tag-tournament-1",
                    slug = "championship",
                    name = "Championship",
                ),
            ),
        ),
        participation = EventEditorParticipationDto(
            teamSignup = true,
            singleDivision = false,
            registrationByDivisionType = true,
            teamSizeLimit = 2,
            maxParticipants = 12,
            minAge = 18,
            maxAge = 99,
            cancellationRefundHours = 48,
            registrationCutoffHours = 24,
            allowTeamSplitDefault = true,
            waitListIds = listOf("wait-tournament-1"),
            freeAgentIds = listOf("free-agent-tournament-1"),
        ),
        registration = EventEditorRegistrationDto(
            payment = EventEditorPaymentDto(
                mode = "ONLINE",
                priceCents = 7500,
                taxHandling = "INCLUSIVE",
                organizerManualTaxRateBps = 0,
                manualPaymentInstructions = null,
                manualPaymentLinks = emptyList(),
                allowPaymentPlans = false,
                installmentCount = null,
                installmentDueDates = emptyList(),
                installmentDueRelativeDays = emptyList(),
                installmentAmounts = emptyList(),
            ),
            questions = listOf(
                EventEditorQuestionDto(
                    id = null,
                    clientId = "question-tournament-1",
                    prompt = "Preferred match time?",
                    answerType = "TEXT",
                    required = true,
                    sortOrder = 0,
                ),
            ),
            requiredDocumentIds = listOf("document-tournament-waiver"),
        ),
        competition = EventEditorCompetitionDto(
            divisionIds = listOf("tournament-pool-a", "tournament-pool-b"),
            divisionDetails = listOf(
                poolDivision("tournament-pool-a", "tournament-entry-a", "Pool A", "tournament-team-a"),
                poolDivision("tournament-pool-b", "tournament-entry-b", "Pool B", "tournament-team-b"),
            ),
            playoffDivisionDetails = listOf(
                bracketDivision(
                    "tournament-pool-a",
                    "tournament-entry-a",
                    "Pool A Bracket",
                    winnerSetCount = 4,
                    loserSetCount = 1,
                    winnerBracketPointsToVictory = listOf(27, 25, 21, 15),
                    loserBracketPointsToVictory = listOf(23),
                    prize = "Pool A Championship Trophy",
                    restTimeMinutes = 8,
                    matchDurationMinutes = 40,
                    setDurationMinutes = 12,
                ),
                bracketDivision(
                    "tournament-pool-b",
                    "tournament-entry-b",
                    "Pool B Bracket",
                    winnerSetCount = 5,
                    loserSetCount = 3,
                    winnerBracketPointsToVictory = listOf(31, 29, 27, 25, 15),
                    loserBracketPointsToVictory = listOf(23, 21, 15),
                    prize = "Pool B Championship Trophy",
                    restTimeMinutes = 6,
                    matchDurationMinutes = 50,
                    setDurationMinutes = 10,
                ),
            ),
            divisionFieldIds = mapOf(
                "tournament-pool-a" to listOf("tournament-field-1"),
                "tournament-pool-b" to listOf("tournament-field-1"),
            ),
            winnerSetCount = 3,
            loserSetCount = 2,
            doubleElimination = true,
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = false,
            playoffTeamCount = 4,
            pointsToVictory = listOf(21, 21, 15),
            winnerBracketPointsToVictory = listOf(25, 25, 15),
            loserBracketPointsToVictory = listOf(25, 15),
            usesSets = true,
            setsPerMatch = 3,
            setDurationMinutes = 15.0,
            restTimeMinutes = 10.0,
            matchDurationMinutes = 45.0,
            gamesPerOpponent = 2,
            matchRulesOverride = jsonObject(
                "scoringModel" to "POINTS",
                "segmentCount" to 3,
                "segmentLabel" to "Set",
                "setPointTargets" to listOf(25, 25, 15),
            ),
            leagueScoringConfig = jsonObject(
                "pointsForWin" to 3,
                "pointsForDraw" to 1,
                "pointsForLoss" to 0,
            ),
        ),
        schedule = EventEditorScheduleDto(
            mode = "FIXED_END",
            endConstraint = TOURNAMENT_END,
            generatedScheduleEnd = null,
            isAutomatedScheduling = false,
        ),
        resources = EventEditorResourcesDto(
            fieldIds = listOf("tournament-field-1"),
            fields = listOf(
                EventEditorFieldDto(
                    id = "tournament-field-1",
                    name = "Championship Court",
                    location = "Building B",
                    address = "2 Main Street",
                    lat = null,
                    long = null,
                    heading = null,
                    inUse = true,
                    rentalSlotIds = emptyList(),
                    sportIds = listOf("sport_pickleball"),
                    createdBy = null,
                    archivedAt = null,
                    archivedByUserId = null,
                    archiveReason = null,
                    organizationId = "organization-tournament-1",
                    facilityId = "facility-tournament-1",
                    latitude = null,
                    longitude = null,
                ),
            ),
            timeSlotIds = listOf("tournament-slot-1"),
            timeSlots = listOf(
                EventEditorTimeSlotDto(
                    id = "tournament-slot-1",
                    eventId = "event-tournament-parity",
                    archivedAt = null,
                    archivedByUserId = null,
                    archiveReason = null,
                    dayOfWeek = null,
                    daysOfWeek = listOf(5),
                    startTimeMinutes = 480,
                    endTimeMinutes = 1200,
                    startDate = TOURNAMENT_START,
                    endDate = TOURNAMENT_END,
                    start = null,
                    end = null,
                    timeZone = "UTC",
                    scheduledFieldId = null,
                    scheduledFieldIds = listOf("tournament-field-1"),
                    fieldId = null,
                    fieldIds = emptyList(),
                    division = null,
                    divisions = listOf("tournament-pool-a", "tournament-pool-b"),
                    divisionKeys = emptyList(),
                    requiredTemplateIds = listOf("template-tournament-waiver"),
                    hostRequiredTemplateIds = listOf("template-tournament-host"),
                    repeating = false,
                    price = null,
                    taxHandling = null,
                    sourceType = "EVENT",
                    rentalBookingId = null,
                    rentalBookingItemId = null,
                    rentalLocked = null,
                ),
            ),
            requiredTemplateIds = listOf("template-tournament-waiver"),
            immutableFieldIds = emptyList(),
            rentalBookingId = null,
            rentalBookingItemId = null,
        ),
        staff = EventEditorStaffDto(
            staffingPriority = "OFFICIAL_COVERAGE_REQUIRED",
            doTeamsOfficiate = true,
            teamOfficialsMaySwap = true,
            teamCheckInMode = "MATCH",
            teamCheckInOpenMinutesBefore = 45,
            allowMatchRosterEdits = true,
            allowTemporaryMatchPlayers = true,
            autoCreatePointMatchIncidents = true,
            officialIds = listOf("tournament-official-1"),
            officialPositions = listOf(
                EventEditorOfficialPositionDto(
                    id = "tournament-position-referee",
                    name = "Referee",
                    count = 2,
                    order = 0,
                ),
            ),
            eventOfficials = listOf(
                EventEditorOfficialDto(
                    id = "event-tournament-official-1",
                    userId = "tournament-official-1",
                    positionIds = listOf("tournament-position-referee"),
                    fieldIds = listOf("tournament-field-1"),
                    isActive = true,
                ),
            ),
            assistantHostIds = listOf("tournament-assistant-1"),
            pendingInvites = listOf(
                EventEditorStaffInviteDto(
                    id = "tournament-invite-1",
                    email = "tournament-official@example.test",
                    firstName = "Tournament",
                    lastName = "Official",
                    roles = listOf("OFFICIAL"),
                    staffTypes = listOf("OFFICIAL"),
                    type = "STAFF",
                    status = "PENDING",
                    eventId = "event-tournament-parity",
                    organizationId = "organization-tournament-1",
                ),
            ),
        ),
    )

    private fun poolDivision(
        id: String,
        sourceDivisionId: String,
        name: String,
        teamPrefix: String,
    ): EventEditorDivisionDetailDto = EventEditorDivisionDetailDto(
        id = id,
        sourceDivisionId = sourceDivisionId,
        key = id.removePrefix("tournament-"),
        name = name,
        kind = "LEAGUE",
        isSystemGenerated = false,
        poolPlay = true,
        divisionTypeId = "skill_open_age_18plus",
        skillDivisionTypeId = "open",
        ageDivisionTypeId = "18plus",
        divisionTypeName = "Open 18+",
        ratingType = "SKILL",
        gender = "C",
        price = null,
        maxParticipants = 6.0,
        playoffTeamCount = 4.0,
        poolCount = 2.0,
        poolTeamCount = 3.0,
        phaseSettings = JsonObject(emptyMap()),
        playoffPlacementDivisionIds = listOf(id),
        standingsOverrides = null,
        playoffConfig = null,
        gamesPerOpponent = 2.0,
        restTimeMinutes = 10.0,
        usesSets = true,
        matchDurationMinutes = 45.0,
        setDurationMinutes = 15.0,
        setsPerMatch = 3.0,
        pointsToVictory = listOf(21, 21, 15),
        standingsConfirmedAt = null,
        standingsConfirmedBy = null,
        allowPaymentPlans = null,
        installmentCount = null,
        installmentDueDates = emptyList(),
        installmentDueRelativeDays = emptyList(),
        installmentAmounts = emptyList(),
        ageCutoffDate = null,
        ageCutoffLabel = null,
        ageCutoffSource = null,
        fieldIds = listOf("tournament-field-1"),
        teamIds = (1..6).map { index -> "$teamPrefix-$index" },
    )

    private fun bracketDivision(
        id: String,
        sourceDivisionId: String,
        name: String,
        winnerSetCount: Int,
        loserSetCount: Int,
        winnerBracketPointsToVictory: List<Int>,
        loserBracketPointsToVictory: List<Int>,
        prize: String,
        restTimeMinutes: Int,
        matchDurationMinutes: Int,
        setDurationMinutes: Int,
    ): EventEditorDivisionDetailDto = EventEditorDivisionDetailDto(
        id = id,
        sourceDivisionId = sourceDivisionId,
        key = id.removePrefix("tournament-"),
        name = name,
        kind = "PLAYOFF",
        isSystemGenerated = false,
        poolPlay = true,
        divisionTypeId = "skill_open_age_18plus",
        skillDivisionTypeId = "open",
        ageDivisionTypeId = "18plus",
        divisionTypeName = "Open 18+",
        ratingType = "SKILL",
        gender = "C",
        price = null,
        maxParticipants = 6.0,
        playoffTeamCount = 4.0,
        poolCount = 2.0,
        poolTeamCount = 3.0,
        phaseSettings = JsonObject(emptyMap()),
        playoffPlacementDivisionIds = emptyList(),
        standingsOverrides = null,
        playoffConfig = jsonObject(
            "doubleElimination" to true,
            "winnerSetCount" to winnerSetCount,
            "loserSetCount" to loserSetCount,
            "winnerBracketPointsToVictory" to winnerBracketPointsToVictory,
            "loserBracketPointsToVictory" to loserBracketPointsToVictory,
            "prize" to prize,
            "fieldCount" to 1,
            "restTimeMinutes" to restTimeMinutes,
            "matchDurationMinutes" to matchDurationMinutes,
            "setDurationMinutes" to setDurationMinutes,
        ),
        gamesPerOpponent = 2.0,
        restTimeMinutes = 10.0,
        usesSets = true,
        matchDurationMinutes = 45.0,
        setDurationMinutes = 15.0,
        setsPerMatch = 3.0,
        pointsToVictory = listOf(21, 21, 15),
        standingsConfirmedAt = null,
        standingsConfirmedBy = null,
        allowPaymentPlans = null,
        installmentCount = null,
        installmentDueDates = emptyList(),
        installmentDueRelativeDays = emptyList(),
        installmentAmounts = emptyList(),
        ageCutoffDate = null,
        ageCutoffLabel = null,
        ageCutoffSource = null,
        fieldIds = listOf("tournament-field-1"),
        teamIds = emptyList(),
    )

    private fun assertCanonicalTournamentState(canonical: EventEditorCanonicalState) {
        val event = canonical.event
        assertEquals("Canonical Tournament", event.name)
        assertEquals("TOURNAMENT", event.eventType.name)
        assertEquals(listOf("tournament-pool-a", "tournament-pool-b"), event.divisions)
        assertEquals(12, event.maxParticipants)
        assertEquals(true, event.includePlayoffs)
        assertEquals(4, event.playoffTeamCount)
        assertEquals(true, event.doubleElimination)
        assertEquals(3, event.winnerSetCount)
        assertEquals(2, event.loserSetCount)
        assertEquals(listOf(21, 21, 15), event.pointsToVictory)
        assertEquals(listOf(25, 25, 15), event.winnerBracketPointsToVictory)
        assertEquals(listOf(25, 15), event.loserBracketPointsToVictory)
        assertEquals(true, event.usesSets)
        assertEquals(3, event.setsPerMatch)
        assertEquals(15, event.setDurationMinutes)
        assertEquals(10, event.restTimeMinutes)
        assertEquals(45, event.matchDurationMinutes)
        assertEquals(2, event.gamesPerOpponent)
        assertEquals(listOf("tournament-field-1"), event.fieldIds)
        assertEquals(listOf("tournament-slot-1"), event.timeSlotIds)
        assertEquals(false, event.isAutomatedScheduling)
        assertEquals(true, event.doTeamsOfficiate)
        assertEquals(true, event.teamOfficialsMaySwap)
        assertEquals("MATCH", event.teamCheckInMode.name)
        assertEquals("OFFICIAL_COVERAGE_REQUIRED", event.staffingPriority.name)
        assertEquals(listOf("tournament-official-1"), event.officialIds)

        val pool = event.divisionDetails.first { detail ->
            detail.id == "tournament-pool-a" && detail.kind == "LEAGUE"
        }
        assertEquals(6, pool.maxParticipants)
        assertEquals(2, pool.poolCount)
        assertEquals(3, pool.poolTeamCount)
        assertEquals(4, pool.playoffTeamCount)
        assertEquals(45, pool.matchDurationMinutes)
        assertEquals(listOf("tournament-pool-a"), pool.playoffPlacementDivisionIds)
        assertEquals(
            listOf("tournament-pool-a", "tournament-pool-b"),
            canonical.playoffDivisionDetails.map { detail -> detail.id },
        )

        val field = assertNotNull(canonical.fields.singleOrNull())
        assertEquals("tournament-field-1", field.id)
        assertEquals(
            listOf("tournament-pool-a", "tournament-pool-b"),
            field.divisions,
        )
        val slot = assertNotNull(canonical.timeSlots.singleOrNull())
        assertEquals(listOf(5), slot.daysOfWeek)
        assertEquals(480, slot.startTimeMinutes)
        assertEquals(1200, slot.endTimeMinutes)
        assertEquals(listOf("tournament-field-1"), slot.scheduledFieldIds)
        assertEquals(
            listOf("tournament-pool-a", "tournament-pool-b"),
            slot.divisions,
        )
        assertEquals("EVENT", slot.sourceType)
    }
    @Test
    fun given_tournament_maintenance_operations_when_sent_then_ios_common_wire_uses_canonical_path_binding_and_intent() = runTest {
        val expectedBinding = tournamentMaintenanceRevisionBinding()
        val cases = listOf(
            EventEditorMaintenanceOperation.BUILD to "tournament-maintenance-build",
            EventEditorMaintenanceOperation.COMPLETE to "tournament-maintenance-complete",
            EventEditorMaintenanceOperation.REBUILD to "tournament-maintenance-rebuild",
        )
        val requestBodies = mutableListOf<JsonObject>()
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Post, request.method)
            assertEquals(
                "/api/events/$TOURNAMENT_MAINTENANCE_EVENT_ID/schedule",
                request.url.encodedPath,
            )
            val body = (request.body as TextContent).text
            val bodyJson = jsonMVP.parseToJsonElement(body).jsonObject
            requestBodies += bodyJson

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
                bodyJson.keys,
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
                bodyJson.getValue("expectedRevisions").jsonObject.keys,
            )

            val decodedRequest = jsonMVP.decodeFromJsonElement<EventEditorMaintenanceRequestDto>(bodyJson)
            assertEquals(TOURNAMENT_MAINTENANCE_EVENT_ID, decodedRequest.eventId)
            assertEquals(expectedBinding, decodedRequest.expectedRevisions)
            assertEquals(12, decodedRequest.participantCount)
            assertEquals(true, decodedRequest.includePlaceholderTeams)

            respond(
                content = tournamentMaintenanceResponseBody(tournamentMaintenanceProposal(decodedRequest)),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val gateway = EventEditorRemoteGateway(
            MvpApiClient(
                http = HttpClient(engine) { configureMvpHttpClient() },
                baseUrl = "http://example.test",
                tokenStore = TournamentParityTokenStore,
            ),
        )

        cases.forEach { (operation, operationId) ->
            val response = gateway.proposeMaintenance(
                EventEditorMaintenanceRequestDto(
                    contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                    eventId = TOURNAMENT_MAINTENANCE_EVENT_ID,
                    operation = operation,
                    operationId = operationId,
                    expectedRevisions = expectedBinding,
                    participantCount = 12,
                    includePlaceholderTeams = true,
                ),
            )
            val proposal = assertIs<EventEditorMaintenanceResponseDto.Proposed>(response).proposal
            assertEquals(operation, proposal.operation)
            assertEquals(operationId, proposal.operationId)
            assertEquals(TOURNAMENT_MAINTENANCE_EVENT_ID, proposal.eventId)
        }

        assertEquals(3, requestBodies.size)
        assertEquals(
            cases.map { it.first },
            requestBodies.map { it.getValue("operation").jsonPrimitive.content.let(EventEditorMaintenanceOperation::valueOf) },
        )
        assertEquals(
            cases.map { it.second },
            requestBodies.map { it.getValue("operationId").jsonPrimitive.content },
        )
        assertTrue(requestBodies.all { it.getValue("participantCount").jsonPrimitive.content == "12" })
        assertTrue(requestBodies.all { it.getValue("includePlaceholderTeams").jsonPrimitive.content == "true" })
        assertTrue(requestBodies.all { "expectedScheduleRevision" !in it && "replaceExistingMatches" !in it })
    }

    @Test
    fun given_accepted_tournament_maintenance_result_when_mapped_on_ios_common_then_graph_rows_are_lossless_without_scheduler_fallback() = runTest {
        val request = EventEditorMaintenanceRequestDto(
            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
            eventId = TOURNAMENT_MAINTENANCE_EVENT_ID,
            operation = EventEditorMaintenanceOperation.COMPLETE,
            operationId = "tournament-maintenance-complete",
            expectedRevisions = tournamentMaintenanceRevisionBinding(),
            participantCount = 12,
            includePlaceholderTeams = true,
        )
        val accepted = tournamentMaintenanceAcceptedResult(tournamentMaintenanceProposal(request))
        val calls = mutableListOf<Pair<HttpMethod, String>>()
        val engine = MockEngine { httpRequest ->
            calls += httpRequest.method to httpRequest.url.encodedPath
            assertEquals(HttpMethod.Put, httpRequest.method)
            assertEquals(
                "/api/events/$TOURNAMENT_MAINTENANCE_EVENT_ID/schedule",
                httpRequest.url.encodedPath,
            )
            respond(
                content = tournamentMaintenanceResponseBody(accepted),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val gateway = EventEditorRemoteGateway(
            MvpApiClient(
                http = HttpClient(engine) { configureMvpHttpClient() },
                baseUrl = "http://example.test",
                tokenStore = TournamentParityTokenStore,
            ),
        )

        val result = gateway.acceptMaintenance(
            EventEditorAcceptMaintenanceProposalDto(
                contractVersion = request.contractVersion,
                eventId = request.eventId,
                operation = request.operation,
                operationId = request.operationId,
                proposalRevision = TOURNAMENT_MAINTENANCE_PROPOSAL_REVISION,
                acceptanceOperationId = TOURNAMENT_MAINTENANCE_ACCEPTANCE_ID,
            ),
        )

        assertEquals(listOf(HttpMethod.Put to "/api/events/$TOURNAMENT_MAINTENANCE_EVENT_ID/schedule"), calls)
        assertEquals(EventEditorMaintenanceResponseStatus.ACCEPTED, result.status)
        assertEquals(request.operation, result.operation)
        assertEquals(request.operationId, result.operationId)
        assertEquals(TOURNAMENT_MAINTENANCE_ACCEPTANCE_ID, result.acceptanceOperationId)
        assertEquals(
            listOf(TOURNAMENT_MAINTENANCE_PROTECTED_MATCH_ID),
            result.protectedMatchIds,
        )

        val graph = result.graph
        val canonicalEvent = assertNotNull(graph.canonicalEvent)
        assertEquals(TOURNAMENT_MAINTENANCE_EVENT_ID, canonicalEvent.id)
        assertEquals(TOURNAMENT_MAINTENANCE_START, canonicalEvent.start)
        assertEquals(TOURNAMENT_MAINTENANCE_END, canonicalEvent.end)
        assertEquals(listOf(TOURNAMENT_MAINTENANCE_DIVISION_ID), canonicalEvent.divisions)
        assertEquals(listOf(TOURNAMENT_MAINTENANCE_FIELD_ID), canonicalEvent.fieldIds)
        assertEquals(listOf(TOURNAMENT_MAINTENANCE_SLOT_ID), canonicalEvent.timeSlotIds)

        val mappedEvent = assertNotNull(graph.event.toEventOrNull(requireOwnerIdentity = false))
        assertEquals(TOURNAMENT_MAINTENANCE_EVENT_ID, mappedEvent.id)
        assertEquals(TOURNAMENT_MAINTENANCE_START, mappedEvent.start.toString())
        assertEquals(TOURNAMENT_MAINTENANCE_END, mappedEvent.end.toString())
        assertEquals(listOf(TOURNAMENT_MAINTENANCE_DIVISION_ID), mappedEvent.divisions)
        assertEquals(TOURNAMENT_MAINTENANCE_DIVISION_ID, mappedEvent.divisionDetails.single().id)
        assertEquals("Championship", mappedEvent.divisionDetails.single().name)
        assertEquals("LEAGUE", mappedEvent.divisionDetails.single().kind)
        assertEquals(2, mappedEvent.divisionDetails.single().gamesPerOpponent)
        assertEquals(45, mappedEvent.divisionDetails.single().matchDurationMinutes)
        assertEquals(listOf(21, 15), mappedEvent.divisionDetails.single().pointsToVictory)
        val mappedField = graph.event.fields.single()
        assertEquals(TOURNAMENT_MAINTENANCE_FIELD_ID, mappedField.id)
        assertEquals("Championship Court", mappedField.name)
        assertEquals("organization-tournament-maintenance", mappedField.organizationId)
        assertEquals(listOf(TOURNAMENT_MAINTENANCE_DIVISION_ID), mappedField.divisions)

        val mappedSlotDto = graph.event.timeSlots.single()
        val mappedSlot = mappedSlotDto.toTimeSlot(TOURNAMENT_MAINTENANCE_SLOT_ID)
        assertEquals(TOURNAMENT_MAINTENANCE_START, mappedSlot.startDate.toString())
        assertEquals(TOURNAMENT_MAINTENANCE_END, mappedSlot.endDate?.toString())
        assertEquals(TOURNAMENT_MAINTENANCE_FIELD_ID, mappedSlot.scheduledFieldId)
        assertEquals(listOf(TOURNAMENT_MAINTENANCE_FIELD_ID), mappedSlot.scheduledFieldIds)
        assertEquals(listOf(TOURNAMENT_MAINTENANCE_DIVISION_ID), mappedSlot.divisions)

        val canonicalMatches = graph.canonicalMatches
        assertEquals(
            listOf(
                TOURNAMENT_MAINTENANCE_PROTECTED_MATCH_ID,
                TOURNAMENT_MAINTENANCE_GENERATED_MATCH_ID,
            ),
            canonicalMatches.map { it.id },
        )
        val protectedMatch = canonicalMatches.first { it.id == TOURNAMENT_MAINTENANCE_PROTECTED_MATCH_ID }
        assertTrue(protectedMatch.locked)
        assertEquals(TOURNAMENT_MAINTENANCE_PROTECTED_START, protectedMatch.start)
        assertEquals(TOURNAMENT_MAINTENANCE_PROTECTED_END, protectedMatch.end)
        val generatedMatch = canonicalMatches.first { it.id == TOURNAMENT_MAINTENANCE_GENERATED_MATCH_ID }
        assertFalse(generatedMatch.locked)
        assertEquals(TOURNAMENT_MAINTENANCE_GENERATED_START, generatedMatch.start)
        assertEquals(TOURNAMENT_MAINTENANCE_GENERATED_END, generatedMatch.end)

        val projectedProtectedMatch = graph.matches.first { it.id == TOURNAMENT_MAINTENANCE_PROTECTED_MATCH_ID }
        assertEquals(protectedMatch.start, projectedProtectedMatch.start)
        assertEquals(protectedMatch.end, projectedProtectedMatch.end)
        assertEquals(protectedMatch.locked, projectedProtectedMatch.locked)
        assertEquals(protectedMatch.fieldId, projectedProtectedMatch.fieldId)

        val mappedMatchDto = assertNotNull(graph.event.matches)
            .first { it.id == TOURNAMENT_MAINTENANCE_PROTECTED_MATCH_ID }
        val mappedMatch = assertNotNull(mappedMatchDto.toMatchOrNull())
        assertEquals(TOURNAMENT_MAINTENANCE_PROTECTED_MATCH_ID, mappedMatch.id)
        assertEquals(TOURNAMENT_MAINTENANCE_PROTECTED_START, mappedMatch.start?.toString())
        assertEquals(TOURNAMENT_MAINTENANCE_PROTECTED_END, mappedMatch.end?.toString())
        assertEquals(TOURNAMENT_MAINTENANCE_FIELD_ID, mappedMatch.fieldId)
        assertTrue(mappedMatch.locked)
    }
}

private fun jsonObject(vararg entries: Pair<String, Any?>): JsonObject =
    jsonMVP.parseToJsonElement(
        entries.joinToString(prefix = "{", postfix = "}") { (key, value) ->
            val encoded = when (value) {
                is String -> "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
                is Boolean, is Number -> value.toString()
                is List<*> -> value.joinToString(prefix = "[", postfix = "]") { item -> item.toString() }
                null -> "null"
                else -> error("Unsupported JSON fixture value: $value")
            }
            "\"$key\":$encoded"
        },
    ).jsonObject

internal val EXPECTED_TOURNAMENT_PARITY_WIRE =
    """
{
  "contractVersion": 4,
  "createOperationId": "create-operation-tournament-parity",
  "expectedRevisions": {
    "editorRevision": "new",
    "staffRevision": null,
    "scheduleRevision": "new"
  },
  "draft": {
    "basics": {
      "name": "Canonical Tournament",
      "description": "A complete Tournament parity fixture with pool play and championship brackets.",
      "eventType": "TOURNAMENT",
      "sportIds": [
        "sport_pickleball"
      ],
      "start": "2026-10-03T08:00:00Z",
      "timeZone": "UTC",
      "location": "Building B",
      "address": "2 Main Street",
      "coordinates": [
        0.0,
        0.0
      ],
      "affiliateUrl": "",
      "parentEvent": "parent-tournament-1",
      "organizationId": "organization-tournament-1",
      "hostId": "host-tournament-1",
      "state": "UNPUBLISHED",
      "imageId": "image-tournament-1",
      "tags": [
        {
          "id": "tag-tournament-1",
          "slug": "championship",
          "name": "Championship"
        }
      ]
    },
    "participation": {
      "teamSignup": true,
      "singleDivision": false,
      "registrationByDivisionType": true,
      "teamSizeLimit": 2,
      "maxParticipants": 12,
      "minAge": 18,
      "maxAge": 99,
      "cancellationRefundHours": 48,
      "registrationCutoffHours": 24,
      "allowTeamSplitDefault": true,
      "waitListIds": [
        "wait-tournament-1"
      ],
      "freeAgentIds": [
        "free-agent-tournament-1"
      ]
    },
    "registration": {
      "payment": {
        "mode": "ONLINE",
        "priceCents": 7500,
        "taxHandling": "INCLUSIVE",
        "organizerManualTaxRateBps": 0,
        "manualPaymentLinks": [],
        "allowPaymentPlans": false,
        "installmentDueDates": [],
        "installmentDueRelativeDays": [],
        "installmentAmounts": [],
        "manualPaymentInstructions": null,
        "installmentCount": null
      },
      "questions": [
        {
          "clientId": "question-tournament-1",
          "prompt": "Preferred match time?",
          "answerType": "TEXT",
          "required": true,
          "sortOrder": 0
        }
      ],
      "requiredDocumentIds": [
        "document-tournament-waiver"
      ]
    },
    "competition": {
      "divisionIds": [
        "tournament-pool-a",
        "tournament-pool-b"
      ],
      "divisionDetails": [
        {
          "id": "tournament-pool-a",
          "sourceDivisionId": "tournament-entry-a",
          "key": "pool-a",
          "name": "Pool A",
          "kind": "LEAGUE",
          "isSystemGenerated": false,
          "poolPlay": true,
          "divisionTypeId": "skill_open_age_18plus",
          "skillDivisionTypeId": "open",
          "ageDivisionTypeId": "18plus",
          "divisionTypeName": "Open 18+",
          "ratingType": "SKILL",
          "gender": "C",
          "maxParticipants": 6.0,
          "playoffTeamCount": 4.0,
          "poolCount": 2.0,
          "poolTeamCount": 3.0,
          "phaseSettings": {},
          "playoffPlacementDivisionIds": [
            "tournament-pool-a"
          ],
          "gamesPerOpponent": 2.0,
          "restTimeMinutes": 10.0,
          "usesSets": true,
          "matchDurationMinutes": 45.0,
          "setDurationMinutes": 15.0,
          "setsPerMatch": 3.0,
          "pointsToVictory": [
            21,
            21,
            15
          ],
          "installmentDueDates": [],
          "installmentDueRelativeDays": [],
          "installmentAmounts": [],
          "fieldIds": [
            "tournament-field-1"
          ],
          "teamIds": [
            "tournament-team-a-1",
            "tournament-team-a-2",
            "tournament-team-a-3",
            "tournament-team-a-4",
            "tournament-team-a-5",
            "tournament-team-a-6"
          ]
        },
        {
          "id": "tournament-pool-b",
          "sourceDivisionId": "tournament-entry-b",
          "key": "pool-b",
          "name": "Pool B",
          "kind": "LEAGUE",
          "isSystemGenerated": false,
          "poolPlay": true,
          "divisionTypeId": "skill_open_age_18plus",
          "skillDivisionTypeId": "open",
          "ageDivisionTypeId": "18plus",
          "divisionTypeName": "Open 18+",
          "ratingType": "SKILL",
          "gender": "C",
          "maxParticipants": 6.0,
          "playoffTeamCount": 4.0,
          "poolCount": 2.0,
          "poolTeamCount": 3.0,
          "phaseSettings": {},
          "playoffPlacementDivisionIds": [
            "tournament-pool-b"
          ],
          "gamesPerOpponent": 2.0,
          "restTimeMinutes": 10.0,
          "usesSets": true,
          "matchDurationMinutes": 45.0,
          "setDurationMinutes": 15.0,
          "setsPerMatch": 3.0,
          "pointsToVictory": [
            21,
            21,
            15
          ],
          "installmentDueDates": [],
          "installmentDueRelativeDays": [],
          "installmentAmounts": [],
          "fieldIds": [
            "tournament-field-1"
          ],
          "teamIds": [
            "tournament-team-b-1",
            "tournament-team-b-2",
            "tournament-team-b-3",
            "tournament-team-b-4",
            "tournament-team-b-5",
            "tournament-team-b-6"
          ]
        }
      ],
      "playoffDivisionDetails": [
        {
          "id": "tournament-pool-a",
          "sourceDivisionId": "tournament-entry-a",
          "key": "pool-a",
          "name": "Pool A Bracket",
          "kind": "PLAYOFF",
          "isSystemGenerated": false,
          "poolPlay": true,
          "divisionTypeId": "skill_open_age_18plus",
          "skillDivisionTypeId": "open",
          "ageDivisionTypeId": "18plus",
          "divisionTypeName": "Open 18+",
          "ratingType": "SKILL",
          "gender": "C",
          "maxParticipants": 6.0,
          "playoffTeamCount": 4.0,
          "poolCount": 2.0,
          "poolTeamCount": 3.0,
          "phaseSettings": {},
          "playoffPlacementDivisionIds": [],
          "playoffConfig": {
            "doubleElimination": true,
            "winnerSetCount": 4,
            "loserSetCount": 1,
            "winnerBracketPointsToVictory": [
              27,
              25,
              21,
              15
            ],
            "loserBracketPointsToVictory": [
              23
            ],
            "prize": "Pool A Championship Trophy",
            "fieldCount": 1,
            "restTimeMinutes": 8,
            "matchDurationMinutes": 40,
            "setDurationMinutes": 12
          },
          "gamesPerOpponent": 2.0,
          "restTimeMinutes": 10.0,
          "usesSets": true,
          "matchDurationMinutes": 45.0,
          "setDurationMinutes": 15.0,
          "setsPerMatch": 3.0,
          "pointsToVictory": [
            21,
            21,
            15
          ],
          "installmentDueDates": [],
          "installmentDueRelativeDays": [],
          "installmentAmounts": [],
          "fieldIds": [
            "tournament-field-1"
          ],
          "teamIds": []
        },
        {
          "id": "tournament-pool-b",
          "sourceDivisionId": "tournament-entry-b",
          "key": "pool-b",
          "name": "Pool B Bracket",
          "kind": "PLAYOFF",
          "isSystemGenerated": false,
          "poolPlay": true,
          "divisionTypeId": "skill_open_age_18plus",
          "skillDivisionTypeId": "open",
          "ageDivisionTypeId": "18plus",
          "divisionTypeName": "Open 18+",
          "ratingType": "SKILL",
          "gender": "C",
          "maxParticipants": 6.0,
          "playoffTeamCount": 4.0,
          "poolCount": 2.0,
          "poolTeamCount": 3.0,
          "phaseSettings": {},
          "playoffPlacementDivisionIds": [],
          "playoffConfig": {
            "doubleElimination": true,
            "winnerSetCount": 5,
            "loserSetCount": 3,
            "winnerBracketPointsToVictory": [
              31,
              29,
              27,
              25,
              15
            ],
            "loserBracketPointsToVictory": [
              23,
              21,
              15
            ],
            "prize": "Pool B Championship Trophy",
            "fieldCount": 1,
            "restTimeMinutes": 6,
            "matchDurationMinutes": 50,
            "setDurationMinutes": 10
          },
          "gamesPerOpponent": 2.0,
          "restTimeMinutes": 10.0,
          "usesSets": true,
          "matchDurationMinutes": 45.0,
          "setDurationMinutes": 15.0,
          "setsPerMatch": 3.0,
          "pointsToVictory": [
            21,
            21,
            15
          ],
          "installmentDueDates": [],
          "installmentDueRelativeDays": [],
          "installmentAmounts": [],
          "fieldIds": [
            "tournament-field-1"
          ],
          "teamIds": []
        }
      ],
      "divisionFieldIds": {
        "tournament-pool-a": [
          "tournament-field-1"
        ],
        "tournament-pool-b": [
          "tournament-field-1"
        ]
      },
      "winnerSetCount": 3,
      "loserSetCount": 2,
      "doubleElimination": true,
      "includePlayoffs": true,
      "splitLeaguePlayoffDivisions": false,
      "playoffTeamCount": 4,
      "pointsToVictory": [
        21,
        21,
        15
      ],
      "winnerBracketPointsToVictory": [
        25,
        25,
        15
      ],
      "loserBracketPointsToVictory": [
        25,
        15
      ],
      "usesSets": true,
      "setsPerMatch": 3,
      "setDurationMinutes": 15.0,
      "restTimeMinutes": 10.0,
      "matchDurationMinutes": 45.0,
      "gamesPerOpponent": 2,
      "matchRulesOverride": {
        "scoringModel": "POINTS",
        "segmentCount": 3,
        "segmentLabel": "Set",
        "setPointTargets": [
          25,
          25,
          15
        ]
      },
      "leagueScoringConfig": {
        "pointsForWin": 3,
        "pointsForDraw": 1,
        "pointsForLoss": 0
      }
    },
    "schedule": {
      "mode": "FIXED_END",
      "endConstraint": "2026-10-03T20:00:00Z",
      "automatedScheduling": false
    },
    "resources": {
      "fieldIds": [
        "tournament-field-1"
      ],
      "fields": [
        {
          "id": "tournament-field-1",
          "name": "Championship Court",
          "location": "Building B",
          "address": "2 Main Street",
          "inUse": true,
          "rentalSlotIds": [],
          "sportIds": [
            "sport_pickleball"
          ],
          "organizationId": "organization-tournament-1",
          "facilityId": "facility-tournament-1"
        }
      ],
      "timeSlotIds": [
        "tournament-slot-1"
      ],
      "timeSlots": [
        {
          "id": "tournament-slot-1",
          "eventId": "event-tournament-parity",
          "daysOfWeek": [
            5
          ],
          "startTimeMinutes": 480,
          "endTimeMinutes": 1200,
          "startDate": "2026-10-03T08:00:00Z",
          "endDate": "2026-10-03T20:00:00Z",
          "timeZone": "UTC",
          "scheduledFieldIds": [
            "tournament-field-1"
          ],
          "fieldIds": [],
          "divisions": [
            "tournament-pool-a",
            "tournament-pool-b"
          ],
          "divisionKeys": [],
          "requiredTemplateIds": [
            "template-tournament-waiver"
          ],
          "hostRequiredTemplateIds": [
            "template-tournament-host"
          ],
          "repeating": false,
          "sourceType": "EVENT"
        }
      ],
      "requiredTemplateIds": [
        "template-tournament-waiver"
      ],
      "immutableFieldIds": [],
      "rentalBookingId": null,
      "rentalBookingItemId": null
    },
    "staff": {
      "staffingPriority": "OFFICIAL_COVERAGE_REQUIRED",
      "doTeamsOfficiate": true,
      "teamOfficialsMaySwap": true,
      "teamCheckInMode": "MATCH",
      "teamCheckInOpenMinutesBefore": 45,
      "allowMatchRosterEdits": true,
      "allowTemporaryMatchPlayers": true,
      "autoCreatePointMatchIncidents": true,
      "officialIds": [
        "tournament-official-1"
      ],
      "officialPositions": [
        {
          "id": "tournament-position-referee",
          "name": "Referee",
          "count": 2,
          "order": 0
        }
      ],
      "eventOfficials": [
        {
          "id": "event-tournament-official-1",
          "userId": "tournament-official-1",
          "positionIds": [
            "tournament-position-referee"
          ],
          "fieldIds": [
            "tournament-field-1"
          ],
          "isActive": true
        }
      ],
      "assistantHostIds": [
        "tournament-assistant-1"
      ],
      "pendingInvites": [
        {
          "id": "tournament-invite-1",
          "email": "tournament-official@example.test",
          "firstName": "Tournament",
          "lastName": "Official",
          "roles": [
            "OFFICIAL"
          ],
          "staffTypes": [
            "OFFICIAL"
          ],
          "type": "STAFF",
          "status": "PENDING",
          "eventId": "event-tournament-parity",
          "organizationId": "organization-tournament-1"
        }
      ]
    }
  },
  "completion": {
    "mode": "CREATE_ONLY"
  },
  "hasScheduleProposalSupport": false
}
    """.trimIndent()

private fun scheduledTournamentParityWire(): JsonObject =
    jsonMVP.parseToJsonElement(
        EXPECTED_TOURNAMENT_PARITY_WIRE
            .replace("\"createOperationId\": \"$TOURNAMENT_OPERATION_ID\"", "\"createOperationId\": \"$SCHEDULED_TOURNAMENT_OPERATION_ID\"")
            .replace("\"automatedScheduling\": false", "\"automatedScheduling\": true")
            .replace("\"mode\": \"CREATE_ONLY\"", "\"mode\": \"CREATE_AND_BUILD_SCHEDULE\"")
            .replace("\"hasScheduleProposalSupport\": false", "\"hasScheduleProposalSupport\": true"),
    ).jsonObject

private fun tournamentMaintenanceRevisionBinding(): EventEditorRevisionBindingDto =
    EventEditorRevisionBindingDto(
        editorRevision = "editor-revision-tournament-maintenance",
        staffRevision = "staff-revision-tournament-maintenance",
        scheduleRevision = "schedule-revision-tournament-maintenance",
        fieldRevisions = mapOf(
            TOURNAMENT_MAINTENANCE_FIELD_ID to "field-revision-tournament-maintenance",
        ),
        timeSlotRevisions = mapOf(
            TOURNAMENT_MAINTENANCE_SLOT_ID to "slot-revision-tournament-maintenance",
        ),
        rentalBookingRevision = "rental-booking-revision-tournament-maintenance",
        rentalBookingRevisions = mapOf(
            "booking-tournament-maintenance" to "booking-revision-tournament-maintenance",
        ),
        rentalBookingItemRevisions = mapOf(
            "booking-item-tournament-maintenance" to "booking-item-revision-tournament-maintenance",
        ),
        availabilityRevision = "availability-revision-tournament-maintenance",
    )

private fun tournamentMaintenanceCanonicalEvent(): EventEditorMaintenanceGraphEventDto {
    val division = EventEditorMaintenanceGraphDivisionDto(
        id = TOURNAMENT_MAINTENANCE_DIVISION_ID,
        name = "Championship",
        kind = "LEAGUE",
        role = "SOURCE",
        phase = "LEAGUE",
        sourceDivisionId = null,
        isSystemGenerated = false,
        phaseSettings = mapOf(
            "LEAGUE" to EventEditorMaintenanceGraphPhaseSettingsDto(
                matchRulesOverride = JsonNull,
                autoCreatePointMatchIncidents = true,
                segmentLengthMinutes = 10,
                segmentBreakMinutes = 2,
                doTeamsOfficiate = false,
                officialPositions = emptyList(),
            ),
        ),
        teamIds = emptyList(),
        playoffTeamCount = 4,
        playoffPlacementDivisionIds = emptyList(),
        standingsOverrides = mapOf("seed-1" to 2.0),
        standingsConfirmedAt = "2026-10-03T07:00:00Z",
        standingsConfirmedBy = "official-tournament-maintenance",
        playoffConfig = null,
        leagueConfig = com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphLeagueConfigDto(
            gamesPerOpponent = 2,
            includePlayoffs = true,
            playoffTeamCount = 4,
            usesSets = true,
            matchDurationMinutes = 45,
            setDurationMinutes = 15,
            setsPerMatch = 3,
            pointsToVictory = listOf(21.0, 15.0),
            restTimeMinutes = 10,
        ),
    )
    val field = EventEditorMaintenanceGraphFieldDto(
        id = TOURNAMENT_MAINTENANCE_FIELD_ID,
        organizationId = "organization-tournament-maintenance",
        divisions = listOf(TOURNAMENT_MAINTENANCE_DIVISION_ID),
        name = "Championship Court",
    )
    val timeSlot = EventEditorMaintenanceGraphTimeSlotDto(
        id = TOURNAMENT_MAINTENANCE_SLOT_ID,
        dayOfWeek = 5,
        daysOfWeek = listOf(5),
        startDate = TOURNAMENT_MAINTENANCE_START,
        endDate = TOURNAMENT_MAINTENANCE_END,
        repeating = false,
        startTimeMinutes = 480,
        endTimeMinutes = 1200,
        price = 25.0,
        scheduledFieldId = TOURNAMENT_MAINTENANCE_FIELD_ID,
        scheduledFieldIds = listOf(TOURNAMENT_MAINTENANCE_FIELD_ID),
        divisions = listOf(TOURNAMENT_MAINTENANCE_DIVISION_ID),
    )
    return EventEditorMaintenanceGraphEventDto(
        id = TOURNAMENT_MAINTENANCE_EVENT_ID,
        name = "Canonical Maintenance Tournament",
        description = "Canonical graph returned by maintenance acceptance.",
        start = TOURNAMENT_MAINTENANCE_START,
        end = TOURNAMENT_MAINTENANCE_END,
        location = "Building B",
        coordinates = listOf(1.0, 2.0),
        price = 75.0,
        minAge = 18,
        maxAge = 99,
        rating = 4.5,
        imageId = "image-tournament-maintenance",
        hostId = "host-tournament-maintenance",
        noFixedEndDateTime = false,
        scheduleEndConstraint = TOURNAMENT_MAINTENANCE_END,
        generatedScheduleEnd = TOURNAMENT_MAINTENANCE_END,
        state = "PUBLISHED",
        maxParticipants = 12,
        teamSizeLimit = 2,
        restTimeMinutes = 10,
        teamSignup = true,
        singleDivision = false,
        waitListIds = emptyList(),
        freeAgentIds = emptyList(),
        teamIds = emptyList(),
        userIds = emptyList(),
        fieldIds = listOf(TOURNAMENT_MAINTENANCE_FIELD_ID),
        timeSlotIds = listOf(TOURNAMENT_MAINTENANCE_SLOT_ID),
        officialIds = emptyList(),
        officialSchedulingMode = "SCHEDULE",
        staffingPriority = "BEST_AVAILABLE_COVERAGE",
        officialPositions = emptyList(),
        eventOfficials = emptyList(),
        matchRulesOverride = JsonNull,
        autoCreatePointMatchIncidents = false,
        resolvedMatchRules = JsonNull,
        cancellationRefundHours = 48,
        registrationCutoffHours = 24,
        seedColor = 7,
        eventType = "TOURNAMENT",
        sportIds = listOf("sport-tournament-maintenance"),
        leagueScoringConfigId = null,
        organizationId = "organization-tournament-maintenance",
        requiredTemplateIds = listOf("template-tournament-maintenance"),
        allowPaymentPlans = false,
        installmentCount = 0,
        installmentDueDates = emptyList(),
        installmentDueRelativeDays = emptyList(),
        installmentAmounts = emptyList(),
        allowTeamSplitDefault = true,
        splitLeaguePlayoffDivisions = false,
        divisions = listOf(TOURNAMENT_MAINTENANCE_DIVISION_ID),
        divisionDetails = listOf(division),
        playoffDivisionDetails = emptyList(),
        fields = listOf(field),
        teams = emptyList(),
        timeSlots = listOf(timeSlot),
        officials = emptyList(),
        doubleElimination = true,
        winnerSetCount = 3,
        loserSetCount = 2,
        winnerBracketPointsToVictory = listOf(25.0, 15.0),
        loserBracketPointsToVictory = listOf(15.0),
        prize = "Championship Trophy",
        fieldCount = 1,
        matches = null,
        usesSets = true,
        matchDurationMinutes = 45,
        setDurationMinutes = 15,
        setsPerMatch = 3,
        doTeamsOfficiate = false,
        teamOfficialsMaySwap = false,
        teamCheckInMode = "MATCH",
        teamCheckInOpenMinutesBefore = 45,
        allowMatchRosterEdits = true,
        allowTemporaryMatchPlayers = true,
        gamesPerOpponent = 2,
        includePlayoffs = true,
        playoffTeamCount = 4,
        pointsToVictory = listOf(21.0, 15.0),
    )
}

private fun tournamentMaintenanceCanonicalMatch(
    id: String,
    matchId: Int,
    start: String,
    end: String,
    locked: Boolean,
    team1Points: List<Double>,
    team2Points: List<Double>,
): EventEditorMaintenanceGraphMatchDto =
    EventEditorMaintenanceGraphMatchDto(
        id = id,
        matchId = matchId,
        eventId = TOURNAMENT_MAINTENANCE_EVENT_ID,
        start = start,
        end = end,
        locked = locked,
        placementState = "PLACED",
        phase = "LEAGUE",
        sourceDivisionId = TOURNAMENT_MAINTENANCE_DIVISION_ID,
        phaseDivisionId = TOURNAMENT_MAINTENANCE_DIVISION_ID,
        division = TOURNAMENT_MAINTENANCE_DIVISION_ID,
        fieldId = TOURNAMENT_MAINTENANCE_FIELD_ID,
        team1Id = null,
        team2Id = null,
        team1Seed = 1,
        team2Seed = 2,
        status = "SCHEDULED",
        resultStatus = "PENDING",
        resultType = null,
        actualStart = null,
        actualEnd = null,
        statusReason = null,
        winnerEventTeamId = null,
        segments = emptyList(),
        incidents = emptyList(),
        officialIds = emptyList(),
        officialAssignments = emptyList(),
        teamOfficialId = null,
        teamOfficialSeed = JsonNull,
        matchRulesSnapshot = JsonNull,
        resolvedMatchRules = JsonNull,
        team1Points = team1Points,
        team2Points = team2Points,
        losersBracket = false,
        winnerNextMatchId = null,
        loserNextMatchId = null,
        previousLeftId = null,
        previousRightId = null,
        side = null,
        officialCheckedIn = false,
        team1 = null,
        team2 = null,
        teamOfficial = null,
        official = null,
        field = null,
    )

private fun tournamentMaintenanceGraph(): EventEditorMaintenanceGraphDto {
    val canonicalEvent = tournamentMaintenanceCanonicalEvent()
    val canonicalMatches = listOf(
        tournamentMaintenanceCanonicalMatch(
            id = TOURNAMENT_MAINTENANCE_PROTECTED_MATCH_ID,
            matchId = 1,
            start = TOURNAMENT_MAINTENANCE_PROTECTED_START,
            end = TOURNAMENT_MAINTENANCE_PROTECTED_END,
            locked = true,
            team1Points = listOf(21.0, 15.0),
            team2Points = listOf(19.0, 13.0),
        ),
        tournamentMaintenanceCanonicalMatch(
            id = TOURNAMENT_MAINTENANCE_GENERATED_MATCH_ID,
            matchId = 2,
            start = TOURNAMENT_MAINTENANCE_GENERATED_START,
            end = TOURNAMENT_MAINTENANCE_GENERATED_END,
            locked = false,
            team1Points = listOf(21.0),
            team2Points = listOf(17.0),
        ),
    )
    val projections = canonicalMatches.map { match ->
        EventEditorMatchProjectionDto(
            id = match.id,
            matchId = match.matchId,
            eventId = match.eventId,
            start = match.start,
            end = match.end,
            locked = match.locked,
            placementState = match.placementState,
            phase = match.phase,
            sourceDivisionId = match.sourceDivisionId,
            phaseDivisionId = match.phaseDivisionId,
            division = match.division,
            fieldId = match.fieldId,
            team1Id = match.team1Id,
            team2Id = match.team2Id,
            team1Seed = match.team1Seed,
            team2Seed = match.team2Seed,
            status = match.status,
            resultStatus = match.resultStatus,
            resultType = match.resultType,
            actualStart = match.actualStart,
            actualEnd = match.actualEnd,
            statusReason = match.statusReason,
            winnerEventTeamId = match.winnerEventTeamId,
            matchRulesSnapshot = null,
            resolvedMatchRules = null,
            segments = emptyList(),
            incidents = emptyList(),
            officialIds = emptyList(),
            teamOfficialId = match.teamOfficialId,
            team1Points = match.team1Points,
            team2Points = match.team2Points,
            losersBracket = match.losersBracket,
            winnerNextMatchId = match.winnerNextMatchId,
            loserNextMatchId = match.loserNextMatchId,
            previousLeftId = match.previousLeftId,
            previousRightId = match.previousRightId,
            side = match.side,
            officialCheckedIn = match.officialCheckedIn,
        )
    }
    val rawEvent = TOURNAMENT_MAINTENANCE_RESPONSE_JSON.encodeToJsonElement(
        EventEditorMaintenanceGraphEventDto.serializer(),
        canonicalEvent,
    ).jsonObject
    val rawMatches = canonicalMatches.map { match ->
        TOURNAMENT_MAINTENANCE_RESPONSE_JSON.encodeToJsonElement(
            EventEditorMaintenanceGraphMatchDto.serializer(),
            match,
        ).jsonObject
    }
    return EventEditorMaintenanceGraphDto(
        event = EventApiDto(id = TOURNAMENT_MAINTENANCE_EVENT_ID),
        matches = projections,
        canonicalEvent = canonicalEvent,
        canonicalMatches = canonicalMatches,
        rawEvent = rawEvent,
        rawMatches = rawMatches,
    )
}

private fun tournamentMaintenanceProposal(
    request: EventEditorMaintenanceRequestDto,
): EventEditorMaintenanceProposalDto {
    val graph = tournamentMaintenanceGraph()
    return EventEditorMaintenanceProposalDto(
        status = EventEditorMaintenanceResponseStatus.PROPOSED,
        contractVersion = request.contractVersion,
        eventId = request.eventId,
        operation = request.operation,
        operationId = request.operationId,
        proposalRevision = TOURNAMENT_MAINTENANCE_PROPOSAL_REVISION,
        revisionBinding = request.expectedRevisions ?: tournamentMaintenanceRevisionBinding(),
        graph = graph,
        protectedMatchIds = listOf(TOURNAMENT_MAINTENANCE_PROTECTED_MATCH_ID),
        scheduleOutcome = EventEditorMaintenanceScheduleOutcomeDto(
            status = EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE,
            isComplete = true,
            matchCount = graph.matches.size,
            placedMatchCount = graph.matches.size,
            unplacedMatchCount = 0,
            matches = graph.matches,
            unscheduledMatches = emptyList(),
            affectedCompetitionPhases = emptyList(),
            warnings = emptyList(),
        ),
    )
}

private fun tournamentMaintenanceAcceptedResult(
    proposal: EventEditorMaintenanceProposalDto,
): EventEditorMaintenanceAcceptedResultDto =
    EventEditorMaintenanceAcceptedResultDto(
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
        acceptanceOperationId = TOURNAMENT_MAINTENANCE_ACCEPTANCE_ID,
    )

private fun tournamentMaintenanceResponseBody(
    proposal: EventEditorMaintenanceProposalDto,
): String = TOURNAMENT_MAINTENANCE_RESPONSE_JSON.encodeToString(
    EventEditorMaintenanceProposalDto.serializer(),
    proposal,
)

private fun tournamentMaintenanceResponseBody(
    accepted: EventEditorMaintenanceAcceptedResultDto,
): String = TOURNAMENT_MAINTENANCE_RESPONSE_JSON.encodeToString(
    EventEditorMaintenanceAcceptedResultDto.serializer(),
    accepted,
)
