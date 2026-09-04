package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.dto.EVENT_EDITOR_CONTRACT_VERSION
import com.razumly.mvp.core.network.dto.EventEditorCapabilitiesDto
import com.razumly.mvp.core.network.dto.EventEditorCatalogsDto
import com.razumly.mvp.core.network.dto.EventEditorCreateBootstrapDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorImmutableDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleStateDto
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.util.jsonMVP
import java.io.File
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlin.test.Test
import kotlin.test.assertEquals

@Serializable
private data class LeagueParityWebGoldenDto(
    val command: EventEditorCreateCommandDto,
    val matchDemand: LeagueParityMatchDemandDto,
)
@Serializable
private data class LeagueParityMatchDemandDto(
    val total: Int,
    val byDivision: Map<String, Int>,
    val byPhase: Map<String, Int>,
    val placed: Int,
    val unplaced: Int,
)

class EventEditorLeagueParityAndroidTest {
    @Test
    fun given_shared_league_fixture_when_mobile_command_is_built_then_it_matches_the_web_golden() {
        val draft = sharedLeagueParityDraft()
        val golden = sharedLeagueParityWebGolden()
        val expectedCommand = golden.command

        val session = EventEditorSessionMapper.fromCreateBootstrap(
            EventEditorCreateBootstrapDto(
                contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                createOperationId = "create-operation-league-parity",
                snapshot = EventEditorSnapshotDto(
                    contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                    draft = draft,
                    mode = "CREATE",
                    editorRevision = "new",
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
                        revision = "new",
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
            LeagueParityMatchDemandDto(
                total = 19,
                byDivision = mapOf(
                    "division-1" to 12,
                    "playoff-division-1" to 7,
                ),
                byPhase = mapOf(
                    "LEAGUE" to 12,
                    "PLAYOFF" to 7,
                ),
                placed = 0,
                unplaced = 19,
            ),
            golden.matchDemand,
        )
    }

    private fun sharedLeagueParityDraft(): EventEditorDraftDto {
        return jsonMVP.decodeFromString(
            sharedParityFixture("league-parity-draft.json"),
        )
    }

    private fun sharedLeagueParityWebGolden(): LeagueParityWebGoldenDto {
        return jsonMVP.decodeFromString(
            sharedParityFixture("league-parity-web-golden.json"),
        )
    }

    private fun sharedParityFixture(fileName: String): String {
        val workingDirectory = File(System.getProperty("user.dir") ?: ".").canonicalFile
        val fixture = generateSequence(workingDirectory) { directory -> directory.parentFile }
            .map { directory -> File(directory, "test-fixtures/event-editor/$fileName") }
            .firstOrNull { candidate -> candidate.isFile }
        return requireNotNull(fixture) {
            "The shared League parity fixture is missing: $fileName."
        }.readText()
    }
}
