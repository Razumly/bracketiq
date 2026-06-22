package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.network.dto.InviteCreateDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventInviteHelpersTest {

    @Test
    fun normalized_invite_search_query_trims_and_enforces_minimum_length() {
        assertEquals("cam", normalizedInviteSearchQuery(" cam "))
        assertNull(normalizedInviteSearchQuery(" "))
        assertNull(normalizedInviteSearchQuery(" a ", minLength = 2))
        assertEquals("ab", normalizedInviteSearchQuery(" ab ", minLength = 2))
    }

    @Test
    fun invite_context_uses_event_values_before_relation_fallbacks() {
        val event = Event(
            organizationId = " event-org ",
            sportId = " pickleball ",
        )

        assertEquals(
            "event-org",
            resolveEventInviteOrganizationId(
                event = event,
                relationOrganizationId = " relation-org ",
            ),
        )
        assertEquals(
            "Tennis",
            resolveEventInviteSportName(
                event = event,
                relationSportName = " Tennis ",
            ),
        )
        assertEquals(
            "relation-org",
            resolveEventInviteOrganizationId(
                event = event.copy(organizationId = " "),
                relationOrganizationId = " relation-org ",
            ),
        )
        assertEquals(
            "pickleball",
            resolveEventInviteSportName(
                event = event,
                relationSportName = " ",
            ),
        )
    }

    @Test
    fun team_invite_exclusions_include_event_team_relation_team_and_parent_ids() {
        val event = Event(teamIds = listOf(" event-team ", "", "team-a"))

        assertEquals(
            setOf("event-team", "team-a", "team-b", "parent-b"),
            eventParticipantTeamIdsForInviteSearch(
                event = event,
                teams = listOf(teamWithPlayers(" team-b ", parentTeamId = " parent-b ")),
            ),
        )
    }

    @Test
    fun player_invite_exclusions_include_all_event_rosters_and_relation_players() {
        val event = Event(
            userIds = listOf(" player-1 ", ""),
            waitListIds = listOf(" waitlisted-1 "),
            freeAgentIds = listOf(" free-agent-1 "),
        )

        assertEquals(
            setOf("player-1", "waitlisted-1", "free-agent-1", "relation-player"),
            eventParticipantUserIdsForInviteSearch(
                event = event,
                players = listOf(user(" relation-player ")),
            ),
        )
    }

    @Test
    fun event_player_invite_request_normalizes_fields() {
        val request = buildEventPlayerInviteRequest(
            event = Event(id = " event-1 "),
            organizationId = " org-1 ",
            userId = " user-1 ",
            email = " PLAYER@Example.COM ",
            firstName = " Cam ",
            lastName = " Kay ",
            createdBy = " creator-1 ",
        )

        assertEquals(
            InviteCreateDto(
                type = "EVENT",
                status = "PENDING",
                eventId = "event-1",
                organizationId = "org-1",
                userId = "user-1",
                email = "player@example.com",
                firstName = "Cam",
                lastName = "Kay",
                createdBy = "creator-1",
            ),
            request.getOrThrow(),
        )
    }

    @Test
    fun event_player_invite_request_requires_event_id_and_drops_blank_optional_fields() {
        assertTrue(
            buildEventPlayerInviteRequest(
                event = Event(id = " "),
                organizationId = "org-1",
                userId = "user-1",
                email = null,
                firstName = null,
                lastName = null,
                createdBy = "creator-1",
            ).isFailure,
        )

        val request = buildEventPlayerInviteRequest(
            event = Event(id = "event-1"),
            organizationId = " ",
            userId = " ",
            email = " ",
            firstName = " ",
            lastName = " ",
            createdBy = " ",
        ).getOrThrow()

        assertNull(request.organizationId)
        assertNull(request.userId)
        assertNull(request.email)
        assertNull(request.firstName)
        assertNull(request.lastName)
        assertNull(request.createdBy)
    }

    private fun teamWithPlayers(
        id: String,
        parentTeamId: String? = null,
    ): TeamWithPlayers {
        return TeamWithPlayers(
            team = Team(captainId = "captain-1").copy(
                id = id,
                parentTeamId = parentTeamId,
            ),
            captain = null,
            players = emptyList(),
            pendingPlayers = emptyList(),
        )
    }

    private fun user(id: String): UserData {
        return UserData().copy(id = id)
    }
}
