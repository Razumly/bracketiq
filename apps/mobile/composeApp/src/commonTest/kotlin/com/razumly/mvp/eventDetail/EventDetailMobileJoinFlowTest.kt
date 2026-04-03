@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.FamilyChild
import com.razumly.mvp.core.data.repositories.FamilyJoinRequest
import com.razumly.mvp.core.data.repositories.FamilyJoinRequestAction
import com.razumly.mvp.core.data.repositories.FamilyJoinRequestResolution
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.SelfRegistrationResult
import com.razumly.mvp.core.data.repositories.SignupProfileSelection
import com.razumly.mvp.core.data.repositories.UserEmailMembershipMatch
import com.razumly.mvp.core.data.repositories.UserVisibilityContext
import com.razumly.mvp.core.network.dto.InviteCreateDto
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.eventCreate.CreateEvent_FakeBillingRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeImagesRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeSportsRepository
import com.razumly.mvp.eventCreate.MainDispatcherTest
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.LoadingState
import com.razumly.mvp.eventDetail.data.IMatchRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventDetailMobileJoinFlowTest : MainDispatcherTest() {
    @Test
    fun league_mobile_flow_loads_playoffs_staff_invites_schedule_and_periphery_then_keeps_them_after_join() =
        runTest(testDispatcher) {
            val host = mobileUser(id = "host_1", firstName = "Host", lastName = "User")
            val currentUser = mobileUser(id = "mobile_joiner", firstName = "Mobile", lastName = "Joiner")
            val seededParticipant = mobileUser(id = "seeded_player", firstName = "Seeded", lastName = "Player")

            val teams = listOf(
                mobileTeam("team_1", "Court Crushers", "captain_1"),
                mobileTeam("team_2", "Baseline Bandits", "captain_2"),
                mobileTeam("team_3", "Volley Vortex", "captain_3"),
                mobileTeam("team_4", "Net Ninjas", "captain_4"),
            )

            val field = Field(
                id = "field_main",
                fieldNumber = 1,
                name = "Championship Court",
                divisions = listOf("open"),
                rentalSlotIds = listOf("slot_main"),
                location = "Main Complex",
                organizationId = "org_league",
            )
            val slot = TimeSlot(
                id = "slot_main",
                dayOfWeek = 4,
                daysOfWeek = listOf(4),
                divisions = listOf("open"),
                startTimeMinutes = 420,
                endTimeMinutes = 780,
                startDate = Instant.parse("2026-04-02T00:00:00Z"),
                repeating = true,
                endDate = Instant.parse("2026-06-25T00:00:00Z"),
                scheduledFieldId = field.id,
                scheduledFieldIds = listOf(field.id),
                price = 0,
            )
            val matches = listOf(
                mobileMatch("match_1", 1, "team_1", "team_4", field.id, "2026-04-02T07:00:00Z", "2026-04-02T08:00:00Z"),
                mobileMatch("match_2", 2, "team_2", "team_3", field.id, "2026-04-02T08:00:00Z", "2026-04-02T09:00:00Z"),
                mobileMatch("match_3", 3, "team_1", "team_3", field.id, "2026-04-02T09:00:00Z", "2026-04-02T10:00:00Z"),
                mobileMatch("match_4", 4, "team_4", "team_2", field.id, "2026-04-02T10:00:00Z", "2026-04-02T11:00:00Z"),
                mobileMatch("match_5", 5, "team_1", "team_2", field.id, "2026-04-02T11:00:00Z", "2026-04-02T12:00:00Z"),
                mobileMatch("match_6", 6, "team_3", "team_4", field.id, "2026-04-02T12:00:00Z", "2026-04-02T13:00:00Z"),
            )
            val staffInvites = listOf(
                Invite(
                    id = "invite_scorekeeper",
                    type = "event_staff",
                    eventId = "league_mobile_flow",
                    email = "scorekeeper@example.test",
                    firstName = "Score",
                    lastName = "Keeper",
                    status = "PENDING",
                    staffTypes = listOf("SCOREKEEPER"),
                    createdBy = host.id,
                ),
                Invite(
                    id = "invite_referee",
                    type = "event_staff",
                    eventId = "league_mobile_flow",
                    email = "referee@example.test",
                    firstName = "Ref",
                    lastName = "Eree",
                    status = "PENDING",
                    staffTypes = listOf("REFEREE"),
                    createdBy = host.id,
                ),
            )
            val initialEvent = Event(
                id = "league_mobile_flow",
                name = "Mobile League Playoff Flow",
                description = "Regression coverage for hydrated league joins on mobile.",
                hostId = host.id,
                coordinates = listOf(-80.1918, 25.7617),
                location = "Downtown Sports Hub",
                start = Instant.parse("2026-06-01T15:00:00Z"),
                end = Instant.parse("2026-06-29T19:00:00Z"),
                state = "PUBLISHED",
                eventType = EventType.LEAGUE,
                imageId = UPLOADED_DB_IMAGE_ID,
                includePlayoffs = true,
                playoffTeamCount = 4,
                teamSignup = false,
                singleDivision = true,
                divisions = listOf("open"),
                fieldIds = listOf(field.id),
                timeSlotIds = listOf(slot.id),
                teamIds = teams.map(Team::id),
                userIds = listOf(seededParticipant.id),
                maxParticipants = 32,
                gamesPerOpponent = 1,
            )

            val eventRepository = EventDetailFakeEventRepository(
                initialEvent = initialEvent,
                host = host,
                currentUser = currentUser,
                players = listOf(seededParticipant),
                teams = teams,
                staffInvites = staffInvites,
            )
            val fieldRepository = EventDetailFakeFieldRepository(
                fields = listOf(field),
                timeSlots = listOf(slot),
                fieldMatches = listOf(FieldWithMatches(field = field, matches = matches)),
            )
            val matchRepository = EventDetailFakeMatchRepository(
                matches = matches,
                fieldsById = mapOf(field.id to field),
                teamsById = teams.associateBy(Team::id),
            )
            val teamRepository = EventDetailFakeTeamRepository(
                teams = teams,
                users = listOf(host, currentUser, seededParticipant) + teams.map { team ->
                    mobileUser(id = team.captainId, firstName = "Captain", lastName = team.id.takeLast(1))
                },
            )

            val component = DefaultEventDetailComponent(
                componentContext = createTestComponentContext(),
                userRepository = EventDetailFakeUserRepository(currentUser),
                fieldRepository = fieldRepository,
                event = initialEvent,
                notificationsRepository = NoopPushNotificationsRepository,
                billingRepository = CreateEvent_FakeBillingRepository(),
                eventRepository = eventRepository,
                matchRepository = matchRepository,
                teamRepository = teamRepository,
                sportsRepository = CreateEvent_FakeSportsRepository(emptyList()),
                imageRepository = CreateEvent_FakeImagesRepository(),
                navigationHandler = NoopNavigationHandler,
            )
            component.setLoadingHandler(EventDetailTestLoadingHandler())

            advance()

            assertEquals(UPLOADED_DB_IMAGE_ID, component.selectedEvent.value.imageId)
            assertTrue(component.selectedEvent.value.includePlayoffs)
            assertEquals(4, component.selectedEvent.value.playoffTeamCount)
            assertEquals(staffInvites.map(Invite::email), component.eventWithRelations.value.staffInvites.map(Invite::email))
            assertEquals(listOf(slot.id), component.eventWithRelations.value.timeSlots.map(TimeSlot::id))
            assertEquals(listOf(field.id), component.eventFields.value.map { it.field.id })
            assertEquals(matches.map(MatchMVP::id), component.eventWithRelations.value.matches.map { it.match.id })
            assertEquals(teams.map(Team::id), component.eventWithRelations.value.teams.map { it.team.id })
            assertEquals(matches.size, component.eventFields.value.first().matches.size)
            assertTrue(fieldRepository.requestedFieldIds.any { it == listOf(field.id) })
            assertTrue(fieldRepository.requestedTimeSlotIds.any { it == listOf(slot.id) })
            assertTrue(matchRepository.requestedTournamentIds.contains(initialEvent.id))
            assertTrue(eventRepository.staffInviteRequests.contains(initialEvent.id))

            component.joinEvent()
            advance()

            assertEquals(1, eventRepository.joinCallCount)
            assertTrue(eventRepository.refreshRequests.isNotEmpty())
            assertTrue(component.isUserInEvent.value)
            assertTrue(component.selectedEvent.value.userIds.contains(currentUser.id))
            assertEquals(matches.map(MatchMVP::id), component.eventWithRelations.value.matches.map { it.match.id })
            assertEquals(listOf(slot.id), component.eventWithRelations.value.timeSlots.map(TimeSlot::id))
            assertEquals(listOf(field.id), component.eventFields.value.map { it.field.id })
            assertEquals(staffInvites.map(Invite::id), component.eventWithRelations.value.staffInvites.map(Invite::id))
        }
}

private const val UPLOADED_DB_IMAGE_ID = "camka_upload_upscaled_cc_indoor_sports_024be2e8d5cdead5_jpg"

private class EventDetailFakeEventRepository(
    initialEvent: Event,
    private val host: UserData,
    private val currentUser: UserData,
    players: List<UserData>,
    private val teams: List<Team>,
    private val staffInvites: List<Invite>,
) : IEventRepository by com.razumly.mvp.eventCreate.CreateEvent_FakeEventRepository() {
    private val eventFlow = MutableStateFlow(Result.success(initialEvent.toRelations(host, players, teams)))

    val staffInviteRequests = mutableListOf<String>()
    val refreshRequests = mutableListOf<String>()
    var joinCallCount = 0

    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> = eventFlow

    override suspend fun getEvent(eventId: String): Result<Event> {
        refreshRequests += eventId
        return Result.success(eventFlow.value.getOrThrow().event)
    }

    override suspend fun getEventStaffInvites(eventId: String): Result<List<Invite>> {
        staffInviteRequests += eventId
        return Result.success(staffInvites)
    }

    override suspend fun addCurrentUserToEvent(
        event: Event,
        preferredDivisionId: String?,
    ): Result<SelfRegistrationResult> {
        joinCallCount += 1
        val currentRelations = eventFlow.value.getOrThrow()
        val updatedEvent = currentRelations.event.copy(
            userIds = (currentRelations.event.userIds + currentUser.id).distinct(),
        )
        val updatedPlayers = (currentRelations.players + currentUser).distinctBy(UserData::id)
        eventFlow.value = Result.success(updatedEvent.toRelations(host, updatedPlayers, teams))
        return Result.success(SelfRegistrationResult())
    }
}

private class EventDetailFakeFieldRepository(
    private val fields: List<Field>,
    private val timeSlots: List<TimeSlot>,
    fieldMatches: List<FieldWithMatches>,
) : IFieldRepository by com.razumly.mvp.eventCreate.CreateEvent_FakeFieldRepository() {
    private val fieldMatchesFlow = MutableStateFlow(fieldMatches)
    val requestedFieldIds = mutableListOf<List<String>>()
    val requestedTimeSlotIds = mutableListOf<List<String>>()

    override fun getFieldsWithMatchesFlow(ids: List<String>): Flow<List<FieldWithMatches>> =
        fieldMatchesFlow

    override suspend fun getFields(ids: List<String>): Result<List<Field>> {
        requestedFieldIds += ids
        val requested = ids.toSet()
        return Result.success(fields.filter { it.id in requested })
    }

    override suspend fun getTimeSlots(ids: List<String>): Result<List<TimeSlot>> {
        requestedTimeSlotIds += ids
        val requested = ids.toSet()
        return Result.success(timeSlots.filter { it.id in requested })
    }
}

private class EventDetailFakeMatchRepository(
    matches: List<MatchMVP>,
    fieldsById: Map<String, Field>,
    teamsById: Map<String, Team>,
) : IMatchRepository by com.razumly.mvp.eventCreate.CreateEvent_FakeMatchRepository() {
    private val matchFlow = MutableStateFlow(
        Result.success(matches.map { match ->
            MatchWithRelations(
                match = match,
                field = match.fieldId?.let(fieldsById::get),
                team1 = match.team1Id?.let(teamsById::get),
                team2 = match.team2Id?.let(teamsById::get),
                teamOfficial = match.teamOfficialId?.let(teamsById::get),
                winnerNextMatch = null,
                loserNextMatch = null,
                previousLeftMatch = null,
                previousRightMatch = null,
            )
        })
    )
    private val matchesByTournamentId = matches.groupBy(MatchMVP::eventId)

    val requestedTournamentIds = mutableListOf<String>()

    override fun getMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<MatchWithRelations>>> {
        requestedTournamentIds += tournamentId
        return matchFlow
    }

    override suspend fun getMatchesOfTournament(tournamentId: String): Result<List<MatchMVP>> {
        requestedTournamentIds += tournamentId
        return Result.success(matchesByTournamentId[tournamentId].orEmpty())
    }
}

private class EventDetailFakeTeamRepository(
    teams: List<Team>,
    users: List<UserData>,
) : ITeamRepository {
    private val usersById = users.associateBy(UserData::id)
    private val teamsById = teams.associateBy(Team::id)
    private val teamRelations = teams.map { team ->
        TeamWithPlayers(
            team = team,
            captain = usersById[team.captainId],
            players = team.playerIds.mapNotNull(usersById::get),
            pendingPlayers = team.pending.mapNotNull(usersById::get),
        )
    }

    override fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> {
        val requested = ids.toSet()
        return flowOf(Result.success(teamRelations.filter { it.team.id in requested }))
    }

    override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> =
        Result.success(teamRelations.first { it.team.id == teamId })

    override suspend fun getTeams(ids: List<String>): Result<List<Team>> {
        val requested = ids.toSet()
        return Result.success(teamsById.values.filter { it.id in requested })
    }

    override suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>> {
        val requested = ids.toSet()
        return Result.success(teamRelations.filter { it.team.id in requested })
    }

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> = Result.success(Unit)
    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> = Result.success(Unit)
    override suspend fun createTeam(newTeam: Team): Result<Team> = Result.success(newTeam)
    override suspend fun updateTeam(newTeam: Team): Result<Team> = Result.success(newTeam)
    override suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit> = Result.success(Unit)
    override fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>> = flowOf(Result.success(emptyList()))
    override fun getTeamsWithPlayersLoadingFlow(id: String): Flow<Boolean> = flowOf(false)
    override fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>> =
        flowOf(Result.failure(IllegalStateException("unused")))
    override suspend fun listTeamInvites(userId: String): Result<List<Invite>> = Result.success(emptyList())
    override suspend fun getInviteFreeAgents(teamId: String): Result<List<UserData>> = Result.success(emptyList())
    override suspend fun createTeamInvite(
        teamId: String,
        userId: String,
        createdBy: String,
        inviteType: String,
    ): Result<Unit> = Result.success(Unit)
    override suspend fun deleteInvite(inviteId: String): Result<Unit> = Result.success(Unit)
    override suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit> = Result.success(Unit)
}

private class EventDetailFakeUserRepository(
    currentUserData: UserData,
) : IUserRepository by com.razumly.mvp.eventCreate.CreateEvent_FakeUserRepository() {
    private val account = AuthAccount(
        id = currentUserData.id,
        email = "${currentUserData.id}@example.test",
        name = currentUserData.fullName,
    )

    override val currentUser: StateFlow<Result<UserData>> =
        MutableStateFlow(Result.success(currentUserData))
    override val currentAccount: StateFlow<Result<AuthAccount>> =
        MutableStateFlow(Result.success(account))

    override suspend fun getUsers(
        userIds: List<String>,
        visibilityContext: UserVisibilityContext,
    ): Result<List<UserData>> = Result.success(userIds.distinct().map { userId ->
        mobileUser(id = userId, firstName = "User", lastName = userId.takeLast(2))
    })

    override fun getUsersFlow(
        userIds: List<String>,
        visibilityContext: UserVisibilityContext,
    ): Flow<Result<List<UserData>>> = flowOf(
        Result.success(userIds.distinct().map { userId ->
            mobileUser(id = userId, firstName = "User", lastName = userId.takeLast(2))
        })
    )

    override suspend fun searchPlayers(search: String): Result<List<UserData>> = Result.success(emptyList())
    override suspend fun ensureUserByEmail(email: String): Result<UserData> =
        Result.success(mobileUser(id = email.substringBefore('@'), firstName = "Email", lastName = "User"))
    override suspend fun createInvites(invites: List<InviteCreateDto>): Result<List<Invite>> = Result.success(emptyList())
    override suspend fun deleteInvite(inviteId: String): Result<Unit> = Result.success(Unit)
    override suspend fun findEmailMembership(
        emails: List<String>,
        userIds: List<String>,
    ): Result<List<UserEmailMembershipMatch>> = Result.success(emptyList())
    override suspend fun listInvites(userId: String, type: String?): Result<List<Invite>> = Result.success(emptyList())
    override suspend fun acceptInvite(inviteId: String): Result<Unit> = Result.success(Unit)
    override suspend fun declineInvite(inviteId: String): Result<Unit> = Result.success(Unit)
    override suspend fun isCurrentUserChild(minorAgeThreshold: Int): Result<Boolean> = Result.success(false)
    override suspend fun listChildren(): Result<List<FamilyChild>> = Result.success(emptyList())
    override suspend fun listPendingChildJoinRequests(): Result<List<FamilyJoinRequest>> = Result.success(emptyList())
    override suspend fun resolveChildJoinRequest(
        registrationId: String,
        action: FamilyJoinRequestAction,
    ): Result<FamilyJoinRequestResolution> = Result.failure(NotImplementedError("unused"))
    override suspend fun createChildAccount(
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String?,
    ): Result<Unit> = Result.success(Unit)
    override suspend fun updateChildAccount(
        childUserId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String?,
    ): Result<Unit> = Result.success(Unit)
    override suspend fun linkChildToParent(
        childEmail: String?,
        childUserId: String?,
        relationship: String?,
    ): Result<Unit> = Result.success(Unit)
    override suspend fun createNewUser(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        userName: String,
        dateOfBirth: String?,
        profileSelection: SignupProfileSelection?,
    ): Result<UserData> = Result.success(currentUser.value.getOrThrow())
    override suspend fun updateUser(user: UserData): Result<UserData> = Result.success(user)
    override suspend fun updateEmail(email: String, password: String): Result<Unit> = Result.success(Unit)
    override suspend fun updatePassword(currentPassword: String, newPassword: String): Result<Unit> = Result.success(Unit)
    override suspend fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        currentPassword: String,
        newPassword: String,
        userName: String,
        profileImageId: String?,
    ): Result<Unit> = Result.success(Unit)
    override suspend fun getCurrentAccount(): Result<Unit> = Result.success(Unit)
    override suspend fun sendFriendRequest(user: UserData): Result<Unit> = Result.success(Unit)
    override suspend fun acceptFriendRequest(user: UserData): Result<Unit> = Result.success(Unit)
    override suspend fun declineFriendRequest(userId: String): Result<Unit> = Result.success(Unit)
    override suspend fun followUser(userId: String): Result<Unit> = Result.success(Unit)
    override suspend fun unfollowUser(userId: String): Result<Unit> = Result.success(Unit)
    override suspend fun removeFriend(userId: String): Result<Unit> = Result.success(Unit)
}

private object NoopPushNotificationsRepository : IPushNotificationsRepository {
    override suspend fun subscribeUserToTeamNotifications(userId: String, teamId: String): Result<Unit> = Result.success(Unit)
    override suspend fun unsubscribeUserFromTeamNotifications(userId: String, teamId: String): Result<Unit> = Result.success(Unit)
    override suspend fun subscribeUserToEventNotifications(userId: String, eventId: String): Result<Unit> = Result.success(Unit)
    override suspend fun unsubscribeUserFromEventNotifications(userId: String, eventId: String): Result<Unit> = Result.success(Unit)
    override suspend fun subscribeUserToMatchNotifications(userId: String, matchId: String): Result<Unit> = Result.success(Unit)
    override suspend fun unsubscribeUserFromMatchNotifications(userId: String, matchId: String): Result<Unit> = Result.success(Unit)
    override suspend fun subscribeUserToChatGroup(userId: String, chatGroupId: String): Result<Unit> = Result.success(Unit)
    override suspend fun unsubscribeUserFromChatGroup(userId: String, chatGroupId: String): Result<Unit> = Result.success(Unit)
    override suspend fun sendUserNotification(userId: String, title: String, body: String): Result<Unit> = Result.success(Unit)
    override suspend fun sendTeamNotification(teamId: String, title: String, body: String): Result<Unit> = Result.success(Unit)
    override suspend fun sendEventNotification(eventId: String, title: String, body: String, isTournament: Boolean): Result<Unit> =
        Result.success(Unit)
    override suspend fun sendMatchNotification(matchId: String, title: String, body: String): Result<Unit> = Result.success(Unit)
    override suspend fun sendChatGroupNotification(chatGroupId: String, title: String, body: String): Result<Unit> = Result.success(Unit)
    override suspend fun createTeamTopic(team: Team): Result<Unit> = Result.success(Unit)
    override suspend fun deleteTopic(id: String): Result<Unit> = Result.success(Unit)
    override suspend fun createEventTopic(event: Event): Result<Unit> = Result.success(Unit)
    override suspend fun createTournamentTopic(event: Event): Result<Unit> = Result.success(Unit)
    override suspend fun createChatGroupTopic(chatGroup: com.razumly.mvp.core.data.dataTypes.ChatGroup): Result<Unit> =
        Result.success(Unit)
    override fun setActiveChat(chatGroupId: String?) = Unit
    override suspend fun addDeviceAsTarget(): Result<Unit> = Result.success(Unit)
    override suspend fun removeDeviceAsTarget(): Result<Unit> = Result.success(Unit)
    override suspend fun getDeviceTargetDebugStatus(syncBeforeCheck: Boolean): Result<com.razumly.mvp.core.data.repositories.PushDeviceTargetDebugStatus> =
        Result.success(com.razumly.mvp.core.data.repositories.PushDeviceTargetDebugStatus())
}

private object NoopNavigationHandler : INavigationHandler {
    override fun navigateToMatch(match: MatchWithRelations, event: Event) = Unit
    override fun navigateToTeams(freeAgents: List<String>, event: Event?, selectedFreeAgentId: String?) = Unit
    override fun navigateToChat(user: UserData?, chat: com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations?) = Unit
    override fun navigateToCreate(rentalContext: RentalCreateContext?) = Unit
    override fun navigateToSearch() = Unit
    override fun navigateToEvent(event: Event) = Unit
    override fun navigateToOrganization(organizationId: String, initialTab: OrganizationDetailTab) = Unit
    override fun navigateToEvents() = Unit
    override fun navigateToRefunds() = Unit
    override fun navigateToLogin() = Unit
    override fun navigateBack() = Unit
}

private class EventDetailTestLoadingHandler : LoadingHandler {
    private val loadingStateFlow = MutableStateFlow(LoadingState())
    override val loadingState: StateFlow<LoadingState> = loadingStateFlow.asStateFlow()

    override fun showLoading(message: String, progress: Float?) {
        loadingStateFlow.value = LoadingState(isLoading = true, message = message, progress = progress)
    }

    override fun hideLoading() {
        loadingStateFlow.value = LoadingState()
    }

    override fun updateProgress(progress: Float) {
        loadingStateFlow.value = loadingStateFlow.value.copy(progress = progress)
    }
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

private fun Event.toRelations(
    host: UserData,
    players: List<UserData>,
    teams: List<Team>,
): EventWithRelations = EventWithRelations(
    event = this,
    host = host,
    players = players,
    teams = teams,
)

private fun mobileUser(
    id: String,
    firstName: String,
    lastName: String,
): UserData = UserData(
    firstName = firstName,
    lastName = lastName,
    teamIds = emptyList(),
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

private fun mobileTeam(
    id: String,
    name: String,
    captainId: String,
): Team = Team(
    id = id,
    division = "open",
    name = name,
    captainId = captainId,
    managerId = captainId,
    playerIds = listOf(captainId),
    teamSize = 6,
    divisionTypeId = "open",
    divisionTypeName = "Open",
    skillDivisionTypeId = "open",
    skillDivisionTypeName = "Open",
    ageDivisionTypeId = "open",
    ageDivisionTypeName = "Open",
    divisionGender = "C",
)

private fun mobileMatch(
    id: String,
    matchId: Int,
    team1Id: String,
    team2Id: String,
    fieldId: String,
    start: String,
    end: String,
): MatchMVP = MatchMVP(
    id = id,
    matchId = matchId,
    eventId = "league_mobile_flow",
    team1Id = team1Id,
    team2Id = team2Id,
    fieldId = fieldId,
    start = Instant.parse(start),
    end = Instant.parse(end),
    division = "open",
)
