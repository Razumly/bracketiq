package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.services.Functions
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

interface BillingRepository : IMVPRepository {
    suspend fun tryPurchase(event: EventAbs)
    suspend fun createAccount()
}

class DefaultBillingRepository(
    private val userRepository: IUserRepository, private val functions: Functions
) : BillingRepository {
    override suspend fun tryPurchase(event: EventAbs) {
        val user = userRepository.currentUser.value.getOrThrow()
        val isTournament = when (event) {
            is Tournament -> true
            else -> false
        }
        if (user.stripeAccountId.isNullOrBlank()) {
            createAccount()
        } else {
            functions.createExecution(
                functionId = DbConstants.BILLING_FUNCTION,
                body = Json.encodeToString(
                    CreatePurchaseIntent(
                        "create_purchase_intent", user.id, event.id, isTournament
                    )
                ),
                async = false,
            )
        }
    }

    override suspend fun createAccount() {
        val user = userRepository.currentUser.value.getOrThrow()
        val response = Json.decodeFromString<CreateAccountResponse>(
            functions.createExecution(
                functionId = DbConstants.BILLING_FUNCTION,
                body = Json.encodeToString(
                    CreateAccount(
                        "connect_host_account",
                        user.id,
                    )
                ),
                async = false,
            ).responseBody
        )
        userRepository.updateUser(user.copy(stripeAccountId = response.accountId))
    }
}

@Serializable
private data class CreatePurchaseIntent(
    val command: String, val userId: String, val eventId: String, val isTournament: Boolean
)

@Serializable
private data class CreateAccount(
    val command: String,
    val userId: String,
)

@Serializable
private data class CreateAccountResponse(
    val accountId: String,
    val onboardingUrl: String,
    val expiresAt: String,
)