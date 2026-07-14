package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.EventParticipantManagementCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventTeamComplianceCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventUserComplianceCacheEntry
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
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.CatalogCacheDao
import com.razumly.mvp.core.data.dataTypes.daos.EventComplianceDao
import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.EventParticipantManagementDao
import com.razumly.mvp.core.data.dataTypes.daos.EventRegistrationDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.configureMvpHttpClient
import com.razumly.mvp.core.util.jsonMVP
import dev.icerock.moko.geo.LatLng
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.http.content.OutgoingContent
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.JsonNull
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.ExperimentalTime
import kotlin.time.Duration.Companion.days
import kotlin.time.Instant

private class EventRepositoryHttp_InMemoryAuthTokenStore(
    private var token: String = "",
) : AuthTokenStore {
    override suspend fun get(): String = token
    override suspend fun set(token: String) { this.token = token }
    override suspend fun clear() { token = "" }
}

private class EventRepositoryHttp_FakeEventDao : EventDao {
    private val events = MutableStateFlow<Map<String, Event>>(emptyMap())
    val deleteEventsByIdCalls = mutableListOf<List<String>>()
    val deleteEventsWithCrossRefsCalls = mutableListOf<List<String>>()
    val deleteEventWithCrossRefsCalls = mutableListOf<String>()
    val deleteEventCrossRefsCalls = mutableListOf<String>()
    var clearAllEventsWithCrossRefsCalls = 0

    override suspend fun upsertEvent(game: Event) {
        events.value = events.value + (game.id to game)
    }

    override suspend fun upsertEvents(games: List<Event>) {
        events.value = games.fold(events.value) { acc, event -> acc + (event.id to event) }
    }

    override suspend fun deleteEvent(game: Event) {
        events.value = events.value - game.id
    }

    override suspend fun deleteEventsById(ids: List<String>) {
        deleteEventsByIdCalls += ids
        events.value = events.value - ids.toSet()
    }

    override suspend fun deleteAllEvents() {
        // Avoid races with repository init cleanup in tests.
    }

    override suspend fun deleteAllEventUserCrossRefs() {}

    override suspend fun deleteAllEventTeamCrossRefs() {}

    override fun getAllCachedEvents(): Flow<List<Event>> = events.map { it.values.toList() }

    override suspend fun getEventTeamCrossRefsByEventId(eventId: String): List<EventTeamCrossRef> = emptyList()
    override suspend fun upsertEventTeamCrossRefs(crossRefs: List<EventTeamCrossRef>) {}
    override suspend fun deleteEventTeamCrossRefs(crossRefs: List<EventTeamCrossRef>) {}
    override suspend fun getEventUserCrossRefsByEventId(eventId: String): List<EventUserCrossRef> = emptyList()
    override suspend fun deleteEventUserCrossRefs(crossRefs: List<EventUserCrossRef>) {}
    override suspend fun deleteEventById(id: String) { events.value = events.value - id }
    override suspend fun getEventById(id: String): Event? = events.value[id]
    override suspend fun getEventsByIds(ids: List<String>): List<Event> = ids.mapNotNull(events.value::get)
    override suspend fun getEventWithRelationsById(id: String): EventWithRelations = error("unused")
    override fun getEventWithRelationsFlow(id: String): Flow<EventWithRelations> = error("unused")
    override suspend fun deleteEventWithCrossRefs(eventId: String) {
        deleteEventWithCrossRefsCalls += eventId
        deleteEventById(eventId)
    }
    override suspend fun deleteEventsWithCrossRefs(eventIds: List<String>) {
        deleteEventsWithCrossRefsCalls += eventIds
        eventIds.forEach { deleteEventWithCrossRefs(it) }
    }
    override suspend fun deleteEventCrossRefs(eventId: String) {
        deleteEventCrossRefsCalls += eventId
    }
    override suspend fun deleteEventUserCrossRefsByEventId(eventId: String) {}
    override suspend fun deleteEventTeamCrossRefsByEventId(eventId: String) {}
    override suspend fun clearAllEventsWithCrossRefs() {
        clearAllEventsWithCrossRefsCalls += 1
        events.value = emptyMap()
    }
}

private class EventRepositoryHttp_FakeUserDataDao : UserDataDao {
    override suspend fun upsertUserData(userData: UserData) {}
    override suspend fun upsertUsersData(usersData: List<UserData>) {}
    override suspend fun deleteUsersById(ids: List<String>) {}
    override suspend fun upsertUserEventCrossRef(crossRef: EventUserCrossRef) {}
    override suspend fun upsertUserEventCrossRefs(crossRefs: List<EventUserCrossRef>) {}
    override suspend fun upsertUserTeamCrossRefs(crossRefs: List<TeamPlayerCrossRef>) {}
    override suspend fun deleteUserData(userData: UserData) {}
    override suspend fun deleteTeamCrossRefById(userIds: List<String>) {}
    override suspend fun getUserDataById(id: String): UserData? = null
    override suspend fun getUserDatasById(ids: List<String>): List<UserData> = emptyList()
    override fun getUserDatasByIdFlow(ids: List<String>): Flow<List<UserData>> = flowOf(emptyList())
    override fun getUserFlowById(id: String): Flow<UserData?> = flowOf(null)
    override suspend fun searchUsers(search: String): List<UserData> = emptyList()
}

private class EventRepositoryHttp_FakeTeamDao : TeamDao {
    override suspend fun upsertTeam(team: Team) {}
    override suspend fun upsertTeams(teams: List<Team>) {}
    override suspend fun getTeam(teamId: String): Team = error("unused")
    override suspend fun getTeams(teamIds: List<String>): List<Team> = emptyList()
    override suspend fun getTeamsForUser(userId: String): List<Team> = emptyList()
    override fun getTeamsForUserFlow(userId: String): Flow<List<TeamWithPlayers>> = flowOf(emptyList())
    override suspend fun getTeamInvitesForUser(userId: String): List<Team> = emptyList()
    override fun getTeamInvitesForUserFlow(userId: String): Flow<List<TeamWithPlayers>> = flowOf(emptyList())
    override suspend fun deleteTeamsByIds(ids: List<String>) {}
    override suspend fun getTeamPlayerCrossRefsByTeamId(teamId: String): List<TeamPlayerCrossRef> = emptyList()
    override suspend fun deleteTeam(team: Team) {}
    override suspend fun upsertTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef) {}
    override suspend fun upsertTeamPendingPlayerCrossRef(crossRef: com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef) {}
    override suspend fun upsertTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>) {}
    override suspend fun upsertTeamPendingPlayerCrossRefs(crossRefs: List<com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef>) {}
    override suspend fun deleteTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef) {}
    override suspend fun deleteTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>) {}
    override suspend fun deleteTeamPendingPlayerCrossRef(crossRef: com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef) {}
    override suspend fun deleteTeamPlayerCrossRefsByTeamId(teamId: String) {}
    override suspend fun deleteTeamPendingPlayerCrossRefsByTeamId(teamId: String) {}
    override suspend fun getTeamWithPlayers(teamId: String): TeamWithPlayers = error("unused")
    override fun getTeamWithPlayersFlow(teamId: String): Flow<TeamWithRelations?> = error("unused")
    override suspend fun getTeamsWithPlayers(teamIds: List<String>): List<TeamWithRelations> = error("unused")
    override fun getTeamsWithPlayersFlowByIds(ids: List<String>): Flow<List<TeamWithPlayers>> = flowOf(emptyList())
    override suspend fun upsertTeamWithRelations(team: Team) {}
    override suspend fun upsertTeamsWithRelations(teams: List<Team>) {}
}

private class EventRepositoryHttp_FakeFieldDao : FieldDao {
    val fields = mutableMapOf<String, Field>()
    override suspend fun upsertField(field: Field) {
        fields[field.id] = field
    }
    override suspend fun upsertFields(fields: List<Field>) {
        fields.forEach { field -> this.fields[field.id] = field }
    }
    override suspend fun getFieldsByIds(ids: List<String>): List<Field> = ids.mapNotNull(fields::get)
    override suspend fun getAllFields(): List<Field> = fields.values.toList()
    override suspend fun deleteFieldsById(ids: List<String>) {
        ids.forEach(fields::remove)
    }
    override suspend fun deleteField(field: Field) {
        fields.remove(field.id)
    }
    override fun getFieldById(id: String): Flow<FieldWithMatches?> = flowOf(null)
    override fun getFieldsWithMatches(ids: List<String>): Flow<List<FieldWithMatches>> = flowOf(emptyList())
}

private class EventRepositoryHttp_FakeMatchDao : MatchDao {
    val matches = mutableMapOf<String, MatchMVP>()
    val deletedMatchIds = mutableListOf<List<String>>()
    override suspend fun upsertMatch(match: MatchMVP) {
        matches[match.id] = match
    }
    override suspend fun upsertMatches(matches: List<MatchMVP>) {
        matches.forEach { match -> this.matches[match.id] = match }
    }
    override suspend fun deleteMatch(match: MatchMVP) {
        matches.remove(match.id)
    }
    override suspend fun getTotalMatchCount(): Int = matches.size
    override suspend fun getMatchesOfTournament(tournamentId: String): List<MatchMVP> =
        matches.values.filter { match -> match.eventId == tournamentId }
    override suspend fun deleteMatchesOfTournament(tournamentId: String) {
        matches.values
            .filter { match -> match.eventId == tournamentId }
            .map(MatchMVP::id)
            .forEach(matches::remove)
    }
    override suspend fun deleteMatchesById(ids: List<String>) {
        deletedMatchIds += ids
        ids.forEach(matches::remove)
    }
    override fun getMatchFlowById(id: String): Flow<MatchWithRelations?> = flowOf(null)
    override suspend fun getMatchById(id: String): MatchWithRelations? = null
    override fun getMatchesFlowOfTournament(tournamentId: String): Flow<List<MatchWithRelations>> = flowOf(emptyList())
}

private class EventRepositoryHttp_FakeParticipantManagementDao : EventParticipantManagementDao {
    val entries = mutableListOf<EventParticipantManagementCacheEntry>()
    override suspend fun upsertEntries(entries: List<EventParticipantManagementCacheEntry>) {
        this.entries += entries
    }
    override fun observeEntries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): Flow<List<EventParticipantManagementCacheEntry>> = flowOf(
        entries.filter { entry ->
            entry.eventId == eventId &&
                entry.cacheSlotId == cacheSlotId &&
                entry.cacheOccurrenceDate == cacheOccurrenceDate
        },
    )
    override suspend fun getEntries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): List<EventParticipantManagementCacheEntry> = entries.filter { entry ->
        entry.eventId == eventId &&
            entry.cacheSlotId == cacheSlotId &&
            entry.cacheOccurrenceDate == cacheOccurrenceDate
    }
    override suspend fun deleteEntries(eventId: String, cacheSlotId: String, cacheOccurrenceDate: String) {
        entries.removeAll { entry ->
            entry.eventId == eventId &&
                entry.cacheSlotId == cacheSlotId &&
                entry.cacheOccurrenceDate == cacheOccurrenceDate
        }
    }
    override suspend fun clearAll() {
        entries.clear()
    }
}

private class EventRepositoryHttp_FakeComplianceDao : EventComplianceDao {
    val teamSummaries = mutableListOf<EventTeamComplianceCacheEntry>()
    val userSummaries = mutableListOf<EventUserComplianceCacheEntry>()

    override suspend fun upsertTeamSummaries(summaries: List<EventTeamComplianceCacheEntry>) {
        teamSummaries += summaries
    }
    override suspend fun upsertUserSummaries(summaries: List<EventUserComplianceCacheEntry>) {
        userSummaries += summaries
    }
    override fun observeTeamSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): Flow<List<EventTeamComplianceCacheEntry>> = flowOf(getTeamSummariesSync(eventId, cacheSlotId, cacheOccurrenceDate))
    override fun observeTeamUserSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): Flow<List<EventUserComplianceCacheEntry>> = flowOf(getTeamUserSummariesSync(eventId, cacheSlotId, cacheOccurrenceDate))
    override fun observeStandaloneUserSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): Flow<List<EventUserComplianceCacheEntry>> = flowOf(getStandaloneUserSummariesSync(eventId, cacheSlotId, cacheOccurrenceDate))
    override suspend fun getTeamSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): List<EventTeamComplianceCacheEntry> = getTeamSummariesSync(eventId, cacheSlotId, cacheOccurrenceDate)
    override suspend fun getTeamUserSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): List<EventUserComplianceCacheEntry> = getTeamUserSummariesSync(eventId, cacheSlotId, cacheOccurrenceDate)
    override suspend fun getStandaloneUserSummaries(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): List<EventUserComplianceCacheEntry> = getStandaloneUserSummariesSync(eventId, cacheSlotId, cacheOccurrenceDate)
    override suspend fun deleteTeamSummaries(eventId: String, cacheSlotId: String, cacheOccurrenceDate: String) {
        teamSummaries.removeAll { entry ->
            entry.eventId == eventId &&
                entry.cacheSlotId == cacheSlotId &&
                entry.cacheOccurrenceDate == cacheOccurrenceDate
        }
    }
    override suspend fun deleteTeamUserSummaries(eventId: String, cacheSlotId: String, cacheOccurrenceDate: String) {
        userSummaries.removeAll { entry ->
            entry.eventId == eventId &&
                entry.cacheSlotId == cacheSlotId &&
                entry.cacheOccurrenceDate == cacheOccurrenceDate &&
                entry.parentTeamId.isNotEmpty()
        }
    }
    override suspend fun deleteStandaloneUserSummaries(eventId: String, cacheSlotId: String, cacheOccurrenceDate: String) {
        userSummaries.removeAll { entry ->
            entry.eventId == eventId &&
                entry.cacheSlotId == cacheSlotId &&
                entry.cacheOccurrenceDate == cacheOccurrenceDate &&
                entry.parentTeamId.isEmpty()
        }
    }
    override suspend fun clearTeamSummaries() {
        teamSummaries.clear()
    }
    override suspend fun clearUserSummaries() {
        userSummaries.clear()
    }

    private fun getTeamSummariesSync(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): List<EventTeamComplianceCacheEntry> = teamSummaries.filter { entry ->
        entry.eventId == eventId &&
            entry.cacheSlotId == cacheSlotId &&
            entry.cacheOccurrenceDate == cacheOccurrenceDate
    }

    private fun getTeamUserSummariesSync(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): List<EventUserComplianceCacheEntry> = userSummaries.filter { entry ->
        entry.eventId == eventId &&
            entry.cacheSlotId == cacheSlotId &&
            entry.cacheOccurrenceDate == cacheOccurrenceDate &&
            entry.parentTeamId.isNotEmpty()
    }

    private fun getStandaloneUserSummariesSync(
        eventId: String,
        cacheSlotId: String,
        cacheOccurrenceDate: String,
    ): List<EventUserComplianceCacheEntry> = userSummaries.filter { entry ->
        entry.eventId == eventId &&
            entry.cacheSlotId == cacheSlotId &&
            entry.cacheOccurrenceDate == cacheOccurrenceDate &&
            entry.parentTeamId.isEmpty()
    }
}

private class EventRepositoryHttp_FakeDatabaseService(
    override val getEventDao: EventDao,
    override val getUserDataDao: UserDataDao,
    override val getTeamDao: TeamDao,
    override val getMatchDao: MatchDao = EventRepositoryHttp_FakeMatchDao(),
    override val getFieldDao: FieldDao = EventRepositoryHttp_FakeFieldDao(),
    override val getEventParticipantManagementDao: EventParticipantManagementDao =
        EventRepositoryHttp_FakeParticipantManagementDao(),
    override val getEventComplianceDao: EventComplianceDao = EventRepositoryHttp_FakeComplianceDao(),
    override val getCatalogCacheDao: CatalogCacheDao = InMemoryCatalogCacheDao(),
) : DatabaseService {
    override val getEventRegistrationDao: EventRegistrationDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}

@OptIn(ExperimentalTime::class)
@Suppress("SameParameterValue")
private fun makeEvent(
    id: String,
    hostId: String,
    userIds: List<String> = emptyList(),
): Event {
    return Event(
        id = id,
        name = "E$id",
        hostId = hostId,
        coordinates = listOf(-80.0, 25.0),
        start = Instant.parse("2026-02-10T00:00:00Z"),
        end = Instant.parse("2026-02-10T01:00:00Z"),
        maxParticipants = 10,
        userIds = userIds,
        teamIds = emptyList(),
    )
}

private fun makeUser(id: String): UserData {
    return UserData(
        firstName = "",
        lastName = "",
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
}

private class EventRepositoryHttp_FakeUserRepository(
    initialCurrentUser: UserData,
) : IUserRepository {
    private val currentUserState = MutableStateFlow(Result.success(initialCurrentUser))
    override val currentUser: StateFlow<Result<UserData>> = currentUserState
    override val currentAccount: StateFlow<Result<AuthAccount>> = MutableStateFlow(Result.failure(Exception("unused")))

    var lastGetUsersInput: List<String>? = null
    val requestedUserIds: MutableSet<String> = mutableSetOf()

    override suspend fun getUsers(
        userIds: List<String>,
        visibilityContext: UserVisibilityContext,
    ): Result<List<UserData>> {
        lastGetUsersInput = userIds
        requestedUserIds.addAll(userIds.filter(String::isNotBlank))
        return Result.success(userIds.distinct().filter(String::isNotBlank).map(::makeUser))
    }

    override fun getUsersFlow(
        userIds: List<String>,
        visibilityContext: UserVisibilityContext,
    ): Flow<Result<List<UserData>>> = flowOf(Result.success(emptyList()))

    override suspend fun login(email: String, password: String): Result<UserData> = error("unused")
    override suspend fun logout(): Result<Unit> = error("unused")
    override suspend fun deleteAccount(confirmationText: String): Result<Unit> = error("unused")
    override suspend fun searchPlayers(search: String): Result<List<UserData>> = error("unused")
    override suspend fun ensureUserByEmail(email: String): Result<UserData> = error("unused")
    override suspend fun createInvites(invites: List<com.razumly.mvp.core.network.dto.InviteCreateDto>): Result<List<com.razumly.mvp.core.data.dataTypes.Invite>> = error("unused")
    override suspend fun deleteInvite(inviteId: String): Result<Unit> = error("unused")
    override suspend fun findEmailMembership(
        emails: List<String>,
        userIds: List<String>,
    ): Result<List<UserEmailMembershipMatch>> = error("unused")
    override suspend fun listInvites(userId: String, type: String?): Result<List<com.razumly.mvp.core.data.dataTypes.Invite>> = error("unused")
    override suspend fun acceptInvite(inviteId: String): Result<Unit> = error("unused")
    override suspend fun declineInvite(inviteId: String): Result<Unit> = error("unused")
    override suspend fun isCurrentUserChild(minorAgeThreshold: Int): Result<Boolean> = error("unused")
    override suspend fun listChildren(): Result<List<FamilyChild>> = error("unused")
    override suspend fun listPendingChildJoinRequests(): Result<List<FamilyJoinRequest>> = error("unused")
    override suspend fun resolveChildJoinRequest(
        registrationId: String,
        action: FamilyJoinRequestAction,
    ): Result<FamilyJoinRequestResolution> = error("unused")
    override suspend fun createChildAccount(
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String?,
    ): Result<Unit> = error("unused")

    override suspend fun updateChildAccount(
        childUserId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String?,
    ): Result<Unit> = error("unused")

    override suspend fun linkChildToParent(
        childEmail: String?,
        childUserId: String?,
        relationship: String?,
    ): Result<Unit> = error("unused")

    override suspend fun createNewUser(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        userName: String,
        dateOfBirth: String?,
        profileSelection: SignupProfileSelection?,
    ): Result<UserData> = error("unused")
    override suspend fun updateUser(user: UserData): Result<UserData> = error("unused")
    override suspend fun updateEmail(email: String, password: String): Result<Unit> = error("unused")
    override suspend fun updatePassword(currentPassword: String, newPassword: String): Result<Unit> = error("unused")
    override suspend fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        userName: String,
        profileImageId: String?,
    ): Result<Unit> = error("unused")
    override suspend fun getCurrentAccount(): Result<Unit> = error("unused")
    override suspend fun sendFriendRequest(user: UserData): Result<Unit> = error("unused")
    override suspend fun acceptFriendRequest(user: UserData): Result<Unit> = error("unused")
    override suspend fun declineFriendRequest(userId: String): Result<Unit> = error("unused")
    override suspend fun followUser(userId: String): Result<Unit> = error("unused")
    override suspend fun unfollowUser(userId: String): Result<Unit> = error("unused")
    override suspend fun removeFriend(userId: String): Result<Unit> = error("unused")
    override suspend fun setCachedCurrentUserProfile(profile: UserData): Result<UserData> {
        currentUserState.value = Result.success(profile)
        return Result.success(profile)
    }

    fun emitCurrentUser(profile: UserData?) {
        currentUserState.value = profile?.let { Result.success(it) } ?: Result.failure(Exception("No User"))
    }
}

private object EventRepositoryHttp_UnusedTeamRepository : ITeamRepository {
    override fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> = error("unused")
    override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> = error("unused")
    override suspend fun getTeams(ids: List<String>): Result<List<Team>> = error("unused")
    override suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>> = error("unused")
    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> = error("unused")
    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> = error("unused")
    override suspend fun createTeam(newTeam: Team): Result<Team> = error("unused")
    override suspend fun updateTeam(newTeam: Team): Result<Team> = error("unused")
    override suspend fun requestTeamRegistration(
        teamId: String,
        answers: Map<String, String>,
    ): Result<TeamRegistrationResult> = error("unused")
    override suspend fun registerForTeam(teamId: String): Result<Team> = error("unused")
    override suspend fun leaveTeam(teamId: String): Result<Team> = error("unused")
    override suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit> = error("unused")
    override fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>> = error("unused")
    override fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>> = error("unused")
    override suspend fun listTeamInvites(userId: String): Result<List<com.razumly.mvp.core.data.dataTypes.Invite>> = error("unused")
    override suspend fun createTeamInvite(
        teamId: String,
        userId: String,
        createdBy: String,
        inviteType: String,
    ): Result<Unit> = error("unused")
    override suspend fun getInviteFreeAgents(teamId: String): Result<List<UserData>> = error("unused")
    override suspend fun deleteInvite(inviteId: String): Result<Unit> = error("unused")
    override suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit> = error("unused")
}

class EventRepositoryHttpTest {
    @Test
    fun getMySchedule_follows_server_cursor_and_merges_all_pages_without_duplicates() = runTest {
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        var requestCount = 0
        var requestedWindowFrom: String? = null
        var requestedWindowTo: String? = null
        val engine = MockEngine { request ->
            requestCount += 1
            assertEquals("/api/profile/schedule", request.url.encodedPath)
            assertEquals("200", request.url.parameters["limit"])
            val windowFrom = request.url.parameters["from"] ?: error("Missing bounded schedule from")
            val windowTo = request.url.parameters["to"] ?: error("Missing bounded schedule to")
            assertEquals(456.days, Instant.parse(windowTo) - Instant.parse(windowFrom))
            requestedWindowFrom?.let { assertEquals(it, windowFrom) }
            requestedWindowTo?.let { assertEquals(it, windowTo) }
            requestedWindowFrom = windowFrom
            requestedWindowTo = windowTo

            when (requestCount) {
                1 -> {
                    assertEquals(null, request.url.parameters["cursor"])
                    respond(
                        content = """
                            {
                              "events": [
                                {
                                  "id": "event_1",
                                  "name": "First Event",
                                  "hostId": "host_1",
                                  "coordinates": [-80.0, 25.0],
                                  "start": "2026-07-13T12:00:00Z",
                                  "end": "2026-07-13T13:00:00Z"
                                }
                              ],
                              "pagination": {
                                "limit": 200,
                                "hasMore": true,
                                "nextCursor": "cursor two/+",
                                "isComplete": false,
                                "windowFrom": "$windowFrom",
                                "windowTo": "$windowTo"
                              }
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                2 -> {
                    assertEquals("cursor two/+", request.url.parameters["cursor"])
                    respond(
                        content = """
                            {
                              "events": [
                                {
                                  "id": "event_1",
                                  "name": "First Event",
                                  "hostId": "host_1",
                                  "coordinates": [-80.0, 25.0],
                                  "start": "2026-07-13T12:00:00Z",
                                  "end": "2026-07-13T13:00:00Z"
                                },
                                {
                                  "id": "event_2",
                                  "name": "Second Event",
                                  "hostId": "host_1",
                                  "coordinates": [-80.0, 25.0],
                                  "start": "2026-07-14T12:00:00Z",
                                  "end": "2026-07-14T13:00:00Z"
                                }
                              ],
                              "pagination": {
                                "limit": 200,
                                "hasMore": false,
                                "nextCursor": null,
                                "isComplete": true,
                                "windowFrom": "$windowFrom",
                                "windowTo": "$windowTo"
                              }
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                else -> error("Unexpected schedule page request $requestCount")
            }
        }
        val api = MvpApiClient(
            HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
            "http://example.test",
            EventRepositoryHttp_InMemoryAuthTokenStore("t123"),
        )
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val snapshot = repo.getMySchedule().getOrThrow()

        assertEquals(2, requestCount)
        assertEquals(listOf("event_1", "event_2"), snapshot.events.map(Event::id))
        assertEquals("event_1", eventDao.getEventById("event_1")?.id)
        assertEquals("event_2", eventDao.getEventById("event_2")?.id)
    }

    @Test
    fun getMySchedule_fails_closed_when_an_incomplete_page_has_no_cursor() = runTest {
        val db = EventRepositoryHttp_FakeDatabaseService(
            EventRepositoryHttp_FakeEventDao(),
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        val engine = MockEngine {
            respond(
                content = """
                    {
                      "events": [],
                      "pagination": {
                        "limit": 200,
                        "hasMore": true,
                        "nextCursor": null
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
            "http://example.test",
            EventRepositoryHttp_InMemoryAuthTokenStore("t123"),
        )
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val failure = repo.getMySchedule().exceptionOrNull()

        assertEquals(
            "Schedule page is incomplete but did not provide a continuation cursor",
            failure?.message,
        )
    }

    @Test
    fun getMySchedule_fails_closed_when_pagination_metadata_disappears_on_continuation() = runTest {
        val db = EventRepositoryHttp_FakeDatabaseService(
            EventRepositoryHttp_FakeEventDao(),
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        var requestCount = 0
        val engine = MockEngine {
            requestCount += 1
            respond(
                content = if (requestCount == 1) {
                    """
                        {
                          "events": [],
                          "pagination": {
                            "limit": 200,
                            "hasMore": true,
                            "nextCursor": "cursor_2",
                            "isComplete": false
                          }
                        }
                    """.trimIndent()
                } else {
                    """
                        {
                          "events": [{
                            "id": "event_2",
                            "name": "Second Event",
                            "hostId": "host_1",
                            "coordinates": [-80.0, 25.0],
                            "start": "2026-07-14T12:00:00Z",
                            "end": "2026-07-14T13:00:00Z"
                          }]
                        }
                    """.trimIndent()
                },
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val repo = EventRepository(
            db,
            MvpApiClient(
                HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
                "http://example.test",
                EventRepositoryHttp_InMemoryAuthTokenStore("t123"),
            ),
            EventRepositoryHttp_UnusedTeamRepository,
            userRepo,
        )

        val failure = repo.getMySchedule().exceptionOrNull()

        assertEquals(
            "Schedule response dropped pagination metadata during continuation",
            failure?.message,
        )
        assertEquals(2, requestCount)
    }

    @Test
    fun getMySchedule_fails_closed_when_server_never_terminates_pagination() = runTest {
        val db = EventRepositoryHttp_FakeDatabaseService(
            EventRepositoryHttp_FakeEventDao(),
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        var requestCount = 0
        val engine = MockEngine {
            requestCount += 1
            respond(
                content = """
                    {
                      "events": [],
                      "pagination": {
                        "limit": 200,
                        "hasMore": true,
                        "nextCursor": "cursor_$requestCount",
                        "isComplete": false
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val repo = EventRepository(
            db,
            MvpApiClient(
                HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
                "http://example.test",
                EventRepositoryHttp_InMemoryAuthTokenStore("t123"),
            ),
            EventRepositoryHttp_UnusedTeamRepository,
            userRepo,
        )

        val failure = repo.getMySchedule().exceptionOrNull()

        assertEquals("Schedule endpoint exceeded the safe pagination limit", failure?.message)
        assertEquals(100, requestCount)
    }

    @Test
    fun getMySchedule_accepts_a_small_legacy_response_without_pagination_metadata() = runTest {
        val db = EventRepositoryHttp_FakeDatabaseService(
            EventRepositoryHttp_FakeEventDao(),
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        val engine = MockEngine {
            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "event_legacy",
                          "name": "Legacy Event",
                          "hostId": "host_1",
                          "coordinates": [-80.0, 25.0],
                          "start": "2026-07-13T12:00:00Z",
                          "end": "2026-07-13T13:00:00Z"
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
            "http://example.test",
            EventRepositoryHttp_InMemoryAuthTokenStore("t123"),
        )
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val snapshot = repo.getMySchedule().getOrThrow()

        assertEquals(listOf("event_legacy"), snapshot.events.map(Event::id))
    }

    @Test
    fun getMyScheduleNextAction_maps_the_narrow_match_contract() = runTest {
        val db = EventRepositoryHttp_FakeDatabaseService(
            EventRepositoryHttp_FakeEventDao(),
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        val engine = MockEngine { request ->
            assertEquals("/api/profile/schedule/next-action", request.url.encodedPath)
            respond(
                content = """
                    {
                      "contractVersion": 1,
                      "generatedAt": "2026-07-13T12:00:00.000Z",
                      "action": {
                        "type": "MATCH",
                        "eventId": "event_1",
                        "matchId": "match_1",
                        "eventName": "Summer League",
                        "eventImageId": "image_1"
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
            "http://example.test",
            EventRepositoryHttp_InMemoryAuthTokenStore("t123"),
        )
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val action = repo.getMyScheduleNextAction().getOrThrow()

        assertEquals(
            UserScheduleNextAction.MatchShortcut(
                eventId = "event_1",
                matchId = "match_1",
                eventName = "Summer League",
                eventImageId = "image_1",
            ),
            action,
        )
    }

    @Test
    fun getHostEventsPage_includes_offset_and_maps_server_pagination() = runTest {
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        val engine = MockEngine { request ->
            assertEquals("/api/events", request.url.encodedPath)
            assertEquals("host_1", request.url.parameters["hostId"])
            assertEquals("50", request.url.parameters["limit"])
            assertEquals("200", request.url.parameters["offset"])
            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "event_201",
                          "name": "Hosted Event",
                          "hostId": "host_1",
                          "coordinates": [-80.0, 25.0],
                          "start": "2026-07-13T12:00:00Z",
                          "end": "2026-07-13T13:00:00Z"
                        }
                      ],
                      "pagination": {
                        "limit": 50,
                        "offset": 200,
                        "nextOffset": 201,
                        "hasMore": true
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
            "http://example.test",
            EventRepositoryHttp_InMemoryAuthTokenStore("t123"),
        )
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val page = repo.getHostEventsPage(" host_1 ", limit = 50, offset = 200).getOrThrow()

        assertEquals(listOf("event_201"), page.events.map(Event::id))
        assertEquals(201, page.nextOffset)
        assertTrue(page.hasMore)
    }

    @Test
    fun getHostEventsPage_fails_the_retryable_page_when_any_event_row_is_malformed() = runTest {
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        val engine = MockEngine {
            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "event_201",
                          "name": "Valid Event",
                          "hostId": "host_1",
                          "start": "2026-07-13T12:00:00Z",
                          "end": "2026-07-13T13:00:00Z"
                        },
                        {
                          "id": "event_202",
                          "name": "Malformed Event",
                          "hostId": "host_1",
                          "start": "not-a-date",
                          "end": "2026-07-13T13:00:00Z"
                        }
                      ],
                      "pagination": {
                        "limit": 2,
                        "offset": 200,
                        "nextOffset": 202,
                        "hasMore": true
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
            "http://example.test",
            EventRepositoryHttp_InMemoryAuthTokenStore("t123"),
        )
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val result = repo.getHostEventsPage("host_1", limit = 2, offset = 200)

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message.orEmpty().contains("Hosted events page row 2"))
        assertTrue(result.exceptionOrNull()?.message.orEmpty().contains("id=event_202"))
        assertTrue(eventDao.getAllCachedEvents().first().isEmpty())
    }

    @Test
    fun getHostEventsPage_fails_when_server_claims_more_rows_without_a_continuation() = runTest {
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        val engine = MockEngine {
            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "event_201",
                          "name": "Hosted Event",
                          "hostId": "host_1",
                          "start": "2026-07-13T12:00:00Z",
                          "end": "2026-07-13T13:00:00Z"
                        }
                      ],
                      "pagination": {
                        "limit": 50,
                        "offset": 200,
                        "hasMore": true
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
            "http://example.test",
            EventRepositoryHttp_InMemoryAuthTokenStore("t123"),
        )
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val result = repo.getHostEventsPage("host_1", limit = 50, offset = 200)

        assertTrue(result.isFailure)
        assertEquals(
            "Hosted events page is missing a valid continuation offset",
            result.exceptionOrNull()?.message,
        )
    }

    @Test
    fun getOrganizationEventsPage_includes_offset_and_maps_server_pagination() = runTest {
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        val engine = MockEngine { request ->
            assertEquals("/api/events", request.url.encodedPath)
            assertEquals("org_1", request.url.parameters["organizationId"])
            assertEquals("50", request.url.parameters["limit"])
            assertEquals("25", request.url.parameters["offset"])
            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "event_26",
                          "name": "Organization Event",
                          "hostId": "host_1",
                          "coordinates": [-80.0, 25.0],
                          "start": "2026-07-13T12:00:00Z",
                          "end": "2026-07-13T13:00:00Z"
                        }
                      ],
                      "pagination": {
                        "limit": 50,
                        "offset": 25,
                        "nextOffset": 26,
                        "hasMore": true
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
            "http://example.test",
            EventRepositoryHttp_InMemoryAuthTokenStore("t123"),
        )
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val page = repo.getOrganizationEventsPage("org_1", limit = 50, offset = 25).getOrThrow()

        assertEquals(listOf("event_26"), page.events.map(Event::id))
        assertEquals(26, page.nextOffset)
        assertTrue(page.hasMore)
    }

    @Test
    fun getOrganizationEventsPage_sanitizes_values_and_treats_missing_pagination_as_terminal() = runTest {
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        val engine = MockEngine { request ->
            assertEquals("organization one", request.url.parameters["organizationId"])
            assertEquals("1", request.url.parameters["limit"])
            assertEquals("7", request.url.parameters["offset"])
            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "event_1",
                          "name": "Legacy Organization Event",
                          "hostId": "host_1",
                          "coordinates": [-80.0, 25.0],
                          "start": "2026-07-13T12:00:00Z",
                          "end": "2026-07-13T13:00:00Z"
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
            "http://example.test",
            EventRepositoryHttp_InMemoryAuthTokenStore("t123"),
        )
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val page = repo.getOrganizationEventsPage(" organization one ", limit = -3, offset = 7).getOrThrow()

        assertEquals(listOf("event_1"), page.events.map(Event::id))
        assertEquals(8, page.nextOffset)
        assertFalse(page.hasMore)
    }

    @Test
    fun getCachedEventsFlow_filters_hidden_events_from_cached_results() = runTest {
        val eventDao = EventRepositoryHttp_FakeEventDao()
        eventDao.upsertEvents(
            listOf(
                makeEvent(id = "hidden_event", hostId = "u1"),
                makeEvent(id = "visible_event", hostId = "u2"),
            )
        )
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(
            makeUser("u1").copy(hiddenEventIds = listOf("hidden_event"))
        )
        val api = MvpApiClient(
            HttpClient(MockEngine { error("HTTP should not be used in cached-events test") }) {
                install(ContentNegotiation) { json(jsonMVP) }
            },
            "http://localhost",
            EventRepositoryHttp_InMemoryAuthTokenStore(),
        )
        val repo = EventRepository(
            db,
            api,
            EventRepositoryHttp_UnusedTeamRepository,
            userRepo,
            coroutineDispatcher = StandardTestDispatcher(testScheduler),
        )

        val events = repo.getCachedEventsFlow().first().getOrThrow()

        assertEquals(listOf("visible_event"), events.map { it.id })
    }

    @Test
    @OptIn(ExperimentalCoroutinesApi::class)
    fun getCachedEventsFlow_clears_cached_events_when_current_user_changes() = runTest {
        val eventDao = EventRepositoryHttp_FakeEventDao()
        eventDao.upsertEvents(
            listOf(
                makeEvent(id = "hidden_event", hostId = "host_1"),
                makeEvent(id = "visible_event", hostId = "host_2"),
            )
        )
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val api = MvpApiClient(
            HttpClient(MockEngine { error("HTTP should not be used in cached-events test") }) {
                install(ContentNegotiation) { json(jsonMVP) }
            },
            "http://localhost",
            EventRepositoryHttp_InMemoryAuthTokenStore(),
        )
        val repo = EventRepository(
            db,
            api,
            EventRepositoryHttp_UnusedTeamRepository,
            userRepo,
            coroutineDispatcher = StandardTestDispatcher(testScheduler),
        )

        userRepo.emitCurrentUser(makeUser("u2"))
        advanceUntilIdle()

        val events = repo.getCachedEventsFlow().first().getOrThrow()

        assertTrue(events.isEmpty())
        assertEquals(1, eventDao.clearAllEventsWithCrossRefsCalls)
    }

    @Test
    fun reportEvent_removes_hidden_events_from_cache_and_updates_current_user() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        eventDao.upsertEvents(
            listOf(
                makeEvent(id = "event_1", hostId = "u1"),
                makeEvent(id = "event_2", hostId = "u2"),
            )
        )
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals("/api/moderation/reports", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            respond(
                content = """
                    {
                      "hiddenEventIds": ["event_1"],
                      "removedChatIds": []
                    }
                """.trimIndent(),
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }
        val api = MvpApiClient(http, "http://localhost", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        repo.reportEvent("event_1", "spam").getOrThrow()

        val cachedEvents = eventDao.getAllCachedEvents().first()
        val cachedUser = userRepo.currentUser.value.getOrNull()

        assertEquals(listOf("event_2"), cachedEvents.map { it.id })
        assertEquals(listOf("event_1"), cachedUser?.hiddenEventIds)
        assertEquals(listOf(listOf("event_1")), eventDao.deleteEventsWithCrossRefsCalls)
        assertTrue(eventDao.deleteEventsByIdCalls.isEmpty())
    }

    @Test
    fun updateEvent_doesNotClearLegacyFieldCountWhenUnrelatedFieldsChange() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val cachedEvent = makeEvent(id = "event_1", hostId = "host_1").copy(fieldCount = 4)
        eventDao.upsertEvent(cachedEvent)
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        var capturedRequestBody = ""
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Patch, request.method)
            assertEquals("/api/events/event_1", request.url.encodedPath)
            capturedRequestBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()
            respond(
                content = """
                    {
                      "id": "event_1",
                      "name": "Renamed Event",
                      "hostId": "host_1",
                      "coordinates": [-80.0, 25.0],
                      "start": "2026-02-10T00:00:00Z",
                      "end": "2026-02-10T01:00:00Z"
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        repo.updateEvent(cachedEvent.copy(name = "Renamed Event", fieldCount = null)).getOrThrow()

        val eventPatch = jsonMVP.parseToJsonElement(capturedRequestBody)
            .jsonObject
            .getValue("event")
            .jsonObject
        assertEquals("Renamed Event", eventPatch["name"]?.jsonPrimitive?.content)
        assertFalse("fieldCount" in eventPatch)
    }

    @Test
    fun updateEventPreservingStaff_omits_staff_assignments_and_ignores_relation_cache_failure() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val cachedEvent = makeEvent(id = "event_1", hostId = "host_1")
        eventDao.upsertEvent(cachedEvent)
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        var capturedRequestBody = ""
        val engine = MockEngine { request ->
            capturedRequestBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()
            respond(
                content = """
                    {
                      "id": "event_1",
                      "name": "Updated Event",
                      "hostId": "host_1",
                      "teamIds": ["team_missing"],
                      "coordinates": [-80.0, 25.0],
                      "start": "2026-02-10T00:00:00Z",
                      "end": "2026-02-10T01:00:00Z"
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val repo = EventRepository(
            db,
            MvpApiClient(http, "http://example.test", tokenStore),
            EventRepositoryHttp_UnusedTeamRepository,
            userRepo,
        )

        repo.updateEventPreservingStaff(
            newEvent = cachedEvent.copy(
                name = "Updated Event",
                assistantHostIds = listOf("assistant_1"),
                officialPositions = listOf(EventOfficialPosition("position_1", "Referee")),
                eventOfficials = listOf(
                    EventOfficial(
                        id = "event_official_1",
                        userId = "official_1",
                        positionIds = listOf("position_1"),
                    ),
                ),
                officialIds = listOf("official_1"),
            ),
            expectedStaffRevision = "revision_loaded",
        ).getOrThrow()

        val requestBody = jsonMVP.parseToJsonElement(capturedRequestBody).jsonObject
        val eventPatch = requestBody
            .getValue("event")
            .jsonObject
        assertEquals("true", requestBody["preserveStaffAssignments"]?.jsonPrimitive?.content)
        assertEquals("revision_loaded", requestBody["expectedStaffRevision"]?.jsonPrimitive?.content)
        assertFalse("assistantHostIds" in eventPatch)
        assertFalse("eventOfficials" in eventPatch)
        assertFalse("officialIds" in eventPatch)
        assertTrue("officialPositions" in eventPatch)
    }

    @Test
    fun eventStaffState_uses_the_atomic_get_and_put_contract() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val baseEvent = makeEvent(id = "event_1", hostId = "host_1")
        eventDao.upsertEvent(baseEvent)
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        var requestCount = 0
        val engine = MockEngine { request ->
            requestCount += 1
            assertEquals("/api/events/event_1/staff", request.url.encodedPath)
            if (requestCount == 1) {
                assertEquals(HttpMethod.Get, request.method)
            } else {
                assertEquals(HttpMethod.Put, request.method)
                val body = jsonMVP.parseToJsonElement(
                    (request.body as OutgoingContent.ByteArrayContent).bytes().decodeToString(),
                ).jsonObject
                assertEquals("revision_1", body["expectedRevision"]?.jsonPrimitive?.content)
                assertEquals(
                    "assistant_1",
                    body.getValue("assistantHostIds").toString().trim('[', ']', '"'),
                )
                assertTrue(body.getValue("pendingInvites").toString().contains("ASSISTANT_HOST"))
            }
            respond(
                content = """
                    {
                      "contractVersion": 1,
                      "eventId": "event_1",
                      "revision": "${if (requestCount == 1) "revision_1" else "revision_2"}",
                      "assistantHostIds": ["assistant_1"],
                      "officialPositions": [
                        { "id": "position_1", "name": "Referee", "count": 1, "order": 0 }
                      ],
                      "eventOfficials": [],
                      "officialIds": [],
                      "staffInvites": []
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val repo = EventRepository(
            db,
            MvpApiClient(http, "http://example.test", tokenStore),
            EventRepositoryHttp_UnusedTeamRepository,
            userRepo,
        )

        val loaded = repo.getEventStaffState(baseEvent).getOrThrow()
        val reconciled = repo.reconcileEventStaff(
            event = loaded.event,
            pendingInvites = listOf(
                EventStaffInviteInput(
                    email = "Staff@Example.Test ",
                    firstName = " Avery ",
                    lastName = " Assistant ",
                    roles = setOf(EventStaffAssignmentRole.ASSISTANT_HOST),
                ),
            ),
            expectedRevision = loaded.revision,
        ).getOrThrow()

        assertEquals("revision_2", reconciled.revision)
        assertEquals(listOf("assistant_1"), reconciled.event.assistantHostIds)
        assertEquals(2, requestCount)
    }

    @Test
    fun eventStaffState_keeps_server_success_when_relation_cache_fails_and_accepts_empty_positions() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val baseEvent = makeEvent(id = "event_1", hostId = "host_1").copy(
            teamIds = listOf("team_missing"),
            officialPositions = listOf(EventOfficialPosition("position_stale", "Stale position")),
        )
        eventDao.upsertEvent(baseEvent)
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events/event_1/staff", request.url.encodedPath)
            respond(
                content = """
                    {
                      "contractVersion": 1,
                      "eventId": "event_1",
                      "revision": "revision_1",
                      "assistantHostIds": [],
                      "officialPositions": [],
                      "eventOfficials": [],
                      "officialIds": [],
                      "staffInvites": []
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val repo = EventRepository(
            db,
            MvpApiClient(
                HttpClient(engine) { configureMvpHttpClient() },
                "http://example.test",
                tokenStore,
            ),
            EventRepositoryHttp_UnusedTeamRepository,
            EventRepositoryHttp_FakeUserRepository(makeUser("user_1")),
        )

        val result = repo.getEventStaffState(baseEvent)

        assertTrue(result.isSuccess)
        assertTrue(result.getOrThrow().event.officialPositions.isEmpty())
    }

    @Test
    fun eventStaffState_surfaces_revision_conflicts_without_mutating_the_cache() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val baseEvent = makeEvent(id = "event_1", hostId = "host_1")
        eventDao.upsertEvent(baseEvent)
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Put, request.method)
            assertEquals("/api/events/event_1/staff", request.url.encodedPath)
            respond(
                content = """
                    {
                      "error": "Event staff changed. Reload and try again.",
                      "code": "EVENT_STAFF_REVISION_CONFLICT",
                      "currentRevision": "revision_current"
                    }
                """.trimIndent(),
                status = HttpStatusCode.Conflict,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val repo = EventRepository(
            db,
            MvpApiClient(
                HttpClient(engine) { configureMvpHttpClient() },
                "http://example.test",
                tokenStore,
            ),
            EventRepositoryHttp_UnusedTeamRepository,
            EventRepositoryHttp_FakeUserRepository(makeUser("user_1")),
        )

        val result = repo.reconcileEventStaff(
            event = baseEvent.copy(assistantHostIds = listOf("assistant_1")),
            pendingInvites = emptyList(),
            expectedRevision = "revision_stale",
        )

        assertTrue(result.isFailure)
        assertEquals(baseEvent, eventDao.getEventById("event_1"))
    }

    @Test
    fun updateEvent_encodes_intentionally_cleared_nullable_fields_as_json_null() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val cachedEvent = makeEvent(id = "event_1", hostId = "host_1").copy(
            address = "100 Court Way",
            minAge = 12,
            maxAge = 18,
            cancellationRefundHours = 24,
            sportId = "sport_1",
            matchDurationMinutes = 45,
            setDurationMinutes = 20,
        )
        eventDao.upsertEvent(cachedEvent)
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("user_1"))
        var capturedRequestBody = ""
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Patch, request.method)
            capturedRequestBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()
            respond(
                content = """
                    {
                      "id": "event_1",
                      "name": "Updated Event",
                      "hostId": "host_1",
                      "coordinates": [-80.0, 25.0],
                      "start": "2026-02-10T00:00:00Z",
                      "end": "2026-02-10T01:00:00Z"
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        repo.updateEvent(cachedEvent.copy(
            name = "Updated Event",
            address = null,
            minAge = null,
            maxAge = null,
            cancellationRefundHours = null,
            sportId = null,
            matchDurationMinutes = null,
            setDurationMinutes = null,
        )).getOrThrow()

        val eventPatch = jsonMVP.parseToJsonElement(capturedRequestBody)
            .jsonObject
            .getValue("event")
            .jsonObject
        assertEquals(JsonNull, eventPatch["address"])
        assertEquals(JsonNull, eventPatch["minAge"])
        assertEquals(JsonNull, eventPatch["maxAge"])
        assertEquals(JsonNull, eventPatch["cancellationRefundHours"])
        assertEquals(JsonNull, eventPatch["sportId"])
        assertEquals(JsonNull, eventPatch["matchDurationMinutes"])
        assertEquals(JsonNull, eventPatch["setDurationMinutes"])
    }

    @Test
    fun getEventsByIds_requests_batched_ids_query() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals("/api/events", request.url.encodedPath)
            assertEquals("e1,e2", request.url.parameters["ids"])
            assertEquals("2", request.url.parameters["limit"])
            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "e1",
                          "name": "Invite Event",
                          "hostId": "u1",
                          "start": "2026-03-01T10:00:00Z",
                          "end": "2026-03-01T12:00:00Z",
                          "location": "Gym",
                          "coordinates": [0, 0],
                          "priceCents": 0,
                          "imageId": "",
                          "maxParticipants": 0,
                          "teamSizeLimit": 2,
                          "teamSignup": false,
                          "singleDivision": true,
                          "waitListIds": [],
                          "freeAgentIds": [],
                          "userIds": [],
                          "teamIds": [],
                          "fieldIds": [],
                          "timeSlotIds": [],
                          "officialIds": [],
                          "assistantHostIds": [],
                          "cancellationRefundHours": 0,
                          "registrationCutoffHours": 0,
                          "seedColor": 0,
                          "state": "PUBLISHED",
                          "divisions": []
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }

        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val events = repo.getEventsByIds(listOf("e1", "e2")).getOrThrow()

        assertEquals(listOf("e1"), events.map { it.id })
        assertEquals("e1", eventDao.getEventById("e1")?.id)
    }

    @Test
    fun getEventsByIds_fetches_every_requested_id_in_safe_request_chunks() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val requestedIds = (1..201).map { index -> "event_$index" }
        val requestChunks = mutableListOf<List<String>>()

        val engine = MockEngine { request ->
            assertEquals("/api/events", request.url.encodedPath)
            val chunk = request.url.parameters["ids"].orEmpty().split(',')
            requestChunks += chunk
            assertEquals(chunk.size.toString(), request.url.parameters["limit"])
            respond(
                content = """{"events": []}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(
            HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
            "http://example.test",
            tokenStore,
        )
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        assertTrue(repo.getEventsByIds(requestedIds).getOrThrow().isEmpty())
        assertEquals(listOf(100, 100, 1), requestChunks.map(List<String>::size))
        assertEquals(requestedIds, requestChunks.flatten())
    }

    @Test
    fun field_and_time_slot_id_queries_fetch_every_requested_id_in_safe_request_chunks() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val fieldDao = EventRepositoryHttp_FakeFieldDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            EventRepositoryHttp_FakeEventDao(),
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
            getFieldDao = fieldDao,
        )
        val requestedIds = (1..201).map { index -> "item_$index" }
        val fieldChunks = mutableListOf<List<String>>()
        val slotChunks = mutableListOf<List<String>>()
        val fieldSlotChunks = mutableListOf<List<String>>()

        val engine = MockEngine { request ->
            when (request.url.encodedPath) {
                "/api/fields" -> {
                    fieldChunks += request.url.parameters["ids"].orEmpty().split(',')
                    respond(
                        content = """{"fields": []}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                "/api/time-slots" -> {
                    val ids = request.url.parameters["ids"]
                    if (ids != null) {
                        slotChunks += ids.split(',')
                    } else {
                        fieldSlotChunks += request.url.parameters["fieldIds"].orEmpty().split(',')
                        assertEquals("true", request.url.parameters["rentalOnly"])
                    }
                    respond(
                        content = """{"timeSlots": []}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                else -> error("Unexpected request: ${request.url}")
            }
        }
        val repo = FieldRepository(
            MvpApiClient(
                HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
                "http://example.test",
                tokenStore,
            ),
            db,
        )

        assertTrue(repo.getFields(requestedIds).getOrThrow().isEmpty())
        assertTrue(repo.getTimeSlots(requestedIds).getOrThrow().isEmpty())
        assertTrue(repo.getTimeSlotsForFields(requestedIds, rentalOnly = true).getOrThrow().isEmpty())
        listOf(fieldChunks, slotChunks, fieldSlotChunks).forEach { chunks ->
            assertEquals(listOf(100, 100, 1), chunks.map(List<String>::size))
            assertEquals(requestedIds, chunks.flatten())
        }
    }

    @Test
    fun timeSlotRead_returns_room_snapshot_when_refresh_is_offline() = runTest {
        var requestCount = 0
        val engine = MockEngine { request ->
            assertEquals("/api/time-slots", request.url.encodedPath)
            assertEquals("slot_1", request.url.parameters["ids"])
            requestCount += 1
            if (requestCount == 2) {
                respond(
                    content = "{}",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            } else if (requestCount > 2) {
                respond(
                    content = """{"error":"offline"}""",
                    status = HttpStatusCode.ServiceUnavailable,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            } else {
                respond(
                    content = """
                        {
                          "timeSlots": [{
                            "id": "slot_1",
                            "dayOfWeek": 2,
                            "daysOfWeek": [2],
                            "divisions": ["open"],
                            "startTimeMinutes": 600,
                            "endTimeMinutes": 660,
                            "startDate": "2026-07-14T17:00:00Z",
                            "timeZone": "UTC",
                            "repeating": false,
                            "endDate": null,
                            "scheduledFieldId": "field_1",
                            "scheduledFieldIds": ["field_1"],
                            "price": 2500
                          }]
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            }
        }
        val database = EventRepositoryHttp_FakeDatabaseService(
            EventRepositoryHttp_FakeEventDao(),
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val repository = FieldRepository(
            MvpApiClient(
                HttpClient(engine) { configureMvpHttpClient() },
                "http://example.test",
                EventRepositoryHttp_InMemoryAuthTokenStore("token"),
            ),
            database,
        )

        val onlineSlot = repository.getTimeSlots(listOf("slot_1")).getOrThrow().single()
        assertEquals("slot_1", onlineSlot.id)
        assertEquals(listOf("field_1"), onlineSlot.scheduledFieldIds)
        assertEquals(2500, onlineSlot.price)

        assertTrue(repository.getTimeSlots(listOf("slot_1")).isFailure)

        val offlineSlot = repository.getTimeSlots(listOf("slot_1")).getOrThrow().single()
        assertEquals(onlineSlot, offlineSlot)
    }

    @Test
    fun timeSlotFieldRead_fetchesEveryPage_and_preservesAll201RowsInServerOrder() = runTest {
        val requestedOffsets = mutableListOf<Int>()
        val engine = MockEngine { request ->
            val offset = request.url.parameters["offset"]?.toIntOrNull() ?: 0
            requestedOffsets += offset
            val range = if (offset == 0) 0 until 200 else 200 until 201
            val rows = range.joinToString(",") { index ->
                """{"id":"slot_${index.toString().padStart(3, '0')}","dayOfWeek":2,"daysOfWeek":[2],"startTimeMinutes":600,"endTimeMinutes":660,"startDate":"2026-07-14T17:00:00Z","timeZone":"UTC","repeating":false,"endDate":null,"scheduledFieldId":"field_1","scheduledFieldIds":["field_1"],"price":2500}"""
            }
            val hasMore = offset == 0
            val nextOffset = if (hasMore) 200 else 201
            respond(
                content = """{"timeSlots":[$rows],"pagination":{"limit":200,"offset":$offset,"nextOffset":$nextOffset,"hasMore":$hasMore}}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val repository = FieldRepository(
            MvpApiClient(
                HttpClient(engine) { configureMvpHttpClient() },
                "http://example.test",
                EventRepositoryHttp_InMemoryAuthTokenStore("token"),
            ),
            EventRepositoryHttp_FakeDatabaseService(
                EventRepositoryHttp_FakeEventDao(),
                EventRepositoryHttp_FakeUserDataDao(),
                EventRepositoryHttp_FakeTeamDao(),
            ),
        )

        val slots = repository.getTimeSlotsForField("field_1").getOrThrow()

        assertEquals(listOf(0, 200), requestedOffsets)
        assertEquals(201, slots.size)
        assertEquals("slot_000", slots.first().id)
        assertEquals("slot_200", slots.last().id)
    }

    @Test
    fun publicRentalFieldRead_keepsExactRequestAssociation_whenPayloadOmitsFieldIds() = runTest {
        var offline = false
        val engine = MockEngine {
            if (offline) {
                return@MockEngine respond(
                    content = """{"error":"offline"}""",
                    status = HttpStatusCode.ServiceUnavailable,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            }
            respond(
                content = """{"timeSlots":[{"id":"public_slot","dayOfWeek":2,"daysOfWeek":[2],"startTimeMinutes":600,"endTimeMinutes":660,"startDate":"2026-07-14T17:00:00Z","timeZone":"UTC","repeating":false,"endDate":null,"price":2500}],"pagination":{"limit":200,"offset":0,"nextOffset":1,"hasMore":false}}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val repository = FieldRepository(
            MvpApiClient(
                HttpClient(engine) { configureMvpHttpClient() },
                "http://example.test",
                EventRepositoryHttp_InMemoryAuthTokenStore(),
            ),
            EventRepositoryHttp_FakeDatabaseService(
                EventRepositoryHttp_FakeEventDao(),
                EventRepositoryHttp_FakeUserDataDao(),
                EventRepositoryHttp_FakeTeamDao(),
            ),
        )

        val onlineSlots = repository.getTimeSlotsForFields(
            listOf("field_1", "field_2"),
            rentalOnly = true,
        ).getOrThrow()
        assertEquals(listOf("public_slot"), onlineSlots.map { slot -> slot.id })
        assertEquals(listOf("field_1", "field_2"), onlineSlots.single().scheduledFieldIds)
        offline = true
        val offlineSlots = repository.getTimeSlotsForFields(
            listOf("field_1", "field_2"),
            rentalOnly = true,
        ).getOrThrow()
        assertEquals(listOf("public_slot"), offlineSlots.map { slot -> slot.id })
        assertEquals(listOf("field_1", "field_2"), offlineSlots.single().scheduledFieldIds)
        assertTrue(
            repository.getTimeSlotsForFields(listOf("field_3"), rentalOnly = true).isFailure,
        )
    }

    @Test
    fun successfulEmptyTimeSlotRefresh_replacesStaleSnapshot_authoritatively() = runTest {
        var requestCount = 0
        val engine = MockEngine {
            requestCount += 1
            when (requestCount) {
                1 -> respond(
                    content = """{"timeSlots":[{"id":"stale_slot","dayOfWeek":2,"daysOfWeek":[2],"startTimeMinutes":600,"endTimeMinutes":660,"startDate":"2026-07-14T17:00:00Z","timeZone":"UTC","repeating":false,"endDate":null,"scheduledFieldId":"field_1","scheduledFieldIds":["field_1"],"price":2500}],"pagination":{"limit":200,"offset":0,"nextOffset":1,"hasMore":false}}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
                2 -> respond(
                    content = """{"timeSlots":[],"pagination":{"limit":200,"offset":0,"nextOffset":0,"hasMore":false}}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
                else -> respond(
                    content = """{"error":"offline"}""",
                    status = HttpStatusCode.ServiceUnavailable,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            }
        }
        val repository = FieldRepository(
            MvpApiClient(
                HttpClient(engine) { configureMvpHttpClient() },
                "http://example.test",
                EventRepositoryHttp_InMemoryAuthTokenStore("token"),
            ),
            EventRepositoryHttp_FakeDatabaseService(
                EventRepositoryHttp_FakeEventDao(),
                EventRepositoryHttp_FakeUserDataDao(),
                EventRepositoryHttp_FakeTeamDao(),
            ),
        )

        assertEquals(listOf("stale_slot"), repository.getTimeSlotsForField("field_1").getOrThrow().map { it.id })
        assertTrue(repository.getTimeSlotsForField("field_1").getOrThrow().isEmpty())
        assertTrue(repository.getTimeSlotsForField("field_1").getOrThrow().isEmpty())
    }

    @Test
    fun timeSlotCrud_persistsRoomBeforeReturning_and_deleteRemovesTheScopedRecord() = runTest {
        val engine = MockEngine { request ->
            val price = if (request.method == HttpMethod.Patch) 3500 else 2500
            when (request.method) {
                HttpMethod.Post, HttpMethod.Patch -> respond(
                    // Mutation responses are allowed to omit the association; the request owns it.
                    content = """{"id":"slot_crud","dayOfWeek":2,"daysOfWeek":[2],"startTimeMinutes":600,"endTimeMinutes":660,"startDate":"2026-07-14T17:00:00Z","timeZone":"UTC","repeating":false,"endDate":null,"price":$price}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
                HttpMethod.Delete -> respond(
                    content = "",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Text.Plain.toString()),
                )
                HttpMethod.Get -> respond(
                    content = """{"error":"offline"}""",
                    status = HttpStatusCode.ServiceUnavailable,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
                else -> error("Unexpected request: ${request.method} ${request.url}")
            }
        }
        val database = EventRepositoryHttp_FakeDatabaseService(
            EventRepositoryHttp_FakeEventDao(),
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val repository = FieldRepository(
            MvpApiClient(
                HttpClient(engine) { configureMvpHttpClient() },
                "http://example.test",
                EventRepositoryHttp_InMemoryAuthTokenStore("token"),
            ),
            database,
        )
        val request = TimeSlot(
            id = "slot_crud",
            dayOfWeek = 2,
            daysOfWeek = listOf(2),
            startTimeMinutes = 600,
            endTimeMinutes = 660,
            startDate = Instant.parse("2026-07-14T17:00:00Z"),
            repeating = false,
            endDate = null,
            scheduledFieldId = "field_1",
            scheduledFieldIds = listOf("field_1"),
            price = 2500,
        )

        val created = repository.createTimeSlot(request).getOrThrow()
        assertEquals(listOf("field_1"), created.scheduledFieldIds)
        val updated = repository.updateTimeSlot(request.copy(price = 3500)).getOrThrow()
        assertEquals(3500, updated.price)
        assertEquals(listOf("field_1"), updated.scheduledFieldIds)
        assertEquals(
            3500,
            repository.getTimeSlots(listOf("slot_crud")).getOrThrow().single().price,
        )

        repository.deleteTimeSlot("slot_crud").getOrThrow()
        val viewer = database.getCatalogCacheDao.getActiveViewer()?.viewerKey ?: error("Missing cache viewer")
        assertTrue(
            database.getCatalogCacheDao
                .getTimeSlots(listOf("slot_crud"), viewer, "authenticated")
                .isEmpty(),
        )
    }

    @Test
    fun listFields_returns_an_authoritative_empty_response_instead_of_cached_fields() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val fieldDao = EventRepositoryHttp_FakeFieldDao()
        val staleCachedField = Field(
            id = "field_stale",
            fieldNumber = 1,
            name = "Removed facility field",
            organizationId = "organization_1",
        )
        fieldDao.upsertField(staleCachedField)
        assertEquals(listOf(staleCachedField), fieldDao.getAllFields())
        val database = EventRepositoryHttp_FakeDatabaseService(
            EventRepositoryHttp_FakeEventDao(),
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
            getFieldDao = fieldDao,
        )
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/fields", request.url.encodedPath)
            respond(
                content = """{"fields": []}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val repository = FieldRepository(
            MvpApiClient(
                HttpClient(engine) { configureMvpHttpClient() },
                "http://example.test",
                tokenStore,
            ),
            database,
        )

        val fields = repository.listFields().getOrThrow()

        assertTrue(fields.isEmpty())
    }

    @Test
    fun getEventsByIds_removes_stale_cached_events_missing_from_server() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        eventDao.upsertEvents(
            listOf(
                makeEvent(id = "e1", hostId = "h1"),
                makeEvent(id = "e2", hostId = "h2"),
            )
        )
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events", request.url.encodedPath)
            assertEquals("ids=e1,e2&limit=2", request.url.encodedQuery)
            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "e1",
                          "name": "Event One",
                          "hostId": "h1",
                          "coordinates": [-80.0, 25.0],
                          "start": "2026-02-10T00:00:00Z",
                          "end": "2026-02-10T01:00:00Z"
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val events = repo.getEventsByIds(listOf("e1", "e2")).getOrThrow()

        assertEquals(listOf("e1"), events.map { it.id })
        assertEquals(listOf(listOf("e2")), eventDao.deleteEventsWithCrossRefsCalls)
        assertEquals(null, eventDao.getEventById("e2"))
    }

    @Test
    fun getEventTags_fetches_database_backed_tag_options() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/event-tags", request.url.encodedPath)
            assertEquals("query=try", request.url.encodedQuery)
            respond(
                content = """
                    {
                      "tags": [
                        { "id": "tag_tryouts", "name": "Tryouts", "slug": "tryouts", "eventCount": 12 },
                        { "id": "tag_duplicate", "name": "Tryouts Duplicate", "slug": "tryouts", "eventCount": 3 },
                        { "id": "tag_clinic", "name": "Clinic", "slug": "clinic", "eventCount": 4 }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val tags = repo.getEventTags("try").getOrThrow()

        assertEquals(listOf("Tryouts", "Clinic"), tags.map { it.name })
        assertEquals(listOf("tryouts", "clinic"), tags.map { it.slug })
        assertEquals(listOf(12, 4), tags.map { it.eventCount })
    }

    @Test
    fun getEventTags_can_request_filter_only_tag_options() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/event-tags", request.url.encodedPath)
            assertEquals("query=try&filterOnly=true", request.url.encodedQuery)
            respond(
                content = """
                    {
                      "tags": [
                        { "id": "tag_tryouts", "name": "Tryouts", "slug": "tryouts", "eventCount": 12 }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val tags = repo.getEventTags(query = "try", filterOnly = true).getOrThrow()

        assertEquals(listOf("Tryouts"), tags.map { it.name })
    }

    @Test
    fun getEvent_removes_cached_event_when_server_returns_forbidden() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        eventDao.upsertEvent(makeEvent(id = "e1", hostId = "h1"))
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events/e1", request.url.encodedPath)
            respond(
                content = """{"error":"Forbidden"}""",
                status = HttpStatusCode.Forbidden,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val result = repo.getEvent("e1")

        assertTrue(result.isFailure)
        assertEquals(listOf("e1"), eventDao.deleteEventWithCrossRefsCalls)
        assertEquals(null, eventDao.getEventById("e1"))
    }

    @Test
    fun getEvent_replaces_cached_divisions_and_participant_roster_with_authoritative_response() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val removedDivisionId = "e1__division__removed"
        val currentDivisionId = "e1__division__current"
        val cachedEvent = makeEvent(id = "e1", hostId = "h1").copy(
            teamSignup = true,
            singleDivision = false,
            divisions = listOf(removedDivisionId, currentDivisionId),
            divisionDetails = listOf(
                DivisionDetail(id = removedDivisionId, key = "removed", name = "Removed Division"),
                DivisionDetail(id = currentDivisionId, key = "current", name = "Current Division"),
            ),
            teamIds = (1..9).map { index -> "team_$index" },
            userIds = listOf("user_cached"),
            waitListIds = listOf("wait_cached"),
            freeAgentIds = listOf("free_cached"),
        )
        eventDao.upsertEvent(cachedEvent)
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events/e1", request.url.encodedPath)
            respond(
                content = """
                    {
                      "id": "e1",
                      "name": "Event One Updated",
                      "hostId": "h1",
                      "coordinates": [-80.0, 25.0],
                      "start": "2026-02-10T00:00:00Z",
                      "end": "2026-02-10T01:00:00Z",
                      "teamSignup": true,
                      "singleDivision": false,
                      "divisions": ["$currentDivisionId"],
                      "divisionDetails": [
                        {
                          "id": "$currentDivisionId",
                          "key": "current",
                          "name": "Current Division"
                        }
                      ],
                      "teamIds": ["team_1", "team_2", "team_3", "team_4", "team_5", "team_6"],
                      "userIds": [],
                      "waitListIds": [],
                      "freeAgentIds": []
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val refreshed = repo.getEvent("e1").getOrThrow()
        val cachedAfterRefresh = eventDao.getEventById("e1")

        assertEquals("Event One Updated", refreshed.name)
        assertEquals(listOf(currentDivisionId), refreshed.divisions)
        assertEquals(listOf(currentDivisionId), cachedAfterRefresh?.divisions)
        assertEquals(listOf("team_1", "team_2", "team_3", "team_4", "team_5", "team_6"), cachedAfterRefresh?.teamIds)
        assertEquals(emptyList(), cachedAfterRefresh?.userIds)
        assertEquals(emptyList(), cachedAfterRefresh?.waitListIds)
        assertEquals(emptyList(), cachedAfterRefresh?.freeAgentIds)
        assertEquals(emptyList(), eventDao.deleteEventCrossRefsCalls)
    }

    @Test
    fun getEventDetailBootstrap_persists_detail_payload_and_management_cache() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val cachedEvent = makeEvent(id = "e1", hostId = "h1").copy(
            teamSignup = true,
            teamIds = listOf("cached_team"),
        )
        eventDao.upsertEvent(cachedEvent)
        val matchDao = EventRepositoryHttp_FakeMatchDao()
        matchDao.upsertMatch(MatchMVP(matchId = 99, eventId = "e1", id = "stale_match"))
        val fieldDao = EventRepositoryHttp_FakeFieldDao()
        val managementDao = EventRepositoryHttp_FakeParticipantManagementDao()
        val complianceDao = EventRepositoryHttp_FakeComplianceDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
            getMatchDao = matchDao,
            getFieldDao = fieldDao,
            getEventParticipantManagementDao = managementDao,
            getEventComplianceDao = complianceDao,
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events/e1/detail", request.url.encodedPath)
            assertEquals("true", request.url.parameters["manage"])
            respond(
                content = """
                    {
                      "event": {
                        "id": "e1",
                        "name": "Event One",
                        "hostId": "h1",
                        "coordinates": [-80.0, 25.0],
                        "start": "2026-02-10T00:00:00Z",
                        "end": "2026-02-10T01:00:00Z",
                        "teamSignup": true,
                        "teamIds": ["partial_team"],
                        "fieldIds": ["field_1"],
                        "timeSlotIds": ["slot_1"],
                        "leagueScoringConfigId": "config_1"
                      },
                      "participantSnapshot": {
                        "participants": {
                          "teamIds": ["team_1", "team_2"],
                          "userIds": [],
                          "waitListIds": [],
                          "freeAgentIds": [],
                          "divisions": []
                        },
                        "registrations": {
                          "teams": [
                            {
                              "registrationId": "reg_team_1",
                              "registrantId": "team_1",
                              "registrantType": "TEAM",
                              "rosterRole": "PARTICIPANT",
                              "status": "ACTIVE"
                            }
                          ],
                          "users": [],
                          "children": [],
                          "waitlist": [],
                          "freeAgents": []
                        },
                        "teams": [
                          {
                            "id": "team_1",
                            "name": "Team One",
                            "captainId": "captain_1",
                            "playerIds": []
                          },
                          {
                            "id": "team_2",
                            "name": "Team Two",
                            "captainId": "captain_2",
                            "playerIds": []
                          }
                        ],
                        "users": [],
                        "participantCount": 2,
                        "participantCapacity": 8,
                        "divisionWarnings": [],
                        "weeklySelectionRequired": false
                      },
                      "matches": [
                        {
                          "id": "match_1",
                          "matchId": 1,
                          "eventId": "e1",
                          "team1Id": "team_1",
                          "team2Id": "team_2",
                          "start": "2026-02-10T00:00:00Z",
                          "end": "2026-02-10T01:00:00Z"
                        }
                      ],
                      "fields": [
                        {
                          "id": "field_1",
                          "fieldNumber": 1,
                          "divisions": []
                        }
                      ],
                      "timeSlots": [
                        {
                          "id": "slot_1",
                          "dayOfWeek": 2,
                          "daysOfWeek": [2],
                          "divisions": [],
                          "startTimeMinutes": 600,
                          "endTimeMinutes": 660,
                          "startDate": "2026-02-10T00:00:00Z",
                          "timeZone": "UTC",
                          "repeating": false,
                          "endDate": null,
                          "scheduledFieldId": "field_1",
                          "scheduledFieldIds": ["field_1"],
                          "price": null
                        }
                      ],
                      "leagueScoringConfig": {
                        "pointsForWin": 3,
                        "pointsForDraw": 1,
                        "pointsForLoss": 0
                      },
                      "staffInvites": [
                        {
                          "id": "invite_1",
                          "type": "STAFF",
                          "email": "official@example.test",
                          "eventId": "e1"
                        }
                      ],
                      "staffRevision": "staff_revision_1",
                      "teamCompliance": {
                        "teams": [
                          {
                            "teamId": "team_1",
                            "teamName": "Team One",
                            "payment": { "hasBill": false },
                            "documents": { "signedCount": 0, "requiredCount": 0 },
                            "users": []
                          }
                        ]
                      },
                      "userCompliance": null
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val teamRepository = object : ITeamRepository by EventRepositoryHttp_UnusedTeamRepository {
            override suspend fun getTeams(ids: List<String>): Result<List<Team>> =
                Result.success(
                    ids.map { teamId ->
                        Team(
                            division = "Open",
                            name = teamId,
                            captainId = "",
                            playerIds = emptyList(),
                            teamSize = 2,
                            id = teamId,
                        )
                    },
                )
        }
        val repo = EventRepository(db, api, teamRepository, userRepo)

        val detail = repo.syncEventDetail(cachedEvent, manage = true).getOrThrow()
        val cachedAfterRefresh = eventDao.getEventById("e1")

        assertEquals(listOf("team_1", "team_2"), detail.event.teamIds)
        assertEquals(2, detail.participants.participantCount)
        assertEquals(listOf("team_1", "team_2"), cachedAfterRefresh?.teamIds)
        assertEquals(listOf("match_1"), matchDao.matches.keys.toList())
        assertEquals(listOf(listOf("stale_match")), matchDao.deletedMatchIds)
        assertEquals(listOf("field_1"), fieldDao.fields.keys.toList())
        assertEquals(listOf("slot_1"), detail.timeSlots.map { slot -> slot.id })
        assertEquals("config_1", detail.leagueScoringConfig?.id)
        assertEquals(3, detail.leagueScoringConfig?.pointsForWin)
        assertEquals(listOf("invite_1"), detail.staffInvites.map(Invite::id))
        assertEquals("staff_revision_1", detail.staffRevision)
        assertEquals(1, managementDao.entries.size)
        assertEquals(1, complianceDao.teamSummaries.size)
    }

    @Test
    fun syncEventParticipants_preserves_cached_divisions_when_snapshot_event_is_partial() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val leagueADivisionId = "e1__division__m_skill_open_age_18plus"
        val leagueBDivisionId = "e1_2__division__m_skill_open_age_18plus"
        val cachedEvent = makeEvent(id = "e1", hostId = "h1").copy(
            eventType = EventType.LEAGUE,
            teamSignup = true,
            singleDivision = false,
            divisions = listOf(leagueADivisionId, leagueBDivisionId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = leagueADivisionId,
                    key = "m_skill_open_age_18plus",
                    name = "Mens Open 18+ - A",
                    maxParticipants = 8,
                ),
                DivisionDetail(
                    id = leagueBDivisionId,
                    key = "m_skill_open_age_18plus",
                    name = "Mens Open 18+ - B",
                    maxParticipants = 8,
                ),
            ),
        )
        eventDao.upsertEvent(cachedEvent)
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("/api/events/e1/participants", request.url.encodedPath)
            respond(
                content = """
                    {
                      "event": {
                        "id": "e1",
                        "name": "Example League",
                        "hostId": "h1",
                        "start": "2026-02-10T00:00:00Z",
                        "end": "2026-02-10T01:00:00Z",
                        "coordinates": [0, 0],
                        "eventType": "LEAGUE",
                        "teamSignup": true,
                        "singleDivision": false,
                        "divisions": ["$leagueADivisionId"],
                        "divisionDetails": [
                          {
                            "id": "$leagueADivisionId",
                            "key": "m_skill_open_age_18plus",
                            "name": "Mens Open 18+ - A",
                            "maxParticipants": 8
                          }
                        ]
                      },
                      "participants": {
                        "teamIds": [],
                        "userIds": [],
                        "waitListIds": [],
                        "freeAgentIds": []
                      },
                      "participantCount": 0,
                      "participantCapacity": 16
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { configureMvpHttpClient() }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        repo.syncEventParticipants(cachedEvent, occurrence = null).getOrThrow()

        val storedEvent = eventDao.getEventById("e1")
        assertEquals(listOf(leagueADivisionId, leagueBDivisionId), storedEvent?.divisions)
        assertEquals(
            listOf(8, 8),
            storedEvent?.divisionDetails?.map { detail -> detail.maxParticipants },
        )
    }

    @Test
    fun getLeagueScoringConfig_fetches_embedded_config_for_event() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        eventDao.upsertEvent(
            makeEvent(id = "e1", hostId = "u1").copy(
                leagueScoringConfigId = "cfg_win4",
            )
        )

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            respond(
                content = """
                    {
                      "id": "e1",
                      "name": "League Event",
                      "hostId": "u1",
                      "start": "2026-03-01T10:00:00Z",
                      "end": "2026-03-01T12:00:00Z",
                      "coordinates": [0, 0],
                      "leagueScoringConfigId": "cfg_win4",
                      "leagueScoringConfig": {
                        "pointsForWin": 4,
                        "pointsForLoss": 1,
                        "pointsPerSetWin": 0.5
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val config = repo.getLeagueScoringConfig("e1").getOrThrow()

        assertEquals("cfg_win4", config?.id)
        assertEquals(4, config?.pointsForWin)
        assertEquals(1, config?.pointsForLoss)
        assertEquals(0.5, config?.pointsPerSetWin)
    }

    @Test
    fun getLeagueScoringConfig_fetches_by_id_when_event_embed_missing() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        eventDao.upsertEvent(
            makeEvent(id = "e1", hostId = "u1").copy(
                leagueScoringConfigId = "cfg_win4",
            )
        )

        val requestedPaths = mutableListOf<String>()
        val engine = MockEngine { request ->
            requestedPaths += request.url.encodedPath
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            when (request.url.encodedPath) {
                "/api/events/e1" -> respond(
                    content = """
                        {
                          "id": "e1",
                          "name": "League Event",
                          "hostId": "u1",
                          "start": "2026-03-01T10:00:00Z",
                          "end": "2026-03-01T12:00:00Z",
                          "coordinates": [0, 0],
                          "leagueScoringConfigId": "cfg_win4"
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                "/api/league-scoring-configs/cfg_win4" -> respond(
                    content = """
                        {
                          "id": "cfg_win4",
                          "pointsForWin": 4,
                          "pointsForLoss": 1,
                          "pointsPerSetWin": 0.5
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("Unexpected path ${request.url.encodedPath}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val config = repo.getLeagueScoringConfig("e1").getOrThrow()

        assertEquals(
            listOf("/api/events/e1", "/api/league-scoring-configs/cfg_win4"),
            requestedPaths,
        )
        assertEquals("cfg_win4", config?.id)
        assertEquals(4, config?.pointsForWin)
        assertEquals(1, config?.pointsForLoss)
        assertEquals(0.5, config?.pointsPerSetWin)
    }

    @Test
    fun getEventTemplatesByHostFlow_requests_event_templates_endpoint_and_returns_templates() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals("/api/event-templates", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("h1", request.url.parameters["hostId"])
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "templates": [
                        {
                          "id": "tmpl_1",
                          "name": "Template One",
                          "ownerUserId": "h1",
                          "sourceEventId": "event_1",
                          "updatedAt": "2026-02-10T00:00:00Z",
                          "eventType": "EVENT",
                          "organizationId": null
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val templates = repo.getEventTemplatesByHostFlow("h1")
            .first { flowResult ->
                flowResult.getOrNull()?.any { event -> event.id == "tmpl_1" } == true
            }
            .getOrThrow()

        assertEquals(1, templates.size)
        assertEquals("tmpl_1", templates.first().id)
        assertEquals("Template One", templates.first().name)
        assertEquals("event_1", templates.first().sourceEventId)
        assertEquals(Instant.parse("2026-02-10T00:00:00Z"), templates.first().updatedAt)
    }

    @Test
    fun createEventTemplateFromEvent_posts_source_event_id_and_returns_template() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/event-templates", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "template": {
                        "id": "tmpl_2",
                        "name": "Template Two",
                        "ownerUserId": "u1",
                        "sourceEventId": "event_2",
                        "createdAt": "2026-02-11T00:00:00Z",
                        "updatedAt": "2026-02-11T00:05:00Z",
                        "eventType": "LEAGUE"
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val template = repo.createEventTemplateFromEvent(" event_2 ").getOrThrow()

        assertTrue(capturedBody.contains("\"sourceEventId\":\"event_2\""))
        assertFalse(capturedBody.contains("\"event\""))
        assertFalse(capturedBody.contains("\"id\""))
        assertEquals("tmpl_2", template.id)
        assertEquals("Template Two", template.name)
        assertEquals("event_2", template.sourceEventId)
        assertEquals(Instant.parse("2026-02-11T00:05:00Z"), template.updatedAt)
    }

    @Test
    fun seedEventTemplate_posts_start_date_and_returns_seeded_draft_bundle() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/event-templates/tmpl%202/seed", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "event": {
                        "id": "event_seeded",
                        "name": "Seeded Template Event",
                        "hostId": "u1",
                        "start": "2026-07-01T00:00:00",
                        "end": "2026-07-01T02:00:00",
                        "timeZone": "UTC",
                        "eventType": "LEAGUE",
                        "divisions": ["open"],
                        "fieldIds": ["field_1"],
                        "timeSlotIds": ["slot_1"],
                        "fields": [
                          {
                            "id": "field_1",
                            "name": "Template Court",
                            "divisions": ["open"]
                          }
                        ],
                        "timeSlots": [
	                          {
	                            "id": "slot_1",
	                            "dayOfWeek": 3,
	                            "startTimeMinutes": 540,
	                            "endTimeMinutes": 660,
	                            "startDate": "2026-07-01T00:00:00",
	                            "endDate": "2026-07-01T02:00:00",
	                            "repeating": false,
	                            "scheduledFieldId": "field_1",
	                            "scheduledFieldIds": ["field_1"],
	                            "price": 0,
	                            "divisions": ["open"]
	                          }
                        ],
                        "leagueScoringConfig": {
                          "id": "cfg_1",
                          "pointsForWin": 3
                        }
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val seed = repo.seedEventTemplate(
            templateId = " tmpl 2 ",
            newEventId = " event_seeded ",
            newStartDate = Instant.parse("2026-07-01T00:00:00Z"),
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"newEventId\":\"event_seeded\""))
        assertTrue(capturedBody.contains("\"newStartDate\":\"2026-07-01T00:00:00Z\""))
        assertEquals("event_seeded", seed.event.id)
        assertEquals("Seeded Template Event", seed.event.name)
        assertEquals(listOf("field_1"), seed.fields.map(Field::id))
        assertEquals(listOf("slot_1"), seed.timeSlots.map { slot -> slot.id })
        assertEquals(3, seed.leagueScoringConfig?.pointsForWin)
    }

    @Test
    fun getEventsInBounds_posts_search_and_persists_to_cache() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(eventDao, EventRepositoryHttp_FakeUserDataDao(), EventRepositoryHttp_FakeTeamDao())
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals("/api/events/search", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "e1",
                          "name": "Event One",
                          "hostId": "h1",
                          "start": "2026-02-10T00:00:00Z",
                          "end": "2026-02-10T01:00:00Z",
                          "coordinates": [-80.0, 25.0],
                          "location": "Miami",
                          "eventType": "EVENT",
                          "userIds": [],
                          "teamIds": []
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val bounds = Bounds(
            north = 0.0,
            east = 0.0,
            south = 0.0,
            west = 0.0,
            center = LatLng(25.0, -80.0),
            radiusMiles = 100.0,
        )

        val result = repo.getEventsInBounds(bounds).getOrThrow()
        assertEquals(1, result.first.size)
        assertFalse(result.second)
        assertEquals("e1", eventDao.getEventById("e1")?.id)
    }

    @Test
    fun getEventsInBounds_posts_search_with_date_filters_when_provided() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/search", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """{ "events": [] }""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val bounds = Bounds(
            north = 0.0,
            east = 0.0,
            south = 0.0,
            west = 0.0,
            center = LatLng(25.0, -80.0),
            radiusMiles = 100.0,
        )
        val from = Instant.parse("2025-02-01T00:00:00Z")
        val to = Instant.parse("2025-02-28T23:59:59Z")

        repo.getEventsInBounds(bounds = bounds, dateFrom = from, dateTo = to).getOrThrow()

        assertTrue(capturedBody.contains("\"dateFrom\":\"2025-02-01T00:00:00Z\""))
        assertTrue(capturedBody.contains("\"dateTo\":\"2025-02-28T23:59:59Z\""))
    }

    @Test
    fun getEventsInBounds_uses_limit_offset_and_reports_hasMore_from_page_size() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val capturedBodies = mutableListOf<String>()

        val engine = MockEngine { request ->
            assertEquals("/api/events/search", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            val body = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()
            capturedBodies += body

            val responseJson = when {
                body.contains("\"offset\":0") -> {
                    """
                        {
                          "events": [
                            {
                              "id": "e1",
                              "name": "Event One",
                              "hostId": "h1",
                              "start": "2026-02-10T00:00:00Z",
                              "end": "2026-02-10T01:00:00Z",
                              "coordinates": [-80.0, 25.0],
                              "eventType": "EVENT",
                              "userIds": [],
                              "teamIds": []
                            },
                            {
                              "id": "e2",
                              "name": "Event Two",
                              "hostId": "h1",
                              "start": "2026-02-11T00:00:00Z",
                              "end": "2026-02-11T01:00:00Z",
                              "coordinates": [-80.0, 25.0],
                              "eventType": "EVENT",
                              "userIds": [],
                              "teamIds": []
                            }
                          ]
                        }
                    """.trimIndent()
                }

                body.contains("\"offset\":2") -> {
                    """
                        {
                          "events": [
                            {
                              "id": "e3",
                              "name": "Event Three",
                              "hostId": "h1",
                              "start": "2026-02-12T00:00:00Z",
                              "end": "2026-02-12T01:00:00Z",
                              "coordinates": [-80.0, 25.0],
                              "eventType": "EVENT",
                              "userIds": [],
                              "teamIds": []
                            }
                          ]
                        }
                    """.trimIndent()
                }

                else -> """{ "events": [] }"""
            }

            respond(
                content = responseJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)
        val bounds = Bounds(
            north = 0.0,
            east = 0.0,
            south = 0.0,
            west = 0.0,
            center = LatLng(25.0, -80.0),
            radiusMiles = 100.0,
        )

        val firstPage = repo.getEventsInBounds(
            bounds = bounds,
            limit = 2,
            offset = 0,
            includeDistanceFilter = false,
        ).getOrThrow()
        val secondPage = repo.getEventsInBounds(
            bounds = bounds,
            limit = 2,
            offset = 2,
            includeDistanceFilter = false,
        ).getOrThrow()

        assertEquals(2, firstPage.first.size)
        assertTrue(firstPage.second)
        assertEquals(1, secondPage.first.size)
        assertFalse(secondPage.second)
        assertTrue(capturedBodies.first().contains("\"limit\":2"))
        assertTrue(capturedBodies.first().contains("\"offset\":0"))
        assertFalse(capturedBodies.first().contains("\"maxDistance\""))
        assertFalse(capturedBodies.first().contains("\"userLocation\""))
        assertTrue(capturedBodies.last().contains("\"offset\":2"))
    }

    @Test
    fun getEventsInBounds_converts_mile_radius_to_search_api_kilometers() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/search", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """{ "events": [] }""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        repo.getEventsInBounds(
            bounds = Bounds(
                north = 0.0,
                east = 0.0,
                south = 0.0,
                west = 0.0,
                center = LatLng(45.5, -122.6),
                radiusMiles = 50.0,
            ),
            limit = 10,
            offset = 0,
            includeDistanceFilter = true,
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"maxDistance\":80.467"))
        assertTrue(capturedBody.contains("\"userLocation\":{\"lat\":45.5,\"long\":-122.6}"))
    }

    @Test
    fun getEventsInBounds_posts_sport_filters_to_search_api() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/search", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """{ "events": [] }""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        repo.getEventsInBounds(
            bounds = Bounds(
                north = 0.0,
                east = 0.0,
                south = 0.0,
                west = 0.0,
                center = LatLng(45.5, -122.6),
                radiusMiles = 50.0,
            ),
            sports = listOf("Volleyball", "  Soccer  ", ""),
            tags = listOf("tryouts", "  league  ", ""),
            limit = 10,
            offset = 0,
            includeDistanceFilter = false,
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"sports\":[\"Volleyball\",\"Soccer\"]"))
        assertTrue(capturedBody.contains("\"tags\":[\"tryouts\",\"league\"]"))
    }

    @Test
    fun searchEvents_posts_query_with_small_suggestion_limit() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/search", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "events": [
                        {
                          "id": "event_1",
                          "name": "Test League",
                          "hostId": "host_1",
                          "start": "2026-02-10T00:00:00Z",
                          "end": "2026-02-10T01:00:00Z",
                          "coordinates": [-80.0, 25.0],
                          "eventType": "LEAGUE",
                          "userIds": [],
                          "teamIds": []
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val (events, hasMore) = repo.searchEvents("test league", LatLng(25.0, -80.0)).getOrThrow()

        assertTrue(capturedBody.contains("\"query\":\"test league\""))
        assertTrue(capturedBody.contains("\"limit\":8"))
        assertEquals(1, events.size)
        assertFalse(hasMore)
    }

    @Test
    fun participants_add_and_remove_use_endpoint_and_update_cache() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(eventDao, EventRepositoryHttp_FakeUserDataDao(), EventRepositoryHttp_FakeTeamDao())
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var participantIds = emptyList<String>()

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/participants", request.url.encodedPath)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            val json = when (request.method) {
                HttpMethod.Post -> """
                    {
                      "event": {
                        "id": "e1",
                        "name": "Event One",
                        "hostId": "h1",
                        "start": "2026-02-10T00:00:00Z",
                        "end": "2026-02-10T01:00:00Z",
                        "coordinates": [-80.0, 25.0],
                        "userIds": ["u1"],
                        "teamIds": []
                      }
                    }
                """.trimIndent().also {
                    participantIds = listOf("u1")
                }
                HttpMethod.Delete -> """
                    {
                      "event": {
                        "id": "e1",
                        "name": "Event One",
                        "hostId": "h1",
                        "start": "2026-02-10T00:00:00Z",
                        "end": "2026-02-10T01:00:00Z",
                        "coordinates": [-80.0, 25.0],
                        "userIds": [],
                        "teamIds": []
                      }
                    }
                """.trimIndent().also {
                    participantIds = emptyList()
                }
                HttpMethod.Get -> """
                    {
                      "event": {
                        "id": "e1",
                        "name": "Event One",
                        "hostId": "h1",
                        "start": "2026-02-10T00:00:00Z",
                        "end": "2026-02-10T01:00:00Z",
                        "coordinates": [-80.0, 25.0],
                        "userIds": ${if (participantIds.isEmpty()) "[]" else """["u1"]"""},
                        "teamIds": []
                      },
                      "participants": {
                        "teamIds": [],
                        "userIds": ${if (participantIds.isEmpty()) "[]" else """["u1"]"""},
                        "waitListIds": [],
                        "freeAgentIds": [],
                        "divisions": []
                      },
                      "users": ${if (participantIds.isEmpty()) "[]" else """[{"id":"u1","firstName":"Test","lastName":"User","userName":"u1"}]"""},
                      "participantCount": ${participantIds.size}
                    }
                """.trimIndent()
                else -> error("unexpected method: ${request.method}")
            }

            respond(
                content = json,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val baseEvent = makeEvent(id = "e1", hostId = "h1", userIds = emptyList()).copy(
            teamSignup = false,
        )

        repo.addCurrentUserToEvent(baseEvent).getOrThrow()
        assertEquals(listOf("u1"), eventDao.getEventById("e1")?.userIds)

        repo.removeCurrentUserFromEvent(baseEvent).getOrThrow()
        assertEquals(emptyList<String>(), eventDao.getEventById("e1")?.userIds)
    }

    @Test
    fun addPlayerToEvent_posts_selected_user_to_participants_endpoint() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("host_1"))
        var capturedPath = ""
        var capturedBody = ""

        val engine = MockEngine { request ->
            when (request.method) {
                HttpMethod.Post -> {
                    capturedPath = request.url.encodedPath
                    capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                        ?.bytes()
                        ?.decodeToString()
                        .orEmpty()

                    respond(
                        content = """
                            {
                              "event": {
                                "id": "e1",
                                "name": "Event One",
                                "hostId": "host_1",
                                "start": "2026-02-10T00:00:00Z",
                                "end": "2026-02-10T01:00:00Z",
                                "coordinates": [-80.0, 25.0],
                                "userIds": ["player_1"],
                                "teamIds": []
                              }
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                HttpMethod.Get -> respond(
                    content = """
                        {
                          "event": {
                            "id": "e1",
                            "name": "Event One",
                            "hostId": "host_1",
                            "start": "2026-02-10T00:00:00Z",
                            "end": "2026-02-10T01:00:00Z",
                            "coordinates": [-80.0, 25.0],
                            "userIds": ["player_1"],
                            "teamIds": []
                          },
                          "participants": {
                            "teamIds": [],
                            "userIds": ["player_1"],
                            "waitListIds": [],
                            "freeAgentIds": [],
                            "divisions": []
                          },
                          "users": [{"id":"player_1","firstName":"Target","lastName":"Player","userName":"target"}],
                          "participantCount": 1
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)
        val event = makeEvent(id = "e1", hostId = "host_1", userIds = emptyList()).copy(
            teamSignup = false,
        )

        repo.addPlayerToEvent(event, makeUser("player_1")).getOrThrow()

        assertEquals("/api/events/e1/participants", capturedPath)
        assertTrue(capturedBody.contains("\"userId\":\"player_1\""))
        assertEquals(listOf("player_1"), eventDao.getEventById("e1")?.userIds)
    }

    @Test
    fun addCurrentUserToEvent_succeeds_when_participant_refresh_fails_after_post() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            when (request.method) {
                HttpMethod.Post -> respond(
                    content = """
                        {
                          "event": {
                            "id": "e1",
                            "name": "Event One",
                            "hostId": "h1",
                            "start": "2026-02-10T00:00:00Z",
                            "end": "2026-02-10T01:00:00Z",
                            "coordinates": [-80.0, 25.0],
                            "userIds": ["u1"],
                            "teamIds": []
                          }
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                HttpMethod.Get -> respond(
                    content = """{"error":"temporary participant sync failure"}""",
                    status = HttpStatusCode.InternalServerError,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)
        val baseEvent = makeEvent(id = "e1", hostId = "h1", userIds = emptyList()).copy(
            teamSignup = false,
        )

        repo.addCurrentUserToEvent(baseEvent).getOrThrow()

        assertEquals(listOf("u1"), eventDao.getEventById("e1")?.userIds)
    }

    @Test
    fun syncEventParticipants_clears_cached_participants_when_weekly_selection_is_required() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Get, request.method)
            respond(
                content = """
                    {
                      "participants": {
                        "teamIds": [],
                        "userIds": [],
                        "waitListIds": [],
                        "freeAgentIds": [],
                        "divisions": []
                      },
                      "teams": [],
                      "users": [],
                      "participantCount": 0,
                      "participantCapacity": 8,
                      "weeklySelectionRequired": true
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)
        val baseEvent = makeEvent(id = "e1", hostId = "h1", userIds = listOf("u1"))

        eventDao.upsertEvent(baseEvent)

        val result = repo.syncEventParticipants(baseEvent).getOrThrow()

        assertTrue(result.weeklySelectionRequired)
        assertEquals(emptyList(), result.event.userIds)
        assertEquals(emptyList(), result.event.teamIds)
        assertEquals(emptyList(), eventDao.getEventById("e1")?.userIds)
        assertEquals(emptyList(), eventDao.getEventById("e1")?.teamIds)
    }

    @Test
    fun removeTeamFromEvent_includes_refund_intent_when_provided() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/participants", request.url.encodedPath)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            when (request.method) {
                HttpMethod.Delete -> {
                    capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                        ?.bytes()
                        ?.decodeToString()
                        .orEmpty()
                    respond(
                        content = """
                            {
                              "event": {
                                "id": "e1",
                                "name": "Event One",
                                "hostId": "h1",
                                "start": "2026-02-10T00:00:00Z",
                                "end": "2026-02-10T01:00:00Z",
                                "coordinates": [-80.0, 25.0],
                                "userIds": [],
                                "teamIds": []
                              }
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                HttpMethod.Get -> respond(
                    content = """
                        {
                          "event": {
                            "id": "e1",
                            "name": "Event One",
                            "hostId": "h1",
                            "start": "2026-02-10T00:00:00Z",
                            "end": "2026-02-10T01:00:00Z",
                            "coordinates": [-80.0, 25.0],
                            "userIds": [],
                            "teamIds": []
                          },
                          "participants": {
                            "teamIds": [],
                            "userIds": [],
                            "waitListIds": [],
                            "freeAgentIds": [],
                            "divisions": []
                          },
                          "teams": [],
                          "users": [],
                          "participantCount": 0
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)
        val team = TeamWithPlayers(
            team = Team(
                id = "team_1",
                division = "open",
                captainId = "u1",
                managerId = "u1",
                name = "Team One",
                teamSize = 2,
                playerIds = listOf("u1"),
            ),
            captain = null,
            players = emptyList(),
            pendingPlayers = emptyList(),
        )
        val event = makeEvent(id = "e1", hostId = "h1").copy(teamSignup = true, teamIds = listOf("team_1"))

        repo.removeTeamFromEvent(
            event = event,
            teamWithPlayers = team,
            refundMode = EventParticipantRefundMode.REQUEST,
            refundReason = "Team can no longer attend",
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"teamId\":\"team_1\""))
        assertTrue(capturedBody.contains("\"refundMode\":\"request\""))
        assertTrue(capturedBody.contains("\"refundReason\":\"Team can no longer attend\""))
    }

    @Test
    fun addCurrentUserToEvent_uses_free_agents_endpoint_for_team_signup_events() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedPath = ""

        val engine = MockEngine { request ->
            when (request.method) {
                HttpMethod.Post -> {
                    capturedPath = request.url.encodedPath
                    respond(
                        content = """
                            {
                              "event": {
                                "id": "e1",
                                "name": "Event One",
                                "hostId": "h1",
                                "start": "2026-02-10T00:00:00Z",
                                "end": "2026-02-10T01:00:00Z",
                                "coordinates": [-80.0, 25.0],
                                "userIds": [],
                                "freeAgentIds": ["u1"],
                                "teamIds": []
                              }
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                HttpMethod.Get -> respond(
                    content = """
                        {
                          "event": {
                            "id": "e1",
                            "name": "Event One",
                            "hostId": "h1",
                            "start": "2026-02-10T00:00:00Z",
                            "end": "2026-02-10T01:00:00Z",
                            "coordinates": [-80.0, 25.0],
                            "userIds": [],
                            "teamIds": []
                          },
                          "participants": {
                            "teamIds": ["team_1", "team_2", "team_3", "team_4"],
                            "userIds": [],
                            "waitListIds": [],
                            "freeAgentIds": ["u1"],
                            "divisions": []
                          },
                          "users": [{"id":"u1","firstName":"Test","lastName":"User","userName":"u1"}],
                          "participantCount": 4,
                          "participantCapacity": 4
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val teamSignupEvent = makeEvent(id = "e1", hostId = "h1", userIds = emptyList()).copy(
            teamSignup = true,
            teamIds = listOf("team_1", "team_2", "team_3", "team_4"),
            maxParticipants = 4,
        )

        repo.addCurrentUserToEvent(teamSignupEvent).getOrThrow()

        assertEquals("/api/events/e1/free-agents", capturedPath)
        assertEquals(listOf("u1"), eventDao.getEventById("e1")?.freeAgentIds)
        assertEquals(emptyList<String>(), eventDao.getEventById("e1")?.userIds)
    }

    @Test
    fun addCurrentUserToEvent_posts_selected_division_and_returns_parent_approval_state() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u_minor"))

        val divisionAId = "e1__division__m_skill_b"
        val divisionBId = "e1__division__f_skill_a"
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/participants", request.url.encodedPath)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            when (request.method) {
                HttpMethod.Post -> {
                    capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                        ?.bytes()
                        ?.decodeToString()
                        .orEmpty()

                    respond(
                        content = """
                            {
                              "event": {
                                "id": "e1",
                                "name": "Event One",
                                "hostId": "h1",
                                "start": "2026-02-10T00:00:00Z",
                                "end": "2026-02-10T01:00:00Z",
                                "coordinates": [-80.0, 25.0],
                                "userIds": [],
                                "teamIds": []
                              },
                              "requiresParentApproval": true
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                HttpMethod.Get -> respond(
                    content = """
                        {
                          "event": {
                            "id": "e1",
                            "name": "Event One",
                            "hostId": "h1",
                            "start": "2026-02-10T00:00:00Z",
                            "end": "2026-02-10T01:00:00Z",
                            "coordinates": [-80.0, 25.0],
                            "userIds": [],
                            "teamIds": []
                          },
                          "participants": {
                            "teamIds": [],
                            "userIds": [],
                            "waitListIds": [],
                            "freeAgentIds": [],
                            "divisions": []
                          },
                          "users": [],
                          "participantCount": 0
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val event = Event(
            id = "e1",
            name = "Event One",
            hostId = "h1",
            coordinates = listOf(-80.0, 25.0),
            start = Instant.parse("2026-02-10T00:00:00Z"),
            end = Instant.parse("2026-02-10T01:00:00Z"),
            maxParticipants = 16,
            teamSignup = false,
            registrationByDivisionType = true,
            divisions = listOf(divisionAId, divisionBId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionAId,
                    key = "m_skill_b",
                    name = "Men B",
                    divisionTypeId = "b",
                    divisionTypeName = "B",
                    ratingType = "SKILL",
                    gender = "M",
                    maxParticipants = 8,
                ),
                DivisionDetail(
                    id = divisionBId,
                    key = "f_skill_a",
                    name = "Women A",
                    divisionTypeId = "a",
                    divisionTypeName = "A",
                    ratingType = "SKILL",
                    gender = "F",
                    maxParticipants = 8,
                ),
            ),
        )

        val result = repo.addCurrentUserToEvent(
            event = event,
            preferredDivisionId = divisionBId,
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"divisionId\":\"$divisionBId\""))
        assertTrue(capturedBody.contains("\"divisionTypeId\":\"a\""))
        assertTrue(capturedBody.contains("\"divisionTypeKey\":\"f_skill_a\""))
        assertTrue(result.requiresParentApproval)
        assertFalse(result.joinedWaitlist)
    }

    @Test
    fun addCurrentUserToEvent_uses_division_capacity_for_waitlist_routing_in_multi_division_events() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u_new"))

        val divisionOpenId = "e1__division__open"
        val divisionAdvancedId = "e1__division__advanced"
        var capturedPath = ""

        val engine = MockEngine { request ->
            if (request.method != HttpMethod.Get) {
                capturedPath = request.url.encodedPath
            }
            respond(
                content = when (request.method) {
                    HttpMethod.Get -> """
                        {
                          "event": {
                            "id": "e1",
                            "name": "Event One",
                            "hostId": "h1",
                            "start": "2026-02-10T00:00:00Z",
                            "end": "2026-02-10T01:00:00Z",
                            "coordinates": [-80.0, 25.0],
                            "userIds": ["existing_user", "existing_user_2"],
                            "teamIds": []
                          },
                          "participants": {
                            "teamIds": [],
                            "userIds": ["existing_user", "existing_user_2"],
                            "waitListIds": ["u_new"],
                            "freeAgentIds": [],
                            "divisions": []
                          },
                          "users": [],
                          "participantCount": 2
                        }
                    """.trimIndent()
                    else -> """
                        {
                          "event": {
                            "id": "e1",
                            "name": "Event One",
                            "hostId": "h1",
                            "start": "2026-02-10T00:00:00Z",
                            "end": "2026-02-10T01:00:00Z",
                            "coordinates": [-80.0, 25.0],
                            "userIds": ["existing_user", "existing_user_2"],
                            "teamIds": []
                          }
                        }
                    """.trimIndent()
                },
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val event = Event(
            id = "e1",
            name = "Event One",
            hostId = "h1",
            coordinates = listOf(-80.0, 25.0),
            start = Instant.parse("2026-02-10T00:00:00Z"),
            end = Instant.parse("2026-02-10T01:00:00Z"),
            maxParticipants = 30,
            teamSignup = false,
            singleDivision = false,
            userIds = listOf("existing_user", "existing_user_2"),
            divisions = listOf(divisionOpenId, divisionAdvancedId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionOpenId,
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    maxParticipants = 8,
                ),
                DivisionDetail(
                    id = divisionAdvancedId,
                    key = "advanced",
                    name = "Advanced",
                    divisionTypeId = "advanced",
                    divisionTypeName = "Advanced",
                    ratingType = "SKILL",
                    gender = "C",
                    maxParticipants = 2,
                ),
            ),
        )

        repo.addCurrentUserToEvent(
            event = event,
            preferredDivisionId = divisionAdvancedId,
        ).getOrThrow()

        assertEquals("/api/events/e1/waitlist", capturedPath)
    }

    @Test
    fun addTeamToEvent_posts_selected_division_payload() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val divisionAId = "e1__division__m_skill_b"
        val divisionBId = "e1__division__f_skill_a"
        var capturedPath = ""
        var capturedBody = ""

        val team = Team(
            division = "open",
            name = "Team One",
            captainId = "u1",
            managerId = "u1",
            playerIds = listOf("u1"),
            teamSize = 2,
            id = "t1",
            divisionTypeId = "a",
            skillDivisionTypeId = "a",
            skillDivisionTypeName = "A",
            ageDivisionTypeId = "open",
            ageDivisionTypeName = "Open",
            divisionGender = "F",
        )

        val teamRepository = object : ITeamRepository by EventRepositoryHttp_UnusedTeamRepository {
            override suspend fun getTeams(ids: List<String>): Result<List<Team>> {
                return Result.success(
                    if (ids.contains(team.id)) {
                        listOf(team)
                    } else {
                        emptyList()
                    }
                )
            }
        }

        val engine = MockEngine { request ->
            when (request.method) {
                HttpMethod.Post -> {
                    capturedPath = request.url.encodedPath
                    capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                        ?.bytes()
                        ?.decodeToString()
                        .orEmpty()

                    respond(
                        content = """
                            {
                              "event": {
                                "id": "e1",
                                "name": "Event One",
                                "hostId": "h1",
                                "start": "2026-02-10T00:00:00Z",
                                "end": "2026-02-10T01:00:00Z",
                                "coordinates": [-80.0, 25.0],
                                "userIds": [],
                                "teamIds": ["t1"]
                              }
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                HttpMethod.Get -> respond(
                    content = """
                        {
                          "event": {
                            "id": "e1",
                            "name": "Event One",
                            "hostId": "h1",
                            "start": "2026-02-10T00:00:00Z",
                            "end": "2026-02-10T01:00:00Z",
                            "coordinates": [-80.0, 25.0],
                            "userIds": [],
                            "teamIds": ["t1"]
                          },
                          "participants": {
                            "teamIds": ["t1"],
                            "userIds": [],
                            "waitListIds": [],
                            "freeAgentIds": [],
                            "divisions": []
                          },
                          "teams": [{"id":"t1","name":"Team One","captainId":"u1","managerId":"u1","playerIds":["u1"],"teamSize":2,"division":"open","divisionTypeId":"a","skillDivisionTypeId":"a","skillDivisionTypeName":"A","ageDivisionTypeId":"open","ageDivisionTypeName":"Open","divisionGender":"F"}],
                          "users": [],
                          "participantCount": 1
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, teamRepository, userRepo)

        val event = Event(
            id = "e1",
            name = "Event One",
            hostId = "h1",
            coordinates = listOf(-80.0, 25.0),
            start = Instant.parse("2026-02-10T00:00:00Z"),
            end = Instant.parse("2026-02-10T01:00:00Z"),
            maxParticipants = 24,
            teamSignup = true,
            singleDivision = false,
            divisions = listOf(divisionAId, divisionBId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionAId,
                    key = "m_skill_b",
                    name = "Men B",
                    divisionTypeId = "b",
                    divisionTypeName = "B",
                    ratingType = "SKILL",
                    gender = "M",
                    maxParticipants = 12,
                ),
                DivisionDetail(
                    id = divisionBId,
                    key = "f_skill_a",
                    name = "Women A",
                    divisionTypeId = "a",
                    divisionTypeName = "A",
                    ratingType = "SKILL",
                    gender = "F",
                    maxParticipants = 12,
                ),
            ),
        )

        repo.addTeamToEvent(
            event = event,
            team = team,
            preferredDivisionId = divisionBId,
        ).getOrThrow()

        assertEquals("/api/events/e1/participants", capturedPath)
        assertTrue(capturedBody.contains("\"teamId\":\"t1\""))
        assertTrue(capturedBody.contains("\"divisionId\":\"$divisionBId\""))
        assertTrue(capturedBody.contains("\"divisionTypeId\":\"a\""))
        assertTrue(capturedBody.contains("\"divisionTypeKey\":\"f_skill_a\""))
        assertEquals(listOf("t1"), eventDao.getEventById("e1")?.teamIds)
    }

    @Test
    fun moveTeamParticipantDivision_posts_participants_endpoint_without_waitlist_routing() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val divisionOpenId = "e1__division__open"
        val divisionAdvancedId = "e1__division__advanced"
        var capturedPath = ""
        var capturedBody = ""

        val team = Team(
            division = divisionOpenId,
            name = "Team One",
            captainId = "u1",
            managerId = "u1",
            playerIds = listOf("u1"),
            teamSize = 2,
            id = "canonical_t1",
        )

        val teamRepository = object : ITeamRepository by EventRepositoryHttp_UnusedTeamRepository {
            override suspend fun getTeams(ids: List<String>): Result<List<Team>> {
                return Result.success(
                    if (ids.contains(team.id)) {
                        listOf(team.copy(division = divisionAdvancedId))
                    } else {
                        emptyList()
                    }
                )
            }
        }

        val engine = MockEngine { request ->
            when (request.method) {
                HttpMethod.Post -> {
                    capturedPath = request.url.encodedPath
                    capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                        ?.bytes()
                        ?.decodeToString()
                        .orEmpty()

                    respond(
                        content = """
                            {
                              "event": {
                                "id": "e1",
                                "name": "Event One",
                                "hostId": "h1",
                                "start": "2026-02-10T00:00:00Z",
                                "end": "2026-02-10T01:00:00Z",
                                "coordinates": [-80.0, 25.0],
                                "userIds": [],
                                "teamIds": ["canonical_t1"]
                              }
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                HttpMethod.Get -> respond(
                    content = """
                        {
                          "event": {
                            "id": "e1",
                            "name": "Event One",
                            "hostId": "h1",
                            "start": "2026-02-10T00:00:00Z",
                            "end": "2026-02-10T01:00:00Z",
                            "coordinates": [-80.0, 25.0],
                            "userIds": [],
                            "teamIds": ["canonical_t1"]
                          },
                          "participants": {
                            "teamIds": ["canonical_t1"],
                            "userIds": [],
                            "waitListIds": [],
                            "freeAgentIds": [],
                            "divisions": []
                          },
	                          "teams": [{"id":"canonical_t1","name":"Team One","captainId":"u1","managerId":"u1","playerIds":["u1"],"teamSize":2,"division":"e1__division__advanced"}],
	                          "users": [],
	                          "participantCount": 1,
	                          "divisionWarnings": [
	                            {
	                              "divisionId": "e1__division__advanced",
	                              "code": "OVER_CAPACITY",
	                              "message": "This division has 2 teams, which is over the 1-team limit.",
	                              "filledCount": 2,
	                              "slotCount": 2,
	                              "maxTeams": 1
	                            }
	                          ]
	                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, teamRepository, userRepo)

        val event = Event(
            id = "e1",
            name = "Event One",
            hostId = "h1",
            coordinates = listOf(-80.0, 25.0),
            start = Instant.parse("2026-02-10T00:00:00Z"),
            end = Instant.parse("2026-02-10T01:00:00Z"),
            maxParticipants = 1,
            teamSignup = true,
            singleDivision = false,
            teamIds = listOf("canonical_t1"),
            divisions = listOf(divisionOpenId, divisionAdvancedId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionOpenId,
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                ),
                DivisionDetail(
                    id = divisionAdvancedId,
                    key = "advanced",
                    name = "Advanced",
                    divisionTypeId = "advanced",
                    divisionTypeName = "Advanced",
                    ratingType = "SKILL",
                    gender = "C",
                ),
            ),
        )

        val result = repo.moveTeamParticipantDivision(
            event = event,
            team = team,
            preferredDivisionId = divisionAdvancedId,
        ).getOrThrow()

        assertEquals("/api/events/e1/participants", capturedPath)
        assertFalse(capturedPath.contains("waitlist"))
        assertTrue(capturedBody.contains("\"teamId\":\"canonical_t1\""))
        assertTrue(capturedBody.contains("\"divisionId\":\"$divisionAdvancedId\""))
        assertTrue(capturedBody.contains("\"divisionTypeId\":\"advanced\""))
        assertTrue(capturedBody.contains("\"divisionTypeKey\":\"advanced\""))
        assertEquals("OVER_CAPACITY", result.divisionWarnings.single().code)
        assertEquals(divisionAdvancedId, result.divisionWarnings.single().divisionId)
    }

    @Test
    fun addCurrentUserToEvent_uses_occurrence_scoped_participant_snapshot_for_weekly_events() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        val participantQueries = mutableListOf<Pair<String?, String?>>()
        var capturedPostBody = ""

        val engine = MockEngine { request ->
            when (request.method) {
                HttpMethod.Get -> {
                    if (request.url.encodedPath == "/api/events/e1/participants") {
                        participantQueries += request.url.parameters["slotId"] to request.url.parameters["occurrenceDate"]
                    }
                    respond(
                        content = """
                            {
                              "event": {
                                "id": "e1",
                                "name": "Weekly Event",
                                "hostId": "h1",
                                "eventType": "WEEKLY_EVENT",
                                "start": "2026-04-12T00:00:00Z",
                                "end": "2026-04-12T01:00:00Z",
                                "coordinates": [-80.0, 25.0],
                                "userIds": [],
                                "teamIds": []
                              },
                              "participants": {
                                "teamIds": [],
                                "userIds": [],
                                "waitListIds": [],
                                "freeAgentIds": [],
                                "divisions": []
                              },
                              "users": [],
                              "participantCount": 0,
                              "participantCapacity": 8
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                HttpMethod.Post -> {
                    capturedPostBody = (request.body as? OutgoingContent.ByteArrayContent)
                        ?.bytes()
                        ?.decodeToString()
                        .orEmpty()
                    respond(
                        content = """
                            {
                              "event": {
                                "id": "e1",
                                "name": "Weekly Event",
                                "hostId": "h1",
                                "eventType": "WEEKLY_EVENT",
                                "start": "2026-04-12T00:00:00Z",
                                "end": "2026-04-12T01:00:00Z",
                                "coordinates": [-80.0, 25.0],
                                "userIds": ["u1"],
                                "teamIds": []
                              }
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val weeklyEvent = Event(
            id = "e1",
            name = "Weekly Event",
            hostId = "h1",
            coordinates = listOf(-80.0, 25.0),
            start = Instant.parse("2026-04-12T00:00:00Z"),
            end = Instant.parse("2026-04-12T01:00:00Z"),
            eventType = EventType.WEEKLY_EVENT,
            maxParticipants = 8,
            teamSignup = false,
        )
        val occurrence = EventOccurrenceSelection(
            slotId = "slot-1",
            occurrenceDate = "2026-04-14",
        )

        repo.addCurrentUserToEvent(
            event = weeklyEvent,
            occurrence = occurrence,
        ).getOrThrow()

        assertTrue(
            participantQueries.contains("slot-1" to "2026-04-14"),
            "Expected weekly participant queries to carry slotId and occurrenceDate.",
        )
        assertTrue(capturedPostBody.contains("\"slotId\":\"slot-1\""))
        assertTrue(capturedPostBody.contains("\"occurrenceDate\":\"2026-04-14\""))
    }

    @Test
    fun registerChildForEvent_posts_child_registration_payload() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/registrations/child", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "registration": {
                        "id": "reg_1",
                        "status": "ACTIVE",
                        "consentStatus": "child_email_required"
                      },
                      "consent": {
                        "status": "child_email_required",
                        "requiresChildEmail": true
                      },
                      "warnings": [
                        "Under-13 child profile is missing email; child signature cannot be completed until email is added."
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val result = repo.registerChildForEvent(eventId = "e1", childUserId = "child_1").getOrThrow()

        assertTrue(capturedBody.contains("\"childId\":\"child_1\""))
        assertEquals("ACTIVE", result.registrationStatus)
        assertEquals("child_email_required", result.consentStatus)
        assertFalse(result.requiresParentApproval)
        assertTrue(result.requiresChildEmail)
        assertTrue(result.warnings.isNotEmpty())
    }

    @Test
    fun registerChildForEvent_posts_waitlist_payload_when_join_waitlist_requested() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedPath = ""
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            when (request.method) {
                HttpMethod.Post -> {
                    capturedPath = request.url.encodedPath
                    capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                        ?.bytes()
                        ?.decodeToString()
                        .orEmpty()

                    respond(
                        content = """
                            {
                              "event": {
                                "id": "e1",
                                "name": "Event One",
                                "hostId": "h1",
                                "start": "2026-02-10T00:00:00Z",
                                "end": "2026-02-10T01:00:00Z",
                                "coordinates": [-80.0, 25.0],
                                "userIds": [],
                                "teamIds": [],
                                "waitListIds": ["child_1"]
                              },
                              "requiresParentApproval": false
                            }
                        """.trimIndent(),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                HttpMethod.Get -> respond(
                    content = """
                        {
                          "event": {
                            "id": "e1",
                            "name": "Event One",
                            "hostId": "h1",
                            "start": "2026-02-10T00:00:00Z",
                            "end": "2026-02-10T01:00:00Z",
                            "coordinates": [-80.0, 25.0],
                            "userIds": [],
                            "teamIds": [],
                            "waitListIds": ["child_1"]
                          },
                          "participants": {
                            "teamIds": [],
                            "userIds": [],
                            "waitListIds": ["child_1"],
                            "freeAgentIds": [],
                            "divisions": []
                          },
                          "users": [],
                          "participantCount": 0
                        }
                    """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )

                else -> error("unexpected method: ${request.method}")
            }
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val result = repo.registerChildForEvent(
            eventId = "e1",
            childUserId = "child_1",
            joinWaitlist = true,
        ).getOrThrow()

        assertEquals("/api/events/e1/waitlist", capturedPath)
        assertTrue(capturedBody.contains("\"userId\":\"child_1\""))
        assertEquals("WAITLISTED", result.registrationStatus)
        assertTrue(result.joinedWaitlist)
        assertFalse(result.requiresParentApproval)
        assertEquals(listOf("child_1"), eventDao.getEventById("e1")?.waitListIds)
    }

    @Test
    fun getLeagueDivisionStandings_requests_division_query_and_maps_response() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/standings", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("e1__division__advanced", request.url.parameters["divisionId"])
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "division": {
                        "divisionId": "e1__division__advanced",
                        "divisionName": "Advanced",
                        "standingsConfirmedAt": "2026-02-24T12:00:00.000Z",
                        "standingsConfirmedBy": "host_1",
                        "standings": [
                          {
                            "position": 1,
                            "teamId": "team_1",
                            "teamName": "Team One",
                            "wins": 3,
                            "losses": 0,
                            "draws": 0,
                            "goalsFor": 9,
                            "goalsAgainst": 2,
                            "goalDifference": 7,
                            "matchesPlayed": 3,
                            "basePoints": 9,
                            "finalPoints": 10,
                            "pointsDelta": 1
                          }
                        ],
                        "validation": {
                          "mappingErrors": [],
                          "capacityErrors": []
                        }
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val result = repo.getLeagueDivisionStandings(
            eventId = "e1",
            divisionId = "e1__division__advanced",
        ).getOrThrow()

        assertEquals("e1__division__advanced", result.divisionId)
        assertEquals("Advanced", result.divisionName)
        assertEquals("host_1", result.standingsConfirmedBy)
        assertEquals(1, result.rows.size)
        assertEquals("team_1", result.rows.first().teamId)
        assertEquals(3, result.rows.first().wins)
        assertEquals(0, result.rows.first().losses)
        assertEquals(0, result.rows.first().draws)
        assertEquals(10.0, result.rows.first().finalPoints)
        assertEquals(1.0, result.rows.first().pointsDelta)
    }

    @Test
    fun getEventTeamCompliance_fetches_team_payment_and_document_status() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("host_1"))

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/teams/compliance", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "teams": [
                        {
                          "teamId": "team_1",
                          "teamName": "Aces",
                          "payment": {
                            "hasBill": true,
                            "billId": "bill_1",
                            "totalAmountCents": 10000,
                            "paidAmountCents": 2500,
                            "status": "PARTIAL",
                            "isPaidInFull": false
                          },
                          "documents": {
                            "signedCount": 1,
                            "requiredCount": 2
                          },
                          "users": [
                            {
                              "userId": "user_1",
                              "fullName": "Test Player",
                              "userName": "testplayer",
                              "isMinorAtEvent": false,
                              "registrationType": "ADULT",
                              "payment": {
                                "hasBill": true,
                                "billId": "bill_1",
                                "totalAmountCents": 10000,
                                "paidAmountCents": 2500,
                                "status": "PARTIAL",
                                "isPaidInFull": false,
                                "inheritedFromTeamBill": true
                              },
                              "documents": {
                                "signedCount": 0,
                                "requiredCount": 1
                              },
                              "requiredDocuments": [
                                {
                                  "key": "doc_1",
                                  "templateId": "template_1",
                                  "title": "Waiver",
                                  "type": "PDF",
                                  "signerContext": "participant",
                                  "signerLabel": "Participant",
                                  "signOnce": false,
                                  "status": "UNSIGNED"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val teams = repo.getEventTeamCompliance(" e1 ").getOrThrow()

        assertEquals(1, teams.size)
        assertEquals("team_1", teams.first().teamId)
        assertEquals("Aces", teams.first().teamName)
        assertEquals(10000, teams.first().payment.totalAmountCents)
        assertEquals(2500, teams.first().payment.paidAmountCents)
        assertEquals(1, teams.first().documents.signedCount)
        assertEquals(2, teams.first().documents.requiredCount)
        assertEquals("user_1", teams.first().users.first().userId)
        assertTrue(teams.first().users.first().payment.inheritedFromTeamBill)
        assertEquals("Waiver", teams.first().users.first().requiredDocuments.first().title)
    }

    @Test
    fun getEventUserCompliance_fetches_user_payment_and_document_status() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("host_1"))

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/users/compliance", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "users": [
                        {
                          "userId": "user_1",
                          "fullName": "Solo Player",
                          "userName": "solo",
                          "isMinorAtEvent": true,
                          "registrationType": "CHILD",
                          "payment": {
                            "hasBill": true,
                            "billId": "bill_2",
                            "totalAmountCents": 5000,
                            "paidAmountCents": 5000,
                            "status": "PAID",
                            "isPaidInFull": true
                          },
                          "documents": {
                            "signedCount": 1,
                            "requiredCount": 1
                          },
                          "requiredDocuments": [
                            {
                              "key": "doc_2",
                              "templateId": "template_2",
                              "title": "Guardian consent",
                              "type": "TEXT",
                              "signerContext": "parent_guardian",
                              "signerLabel": "Parent/guardian",
                              "signOnce": true,
                              "status": "SIGNED",
                              "signedDocumentRecordId": "signed_1",
                              "signedAt": "2026-05-01T12:00:00.000Z"
                            }
                          ]
                        }
                      ]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val users = repo.getEventUserCompliance("e1").getOrThrow()

        assertEquals(1, users.size)
        assertEquals("user_1", users.first().userId)
        assertEquals("Solo Player", users.first().fullName)
        assertTrue(users.first().isMinorAtEvent)
        assertEquals("CHILD", users.first().registrationType)
        assertTrue(users.first().payment.isPaidInFull)
        assertEquals(1, users.first().documents.requiredCount)
        assertEquals("Guardian consent", users.first().requiredDocuments.first().title)
        assertEquals("signed_1", users.first().requiredDocuments.first().signedDocumentRecordId)
    }

    @Test
    fun confirmLeagueDivisionStandings_posts_confirm_payload_and_maps_result() = runTest {
        val tokenStore = EventRepositoryHttp_InMemoryAuthTokenStore("t123")
        val eventDao = EventRepositoryHttp_FakeEventDao()
        val db = EventRepositoryHttp_FakeDatabaseService(
            eventDao,
            EventRepositoryHttp_FakeUserDataDao(),
            EventRepositoryHttp_FakeTeamDao(),
        )
        val userRepo = EventRepositoryHttp_FakeUserRepository(makeUser("u1"))
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/e1/standings/confirm", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "division": {
                        "divisionId": "e1__division__advanced",
                        "divisionName": "Advanced",
                        "standingsConfirmedAt": "2026-02-24T12:00:00.000Z",
                        "standingsConfirmedBy": "host_1",
                        "standings": [],
                        "validation": {
                          "mappingErrors": [],
                          "capacityErrors": []
                        }
                      },
                      "applyReassignment": false,
                      "reassignedPlayoffDivisionIds": [],
                      "seededTeamIds": []
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = EventRepository(db, api, EventRepositoryHttp_UnusedTeamRepository, userRepo)

        val result = repo.confirmLeagueDivisionStandings(
            eventId = "e1",
            divisionId = "e1__division__advanced",
            applyReassignment = false,
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"divisionId\":\"e1__division__advanced\""))
        assertTrue(capturedBody.contains("\"applyReassignment\":false"))
        assertFalse(result.applyReassignment)
        assertEquals("e1__division__advanced", result.division.divisionId)
    }
}
