package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.daos.ChatGroupDao
import com.razumly.mvp.core.data.dataTypes.daos.EventDao
import com.razumly.mvp.core.data.dataTypes.daos.FieldDao
import com.razumly.mvp.core.data.dataTypes.daos.MatchDao
import com.razumly.mvp.core.data.dataTypes.daos.MessageDao
import com.razumly.mvp.core.data.dataTypes.daos.RefundRequestDao
import com.razumly.mvp.core.data.dataTypes.daos.TeamDao
import com.razumly.mvp.core.data.dataTypes.daos.UserDataDao
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
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

private class BillingRepositoryHttp_FakeDatabaseService : DatabaseService {
    override val getMatchDao: MatchDao get() = error("unused")
    override val getTeamDao: TeamDao get() = error("unused")
    override val getFieldDao: FieldDao get() = error("unused")
    override val getUserDataDao: UserDataDao get() = error("unused")
    override val getEventDao: EventDao get() = error("unused")
    override val getChatGroupDao: ChatGroupDao get() = error("unused")
    override val getMessageDao: MessageDao get() = error("unused")
    override val getRefundRequestDao: RefundRequestDao get() = error("unused")
}

private class BillingRepositoryHttp_FakeUserRepository(
    currentUser: UserData,
    currentAccount: AuthAccount,
) : IUserRepository {
    override val currentUser: StateFlow<Result<UserData>> = MutableStateFlow(Result.success(currentUser))
    override val currentAccount: StateFlow<Result<AuthAccount>> = MutableStateFlow(Result.success(currentAccount))

    override suspend fun getUsers(userIds: List<String>): Result<List<UserData>> = error("unused")
    override fun getUsersFlow(userIds: List<String>): Flow<Result<List<UserData>>> = flowOf(Result.success(emptyList()))
    override suspend fun login(email: String, password: String): Result<UserData> = error("unused")
    override suspend fun logout(): Result<Unit> = error("unused")
    override suspend fun searchPlayers(search: String): Result<List<UserData>> = error("unused")
    override suspend fun ensureUserByEmail(email: String): Result<UserData> = error("unused")
    override suspend fun listChildren(): Result<List<FamilyChild>> = error("unused")
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

    override suspend fun createNewUser(email: String, password: String, firstName: String, lastName: String, userName: String, dateOfBirth: String?): Result<UserData> = error("unused")
    override suspend fun updateUser(user: UserData): Result<UserData> = error("unused")
    override suspend fun updateEmail(email: String, password: String): Result<Unit> = error("unused")
    override suspend fun updatePassword(currentPassword: String, newPassword: String): Result<Unit> = error("unused")
    override suspend fun updateProfile(firstName: String, lastName: String, email: String, currentPassword: String, newPassword: String, userName: String): Result<Unit> = error("unused")
    override suspend fun getCurrentAccount(): Result<Unit> = Result.success(Unit)
    override suspend fun sendFriendRequest(user: UserData): Result<Unit> = error("unused")
    override suspend fun acceptFriendRequest(user: UserData): Result<Unit> = error("unused")
    override suspend fun declineFriendRequest(userId: String): Result<Unit> = error("unused")
    override suspend fun followUser(userId: String): Result<Unit> = error("unused")
    override suspend fun unfollowUser(userId: String): Result<Unit> = error("unused")
    override suspend fun removeFriend(userId: String): Result<Unit> = error("unused")
}

private object BillingRepositoryHttp_UnusedEventRepository : IEventRepository {
    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<com.razumly.mvp.core.data.dataTypes.EventWithRelations>> = error("unused")
    override fun resetCursor() {}
    override suspend fun getEvent(eventId: String): Result<Event> = error("unused")
    override suspend fun getEventsByOrganization(organizationId: String, limit: Int): Result<List<Event>> = error("unused")
    override suspend fun createEvent(
        newEvent: Event,
        requiredTemplateIds: List<String>,
        leagueScoringConfig: com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO?,
    ): Result<Event> = error("unused")
    override suspend fun scheduleEvent(eventId: String, participantCount: Int?): Result<Event> = error("unused")
    override suspend fun updateEvent(newEvent: Event): Result<Event> = error("unused")
    override suspend fun updateLocalEvent(newEvent: Event): Result<Event> = error("unused")
    override fun getEventsInBoundsFlow(bounds: com.razumly.mvp.core.data.dataTypes.Bounds): Flow<Result<List<Event>>> = error("unused")
    override suspend fun getEventsInBounds(bounds: com.razumly.mvp.core.data.dataTypes.Bounds): Result<Pair<List<Event>, Boolean>> = error("unused")
    override suspend fun searchEvents(searchQuery: String, userLocation: dev.icerock.moko.geo.LatLng): Result<Pair<List<Event>, Boolean>> = error("unused")
    override fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>> = error("unused")
    override suspend fun deleteEvent(eventId: String): Result<Unit> = error("unused")
    override suspend fun addCurrentUserToEvent(event: Event): Result<Unit> = error("unused")
    override suspend fun addTeamToEvent(event: Event, team: com.razumly.mvp.core.data.dataTypes.Team): Result<Unit> = error("unused")
    override suspend fun removeTeamFromEvent(event: Event, teamWithPlayers: com.razumly.mvp.core.data.dataTypes.TeamWithPlayers): Result<Unit> = error("unused")
    override suspend fun removeCurrentUserFromEvent(event: Event): Result<Unit> = error("unused")
}

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
        val intent = repo.createPurchaseIntent(event).getOrThrow()

        assertEquals("pi_123_secret_abc", intent.paymentIntent)
        assertEquals("pk_test_123", intent.publishableKey)
        assertEquals("https://app.boldsign.com/sign/abc123", intent.resolvedSigningUrl())
        assertTrue(intent.isSignatureRequired())
        assertFalse(intent.isSignatureCompleted())
        assertEquals(1000, intent.feeBreakdown?.eventPrice)
        assertEquals(1070, intent.feeBreakdown?.totalCharge)
    }

    @Test
    fun getRequiredSignLinks_posts_and_parses_response() = runTest {
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
}
