package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.boolean
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ManagedPlayerDtosTest {
    @Test
    fun given_managed_player_claim_request_when_encoded_then_site_contract_fields_are_present() {
        val wire = jsonMVP.encodeToString(
            ManagedPlayerClaimRequestDto(
                inviteId = "invite-1",
                confirmation = true,
                dateOfBirth = "2012-04-05",
                version = "1",
                expiresAt = "2030-01-01T00:00:00Z",
                signature = "signature",
            ),
        ).let { jsonMVP.parseToJsonElement(it).jsonObject }

        assertEquals("invite-1", wire.getValue("inviteId").jsonPrimitive.content)
        assertTrue(wire.getValue("confirmation").jsonPrimitive.boolean)
        assertEquals("2012-04-05", wire.getValue("dateOfBirth").jsonPrimitive.content)
        assertEquals("1", wire.getValue("version").jsonPrimitive.content)
    }

    @Test
    fun given_team_member_invite_when_encoded_then_minor_and_conversion_fields_are_optional_wire_keys() {
        val wire = jsonMVP.encodeToString(
            TeamMemberInviteRequestDto(
                role = "player",
                firstName = "Jordan",
                lastName = "Guest",
                isMinor = true,
                dateOfBirth = "2012-04-05",
                guardianEmail = "guardian@example.com",
                idempotencyKey = "request-1",
                existingInviteId = "invite-old",
            ),
        ).let { jsonMVP.parseToJsonElement(it).jsonObject }

        assertEquals("player", wire.getValue("role").jsonPrimitive.content)
        assertTrue(wire.getValue("isMinor").jsonPrimitive.boolean)
        assertEquals("2012-04-05", wire.getValue("dateOfBirth").jsonPrimitive.content)
        assertEquals("guardian@example.com", wire.getValue("guardianEmail").jsonPrimitive.content)
        assertEquals("request-1", wire.getValue("idempotencyKey").jsonPrimitive.content)
        assertEquals("invite-old", wire.getValue("existingInviteId").jsonPrimitive.content)
        assertFalse(wire.containsKey("unknownField"))
    }
}
