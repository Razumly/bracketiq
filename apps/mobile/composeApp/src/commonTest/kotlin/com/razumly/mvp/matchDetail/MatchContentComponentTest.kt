@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.matchDetail

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeEventRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeMatchRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeUserRepository
import com.razumly.mvp.eventCreate.MainDispatcherTest
import com.razumly.mvp.eventDetail.data.IMatchRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class MatchContentComponentTest : MainDispatcherTest() {
    @Test
    fun given_assigned_ref_team_when_match_not_checked_in_then_check_in_prompt_is_shown() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamRefereeId = "team-c",
            refereeCheckedIn = false,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        assertTrue(harness.component.isRef.value)
        assertFalse(harness.component.refCheckedIn.value)
        assertTrue(harness.component.showRefCheckInDialog.value)
    }

    @Test
    fun given_event_team_member_swap_when_confirming_then_match_updates_then_check_in_prompt_is_shown() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamRefereeId = "team-a",
            refereeCheckedIn = false,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        assertFalse(harness.component.isRef.value)
        assertFalse(harness.component.refCheckedIn.value)
        assertTrue(harness.component.showRefCheckInDialog.value)

        harness.component.confirmRefCheckIn()
        advance()

        assertEquals(1, harness.matchRepository.updatedMatches.size)
        assertEquals("team-c", harness.matchRepository.updatedMatches[0].teamRefereeId)
        assertEquals(false, harness.matchRepository.updatedMatches[0].refereeCheckedIn)
        assertTrue(harness.component.isRef.value)
        assertFalse(harness.component.refCheckedIn.value)
        assertTrue(harness.component.showRefCheckInDialog.value)

        harness.component.confirmRefCheckIn()
        advance()

        assertEquals(2, harness.matchRepository.updatedMatches.size)
        assertEquals(true, harness.matchRepository.updatedMatches[1].refereeCheckedIn)
        assertTrue(harness.component.isRef.value)
        assertTrue(harness.component.refCheckedIn.value)
        assertFalse(harness.component.showRefCheckInDialog.value)
    }

    @Test
    fun given_referee_already_checked_in_when_user_can_swap_then_swap_prompt_is_not_shown() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamRefereeId = "team-a",
            refereeCheckedIn = true,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        assertFalse(harness.component.isRef.value)
        assertTrue(harness.component.refCheckedIn.value)
        assertFalse(harness.component.showRefCheckInDialog.value)
    }

    @Test
    fun given_stale_cached_teams_when_user_profile_has_event_team_then_swap_prompt_is_still_shown() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamRefereeId = "team-a",
            refereeCheckedIn = false,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
                createTeam(id = "team-stale", captainId = user.id, playerIds = listOf(user.id)),
            ),
            currentUserTeamIdsInRepository = listOf("team-stale"),
        )

        advance()

        assertFalse(harness.component.isRef.value)
        assertFalse(harness.component.refCheckedIn.value)
        assertTrue(harness.component.showRefCheckInDialog.value)
    }
}

private class MatchDetailHarness(
    event: Event,
    initialMatch: MatchMVP,
    currentUser: UserData,
    teams: List<Team>,
    currentUserTeamIdsInRepository: List<String>? = null,
) {
    val matchRepository = MatchDetailFakeMatchRepository(initialMatch)

    val component = DefaultMatchContentComponent(
        componentContext = createTestComponentContext(),
        selectedMatch = initialMatch.toMatchWithRelations(),
        selectedEvent = event,
        eventRepository = MatchDetailFakeEventRepository(event),
        matchRepository = matchRepository,
        userRepository = MatchDetailFakeUserRepository(currentUser),
        teamRepository = MatchDetailFakeTeamRepository(
            currentUser = currentUser,
            teams = teams,
            currentUserTeamIdsInRepository = currentUserTeamIdsInRepository,
        ),
    )
}

private class MatchDetailFakeEventRepository(
    event: Event,
) : IEventRepository by CreateEvent_FakeEventRepository() {
    private val eventFlow = MutableStateFlow(Result.success(event.toEventWithRelations()))

    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> = eventFlow

    override suspend fun getEvent(eventId: String): Result<Event> =
        Result.success(eventFlow.value.getOrThrow().event)
}

private class MatchDetailFakeMatchRepository(
    initialMatch: MatchMVP,
) : IMatchRepository by CreateEvent_FakeMatchRepository() {
    private val matchFlow = MutableStateFlow(Result.success(initialMatch.toMatchWithRelations()))
    val updatedMatches = mutableListOf<MatchMVP>()

    override suspend fun getMatch(matchId: String): Result<MatchMVP> =
        Result.success(matchFlow.value.getOrThrow().match)

    override fun getMatchFlow(matchId: String): Flow<Result<MatchWithRelations>> = matchFlow

    override suspend fun updateMatch(match: MatchMVP): Result<Unit> {
        updatedMatches += match
        matchFlow.value = Result.success(match.toMatchWithRelations())
        return Result.success(Unit)
    }
}

private class MatchDetailFakeUserRepository(
    currentUser: UserData,
) : IUserRepository by CreateEvent_FakeUserRepository() {
    override val currentUser = MutableStateFlow(Result.success(currentUser))
    override val currentAccount = MutableStateFlow(
        Result.success(
            AuthAccount(
                id = currentUser.id,
                email = "${currentUser.id}@example.test",
                name = currentUser.fullName,
            )
        )
    )
}

private class MatchDetailFakeTeamRepository(
    private val currentUser: UserData,
    teams: List<Team>,
    private val currentUserTeamIdsInRepository: List<String>? = null,
) : ITeamRepository {
    private val teamsById = teams.associateBy { team -> team.id }
    private val usersById = buildMap {
        put(currentUser.id, currentUser)
        teams.forEach { team ->
            if (!containsKey(team.captainId)) {
                put(team.captainId, createUser(id = team.captainId))
            }
            team.playerIds.forEach { playerId ->
                if (!containsKey(playerId)) {
                    put(playerId, createUser(id = playerId))
                }
            }
        }
    }

    override fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> =
        flowOf(Result.success(ids.mapNotNull { id -> teamsById[id] }.map { team -> team.toTeamWithPlayers(usersById) }))

    override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> =
        teamsById[teamId]
            ?.let { team -> Result.success(team.toTeamWithPlayers(usersById)) }
            ?: Result.failure(IllegalStateException("Team $teamId not found"))

    override suspend fun getTeams(ids: List<String>): Result<List<Team>> =
        Result.success(ids.mapNotNull { id -> teamsById[id] })

    override suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>> =
        Result.success(ids.mapNotNull { id -> teamsById[id] }.map { team -> team.toTeamWithPlayers(usersById) })

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> = Result.success(Unit)
    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> = Result.success(Unit)
    override suspend fun createTeam(newTeam: Team): Result<Team> = Result.success(newTeam)
    override suspend fun updateTeam(newTeam: Team): Result<Team> = Result.success(newTeam)
    override suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit> = Result.success(Unit)

    override fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>> {
        val teamIds = currentUserTeamIdsInRepository ?: currentUser.teamIds
        val currentUserTeams = teamIds
            .mapNotNull { teamId -> teamsById[teamId] }
            .map { team -> team.toTeamWithPlayers(usersById) }
        return flowOf(Result.success(currentUserTeams))
    }

    override fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>> =
        teamsById[id]
            ?.let { team -> flowOf(Result.success(team.toTeamWithRelations(usersById))) }
            ?: flowOf(Result.failure(IllegalStateException("Team $id not found")))

    override suspend fun listTeamInvites(userId: String) = Result.success(emptyList<com.razumly.mvp.core.data.dataTypes.Invite>())

    override suspend fun createTeamInvite(
        teamId: String,
        userId: String,
        createdBy: String,
        inviteType: String,
    ): Result<Unit> = Result.success(Unit)

    override suspend fun deleteInvite(inviteId: String): Result<Unit> = Result.success(Unit)
    override suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit> = Result.success(Unit)
}

private fun createTestComponentContext(): DefaultComponentContext {
    val lifecycle = LifecycleRegistry()
    lifecycle.onCreate()
    lifecycle.onStart()
    lifecycle.onResume()
    return DefaultComponentContext(
        lifecycle = lifecycle,
        backHandler = BackDispatcher(),
    )
}

private fun createEvent(
    teamIds: List<String>,
): Event = Event(
    id = "event-1",
    doTeamsRef = true,
    teamRefsMaySwap = true,
    teamIds = teamIds,
)

private fun createMatch(
    eventId: String,
    team1Id: String,
    team2Id: String,
    teamRefereeId: String,
    refereeCheckedIn: Boolean,
): MatchMVP = MatchMVP(
    id = "match-1",
    matchId = 1,
    eventId = eventId,
    team1Id = team1Id,
    team2Id = team2Id,
    teamRefereeId = teamRefereeId,
    refereeCheckedIn = refereeCheckedIn,
    team1Points = listOf(0),
    team2Points = listOf(0),
    setResults = listOf(0),
    start = Instant.fromEpochMilliseconds(1_700_000_000_000),
)

private fun createTeam(
    id: String,
    captainId: String,
    playerIds: List<String> = listOf(captainId),
): Team = Team(
    id = id,
    seed = 0,
    division = "OPEN",
    wins = 0,
    losses = 0,
    name = id,
    captainId = captainId,
    playerIds = playerIds,
    teamSize = 2,
)

private fun createUser(
    id: String,
    teamIds: List<String> = emptyList(),
): UserData = UserData(
    firstName = "Test",
    lastName = "User",
    teamIds = teamIds,
    friendIds = emptyList(),
    friendRequestIds = emptyList(),
    friendRequestSentIds = emptyList(),
    followingIds = emptyList(),
    userName = id,
    hasStripeAccount = false,
    uploadedImages = emptyList(),
    profileImageId = null,
    id = id,
)

private fun Event.toEventWithRelations(): EventWithRelations = EventWithRelations(
    event = this,
    host = null,
    players = emptyList(),
    teams = emptyList(),
)

private fun MatchMVP.toMatchWithRelations(): MatchWithRelations = MatchWithRelations(
    match = this,
    field = null,
    team1 = null,
    team2 = null,
    teamReferee = null,
    winnerNextMatch = null,
    loserNextMatch = null,
    previousLeftMatch = null,
    previousRightMatch = null,
)

private fun Team.toTeamWithPlayers(usersById: Map<String, UserData>): TeamWithPlayers {
    val captain = usersById[captainId] ?: createUser(id = captainId)
    val players = playerIds.map { playerId -> usersById[playerId] ?: createUser(id = playerId) }
    val pendingPlayers = pending.map { userId -> usersById[userId] ?: createUser(id = userId) }
    return TeamWithPlayers(
        team = this,
        captain = captain,
        players = players,
        pendingPlayers = pendingPlayers,
    )
}

private fun Team.toTeamWithRelations(usersById: Map<String, UserData>): TeamWithRelations {
    val players = playerIds.map { playerId -> usersById[playerId] ?: createUser(id = playerId) }
    return TeamWithRelations(
        team = this,
        players = players,
        matchAsTeam1 = emptyList(),
        matchAsTeam2 = emptyList(),
    )
}
