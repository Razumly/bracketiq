package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Invite
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PushInvitationPayloadTest {
    @Test
    fun push_payload_fields_are_never_materialized_as_an_invitation() = runBlocking {
        val persisted = mutableListOf<Invite>()
        val requestedIds = mutableListOf<String>()

        refreshInviteCacheFromPushPayload(
            data = mapOf(
                "notificationType" to "invitations",
                "inviteId" to "invite_1",
                "userId" to "attacker_selected_user",
                "teamId" to "attacker_selected_team",
                "eventId" to "attacker_selected_event",
                "organizationId" to "attacker_selected_organization",
                "status" to "PENDING",
            ),
            resolveCurrentUserId = { "recipient_1" },
            fetchAuthorizedInvite = { inviteId ->
                requestedIds += inviteId
                Invite(
                    id = inviteId,
                    type = "TEAM",
                    email = "recipient@example.test",
                    status = "PENDING",
                    userId = "recipient_1",
                    teamId = "team_from_server",
                    eventId = "event_from_server",
                    organizationId = "organization_from_server",
                )
            },
            refreshAuthorizedInvites = { error("An ID-specific invalidation must not use a payload list refresh.") },
            persistInvite = { invite -> persisted += invite },
        )

        assertEquals(listOf("invite_1"), requestedIds)
        assertEquals(1, persisted.size)
        assertEquals("recipient_1", persisted.single().userId)
        assertEquals("team_from_server", persisted.single().teamId)
        assertEquals("event_from_server", persisted.single().eventId)
        assertEquals("organization_from_server", persisted.single().organizationId)
    }

    @Test
    fun denied_or_missing_authorized_invite_never_creates_a_local_row() = runBlocking {
        var persistCalled = false
        var refreshCalled = false

        refreshInviteCacheFromPushPayload(
            data = mapOf(
                "inviteId" to "fabricated_invite",
                "teamId" to "fabricated_team",
                "userId" to "victim_1",
            ),
            resolveCurrentUserId = { "victim_1" },
            fetchAuthorizedInvite = { null },
            refreshAuthorizedInvites = { refreshCalled = true },
            persistInvite = { persistCalled = true },
        )

        assertFalse(persistCalled)
        assertFalse(refreshCalled)
    }

    @Test
    fun invitation_notification_without_an_id_refreshes_only_authorized_server_state() = runBlocking {
        val refreshedUsers = mutableListOf<String>()
        var fetchCalled = false

        refreshInviteCacheFromPushPayload(
            data = mapOf(
                "notificationType" to "invitations",
                "teamId" to "untrusted_team",
            ),
            resolveCurrentUserId = { "recipient_1" },
            fetchAuthorizedInvite = {
                fetchCalled = true
                null
            },
            refreshAuthorizedInvites = { userId -> refreshedUsers += userId },
            persistInvite = { error("A payload without a server response must not persist an invite.") },
        )

        assertEquals(listOf("recipient_1"), refreshedUsers)
        assertFalse(fetchCalled)
        assertTrue(refreshedUsers.none { it == "untrusted_team" })
    }
}
