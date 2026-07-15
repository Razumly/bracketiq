package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressProfile
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.network.userMessage

internal enum class PurchaseIntentProcessingAction {
    WAITING_FOR_SIGNATURE,
    LAUNCHING_PAYMENT_SHEET,
}

private const val BOLDSIGN_SIGNING_HOST = "app.boldsign.com"

/**
 * The purchase endpoint can require an embedded signing step. Do not hand an
 * arbitrary response URL to the embedded browser: only HTTPS BoldSign links
 * with a real path are accepted.
 */
internal fun trustedPurchaseSigningUrlOrNull(rawUrl: String?): String? {
    val url = rawUrl?.trim()?.takeIf(String::isNotBlank) ?: return null
    if (url.any { it.isWhitespace() || it.code < 0x20 || it.code == 0x7f } ||
        !url.startsWith("https://", ignoreCase = true)
    ) {
        return null
    }

    val authorityAndPath = url.substring("https://".length)
    val authorityEnd = authorityAndPath.indexOfFirst { it == '/' || it == '?' || it == '#' }
        .let { if (it == -1) authorityAndPath.length else it }
    val authority = authorityAndPath.substring(0, authorityEnd)
    if (!authority.equals(BOLDSIGN_SIGNING_HOST, ignoreCase = true)) return null

    val pathAndQuery = authorityAndPath.substring(authorityEnd)
    if (!pathAndQuery.startsWith('/') || pathAndQuery.length == 1 || pathAndQuery.contains('#')) return null

    return url
}

internal class EventPurchaseIntentCoordinator(
    private val registrationFlowCoordinator: EventRegistrationFlowCoordinator,
) {
    suspend fun ensureBillingAddressOrPrompt(
        getBillingAddress: suspend () -> Result<BillingAddressProfile>,
        onReady: () -> Unit,
        setError: (String) -> Unit,
    ): Boolean {
        val billingAddress = getBillingAddress()
            .getOrElse { error ->
                setError(error.userMessage("Unable to load billing address."))
                return false
            }
            .billingAddress
            ?.normalized()

        if (billingAddress != null && billingAddress.isCompleteForUsTax()) {
            return true
        }

        registrationFlowCoordinator.showBillingAddressPrompt(
            billingAddress = billingAddress,
            onReady = onReady,
        )
        return false
    }

    suspend fun loadSavedBillingAddress(
        getBillingAddress: suspend () -> Result<BillingAddressProfile>,
    ): BillingAddressDraft? {
        return getBillingAddress()
            .getOrNull()
            ?.billingAddress
            ?.normalized()
    }

    suspend fun submitBillingAddress(
        address: BillingAddressDraft,
        updateBillingAddress: suspend (BillingAddressDraft) -> Result<BillingAddressProfile>,
        showLoading: (String) -> Unit,
        hideLoading: () -> Unit,
        setError: (String) -> Unit,
    ) {
        showLoading("Saving billing address...")
        try {
            updateBillingAddress(address)
                .onSuccess {
                    registrationFlowCoordinator.completeBillingAddressPrompt()?.invoke()
                }
                .onFailure { error ->
                    setError(error.userMessage("Unable to save billing address."))
                }
        } finally {
            hideLoading()
        }
    }

    fun processPurchaseIntent(
        intent: PurchaseIntent,
        saveRegistrationProgress: (registrationId: String?, holdExpiresAt: String) -> Unit,
        launchPaymentSheet: (PurchaseIntent) -> Unit,
        setError: (String) -> Unit,
        logWarning: (String) -> Unit,
    ): PurchaseIntentProcessingAction {
        if (!ensureDocumentSignedBeforePurchase(intent, setError, logWarning)) {
            return PurchaseIntentProcessingAction.WAITING_FOR_SIGNATURE
        }

        intent.registrationHoldExpiresAt
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { holdExpiresAt ->
                registrationFlowCoordinator.setRegistrationHoldExpiresAt(holdExpiresAt)
                saveRegistrationProgress(intent.registrationId, holdExpiresAt)
            }

        launchPaymentSheet(intent)
        return PurchaseIntentProcessingAction.LAUNCHING_PAYMENT_SHEET
    }

    private fun ensureDocumentSignedBeforePurchase(
        intent: PurchaseIntent,
        setError: (String) -> Unit,
        logWarning: (String) -> Unit,
    ): Boolean {
        if (!intent.isSignatureRequired() || intent.isSignatureCompleted()) {
            return true
        }

        val rawSigningUrl = intent.resolvedSigningUrl()
        val signingUrl = trustedPurchaseSigningUrlOrNull(rawSigningUrl)
        if (signingUrl == null) {
            val warning = if (rawSigningUrl.isNullOrBlank()) {
                "Purchase intent requires signature but did not include a signing URL."
            } else {
                "Purchase intent requires signature but included an untrusted signing URL."
            }
            logWarning(warning)
            setError("This registration requires a signed document, but the signing link is unavailable or invalid. Please retry before paying.")
            return false
        }

        registrationFlowCoordinator.showWebSignaturePrompt(
            WebSignaturePromptState(
                step = null,
                url = signingUrl,
                currentStep = 1,
                totalSteps = 1,
            )
        )
        setError("Please complete document signing in the modal, then tap Purchase Ticket again.")

        return false
    }
}
