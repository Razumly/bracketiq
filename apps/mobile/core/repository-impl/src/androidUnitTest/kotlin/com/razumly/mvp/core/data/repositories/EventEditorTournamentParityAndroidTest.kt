package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.dto.EventEditorCapabilitiesDto
import com.razumly.mvp.core.network.dto.EventEditorCatalogsDto
import com.razumly.mvp.core.network.dto.EventEditorCreateBootstrapDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorImmutableDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleStateDto
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.dto.encodeEventEditorCreateCommand
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import java.io.File
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

@Serializable
private data class TournamentParityWebGoldenDto(
    val command: EventEditorCreateCommandDto,
    val matchDemand: TournamentParityMatchDemandDto,
)

@Serializable
private data class TournamentParityMatchDemandDto(
    val total: Int,
    val byDivision: Map<String, Int>,
    val byPhase: Map<String, Int>,
    val placed: Int,
    val unplaced: Int,
)

private val strictFixtureJson = Json {
    isLenient = false
    ignoreUnknownKeys = false
    coerceInputValues = false
}

class EventEditorTournamentParityAndroidTest {
    @Test
    fun given_shared_tournament_fixture_when_mobile_command_is_built_then_it_matches_the_web_golden() {
        val draft = sharedTournamentParityDraft()
        val golden = sharedTournamentParityWebGolden()
        val expectedCommand = golden.command

        // The root fixture is a neutral editor shape. Map its neutral schedule key
        // to the mobile DTO's canonical serial name before decoding it.
        assertFalse(draft.schedule.isAutomatedScheduling)
        assertEquals(expectedCommand.draft, draft)
        assertFalse(expectedCommand.draft.schedule.isAutomatedScheduling)
        assertEquals("CREATE_ONLY", expectedCommand.completion.mode.name)
        assertFalse(expectedCommand.hasScheduleProposalSupport)
        assertEquals(45.0, expectedCommand.draft.competition.matchDurationMinutes)
        assertEquals(2.0, expectedCommand.draft.competition.divisionDetails[0].poolCount)
        assertEquals(3.0, expectedCommand.draft.competition.divisionDetails[0].poolTeamCount)
        assertEquals(4.0, expectedCommand.draft.competition.divisionDetails[0].playoffTeamCount)
        assertEquals(2, expectedCommand.draft.competition.playoffDivisionDetails.size)
        assertEquals(true, expectedCommand.draft.staff.doTeamsOfficiate)
        assertEquals(true, expectedCommand.draft.staff.teamOfficialsMaySwap)

        val session = EventEditorSessionMapper.fromCreateBootstrap(
            EventEditorCreateBootstrapDto(
                contractVersion = expectedCommand.contractVersion,
                createOperationId = expectedCommand.createOperationId,
                snapshot = EventEditorSnapshotDto(
                    contractVersion = expectedCommand.contractVersion,
                    draft = draft,
                    mode = "CREATE",
                    editorRevision = expectedCommand.expectedRevisions.editorRevision,
                    staffRevision = expectedCommand.expectedRevisions.staffRevision,
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
                        revision = expectedCommand.expectedRevisions.scheduleRevision,
                        hasProtectedHistory = false,
                    ),
                ),
            ),
        )

        val command = EventEditorSessionMapper.toCreateCommand(
            session = session,
            mutation = EventEditorMutation(session.canonicalState),
        ).command

        assertEquals(expectedCommand, command)
        assertEquals(
            jsonMVP.parseToJsonElement(EXPECTED_TOURNAMENT_PARITY_WIRE).jsonObject,
            encodeEventEditorCreateCommand(command),
        )
        assertEquals(
            TournamentParityMatchDemandDto(
                total = 38,
                byDivision = mapOf(
                    "event-tournament-parity__division__pool_a_pool_a__phase__pool" to 6,
                    "event-tournament-parity__division__pool_a_pool_b__phase__pool" to 6,
                    "event-tournament-parity__division__pool_b_pool_a__phase__pool" to 6,
                    "event-tournament-parity__division__pool_b_pool_b__phase__pool" to 6,
                    "event-tournament-parity__division__tournament_pool_a" to 7,
                    "event-tournament-parity__division__tournament_pool_b" to 7,
                ),
                byPhase = mapOf(
                    "POOL" to 24,
                    "BRACKET" to 14,
                ),
                placed = 0,
                unplaced = 38,
            ),
            golden.matchDemand,
        )
    }

    @Test
    fun given_scheduled_tournament_fixture_when_mobile_command_is_built_then_it_matches_the_web_golden() {
        val golden = sharedScheduledTournamentParityWebGolden()
        val expectedCommand = golden.command
        val draft = expectedCommand.draft
        assertEquals(
            "create-operation-tournament-parity-scheduled",
            expectedCommand.createOperationId,
        )

        assertEquals("FIXED_END", draft.schedule.mode)
        assertEquals("2026-10-03T20:00:00Z", draft.schedule.endConstraint)
        assertEquals(true, draft.schedule.isAutomatedScheduling)
        assertEquals("CREATE_AND_BUILD_SCHEDULE", expectedCommand.completion.mode.name)
        assertEquals(true, expectedCommand.hasScheduleProposalSupport)

        val session = EventEditorSessionMapper.fromCreateBootstrap(
            EventEditorCreateBootstrapDto(
                contractVersion = expectedCommand.contractVersion,
                createOperationId = expectedCommand.createOperationId,
                snapshot = EventEditorSnapshotDto(
                    contractVersion = expectedCommand.contractVersion,
                    draft = draft,
                    mode = "CREATE",
                    editorRevision = expectedCommand.expectedRevisions.editorRevision,
                    staffRevision = expectedCommand.expectedRevisions.staffRevision,
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
                        revision = expectedCommand.expectedRevisions.scheduleRevision,
                        hasProtectedHistory = false,
                    ),
                ),
            ),
        )
        val command = EventEditorSessionMapper.toCreateCommand(
            session = session,
            mutation = EventEditorMutation(session.canonicalState),
        ).command

        assertEquals(expectedCommand, command)
        assertEquals(
            TournamentParityMatchDemandDto(
                total = 38,
                byDivision = mapOf(
                    "event-tournament-parity__division__pool_a_pool_a__phase__pool" to 6,
                    "event-tournament-parity__division__pool_a_pool_b__phase__pool" to 6,
                    "event-tournament-parity__division__pool_b_pool_a__phase__pool" to 6,
                    "event-tournament-parity__division__pool_b_pool_b__phase__pool" to 6,
                    "event-tournament-parity__division__tournament_pool_a" to 7,
                    "event-tournament-parity__division__tournament_pool_b" to 7,
                ),
                byPhase = mapOf(
                    "POOL" to 24,
                    "BRACKET" to 14,
                ),
                placed = 0,
                unplaced = 38,
            ),
            golden.matchDemand,
        )
    }


    @Test
    fun given_renamed_required_fixture_field_when_decoded_then_strict_decoder_rejects_it() {
        val rawFixture = sharedParityFixture("tournament-parity-web-golden.json")
        val renamedFixture = rawFixture.replaceFirst(
            "\"hasScheduleProposalSupport\"",
            "\"renamedHasScheduleProposalSupport\"",
        )

        assertFalse(renamedFixture == rawFixture)
        assertFailsWith<SerializationException> {
            strictFixtureJson.decodeFromString<TournamentParityWebGoldenDto>(
                canonicalizeNeutralScheduleKey(renamedFixture).toString(),
            )
        }
    }

    private fun sharedTournamentParityDraft(): EventEditorDraftDto =
        decodeNeutralFixture("tournament-parity-draft.json")

    private fun sharedTournamentParityWebGolden(): TournamentParityWebGoldenDto =
        decodeNeutralFixture("tournament-parity-web-golden.json")

    private fun sharedScheduledTournamentParityWebGolden(): TournamentParityWebGoldenDto =
        decodeNeutralFixture("tournament-parity-scheduled-web-golden.json")

    private inline fun <reified T> decodeNeutralFixture(fileName: String): T =
        strictFixtureJson.decodeFromString(
            canonicalizeNeutralScheduleKey(sharedParityFixture(fileName)).toString(),
        )

    private fun canonicalizeNeutralScheduleKey(raw: String): JsonElement =
        canonicalizeNeutralScheduleKey(jsonMVP.parseToJsonElement(raw))

    private fun canonicalizeNeutralScheduleKey(element: JsonElement): JsonElement = when (element) {
        is JsonObject -> buildJsonObject {
            element.forEach { (key, value) ->
                if (key == "schedule" && value is JsonObject) {
                    put(key, buildJsonObject {
                        value.forEach { (scheduleKey, scheduleValue) ->
                            if (scheduleKey == "isAutomatedScheduling") {
                                put("automatedScheduling", scheduleValue)
                            } else {
                                put(scheduleKey, canonicalizeNeutralScheduleKey(scheduleValue))
                            }
                        }
                    })
                } else {
                    put(key, canonicalizeNeutralScheduleKey(value))
                }
            }
        }

        is JsonArray -> JsonArray(element.map(::canonicalizeNeutralScheduleKey))
        else -> element
    }

    private fun sharedParityFixture(fileName: String): String {
        val workingDirectory = File(System.getProperty("user.dir", ".")).canonicalFile
        val fixture = generateSequence(workingDirectory) { directory -> directory.parentFile }
            .map { directory -> File(directory, "test-fixtures/event-editor/$fileName") }
            .firstOrNull { candidate -> candidate.isFile }
        return requireNotNull(fixture) {
            "The shared Tournament parity fixture is missing: $fileName."
        }.readText()
    }
}
