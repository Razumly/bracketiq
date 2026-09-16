package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class ManagedPlayerClaimDtosTest {
    @Test
    fun givenGuardianAcceptance_whenEncoded_thenBothConfirmationsArePresentAndLegacyPreviewDecodes() {
        val request = ManagedPlayerClaimRequestDto("invite", true, guardianDeclaration = true, acceptTeamInvitation = true)
        val wire = jsonMVP.parseToJsonElement(jsonMVP.encodeToString(request)).jsonObject
        assertEquals("true", wire["guardianDeclaration"]?.jsonPrimitive?.content)
        assertEquals("true", wire["acceptTeamInvitation"]?.jsonPrimitive?.content)
        val legacyPreview = jsonMVP.decodeFromString<ManagedPlayerClaimPreviewInviteDto>("""{"id":"invite","profileId":"player"}""")
        assertFalse(legacyPreview.guardianSetupRequired)
    }
}
