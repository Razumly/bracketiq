@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.teamManagement

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.dto.InviteResponseDto
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.testing.MOBILE_TEST_HOST_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_HOST_PASSWORD
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_PASSWORD
import com.razumly.mvp.testing.MobileApiTestSession
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.minutes

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class InvitationLifecycleMobileApiIntegrationTest {
    @Test
    fun givenClosedTeam_whenRecipientDeclinesBlocksAndUnblocks_thenHttpAndRoomKeepSeparateAttempts() = runTest(timeout = 5.minutes) {
        assumeTrue("Set MVP_TEST_BACKEND_URL to run the real site contract.", !System.getenv("MVP_TEST_BACKEND_URL").isNullOrBlank())
        val manager = MobileApiTestSession.create()
        val recipient = MobileApiTestSession.create()
        var teamId: String? = null
        var playerId: String? = null
        try {
            val owner = manager.userRepository.login(MOBILE_TEST_HOST_EMAIL, MOBILE_TEST_HOST_PASSWORD).getOrThrow()
            val player = recipient.userRepository.login(MOBILE_TEST_PARTICIPANT_EMAIL, MOBILE_TEST_PARTICIPANT_PASSWORD).getOrThrow()
            playerId = player.id
            val team = manager.teamRepository.createTeam(Team(owner.id).copy(name = "Issue 149 ${newId()}", teamSize = 6).withSynchronizedMembership()).getOrThrow()
            teamId = team.id
            val first = assertNotNull(manager.teamRepository.createTeamMemberInvite(team.id, userId = player.id, idempotencyKey = "first").getOrThrow().invite)
            recipient.userRepository.listInvites(player.id).getOrThrow()
            assertTrue(recipient.userRepository.observeRecipientInvitations(player.id).first().any { it.id == first.id })
            recipient.userRepository.declineInvite(first.id).getOrThrow()
            val closed = assertNotNull(recipient.database.getInviteDao.getInvite(first.id))
            assertEquals("DECLINED", closed.status)
            assertNotNull(closed.finalizedAt)
            manager.teamRepository.refreshTeamInvitations(team.id).getOrThrow()
            assertEquals("DECLINED", manager.teamRepository.observeTeamInvitations(team.id).first().first { it.id == first.id }.status)
            manager.teamRepository.actOnTeamInvitation(first.id, "reinvite", "second").getOrThrow()
            manager.teamRepository.refreshTeamInvitations(team.id).getOrThrow()
            val second = manager.teamRepository.observeTeamInvitations(team.id).first().first { it.isCurrentAttempt }
            assertNotEquals(first.id, second.id)
            assertEquals("PENDING", second.status)
            assertTrue(manager.teamRepository.deleteInvite(first.id).isFailure)
            manager.teamRepository.actOnTeamInvitation(second.id, "remind", "reminder").getOrThrow()
            manager.teamRepository.actOnTeamInvitation(second.id, "remind", "reminder").getOrThrow()
            manager.teamRepository.refreshTeamInvitations(team.id).getOrThrow()
            assertEquals(1, manager.teamRepository.observeTeamInvitations(team.id).first().first { it.id == second.id }.deliveries.count { it.kind == "REMINDER" })
            recipient.userRepository.listInvites(player.id).getOrThrow()
            recipient.userRepository.declineAndBlockInvite(second.id, "team", false).getOrThrow()
            recipient.userRepository.refreshTeamBlocks().getOrThrow()
            assertTrue(recipient.userRepository.observeTeamBlocks().first().any { it.teamId == team.id && it.playerId == player.id })
            val blocked = manager.teamRepository.createTeamMemberInvite(team.id, userId = player.id, idempotencyKey = "blocked")
            assertEquals(403, (blocked.exceptionOrNull() as? ApiException)?.statusCode)
            recipient.userRepository.removeTeamBlock(team.id, player.id).getOrThrow()
            assertTrue(recipient.userRepository.observeTeamBlocks().first().none { it.teamId == team.id })
            assertEquals("DECLINED", recipient.api.get<InviteResponseDto>("api/invites/${second.id}").invite?.status)
            assertEquals(closed.finalizedAt, recipient.api.get<InviteResponseDto>("api/invites/${first.id}").invite?.finalizedAt)
            manager.teamRepository.actOnTeamInvitation(second.id, "reinvite", "third").getOrThrow()
            manager.teamRepository.refreshTeamInvitations(team.id).getOrThrow()
            assertEquals(3, manager.teamRepository.observeTeamInvitations(team.id).first().size)
        } finally {
            if (teamId != null && playerId != null) runCatching { recipient.userRepository.removeTeamBlock(teamId, playerId) }
            teamId?.let { manager.deleteTeam(it) }
            recipient.close(); manager.close()
        }
    }
}
