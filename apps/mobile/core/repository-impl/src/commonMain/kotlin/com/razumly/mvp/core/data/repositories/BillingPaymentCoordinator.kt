package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillPayment
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressProfile
import com.razumly.mvp.core.data.dataTypes.ManualPaymentProof
import com.razumly.mvp.core.data.dataTypes.Subscription
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.BillingAddressDto
import com.razumly.mvp.core.network.dto.BillingEventRefDto
import com.razumly.mvp.core.network.dto.BillingUserRefDto
import io.ktor.http.encodeURLQueryComponent

/** Owns bills, team billing, payment lifecycle, billing addresses, and subscriptions. */
internal class BillingPaymentCoordinator(
    private val api: MvpApiClient,
    private val userRepository: IUserRepository,
) {
    suspend fun listBills(ownerType: String, ownerId: String, limit: Int): Result<List<Bill>> =
        runCatching {
            val encodedOwnerType = ownerType.encodeURLQueryComponent()
            val encodedOwnerId = ownerId.encodeURLQueryComponent()
            val response = api.get<BillsResponseDto>(
                path = "api/billing/bills?ownerType=$encodedOwnerType&ownerId=$encodedOwnerId&limit=$limit",
            )
            response.bills.mapNotNull { it.toBillOrNull() }
        }

    suspend fun listBillsPage(
        ownerType: String,
        ownerId: String,
        limit: Int,
        offset: Int,
    ): Result<RepositoryPage<Bill>> = runCatching {
        val normalizedLimit = limit.coerceIn(1, 200)
        val normalizedOffset = offset.coerceAtLeast(0)
        val encodedOwnerType = ownerType.encodeURLQueryComponent()
        val encodedOwnerId = ownerId.encodeURLQueryComponent()
        val response = api.get<BillsResponseDto>(
            path = "api/billing/bills?ownerType=$encodedOwnerType&ownerId=$encodedOwnerId" +
                "&limit=$normalizedLimit&offset=$normalizedOffset",
        )

        if (response.pagination != null || normalizedOffset == 0) {
            val bills = response.bills.mapNotNull { it.toBillOrNull() }
            return@runCatching RepositoryPage(
                items = bills,
                pagination = response.pagination.toRepositoryPagination(
                    fallbackLimit = normalizedLimit,
                    fallbackOffset = normalizedOffset,
                    fallbackItemCount = bills.size,
                ),
            )
        }

        // Older servers ignore offset and omit pagination metadata. During a
        // rolling deploy, expand the requested prefix and slice it locally so
        // older unpaid bills are still reachable instead of repeating page one.
        val prefixLimit = (normalizedOffset.toLong() + normalizedLimit.toLong())
            .coerceAtMost(Int.MAX_VALUE.toLong())
            .toInt()
        val legacyResponse = api.get<BillsResponseDto>(
            path = "api/billing/bills?ownerType=$encodedOwnerType&ownerId=$encodedOwnerId&limit=$prefixLimit",
        )
        val prefix = legacyResponse.bills.mapNotNull { it.toBillOrNull() }
        val bills = prefix.drop(normalizedOffset).take(normalizedLimit)
        RepositoryPage(
            items = bills,
            pagination = RepositoryPagination(
                limit = normalizedLimit,
                offset = normalizedOffset,
                nextOffset = normalizedOffset + bills.size,
                hasMore = prefix.size >= prefixLimit,
            ),
        )
    }

    suspend fun createBill(request: CreateBillRequest): Result<Bill> = runCatching {
        val ownerType = request.ownerType.trim().uppercase()
        if (ownerType != "USER" && ownerType != "TEAM") {
            throw IllegalArgumentException("Bill ownerType must be USER or TEAM.")
        }

        val ownerId = request.ownerId.trim()
        if (ownerId.isEmpty()) {
            throw IllegalArgumentException("Bill ownerId is required.")
        }

        if (request.totalAmountCents <= 0) {
            throw IllegalArgumentException("Bill totalAmountCents must be greater than 0.")
        }

        val currentUser = userRepository.currentUser.value.getOrNull()
        val currentAccount = userRepository.currentAccount.value.getOrNull()
        val response = api.post<CreateBillRequestDto, CreateBillResponseDto>(
            path = "api/billing/bills",
            body = CreateBillRequestDto(
                ownerType = ownerType,
                ownerId = ownerId,
                totalAmountCents = request.totalAmountCents,
                eventId = request.eventId?.trim()?.takeIf(String::isNotBlank),
                slotId = request.slotId?.trim()?.takeIf(String::isNotBlank),
                occurrenceDate = request.occurrenceDate?.trim()?.takeIf(String::isNotBlank),
                organizationId = request.organizationId?.trim()?.takeIf(String::isNotBlank),
                installmentAmounts = request.installmentAmounts.takeIf { it.isNotEmpty() },
                installmentDueDates = request.installmentDueDates.takeIf { it.isNotEmpty() },
                installmentDueRelativeDays = request.installmentDueRelativeDays.takeIf { it.isNotEmpty() },
                allowSplit = request.allowSplit,
                paymentPlanEnabled = request.paymentPlanEnabled,
                event = request.eventId?.trim()?.takeIf(String::isNotBlank)?.let { eventId ->
                    BillingEventRefDto(
                        id = eventId,
                        priceCents = request.totalAmountCents,
                        organizationId = request.organizationId?.trim()?.takeIf(String::isNotBlank),
                    )
                },
                user = currentUser?.let { user ->
                    BillingUserRefDto(
                        id = user.id,
                        email = currentAccount?.email,
                    )
                },
            ),
        )

        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.bill?.toBillOrNull() ?: error("Create bill response missing bill")
    }

    suspend fun getBillPayments(billId: String): Result<List<BillPayment>> = runCatching {
        val encodedBillId = billId.encodeURLQueryComponent()
        val response = api.get<BillPaymentsResponseDto>(path = "api/billing/bills/$encodedBillId/payments")
        response.payments.mapNotNull { it.toBillPaymentOrNull() }
    }

    suspend fun getEventTeamBillingSnapshot(
        eventId: String,
        teamId: String,
    ): Result<EventTeamBillingSnapshot> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedTeamId = teamId.trim()
        require(normalizedEventId.isNotBlank()) { "Event id is required." }
        require(normalizedTeamId.isNotBlank()) { "Team id is required." }

        val encodedEventId = normalizedEventId.encodeURLQueryComponent()
        val encodedTeamId = normalizedTeamId.encodeURLQueryComponent()
        val response = api.get<EventTeamBillingSnapshotResponseDto>(
            path = "api/events/$encodedEventId/teams/$encodedTeamId/billing",
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.toSnapshotOrNull() ?: error("Billing snapshot response missing required fields")
    }

    suspend fun createEventTeamBill(
        eventId: String,
        teamId: String,
        request: EventTeamBillCreateRequest,
    ): Result<Bill> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedTeamId = teamId.trim()
        require(normalizedEventId.isNotBlank()) { "Event id is required." }
        require(normalizedTeamId.isNotBlank()) { "Team id is required." }

        val ownerType = request.ownerType.trim().uppercase()
        if (ownerType != "USER" && ownerType != "TEAM") {
            throw IllegalArgumentException("Bill ownerType must be USER or TEAM.")
        }

        val ownerId = request.ownerId?.trim()?.takeIf(String::isNotBlank)
        if (ownerType == "USER" && ownerId == null) {
            throw IllegalArgumentException("ownerId is required for USER bills.")
        }
        if (request.eventAmountCents <= 0) {
            throw IllegalArgumentException("eventAmountCents must be greater than 0.")
        }
        if (request.taxAmountCents < 0) {
            throw IllegalArgumentException("taxAmountCents must be zero or greater.")
        }

        val encodedEventId = normalizedEventId.encodeURLQueryComponent()
        val encodedTeamId = normalizedTeamId.encodeURLQueryComponent()
        val response = api.post<EventTeamBillCreateRequestDto, CreateBillResponseDto>(
            path = "api/events/$encodedEventId/teams/$encodedTeamId/billing/bills",
            body = EventTeamBillCreateRequestDto(
                ownerType = ownerType,
                ownerId = ownerId,
                eventAmountCents = request.eventAmountCents,
                taxAmountCents = request.taxAmountCents,
                allowSplit = request.allowSplit,
                label = request.label?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.bill?.toBillOrNull() ?: error("Create team bill response missing bill")
    }

    suspend fun createEventTeamPaymentCheckout(
        eventId: String,
        teamId: String,
        request: EventTeamPaymentCheckoutRequest,
    ): Result<EventTeamPaymentCheckout> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedTeamId = teamId.trim()
        require(normalizedEventId.isNotBlank()) { "Event id is required." }
        require(normalizedTeamId.isNotBlank()) { "Team id is required." }

        val ownerType = request.ownerType.trim().uppercase()
        if (ownerType != "USER" && ownerType != "TEAM") {
            throw IllegalArgumentException("Bill ownerType must be USER or TEAM.")
        }

        val ownerId = request.ownerId?.trim()?.takeIf(String::isNotBlank)
        if (ownerType == "USER" && ownerId == null) {
            throw IllegalArgumentException("ownerId is required for USER payments.")
        }
        if (request.eventAmountCents <= 0) {
            throw IllegalArgumentException("eventAmountCents must be greater than 0.")
        }
        if (request.taxAmountCents < 0) {
            throw IllegalArgumentException("taxAmountCents must be zero or greater.")
        }

        val encodedEventId = normalizedEventId.encodeURLQueryComponent()
        val encodedTeamId = normalizedTeamId.encodeURLQueryComponent()
        val response = api.post<EventTeamPaymentCheckoutRequestDto, EventTeamPaymentCheckoutResponseDto>(
            path = "api/events/$encodedEventId/teams/$encodedTeamId/billing/checkout",
            body = EventTeamPaymentCheckoutRequestDto(
                ownerType = ownerType,
                ownerId = ownerId,
                eventAmountCents = request.eventAmountCents,
                taxAmountCents = request.taxAmountCents,
                divisionId = request.divisionId?.trim()?.takeIf(String::isNotBlank),
                label = request.label?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.toPaymentCheckoutOrNull() ?: error("Create payment checkout response missing checkout URL")
    }

    suspend fun refundEventTeamBillPayment(
        eventId: String,
        teamId: String,
        billPaymentId: String,
        amountCents: Int,
    ): Result<Unit> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedTeamId = teamId.trim()
        val normalizedBillPaymentId = billPaymentId.trim()
        require(normalizedEventId.isNotBlank()) { "Event id is required." }
        require(normalizedTeamId.isNotBlank()) { "Team id is required." }
        require(normalizedBillPaymentId.isNotBlank()) { "Bill payment id is required." }
        require(amountCents > 0) { "Refund amount must be greater than 0." }

        val encodedEventId = normalizedEventId.encodeURLQueryComponent()
        val encodedTeamId = normalizedTeamId.encodeURLQueryComponent()
        val response = api.post<EventTeamBillRefundRequestDto, EventTeamBillRefundResponseDto>(
            path = "api/events/$encodedEventId/teams/$encodedTeamId/billing/refunds",
            body = EventTeamBillRefundRequestDto(
                billPaymentId = normalizedBillPaymentId,
                amountCents = amountCents,
            ),
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
    }

    suspend fun createBillingIntent(billId: String, billPaymentId: String): Result<PurchaseIntent> = runCatching {
        val user = userRepository.currentUser.value.getOrNull()
        val response = api.post<CreateBillingIntentRequestDto, PurchaseIntent>(
            path = "api/billing/create_billing_intent",
            body = CreateBillingIntentRequestDto(
                billId = billId,
                billPaymentId = billPaymentId,
                user = user?.let {
                    BillingUserRefDto(
                        id = it.id,
                        email = userRepository.currentAccount.value.getOrNull()?.email,
                    )
                },
            ),
        )
        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        AnalyticsTracker.capture(
            AnalyticsEvent.CheckoutStarted,
            mapOf(
                "checkout_type" to "bill_payment",
                "bill_id" to billId,
                "bill_payment_id" to billPaymentId,
            ),
        )
        response
    }

    suspend fun markBillingPaymentProcessing(
        billId: String,
        billPaymentId: String,
        paymentIntent: String,
    ): Result<Bill> = runCatching {
        val normalizedBillId = billId.trim()
        val normalizedPaymentId = billPaymentId.trim()
        val normalizedPaymentIntent = paymentIntent.trim()
        require(normalizedBillId.isNotBlank()) { "Bill id is required." }
        require(normalizedPaymentId.isNotBlank()) { "Bill payment id is required." }
        require(normalizedPaymentIntent.isNotBlank()) { "Payment intent is required." }

        val response = api.post<MarkBillPaymentProcessingRequestDto, CreateBillResponseDto>(
            path = "api/billing/bills/${normalizedBillId.encodeURLQueryComponent()}/payments/${normalizedPaymentId.encodeURLQueryComponent()}/processing",
            body = MarkBillPaymentProcessingRequestDto(paymentIntent = normalizedPaymentIntent),
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.bill?.toBillOrNull() ?: throw Exception("Payment status response is missing bill.")
    }

    suspend fun cancelBillPayment(billId: String, billPaymentId: String): Result<Bill> = runCatching {
        val normalizedBillId = billId.trim()
        val normalizedPaymentId = billPaymentId.trim()
        require(normalizedBillId.isNotBlank()) { "Bill id is required." }
        require(normalizedPaymentId.isNotBlank()) { "Bill payment id is required." }

        val response = api.post<EmptyRequestDto, CreateBillResponseDto>(
            path = "api/billing/bills/${normalizedBillId.encodeURLQueryComponent()}/payments/${normalizedPaymentId.encodeURLQueryComponent()}/cancel",
            body = EmptyRequestDto(),
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.bill?.toBillOrNull() ?: throw Exception("Cancel response is missing bill.")
    }

    suspend fun submitManualPaymentProof(
        billId: String,
        billPaymentId: String,
        fileId: String,
    ): Result<ManualPaymentProof> = runCatching {
        val normalizedBillId = billId.trim()
        val normalizedPaymentId = billPaymentId.trim()
        val normalizedFileId = fileId.trim()
        require(normalizedBillId.isNotBlank()) { "Bill id is required." }
        require(normalizedPaymentId.isNotBlank()) { "Bill payment id is required." }
        require(normalizedFileId.isNotBlank()) { "Proof image is required." }

        val response = api.post<ManualPaymentProofSubmitRequestDto, ManualPaymentProofResponseDto>(
            path = "api/billing/bills/${normalizedBillId.encodeURLQueryComponent()}/payments/${normalizedPaymentId.encodeURLQueryComponent()}/proof",
            body = ManualPaymentProofSubmitRequestDto(fileId = normalizedFileId),
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.proof?.toManualPaymentProofOrNull()
            ?: throw Exception("Proof upload response is missing proof.")
    }

    suspend fun reviewManualPaymentProof(
        billId: String,
        billPaymentId: String,
        proofId: String,
        decision: String,
        amountAcceptedCents: Int?,
        reviewNote: String?,
    ): Result<Bill> = runCatching {
        val normalizedBillId = billId.trim()
        val normalizedPaymentId = billPaymentId.trim()
        val normalizedProofId = proofId.trim()
        val normalizedDecision = decision.trim().uppercase()
        require(normalizedBillId.isNotBlank()) { "Bill id is required." }
        require(normalizedPaymentId.isNotBlank()) { "Bill payment id is required." }
        require(normalizedProofId.isNotBlank()) { "Proof id is required." }
        require(normalizedDecision == "ACCEPT" || normalizedDecision == "REJECT") {
            "Proof decision must be ACCEPT or REJECT."
        }
        if (normalizedDecision == "ACCEPT") {
            require((amountAcceptedCents ?: 0) > 0) { "Accepted amount must be greater than 0." }
        }

        val response = api.post<ManualPaymentProofReviewRequestDto, CreateBillResponseDto>(
            path = "api/billing/bills/${normalizedBillId.encodeURLQueryComponent()}/payments/${normalizedPaymentId.encodeURLQueryComponent()}/proofs/${normalizedProofId.encodeURLQueryComponent()}/review",
            body = ManualPaymentProofReviewRequestDto(
                decision = normalizedDecision,
                amountAcceptedCents = amountAcceptedCents?.coerceAtLeast(0),
                reviewNote = reviewNote?.trim()?.takeIf(String::isNotBlank),
            ),
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.bill?.toBillOrNull() ?: throw Exception("Proof review response is missing bill.")
    }

    suspend fun getBillingAddress(): Result<BillingAddressProfile> = runCatching {
        val response = api.get<BillingAddressResponseDto>(path = "api/profile/billing-address")
        response.toBillingAddressProfile()
    }

    suspend fun updateBillingAddress(address: BillingAddressDraft): Result<BillingAddressProfile> = runCatching {
        val normalizedAddress = address.normalized()
        if (!normalizedAddress.isCompleteForUsTax()) {
            throw IllegalArgumentException("A complete US billing address is required.")
        }

        val response = api.patch<UpdateBillingAddressRequestDto, BillingAddressResponseDto>(
            path = "api/profile/billing-address",
            body = UpdateBillingAddressRequestDto(
                billingAddress = BillingAddressDto.fromDraft(normalizedAddress),
            ),
        )
        response.toBillingAddressProfile()
    }

    suspend fun listSubscriptions(userId: String, limit: Int): Result<List<Subscription>> = runCatching {
        val encodedUserId = userId.encodeURLQueryComponent()
        api.get<SubscriptionsResponseDto>(
            path = "api/subscriptions?userId=$encodedUserId&limit=$limit",
        ).subscriptions.mapNotNull { it.toSubscriptionOrNull() }
    }

    suspend fun cancelSubscription(subscriptionId: String): Result<Boolean> = runCatching {
        val encodedId = subscriptionId.encodeURLQueryComponent()
        val result = api.delete<EmptyRequestDto, SubscriptionStatusResponseDto>(
            path = "api/subscriptions/$encodedId",
            body = EmptyRequestDto(),
        )
        if (!result.error.isNullOrBlank()) {
            throw Exception(result.error)
        }
        result.cancelled ?: false
    }

    suspend fun restartSubscription(subscriptionId: String): Result<Boolean> = runCatching {
        val encodedId = subscriptionId.encodeURLQueryComponent()
        val result = api.patch<EmptyRequestDto, SubscriptionStatusResponseDto>(
            path = "api/subscriptions/$encodedId",
            body = EmptyRequestDto(),
        )
        if (!result.error.isNullOrBlank()) {
            throw Exception(result.error)
        }
        result.restarted ?: false
    }
}
