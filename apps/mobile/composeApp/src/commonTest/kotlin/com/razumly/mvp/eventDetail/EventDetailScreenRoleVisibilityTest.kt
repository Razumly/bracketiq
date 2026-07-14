package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationStaffMember
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventDetailScreenRoleVisibilityTest {

    @Test
    fun buildEventDetailAccessPresentation_hostOwnsManagementSurfaces() {
        val event = Event(
            id = "event-hosted",
            hostId = "host-1",
            eventType = EventType.LEAGUE,
            includePlayoffs = true,
            teamSignup = true,
            teamCheckInMode = TeamCheckInMode.EVENT,
        )

        val presentation = buildEventDetailAccessPresentation(
            selectedEvent = EventWithFullRelations(
                event = event,
                players = emptyList(),
                matches = emptyList(),
                teams = emptyList(),
            ),
            editedEvent = event,
            sports = emptyList(),
            currentUser = UserData().copy(id = "host-1"),
            currentUserManagedEventTeamId = null,
            isHost = true,
            isEditingMatches = true,
        )

        assertTrue(presentation.hasScheduleView)
        assertTrue(presentation.hasStandingsView)
        assertTrue(presentation.hasBracketView)
        assertTrue(presentation.canManageTemplate)
        assertTrue(presentation.canManageLeagueStandings)
        assertTrue(presentation.canEditMatches)
        assertTrue(presentation.showEventCheckInBadges)
    }

    @Test
    fun buildEventDetailAccessPresentation_regularViewerCannotManageEvent() {
        val event = Event(
            id = "event-viewer",
            hostId = "host-1",
            eventType = EventType.LEAGUE,
            teamSignup = true,
            teamCheckInMode = TeamCheckInMode.EVENT,
        )

        val presentation = buildEventDetailAccessPresentation(
            selectedEvent = EventWithFullRelations(
                event = event,
                players = emptyList(),
                matches = emptyList(),
                teams = emptyList(),
            ),
            editedEvent = event,
            sports = emptyList(),
            currentUser = UserData().copy(id = "viewer-1"),
            currentUserManagedEventTeamId = null,
            isHost = false,
            isEditingMatches = true,
        )

        assertFalse(presentation.isAssistantHost)
        assertFalse(presentation.isEventOfficial)
        assertFalse(presentation.canManageTemplate)
        assertFalse(presentation.canManageLeagueStandings)
        assertFalse(presentation.canEditMatches)
        assertFalse(presentation.showEventCheckInBadges)
    }

    @Test
    fun givenHost_whenCheckingOfficialsVisibility_thenReturnsTrue() {
        val event = Event(hostId = "host-1")

        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "host-1",
                event = event,
                organization = null,
            ),
        )
    }

    @Test
    fun givenAssistantHostOfficialOrOrganizationOwner_whenCheckingOfficialsVisibility_thenReturnsTrue() {
        val event = Event(
            hostId = "host-1",
            assistantHostIds = listOf("assistant-1"),
            officialIds = listOf("official-1"),
        )
        val organization = Organization(
            id = "org-1",
            name = "Org One",
            location = null,
            description = null,
            logoId = null,
            ownerId = "owner-1",
            website = null,
            hasStripeAccount = false,
            coordinates = null,
            fieldIds = emptyList(),
        )

        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "assistant-1",
                event = event,
                organization = organization,
            ),
        )
        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "official-1",
                event = event,
                organization = organization,
            ),
        )
        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "owner-1",
                event = event,
                organization = organization,
            ),
        )
    }

    @Test
    fun givenOrganizationHostStaffOrEventsPermission_whenCheckingOfficialsVisibility_thenReturnsTrue() {
        val event = Event(hostId = "host-1")
        val organization = Organization(
            id = "org-1",
            name = "Org One",
            location = null,
            description = null,
            logoId = null,
            ownerId = "owner-1",
            website = null,
            hasStripeAccount = false,
            coordinates = null,
            fieldIds = emptyList(),
            staffMembers = listOf(
                OrganizationStaffMember(
                    id = "staff-host-1",
                    organizationId = "org-1",
                    userId = "org-host-1",
                    types = listOf("HOST"),
                ),
            ),
        )

        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "org-host-1",
                event = event,
                organization = organization,
            ),
        )
        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "staff-with-permission",
                event = event,
                organization = organization.copy(viewerPermissions = listOf("events.manage")),
            ),
        )
    }

    @Test
    fun givenRegularViewerOrgStaffOrBlankUser_whenCheckingOfficialsVisibility_thenReturnsFalse() {
        val event = Event(
            hostId = "host-1",
            assistantHostIds = listOf("assistant-1"),
            officialIds = listOf("official-1"),
        )
        val organization = Organization(
            id = "org-1",
            name = "Org One",
            location = null,
            description = null,
            logoId = null,
            ownerId = "owner-1",
            website = null,
            hasStripeAccount = false,
            coordinates = null,
            fieldIds = emptyList(),
        )

        assertFalse(
            canViewOfficialsPanel(
                currentUserId = "player-1",
                event = event,
                organization = organization,
            ),
        )
        assertFalse(
            canViewOfficialsPanel(
                currentUserId = "org-host-1",
                event = event,
                organization = organization,
            ),
        )
        assertFalse(
            canViewOfficialsPanel(
                currentUserId = "   ",
                event = event,
                organization = organization,
            ),
        )
    }

    @Test
    fun givenTrackedTeamMatches_whenCheckingFirstMatchDay_thenUsesEarliestDate() {
        val matches = listOf(
            matchWithRelations(
                id = "match-later",
                team1Id = "tracked-team",
                start = Instant.parse("2026-07-21T18:00:00Z"),
            ),
            matchWithRelations(
                id = "match-first",
                team1Id = "tracked-team",
                start = Instant.parse("2026-07-20T18:00:00Z"),
            ),
            matchWithRelations(
                id = "match-unrelated",
                team1Id = "other-team",
                start = Instant.parse("2026-07-19T18:00:00Z"),
            ),
        )

        assertTrue(
            isFirstMatchDayForTrackedUsers(
                matches = matches,
                trackedUserIds = emptySet(),
                currentUserTeamIds = setOf(" tracked-team "),
                today = LocalDate(2026, 7, 20),
                timeZone = TimeZone.UTC,
            ),
        )
        assertFalse(
            isFirstMatchDayForTrackedUsers(
                matches = matches,
                trackedUserIds = emptySet(),
                currentUserTeamIds = setOf("tracked-team"),
                today = LocalDate(2026, 7, 21),
                timeZone = TimeZone.UTC,
            ),
        )
        assertFalse(
            isFirstMatchDayForTrackedUsers(
                matches = matches,
                trackedUserIds = emptySet(),
                currentUserTeamIds = emptySet(),
                today = LocalDate(2026, 7, 20),
                timeZone = TimeZone.UTC,
            ),
        )
    }

    private fun matchWithRelations(
        id: String,
        team1Id: String,
        start: Instant,
    ): MatchWithRelations = MatchWithRelations(
        match = MatchMVP(
            matchId = id.hashCode(),
            team1Id = team1Id,
            eventId = "event-1",
            start = start,
            id = id,
        ),
        field = null,
        team1 = null,
        team2 = null,
        teamOfficial = null,
        winnerNextMatch = null,
        loserNextMatch = null,
        previousLeftMatch = null,
        previousRightMatch = null,
    )
}
