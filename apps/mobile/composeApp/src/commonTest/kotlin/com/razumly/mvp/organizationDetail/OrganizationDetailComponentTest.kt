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
import com.razumly.mvp.core.data.dataTypes.OrganizationReview
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewReviewer
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewSummary
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsPayload
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.OrganizationEventPage
import com.razumly.mvp.core.data.repositories.OrganizationTeamPage
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
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OrganizationDetailComponentTest : MainDispatcherTest() {

    @Test
    fun given_section_screen_when_back_clicked_then_component_returns_to_overview() = runTest(testDispatcher) {
        val harness = OrganizationDetailHarness(product = createProduct(period = "SINGLE"))
        advance()

        assertEquals(OrganizationDetailTab.STORE, harness.component.selectedTab.value)

        harness.component.onBackClicked()

        assertEquals(OrganizationDetailTab.OVERVIEW, harness.component.selectedTab.value)
    }

    @Test
    fun given_review_payload_when_review_saved_then_component_replaces_review_state() = runTest(testDispatcher) {
        val harness = OrganizationDetailHarness(product = createProduct(period = "SINGLE"))
        advance()

        assertEquals(0, harness.component.reviews.value?.summary?.reviewCount)

        harness.component.saveReview(5, "Great experience")
        advance()

        assertEquals(1, harness.billingRepository.saveReviewCallCount)
        assertEquals(5, harness.billingRepository.lastSavedRating)
        assertEquals("Great experience", harness.billingRepository.lastSavedBody)
        assertEquals(1, harness.component.reviews.value?.summary?.reviewCount)
        assertEquals(5, harness.component.reviews.value?.viewerReview?.rating)
        assertEquals(OrganizationReviewSaveStatus.SUCCEEDED, harness.component.reviewSaveStatus.value)
    }

    @Test
    fun given_review_save_failure_then_component_keeps_the_existing_review_until_a_retry_succeeds() = runTest(testDispatcher) {
        val harness = OrganizationDetailHarness(product = createProduct(period = "SINGLE"))
        advance()
        harness.billingRepository.reviewSaveFailure = IllegalStateException("offline")

        harness.component.saveReview(5, "Keep this draft")
        advance()

        assertEquals(1, harness.billingRepository.saveReviewCallCount)
        assertEquals(0, harness.component.reviews.value?.summary?.reviewCount)
        assertEquals(OrganizationReviewSaveStatus.FAILED, harness.component.reviewSaveStatus.value)
        assertTrue(harness.component.errorState.value != null)

        harness.billingRepository.reviewSaveFailure = null
        harness.component.saveReview(5, "Keep this draft")
        advance()

        assertEquals(2, harness.billingRepository.saveReviewCallCount)
        assertEquals(1, harness.component.reviews.value?.summary?.reviewCount)
        assertEquals(OrganizationReviewSaveStatus.SUCCEEDED, harness.component.reviewSaveStatus.value)
    }

    @Test
    fun given_single_purchase_checkout_in_flight_when_same_product_tapped_again_then_duplicate_purchase_intent_is_ignored() =
        runTest(testDispatcher) {
            val harness = OrganizationDetailHarness(product = createProduct(period = "SINGLE"))
            advance()

            harness.component.startProductPurchase(harness.product)
            advance()
            harness.component.dismissDiscountCodePrompt()
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

            // The checkout remains locked until the PaymentSheet reports a result.
            assertEquals(harness.product.id, harness.component.startingProductCheckoutId.value)
        }

    @Test
    fun given_recurring_checkout_in_flight_when_same_product_tapped_again_then_duplicate_subscription_intent_is_ignored() =
        runTest(testDispatcher) {
            val harness = OrganizationDetailHarness(product = createProduct(period = "MONTH"))
            advance()

            harness.component.startProductPurchase(harness.product)
            advance()
            harness.component.dismissDiscountCodePrompt()
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

            // The checkout remains locked until the PaymentSheet reports a result.
            assertEquals(harness.product.id, harness.component.startingProductCheckoutId.value)
        }

    @Test
    fun organizationEventCatalog_loads_more_without_duplicates_and_keeps_rows_after_a_failure() = runTest(testDispatcher) {
        val eventRepository = QueuedOrganizationEventRepository(
            pages = ArrayDeque(
                listOf(
                    CompletableDeferred(
                        Result.success(
                            OrganizationEventPage(
                                events = listOf(catalogEvent("event-1"), catalogEvent("event-2")),
                                nextOffset = 2,
                                hasMore = true,
                            ),
                        ),
                    ),
                    CompletableDeferred(
                        Result.success(
                            OrganizationEventPage(
                                events = listOf(
                                    catalogEvent("event-2", "Updated event 2"),
                                    catalogEvent("event-3"),
                                ),
                                nextOffset = 4,
                                hasMore = true,
                            ),
                        ),
                    ),
                    CompletableDeferred(Result.failure(IllegalStateException("offline"))),
                    CompletableDeferred(
                        Result.success(
                            OrganizationEventPage(
                                events = listOf(catalogEvent("event-4")),
                                nextOffset = 5,
                                hasMore = false,
                            ),
                        ),
                    ),
                ),
            ),
        )
        val harness = OrganizationDetailHarness(
            product = createProduct(period = "SINGLE"),
            eventRepository = eventRepository,
        )
        advance()

        assertEquals(listOf("event-1", "event-2"), harness.component.events.value.map(Event::id))
        assertTrue(harness.component.canLoadMoreEvents.value)

        harness.component.loadMoreEvents()
        harness.component.loadMoreEvents()
        advance()

        assertEquals(listOf("event-1", "event-2", "event-3"), harness.component.events.value.map(Event::id))
        assertEquals("Updated event 2", harness.component.events.value[1].name)
        assertTrue(harness.component.canLoadMoreEvents.value)

        harness.component.loadMoreEvents()
        advance()

        assertEquals(listOf("event-1", "event-2", "event-3"), harness.component.events.value.map(Event::id))
        assertTrue(harness.component.canLoadMoreEvents.value)
        assertEquals("Failed to load more events. Try again.", harness.component.errorState.value?.message)

        harness.component.loadMoreEvents()
        advance()

        assertEquals(listOf("event-1", "event-2", "event-3", "event-4"), harness.component.events.value.map(Event::id))
        assertFalse(harness.component.canLoadMoreEvents.value)
        harness.component.loadMoreEvents()
        advance()
        assertEquals(listOf(0, 2, 4, 4), eventRepository.requests.map(CatalogPageRequest::offset))
        assertTrue(eventRepository.requests.all { request ->
            request.organizationId == "org-1" && request.limit == 50
        })
    }

    @Test
    fun organizationTeamCatalog_loads_more_without_duplicates_and_keeps_rows_after_a_failure() = runTest(testDispatcher) {
        val teamRepository = QueuedOrganizationTeamRepository(
            pages = ArrayDeque(
                listOf(
                    CompletableDeferred(
                        Result.success(
                            OrganizationTeamPage(
                                teams = listOf(catalogTeam("team-1")),
                                nextOffset = 1,
                                hasMore = true,
                            ),
                        ),
                    ),
                    CompletableDeferred(Result.failure(IllegalStateException("offline"))),
                    CompletableDeferred(
                        Result.success(
                            OrganizationTeamPage(
                                teams = listOf(
                                    catalogTeam("team-1", "Updated team 1"),
                                    catalogTeam("team-2"),
                                ),
                                nextOffset = 3,
                                hasMore = false,
                            ),
                        ),
                    ),
                ),
            ),
        )
        val harness = OrganizationDetailHarness(
            product = createProduct(period = "SINGLE"),
            teamRepository = teamRepository,
        )
        advance()

        assertEquals(listOf("team-1"), harness.component.teams.value.map { team -> team.team.id })
        assertTrue(harness.component.canLoadMoreTeams.value)

        harness.component.loadMoreTeams()
        harness.component.loadMoreTeams()
        advance()

        assertEquals(listOf("team-1"), harness.component.teams.value.map { team -> team.team.id })
        assertTrue(harness.component.canLoadMoreTeams.value)
        assertEquals("Failed to load more teams. Try again.", harness.component.errorState.value?.message)

        harness.component.loadMoreTeams()
        advance()

        assertEquals(listOf("team-1", "team-2"), harness.component.teams.value.map { team -> team.team.id })
        assertEquals("Updated team 1", harness.component.teams.value.first().team.name)
        assertFalse(harness.component.canLoadMoreTeams.value)
        harness.component.loadMoreTeams()
        advance()
        assertEquals(listOf(0, 1, 1), teamRepository.requests.map(CatalogPageRequest::offset))
        assertTrue(teamRepository.requests.all { request ->
            request.organizationId == "org-1" && request.limit == 50
        })
    }

    @Test
    fun organizationEventCatalog_ignores_a_stale_load_more_page_after_a_forced_refresh() = runTest(testDispatcher) {
        val staleLoadMore = CompletableDeferred<Result<OrganizationEventPage>>()
        val refreshedFirstPage = CompletableDeferred<Result<OrganizationEventPage>>()
        val eventRepository = QueuedOrganizationEventRepository(
            pages = ArrayDeque(
                listOf(
                    CompletableDeferred(
                        Result.success(
                            OrganizationEventPage(
                                events = listOf(catalogEvent("event-initial")),
                                nextOffset = 1,
                                hasMore = true,
                            ),
                        ),
                    ),
                    staleLoadMore,
                    refreshedFirstPage,
                ),
            ),
        )
        val harness = OrganizationDetailHarness(
            product = createProduct(period = "SINGLE"),
            eventRepository = eventRepository,
        )
        advance()

        harness.component.loadMoreEvents()
        advance()
        harness.component.refreshEvents(force = true)
        advance()

        refreshedFirstPage.complete(
            Result.success(
                OrganizationEventPage(
                    events = listOf(catalogEvent("event-fresh")),
                    nextOffset = 1,
                    hasMore = false,
                ),
            ),
        )
        advance()
        staleLoadMore.complete(
            Result.success(
                OrganizationEventPage(
                    events = listOf(catalogEvent("event-stale")),
                    nextOffset = 2,
                    hasMore = false,
                ),
            ),
        )
        advance()

        assertEquals(listOf("event-fresh"), harness.component.events.value.map(Event::id))
        assertFalse(harness.component.canLoadMoreEvents.value)
        assertEquals(listOf(0, 1, 0), eventRepository.requests.map(CatalogPageRequest::offset))
    }

    @Test
    fun teamPaymentCompletionMessage_uses_the_registered_team_not_the_first_catalog_page() = runTest(testDispatcher) {
        val pendingTeam = catalogTeam("team-on-page-two", "Page two team")
        val refreshedTeam = pendingTeam.copy(
            team = pendingTeam.team.copy(
                playerRegistrations = listOf(
                    TeamPlayerRegistration(
                        id = "registration-pending",
                        teamId = pendingTeam.team.id,
                        userId = "viewer-1",
                        status = "PENDING",
                    ),
                ),
            ),
        )
        val repository = object : ITeamRepository by NoopTeamRepository {
            val requestedTeamIds = mutableListOf<String>()

            override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> {
                requestedTeamIds += teamId
                return Result.success(refreshedTeam)
            }
        }

        val message = resolveTeamPaymentCompletionMessage(
            teamRepository = repository,
            pendingTeam = pendingTeam,
            currentUserId = "viewer-1",
        )

        assertEquals(listOf("team-on-page-two"), repository.requestedTeamIds)
        assertEquals(
            "Payment submitted for Page two team. Registration is pending until the bank payment clears.",
            message,
        )
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

                override suspend fun requestTeamRegistration(
                    teamId: String,
                    answers: Map<String, String>,
                ): Result<TeamRegistrationResult> =
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
            component.dismissDiscountCodePrompt()
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
    private val eventRepository: IEventRepository = CreateEvent_FakeEventRepository(),
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
        eventRepository = eventRepository,
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
    var saveReviewCallCount = 0
        private set
    var lastSavedRating: Int? = null
        private set
    var lastSavedBody: String? = null
        private set
    var reviewSaveFailure: Throwable? = null
    private var reviewPayload = OrganizationReviewsPayload(
        summary = OrganizationReviewSummary(),
        viewerIsAuthenticated = true,
        canReview = true,
    )

    override suspend fun getOrganizationsByIds(organizationIds: List<String>): Result<List<Organization>> =
        Result.success(
            organizationIds
                .map { id -> id.trim() }
                .filter { id -> id == organization.id }
                .map { organization }
        )

    override suspend fun listProductsByOrganization(organizationId: String): Result<List<Product>> =
        Result.success(if (organizationId.trim() == organization.id) products else emptyList())

    override suspend fun getOrganizationReviews(organizationId: String): Result<OrganizationReviewsPayload> =
        Result.success(reviewPayload)

    override suspend fun saveOrganizationReview(
        organizationId: String,
        rating: Int,
        body: String?,
    ): Result<OrganizationReviewsPayload> {
        saveReviewCallCount += 1
        lastSavedRating = rating
        lastSavedBody = body
        reviewSaveFailure?.let { failure -> return Result.failure(failure) }
        val review = OrganizationReview(
            id = "review-1",
            organizationId = organizationId,
            reviewerUserId = "user-1",
            rating = rating,
            body = body,
            createdAt = "2026-07-09T20:00:00.000Z",
            updatedAt = "2026-07-09T20:00:00.000Z",
            reviewer = OrganizationReviewReviewer(id = "user-1", displayName = "Test User"),
        )
        reviewPayload = OrganizationReviewsPayload(
            summary = OrganizationReviewSummary(
                averageRating = rating.toDouble(),
                reviewCount = 1,
                ratingCounts = List(5) { index -> if (index == rating - 1) 1 else 0 },
            ),
            reviews = listOf(review),
            viewerReview = review,
            viewerIsAuthenticated = true,
            canReview = true,
        )
        return Result.success(reviewPayload)
    }

    override suspend fun createProductPurchaseIntent(productId: String): Result<PurchaseIntent> {
        productPurchaseIntentCallCount += 1
        productPurchaseGate.await()
        return Result.success(testPurchaseIntent())
    }

    override suspend fun createProductPurchaseIntent(
        productId: String,
        discountCode: String?,
    ): Result<PurchaseIntent> = createProductPurchaseIntent(productId)

    override suspend fun createProductSubscriptionIntent(productId: String): Result<PurchaseIntent> {
        productSubscriptionIntentCallCount += 1
        productSubscriptionGate.await()
        return Result.success(testPurchaseIntent())
    }

    override suspend fun createProductSubscriptionIntent(
        productId: String,
        discountCode: String?,
    ): Result<PurchaseIntent> = createProductSubscriptionIntent(productId)

    fun releasePurchaseCheckout() {
        productPurchaseGate.complete(Unit)
    }

    fun releaseSubscriptionCheckout() {
        productSubscriptionGate.complete(Unit)
    }
}

private data class CatalogPageRequest(
    val organizationId: String,
    val limit: Int,
    val offset: Int,
)

private class QueuedOrganizationEventRepository(
    private val pages: ArrayDeque<CompletableDeferred<Result<OrganizationEventPage>>>,
) : IEventRepository by CreateEvent_FakeEventRepository() {
    val requests = mutableListOf<CatalogPageRequest>()

    override suspend fun getOrganizationEventsPage(
        organizationId: String,
        limit: Int,
        offset: Int,
    ): Result<OrganizationEventPage> {
        requests += CatalogPageRequest(organizationId, limit, offset)
        check(pages.isNotEmpty()) { "Unexpected organization event page request." }
        return pages.removeFirst().await()
    }
}

private class QueuedOrganizationTeamRepository(
    private val pages: ArrayDeque<CompletableDeferred<Result<OrganizationTeamPage>>>,
) : ITeamRepository by NoopTeamRepository {
    val requests = mutableListOf<CatalogPageRequest>()

    override suspend fun getOrganizationTeamsPage(
        organizationId: String,
        limit: Int,
        offset: Int,
    ): Result<OrganizationTeamPage> {
        requests += CatalogPageRequest(organizationId, limit, offset)
        check(pages.isNotEmpty()) { "Unexpected organization team page request." }
        return pages.removeFirst().await()
    }
}

private fun catalogEvent(id: String, name: String = id): Event = Event(
    id = id,
    name = name,
    organizationId = "org-1",
)

private fun catalogTeam(id: String, name: String = id): TeamWithPlayers = TeamWithPlayers(
    team = Team(
        division = "Open",
        name = name,
        captainId = "captain-$id",
        playerIds = listOf("captain-$id"),
        pending = emptyList(),
        teamSize = 6,
        organizationId = "org-1",
        id = id,
    ),
    captain = null,
    players = emptyList(),
    pendingPlayers = emptyList(),
)

private object NoopTeamRepository : ITeamRepository {
    override fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> =
        flowOf(Result.success(emptyList()))

    override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun getTeams(ids: List<String>): Result<List<Team>> = Result.success(emptyList())

    override suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>> =
        Result.success(emptyList())

    override suspend fun getTeamsByOrganization(
        organizationId: String,
        limit: Int,
    ): Result<List<TeamWithPlayers>> = Result.success(emptyList())

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> = Result.success(Unit)

    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> = Result.success(Unit)

    override suspend fun createTeam(newTeam: Team): Result<Team> = Result.success(newTeam)

    override suspend fun updateTeam(newTeam: Team): Result<Team> = Result.success(newTeam)

    override suspend fun requestTeamRegistration(
        teamId: String,
        answers: Map<String, String>,
    ): Result<TeamRegistrationResult> =
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
        matchAction: com.razumly.mvp.core.network.dto.MatchActionOperationDto?,
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

    override suspend fun syncPendingMatchOperations(matchId: String?): Result<Int> = Result.success(0)

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

    override suspend fun getEventTeamCheckIns(
        eventId: String,
    ): Result<com.razumly.mvp.core.network.dto.TeamCheckInsResponseDto> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun checkInEventTeam(
        eventId: String,
        eventTeamId: String,
    ): Result<com.razumly.mvp.core.network.dto.TeamCheckInDto> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun getMatchTeamCheckIns(
        eventId: String,
        matchId: String,
    ): Result<com.razumly.mvp.core.network.dto.TeamCheckInsResponseDto> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun checkInMatchTeam(
        eventId: String,
        matchId: String,
        eventTeamId: String,
    ): Result<com.razumly.mvp.core.network.dto.TeamCheckInDto> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun getMatchRosters(
        eventId: String,
        matchId: String,
    ): Result<com.razumly.mvp.core.network.dto.MatchRostersResponseDto> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun removeMatchRosterPlayer(
        eventId: String,
        matchId: String,
        eventTeamId: String,
        userId: String,
    ): Result<com.razumly.mvp.core.network.dto.MatchRosterDto> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun restoreMatchRosterPlayer(
        eventId: String,
        matchId: String,
        eventTeamId: String,
        userId: String,
    ): Result<com.razumly.mvp.core.network.dto.MatchRosterDto> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun addTemporaryMatchRosterPlayer(
        eventId: String,
        matchId: String,
        eventTeamId: String,
        firstName: String?,
        lastName: String?,
        email: String?,
        entryId: String?,
    ): Result<com.razumly.mvp.core.network.dto.MatchRosterDto> =
        Result.failure(IllegalStateException("unused"))

    override suspend fun deleteMatchesOfTournament(tournamentId: String): Result<Unit> = Result.success(Unit)

    override suspend fun subscribeToMatches(eventId: String): Result<Unit> = Result.success(Unit)

    override suspend fun unsubscribeFromRealtime(): Result<Unit> = Result.success(Unit)

    override fun setRealtimePaused(reason: String, paused: Boolean): Result<Unit> =
        Result.success(Unit)

    override fun setIgnoreMatch(match: com.razumly.mvp.core.data.dataTypes.MatchMVP?): Result<Unit> =
        Result.success(Unit)
}

private object NoopNavigationHandler : INavigationHandler {
    override fun navigateToMatch(match: com.razumly.mvp.core.data.dataTypes.MatchWithRelations, event: Event) = Unit
    override fun navigateToTeams(freeAgents: List<String>, event: Event?, selectedFreeAgentId: String?) = Unit
    override fun navigateToChat(user: UserData?, chat: ChatGroupWithRelations?) = Unit
    override fun navigateToCreate() = Unit
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
