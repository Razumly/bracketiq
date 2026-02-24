@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventCreate

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillPayment
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.SportDTO
import com.razumly.mvp.core.data.dataTypes.Subscription
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.FamilyChild
import com.razumly.mvp.core.data.repositories.FamilyJoinRequest
import com.razumly.mvp.core.data.repositories.FamilyJoinRequestAction
import com.razumly.mvp.core.data.repositories.FamilyJoinRequestResolution
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.data.repositories.ISportsRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.repositories.LeagueStandingsConfirmResult
import com.razumly.mvp.core.data.repositories.ProfileDocumentsBundle
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.ChildRegistrationResult
import com.razumly.mvp.core.data.repositories.CreateBillRequest
import com.razumly.mvp.core.data.repositories.SelfRegistrationResult
import com.razumly.mvp.core.data.repositories.SignerContext
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignupProfileSelection
import com.razumly.mvp.core.network.MvpUploadFile
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.LoadingState
import com.razumly.mvp.eventDetail.data.IMatchRepository
import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.time.Instant

abstract class MainDispatcherTest {
    protected val testDispatcher = StandardTestDispatcher()

    @OptIn(ExperimentalCoroutinesApi::class)
    @BeforeTest
    fun setMainDispatcher() {
        Dispatchers.setMain(testDispatcher)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @AfterTest
    fun resetMainDispatcher() {
        Dispatchers.resetMain()
    }

    protected fun advance() {
        testDispatcher.scheduler.advanceUntilIdle()
    }
}

internal class CreateEventHarness(
    sports: List<Sport> = emptyList(),
    rentalContext: RentalCreateContext? = null,
    existingOrganizationEvents: List<Event> = emptyList(),
) {
    val userRepository = CreateEvent_FakeUserRepository()
    val eventRepository = CreateEvent_FakeEventRepository(existingOrganizationEvents)
    val fieldRepository = CreateEvent_FakeFieldRepository()
    val sportsRepository = CreateEvent_FakeSportsRepository(sports)
    val billingRepository = CreateEvent_FakeBillingRepository()
    val imageRepository = CreateEvent_FakeImagesRepository()
    val matchRepository = CreateEvent_FakeMatchRepository()
    val loadingHandler = CreateEvent_FakeLoadingHandler()

    var onEventCreatedCount = 0

    val component: DefaultCreateEventComponent = DefaultCreateEventComponent(
        componentContext = createTestComponentContext(),
        userRepository = userRepository,
        eventRepository = eventRepository,
        matchRepository = matchRepository,
        fieldRepository = fieldRepository,
        sportsRepository = sportsRepository,
        billingRepository = billingRepository,
        imageRepository = imageRepository,
        rentalContext = rentalContext,
        onEventCreated = { onEventCreatedCount += 1 }
    )
}

internal fun createSport(id: String, usePointsPerSetWin: Boolean): Sport =
    SportDTO(
        name = id,
        usePointsPerSetWin = usePointsPerSetWin,
    ).toSport(id)

internal fun createUser(
    id: String = "user-1",
    hasStripeAccount: Boolean = true,
): UserData = UserData(
    firstName = "Test",
    lastName = "User",
    teamIds = emptyList(),
    friendIds = emptyList(),
    friendRequestIds = emptyList(),
    friendRequestSentIds = emptyList(),
    followingIds = emptyList(),
    userName = "test_user",
    hasStripeAccount = hasStripeAccount,
    uploadedImages = emptyList(),
    profileImageId = null,
    id = id,
)

internal fun instant(epochMillis: Long): Instant = Instant.fromEpochMilliseconds(epochMillis)

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

internal class CreateEvent_FakeLoadingHandler : LoadingHandler {
    private val _loadingState = MutableStateFlow(LoadingState())
    override val loadingState: StateFlow<LoadingState> = _loadingState

    override fun showLoading(message: String, progress: Float?) {
        _loadingState.value = LoadingState(isLoading = true, message = message, progress = progress)
    }

    override fun hideLoading() {
        _loadingState.value = LoadingState()
    }

    override fun updateProgress(progress: Float) {
        _loadingState.update { it.copy(progress = progress) }
    }
}

internal class CreateEvent_FakeUserRepository : IUserRepository {
    private val user = createUser()
    private val account = AuthAccount(
        id = user.id,
        email = "user@example.test",
        name = user.fullName,
    )

    override val currentUser: StateFlow<Result<UserData>> = MutableStateFlow(Result.success(user))
    override val currentAccount: StateFlow<Result<AuthAccount>> = MutableStateFlow(Result.success(account))

    override suspend fun login(email: String, password: String): Result<UserData> = error("unused")
    override suspend fun logout(): Result<Unit> = error("unused")
    override suspend fun getUsers(userIds: List<String>): Result<List<UserData>> = Result.success(emptyList())
    override fun getUsersFlow(userIds: List<String>): Flow<Result<List<UserData>>> =
        flowOf(Result.success(emptyList()))
    override suspend fun searchPlayers(search: String): Result<List<UserData>> = Result.success(emptyList())
    override suspend fun ensureUserByEmail(email: String): Result<UserData> = Result.success(user)
    override suspend fun isCurrentUserChild(minorAgeThreshold: Int): Result<Boolean> = Result.success(false)
    override suspend fun listChildren(): Result<List<FamilyChild>> = Result.success(emptyList())
    override suspend fun listPendingChildJoinRequests(): Result<List<FamilyJoinRequest>> =
        Result.success(emptyList())
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
    ): Result<UserData> = Result.success(user)

    override suspend fun updateUser(user: UserData): Result<UserData> = Result.success(user)
    override suspend fun updateEmail(email: String, password: String): Result<Unit> = Result.success(Unit)
    override suspend fun updatePassword(currentPassword: String, newPassword: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        currentPassword: String,
        newPassword: String,
        userName: String,
    ): Result<Unit> = Result.success(Unit)

    override suspend fun getCurrentAccount(): Result<Unit> = Result.success(Unit)
    override suspend fun sendFriendRequest(user: UserData): Result<Unit> = Result.success(Unit)
    override suspend fun acceptFriendRequest(user: UserData): Result<Unit> = Result.success(Unit)
    override suspend fun declineFriendRequest(userId: String): Result<Unit> = Result.success(Unit)
    override suspend fun followUser(userId: String): Result<Unit> = Result.success(Unit)
    override suspend fun unfollowUser(userId: String): Result<Unit> = Result.success(Unit)
    override suspend fun removeFriend(userId: String): Result<Unit> = Result.success(Unit)
}

internal data class CreateEventCall(
    val event: Event,
    val requiredTemplateIds: List<String>,
    val leagueScoringConfig: LeagueScoringConfigDTO?,
)

internal class CreateEvent_FakeEventRepository(
    private val organizationEvents: List<Event> = emptyList(),
) : IEventRepository {
    val createEventCalls = mutableListOf<CreateEventCall>()

    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> =
        flowOf(Result.failure(IllegalStateException("unused")))

    override fun resetCursor() = Unit
    override suspend fun getEvent(eventId: String): Result<Event> = Result.failure(IllegalStateException("unused"))

    override suspend fun getEventsByOrganization(
        organizationId: String,
        limit: Int,
    ): Result<List<Event>> = Result.success(organizationEvents)

    override suspend fun createEvent(
        newEvent: Event,
        requiredTemplateIds: List<String>,
        leagueScoringConfig: LeagueScoringConfigDTO?,
    ): Result<Event> = runCatching {
        createEventCalls += CreateEventCall(
            event = newEvent,
            requiredTemplateIds = requiredTemplateIds,
            leagueScoringConfig = leagueScoringConfig,
        )
        newEvent
    }

    override suspend fun scheduleEvent(eventId: String, participantCount: Int?): Result<Event> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun updateEvent(newEvent: Event): Result<Event> = Result.failure(IllegalStateException("unused"))
    override suspend fun updateLocalEvent(newEvent: Event): Result<Event> = Result.failure(IllegalStateException("unused"))
    override fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<Event>>> =
        flowOf(Result.success(emptyList()))
    override suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<Event>, Boolean>> =
        Result.success(Pair(emptyList(), true))
    override suspend fun getEventsInBounds(
        bounds: Bounds,
        dateFrom: Instant?,
        dateTo: Instant?,
    ): Result<Pair<List<Event>, Boolean>> = getEventsInBounds(bounds)

    override suspend fun searchEvents(
        searchQuery: String,
        userLocation: LatLng,
    ): Result<Pair<List<Event>, Boolean>> = Result.success(Pair(emptyList(), true))

    override fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>> =
        flowOf(Result.success(emptyList()))

    override suspend fun deleteEvent(eventId: String): Result<Unit> = Result.success(Unit)
    override suspend fun addCurrentUserToEvent(
        event: Event,
        preferredDivisionId: String?,
    ): Result<SelfRegistrationResult> = Result.success(SelfRegistrationResult())
    override suspend fun registerChildForEvent(
        eventId: String,
        childUserId: String,
        joinWaitlist: Boolean,
    ): Result<ChildRegistrationResult> = Result.failure(NotImplementedError("unused"))
    override suspend fun addTeamToEvent(
        event: Event,
        team: Team,
        preferredDivisionId: String?,
    ): Result<Unit> = Result.success(Unit)
    override suspend fun getLeagueDivisionStandings(
        eventId: String,
        divisionId: String,
    ): Result<LeagueDivisionStandings> = Result.failure(IllegalStateException("unused"))
    override suspend fun confirmLeagueDivisionStandings(
        eventId: String,
        divisionId: String,
        applyReassignment: Boolean,
    ): Result<LeagueStandingsConfirmResult> = Result.failure(IllegalStateException("unused"))
    override suspend fun removeTeamFromEvent(event: Event, teamWithPlayers: TeamWithPlayers): Result<Unit> =
        Result.success(Unit)
    override suspend fun removeCurrentUserFromEvent(event: Event, targetUserId: String?): Result<Unit> =
        Result.success(Unit)
}

internal class CreateEvent_FakeFieldRepository : IFieldRepository {
    val createdFields = mutableListOf<Field>()
    val createdTimeSlots = mutableListOf<TimeSlot>()
    private var fieldCounter = 0
    private var slotCounter = 0

    override suspend fun createFields(count: Int, organizationId: String?): Result<List<Field>> = runCatching {
        List(count) { index ->
            createField(
                Field(
                    fieldNumber = index + 1,
                    organizationId = organizationId,
                    id = "field-draft-${index + 1}",
                )
            ).getOrThrow()
        }
    }

    override suspend fun createField(field: Field): Result<Field> = runCatching {
        fieldCounter += 1
        val created = field.copy(id = "field-created-$fieldCounter")
        createdFields += created
        created
    }

    override suspend fun updateField(field: Field): Result<Field> = Result.success(field)
    override fun getFieldsWithMatchesFlow(ids: List<String>): Flow<List<FieldWithMatches>> = flowOf(emptyList())
    override suspend fun getFields(ids: List<String>): Result<List<Field>> = Result.success(emptyList())
    override suspend fun listFields(eventId: String?): Result<List<Field>> = Result.success(emptyList())
    override suspend fun getTimeSlots(ids: List<String>): Result<List<TimeSlot>> = Result.success(emptyList())
    override suspend fun getTimeSlotsForField(fieldId: String): Result<List<TimeSlot>> = Result.success(emptyList())

    override suspend fun createTimeSlot(slot: TimeSlot): Result<TimeSlot> = runCatching {
        slotCounter += 1
        val created = slot.copy(id = "slot-created-$slotCounter")
        createdTimeSlots += created
        created
    }

    override suspend fun updateTimeSlot(slot: TimeSlot): Result<TimeSlot> = Result.success(slot)
    override suspend fun deleteTimeSlot(timeSlotId: String): Result<Unit> = Result.success(Unit)
}

internal class CreateEvent_FakeSportsRepository(
    private val sports: List<Sport>,
) : ISportsRepository {
    override suspend fun getSports(): Result<List<Sport>> = Result.success(sports)
}

internal class CreateEvent_FakeImagesRepository : IImagesRepository {
    private val imageIds = MutableStateFlow<List<String>>(emptyList())
    private var imageCounter = 0

    override suspend fun uploadImage(inputFile: MvpUploadFile): Result<String> = runCatching {
        imageCounter += 1
        val imageId = "image-$imageCounter"
        imageIds.value = imageIds.value + imageId
        imageId
    }

    override fun getUserImageIdsFlow(): Flow<List<String>> = imageIds
    override suspend fun addImageToUser(imageId: String): Result<Unit> = Result.success(Unit)
    override suspend fun deleteImage(imageId: String): Result<Unit> = runCatching {
        imageIds.value = imageIds.value.filterNot { it == imageId }
    }
}

internal class CreateEvent_FakeMatchRepository : IMatchRepository {
    var tournamentMatches: List<MatchMVP> = emptyList()

    override suspend fun getMatch(matchId: String): Result<MatchMVP> = Result.failure(IllegalStateException("unused"))
    override fun getMatchFlow(matchId: String): Flow<Result<MatchWithRelations>> =
        flowOf(Result.failure(IllegalStateException("unused")))
    override suspend fun updateMatch(match: MatchMVP): Result<Unit> = Result.success(Unit)

    override suspend fun updateMatchesBulk(matches: List<MatchMVP>): Result<List<MatchMVP>> =
        Result.success(matches)
    override fun getMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<MatchWithRelations>>> =
        flowOf(Result.success(emptyList()))
    override suspend fun updateMatchFinished(match: MatchMVP, time: Instant): Result<Unit> = Result.success(Unit)
    override suspend fun getMatchesOfTournament(tournamentId: String): Result<List<MatchMVP>> =
        Result.success(tournamentMatches)
    override suspend fun subscribeToMatches(): Result<Unit> = Result.success(Unit)
    override suspend fun unsubscribeFromRealtime(): Result<Unit> = Result.success(Unit)
    override fun setIgnoreMatch(match: MatchMVP?): Result<Unit> = Result.success(Unit)
}

internal class CreateEvent_FakeBillingRepository : IBillingRepository {
    override suspend fun createPurchaseIntent(
        event: Event,
        teamId: String?,
        priceCents: Int?,
    ): Result<PurchaseIntent> =
        Result.success(PurchaseIntent(paymentIntent = "pi_test", publishableKey = "pk_test"))

    override suspend fun createBill(request: CreateBillRequest): Result<Bill> = Result.success(
        Bill(
            ownerType = request.ownerType,
            ownerId = request.ownerId,
            organizationId = request.organizationId,
            eventId = request.eventId,
            totalAmountCents = request.totalAmountCents,
            allowSplit = request.allowSplit,
            paymentPlanEnabled = request.paymentPlanEnabled,
            id = "bill-test",
        )
    )

    override suspend fun getRequiredSignLinks(eventId: String): Result<List<SignStep>> =
        Result.success(emptyList())

    override suspend fun recordSignature(
        eventId: String,
        templateId: String,
        documentId: String,
        type: String,
        signerContext: SignerContext,
        childUserId: String?,
    ): Result<Unit> = Result.success(Unit)

    override suspend fun createAccount(): Result<String> = Result.success("https://example.test/onboarding")
    override suspend fun getOnboardingLink(): Result<String> = Result.success("https://example.test/onboarding")
    override suspend fun listBills(ownerType: String, ownerId: String, limit: Int): Result<List<Bill>> =
        Result.success(emptyList())
    override suspend fun getBillPayments(billId: String): Result<List<BillPayment>> = Result.success(emptyList())
    override suspend fun createBillingIntent(billId: String, billPaymentId: String): Result<PurchaseIntent> =
        Result.success(PurchaseIntent(paymentIntent = "pi_bill", publishableKey = "pk_bill"))
    override suspend fun listSubscriptions(userId: String, limit: Int): Result<List<Subscription>> =
        Result.success(emptyList())
    override suspend fun cancelSubscription(subscriptionId: String): Result<Boolean> = Result.success(true)
    override suspend fun restartSubscription(subscriptionId: String): Result<Boolean> = Result.success(true)
    override suspend fun getProductsByIds(productIds: List<String>): Result<List<Product>> = Result.success(emptyList())
    override suspend fun listProductsByOrganization(organizationId: String): Result<List<Product>> =
        Result.success(emptyList())
    override suspend fun createProductPurchaseIntent(productId: String): Result<PurchaseIntent> =
        Result.success(PurchaseIntent(paymentIntent = "pi_product", publishableKey = "pk_product"))
    override suspend fun createProductSubscription(
        productId: String,
        organizationId: String?,
        priceCents: Int?,
        startDate: String?,
    ): Result<Subscription> = Result.success(
        Subscription(
            productId = productId,
            userId = "user-1",
            organizationId = organizationId,
            startDate = startDate ?: "1970-01-01",
            priceCents = priceCents ?: 0,
            period = "month",
            status = "ACTIVE",
            id = "sub-test",
        )
    )
    override suspend fun listOrganizations(limit: Int): Result<List<Organization>> = Result.success(emptyList())
    override suspend fun getOrganizationsByIds(organizationIds: List<String>): Result<List<Organization>> =
        Result.success(emptyList())
    override suspend fun listOrganizationTemplates(organizationId: String): Result<List<OrganizationTemplateDocument>> =
        Result.success(emptyList())
    override suspend fun leaveAndRefundEvent(event: Event, reason: String, targetUserId: String?): Result<Unit> =
        Result.success(Unit)
    override suspend fun deleteAndRefundEvent(event: Event): Result<Unit> = Result.success(Unit)
    override suspend fun listProfileDocuments(): Result<ProfileDocumentsBundle> =
        Result.success(ProfileDocumentsBundle())
    override suspend fun getRefundsWithRelations(): Result<List<RefundRequestWithRelations>> = Result.success(emptyList())
    override suspend fun getRefunds(): Result<List<RefundRequest>> = Result.success(emptyList())
    override suspend fun approveRefund(refundRequest: RefundRequest): Result<Unit> = Result.success(Unit)
    override suspend fun rejectRefund(refundId: String): Result<Unit> = Result.success(Unit)
}
