package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class CanonicalApiIdentityContractTest {
    @Test
    fun canonical_only_resource_families_map_their_server_ids() {
        val organization = jsonMVP.decodeFromString<OrganizationApiDto>(
            """{"id":"org-canonical","name":"River City Sports Club"}""",
        ).toOrganizationOrNull()
        val facility = jsonMVP.decodeFromString<OrganizationFacilityApiDto>(
            """{"id":"facility-canonical","name":"Main Gym"}""",
        ).toFacilityOrNull()
        val sport = jsonMVP.decodeFromString<SportApiDto>(
            """{"id":"sport-canonical","name":"Volleyball"}""",
        ).toSportOrNull()
        val group = jsonMVP.decodeFromString<ChatGroupApiDto>(
            """{"id":"chat-canonical","hostId":"user-canonical","userIds":["user-canonical"]}""",
        ).toChatGroupOrNull()
        val message = jsonMVP.decodeFromString<MessageApiDto>(
            """{"id":"message-canonical","body":"Ready","userId":"user-canonical","chatId":"chat-canonical","sentTime":"2026-07-14T12:00:00Z"}""",
        ).toMessageOrNull()
        val field = jsonMVP.decodeFromString<Field>(
            """{"id":"field-canonical","fieldNumber":1}""",
        )

        assertEquals("org-canonical", assertNotNull(organization).id)
        assertEquals("facility-canonical", assertNotNull(facility).id)
        assertEquals("sport-canonical", assertNotNull(sport).id)
        assertEquals("chat-canonical", assertNotNull(group).id)
        assertEquals("message-canonical", assertNotNull(message).id)
        assertEquals("field-canonical", field.id)
    }

    @Test
    fun legacy_only_aliases_cannot_create_current_domain_rows() {
        val legacyKey = "${'$'}id"
        val event = jsonMVP.decodeFromString<EventApiDto>(
            """{"$legacyKey":"event-legacy","name":"Legacy event","hostId":"host-1","start":"2026-07-14T12:00:00Z","end":"2026-07-14T13:00:00Z"}""",
        )
        val team = jsonMVP.decodeFromString<TeamApiDto>(
            """{"$legacyKey":"team-legacy","name":"Legacy team"}""",
        )
        val match = jsonMVP.decodeFromString<MatchApiDto>(
            """{"$legacyKey":"match-legacy","matchId":7,"eventId":"event-canonical"}""",
        )
        val user = jsonMVP.decodeFromString<UserProfileDto>(
            """{"$legacyKey":"user-legacy"}""",
        )
        val organization = jsonMVP.decodeFromString<OrganizationApiDto>(
            """{"$legacyKey":"org-legacy","name":"Legacy organization"}""",
        )
        val facility = jsonMVP.decodeFromString<OrganizationFacilityApiDto>(
            """{"$legacyKey":"facility-legacy","name":"Legacy facility"}""",
        )
        val sport = jsonMVP.decodeFromString<SportApiDto>(
            """{"$legacyKey":"sport-legacy","name":"Legacy sport"}""",
        )
        val group = jsonMVP.decodeFromString<ChatGroupApiDto>(
            """{"$legacyKey":"chat-legacy","hostId":"user-canonical","userIds":["user-canonical"]}""",
        )

        assertNull(event.toEventOrNull())
        assertNull(team.toTeamOrNull())
        assertNull(match.toMatchOrNull())
        assertNull(user.toUserDataOrNull())
        assertNull(organization.toOrganizationOrNull())
        assertNull(facility.toFacilityOrNull())
        assertNull(sport.toSportOrNull())
        assertNull(group.toChatGroupOrNull())
        assertFailsWith<SerializationException> {
            jsonMVP.decodeFromString<Field>(
                """{"$legacyKey":"field-legacy","fieldNumber":1}""",
            )
        }
    }

    @Test
    fun billing_references_serialize_only_canonical_identity() {
        val encoded = jsonMVP.encodeToString(
            PurchaseIntentRequestDto(
                user = BillingUserRefDto(id = "user-canonical", email = "player@test.com"),
                event = BillingEventRefDto(id = "event-canonical"),
                team = BillingTeamRefDto(id = "team-canonical"),
                timeSlot = BillingTimeSlotRefDto(id = "slot-canonical"),
            ),
        )

        assertFalse(encoded.contains("${'$'}id"))
        assertEquals(4, Regex("\\\"id\\\"").findAll(encoded).count())
    }
}
