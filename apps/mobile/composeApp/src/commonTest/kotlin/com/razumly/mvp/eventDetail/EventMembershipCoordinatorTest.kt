package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventMembershipCoordinatorTest {
    @Test
    fun weekly_parent_without_selection_clears_membership_state() {
        val coordinator = EventMembershipCoordinator(
            initialEvent = event(
                eventType = EventType.WEEKLY_EVENT,
                playerIds = listOf("user-1"),
            ),
            initialCurrentUserId = "user-1",
            initialCurrentUserTeamIds = emptySet(),
            initialWeeklyParentWithoutSelection = true,
        )

        assertFalse(coordinator.isUserInEvent.value)
        assertFalse(coordinator.isUserInWaitlist.value)
        assertFalse(coordinator.isUserFreeAgent.value)
        assertNull(coordinator.usersTeam())
    }

    @Test
    fun cached_membership_applies_payment_waitlist_and_team_state() {
        val coordinator = EventMembershipCoordinator(
            initialEvent = event(),
            initialCurrentUserId = "user-1",
            initialCurrentUserTeamIds = emptySet(),
            initialWeeklyParentWithoutSelection = false,
        )
        val team = teamWithPlayers(
            id = "team-1",
            captainId = "user-1",
            managerId = "manager-1",
        )

        coordinator.applyCachedMembership(
            membership = CurrentUserRegistrationMembershipState(
                participant = false,
                waitlist = true,
                freeAgent = false,
                paymentPending = true,
                paymentFailed = false,
                teamId = "team-1",
            ),
            team = team,
            currentUserId = "user-1",
        )

        assertTrue(coordinator.isUserInEvent.value)
        assertTrue(coordinator.isUserInWaitlist.value)
        assertTrue(coordinator.isRegistrationPaymentPending.value)
        assertTrue(coordinator.isUserCaptain.value)
        assertEquals(setOf("profile-team", "team-1"), coordinator.currentUserTeamIds(listOf("profile-team")))
    }

    @Test
    fun snapshot_refresh_resolves_team_membership_and_clears_payment_state() {
        val coordinator = EventMembershipCoordinator(
            initialEvent = event(),
            initialCurrentUserId = "user-1",
            initialCurrentUserTeamIds = emptySet(),
            initialWeeklyParentWithoutSelection = false,
        )

        val teamIds = coordinator.refreshFromSnapshot(
            event = event(
                teamSignup = true,
                teamIds = listOf("team-1"),
                waitList = listOf("team-2"),
                freeAgents = listOf("team-3"),
            ),
            currentUserId = "user-1",
            currentUserTeamIds = setOf("team-1", "team-2", "team-3"),
        )
        coordinator.setUsersTeam(teamWithPlayers(id = teamIds.first(), managerId = "user-1"), "user-1")

        assertEquals(listOf("team-1", "team-2", "team-3"), teamIds)
        assertTrue(coordinator.isUserInEvent.value)
        assertFalse(coordinator.isRegistrationPaymentPending.value)
        assertFalse(coordinator.isRegistrationPaymentFailed.value)
        assertTrue(coordinator.isUserCaptain.value)
    }

    @Test
    fun cached_membership_resolution_uses_current_team_ids_and_weekly_occurrence() {
        val coordinator = EventMembershipCoordinator(
            initialEvent = event(),
            initialCurrentUserId = "user-1",
            initialCurrentUserTeamIds = emptySet(),
            initialWeeklyParentWithoutSelection = false,
        )
        coordinator.setUsersTeam(teamWithPlayers(id = "team-1"), "user-1")

        val membership = coordinator.resolveCachedMembership(
            registrations = listOf(
                EventRegistrationCacheEntry(
                    id = "reg-1",
                    eventId = "event-1",
                    registrantId = "team-1",
                    registrantType = "TEAM",
                    rosterRole = "FREE_AGENT",
                    status = "ACTIVE",
                    eventTeamId = "team-1",
                    slotId = "slot-1",
                    occurrenceDate = "2026-06-22",
                ),
            ),
            selectedOccurrence = EventOccurrenceSelection("slot-1", "2026-06-22", "June 22"),
            currentUserId = "user-1",
            profileTeamIds = emptyList(),
            isWeeklyParentEvent = true,
        )

        assertEquals(
            CurrentUserRegistrationMembershipState(
                participant = false,
                waitlist = false,
                freeAgent = true,
                paymentPending = false,
                paymentFailed = false,
                teamId = "team-1",
            ),
            membership,
        )
    }

    private fun event(
        eventType: EventType = EventType.LEAGUE,
        playerIds: List<String> = emptyList(),
        waitList: List<String> = emptyList(),
        freeAgents: List<String> = emptyList(),
        teamIds: List<String> = emptyList(),
        teamSignup: Boolean = false,
    ): Event {
        return Event(
            id = "event-1",
            name = "Event",
            eventType = eventType,
            userIds = playerIds,
            waitListIds = waitList,
            freeAgentIds = freeAgents,
            teamIds = teamIds,
            teamSignup = teamSignup,
        )
    }

    private fun teamWithPlayers(
        id: String,
        captainId: String = "captain-1",
        managerId: String? = null,
    ): TeamWithPlayers {
        return TeamWithPlayers(
            team = Team(
                division = "open",
                name = "Team",
                captainId = captainId,
                managerId = managerId,
                teamSize = 2,
                id = id,
            ),
            captain = null,
            players = emptyList(),
            pendingPlayers = emptyList(),
        )
    }
}
