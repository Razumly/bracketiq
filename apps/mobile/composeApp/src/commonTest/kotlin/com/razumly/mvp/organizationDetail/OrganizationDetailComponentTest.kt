package com.razumly.mvp.organizationDetail

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressProfile
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.TeamRegistrationConsent
import com.razumly.mvp.core.data.repositories.TeamRegistrationResult
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.eventCreate.CreateEvent_FakeBillingRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeEventRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeFieldRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeUserRepository
import com.razumly.mvp.eventCreate.MainDispatcherTest
import com.razumly.mvp.eventCreate.createUser
import com.razumly.mvp.eventDetail.data.IMatchRepository
import com.razumly.mvp.eventDetail.data.StagedMatchCreate
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OrganizationDetailComponentTest : MainDispatcherTest() {

    @Test
    fun given_single_purchase_checkout_in_flight_when_same_product_tapped_again_then_duplicate_purchase_intent_is_ignored() =
        runTest(testDispatcher) {
            val harness = OrganizationDetailHarness(product = createProduct(period = "SINGLE"))
            advance()

            harness.component.startProductPurchase(harness.product)
            advance()

            assertEquals(harness.product.id, harness.component.startingProductCheckoutId.value)
            assertEquals(1, harness.billingRepository.productPurchaseIntentCallCount)
            assertEquals(0, harness.billingRepository.productSubscriptionIntentCallCount)

            harness.component.startProductPurchase(harness.product)
            advance()

            assertEquals(1, harness.billingRepository.productPurchaseIntentCallCount)
            assertEquals(0, harness.billingRepository.productSubscriptionIntentCallCount)

            harness.billingRepository.releasePurchaseCheckout()
            advance()

            assertNull(harness.component.startingProductCheckoutId.value)
        }

    @Test
    fun given_recurring_checkout_in_flight_when_same_product_tapped_again_then_duplicate_subscription_intent_is_ignored() =
        runTest(testDispatcher) {
            val harness = OrganizationDetailHarness(product = createProduct(period = "MONTH"))
            advance()

            harness.component.startProductPurchase(harness.product)
            advance()

            assertEquals(harness.product.id, harness.component.startingProductCheckoutId.value)
            assertEquals(0, harness.billingRepository.productPurchaseIntentCallCount)
            assertEquals(1, harness.billingRepository.productSubscriptionIntentCallCount)

            harness.component.startProductPurchase(harness.product)
            advance()

            assertEquals(0, harness.billingRepository.productPurchaseIntentCallCount)
            assertEquals(1, harness.billingRepository.productSubscriptionIntentCallCount)

            harness.billingRepository.releaseSubscriptionCheckout()
            advance()

            assertNull(harness.component.startingProductCheckoutId.value)
        }

    @Test
    fun refreshTeams_loads_organization_teams_by_organization_id() = runTest(testDispatcher) {
        val expectedTeam = Team(
            division = "Open",
            name = "Org Team",
            captainId = "captain-1",
            playerIds = listOf("captain-1"),
            pending = emptyList(),
            teamSize = 6,
            organizationId = "org-1",
            id = "team-1",
        )
        val capturedOrganizationIds = mutableListOf<String>()
        val teamRepository = object : ITeamRepository by NoopTeamRepository {
            override suspend fun getTeamsByOrganization(
                organizationId: String,
                limit: Int,
            ): Result<List<TeamWithPlayers>> {
                capturedOrganizationIds += organizationId
                return Result.success(
                    listOf(
                        TeamWithPlayers(
                            team = expectedTeam,
                            captain = null,
                            players = emptyList(),
                            pendingPlayers = emptyList(),
                        ),
                    ),
                )
            }
        }
        val harness = OrganizationDetailHarness(
            product = createProduct(period = "SINGLE"),
            teamRepository = teamRepository,
        )
        advance()

        harness.component.refreshTeams(force = true)
        advance()

        assertEquals(2, capturedOrganizationIds.size)
        assertEquals(listOf("org-1", "org-1"), capturedOrganizationIds)
        assertEquals(listOf("team-1"), harness.component.teams.value.map { team -> team.team.id })
    }

    @Test
    fun startTeamRegistration_withRequiredDocuments_waitsForClearance_thenPromptsBillingAddress_beforeCheckout() =
        runTest(testDispatcher) {
            val host = createUser(id = "org-team-host")
            val userRepository = CreateEvent_FakeUserRepository()
            val currentUser = userRepository.currentUser.value.getOrNull()!!
            val organization = Organization(
                id = "org-join-1",
                name = "Summit Indoor Volleyball Facility",
                location = "Washougal, WA",
                description = "Organization team registration test",
                logoId = null,
                ownerId = host.id,
                website = null,
                officialIds = emptyList(),
                hasStripeAccount = true,
                coordinates = null,
                fieldIds = emptyList(),
                productIds = emptyList(),
                teamIds = listOf("team-org-signing"),
            )
            val team = Team(
                id = "team-org-signing",
                division = "Open",
                name = "Org Signing Team",
                captainId = host.id,
                managerId = host.id,
                playerIds = listOf(host.id),
                teamSize = 6,
                organizationId = organization.id,
                openRegistration = true,
                registrationPriceCents = 5500,
                requiredTemplateIds = listOf("team-waiver"),
            )
            val pendingRegistration = TeamPlayerRegistration(
                id = "org_team_reg_started",
                teamId = team.id,
                userId = currentUser.id,
                registrantId = currentUser.id,
                status = "STARTED",
                registrantType = "SELF",
                consentStatus = "sent",
            )
            val signedRegistration = pendingRegistration.copy(consentStatus = "completed")
            val signStep = SignStep(
                templateId = "team-waiver",
                type = "TEXT",
                title = "Team Waiver",
                content = "Please sign this waiver.",
                documentId = "org_team_doc_1",
            )
            val registrationResults = ArrayDeque(
                listOf(
                    TeamRegistrationResult(
                        team = team,
                        registrationStatus = "STARTED",
                        registration = pendingRegistration,
                        consent = TeamRegistrationConsent(
                            documentId = "org_team_doc_1",
                            status = "sent",
                        ),
                    ),
                    TeamRegistrationResult(
                        team = team,
                        registrationStatus = "STARTED",
                        registration = signedRegistration,
                        consent = TeamRegistrationConsent(
                            documentId = "org_team_doc_1",
                            status = "completed",
                        ),
                    ),
                )
            )
            val billingRepository = OrganizationDetailTestBillingRepository(
                organization = organization,
                products = emptyList(),
            ).apply {
                testState.queuedTeamSignLinksResults = mutableListOf(
                    listOf(signStep),
                    listOf(signStep),
                    emptyList(),
                )
                testState.billingAddressProfile = BillingAddressProfile(
                    billingAddress = BillingAddressDraft(countryCode = "US"),
                    email = "user@example.test",
                )
            }
            val teamRepository = object : ITeamRepository by NoopTeamRepository {
                override suspend fun getTeamsByOrganization(
                    organizationId: String,
                    limit: Int,
                ): Result<List<TeamWithPlayers>> = Result.success(
                    if (organizationId.trim() == organization.id) {
                        listOf(
                            TeamWithPlayers(
                                team = team,
                                captain = host,
                                players = listOf(host),
                                pendingPlayers = emptyList(),
                            ),
                        )
                    } else {
                        emptyList()
                    }
                )

                override suspend fun requestTeamRegistration(teamId: String): Result<TeamRegistrationResult> =
                    Result.success(registrationResults.removeFirst())
            }
            val component = DefaultOrganizationDetailComponent(
                componentContext = createTestComponentContext(),
                organizationId = organization.id,
                initialTab = OrganizationDetailTab.TEAMS,
                billingRepository = billingRepository,
                eventRepository = CreateEvent_FakeEventRepository(),
                teamRepository = teamRepository,
                fieldRepository = CreateEvent_FakeFieldRepository(),
                matchRepository = NoopMatchRepository,
                userRepository = userRepository,
                navigationHandler = NoopNavigationHandler,
            )

            advance()

            component.startTeamRegistration(
                TeamWithPlayers(
                    team = team,
                    captain = host,
                    players = listOf(host),
                    pendingPlayers = emptyList(),
                )
            )
            advance()

            assertTrue(component.textSignaturePrompt.value != null)
            assertTrue(component.billingAddressPrompt.value == null)
            assertTrue(billingRepository.testState.teamRegistrationPurchaseIntentCalls.isEmpty())

            component.confirmTextSignature()
            advance()

            assertTrue(component.textSignaturePrompt.value == null)
            assertTrue(component.billingAddressPrompt.value != null)
            assertEquals(1, billingRepository.testState.teamRecordSignatureCalls.size)
            assertTrue(billingRepository.testState.teamRegistrationPurchaseIntentCalls.isEmpty())

            component.submitBillingAddress(
                BillingAddressDraft(
                    line1 = "42 Test Ave",
                    city = "Los Angeles",
                    state = "CA",
                    postalCode = "90001",
                    countryCode = "US",
                )
            )
            advance()

            assertEquals(listOf(team.id), billingRepository.testState.teamRegistrationPurchaseIntentCalls)
            assertEquals(currentUser.id, billingRepository.testState.teamRegistrationPurchaseTargets.single()?.registrantId)
            assertEquals("completed", billingRepository.testState.teamRegistrationPurchaseTargets.single()?.consentStatus)
            assertEquals(1, billingRepository.testState.updatedBillingAddresses.size)
            assertTrue(component.billingAddressPrompt.value == null)
        }
}

private class OrganizationDetailHarness(
    val product: Product,
    private val teamRepository: ITeamRepository = NoopTeamRepository,
) {
    private val organization = Organization(
        id = "org-1",
        name = "Summit Indoor Volleyball Facility",
        location = "Washougal, WA",
        description = "Organization store test harness",
        logoId = null,
        ownerId = "owner-1",
        website = null,
        officialIds = emptyList(),
        hasStripeAccount = true,
        coordinates = null,
        fieldIds = emptyList(),
        productIds = listOf(product.id),
        teamIds = emptyList(),
    )

    val billingRepository = OrganizationDetailTestBillingRepository(
        organization = organization,
        products = listOf(product),
    )

    val component = DefaultOrganizationDetailComponent(
        componentContext = createTestComponentContext(),
        organizationId = organization.id,
        initialTab = OrganizationDetailTab.STORE,
        billingRepository = billingRepository,
        eventRepository = CreateEvent_FakeEventRepository(),
        teamRepository = teamRepository,
        fieldRepository = CreateEvent_FakeFieldRepository(),
        matchRepository = NoopMatchRepository,
        userRepository = CreateEvent_FakeUserRepository(),
        navigationHandler = NoopNavigationHandler,
    )
}

private class OrganizationDetailTestBillingRepository(
    private val organization: Organization,
    private val products: List<Product>,
    private val delegate: CreateEvent_FakeBillingRepository = CreateEvent_FakeBillingRepository(),
) : com.razumly.mvp.core.data.repositories.IBillingRepository by delegate {
    val testState: CreateEvent_FakeBillingRepository = delegate
    private val productPurchaseGate = CompletableDeferred<Unit>()
    private val productSubscriptionGate = CompletableDeferred<Unit>()

    var productPurchaseIntentCallCount = 0
        private set
    var productSubscriptionIntentCallCount = 0
        private set

    override suspend fun getOrganizationsByIds(organizationIds: List<String>): Result<List<Organization>> =
        Result.success(
            organizationIds
                .map { id -> id.trim() }
                .filter { id -> id == organization.id }
                .map { organization }
        )

    override suspend fun listProductsByOrganization(organizationId: String): Result<List<Product>> =
        Result.success(if (organizationId.trim() == organization.id) products else emptyList())

    override suspend fun createProductPurchaseIntent(productId: String): Result<PurchaseIntent> {
        productPurchaseIntentCallCount += 1
        productPurchaseGate.await()
        return Result.success(testPurchaseIntent())
    }

    override suspend fun createProductSubscriptionIntent(productId: String): Result<PurchaseIntent> {
        productSubscriptionIntentCallCount += 1
        productSubscriptionGate.await()
        return Result.success(testPurchaseIntent())
    }

    fun releasePurchaseCheckout() {
        productPurchaseGate.complete(Unit)
    }

    fun releaseSubscriptionCheckout() {
        productSubscriptionGate.complete(Unit)
    }
}

private object NoopTeamRepository : ITeamRepository {
    override fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> =
        flowOf(Result.success(emptyList()))

    override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun getTeams(ids: List<String>): Result<List<Team>> = Result.success(emptyList())

    override suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>> =
        Result.success(emptyList())

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> = Result.success(Unit)

    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> = Result.success(Unit)

    override suspend fun createTeam(newTeam: Team): Result<Team> = Result.success(newTeam)

    override suspend fun updateTeam(newTeam: Team): Result<Team> = Result.success(newTeam)

    override suspend fun requestTeamRegistration(teamId: String): Result<TeamRegistrationResult> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun registerForTeam(teamId: String): Result<Team> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun leaveTeam(teamId: String): Result<Team> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit> = Result.success(Unit)

    override fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>> =
        flowOf(Result.success(emptyList()))

    override fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>> =
        flowOf(Result.failure(IllegalStateException("unused")))

    override suspend fun listTeamInvites(userId: String): Result<List<Invite>> = Result.success(emptyList())

    override suspend fun getInviteFreeAgents(teamId: String): Result<List<UserData>> = Result.success(emptyList())

    override suspend fun createTeamInvite(teamId: String, userId: String, createdBy: String, inviteType: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun deleteInvite(inviteId: String): Result<Unit> = Result.success(Unit)

    override suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit> = Result.success(Unit)
}

private object NoopMatchRepository : IMatchRepository {
    override suspend fun getMatch(matchId: String): Result<com.razumly.mvp.core.data.dataTypes.MatchMVP> =
        Result.failure(IllegalStateException("unused"))

    override fun getMatchFlow(matchId: String): Flow<Result<com.razumly.mvp.core.data.dataTypes.MatchWithRelations>> =
        flowOf(Result.failure(IllegalStateException("unused")))

    override suspend fun saveMatchLocally(match: com.razumly.mvp.core.data.dataTypes.MatchMVP): Result<Unit> =
        Result.success(Unit)

    override suspend fun updateMatch(match: com.razumly.mvp.core.data.dataTypes.MatchMVP): Result<Unit> =
        Result.success(Unit)

    override suspend fun updateMatchOperations(
        match: com.razumly.mvp.core.data.dataTypes.MatchMVP,
        lifecycle: com.razumly.mvp.core.network.dto.MatchLifecycleOperationDto?,
        segmentOperations: List<com.razumly.mvp.core.network.dto.MatchSegmentOperationDto>?,
        incidentOperations: List<com.razumly.mvp.core.network.dto.MatchIncidentOperationDto>?,
        officialCheckIn: com.razumly.mvp.core.network.dto.MatchOfficialCheckInOperationDto?,
        finalize: Boolean,
        time: kotlin.time.Instant?,
    ): Result<com.razumly.mvp.core.data.dataTypes.MatchMVP> = Result.success(match)

    override suspend fun setMatchScore(
        match: com.razumly.mvp.core.data.dataTypes.MatchMVP,
        segmentId: String?,
        sequence: Int,
        eventTeamId: String,
        points: Int,
    ): Result<com.razumly.mvp.core.data.dataTypes.MatchMVP> = Result.success(match)

    override suspend fun addMatchIncident(
        match: com.razumly.mvp.core.data.dataTypes.MatchMVP,
        operation: com.razumly.mvp.core.network.dto.MatchIncidentOperationDto,
    ): Result<com.razumly.mvp.core.data.dataTypes.MatchMVP> = Result.success(match)

    override suspend fun updateMatchesBulk(
        matches: List<com.razumly.mvp.core.data.dataTypes.MatchMVP>,
        creates: List<StagedMatchCreate>,
        deletes: List<String>,
    ): Result<List<com.razumly.mvp.core.data.dataTypes.MatchMVP>> = Result.success(matches)

    override fun getMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<com.razumly.mvp.core.data.dataTypes.MatchWithRelations>>> =
        flowOf(Result.success(emptyList()))

    override suspend fun updateMatchFinished(
        match: com.razumly.mvp.core.data.dataTypes.MatchMVP,
        time: kotlin.time.Instant,
    ): Result<Unit> = Result.success(Unit)

    override suspend fun getMatchesOfTournament(tournamentId: String): Result<List<com.razumly.mvp.core.data.dataTypes.MatchMVP>> =
        Result.success(emptyList())

    override suspend fun getMatchesByEventIds(
        eventIds: List<String>,
        fieldIds: List<String>?,
        rangeStart: kotlin.time.Instant?,
        rangeEnd: kotlin.time.Instant?,
    ): Result<List<com.razumly.mvp.core.data.dataTypes.MatchMVP>> = Result.success(emptyList())

    override suspend fun deleteMatchesOfTournament(tournamentId: String): Result<Unit> = Result.success(Unit)

    override suspend fun subscribeToMatches(): Result<Unit> = Result.success(Unit)

    override suspend fun unsubscribeFromRealtime(): Result<Unit> = Result.success(Unit)

    override fun setIgnoreMatch(match: com.razumly.mvp.core.data.dataTypes.MatchMVP?): Result<Unit> =
        Result.success(Unit)
}

private object NoopNavigationHandler : INavigationHandler {
    override fun navigateToMatch(match: com.razumly.mvp.core.data.dataTypes.MatchWithRelations, event: Event) = Unit
    override fun navigateToTeams(freeAgents: List<String>, event: Event?, selectedFreeAgentId: String?) = Unit
    override fun navigateToChat(user: UserData?, chat: ChatGroupWithRelations?) = Unit
    override fun navigateToCreate(rentalContext: RentalCreateContext?) = Unit
    override fun navigateToSearch() = Unit
    override fun navigateToEvent(event: Event) = Unit
    override fun navigateToOrganization(organizationId: String, initialTab: OrganizationDetailTab) = Unit
    override fun navigateToEvents() = Unit
    override fun navigateToRefunds() = Unit
    override fun navigateToLogin() = Unit
    override fun navigateBack() = Unit
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

private fun createProduct(period: String): Product =
    Product(
        id = "product-${period.lowercase()}",
        name = "Test product $period",
        description = "Organization store checkout lock test",
        priceCents = 2_500,
        period = period,
        organizationId = "org-1",
        isActive = true,
    )

private fun testPurchaseIntent(): PurchaseIntent =
    PurchaseIntent(
        paymentIntent = "pi_test_secret_test",
        publishableKey = "pk_test",
    )
