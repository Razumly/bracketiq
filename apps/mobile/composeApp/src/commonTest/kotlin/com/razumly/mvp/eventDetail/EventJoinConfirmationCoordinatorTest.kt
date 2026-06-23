package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantsSyncResult
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

class EventJoinConfirmationCoordinatorTest {
    @Test
    fun team_includes_user_checks_roster_loaded_players_and_pending_players() {
        val coordinator = EventJoinConfirmationCoordinator()

        assertTrue(
            coordinator.teamIncludesUser(
                teamWithPlayers(
                    playerIds = listOf(" user-1 "),
                ),
                "user-1",
            ),
        )
        assertTrue(
            coordinator.teamIncludesUser(
                teamWithPlayers(
                    players = listOf(user(" loaded-user ")),
                ),
                "loaded-user",
            ),
        )
        assertTrue(
            coordinator.teamIncludesUser(
                teamWithPlayers(
                    pendingPlayers = listOf(user(" pending-user ")),
                ),
                "pending-user",
            ),
        )
        assertFalse(
            coordinator.teamIncludesUser(
                teamWithPlayers(playerIds = listOf("user-1")),
                " ",
            ),
        )
    }

    @Test
    fun join_confirmation_uses_cached_registration_and_refreshes_current_membership() = runTest {
        val coordinator = EventJoinConfirmationCoordinator()
        val target = JoinConfirmationTarget(
            eventId = "event-1",
            registrantType = JoinConfirmationRegistrantType.SELF,
            registrantId = "user-1",
        )
        val selectedEvent = Event(id = "event-1")
        var cacheSyncCalls = 0
        var membershipRefreshes = 0

        val satisfied = coordinator.isJoinConfirmationSatisfied(
            confirmationTarget = target,
            cachedCurrentUserRegistrations = {
                listOf(
                    EventRegistrationCacheEntry(
                        id = "registration-1",
                        eventId = "event-1",
                        registrantId = "user-1",
                        registrantType = "SELF",
                        rosterRole = "PARTICIPANT",
                        status = "ACTIVE",
                    ),
                )
            },
            selectedEvent = { selectedEvent },
            currentWeeklyOccurrenceSelection = { null },
            syncCurrentUserRegistrationCache = {
                cacheSyncCalls += 1
                Result.success(Unit)
            },
            getEvent = { error("Event snapshot should not load when cache satisfies confirmation.") },
            syncEventParticipants = { _, _ ->
                error("Participant sync should not run when cache satisfies confirmation.")
            },
            getTeams = { error("Teams should not load for cached self confirmation.") },
            applyParticipantSyncResult = { error("UI sync should not run when cache satisfies confirmation.") },
            refreshCurrentUserMembershipState = { event ->
                assertEquals(selectedEvent, event)
                membershipRefreshes += 1
            },
            rememberWeeklyOccurrenceSummary = { _, _ ->
                error("Weekly summary should not update for non-weekly cached confirmation.")
            },
        )

        assertTrue(satisfied)
        assertEquals(1, cacheSyncCalls)
        assertEquals(1, membershipRefreshes)
    }

    @Test
    fun join_confirmation_syncs_event_participants_and_accepts_child_team_snapshot() = runTest {
        val coordinator = EventJoinConfirmationCoordinator()
        val occurrence = EventOccurrenceSelection(
            slotId = "slot-1",
            occurrenceDate = "2026-07-01",
        )
        val target = JoinConfirmationTarget(
            eventId = "event-1",
            registrantType = JoinConfirmationRegistrantType.TEAM,
            registrantId = "parent-team",
            occurrence = occurrence,
        )
        val syncedEvent = Event(
            id = "event-1",
            teamSignup = true,
            teamIds = listOf("child-team"),
        )
        var appliedSync = false
        var membershipRefreshes = 0
        var rememberedSummary: WeeklyOccurrenceSummary? = null

        val satisfied = coordinator.isJoinConfirmationSatisfied(
            confirmationTarget = target,
            cachedCurrentUserRegistrations = { emptyList() },
            selectedEvent = { Event(id = "fallback-event") },
            currentWeeklyOccurrenceSelection = { occurrence },
            syncCurrentUserRegistrationCache = { Result.success(Unit) },
            getEvent = { eventId ->
                assertEquals("event-1", eventId)
                Result.success(Event(id = eventId))
            },
            syncEventParticipants = { event, requestedOccurrence ->
                assertEquals("event-1", event.id)
                assertEquals(occurrence, requestedOccurrence)
                Result.success(
                    EventParticipantsSyncResult(
                        event = syncedEvent,
                        participantCount = 6,
                        participantCapacity = 8,
                    ),
                )
            },
            getTeams = { teamIds ->
                assertEquals(listOf("child-team"), teamIds)
                Result.success(
                    listOf(
                        team(
                            id = "child-team",
                            parentTeamId = "parent-team",
                        ),
                    ),
                )
            },
            applyParticipantSyncResult = { result ->
                assertEquals(syncedEvent, result.event)
                appliedSync = true
            },
            refreshCurrentUserMembershipState = { event ->
                assertEquals(syncedEvent, event)
                membershipRefreshes += 1
            },
            rememberWeeklyOccurrenceSummary = { rememberedOccurrence, summary ->
                assertEquals(occurrence, rememberedOccurrence)
                rememberedSummary = summary
            },
        )

        assertTrue(satisfied)
        assertTrue(appliedSync)
        assertEquals(1, membershipRefreshes)
        assertEquals(WeeklyOccurrenceSummary(participantCount = 6, participantCapacity = 8), rememberedSummary)
    }

    @Test
    fun wait_helpers_return_immediately_when_confirmation_is_already_satisfied() = runTest {
        val coordinator = EventJoinConfirmationCoordinator()
        var refreshCalls = 0

        assertTrue(
            coordinator.waitForUserInEventWithTimeout(
                confirmationTarget = null,
                timeoutS = 1.seconds,
                checkIntervalS = 1.seconds,
                isUserInEvent = { true },
                refreshAfterParticipantMutation = {
                    refreshCalls += 1
                },
                isJoinConfirmationSatisfied = { false },
            ),
        )
        assertEquals(0, refreshCalls)

        assertTrue(
            coordinator.waitForUserInEventWithTimeout(
                confirmationTarget = JoinConfirmationTarget(
                    eventId = "event-1",
                    registrantType = JoinConfirmationRegistrantType.SELF,
                    registrantId = "user-1",
                ),
                timeoutS = 1.seconds,
                checkIntervalS = 1.seconds,
                isUserInEvent = { false },
                refreshAfterParticipantMutation = {
                    error("Refresh path should not run when a target is available.")
                },
                isJoinConfirmationSatisfied = { true },
            ),
        )

        var requestedTeamId: String? = null
        assertTrue(
            coordinator.waitForTeamRegistrationWithTimeout(
                teamId = " team-1 ",
                currentUserId = "user-1",
                timeoutS = 1.seconds,
                checkIntervalS = 1.seconds,
                getTeamWithPlayers = { teamId ->
                    requestedTeamId = teamId
                    Result.success(teamWithPlayers(id = teamId, playerIds = listOf("user-1")))
                },
            ),
        )
        assertEquals("team-1", requestedTeamId)
    }

    private fun user(id: String): UserData =
        UserData().copy(id = id)

    private fun team(
        id: String = "team-1",
        parentTeamId: String? = null,
        playerIds: List<String> = emptyList(),
    ): Team =
        Team(captainId = "captain-1").copy(
            id = id,
            name = "Team $id",
            parentTeamId = parentTeamId,
            playerIds = playerIds,
        )

    private fun teamWithPlayers(
        id: String = "team-1",
        playerIds: List<String> = emptyList(),
        players: List<UserData> = emptyList(),
        pendingPlayers: List<UserData> = emptyList(),
    ): TeamWithPlayers =
        TeamWithPlayers(
            team = team(id = id, playerIds = playerIds),
            captain = null,
            players = players,
            pendingPlayers = pendingPlayers,
        )
}
