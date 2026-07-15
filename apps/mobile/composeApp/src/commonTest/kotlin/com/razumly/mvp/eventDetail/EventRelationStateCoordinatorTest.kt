package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamStaffAssignment
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class EventRelationStateCoordinatorTest {
    @Test
    fun initial_image_is_kept_until_room_has_an_event_image() {
        val initialEvent = Event(id = "event-1", imageId = "initial-image")

        assertEquals(
            "initial-image",
            EventWithRelations(
                event = Event(id = "event-1"),
                host = null,
            ).withInitialEventImageFallback(initialEvent).event.imageId,
        )
        assertEquals(
            "room-image",
            EventWithRelations(
                event = Event(id = "event-1", imageId = "room-image"),
                host = null,
            ).withInitialEventImageFallback(initialEvent).event.imageId,
        )
        assertEquals(
            "",
            EventWithRelations(
                event = Event(id = "event-2"),
                host = null,
            ).withInitialEventImageFallback(initialEvent).event.imageId,
        )
    }

    @Test
    fun team_signup_uses_registered_ids_while_individual_signup_includes_room_relations() {
        val relatedTeam = team(id = "team-2")
        val relations = EventWithRelations(
            event = Event(id = "event-1"),
            host = null,
            teams = listOf(relatedTeam),
        )

        assertEquals(
            listOf("team-1"),
            resolveEventRelationTeamIds(
                event = Event(
                    id = "event-1",
                    teamSignup = true,
                    teamIds = listOf(" team-1 ", "", "team-1"),
                ),
                relations = relations,
            ),
        )
        assertEquals(
            listOf("team-1", "team-2"),
            resolveEventRelationTeamIds(
                event = Event(
                    id = "event-1",
                    teamSignup = false,
                    teamIds = listOf(" team-1 "),
                ),
                relations = relations,
            ),
        )
    }

    @Test
    fun managed_team_resolution_honors_registration_filter_and_supported_roles() {
        val unrelatedManagedTeam = teamWithPlayers(id = "team-other", managerId = "user-1")
        val registeredHeadCoachTeam = teamWithPlayers(id = "team-head", headCoachId = " user-1 ")
        val registeredCoachTeam = teamWithPlayers(id = "team-coach", coachIds = listOf("user-2"))

        assertEquals(
            "team-head",
            resolveCurrentUserManagedEventTeamId(
                eventTeamIds = listOf("team-head", "team-coach"),
                teams = listOf(unrelatedManagedTeam, registeredHeadCoachTeam, registeredCoachTeam),
                currentUserId = " user-1 ",
            ),
        )
        assertEquals(
            "team-coach",
            resolveCurrentUserManagedEventTeamId(
                eventTeamIds = emptyList(),
                teams = listOf(registeredCoachTeam),
                currentUserId = "user-2",
            ),
        )
        assertNull(
            resolveCurrentUserManagedEventTeamId(
                eventTeamIds = listOf("team-head"),
                teams = listOf(unrelatedManagedTeam),
                currentUserId = "user-1",
            ),
        )
    }

    @Test
    fun managed_team_resolution_uses_only_active_supported_staff_assignments() {
        val activeAssistant = teamWithPlayers(
            id = "team-active",
            staffAssignments = listOf(
                TeamStaffAssignment(
                    id = "assignment-1",
                    teamId = "team-active",
                    userId = "user-1",
                    role = "assistant_coach",
                    status = "active",
                ),
            ),
        )
        val inactiveManager = teamWithPlayers(
            id = "team-inactive",
            staffAssignments = listOf(
                TeamStaffAssignment(
                    id = "assignment-2",
                    teamId = "team-inactive",
                    userId = "user-1",
                    role = "manager",
                    status = "inactive",
                ),
            ),
        )

        assertEquals(
            "team-active",
            resolveCurrentUserManagedEventTeamId(
                eventTeamIds = emptyList(),
                teams = listOf(inactiveManager, activeAssistant),
                currentUserId = "user-1",
            ),
        )
        assertNull(
            resolveCurrentUserManagedEventTeamId(
                eventTeamIds = emptyList(),
                teams = listOf(inactiveManager),
                currentUserId = "user-1",
            ),
        )
    }

    @Test
    fun room_flows_drive_event_host_teams_and_canonical_current_user_team_ids() = runTest {
        val scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler))
        try {
            val host = user(id = "host-1")
            val player = user(id = "player-1")
            val currentUser = MutableStateFlow(
                user(id = "user-1", compatibilityTeamIds = listOf("stale-profile-team")),
            )
            val relationFlow = MutableStateFlow(
                Result.success(
                    EventWithRelations(
                        event = Event(
                            id = "event-1",
                            imageId = "",
                            hostId = host.id,
                            teamSignup = true,
                            teamIds = listOf("event-team"),
                        ),
                        host = null,
                        players = listOf(player),
                    ),
                ),
            )
            val observedEventIds = mutableListOf<String>()
            val observedEventTeamIds = mutableListOf<List<String>>()
            val observedHostRequests = mutableListOf<Pair<List<String>, String?>>()
            val eventTeam = teamWithPlayers(id = "event-team", managerId = currentUser.value.id)
            val canonicalUserTeam = teamWithPlayers(id = "room-user-team")

            val coordinator = EventRelationStateCoordinator(
                initialEvent = Event(id = "event-1", imageId = "initial-image"),
                currentUser = currentUser,
                observeEventRelations = { eventId ->
                    observedEventIds += eventId
                    relationFlow
                },
                observeEventMatches = { flowOf(Result.success(emptyList())) },
                observeEventTeams = { teamIds ->
                    observedEventTeamIds += teamIds
                    flowOf(Result.success(listOf(eventTeam)))
                },
                observeUsers = { userIds, visibilityContext ->
                    observedHostRequests += userIds to visibilityContext.eventId
                    flowOf(Result.success(listOf(host)))
                },
                observeCurrentUserTeams = { userId ->
                    assertEquals("user-1", userId)
                    flowOf(Result.success(listOf(canonicalUserTeam)))
                },
                scope = scope,
                onEventRelationsError = { error("Unexpected event error: $it") },
                onEventMatchesError = { error("Unexpected match error: $it") },
                onEventTeamsError = { error("Unexpected team error: $it") },
            )

            assertEquals(listOf("event-1"), observedEventIds)
            assertEquals("initial-image", coordinator.selectedEvent.value.imageId)
            assertEquals(listOf(player), coordinator.eventPlayers.value)
            assertEquals(listOf("event-team"), coordinator.eventTeamIds.value)
            assertEquals(listOf(listOf("event-team")), observedEventTeamIds)
            assertEquals(listOf(eventTeam), coordinator.eventTeams.value)
            assertSame(host, coordinator.eventHost.value)
            assertEquals(
                listOf<Pair<List<String>, String?>>(listOf(host.id) to "event-1"),
                observedHostRequests,
            )
            assertEquals(setOf("room-user-team"), coordinator.currentUserTeamIds.value)
            assertEquals("event-team", coordinator.currentUserManagedEventTeamId.value)
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun relation_errors_keep_fallback_state_and_report_only_actionable_failures() = runTest {
        val scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler))
        try {
            val eventErrors = mutableListOf<Throwable>()
            val matchErrors = mutableListOf<Throwable>()
            val teamErrors = mutableListOf<Throwable>()
            val missing = NoSuchElementException("not cached yet")
            val relationFlow = MutableStateFlow<Result<EventWithRelations>>(Result.failure(missing))
            val matchFailure = IllegalStateException("matches unavailable")
            val teamFailure = IllegalArgumentException("teams unavailable")

            val coordinator = EventRelationStateCoordinator(
                initialEvent = Event(
                    id = "event-1",
                    hostId = "host-1",
                    teamIds = listOf("team-1"),
                ),
                currentUser = MutableStateFlow(UserData()),
                observeEventRelations = { relationFlow },
                observeEventMatches = { flowOf(Result.failure(matchFailure)) },
                observeEventTeams = { flowOf(Result.failure(teamFailure)) },
                observeUsers = { _, _ -> flowOf(Result.failure(IllegalStateException("host missing"))) },
                observeCurrentUserTeams = { error("Blank current-user ID must not be observed") },
                scope = scope,
                onEventRelationsError = eventErrors::add,
                onEventMatchesError = matchErrors::add,
                onEventTeamsError = teamErrors::add,
            )

            assertTrue(eventErrors.isEmpty())
            assertEquals(listOf<Throwable>(matchFailure), matchErrors)
            assertEquals(listOf<Throwable>(teamFailure), teamErrors)
            assertEquals("event-1", coordinator.selectedEvent.value.id)
            assertTrue(coordinator.eventMatches.value.isEmpty())
            assertTrue(coordinator.eventTeams.value.isEmpty())
            assertNull(coordinator.eventHost.value)

            val actionable = IllegalStateException("event cache failed")
            relationFlow.value = Result.failure(actionable)

            assertEquals(listOf<Throwable>(actionable), eventErrors)
            assertEquals("event-1", coordinator.selectedEvent.value.id)
        } finally {
            scope.cancel()
        }
    }

    private fun teamWithPlayers(
        id: String,
        managerId: String? = null,
        headCoachId: String? = null,
        coachIds: List<String> = emptyList(),
        staffAssignments: List<TeamStaffAssignment> = emptyList(),
    ): TeamWithPlayers = TeamWithPlayers(
        team = team(
            id = id,
            managerId = managerId,
            headCoachId = headCoachId,
            coachIds = coachIds,
            staffAssignments = staffAssignments,
        ),
        captain = null,
        players = emptyList(),
        pendingPlayers = emptyList(),
    )

    private fun team(
        id: String,
        managerId: String? = null,
        headCoachId: String? = null,
        coachIds: List<String> = emptyList(),
        staffAssignments: List<TeamStaffAssignment> = emptyList(),
    ): Team = Team(
        division = "open",
        name = id,
        captainId = "captain-$id",
        managerId = managerId,
        headCoachId = headCoachId,
        coachIds = coachIds,
        staffAssignments = staffAssignments,
        teamSize = 2,
        id = id,
    )

    private fun user(
        id: String,
        compatibilityTeamIds: List<String> = emptyList(),
    ): UserData = UserData(
        firstName = id,
        lastName = "User",
        teamIds = compatibilityTeamIds,
        friendIds = emptyList(),
        friendRequestIds = emptyList(),
        friendRequestSentIds = emptyList(),
        followingIds = emptyList(),
        userName = id,
        hasStripeAccount = false,
        uploadedImages = emptyList(),
        id = id,
    )
}
