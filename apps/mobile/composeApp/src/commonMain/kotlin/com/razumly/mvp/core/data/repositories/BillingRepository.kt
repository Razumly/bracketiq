package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.BillingAddress
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.dtos.RefundRequestDTO
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.jsonMVP
import io.appwrite.Query
import io.appwrite.services.Databases
import io.appwrite.services.Functions
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

interface IBillingRepository : IMVPRepository {
    suspend fun createPurchaseIntent(
        event: EventAbs, teamId: String? = null
    ): Result<PurchaseIntent?>

    suspend fun createAccount(): Result<String>
    suspend fun getOnboardingLink(): Result<String>
    suspend fun leaveAndRefundEvent(event: EventAbs, reason: String): Result<Unit>
    suspend fun deleteAndRefundEvent(event: EventAbs): Result<Unit>

    suspend fun getRefundsWithRelations(): Result<List<RefundRequestWithRelations>>
    suspend fun getRefunds(): Result<List<RefundRequest>>
    suspend fun approveRefund(refundRequest: RefundRequest): Result<Unit>
    suspend fun rejectRefund(refundId: String): Result<Unit>
}

class BillingRepository(
    private val userRepository: IUserRepository,
    private val functions: Functions,
    private val eventRepository: IEventRepository,
    private val tournamentRepository: ITournamentRepository,
    private val databases: Databases,
    private val databaseService: DatabaseService
) : IBillingRepository {
    override suspend fun createPurchaseIntent(
        event: EventAbs, teamId: String?
    ): Result<PurchaseIntent> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val isTournament = when (event) {
            is Tournament -> true
            else -> false
        }
        val response = jsonMVP.decodeFromString<PurchaseIntent>(
            functions.createExecution(
                functionId = DbConstants.BILLING_FUNCTION,
                body = jsonMVP.encodeToString(
                    CreatePurchaseIntent(user.id, event.id, teamId, isTournament)
                ),
                async = false,
            ).responseBody
        )
        if (response.error != null) {
            throw Exception(response.error)
        } else {
            response
        }
    }

    override suspend fun createAccount(): Result<String> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val response = jsonMVP.decodeFromString<CreateAccountResponse>(
            functions.createExecution(
                functionId = DbConstants.BILLING_FUNCTION,
                body = jsonMVP.encodeToString(
                    CreateAccount(user.id)
                ),
                async = false,
            ).responseBody
        )
        response.onboardingUrl
    }

    override suspend fun getOnboardingLink(): Result<String> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        if (user.hasStripeAccount == true) throw Exception("User has no stripe account")

        val response = jsonMVP.decodeFromString<CreateAccountResponse>(
            functions.createExecution(
                functionId = DbConstants.BILLING_FUNCTION,
                body = jsonMVP.encodeToString(GetHostOnboardingLink(user.id)),
                async = false,
            ).responseBody
        )
        response.onboardingUrl
    }

    override suspend fun leaveAndRefundEvent(event: EventAbs, reason: String): Result<Unit> =
        runCatching {
            val response = functions.createExecution(
                DbConstants.BILLING_FUNCTION, jsonMVP.encodeToString(
                    RefundApiRequest(
                        eventId = event.id,
                        userId = userRepository.currentUser.value.getOrThrow().id,
                        reason = reason,
                        isTournament = when (event) {
                            is Tournament -> true
                            else -> false
                        }
                    )
                )
            )

            val refundResponse = jsonMVP.decodeFromString<RefundResponse>(response.responseBody)
            if (!refundResponse.error.isNullOrBlank()) {
                throw Exception(refundResponse.error)
            }
            if (refundResponse.success == false) {
                throw Exception(refundResponse.message)
            }
        }

    override suspend fun deleteAndRefundEvent(event: EventAbs): Result<Unit> = runCatching {
        val isTournament = when (event) {
            is Tournament -> true
            else -> false
        }
        val response = functions.createExecution(
            DbConstants.BILLING_FUNCTION,
            jsonMVP.encodeToString(RefundFullEvent(eventId = event.id, isTournament = isTournament))
        )

        val refundResponse = jsonMVP.decodeFromString<RefundResponse>(response.responseBody)
        if (!refundResponse.error.isNullOrBlank()) {
            throw Exception(refundResponse.error)
        }
        if (refundResponse.success == false) {
            throw Exception(refundResponse.message)
        }
        when (event) {
            is Tournament -> tournamentRepository.deleteTournament(event.id)
            is EventImp -> eventRepository.deleteEvent(event.id)
        }
    }

    override suspend fun getRefundsWithRelations(): Result<List<RefundRequestWithRelations>> =
        runCatching {
            val currentUserId = userRepository.currentUser.value.getOrThrow().id

            val serverRefunds = databases.listDocuments(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.REFUNDS_COLLECTION,
                queries = listOf(
                    Query.contains("hostId", currentUserId)
                ),
                nestedType = RefundRequestDTO::class
            ).documents.map { it.data.toRefundRequest(it.id) }

            databaseService.getRefundRequestDao.upsertRefundRequests(serverRefunds)

            serverRefunds.forEach { refund ->
                userRepository.getUsers(listOf(refund.userId)).onSuccess { _ ->
                }

                if (refund.isTournament) {
                    tournamentRepository.getTournament(refund.eventId).onSuccess { _ ->
                    }
                } else {
                    eventRepository.getEvent(refund.eventId).onSuccess { _ ->
                    }
                }
            }

            databaseService.getRefundRequestDao.getRefundRequestsWithRelations(currentUserId)
        }

    override suspend fun getRefunds(): Result<List<RefundRequest>> = runCatching {
        val currentUserId = userRepository.currentUser.value.getOrThrow().id

        val serverRefunds = databases.listDocuments(
            databaseId = DbConstants.DATABASE_NAME,
            collectionId = DbConstants.REFUNDS_COLLECTION,
            queries = listOf(
                Query.contains("hostId", currentUserId)
            ),
            nestedType = RefundRequestDTO::class
        ).documents.map { it.data.toRefundRequest(it.id) }

        databaseService.getRefundRequestDao.upsertRefundRequests(serverRefunds)

        serverRefunds
    }

    override suspend fun approveRefund(refundRequest: RefundRequest): Result<Unit> = runCatching {
        val response = functions.createExecution(
            DbConstants.BILLING_FUNCTION, jsonMVP.encodeToString(
                RefundApiRequest(
                    eventId = refundRequest.eventId,
                    userId = refundRequest.userId,
                    reason = "requested_by_host",
                    isTournament = refundRequest.isTournament
                )
            )
        )

        val refundResponse = jsonMVP.decodeFromString<RefundResponse>(response.responseBody)
        if (!refundResponse.error.isNullOrBlank()) {
            throw Exception(refundResponse.error)
        }

        if (refundResponse.success == false) {
            throw Exception(refundResponse.message)
        }

        databaseService.getRefundRequestDao.deleteRefundRequest(refundRequest.id)
    }

    override suspend fun rejectRefund(refundId: String): Result<Unit> = runCatching {
        databases.deleteDocument(
            databaseId = DbConstants.DATABASE_NAME,
            collectionId = DbConstants.REFUNDS_COLLECTION,
            documentId = refundId
        )

        databaseService.getRefundRequestDao.deleteRefundRequest(refundId)
    }
}

@OptIn(ExperimentalSerializationApi::class)
@Serializable
private data class CreatePurchaseIntent(
    val userId: String,
    val eventId: String,
    val teamId: String?,
    val isTournament: Boolean,
    @EncodeDefault val command: String = "create_purchase_intent",
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
private data class CreateAccount(
    val userId: String,
    @EncodeDefault val command: String = "connect_host_account",
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
private data class CreateCustomer(
    val userId: String,
    @EncodeDefault val command: String = "create_customer",
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
private data class GetHostOnboardingLink(
    val userId: String,
    @EncodeDefault val command: String = "get_host_onboarding_link",
)

@Serializable
@OptIn(ExperimentalTime::class)
private data class CreateAccountResponse(
    val onboardingUrl: String,
    val expiresAt: Long,
) {
    fun getExpirationDate(): String {
        return Instant.fromEpochSeconds(expiresAt).toString()
    }
}

@Serializable
data class PurchaseIntent(
    val paymentIntent: String? = null,
    val ephemeralKey: String? = null,
    val customer: String? = null,
    val publishableKey: String? = null,
    val feeBreakdown: FeeBreakdown? = null,
    val error: String? = null,
)

@Serializable
data class FeeBreakdown(
    val eventPrice: Int,
    val stripeFee: Int,
    val processingFee: Int,
    val totalCharge: Int,
    val hostReceives: Int,
    val feePercentage: Float,
)

@Serializable
@OptIn(ExperimentalSerializationApi::class)
data class RefundApiRequest(
    @EncodeDefault val command: String = "refund_payment",
    val isTournament: Boolean,
    val userId: String,
    val eventId: String,
    val reason: String,
)

@Serializable
@OptIn(ExperimentalSerializationApi::class)
data class RefundFullEvent(
    @EncodeDefault val command: String = "refund_all_payments",
    val eventId: String,
    val isTournament: Boolean,
)

@Serializable
data class RefundResponse(
    val refundId: String? = null,
    val success: Boolean? = null,
    val emailSent: Boolean? = null,
    val message: String? = null,
    val amount: Int? = null,
    val reason: String? = null,
    val error: String? = null,
)