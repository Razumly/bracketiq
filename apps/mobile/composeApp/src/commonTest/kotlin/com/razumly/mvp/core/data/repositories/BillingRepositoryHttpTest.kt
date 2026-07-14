package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_REJECTED
import com.razumly.mvp.core.data.dataTypes.PendingRentalOrder
import com.razumly.mvp.core.data.dataTypes.OrganizationVerificationReviewStatus
import com.razumly.mvp.core.data.dataTypes.OrganizationVerificationStatus
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.activeHostIds
import com.razumly.mvp.core.data.dataTypes.activeOfficialIds
import com.razumly.mvp.core.data.dataTypes.canManageEventsForViewer
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.EventRegistrationDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.PendingRentalOrderDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.configureMvpHttpClient
import com.razumly.mvp.core.network.stripeRedirectBaseUrl
import com.razumly.mvp.core.util.jsonMVP
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
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private class BillingRepositoryHttp_InMemoryAuthTokenStore(
    private var token: String = "",
) : AuthTokenStore {
    override suspend fun get(): String = token
    override suspend fun set(token: String) { this.token = token }
    override suspend fun clear() { token = "" }
}

private fun billingRepositoryHttpProductionClient(engine: MockEngine): HttpClient =
    HttpClient(engine) {
        configureMvpHttpClient()
    }

private class BillingRepositoryHttp_FakeRefundRequestDao : RefundRequestDao {
    var storedRefunds: List<RefundRequest> = emptyList()

    override suspend fun upsertRefundRequest(refundRequest: RefundRequest) {
        storedRefunds = storedRefunds.filterNot { existing -> existing.id == refundRequest.id } + refundRequest
    }

    override suspend fun upsertRefundRequests(refundRequests: List<RefundRequest>) {
        storedRefunds = refundRequests
    }

    override suspend fun getRefundRequest(refundId: String): RefundRequest? =
        storedRefunds.firstOrNull { refund -> refund.id == refundId }

    override suspend fun getRefundRequestsForHost(hostId: String): List<RefundRequest> =
        storedRefunds.filter { refund -> refund.hostId == hostId }

    override fun getRefundRequestsForHostFlow(hostId: String): Flow<List<RefundRequest>> =
        flowOf(storedRefunds.filter { refund -> refund.hostId == hostId })

    override suspend fun deleteRefundRequest(refundId: String) {
        storedRefunds = storedRefunds.filterNot { refund -> refund.id == refundId }
    }

    override suspend fun deleteRefundRequests(refundIds: List<String>) {
        storedRefunds = storedRefunds.filterNot { refund -> refund.id in refundIds }
    }

    override suspend fun deleteAllRefundRequests() {
        storedRefunds = emptyList()
    }

    override suspend fun getRefundRequestsWithRelations(hostId: String): List<RefundRequestWithRelations> =
        getRefundRequestsForHost(hostId).map { refund ->
            RefundRequestWithRelations(refundRequest = refund, user = null, event = null)
        }

    override fun getRefundRequestsWithRelationsFlow(hostId: String): Flow<List<RefundRequestWithRelations>> =
        flowOf(
            storedRefunds
                .filter { refund -> refund.hostId == hostId }
                .map { refund -> RefundRequestWithRelations(refundRequest = refund, user = null, event = null) },
        )

    override suspend fun getRefundRequestWithRelations(refundId: String): RefundRequestWithRelations? =
        getRefundRequest(refundId)?.let { refund ->
            RefundRequestWithRelations(refundRequest = refund, user = null, event = null)
        }
}

private class BillingRepositoryHttp_FakePendingRentalOrderDao : PendingRentalOrderDao {
    private val orders = linkedMapOf<String, PendingRentalOrder>()
    val storedOrders: List<PendingRentalOrder>
        get() = orders.values.toList()

    override suspend fun upsert(order: PendingRentalOrder) {
        orders[order.id] = order
    }

    override suspend fun retryableOrders(
        payerUserId: String,
        pendingStatus: String,
        awaitingPaymentStatus: String,
    ): List<PendingRentalOrder> =
        orders.values.filter { order ->
            order.payerUserId == payerUserId &&
                order.status in setOf(pendingStatus, awaitingPaymentStatus)
        }

    override suspend fun deleteById(id: String) {
        orders.remove(id)
    }

    override suspend fun markFailed(id: String, error: String, attemptedAt: String) {
        orders[id]?.let { order ->
            orders[id] = order.copy(
                attemptCount = order.attemptCount + 1,
                lastError = error,
                lastAttemptAt = attemptedAt,
            )
        }
    }

    override suspend fun markAwaitingPayment(
        id: String,
        error: String,
        attemptedAt: String,
        status: String,
    ) {
        orders[id]?.let { order ->
            orders[id] = order.copy(
                status = status,
                lastError = error,
                lastAttemptAt = attemptedAt,
            )
        }
    }

    override suspend fun markRejected(id: String, error: String, attemptedAt: String, status: String) {
        orders[id]?.let { order ->
            orders[id] = order.copy(
                status = status,
                attemptCount = order.attemptCount + 1,
                lastError = error,
                lastAttemptAt = attemptedAt,
            )
        }
    }
}

private class BillingRepositoryHttp_FakeDatabaseService(
    private val refundRequestDao: RefundRequestDao = BillingRepositoryHttp_FakeRefundRequestDao(),
    private val pendingRentalOrderDao: PendingRentalOrderDao = BillingRepositoryHttp_FakePendingRentalOrderDao(),
) : DatabaseService {
    override val getMatchDao: MatchDao get() = error("unused")
    override val getTeamDao: TeamDao get() = error("unused")
    override val getFieldDao: FieldDao get() = error("unused")
    override val getUserDataDao: UserDataDao get() = error("unused")
    override val getEventDao: EventDao get() = error("unused")
    override val getEventRegistrationDao: EventRegistrationDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = refundRequestDao
    override val getPendingRentalOrderDao: PendingRentalOrderDao get() = pendingRentalOrderDao
}

private class BillingRepositoryHttp_FakeUserRepository(
    currentUser: UserData,
    currentAccount: AuthAccount,
    private val getUsersHandler: ((List<String>) -> Result<List<UserData>>)? = null,
) : IUserRepository {
    override val currentUser: StateFlow<Result<UserData>> = MutableStateFlow(Result.success(currentUser))
    override val currentAccount: StateFlow<Result<AuthAccount>> = MutableStateFlow(Result.success(currentAccount))

    override suspend fun getUsers(
        userIds: List<String>,
        visibilityContext: UserVisibilityContext,
    ): Result<List<UserData>> = getUsersHandler?.invoke(userIds) ?: error("unused")
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
    override suspend fun getCurrentAccount(): Result<Unit> = Result.success(Unit)
    override suspend fun sendFriendRequest(user: UserData): Result<Unit> = error("unused")
    override suspend fun acceptFriendRequest(user: UserData): Result<Unit> = error("unused")
    override suspend fun declineFriendRequest(userId: String): Result<Unit> = error("unused")
    override suspend fun followUser(userId: String): Result<Unit> = error("unused")
    override suspend fun unfollowUser(userId: String): Result<Unit> = error("unused")
    override suspend fun removeFriend(userId: String): Result<Unit> = error("unused")
}

private object BillingRepositoryHttp_UnusedEventRepository : IEventRepository {
    override fun getCachedEventsFlow(): Flow<Result<List<Event>>> = error("unused")
    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<com.razumly.mvp.core.data.dataTypes.EventWithRelations>> = error("unused")
    override fun resetCursor() {}
    override suspend fun getEvent(eventId: String): Result<Event> = error("unused")
    override suspend fun getEventStaffInvites(eventId: String): Result<List<com.razumly.mvp.core.data.dataTypes.Invite>> = error("unused")
    override suspend fun getEventsByIds(eventIds: List<String>): Result<List<Event>> = error("unused")
    override suspend fun getEventsByOrganization(organizationId: String, limit: Int): Result<List<Event>> = error("unused")
    override suspend fun createEvent(
        newEvent: Event,
        requiredTemplateIds: List<String>,
        leagueScoringConfig: com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO?,
        fields: List<com.razumly.mvp.core.data.dataTypes.Field>?,
        timeSlots: List<com.razumly.mvp.core.data.dataTypes.TimeSlot>?,
    ): Result<Event> = error("unused")
    override suspend fun scheduleEvent(
        eventId: String,
        participantCount: Int?,
        includePlaceholderTeams: Boolean?,
    ): Result<Event> = error("unused")
    override suspend fun updateEvent(
        newEvent: Event,
        fields: List<com.razumly.mvp.core.data.dataTypes.Field>?,
        timeSlots: List<com.razumly.mvp.core.data.dataTypes.TimeSlot>?,
        leagueScoringConfig: com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO?,
    ): Result<Event> = error("unused")
    override suspend fun updateLocalEvent(newEvent: Event): Result<Event> = error("unused")
    override fun getEventsInBoundsFlow(bounds: com.razumly.mvp.core.data.dataTypes.Bounds): Flow<Result<List<Event>>> = error("unused")
    override suspend fun getEventsInBounds(bounds: com.razumly.mvp.core.data.dataTypes.Bounds): Result<Pair<List<Event>, Boolean>> = error("unused")
    override suspend fun getEventsInBounds(
        bounds: com.razumly.mvp.core.data.dataTypes.Bounds,
        dateFrom: kotlin.time.Instant?,
        dateTo: kotlin.time.Instant?,
        sports: List<String>,
        tags: List<String>,
        limit: Int,
        offset: Int,
        includeDistanceFilter: Boolean,
    ): Result<Pair<List<Event>, Boolean>> = error("unused")
    override suspend fun searchEvents(
        searchQuery: String,
        userLocation: dev.icerock.moko.geo.LatLng?,
        limit: Int,
        offset: Int,
    ): Result<Pair<List<Event>, Boolean>> = error("unused")
    override fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>> = error("unused")
    override suspend fun deleteEvent(eventId: String): Result<Unit> = error("unused")
    override suspend fun addCurrentUserToEvent(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> = error("unused")
    override suspend fun addPlayerToEvent(
        event: Event,
        player: UserData,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> = error("unused")
    override suspend fun registerChildForEvent(
        eventId: String,
        childUserId: String,
        joinWaitlist: Boolean,
        occurrence: EventOccurrenceSelection?,
    ): Result<ChildRegistrationResult> = error("unused")
    override suspend fun addTeamToEvent(
        event: Event,
        team: com.razumly.mvp.core.data.dataTypes.Team,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> = error("unused")
    override suspend fun syncEventParticipants(
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ): Result<EventParticipantsSyncResult> = error("unused")
    override suspend fun getLeagueDivisionStandings(
        eventId: String,
        divisionId: String,
    ): Result<LeagueDivisionStandings> = error("unused")
    override suspend fun confirmLeagueDivisionStandings(
        eventId: String,
        divisionId: String,
        applyReassignment: Boolean,
    ): Result<LeagueStandingsConfirmResult> = error("unused")
    override suspend fun removeTeamFromEvent(
        event: Event,
        teamWithPlayers: com.razumly.mvp.core.data.dataTypes.TeamWithPlayers,
        refundMode: EventParticipantRefundMode?,
        refundReason: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> = error("unused")
    override suspend fun removeCurrentUserFromEvent(
        event: Event,
        targetUserId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> = error("unused")
}

private class BillingRepositoryHttp_FakeEventRepository(
    private val getEventsByIdsHandler: ((List<String>) -> Result<List<Event>>)? = null,
) : IEventRepository {
    override fun getCachedEventsFlow(): Flow<Result<List<Event>>> = error("unused")
    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<com.razumly.mvp.core.data.dataTypes.EventWithRelations>> = error("unused")
    override fun resetCursor() {}
    override suspend fun getEvent(eventId: String): Result<Event> = error("unused")
    override suspend fun getEventStaffInvites(eventId: String): Result<List<com.razumly.mvp.core.data.dataTypes.Invite>> = error("unused")
    override suspend fun getEventsByIds(eventIds: List<String>): Result<List<Event>> =
        getEventsByIdsHandler?.invoke(eventIds) ?: error("unused")
    override suspend fun getEventsByOrganization(organizationId: String, limit: Int): Result<List<Event>> = error("unused")
    override suspend fun createEvent(
        newEvent: Event,
        requiredTemplateIds: List<String>,
        leagueScoringConfig: com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO?,
        fields: List<com.razumly.mvp.core.data.dataTypes.Field>?,
        timeSlots: List<com.razumly.mvp.core.data.dataTypes.TimeSlot>?,
    ): Result<Event> = error("unused")
    override suspend fun scheduleEvent(
        eventId: String,
        participantCount: Int?,
        includePlaceholderTeams: Boolean?,
    ): Result<Event> = error("unused")
    override suspend fun updateEvent(
        newEvent: Event,
        fields: List<com.razumly.mvp.core.data.dataTypes.Field>?,
        timeSlots: List<com.razumly.mvp.core.data.dataTypes.TimeSlot>?,
        leagueScoringConfig: com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO?,
    ): Result<Event> = error("unused")
    override suspend fun updateLocalEvent(newEvent: Event): Result<Event> = error("unused")
    override fun getEventsInBoundsFlow(bounds: com.razumly.mvp.core.data.dataTypes.Bounds): Flow<Result<List<Event>>> = error("unused")
    override suspend fun getEventsInBounds(bounds: com.razumly.mvp.core.data.dataTypes.Bounds): Result<Pair<List<Event>, Boolean>> = error("unused")
    override suspend fun getEventsInBounds(
        bounds: com.razumly.mvp.core.data.dataTypes.Bounds,
        dateFrom: kotlin.time.Instant?,
        dateTo: kotlin.time.Instant?,
        sports: List<String>,
        tags: List<String>,
        limit: Int,
        offset: Int,
        includeDistanceFilter: Boolean,
    ): Result<Pair<List<Event>, Boolean>> = error("unused")
    override suspend fun searchEvents(
        searchQuery: String,
        userLocation: dev.icerock.moko.geo.LatLng?,
        limit: Int,
        offset: Int,
    ): Result<Pair<List<Event>, Boolean>> = error("unused")
    override fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>> = error("unused")
    override suspend fun deleteEvent(eventId: String): Result<Unit> = error("unused")
    override suspend fun addCurrentUserToEvent(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> = error("unused")
    override suspend fun addPlayerToEvent(
        event: Event,
        player: UserData,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> = error("unused")
    override suspend fun registerChildForEvent(
        eventId: String,
        childUserId: String,
        joinWaitlist: Boolean,
        occurrence: EventOccurrenceSelection?,
    ): Result<ChildRegistrationResult> = error("unused")
    override suspend fun addTeamToEvent(
        event: Event,
        team: com.razumly.mvp.core.data.dataTypes.Team,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> = error("unused")
    override suspend fun syncEventParticipants(
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ): Result<EventParticipantsSyncResult> = error("unused")
    override suspend fun getLeagueDivisionStandings(
        eventId: String,
        divisionId: String,
    ): Result<LeagueDivisionStandings> = error("unused")
    override suspend fun confirmLeagueDivisionStandings(
        eventId: String,
        divisionId: String,
        applyReassignment: Boolean,
    ): Result<LeagueStandingsConfirmResult> = error("unused")
    override suspend fun removeTeamFromEvent(
        event: Event,
        teamWithPlayers: com.razumly.mvp.core.data.dataTypes.TeamWithPlayers,
        refundMode: EventParticipantRefundMode?,
        refundReason: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> = error("unused")
    override suspend fun removeCurrentUserFromEvent(
        event: Event,
        targetUserId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> = error("unused")
}

@Suppress("SameParameterValue")
private fun billingMakeUser(id: String): UserData {
    return UserData(
        firstName = "Test",
        lastName = "User",
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

class BillingRepositoryHttpTest {
    @Test
    fun updateBillingAddress_uses_site_schema_field_names() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/profile/billing-address", request.url.encodedPath)
            assertEquals(HttpMethod.Patch, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "billingAddress": {
                        "line1": "2130 N Q St",
                        "line2": null,
                        "city": "Washougal",
                        "state": "WA",
                        "postalCode": "98671",
                        "countryCode": "US"
                      },
                      "email": "u1@example.test"
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val result = repo.updateBillingAddress(
            BillingAddressDraft(
                line1 = "2130 N Q St",
                city = "Washougal",
                state = "wa",
                postalCode = "98671",
                countryCode = "us",
            ),
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"line1\":\"2130 N Q St\""))
        assertTrue(capturedBody.contains("\"city\":\"Washougal\""))
        assertTrue(capturedBody.contains("\"state\":\"WA\""))
        assertTrue(capturedBody.contains("\"postalCode\":\"98671\""))
        assertTrue(capturedBody.contains("\"countryCode\":\"US\""))
        assertFalse(capturedBody.contains("billingAddressLine1"))
        assertEquals("2130 N Q St", result.billingAddress?.line1)
        assertEquals("WA", result.billingAddress?.state)
        assertEquals("US", result.billingAddress?.countryCode)
    }

    @Test
    fun listBills_gets_and_maps_response() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/billing/bills", request.url.encodedPath)
            assertEquals("ownerType=USER&ownerId=u1&limit=100", request.url.encodedQuery)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "bills": [
                        {
                          "id": "bill_1",
                          "ownerType": "USER",
                          "ownerId": "u1",
                          "totalAmountCents": 22000,
                          "paidAmountCents": 5000,
                          "nextPaymentDue": "2026-03-01T00:00:00.000Z",
                          "nextPaymentAmountCents": 8500,
                          "status": "OPEN",
                          "allowSplit": false
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
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val bills = repo.listBills(ownerType = "USER", ownerId = "u1").getOrThrow()

        assertEquals(1, bills.size)
        assertEquals("bill_1", bills.first().id)
        assertEquals(22000, bills.first().totalAmountCents)
        assertEquals(8500, bills.first().nextPaymentAmountCents)
        assertEquals("OPEN", bills.first().status)
    }

    @Test
    fun listBillsPage_sends_server_offset_and_maps_continuation_metadata() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/billing/bills", request.url.encodedPath)
            assertEquals("ownerType=TEAM&ownerId=team-1&limit=2&offset=100", request.url.encodedQuery)
            assertEquals(HttpMethod.Get, request.method)

            respond(
                content = """
                    {
                      "bills": [
                        {
                          "id": "bill_older_unpaid",
                          "ownerType": "TEAM",
                          "ownerId": "team-1",
                          "totalAmountCents": 9000,
                          "paidAmountCents": 1000,
                          "status": "OPEN"
                        }
                      ],
                      "pagination": {
                        "limit": 2,
                        "offset": 100,
                        "nextOffset": 101,
                        "hasMore": false
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val page = repo.listBillsPage(
            ownerType = "TEAM",
            ownerId = "team-1",
            limit = 2,
            offset = 100,
        ).getOrThrow()

        assertEquals(listOf("bill_older_unpaid"), page.items.map { it.id })
        assertEquals(2, page.pagination.limit)
        assertEquals(100, page.pagination.offset)
        assertEquals(101, page.pagination.nextOffset)
        assertFalse(page.pagination.hasMore)
    }

    @Test
    fun listBillsPage_slices_an_expanded_prefix_when_a_legacy_server_ignores_offset() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        val requestedQueries = mutableListOf<String>()

        val engine = MockEngine { request ->
            assertEquals("/api/billing/bills", request.url.encodedPath)
            requestedQueries += request.url.encodedQuery
            assertEquals(HttpMethod.Get, request.method)

            val bills = if (request.url.parameters["offset"] != null) {
                """
                    {
                      "bills": [
                        {"id":"bill-new","ownerType":"USER","ownerId":"u1","totalAmountCents":1000,"paidAmountCents":0,"status":"OPEN"},
                        {"id":"bill-overlap","ownerType":"USER","ownerId":"u1","totalAmountCents":2000,"paidAmountCents":0,"status":"OPEN"}
                      ]
                    }
                """.trimIndent()
            } else {
                """
                    {
                      "bills": [
                        {"id":"bill-new","ownerType":"USER","ownerId":"u1","totalAmountCents":1000,"paidAmountCents":0,"status":"OPEN"},
                        {"id":"bill-overlap","ownerType":"USER","ownerId":"u1","totalAmountCents":2000,"paidAmountCents":0,"status":"OPEN"},
                        {"id":"bill-older-unpaid","ownerType":"USER","ownerId":"u1","totalAmountCents":3000,"paidAmountCents":0,"status":"OPEN"}
                      ]
                    }
                """.trimIndent()
            }

            respond(
                content = bills,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val page = repo.listBillsPage(
            ownerType = "USER",
            ownerId = "u1",
            limit = 2,
            offset = 2,
        ).getOrThrow()

        assertEquals(
            listOf(
                "ownerType=USER&ownerId=u1&limit=2&offset=2",
                "ownerType=USER&ownerId=u1&limit=4",
            ),
            requestedQueries,
        )
        assertEquals(listOf("bill-older-unpaid"), page.items.map { it.id })
        assertEquals(3, page.pagination.nextOffset)
        assertFalse(page.pagination.hasMore)
    }

    @Test
    fun listOrganizationTemplates_gets_and_maps_response() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/organizations/org_1/templates", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "templates": [
                        {
                          "id": "tmpl_1",
                          "title": "Waiver",
                          "type": "PDF",
                          "requiredSignerType": "participant"
                        },
                        {
                          "${'$'}id": "tmpl_legacy",
                          "title": "Minor Consent",
                          "type": "TEXT",
                          "requiredSignerType": "parent_guardian_and_child"
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
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val templates = repo.listOrganizationTemplates("org_1").getOrThrow()

        assertEquals(2, templates.size)
        assertEquals("tmpl_1", templates[0].id)
        assertEquals("Waiver", templates[0].title)
        assertEquals("PDF", templates[0].type)
        assertEquals("PARTICIPANT", templates[0].requiredSignerType)
        assertEquals("tmpl_legacy", templates[1].id)
        assertEquals("TEXT", templates[1].type)
        assertEquals("PARENT_GUARDIAN_CHILD", templates[1].requiredSignerType)
    }

    @Test
    fun searchOrganizations_gets_query_limited_results() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/organizations", request.url.encodedPath)
            assertEquals("query=indoor%20soccer&limit=8", request.url.encodedQuery)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "organizations": [
                        {
                          "id": "org_1",
                          "name": "Indoor Soccer Arena",
                          "sports": ["Soccer", " Futsal "],
                          "verificationStatus": "VERIFIED",
                          "verifiedAt": "2026-04-13T20:30:00.000Z",
                          "verificationReviewStatus": "RESOLVED"
                        },
                        {
                          "id": "org_2",
                          "name": "Indoor Sports Complex",
                          "hasStripeAccount": true
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
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val organizations = repo.searchOrganizations("indoor soccer", limit = 8).getOrThrow()

        assertEquals(2, organizations.size)
        assertEquals("org_1", organizations[0].id)
        assertEquals("Indoor Soccer Arena", organizations[0].name)
        assertEquals(listOf("Soccer", "Futsal"), organizations[0].sports)
        assertEquals(OrganizationVerificationStatus.VERIFIED, organizations[0].verificationStatus)
        assertEquals("2026-04-13T20:30:00.000Z", organizations[0].verifiedAt)
        assertEquals(OrganizationVerificationReviewStatus.RESOLVED, organizations[0].verificationReviewStatus)
        assertEquals(OrganizationVerificationStatus.LEGACY_CONNECTED, organizations[1].verificationStatus)
    }

    @Test
    fun listOrganizations_can_request_affiliate_rentals_and_maps_facilities() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/organizations", request.url.encodedPath)
            assertEquals("limit=50&offset=0&includeAffiliateRentals=true", request.url.encodedQuery)
            assertEquals(HttpMethod.Get, request.method)

            respond(
                content = """
                    {
                      "organizations": [
                        {
                          "id": "org_affiliate",
                          "name": "Affiliate Rentals",
                          "facilities": [
                            {
                              "id": "facility_1",
                              "name": "Affiliate Indoor Court",
                              "location": "Vancouver, WA",
                              "coordinates": [-122.6615, 45.6387],
                              "status": "ACTIVE",
                              "affiliateUrl": " https://example.com/book "
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
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val organizations = repo.listOrganizations(limit = 50, includeAffiliateRentals = true).getOrThrow()

        val facility = organizations.single().facilities.single()
        assertEquals("facility_1", facility.id)
        assertEquals("Affiliate Indoor Court", facility.name)
        assertEquals(listOf(-122.6615, 45.6387), facility.coordinates)
        assertEquals("ACTIVE", facility.status)
        assertEquals("https://example.com/book", facility.affiliateUrl)
    }

    @Test
    fun listOrganizationsPage_can_request_organization_tag_filters() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/organizations", request.url.encodedPath)
            assertEquals("limit=25&offset=50&tags=facility&tags=club", request.url.encodedQuery)
            assertEquals(HttpMethod.Get, request.method)

            respond(
                content = """
                    {
                      "organizations": [
                        { "id": "org_facility", "name": "Facility Club" }
                      ],
                      "pagination": {
                        "limit": 25,
                        "offset": 50,
                        "nextOffset": 51,
                        "hasMore": false
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val page = repo.listOrganizationsPage(
            limit = 25,
            offset = 50,
            tagSlugs = linkedSetOf("facility", "club"),
        ).getOrThrow()

        assertEquals("org_facility", page.items.single().id)
        assertEquals(51, page.pagination.nextOffset)
        assertEquals(false, page.pagination.hasMore)
    }

    @Test
    fun getOrganizationTags_can_request_filter_only_tag_options() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/organization-tags", request.url.encodedPath)
            assertEquals("query=fac&filterOnly=true", request.url.encodedQuery)
            assertEquals(HttpMethod.Get, request.method)

            respond(
                content = """
                    {
                      "tags": [
                        {
                          "id": "default_org_tag_facility",
                          "name": "Facility",
                          "slug": "facility",
                          "organizationCount": 3
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
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val tags = repo.getOrganizationTags(query = "fac", filterOnly = true).getOrThrow()

        assertEquals(1, tags.size)
        assertEquals("Facility", tags.single().name)
        assertEquals("facility", tags.single().slug)
        assertEquals(3, tags.single().eventCount)
    }

    @Test
    fun getOrganizationsByIds_maps_verification_fallbacks() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/organizations", request.url.encodedPath)
            assertEquals("ids=org_legacy,org_pending&limit=2", request.url.encodedQuery)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "organizations": [
                        {
                          "id": "org_legacy",
                          "name": "Legacy Connected Org",
                          "hasStripeAccount": true
                        },
                        {
                          "id": "org_pending",
                          "name": "Pending Org",
                          "hasStripeAccount": false,
                          "verificationStatus": "PENDING",
                          "verificationReviewStatus": "OPEN",
                          "verificationReviewNotes": "Waiting on payout details",
                          "verificationReviewUpdatedAt": "2026-04-13T21:00:00.000Z"
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
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val organizations = repo.getOrganizationsByIds(listOf("org_legacy", "org_pending")).getOrThrow()

        assertEquals(2, organizations.size)
        assertEquals(OrganizationVerificationStatus.LEGACY_CONNECTED, organizations[0].verificationStatus)
        assertEquals(OrganizationVerificationStatus.PENDING, organizations[1].verificationStatus)
        assertEquals(OrganizationVerificationReviewStatus.OPEN, organizations[1].verificationReviewStatus)
        assertEquals("Waiting on payout details", organizations[1].verificationReviewNotes)
        assertEquals("2026-04-13T21:00:00.000Z", organizations[1].verificationReviewUpdatedAt)
    }

    @Test
    fun product_and_organization_id_queries_fetch_every_requested_id_in_safe_request_chunks() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        val productIds = (1..201).map { index -> "product_$index" }
        val organizationIds = (1..201).map { index -> "organization_$index" }
        val productChunks = mutableListOf<List<String>>()
        val organizationChunks = mutableListOf<List<String>>()

        val engine = MockEngine { request ->
            when (request.url.encodedPath) {
                "/api/products" -> {
                    productChunks += request.url.parameters["ids"].orEmpty().split(',')
                    respond(
                        content = """{"products": []}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                "/api/organizations" -> {
                    val chunk = request.url.parameters["ids"].orEmpty().split(',')
                    organizationChunks += chunk
                    assertEquals(chunk.size.toString(), request.url.parameters["limit"])
                    respond(
                        content = """{"organizations": []}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }

                else -> error("Unexpected request: ${request.url}")
            }
        }
        val repo = BillingRepository(
            MvpApiClient(
                HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } },
                "http://example.test",
                tokenStore,
            ),
            userRepo,
            BillingRepositoryHttp_UnusedEventRepository,
            db,
        )

        assertTrue(repo.getProductsByIds(productIds).getOrThrow().isEmpty())
        assertTrue(repo.getOrganizationsByIds(organizationIds).getOrThrow().isEmpty())
        listOf(productChunks to productIds, organizationChunks to organizationIds).forEach { (chunks, ids) ->
            assertEquals(listOf(100, 100, 1), chunks.map(List<String>::size))
            assertEquals(ids, chunks.flatten())
        }
    }

    @Test
    fun getOrganizationsByIds_singleOrganization_maps_staff_permissions() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/organizations/org_1", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "id": "org_1",
                      "name": "Indoor Soccer Arena",
                      "ownerId": "owner_1",
                      "publicSlug": "indoor-soccer-arena",
                      "publicPageEnabled": true,
                      "staffMembers": [
                        {
                          "id": "staff_host",
                          "organizationId": "org_1",
                          "userId": "host_staff_1",
                          "types": ["HOST"]
                        },
                        {
                          "id": "staff_official",
                          "organizationId": "org_1",
                          "userId": "official_staff_1",
                          "types": ["OFFICIAL"]
                        },
                        {
                          "id": "staff_blocked",
                          "organizationId": "org_1",
                          "userId": "blocked_host_1",
                          "types": ["HOST"]
                        }
                      ],
                      "staffInvites": [
                        {
                          "type": "STAFF",
                          "email": "blocked@example.test",
                          "status": "PENDING",
                          "organizationId": "org_1",
                          "userId": "blocked_host_1"
                        }
                      ],
                      "staffEmailsByUserId": {
                        "host_staff_1": "host@example.test"
                      },
                      "viewerPermissions": ["events.manage"]
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val organization = repo.getOrganizationsByIds(listOf("org_1")).getOrThrow().single()

        assertEquals(listOf("owner_1", "host_staff_1"), organization.activeHostIds())
        assertEquals(listOf("official_staff_1"), organization.activeOfficialIds())
        assertEquals("indoor-soccer-arena", organization.publicSlug)
        assertTrue(organization.publicPageEnabled)
        assertEquals("host@example.test", organization.staffEmailsByUserId["host_staff_1"])
        assertTrue(organization.canManageEventsForViewer("viewer_with_permission"))
        assertFalse(organization.activeHostIds().contains("blocked_host_1"))
    }

    @Test
    fun createBillingIntent_posts_and_parses_response() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/billing/create_billing_intent", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "paymentIntent": "pi_bill_secret_123",
                      "publishableKey": "pk_test_123",
                      "feeBreakdown": {
                        "eventPrice": 4500,
                        "stripeFee": 170,
                        "processingFee": 45,
                        "totalCharge": 4715,
                        "hostReceives": 4500,
                        "feePercentage": 1
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val intent = repo.createBillingIntent(billId = "bill_1", billPaymentId = "bp_1").getOrThrow()

        assertEquals("pi_bill_secret_123", intent.paymentIntent)
        assertEquals("pk_test_123", intent.publishableKey)
        assertEquals(4500, intent.feeBreakdown?.eventPrice)
        assertEquals(4715, intent.feeBreakdown?.totalCharge)
    }

    @Test
    fun createEventTeamPaymentCheckout_posts_and_parses_response() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/event_1/teams/team_1/billing/checkout", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "checkoutUrl": "https://checkout.stripe.com/c/pay/session_1",
                      "qrCodeUrl": "https://example.test/api/billing/checkout-qr?url=session_1",
                      "amountCents": 4715,
                      "eventAmountCents": 4500,
                      "billOwnerType": "TEAM",
                      "billOwnerId": "team_1",
                      "payerUserId": "manager_1",
                      "checkoutSessionId": "cs_test_1",
                      "feeBreakdown": {
                        "eventPrice": 4500,
                        "stripeFee": 170,
                        "processingFee": 45,
                        "totalCharge": 4715,
                        "hostReceives": 4500,
                        "feePercentage": 1,
                        "purchaseType": "event_payment"
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val checkout = repo.createEventTeamPaymentCheckout(
            eventId = "event_1",
            teamId = "team_1",
            request = EventTeamPaymentCheckoutRequest(
                ownerType = "team",
                ownerId = "team_1",
                eventAmountCents = 4500,
                divisionId = "open",
                label = "Event registration • Open",
            ),
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"ownerType\":\"TEAM\""))
        assertTrue(capturedBody.contains("\"ownerId\":\"team_1\""))
        assertTrue(capturedBody.contains("\"eventAmountCents\":4500"))
        assertTrue(capturedBody.contains("\"taxAmountCents\":0"))
        assertTrue(capturedBody.contains("\"divisionId\":\"open\""))
        assertEquals("https://checkout.stripe.com/c/pay/session_1", checkout.checkoutUrl)
        assertEquals("https://example.test/api/billing/checkout-qr?url=session_1", checkout.qrCodeUrl)
        assertEquals(4715, checkout.amountCents)
        assertEquals("TEAM", checkout.billOwnerType)
        assertEquals("team_1", checkout.billOwnerId)
        assertEquals("manager_1", checkout.payerUserId)
        assertEquals("event_payment", checkout.feeBreakdown?.purchaseType)
    }

    @Test
    fun createBill_posts_and_parses_response() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/billing/bills", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "bill": {
                        "id": "bill_1",
                        "ownerType": "USER",
                        "ownerId": "u1",
                        "eventId": "event_1",
                        "organizationId": "org_1",
                        "totalAmountCents": 4500,
                        "paidAmountCents": 0,
                        "status": "OPEN",
                        "paymentPlanEnabled": true,
                        "allowSplit": false,
                        "createdBy": "u1"
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val bill = repo.createBill(
            CreateBillRequest(
                ownerType = "user",
                ownerId = "u1",
                totalAmountCents = 4500,
                eventId = "event_1",
                organizationId = "org_1",
                installmentAmounts = listOf(1500, 1500, 1500),
                installmentDueDates = listOf("2026-08-01", "2026-09-01", "2026-10-01"),
                paymentPlanEnabled = true,
            )
        ).getOrThrow()

        assertEquals("bill_1", bill.id)
        assertEquals("USER", bill.ownerType)
        assertEquals("u1", bill.ownerId)
        assertEquals(4500, bill.totalAmountCents)
        assertTrue(capturedBody.contains("\"ownerType\":\"USER\""))
        assertTrue(capturedBody.contains("\"paymentPlanEnabled\":true"))
        assertTrue(capturedBody.contains("\"installmentAmounts\":[1500,1500,1500]"))
    }

    @Test
    fun createBill_posts_weekly_occurrence_relative_installments() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/billing/bills", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "bill": {
                        "id": "bill_weekly_1",
                        "ownerType": "USER",
                        "ownerId": "u1",
                        "eventId": "weekly_event_1",
                        "organizationId": "org_1",
                        "totalAmountCents": 4500,
                        "paidAmountCents": 0,
                        "status": "OPEN",
                        "paymentPlanEnabled": true,
                        "allowSplit": false,
                        "createdBy": "u1"
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        repo.createBill(
            CreateBillRequest(
                ownerType = "user",
                ownerId = "u1",
                totalAmountCents = 4500,
                eventId = "weekly_event_1",
                slotId = "slot_1",
                occurrenceDate = "2026-08-03",
                organizationId = "org_1",
                installmentAmounts = listOf(1500, 1500, 1500),
                installmentDueRelativeDays = listOf(0, 7, 14),
                paymentPlanEnabled = true,
            )
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"slotId\":\"slot_1\""))
        assertTrue(capturedBody.contains("\"occurrenceDate\":\"2026-08-03\""))
        assertTrue(capturedBody.contains("\"installmentDueRelativeDays\":[0,7,14]"))
        assertFalse(capturedBody.contains("\"installmentDueDates\""))
    }

    @Test
    fun listSubscriptions_returns_empty_for_successful_empty_response() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        val requestedUrls = mutableListOf<String>()

        val engine = MockEngine { request ->
            val encodedQuery = request.url.encodedQuery
            requestedUrls += if (encodedQuery.isBlank()) {
                request.url.encodedPath
            } else {
                "${request.url.encodedPath}?$encodedQuery"
            }
            respond(
                content = """{"subscriptions":[]}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val result = repo.listSubscriptions(userId = "u1")

        assertTrue(result.isSuccess)
        assertTrue(result.getOrThrow().isEmpty())
        assertEquals(
            listOf(
                "/api/subscriptions?userId=u1&limit=100",
            ),
            requestedUrls,
        )
    }

    @Test
    fun listSubscriptions_surfaces_contract_failure_without_legacy_fallback() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        val requestedUrls = mutableListOf<String>()

        val engine = MockEngine { request ->
            val encodedQuery = request.url.encodedQuery
            requestedUrls += if (encodedQuery.isBlank()) {
                request.url.encodedPath
            } else {
                "${request.url.encodedPath}?$encodedQuery"
            }
            respond(
                content = """{"error":"Not found"}""",
                status = HttpStatusCode.NotFound,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = billingRepositoryHttpProductionClient(engine)
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val result = repo.listSubscriptions(userId = "u1")

        assertTrue(result.isFailure)
        assertEquals(listOf("/api/subscriptions?userId=u1&limit=100"), requestedUrls)
    }

    @Test
    fun listSubscriptions_surfaces_network_failure_without_legacy_fallback() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        val requestedUrls = mutableListOf<String>()

        val engine = MockEngine { request ->
            val encodedQuery = request.url.encodedQuery
            requestedUrls += if (encodedQuery.isBlank()) {
                request.url.encodedPath
            } else {
                "${request.url.encodedPath}?$encodedQuery"
            }
            throw IllegalStateException("Network unavailable")
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val result = repo.listSubscriptions(userId = "u1")

        assertTrue(result.isFailure)
        assertEquals(listOf("/api/subscriptions?userId=u1&limit=100"), requestedUrls)
    }

    @Test
    fun createPurchaseIntent_posts_and_parses_response() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/billing/purchase-intent", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "paymentIntent": "pi_123_secret_abc",
                      "publishableKey": "pk_test_123",
                      "requiresSignature": true,
                      "documentSigningUrl": "https://app.boldsign.com/sign/abc123",
                      "documentSigned": false,
                      "feeBreakdown": {
                        "eventPrice": 1000,
                        "stripeFee": 40,
                        "processingFee": 30,
                        "totalCharge": 1070,
                        "hostReceives": 1000,
                        "feePercentage": 1
                      }
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val event = Event(id = "e1", hostId = "h1", priceCents = 1000, eventType = EventType.EVENT)
        val intent = repo.createPurchaseIntent(event, priceCents = 1000).getOrThrow()

        assertEquals("pi_123_secret_abc", intent.paymentIntent)
        assertEquals("pk_test_123", intent.publishableKey)
        assertEquals("https://app.boldsign.com/sign/abc123", intent.resolvedSigningUrl())
        assertTrue(intent.isSignatureRequired())
        assertFalse(intent.isSignatureCompleted())
        assertEquals(1000, intent.feeBreakdown?.eventPrice)
        assertEquals(1070, intent.feeBreakdown?.totalCharge)
    }

    @Test
    fun previewEventRegistrationDiscount_posts_and_parses_amounts() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/billing/discount-preview", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "code": "SAVE10",
                      "applied": true,
                      "originalAmountCents": 2500,
                      "discountAmountCents": 1000,
                      "discountedAmountCents": 1500
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val event = Event(id = "e1", hostId = "h1", priceCents = 2500, eventType = EventType.EVENT)
        val preview = repo.previewEventRegistrationDiscount(
            event = event,
            teamId = "team_1",
            priceCents = 2500,
            occurrence = EventOccurrenceSelection(slotId = "slot_1", occurrenceDate = "2026-07-04"),
            divisionId = "division_1",
            discountCode = " save10 ",
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"discountCode\":\"save10\""))
        assertTrue(capturedBody.contains("\"team\":{\"id\":\"team_1\""))
        assertTrue(capturedBody.contains("\"divisionId\":\"division_1\""))
        assertTrue(capturedBody.contains("\"slotId\":\"slot_1\""))
        assertEquals("SAVE10", preview.code)
        assertTrue(preview.applied)
        assertEquals(2500, preview.originalAmountCents)
        assertEquals(1000, preview.discountAmountCents)
        assertEquals(1500, preview.discountedAmountCents)
    }

    @Test
    fun createPurchaseIntent_with_teamId_includes_team_reference() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/billing/purchase-intent", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "paymentIntent": "pi_123_secret_team",
                      "publishableKey": "pk_test_123"
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val event = Event(id = "e1", hostId = "h1", priceCents = 1000, eventType = EventType.EVENT)
        repo.createPurchaseIntent(
            event = event,
            teamId = "team_123",
            priceCents = 1000,
            divisionId = "division_a",
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"team\""))
        assertTrue(capturedBody.contains("\"id\":\"team_123\""))
        assertTrue(capturedBody.contains("\"divisionId\":\"division_a\""))
    }

    @Test
    fun createTeamRegistrationPurchaseIntent_posts_team_registration_payload() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/billing/purchase-intent", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "paymentIntent": "pi_team_registration",
                      "publishableKey": "pk_test_123"
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val team = Team(captainId = "u1").copy(
            id = "team_123",
            name = "Open Team",
            openRegistration = true,
            registrationPriceCents = 2500,
        )
        val teamRegistration = TeamPlayerRegistration(
            id = "team_registration_1",
            teamId = team.id,
            userId = "u1",
            registrantId = "u1",
            parentId = "parent_1",
            registrantType = "CHILD",
            rosterRole = "PARTICIPANT",
            status = "STARTED",
            consentDocumentId = "consent_doc_1",
            consentStatus = "completed",
        )
        val intent = repo.createTeamRegistrationPurchaseIntent(team, teamRegistration).getOrThrow()

        assertEquals("pi_team_registration", intent.paymentIntent)
        assertTrue(capturedBody.contains("\"purchaseType\":\"team_registration\""))
        assertTrue(capturedBody.contains("\"teamRegistration\""))
        assertTrue(capturedBody.contains("\"teamId\":\"team_123\""))
        assertTrue(capturedBody.contains("\"registrantId\":\"u1\""))
        assertTrue(capturedBody.contains("\"parentId\":\"parent_1\""))
        assertTrue(capturedBody.contains("\"registrantType\":\"CHILD\""))
        assertTrue(capturedBody.contains("\"rosterRole\":\"PARTICIPANT\""))
        assertTrue(capturedBody.contains("\"consentDocumentId\":\"consent_doc_1\""))
        assertTrue(capturedBody.contains("\"consentStatus\":\"completed\""))
        assertTrue(capturedBody.contains("\"team\""))
        assertTrue(capturedBody.contains("\"id\":\"team_123\""))
    }

    @Test
    fun getRequiredTeamSignLinks_posts_team_sign_request() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/teams/team_1/sign", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "signLinks": [
                        {
                          "templateId": "template_1",
                          "type": "TEXT",
                          "title": "Team waiver",
                          "documentId": "doc_1"
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
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val links = repo.getRequiredTeamSignLinks(
            teamId = "team_1",
            signerContext = SignerContext.PARENT_GUARDIAN,
            childUserId = "child_1",
            childUserEmail = "child@example.test",
        ).getOrThrow()

        assertEquals(1, links.size)
        assertTrue(capturedBody.contains("\"signerContext\":\"parent_guardian\""))
        assertTrue(capturedBody.contains("\"childUserId\":\"child_1\""))
        assertTrue(capturedBody.contains("\"childEmail\":\"child@example.test\""))
    }

    @Test
    fun createPurchaseIntent_with_timeSlotContext_includes_host_required_templates() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/billing/purchase-intent", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "paymentIntent": "pi_123_secret_rental",
                      "publishableKey": "pk_test_123"
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val event = Event(id = "event_rental_1", hostId = "h1", priceCents = 3500, eventType = EventType.EVENT)
        repo.createPurchaseIntent(
            event = event,
            timeSlotContext = PurchaseIntentTimeSlotContext(
                id = "slot_1",
                priceCents = 3500,
                startDate = "2026-04-01T10:00:00Z",
                endDate = "2026-04-01T12:00:00Z",
                scheduledFieldIds = listOf(" field_1 ", "", "field_1", "field_2"),
                hostRequiredTemplateIds = listOf(" host_a ", "", "host_a", "host_b"),
            ),
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"timeSlot\""))
        assertTrue(capturedBody.contains("\"id\":\"slot_1\""))
        assertTrue(capturedBody.contains("\"price\":3500"))
        assertTrue(capturedBody.contains("\"scheduledFieldId\":\"field_1\""))
        assertTrue(capturedBody.contains("\"scheduledFieldIds\":[\"field_1\",\"field_2\"]"))
        assertTrue(capturedBody.contains("\"hostRequiredTemplateIds\":[\"host_a\",\"host_b\"]"))
    }

    @Test
    fun createRentalOrder_posts_public_slug_payload_and_parses_response() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/public/organizations/summit-sports/rental-orders", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "bookingId": "booking_1",
                      "billId": "bill_1",
                      "totalCents": 27500,
                      "items": [
                        {
                          "id": "booking_1__item_1",
                          "fieldId": "field_1",
                          "start": "2026-06-22T12:00:00Z",
                          "end": "2026-06-22T13:00:00Z"
                        }
                      ],
                      "createEventUrl": "/events/booking_1/schedule?create=1&rentalBookingId=booking_1"
                    }
                """.trimIndent(),
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val result = repo.createRentalOrder(
            publicSlug = " summit-sports ",
            eventId = "booking_1",
            selections = listOf(
                RentalOrderSelectionRequest(
                    key = " selection_1 ",
                    scheduledFieldIds = listOf(" field_1 ", "field_1"),
                    dayOfWeek = 0,
                    daysOfWeek = listOf(0),
                    startTimeMinutes = 12 * 60,
                    endTimeMinutes = 13 * 60,
                    startDate = "2026-06-22T12:00:00Z",
                    endDate = "2026-06-22T13:00:00Z",
                    timeZone = "UTC",
                ),
            ),
            paymentIntentId = "pi_rental_1",
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"eventId\":\"booking_1\""))
        assertTrue(capturedBody.contains("\"scheduledFieldIds\":[\"field_1\"]"))
        assertTrue(capturedBody.contains("\"paymentIntentId\":\"pi_rental_1\""))
        assertEquals("booking_1", result.bookingId)
        assertEquals("bill_1", result.billId)
        assertEquals(27500, result.totalCents)
        assertEquals("booking_1__item_1", result.items.single().id)
    }

    @Test
    fun createRentalOrder_keeps_paid_booking_for_retry_after_server_failure() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val pendingDao = BillingRepositoryHttp_FakePendingRentalOrderDao()
        val db = BillingRepositoryHttp_FakeDatabaseService(pendingRentalOrderDao = pendingDao)
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        var requests = 0
        val engine = MockEngine { _ ->
            requests += 1
            if (requests == 1) {
                respond(
                    content = "{\"error\":\"temporary outage\"}",
                    status = HttpStatusCode.ServiceUnavailable,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            } else {
                respond(
                    content = "{\"bookingId\":\"booking_retry\",\"totalCents\":1200}",
                    status = HttpStatusCode.Created,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            }
        }
        val http = billingRepositoryHttpProductionClient(engine)
        val repo = BillingRepository(
            MvpApiClient(http, "http://example.test", tokenStore),
            userRepo,
            BillingRepositoryHttp_UnusedEventRepository,
            db,
        )
        val selections = listOf(
            RentalOrderSelectionRequest(
                scheduledFieldIds = listOf("field_1"),
                startDate = "2026-06-22T12:00:00Z",
                endDate = "2026-06-22T13:00:00Z",
            ),
        )

        assertTrue(
            repo.createRentalOrder(
                publicSlug = "summit-sports",
                eventId = "booking_retry",
                selections = selections,
                paymentIntentId = "pi_retry",
            ).isFailure,
        )
        assertEquals(1, pendingDao.storedOrders.size)
        assertEquals("pi_retry", pendingDao.storedOrders.single().paymentIntentId)

        assertEquals(1, repo.syncPendingRentalOrders().getOrThrow())
        assertTrue(pendingDao.storedOrders.isEmpty())
        assertEquals(2, requests)
    }

    @Test
    fun preparedRentalOrder_survives_payment_callback_crash_and_waits_for_payment_confirmation() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val pendingDao = BillingRepositoryHttp_FakePendingRentalOrderDao()
        val db = BillingRepositoryHttp_FakeDatabaseService(pendingRentalOrderDao = pendingDao)
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("payer_a"),
            currentAccount = AuthAccount(id = "payer_a", email = "payer@example.test", name = "Payer A"),
        )
        var requests = 0
        val engine = MockEngine { _ ->
            requests += 1
            if (requests == 1) {
                respond(
                    content = "{\"error\":\"Payment has not completed yet.\"}",
                    status = HttpStatusCode.PaymentRequired,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            } else {
                respond(
                    content = "{\"bookingId\":\"booking_crash\",\"totalCents\":1200}",
                    status = HttpStatusCode.Created,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            }
        }
        val repo = BillingRepository(
            MvpApiClient(billingRepositoryHttpProductionClient(engine), "http://example.test", tokenStore),
            userRepo,
            BillingRepositoryHttp_UnusedEventRepository,
            db,
        )
        val selections = listOf(
            RentalOrderSelectionRequest(
                scheduledFieldIds = listOf("field_1"),
                startDate = "2026-06-22T12:00:00Z",
                endDate = "2026-06-22T13:00:00Z",
            ),
        )

        val orderId = repo.prepareRentalOrder(
            publicSlug = "summit-sports",
            eventId = "booking_crash",
            selections = selections,
            paymentIntentId = "pi_crash",
            payerUserId = "payer_a",
        ).getOrThrow()
        assertEquals("booking_crash:pi_crash", orderId)
        assertEquals(PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT, pendingDao.storedOrders.single().status)

        assertEquals(0, repo.syncPendingRentalOrders().getOrThrow())
        assertEquals(PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT, pendingDao.storedOrders.single().status)
        assertEquals(0, pendingDao.storedOrders.single().attemptCount)

        assertEquals(1, repo.syncPendingRentalOrders().getOrThrow())
        assertTrue(pendingDao.storedOrders.isEmpty())
        assertEquals(2, requests)
    }

    @Test
    fun pendingRentalOrder_is_not_replayed_by_a_different_signed_in_user() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val pendingDao = BillingRepositoryHttp_FakePendingRentalOrderDao()
        val db = BillingRepositoryHttp_FakeDatabaseService(pendingRentalOrderDao = pendingDao)
        var requests = 0
        val engine = MockEngine { _ ->
            requests += 1
            respond(
                content = "{\"bookingId\":\"booking_owner\",\"totalCents\":1200}",
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }, "http://example.test", tokenStore)
        val payerRepository = BillingRepository(
            api,
            BillingRepositoryHttp_FakeUserRepository(
                currentUser = billingMakeUser("payer_a"),
                currentAccount = AuthAccount(id = "payer_a", email = "payer@example.test", name = "Payer A"),
            ),
            BillingRepositoryHttp_UnusedEventRepository,
            db,
        )
        val otherUserRepository = BillingRepository(
            api,
            BillingRepositoryHttp_FakeUserRepository(
                currentUser = billingMakeUser("payer_b"),
                currentAccount = AuthAccount(id = "payer_b", email = "other@example.test", name = "Payer B"),
            ),
            BillingRepositoryHttp_UnusedEventRepository,
            db,
        )
        val selections = listOf(
            RentalOrderSelectionRequest(
                scheduledFieldIds = listOf("field_1"),
                startDate = "2026-06-22T12:00:00Z",
                endDate = "2026-06-22T13:00:00Z",
            ),
        )

        payerRepository.prepareRentalOrder(
            publicSlug = "summit-sports",
            eventId = "booking_owner",
            selections = selections,
            paymentIntentId = "pi_owner",
            payerUserId = "payer_a",
        ).getOrThrow()

        assertEquals(0, otherUserRepository.syncPendingRentalOrders().getOrThrow())
        assertEquals(0, requests)
        assertEquals("payer_a", pendingDao.storedOrders.single().payerUserId)

        assertEquals(1, payerRepository.syncPendingRentalOrders().getOrThrow())
        assertEquals(1, requests)
        assertTrue(pendingDao.storedOrders.isEmpty())
    }

    @Test
    fun rentalCompletion_never_submits_a_prepared_order_after_the_active_account_changes() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val pendingDao = BillingRepositoryHttp_FakePendingRentalOrderDao()
        val db = BillingRepositoryHttp_FakeDatabaseService(pendingRentalOrderDao = pendingDao)
        var requests = 0
        val engine = MockEngine { _ ->
            requests += 1
            respond(
                content = "{\"bookingId\":\"unexpected\",\"totalCents\":1200}",
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val api = MvpApiClient(HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }, "http://example.test", tokenStore)
        val payerRepository = BillingRepository(
            api,
            BillingRepositoryHttp_FakeUserRepository(
                currentUser = billingMakeUser("payer_a"),
                currentAccount = AuthAccount(id = "payer_a", email = "payer@example.test", name = "Payer A"),
            ),
            BillingRepositoryHttp_UnusedEventRepository,
            db,
        )
        val switchedAccountRepository = BillingRepository(
            api,
            BillingRepositoryHttp_FakeUserRepository(
                currentUser = billingMakeUser("payer_b"),
                currentAccount = AuthAccount(id = "payer_b", email = "other@example.test", name = "Payer B"),
            ),
            BillingRepositoryHttp_UnusedEventRepository,
            db,
        )
        val selections = listOf(
            RentalOrderSelectionRequest(
                scheduledFieldIds = listOf("field_1"),
                startDate = "2026-06-22T12:00:00Z",
                endDate = "2026-06-22T13:00:00Z",
            ),
        )

        payerRepository.prepareRentalOrder(
            publicSlug = "summit-sports",
            eventId = "booking_account_change",
            selections = selections,
            paymentIntentId = "pi_account_change",
            payerUserId = "payer_a",
        ).getOrThrow()

        val result = switchedAccountRepository.createRentalOrder(
            publicSlug = "summit-sports",
            eventId = "booking_account_change",
            selections = selections,
            paymentIntentId = "pi_account_change",
            payerUserId = "payer_a",
        )

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is RentalOrderPayerMismatchException)
        assertEquals(0, requests)
        assertEquals(PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT, pendingDao.storedOrders.single().status)
        assertEquals("payer_a", pendingDao.storedOrders.single().payerUserId)
    }

    @Test
    fun createRentalOrder_marks_terminal_paid_booking_failure_without_replaying_it() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val pendingDao = BillingRepositoryHttp_FakePendingRentalOrderDao()
        val db = BillingRepositoryHttp_FakeDatabaseService(pendingRentalOrderDao = pendingDao)
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        var requests = 0
        val engine = MockEngine { _ ->
            requests += 1
            respond(
                content = "{\"error\":\"The rental slot is no longer available.\"}",
                status = HttpStatusCode.Conflict,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = billingRepositoryHttpProductionClient(engine)
        val repo = BillingRepository(
            MvpApiClient(http, "http://example.test", tokenStore),
            userRepo,
            BillingRepositoryHttp_UnusedEventRepository,
            db,
        )
        val selections = listOf(
            RentalOrderSelectionRequest(
                scheduledFieldIds = listOf("field_1"),
                startDate = "2026-06-22T12:00:00Z",
                endDate = "2026-06-22T13:00:00Z",
            ),
        )

        val result = repo.createRentalOrder(
            publicSlug = "summit-sports",
            eventId = "booking_terminal",
            selections = selections,
            paymentIntentId = "pi_terminal",
        )

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is RentalOrderTerminalFailureException)
        assertEquals(PENDING_RENTAL_ORDER_STATUS_REJECTED, pendingDao.storedOrders.single().status)
        assertEquals(0, repo.syncPendingRentalOrders().getOrThrow())
        assertEquals(1, requests)
    }

    @Test
    fun listRentalResourceOptions_uses_item_facility_when_field_facility_is_missing() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/rentals/bookings", request.url.encodedPath)
            assertEquals("", request.url.encodedQuery)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "bookings": [
                        {
                          "id": "booking_1",
                          "organizationId": "owner_org",
                          "organization": {
                            "id": "owner_org",
                            "name": "Example Clubhouse"
                          },
                          "items": [
                            {
                              "id": "item_1",
                              "facilityId": "facility_1",
                              "facility": {
                                "id": "facility_1",
                                "name": "Example Clubhouse",
                                "address": "800 Waterfront Way"
                              },
                              "fieldId": "field_1",
                              "start": "2026-06-24T22:00:00Z",
                              "end": "2026-06-25T00:00:00Z",
                              "timeZone": "America/Los_Angeles",
                              "field": {
                                "id": "field_1",
                                "organizationId": "owner_org",
                                "name": "Example Clubhouse - Court 1"
                              }
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
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val option = repo.listRentalResourceOptions().getOrThrow().single()

        assertEquals("booking_1:item_1", option.id)
        assertEquals("field_1", option.field.id)
        assertEquals("facility_1", option.field.facilityId)
        assertEquals("Example Clubhouse", option.field.facility?.name)
        assertEquals("800 Waterfront Way", option.field.facility?.address)
    }

    @Test
    fun getRequiredSignLinks_posts_and_parses_response() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/event_1/sign", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """
                    {
                      "signLinks": [
                        {
                          "templateId": "tpl_text",
                          "type": "TEXT",
                          "title": "Waiver",
                          "content": "Please acknowledge this waiver.",
                          "signOnce": true
                        },
                        {
                          "templateId": "tpl_boldsign",
                          "type": "BOLDSIGN",
                          "url": "https://app.boldsign.com/sign/doc_123",
                          "documentId": "doc_123"
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
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val signLinks = repo.getRequiredSignLinks("event_1").getOrThrow()

        assertEquals(2, signLinks.size)
        assertEquals("tpl_text", signLinks[0].templateId)
        assertTrue(signLinks[0].isTextStep())
        assertEquals("https://app.boldsign.com/sign/doc_123", signLinks[1].resolvedSigningUrl())
        assertEquals("doc_123", signLinks[1].resolvedDocumentId())
        assertTrue(capturedBody.contains("\"redirectUrl\":\"https://bracket-iq.com/events/event_1\""))
    }

    @Test
    fun getRequiredSignLinks_with_signer_context_includes_child_fields() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/events/event_1/sign", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """{"signLinks": []}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        repo.getRequiredSignLinks(
            eventId = "event_1",
            signerContext = SignerContext.PARENT_GUARDIAN,
            childUserId = "child_1",
            childUserEmail = "child@example.test",
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"signerContext\":\"parent_guardian\""))
        assertTrue(capturedBody.contains("\"childUserId\":\"child_1\""))
        assertTrue(capturedBody.contains("\"childEmail\":\"child@example.test\""))
        assertTrue(capturedBody.contains("\"redirectUrl\":\"https://bracket-iq.com/events/event_1\""))
    }

    @Test
    fun getRequiredSignLinks_rate_limited_returns_friendly_message() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/events/event_1/sign", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """{"error":"BoldSign API request failed (429)"}""",
                status = HttpStatusCode.BadRequest,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val result = repo.getRequiredSignLinks("event_1")
        assertTrue(result.isFailure)
        assertEquals(
            "You opened the BoldSign document too many times. Please wait a minute before trying again.",
            result.exceptionOrNull()?.message,
        )
    }

    @Test
    fun pollBoldSignOperation_rate_limited_returns_friendly_message() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/boldsign/operations/op_1", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "operationId": "op_1",
                      "status": "FAILED_RETRYABLE",
                      "error": "BoldSign API request failed (429)"
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val result = repo.pollBoldSignOperation("op_1", timeoutMillis = 1_000, intervalMillis = 500)
        assertTrue(result.isFailure)
        assertEquals(
            "You opened the BoldSign document too many times. Please wait a minute before trying again.",
            result.exceptionOrNull()?.message,
        )
    }

    @Test
    fun listProfileDocuments_gets_and_maps_response() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/profile/documents", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """
                    {
                      "unsigned": [
                        {
                          "id": "event_1:tpl_pdf:parent_guardian:child_1",
                          "status": "UNSIGNED",
                          "eventId": "event_1",
                          "eventName": "Spring League",
                          "organizationId": "org_1",
                          "organizationName": "City League",
                          "templateId": "tpl_pdf",
                          "title": "Parent Consent",
                          "type": "PDF",
                          "requiredSignerType": "PARENT_GUARDIAN",
                          "requiredSignerLabel": "Parent/Guardian",
                          "signerContext": "parent_guardian",
                          "signerContextLabel": "Parent/Guardian",
                          "childUserId": "child_1",
                          "childEmail": "child@example.test"
                        }
                      ],
                      "signed": [
                        {
                          "id": "signed_1",
                          "status": "SIGNED",
                          "eventId": "event_1",
                          "eventName": "Spring League",
                          "organizationId": "org_1",
                          "organizationName": "City League",
                          "templateId": "tpl_text",
                          "title": "Code of Conduct",
                          "type": "TEXT",
                          "requiredSignerType": "PARTICIPANT",
                          "requiredSignerLabel": "Participant",
                          "signerContext": "participant",
                          "signerContextLabel": "Participant",
                          "signedAt": "2026-02-15T12:30:00.000Z",
                          "signedDocumentRecordId": "signed_1",
                          "content": "I agree."
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
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val documents = repo.listProfileDocuments().getOrThrow()

        assertEquals(1, documents.unsigned.size)
        assertEquals(1, documents.signed.size)

        val unsigned = documents.unsigned.first()
        assertEquals(ProfileDocumentStatus.UNSIGNED, unsigned.status)
        assertEquals(ProfileDocumentType.PDF, unsigned.type)
        assertEquals(SignerContext.PARENT_GUARDIAN, unsigned.signerContext)
        assertEquals("child_1", unsigned.childUserId)

        val signed = documents.signed.first()
        assertEquals(ProfileDocumentStatus.SIGNED, signed.status)
        assertEquals(ProfileDocumentType.TEXT, signed.type)
        assertEquals(SignerContext.PARTICIPANT, signed.signerContext)
        assertEquals("I agree.", signed.content)
    }

    @Test
    fun recordSignature_posts_expected_payload() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()

        val engine = MockEngine { request ->
            assertEquals("/api/documents/record-signature", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])

            respond(
                content = """{"ok": true}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        repo.recordSignature(
            eventId = "event_1",
            templateId = "tpl_1",
            documentId = "doc_1",
            type = "TEXT",
        ).getOrThrow()
    }

    @Test
    fun recordTeamSignature_posts_expected_payload() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/documents/record-signature", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """{"ok": true}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        repo.recordTeamSignature(
            teamId = "team_1",
            templateId = "tpl_1",
            documentId = "doc_1",
            type = "TEXT",
            signerContext = SignerContext.CHILD,
            childUserId = "child_1",
        ).getOrThrow()

        assertTrue(capturedBody.contains("\"teamId\":\"team_1\""))
        assertTrue(capturedBody.contains("\"templateId\":\"tpl_1\""))
        assertTrue(capturedBody.contains("\"documentId\":\"doc_1\""))
        assertTrue(capturedBody.contains("\"signerContext\":\"child\""))
        assertTrue(capturedBody.contains("\"childUserId\":\"child_1\""))
    }

    @Test
    fun createAccount_posts_redirect_urls_from_stripe_redirect_base() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/billing/host/connect", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """{"onboardingUrl":"https://stripe.example/onboarding"}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val onboardingUrl = repo.createAccount().getOrThrow()
        assertEquals("https://stripe.example/onboarding", onboardingUrl)
        assertTrue(capturedBody.contains("\"refreshUrl\":\"$stripeRedirectBaseUrl\""))
        assertTrue(capturedBody.contains("\"returnUrl\":\"$stripeRedirectBaseUrl\""))
    }

    @Test
    fun getOnboardingLink_posts_redirect_urls_from_stripe_redirect_base() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""

        val engine = MockEngine { request ->
            assertEquals("/api/billing/host/onboarding-link", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer t123", request.headers[HttpHeaders.Authorization])
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)
                ?.bytes()
                ?.decodeToString()
                .orEmpty()

            respond(
                content = """{"onboardingUrl":"https://stripe.example/onboarding-link"}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }

        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val repo = BillingRepository(api, userRepo, BillingRepositoryHttp_UnusedEventRepository, db)

        val onboardingUrl = repo.getOnboardingLink().getOrThrow()
        assertEquals("https://stripe.example/onboarding-link", onboardingUrl)
        assertTrue(capturedBody.contains("\"refreshUrl\":\"$stripeRedirectBaseUrl\""))
        assertTrue(capturedBody.contains("\"returnUrl\":\"$stripeRedirectBaseUrl\""))
    }

    @Test
    fun getRefundsWithRelations_batches_related_user_and_event_hydration() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val requestedUserIds = mutableListOf<List<String>>()
        val requestedEventIds = mutableListOf<List<String>>()
        val refundDao = BillingRepositoryHttp_FakeRefundRequestDao()
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("host_1"),
            currentAccount = AuthAccount(id = "host_1", email = "host_1@example.test", name = "Host User"),
            getUsersHandler = { userIds ->
                requestedUserIds += userIds
                Result.success(emptyList())
            },
        )
        val eventRepo = BillingRepositoryHttp_FakeEventRepository(
            getEventsByIdsHandler = { eventIds ->
                requestedEventIds += eventIds
                Result.success(emptyList())
            },
        )
        val db = BillingRepositoryHttp_FakeDatabaseService(refundDao)

        val engine = MockEngine { request ->
            assertEquals("/api/refund-requests", request.url.encodedPath)
            assertEquals("hostId=host_1&limit=200", request.url.encodedQuery)
            respond(
                content = """
                    {
                      "refunds": [
                        {
                          "id": "refund_1",
                          "eventId": "event_1",
                          "userId": "user_1",
                          "hostId": "host_1",
                          "reason": "weather",
                          "status": "PENDING",
                          "slotId": "slot_1",
                          "occurrenceDate": "2026-07-16",
                          "billIds": ["bill_1"],
                          "paymentIds": ["payment_1", "payment_2"],
                          "requestedAmountCents": 12345,
                          "currency": "cad",
                          "policyDecision": "WEATHER_REFUND",
                          "scopeVersion": 2,
                          "scopeHash": "scope_hash_1"
                        },
                        {
                          "id": "refund_2",
                          "eventId": "event_2",
                          "userId": "user_2",
                          "hostId": "host_1",
                          "reason": "injury",
                          "status": "PENDING"
                        },
                        {
                          "id": "refund_3",
                          "eventId": "event_2",
                          "userId": "user_1",
                          "hostId": "host_1",
                          "reason": "duplicate",
                          "status": "APPROVED"
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
        val repo = BillingRepository(api, userRepo, eventRepo, db)

        val refunds = repo.getRefundsWithRelations().getOrThrow()

        assertEquals(3, refunds.size)
        assertEquals(12345, refunds.first().refundRequest.requestedAmountCents)
        assertEquals("cad", refunds.first().refundRequest.currency)
        assertEquals(listOf("payment_1", "payment_2"), refunds.first().refundRequest.paymentIds)
        assertEquals("2026-07-16", refunds.first().refundRequest.occurrenceDate)
        assertEquals("WEATHER_REFUND", refunds.first().refundRequest.policyDecision)
        assertEquals("scope_hash_1", refunds.first().refundRequest.scopeHash)
        assertEquals(listOf(listOf("user_1", "user_2")), requestedUserIds)
        assertEquals(listOf(listOf("event_1", "event_2")), requestedEventIds)
        assertEquals(listOf("refund_1", "refund_2", "refund_3"), refundDao.storedRefunds.map { refund -> refund.id })
    }

    @Test
    fun getOrganizationReviews_reads_nested_review_contract() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        val engine = MockEngine { request ->
            assertEquals("/api/organizations/org_1/reviews", request.url.encodedPath)
            assertEquals(HttpMethod.Get, request.method)
            respond(
                content = """
                    {
                      "summary": {"averageRating": 4.5, "reviewCount": 2, "ratingCounts": [0, 0, 0, 1, 1]},
                      "reviews": [{
                        "id": "review_1",
                        "organizationId": "org_1",
                        "reviewerUserId": "u2",
                        "rating": 5,
                        "body": "Well organized.",
                        "status": "PUBLISHED",
                        "createdAt": "2026-07-09T20:00:00.000Z",
                        "updatedAt": "2026-07-09T20:00:00.000Z",
                        "reviewer": {"id": "u2", "displayName": "Taylor Reed", "profileImageUrl": null}
                      }],
                      "viewerReview": null,
                      "viewerIsAuthenticated": true,
                      "canReview": true,
                      "cannotReviewReason": null
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val repo = BillingRepository(
            MvpApiClient(http, "http://example.test", tokenStore),
            userRepo,
            BillingRepositoryHttp_UnusedEventRepository,
            db,
        )

        val payload = repo.getOrganizationReviews("org_1").getOrThrow()

        assertEquals(4.5, payload.summary.averageRating)
        assertEquals(2, payload.summary.reviewCount)
        assertEquals(1, payload.summary.countFor(5))
        assertEquals("Taylor Reed", payload.reviews.single().reviewer.displayName)
        assertTrue(payload.canReview)
    }

    @Test
    fun saveOrganizationReview_posts_rating_and_optional_body() = runTest {
        val tokenStore = BillingRepositoryHttp_InMemoryAuthTokenStore("t123")
        val userRepo = BillingRepositoryHttp_FakeUserRepository(
            currentUser = billingMakeUser("u1"),
            currentAccount = AuthAccount(id = "u1", email = "u1@example.test", name = "Test User"),
        )
        val db = BillingRepositoryHttp_FakeDatabaseService()
        var capturedBody = ""
        val engine = MockEngine { request ->
            assertEquals("/api/organizations/org_1/reviews", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            capturedBody = (request.body as? OutgoingContent.ByteArrayContent)?.bytes()?.decodeToString().orEmpty()
            respond(
                content = """
                    {
                      "summary": {"averageRating": 4.0, "reviewCount": 1, "ratingCounts": [0, 0, 0, 1, 0]},
                      "reviews": [],
                      "viewerReview": null,
                      "viewerIsAuthenticated": true,
                      "canReview": true,
                      "cannotReviewReason": null
                    }
                """.trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val http = HttpClient(engine) { install(ContentNegotiation) { json(jsonMVP) } }
        val repo = BillingRepository(
            MvpApiClient(http, "http://example.test", tokenStore),
            userRepo,
            BillingRepositoryHttp_UnusedEventRepository,
            db,
        )

        repo.saveOrganizationReview("org_1", 4, "Friendly staff").getOrThrow()

        assertTrue(capturedBody.contains("\"rating\":4"))
        assertTrue(capturedBody.contains("\"body\":\"Friendly staff\""))
    }
}
