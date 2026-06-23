package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.PurchaseIntent

internal enum class PurchaseIntentProcessingAction {
    WAITING_FOR_SIGNATURE,
    SHOWING_FEE_BREAKDOWN,
    LAUNCHING_PAYMENT_SHEET,
}

internal class EventPurchaseIntentCoordinator(
    private val registrationFlowCoordinator: EventRegistrationFlowCoordinator,
) {
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
