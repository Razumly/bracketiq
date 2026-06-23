package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressProfile
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.network.userMessage

internal enum class PurchaseIntentProcessingAction {
    WAITING_FOR_SIGNATURE,
    SHOWING_FEE_BREAKDOWN,
    LAUNCHING_PAYMENT_SHEET,
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
        launchPendingPaymentSheet: () -> Unit,
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

        val feeBreakdown = intent.feeBreakdown
        if (feeBreakdown != null) {
            registrationFlowCoordinator.setPendingPaymentSheetIntent(intent)
            registrationFlowCoordinator.showFeeBreakdown(feeBreakdown) {
                launchPendingPaymentSheet()
            }
            return PurchaseIntentProcessingAction.SHOWING_FEE_BREAKDOWN
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

        val signingUrl = intent.resolvedSigningUrl()
        if (signingUrl.isNullOrBlank()) {
            logWarning("Purchase intent requires signature but did not include a signing URL.")
            return true
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
