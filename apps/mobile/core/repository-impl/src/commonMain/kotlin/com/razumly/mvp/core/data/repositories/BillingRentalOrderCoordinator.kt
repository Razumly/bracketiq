package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_PENDING
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_REJECTED
import com.razumly.mvp.core.data.dataTypes.PendingRentalOrder
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.http.encodeURLQueryComponent
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

/** Owns prepared rental-order persistence, retry policy, submission, and resource discovery. */
internal class BillingRentalOrderCoordinator(
    private val api: MvpApiClient,
    private val userRepository: IUserRepository,
    private val databaseService: DatabaseService,
) {
    suspend fun prepareRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String,
        payerUserId: String,
        renterOrganizationId: String?,
        sportId: String?,
    ): Result<String> = runCatching {
        val normalizedPaymentIntentId = paymentIntentId.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("A rental payment intent is required.")
        if (payerUserId.trim() != currentPayerUserId()) {
            throw RentalOrderPayerMismatchException(
                "Sign in as the original renter before continuing this rental checkout.",
            )
        }
        val pendingOrder = buildPendingRentalOrder(
            publicSlug = publicSlug,
            eventId = eventId,
            selections = selections,
            paymentIntentId = normalizedPaymentIntentId,
            payerUserId = payerUserId,
            renterOrganizationId = renterOrganizationId,
            sportId = sportId,
            status = PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT,
        )
        databaseService.getPendingRentalOrderDao.upsert(pendingOrder)
        pendingOrder.id
    }

    suspend fun discardPreparedRentalOrder(orderId: String): Result<Unit> = runCatching {
        val normalizedOrderId = orderId.trim().takeIf(String::isNotBlank) ?: return@runCatching
        databaseService.getPendingRentalOrderDao.deleteById(normalizedOrderId)
    }

    suspend fun createRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String?,
        payerUserId: String?,
        renterOrganizationId: String?,
        sportId: String?,
    ): Result<RentalOrderResult> = runCatching {
        val activePayerUserId = currentPayerUserId()
        val expectedPayerUserId = payerUserId?.trim()?.takeIf(String::isNotBlank) ?: activePayerUserId
        if (expectedPayerUserId != activePayerUserId) {
            throw RentalOrderPayerMismatchException(
                "Sign in as the original renter before continuing this rental checkout.",
            )
        }
        val pendingOrder = buildPendingRentalOrder(
            publicSlug = publicSlug,
            eventId = eventId,
            selections = selections,
            paymentIntentId = paymentIntentId,
            payerUserId = expectedPayerUserId,
            renterOrganizationId = renterOrganizationId,
            sportId = sportId,
            status = PENDING_RENTAL_ORDER_STATUS_PENDING,
        )
        databaseService.getPendingRentalOrderDao.upsert(pendingOrder)
        try {
            submitPendingRentalOrder(pendingOrder).also {
                databaseService.getPendingRentalOrderDao.deleteById(pendingOrder.id)
            }
        } catch (error: Throwable) {
            recordPendingRentalOrderFailure(pendingOrder, error)
            if (error.isTerminalRentalOrderFailure()) {
                throw RentalOrderTerminalFailureException(
                    "The payment was recorded, but this reservation needs staff assistance: ${error.message.orEmpty()}",
                    error,
                )
            }
            throw error
        }
    }

    suspend fun syncPendingRentalOrders(): Result<Int> = runCatching {
        val payerUserId = currentPayerUserId()
        var completed = 0
        databaseService.getPendingRentalOrderDao.retryableOrders(payerUserId).forEach { pendingOrder ->
            runCatching { submitPendingRentalOrder(pendingOrder) }
                .onSuccess {
                    databaseService.getPendingRentalOrderDao.deleteById(pendingOrder.id)
                    completed += 1
                }
                .onFailure { error -> recordPendingRentalOrderFailure(pendingOrder, error) }
        }
        completed
    }

    suspend fun listRentalResourceOptions(
        eventId: String?,
        organizationId: String?,
    ): Result<List<RentalResourceOption>> = runCatching {
        val query = buildList {
            eventId?.trim()?.takeIf(String::isNotBlank)?.let { id ->
                add("eventId=${id.encodeURLQueryComponent()}")
            }
            organizationId?.trim()?.takeIf(String::isNotBlank)?.let { id ->
                add("organizationId=${id.encodeURLQueryComponent()}")
            }
        }.joinToString("&")
        val path = if (query.isBlank()) "api/rentals/bookings" else "api/rentals/bookings?$query"
        api.get<RentalBookingsResponseDto>(path).toRentalResourceOptions()
    }

    private suspend fun submitPendingRentalOrder(pendingOrder: PendingRentalOrder): RentalOrderResult {
        val selections = jsonMVP.decodeFromString<List<RentalOrderSelectionRequest>>(pendingOrder.selectionsJson)
        AnalyticsTracker.capture(
            AnalyticsEvent.RentalCheckoutStarted,
            buildMap {
                put("organization_slug", pendingOrder.publicSlug)
                put("event_id", pendingOrder.eventId)
                put("selection_count", selections.size.toString())
                pendingOrder.renterOrganizationId?.let { put("renter_organization_id", it) }
            },
        )
        val response = api.post<CreateRentalOrderRequestDto, RentalOrderResponseDto>(
            path = "api/public/organizations/${pendingOrder.publicSlug.encodeURLQueryComponent()}/rental-orders",
            body = CreateRentalOrderRequestDto(
                eventId = pendingOrder.eventId,
                selections = selections,
                sportId = pendingOrder.sportId,
                paymentIntentId = pendingOrder.paymentIntentId,
                renterOrganizationId = pendingOrder.renterOrganizationId,
            ),
        )
        response.error?.trim()?.takeIf(String::isNotBlank)?.let(::error)
        return response.toRentalOrderResultOrNull(selections) ?: error("Unable to create rental order.")
    }

    private suspend fun recordPendingRentalOrderFailure(
        pendingOrder: PendingRentalOrder,
        error: Throwable,
    ) {
        val message = error.message ?: "Unable to reserve paid rental resources."
        val attemptedAt = kotlin.time.Clock.System.now().toString()
        if (error.isPaymentStillAwaiting()) {
            databaseService.getPendingRentalOrderDao.markAwaitingPayment(
                id = pendingOrder.id,
                error = message,
                attemptedAt = attemptedAt,
            )
        } else if (error.isTerminalRentalOrderFailure()) {
            databaseService.getPendingRentalOrderDao.markRejected(
                id = pendingOrder.id,
                error = message,
                attemptedAt = attemptedAt,
                status = PENDING_RENTAL_ORDER_STATUS_REJECTED,
            )
        } else {
            databaseService.getPendingRentalOrderDao.markFailed(
                id = pendingOrder.id,
                error = message,
                attemptedAt = attemptedAt,
            )
        }
    }

    private fun buildPendingRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String?,
        payerUserId: String,
        renterOrganizationId: String?,
        sportId: String?,
        status: String,
    ): PendingRentalOrder {
        val normalizedSlug = publicSlug.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("This organization needs a public rental checkout before resources can be reserved.")
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("Rental booking id is required.")
        val normalizedPayerUserId = payerUserId.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("A signed-in renter is required.")
        val normalizedSelections = selections.mapNotNull { selection ->
            val fieldIds = selection.scheduledFieldIds
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct()
            if (fieldIds.isEmpty()) return@mapNotNull null
            selection.copy(
                key = selection.key?.trim()?.takeIf(String::isNotBlank),
                scheduledFieldIds = fieldIds,
                daysOfWeek = selection.daysOfWeek.distinct(),
                timeZone = selection.timeZone?.trim()?.takeIf(String::isNotBlank),
            )
        }
        if (normalizedSelections.isEmpty()) throw IllegalArgumentException("Select at least one rental slot.")

        val normalizedPaymentIntentId = paymentIntentId?.trim()?.takeIf(String::isNotBlank)
        return PendingRentalOrder(
            id = "$normalizedEventId:${normalizedPaymentIntentId ?: "free"}",
            publicSlug = normalizedSlug,
            eventId = normalizedEventId,
            selectionsJson = jsonMVP.encodeToString(normalizedSelections),
            paymentIntentId = normalizedPaymentIntentId,
            payerUserId = normalizedPayerUserId,
            renterOrganizationId = renterOrganizationId?.trim()?.takeIf(String::isNotBlank),
            sportId = sportId?.trim()?.takeIf(String::isNotBlank),
            status = status,
            createdAt = kotlin.time.Clock.System.now().toString(),
        )
    }

    private fun currentPayerUserId(): String =
        userRepository.currentUser.value.getOrNull()?.id?.trim()?.takeIf(String::isNotBlank)
            ?: throw IllegalStateException("A signed-in renter is required.")

    private fun Throwable.isPaymentStillAwaiting(): Boolean = this is ApiException && statusCode == 402

    private fun Throwable.isTerminalRentalOrderFailure(): Boolean =
        this is ApiException && statusCode in 400..499 && statusCode !in setOf(402, 408, 429)
}
