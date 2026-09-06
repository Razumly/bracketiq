@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.util.newId
import com.razumly.mvp.testing.MobileApiTestSession
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.minutes

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class OperationalRosterMobileApiIntegrationTest {
    private fun fixture(action: String, eventId: String) {
        val directory = System.getenv("MVP_SITE_DIR")?.let(::File)
            ?: listOf(File("../site"), File("../../site")).first { File(it, "package.json").isFile }
        val output = File.createTempFile("issue152-site-", ".log")
        try {
            val process = ProcessBuilder("node", "node_modules/tsx/dist/cli.mjs", "scripts/test-operational-roster-fixtures.ts", action, eventId)
                .directory(directory).redirectErrorStream(true).redirectOutput(output).start()
            check(process.waitFor(90, TimeUnit.SECONDS)) { "The roster fixture did not finish." }
            check(process.exitValue() == 0) { output.readText() }
        } finally { output.delete() }
    }

    @Test
    fun given_complete_rosters_when_host_and_assigned_official_read_then_site_evidence_reaches_room() = runTest(timeout = 10.minutes) {
        assumeTrue("Set MVP_TEST_BACKEND_URL to run the real site contract.", !System.getenv("MVP_TEST_BACKEND_URL").isNullOrBlank())
        val eventId = "issue152-${newId()}"
        fixture("seed", eventId)
        val host = MobileApiTestSession.create()
        val official = MobileApiTestSession.create()
        val member = MobileApiTestSession.create()
        try {
            host.userRepository.login("host@example.com", "password123!").getOrThrow()
            official.userRepository.login("player@example.com", "password123!").getOrThrow()
            member.userRepository.login("member@example.com", "password123!").getOrThrow()
            val matchId = "$eventId-match"
            val hostRoster = host.matchRepository.getMatchRosters(eventId, matchId).getOrThrow()
            val officialRoster = official.matchRepository.getMatchRosters(eventId, matchId).getOrThrow()
            assertEquals(4, hostRoster.rosters.sumOf { it.entries.size })
            assertEquals(hostRoster.rosters.map { it.entries }, officialRoster.rosters.map { it.entries })
            assertTrue(hostRoster.rosters.all { it.canEdit == true })
            assertTrue(officialRoster.rosters.all { it.canEdit == false })
            assertTrue(officialRoster.rosters.flatMap { it.entries }.all { it.documentReadiness?.documents?.requiredCount == 1 })
            assertEquals(officialRoster, official.matchRepository.observeMatchRosters(eventId, matchId).first())
            assertTrue(member.matchRepository.getMatchRosters(eventId, matchId).isFailure)
            fixture("satisfy", eventId)
            val completed = official.matchRepository.getMatchRosters(eventId, matchId).getOrThrow()
            assertEquals(completed, official.matchRepository.observeMatchRosters(eventId, matchId).first())
            val players = completed.rosters.flatMap { it.entries }.associateBy { it.userId }
            for (player in listOf("accepted", "managed", "child")) {
                assertEquals(1, players["$eventId-$player"]?.documentReadiness?.documents?.signedCount)
            }
            assertEquals(0, players["$eventId-expired"]?.documentReadiness?.documents?.signedCount)
            assertFalse(official.matchRepository.removeMatchRosterPlayer(eventId, matchId, "$eventId-team1", "$eventId-managed").isSuccess)
        } finally {
            member.close()
            official.close()
            host.close()
        }
    }
}
