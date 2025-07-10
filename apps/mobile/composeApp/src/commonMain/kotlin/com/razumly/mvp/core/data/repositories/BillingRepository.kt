package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.services.Functions
import kotlinx.datetime.Instant
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

interface IBillingRepository : IMVPRepository {
    suspend fun createPurchaseIntent(
        event: EventAbs, teamId: String? = null
    ): Result<PurchaseIntent?>

    suspend fun createAccount(): Result<String>
    suspend fun createCustomer(): Result<Unit>
    suspend fun getOnboardingLink(): Result<String>
    suspend fun leaveAndRefundEvent(event: EventAbs): Result<Unit>
}

class BillingRepository(
    private val userRepository: IUserRepository, private val functions: Functions
) : IBillingRepository {
    override suspend fun createPurchaseIntent(
        event: EventAbs, teamId: String?
    ): Result<PurchaseIntent> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val isTournament = when (event) {
            is Tournament -> true
            else -> false
        }
        val response = Json.decodeFromString<PurchaseIntent>(
            functions.createExecution(
                functionId = DbConstants.BILLING_FUNCTION,
                body = Json.encodeToString(
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
        val response = Json.decodeFromString<CreateAccountResponse>(
            functions.createExecution(
                functionId = DbConstants.BILLING_FUNCTION,
                body = Json.encodeToString(
                    CreateAccount(user.id)
                ),
                async = false,
            ).responseBody
        )
        userRepository.updateUser(user.copy(stripeAccountId = response.accountId))
        response.onboardingUrl
    }

    override suspend fun createCustomer(): Result<Unit> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val response = Json.decodeFromString<CreateAccountResponse>(
            functions.createExecution(
                functionId = DbConstants.BILLING_FUNCTION,
                body = Json.encodeToString(
                    CreateCustomer(user.id)
                ),
                async = false,
            ).responseBody
        )
        userRepository.updateUser(user.copy(stripeCustomerId = response.accountId))
    }

    override suspend fun getOnboardingLink(): Result<String> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        if (user.stripeAccountId?.isBlank() == true) throw Exception("User has no stripe account")

        val response = Json.decodeFromString<CreateAccountResponse>(
            functions.createExecution(
                functionId = DbConstants.BILLING_FUNCTION,
                body = Json.encodeToString(
                    user.stripeAccountId?.let { GetHostOnboardingLink(it) }
                ),
                async = false,
            ).responseBody
        )
        userRepository.updateUser(user.copy(stripeAccountId = response.accountId))
        response.onboardingUrl
        }

    override suspend fun leaveAndRefundEvent(event: EventAbs): Result<Unit> =
    runCatching {
        val response = functions.createExecution(
            DbConstants.BILLING_FUNCTION,
            Json.encodeToString(RefundRequest(
                eventId = event.id,
                userId = userRepository.currentUser.value.getOrThrow().id,
            ))
        )

        val refundResponse = Json.decodeFromString<RefundResponse>(response.responseBody)
        if (!refundResponse.error.isNullOrBlank()) {
            throw Exception(refundResponse.error)
        }
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
    val accountId: String,
    @EncodeDefault val command: String = "get_host_onboarding_link",
)

@Serializable
private data class CreateAccountResponse(
    val accountId: String,
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
    val error: String? = null,
)

@Serializable
@OptIn(ExperimentalSerializationApi::class)
data class RefundRequest(
    @EncodeDefault val command: String = "refund_payment",
    val userId: String,
    val eventId: String,
)

@Serializable
data class RefundResponse(
    val refundId: String? = null,
    val status: String? = null,
    val amount: Int? = null,
    val reason: String? = null,
    val error: String? = null,
)