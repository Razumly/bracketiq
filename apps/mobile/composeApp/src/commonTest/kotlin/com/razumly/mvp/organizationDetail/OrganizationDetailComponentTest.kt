@file:OptIn(
    kotlin.time.ExperimentalTime::class,
    kotlinx.coroutines.ExperimentalCoroutinesApi::class,
)

package com.razumly.mvp.organizationDetail

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressProfile
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationReview
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewReviewer
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewSummary
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsPayload
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.RentalAvailabilityBusyBlock
import com.razumly.mvp.core.data.dataTypes.RentalAvailabilityField
import com.razumly.mvp.core.data.dataTypes.RentalAvailabilitySnapshot
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.OrganizationEventPage
import com.razumly.mvp.core.data.repositories.OrganizationTeamPage
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.RentalOrderItem
import com.razumly.mvp.core.data.repositories.RentalOrderResult
import com.razumly.mvp.core.data.repositories.RentalOrderSelectionRequest
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.TeamRegistrationConsent
import com.razumly.mvp.core.data.repositories.TeamRegistrationResult
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.core.presentation.RentalBookingItemManifest
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
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

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
    fun given_older_review_page_when_load_more_is_tapped_twice_then_one_page_is_deduplicated_and_appended() =
        runTest(testDispatcher) {
            val latestReview = organizationReview(id = "review-1", body = "Original")
            val updatedLatestReview = latestReview.copy(body = "Updated by the current source")
            val olderReview = organizationReview(id = "review-2", body = "Older feedback")
            val harness = OrganizationDetailHarness(product = createProduct(period = "SINGLE"))
            harness.billingRepository.reviewPageResults[null] = Result.success(
                organizationReviewsPayload(reviews = listOf(latestReview), nextCursor = "older cursor/+"),
            )
            harness.billingRepository.reviewPageResults["older cursor/+"] = Result.success(
                organizationReviewsPayload(reviews = listOf(updatedLatestReview, olderReview)),
            )
            advance()

            harness.component.loadMoreReviews()
            harness.component.loadMoreReviews()
            advance()

            assertEquals(
                listOf(null to 20, "older cursor/+" to 20),
                harness.billingRepository.reviewPageCalls,
            )
            assertEquals(
                listOf("review-1", "review-2"),
                harness.component.reviews.value?.reviews?.map(OrganizationReview::id),
            )
            assertEquals("Updated by the current source", harness.component.reviews.value?.reviews?.first()?.body)
            assertFalse(harness.component.canLoadMoreReviews.value)
            assertFalse(harness.component.isLoadingMoreReviews.value)
        }

    @Test
    fun given_load_more_failure_when_retried_then_existing_reviews_and_cursor_are_preserved() = runTest(testDispatcher) {
        val latestReview = organizationReview(id = "review-1", body = "Newest feedback")
        val olderReview = organizationReview(id = "review-2", body = "Older feedback")
        val harness = OrganizationDetailHarness(product = createProduct(period = "SINGLE"))
        harness.billingRepository.reviewPageResults[null] = Result.success(
            organizationReviewsPayload(reviews = listOf(latestReview), nextCursor = "cursor-2"),
        )
        harness.billingRepository.reviewPageResults["cursor-2"] = Result.failure(IllegalStateException("offline"))
        advance()

        harness.component.loadMoreReviews()
        advance()

        assertEquals(listOf("review-1"), harness.component.reviews.value?.reviews?.map(OrganizationReview::id))
        assertEquals("cursor-2", harness.component.reviews.value?.nextCursor)
        assertTrue(harness.component.canLoadMoreReviews.value)
        assertFalse(harness.component.isLoadingMoreReviews.value)
        assertEquals("Failed to load more organization reviews. Try again.", harness.component.errorState.value?.message)

        harness.billingRepository.reviewPageResults["cursor-2"] = Result.success(
            organizationReviewsPayload(reviews = listOf(olderReview)),
        )
        harness.component.loadMoreReviews()
        advance()

        assertEquals(
            listOf("review-1", "review-2"),
            harness.component.reviews.value?.reviews?.map(OrganizationReview::id),
        )
        assertEquals(listOf(null, "cursor-2", "cursor-2"), harness.billingRepository.reviewPageCalls.map { it.first })
    }

    @Test
    fun given_older_review_page_in_flight_when_refreshed_then_the_late_page_cannot_replace_current_source() =
        runTest(testDispatcher) {
            val harness = OrganizationDetailHarness(product = createProduct(period = "SINGLE"))
            harness.billingRepository.reviewPageResults[null] = Result.success(
                organizationReviewsPayload(
                    reviews = listOf(organizationReview(id = "review-2", body = "Previous newest")),
                    nextCursor = "cursor-2",
                ),
            )
            advance()

            val lateOlderPage = CompletableDeferred<Result<OrganizationReviewsPayload>>()
            harness.billingRepository.deferredReviewPageResults["cursor-2"] = lateOlderPage
            harness.component.loadMoreReviews()
            advance()
            assertTrue(harness.component.isLoadingMoreReviews.value)

            harness.billingRepository.reviewPageResults[null] = Result.success(
                organizationReviewsPayload(
                    reviews = listOf(organizationReview(id = "review-3", body = "Current newest")),
                    nextCursor = "current-cursor",
                ),
            )
            harness.component.refreshReviews(force = true)
            advance()
            lateOlderPage.complete(
                Result.success(
                    organizationReviewsPayload(
                        reviews = listOf(organizationReview(id = "review-1", body = "Stale older feedback")),
                    ),
                ),
            )
            advance()

            assertEquals(listOf("review-3"), harness.component.reviews.value?.reviews?.map(OrganizationReview::id))
            assertEquals("current-cursor", harness.component.reviews.value?.nextCursor)
            assertTrue(harness.component.canLoadMoreReviews.value)
            assertFalse(harness.component.isLoadingMoreReviews.value)
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

            // The Android test processor has no Activity/PaymentSheet, so presentation
            // reports a setup failure and the component releases the checkout lock.
            assertNull(harness.component.startingProductCheckoutId.value)
            assertEquals(
                "Payment setup is unavailable. Please try again.",
                harness.component.errorState.value?.message,
            )
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

            // The Android test processor has no Activity/PaymentSheet, so presentation
            // reports a setup failure and the component releases the checkout lock.
            assertNull(harness.component.startingProductCheckoutId.value)
            assertEquals(
                "Payment setup is unavailable. Please try again.",
                harness.component.errorState.value?.message,
            )
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
    fun rentalAvailability_refreshes_the_requested_date_window_and_ignores_a_stale_response() =
        runTest(testDispatcher) {
            val fieldRepository = QueuedRentalAvailabilityFieldRepository()
            val harness = OrganizationDetailHarness(
                product = createProduct(period = "SINGLE"),
                fieldRepository = fieldRepository,
            )
            advance()
            fieldRepository.requests.clear()

            val firstStart = Instant.parse("2026-07-13T07:00:00Z")
            val firstEnd = Instant.parse("2026-07-20T07:00:00Z")
            val secondStart = firstEnd
            val secondEnd = Instant.parse("2026-07-27T07:00:00Z")
            val staleResponse = CompletableDeferred<Result<RentalAvailabilitySnapshot>>()
            val freshResponse = CompletableDeferred<Result<RentalAvailabilitySnapshot>>()
            fieldRepository.responses += staleResponse
            fieldRepository.responses += freshResponse

            harness.component.refreshRentals(firstStart, firstEnd, force = true)
            advance()
            harness.component.refreshRentals(secondStart, secondEnd, force = true)
            advance()

            freshResponse.complete(Result.success(rentalSnapshot(secondStart, secondEnd, "fresh")))
            advance()
            staleResponse.complete(Result.success(rentalSnapshot(firstStart, firstEnd, "stale")))
            advance()

            assertEquals(
                listOf(
                    RentalAvailabilityRequest("org-1", firstStart, firstEnd),
                    RentalAvailabilityRequest("org-1", secondStart, secondEnd),
                ),
                fieldRepository.requests,
            )
            assertEquals(listOf("field-fresh"), harness.component.rentalFieldOptions.value.map { it.field.id })
            assertEquals("field-fresh", harness.component.rentalBusyBlocks.value.single().fieldId)
            assertEquals(
                com.razumly.mvp.eventSearch.RentalAvailabilityWindow(secondStart, secondEnd),
                harness.component.loadedRentalAvailabilityWindow.value,
            )
            assertFalse(harness.component.isLoadingRentals.value)
        }

    @Test
    fun rentalAvailability_failure_preserves_the_last_successful_snapshot() = runTest(testDispatcher) {
        val fieldRepository = QueuedRentalAvailabilityFieldRepository()
        val harness = OrganizationDetailHarness(
            product = createProduct(period = "SINGLE"),
            fieldRepository = fieldRepository,
        )
        advance()

        val firstStart = Instant.parse("2026-07-13T07:00:00Z")
        val firstEnd = Instant.parse("2026-07-20T07:00:00Z")
        fieldRepository.responses += CompletableDeferred(
            Result.success(rentalSnapshot(firstStart, firstEnd, "kept")),
        )
        harness.component.refreshRentals(firstStart, firstEnd, force = true)
        advance()

        fieldRepository.responses += CompletableDeferred(
            Result.failure<RentalAvailabilitySnapshot>(IllegalStateException("offline")),
        )
        harness.component.refreshRentals(
            rangeStart = firstEnd,
            rangeEnd = Instant.parse("2026-07-27T07:00:00Z"),
            force = true,
        )
        advance()

        assertEquals(listOf("field-kept"), harness.component.rentalFieldOptions.value.map { it.field.id })
        assertEquals("field-kept", harness.component.rentalBusyBlocks.value.single().fieldId)
        assertNull(harness.component.loadedRentalAvailabilityWindow.value)
        assertTrue(harness.component.errorState.value?.message.orEmpty().contains("offline"))
        assertFalse(harness.component.isLoadingRentals.value)
    }

    @Test
    fun paidRental_orderFailure_surfaces_durableRetry_without_reporting_a_false_booking() =
        runTest(testDispatcher) {
            val harness = OrganizationDetailHarness(product = createProduct(period = "SINGLE"))
            advance()
            harness.billingRepository.rentalOrderResult = Result.failure(
                IllegalStateException("temporary booking outage"),
            )
            val pending = paidRentalReservation()

            harness.component.completePendingRentalReservation(pending)

            assertEquals(
                listOf(
                    RentalOrderCall(
                        publicSlug = pending.publicSlug,
                        eventId = "booking-paid-1",
                        selections = pending.selections,
                        paymentIntentId = "pi_paid_1",
                        payerUserId = "payer-1",
                    )
                ),
                harness.billingRepository.rentalOrderCalls,
            )
            assertNull(harness.component.completedRentalReservation.value)
            assertNull(harness.component.message.value)
            assertTrue(
                harness.component.errorState.value?.message.orEmpty().contains(
                    "Payment was recorded, but the reservation is still being finalized.",
                ),
            )
            assertTrue(
                harness.component.errorState.value?.message.orEmpty().contains(
                    "It will retry automatically; do not submit another payment.",
                ),
            )
            assertFalse(harness.component.isReservingRental.value)
        }

    @Test
    fun given_completed_rental_when_create_event_now_is_selected_then_canonical_booking_id_reaches_navigation() =
        runTest(testDispatcher) {
            val navigationHandler = RecordingNavigationHandler()
            val harness = OrganizationDetailHarness(
                product = createProduct(period = "SINGLE"),
                navigationHandler = navigationHandler,
            )
            advance()
            harness.billingRepository.rentalOrderResult = Result.success(
                RentalOrderResult(
                    bookingId = "booking-canonical-1",
                    billId = "bill-1",
                    totalCents = 2_500,
                    items = listOf(
                        RentalOrderItem(
                            id = "item-1",
                            fieldId = "field-1",
                            start = "2026-07-13T10:00:00Z",
                            end = "2026-07-13T11:00:00Z",
                        ),
                    ),
                ),
            )

            harness.component.completePendingRentalReservation(paidRentalReservation())

            assertEquals(
                "booking-canonical-1",
                harness.component.completedRentalReservation.value?.bookingId,
            )

            harness.component.createEventFromCompletedRentalReservation()

            assertEquals(listOf("booking-canonical-1"), navigationHandler.rentalBookingIds)
            assertEquals(
                listOf("item-1"),
                navigationHandler.rentalBookingItems.single().map(RentalBookingItemManifest::id),
            )
            assertNull(harness.component.completedRentalReservation.value)
        }

    @Test
    fun paidRental_uses_the_same_exact_selections_for_payment_and_final_order() = runTest(testDispatcher) {
        val harness = OrganizationDetailHarness(
            product = createProduct(period = "SINGLE"),
            rentalCheckoutEnabled = true,
        )
        advance()
        val selections = listOf(
            RentalOrderSelectionRequest(
                key = "monday-court",
                scheduledFieldIds = listOf("field-1"),
                startDate = "2099-07-14T17:00:00Z",
                endDate = "2099-07-14T18:00:00Z",
                timeZone = "America/Los_Angeles",
            ),
            RentalOrderSelectionRequest(
                key = "wednesday-court",
                scheduledFieldIds = listOf("field-2"),
                startDate = "2099-07-16T22:00:00Z",
                endDate = "2099-07-16T23:00:00Z",
                timeZone = "America/Los_Angeles",
            ),
        )
        val context = RentalCreateContext(
            organizationId = "org-1",
            organizationName = "Summit Indoor Volleyball Facility",
            organizationLocation = "Portland, OR",
            organizationCoordinates = null,
            selectedFieldIds = listOf("field-1", "field-2"),
            selectedTimeSlotIds = listOf("slot-1", "slot-2"),
            rentalPriceCents = 5000,
            rentalBookingId = "booking-exact-1",
            startEpochMillis = Instant.parse("2099-07-14T17:00:00Z").toEpochMilliseconds(),
            endEpochMillis = Instant.parse("2099-07-16T23:00:00Z").toEpochMilliseconds(),
        )

        harness.component.startRentalReservation(context, selections)
        advance()

        assertNotNull(harness.billingRepository.testState.purchaseIntentCalls.single().timeSlotContext).also {
            assertEquals(selections, it.rentalSelections)
            assertEquals(context.startEpochMillis, Instant.parse(it.startDate!!).toEpochMilliseconds())
            assertEquals(context.endEpochMillis, Instant.parse(it.endDate!!).toEpochMilliseconds())
        }
        assertEquals(selections, harness.billingRepository.preparedRentalOrderCalls.single().selections)
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
            assertNull(component.teamSignatureSyncProgress.value)
            assertTrue(billingRepository.testState.teamRegistrationPurchaseIntentCalls.isEmpty())

            component.confirmTextSignature()
            testDispatcher.scheduler.runCurrent()

            assertEquals(
                "Waiting for signature sync...",
                component.teamSignatureSyncProgress.value?.message,
            )
            assertNull(component.errorState.value)
            assertNotNull(component.textSignaturePrompt.value)

            testDispatcher.scheduler.advanceTimeBy(2_000L)
            testDispatcher.scheduler.runCurrent()

            assertTrue(component.textSignaturePrompt.value == null)
            assertTrue(component.billingAddressPrompt.value != null)
            assertNull(component.teamSignatureSyncProgress.value)
            assertNull(component.errorState.value)
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
    private val fieldRepository: IFieldRepository = CreateEvent_FakeFieldRepository(),
    rentalCheckoutEnabled: Boolean = false,
    navigationHandler: INavigationHandler = NoopNavigationHandler,
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
        publicSlug = if (rentalCheckoutEnabled) "summit-sports" else null,
        publicPageEnabled = rentalCheckoutEnabled,
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
        fieldRepository = fieldRepository,
        matchRepository = NoopMatchRepository,
        userRepository = CreateEvent_FakeUserRepository(),
        navigationHandler = navigationHandler,
    )
}

private fun organizationReview(id: String, body: String): OrganizationReview = OrganizationReview(
    id = id,
    organizationId = "org-1",
    reviewerUserId = "user-$id",
    rating = 5,
    body = body,
    createdAt = "2026-07-09T20:00:00.000Z",
    updatedAt = "2026-07-09T20:00:00.000Z",
    reviewer = OrganizationReviewReviewer(id = "user-$id", displayName = "Test User $id"),
)

private fun organizationReviewsPayload(
    reviews: List<OrganizationReview>,
    nextCursor: String? = null,
): OrganizationReviewsPayload = OrganizationReviewsPayload(
    summary = OrganizationReviewSummary(
        averageRating = if (reviews.isEmpty()) null else reviews.map(OrganizationReview::rating).average(),
        reviewCount = reviews.size,
        ratingCounts = listOf(0, 0, 0, 0, reviews.size),
    ),
    reviews = reviews,
    nextCursor = nextCursor,
    viewerIsAuthenticated = true,
    canReview = true,
)

private data class RentalOrderCall(
    val publicSlug: String,
    val eventId: String,
    val selections: List<RentalOrderSelectionRequest>,
    val paymentIntentId: String?,
    val payerUserId: String?,
)

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
    val reviewPageCalls = mutableListOf<Pair<String?, Int>>()
    val reviewPageResults = mutableMapOf<String?, Result<OrganizationReviewsPayload>>()
    val deferredReviewPageResults = mutableMapOf<String?, CompletableDeferred<Result<OrganizationReviewsPayload>>>()
    val rentalOrderCalls = mutableListOf<RentalOrderCall>()
    val preparedRentalOrderCalls = mutableListOf<RentalOrderCall>()
    var rentalOrderResult: Result<RentalOrderResult> = Result.failure(
        UnsupportedOperationException("Rental order result is not configured."),
    )
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

    override suspend fun getOrganizationReviews(
        organizationId: String,
        cursor: String?,
        limit: Int,
    ): Result<OrganizationReviewsPayload> {
        reviewPageCalls += cursor to limit
        deferredReviewPageResults[cursor]?.let { deferred -> return deferred.await() }
        return reviewPageResults[cursor] ?: Result.success(reviewPayload)
    }

    override suspend fun createRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String?,
        payerUserId: String?,
        renterOrganizationId: String?,
        sportId: String?,
    ): Result<RentalOrderResult> {
        rentalOrderCalls += RentalOrderCall(
            publicSlug = publicSlug,
            eventId = eventId,
            selections = selections,
            paymentIntentId = paymentIntentId,
            payerUserId = payerUserId,
        )
        return rentalOrderResult
    }

    override suspend fun prepareRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String,
        payerUserId: String,
        renterOrganizationId: String?,
        sportId: String?,
    ): Result<String> {
        preparedRentalOrderCalls += RentalOrderCall(
            publicSlug = publicSlug,
            eventId = eventId,
            selections = selections,
            paymentIntentId = paymentIntentId,
            payerUserId = payerUserId,
        )
        return Result.success("$eventId:$paymentIntentId")
    }

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

private data class RentalAvailabilityRequest(
    val organizationId: String,
    val rangeStart: Instant,
    val rangeEnd: Instant,
)

private class QueuedRentalAvailabilityFieldRepository :
    IFieldRepository by CreateEvent_FakeFieldRepository() {
    val requests = mutableListOf<RentalAvailabilityRequest>()
    val responses = ArrayDeque<CompletableDeferred<Result<RentalAvailabilitySnapshot>>>()

    override suspend fun getRentalAvailability(
        organizationId: String,
        rangeStart: Instant,
        rangeEnd: Instant,
    ): Result<RentalAvailabilitySnapshot> {
        requests += RentalAvailabilityRequest(organizationId, rangeStart, rangeEnd)
        if (responses.isEmpty()) {
            return Result.success(
                RentalAvailabilitySnapshot(
                    rangeStart = rangeStart,
                    rangeEnd = rangeEnd,
                    fields = emptyList(),
                    busyBlocks = emptyList(),
                )
            )
        }
        return responses.removeFirst().await()
    }
}

private fun paidRentalReservation(): PendingRentalReservation = PendingRentalReservation(
    publicSlug = "summit-sports",
    context = RentalCreateContext(
        organizationId = "org-1",
        organizationName = "Summit Sports",
        organizationLocation = "Portland, OR",
        organizationCoordinates = null,
        selectedFieldIds = listOf("field-1"),
        selectedTimeSlotIds = listOf("slot-1"),
        rentalPriceCents = 2500,
        rentalBookingId = "booking-paid-1",
        startEpochMillis = Instant.parse("2026-07-14T17:00:00Z").toEpochMilliseconds(),
        endEpochMillis = Instant.parse("2026-07-14T18:00:00Z").toEpochMilliseconds(),
    ),
    selections = listOf(
        RentalOrderSelectionRequest(
            key = "selection-1",
            scheduledFieldIds = listOf("field-1"),
            startDate = "2026-07-14T17:00:00Z",
            endDate = "2026-07-14T18:00:00Z",
            timeZone = "America/Los_Angeles",
        )
    ),
    payerUserId = "payer-1",
    paymentIntentId = "pi_paid_1",
    pendingOrderId = "booking-paid-1:pi_paid_1",
)

private fun rentalSnapshot(
    rangeStart: Instant,
    rangeEnd: Instant,
    suffix: String,
): RentalAvailabilitySnapshot {
    val fieldId = "field-$suffix"
    val slot = TimeSlot(
        id = "slot-$suffix",
        dayOfWeek = 0,
        daysOfWeek = listOf(0),
        startTimeMinutes = 8 * 60,
        endTimeMinutes = 22 * 60,
        startDate = rangeStart,
        timeZone = "America/Los_Angeles",
        repeating = true,
        endDate = null,
        scheduledFieldId = fieldId,
        scheduledFieldIds = listOf(fieldId),
        price = 2500,
    )
    return RentalAvailabilitySnapshot(
        rangeStart = rangeStart,
        rangeEnd = rangeEnd,
        fields = listOf(
            RentalAvailabilityField(
                field = Field(
                    id = fieldId,
                    fieldNumber = 1,
                    name = "Court $suffix",
                    organizationId = "org-1",
                    rentalSlotIds = listOf(slot.id),
                ),
                rentalSlots = listOf(slot),
            )
        ),
        busyBlocks = listOf(
            RentalAvailabilityBusyBlock(
                fieldId = fieldId,
                start = rangeStart,
                end = rangeStart + 1.hours,
            )
        ),
    )
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
    override fun navigateToMatch(matchId: String, eventId: String) = Unit
    override fun navigateToTeams(freeAgents: List<String>, eventId: String?, selectedFreeAgentId: String?) = Unit
    override fun navigateToChat(messageUserId: String?, chatId: String?) = Unit
    override fun navigateToCreate() = Unit
    override fun navigateToSearch() = Unit
    override fun navigateToEvent(eventId: String) = Unit
    override fun navigateToOrganization(organizationId: String, initialTab: OrganizationDetailTab) = Unit
    override fun navigateToEvents() = Unit
    override fun navigateToRefunds() = Unit
    override fun navigateToLogin() = Unit
    override fun navigateBack() = Unit
}

private class RecordingNavigationHandler : INavigationHandler by NoopNavigationHandler {
    val rentalBookingIds = mutableListOf<String>()
    val rentalBookingItems = mutableListOf<List<RentalBookingItemManifest>>()

    override fun navigateToCreateFromRental(
        rentalBookingId: String,
        rentalBookingItems: List<RentalBookingItemManifest>,
    ) {
        rentalBookingIds += rentalBookingId
        this.rentalBookingItems += rentalBookingItems
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
