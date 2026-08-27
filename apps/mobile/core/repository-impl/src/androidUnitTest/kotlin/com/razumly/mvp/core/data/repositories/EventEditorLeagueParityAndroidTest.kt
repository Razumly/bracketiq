package com.razumly.mvp.core.data.repositories

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
import kotlinx.serialization.encodeToString
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
        assertEquals(expectedCommand.draft, draft)

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
            jsonMVP.encodeToString(expectedCommand),
            jsonMVP.encodeToString(command),
        )
        assertEquals(19, golden.matchDemand.total)
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
        val workingDirectory = File(System.getProperty("user.dir", ".")).canonicalFile
        val fixture = generateSequence(workingDirectory) { directory -> directory.parentFile }
            .map { directory -> File(directory, "test-fixtures/event-editor/$fileName") }
            .firstOrNull { candidate -> candidate.isFile }
        return requireNotNull(fixture) {
            "The shared League parity fixture is missing: $fileName."
        }.readText()
    }
}
