@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.teamManagement

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.testing.MOBILE_TEST_HOST_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_HOST_PASSWORD
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_PASSWORD
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
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.minutes

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class InvitationRetentionMobileApiIntegrationTest {
    @Test
    fun givenReportedHistory_whenSiteCleansOldAttempts_thenBothRoomViewsKeepOnlyTheCurrentAttempt() = runTest(timeout = 5.minutes) {
        assumeTrue("Set MVP_TEST_BACKEND_URL to run the real site contract.", !System.getenv("MVP_TEST_BACKEND_URL").isNullOrBlank())
        val manager = MobileApiTestSession.create()
        val recipient = MobileApiTestSession.create()
        var teamId: String? = null
        try {
            val owner = manager.userRepository.login(MOBILE_TEST_HOST_EMAIL, MOBILE_TEST_HOST_PASSWORD).getOrThrow()
            val player = recipient.userRepository.login(MOBILE_TEST_PARTICIPANT_EMAIL, MOBILE_TEST_PARTICIPANT_PASSWORD).getOrThrow()
            val team = manager.teamRepository.createTeam(Team(owner.id).copy(name = "Issue 150 ${newId()}", teamSize = 6).withSynchronizedMembership()).getOrThrow()
            teamId = team.id
            val old = assertNotNull(manager.teamRepository.createTeamMemberInvite(team.id, userId = player.id, idempotencyKey = "first").getOrThrow().invite)
            recipient.userRepository.listInvites(player.id).getOrThrow()
            recipient.userRepository.declineAndBlockInvite(old.id, "team", false).getOrThrow()
            recipient.userRepository.removeTeamBlock(team.id, player.id).getOrThrow()
            manager.teamRepository.actOnTeamInvitation(old.id, "reinvite", "second").getOrThrow()
            manager.teamRepository.refreshTeamInvitations(team.id).getOrThrow()
            val before = manager.teamRepository.observeTeamInvitations(team.id).first()
            val current = before.single { it.isCurrentAttempt }
            assertEquals(2, before.size)
            recipient.userRepository.listInvites(player.id).getOrThrow()
            assertNotNull(recipient.database.getInviteDao.getInvite(old.id))

            val site = System.getenv("MVP_SITE_DIR")?.let(::File)
                ?: listOf(File("../site"), File("../../site")).first { File(it, "package.json").isFile }
            val output = File.createTempFile("issue150-cleanup-", ".log")
            try {
                val process = ProcessBuilder("node", "node_modules/tsx/dist/cli.mjs", "scripts/test-invitation-retention-fixtures.ts", "cleanup", team.id)
                    .directory(site).redirectErrorStream(true).redirectOutput(output).start()
                check(process.waitFor(60, TimeUnit.SECONDS)) { "The isolated cleanup did not finish." }
                check(process.exitValue() == 0) { output.readText() }
            } finally { output.delete() }

            manager.teamRepository.refreshTeamInvitations(team.id).getOrThrow()
            recipient.userRepository.listInvites(player.id).getOrThrow()
            assertEquals(listOf(current.id), manager.teamRepository.observeTeamInvitations(team.id).first().map { it.id })
            assertTrue(recipient.userRepository.observeRecipientInvitations(player.id).first().none { it.id == old.id })
            assertEquals("PENDING", recipient.database.getInviteDao.getInvite(current.id)?.status)
            assertEquals(null, manager.database.getInviteDao.getInvite(old.id))
        } finally {
            teamId?.let { manager.deleteTeam(it) }
            recipient.close()
            manager.close()
        }
    }
}
