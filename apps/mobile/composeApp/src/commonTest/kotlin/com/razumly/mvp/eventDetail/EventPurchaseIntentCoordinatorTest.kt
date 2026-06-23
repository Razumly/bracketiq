package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.FeeBreakdown
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import kotlin.test.Test
import kotlin.test.assertEquals

class EventPurchaseIntentCoordinatorTest {
    @Test
    fun process_purchase_intent_prompts_for_required_signature() {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventPurchaseIntentCoordinator(registrationFlow)
        val events = mutableListOf<String>()

        val result = coordinator.processForTest(
            intent = PurchaseIntent(
                registrationId = "registration-1",
                requiresSignature = true,
                signingUrl = "https://sign.example/doc",
            ),
            registrationFlow = registrationFlow,
            events = events,
        )

        assertEquals(PurchaseIntentProcessingAction.WAITING_FOR_SIGNATURE, result)
        assertEquals("https://sign.example/doc", registrationFlow.webSignaturePrompt.value?.url)
        assertEquals(
            listOf("error:Please complete document signing in the modal, then tap Purchase Ticket again."),
            events,
        )
    }

    @Test
    fun process_purchase_intent_allows_missing_signature_url_and_launches_payment_sheet() {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventPurchaseIntentCoordinator(registrationFlow)
        val events = mutableListOf<String>()

        val result = coordinator.processForTest(
            intent = PurchaseIntent(
                registrationId = "registration-1",
                requiresSignature = true,
            ),
            registrationFlow = registrationFlow,
            events = events,
        )

        assertEquals(PurchaseIntentProcessingAction.LAUNCHING_PAYMENT_SHEET, result)
        assertEquals(
            listOf(
                "warning:Purchase intent requires signature but did not include a signing URL.",
                "launch:registration-1",
            ),
            events,
        )
    }

    @Test
    fun process_purchase_intent_saves_hold_and_shows_fee_breakdown_until_confirmed() {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventPurchaseIntentCoordinator(registrationFlow)
        val events = mutableListOf<String>()

        val result = coordinator.processForTest(
            intent = PurchaseIntent(
                registrationId = "registration-1",
                registrationHoldExpiresAt = " 2026-07-01T12:00:00Z ",
                feeBreakdown = FeeBreakdown(
                    eventPrice = 4500,
                    stripeFee = 120,
                    processingFee = 120,
                    totalCharge = 4620,
                    hostReceives = 4500,
                    feePercentage = 2.7f,
                ),
            ),
            registrationFlow = registrationFlow,
            events = events,
        )

        assertEquals(PurchaseIntentProcessingAction.SHOWING_FEE_BREAKDOWN, result)
        assertEquals("2026-07-01T12:00:00Z", registrationFlow.holdExpiresAt.value)
        assertEquals(
            listOf("save:registration-1:2026-07-01T12:00:00Z"),
            events,
        )
        assertEquals(4500, registrationFlow.currentFeeBreakdown.value?.eventPrice)

        registrationFlow.confirmFeeBreakdown()?.invoke()

        assertEquals(
            listOf(
                "save:registration-1:2026-07-01T12:00:00Z",
                "launch-pending:registration-1",
            ),
            events,
        )
    }

    @Test
    fun process_purchase_intent_launches_payment_sheet_without_fee_breakdown() {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventPurchaseIntentCoordinator(registrationFlow)
        val events = mutableListOf<String>()

        val result = coordinator.processForTest(
            intent = PurchaseIntent(registrationId = "registration-1"),
            registrationFlow = registrationFlow,
            events = events,
        )

        assertEquals(PurchaseIntentProcessingAction.LAUNCHING_PAYMENT_SHEET, result)
        assertEquals(listOf("launch:registration-1"), events)
    }

    private fun EventPurchaseIntentCoordinator.processForTest(
        intent: PurchaseIntent,
        registrationFlow: EventRegistrationFlowCoordinator,
        events: MutableList<String>,
    ): PurchaseIntentProcessingAction {
        return processPurchaseIntent(
            intent = intent,
            saveRegistrationProgress = { registrationId, holdExpiresAt ->
                events += "save:$registrationId:$holdExpiresAt"
            },
            launchPaymentSheet = { purchaseIntent ->
                events += "launch:${purchaseIntent.registrationId}"
            },
            launchPendingPaymentSheet = {
                events += "launch-pending:${registrationFlow.consumePendingPaymentSheetIntent()?.registrationId}"
            },
            setError = { message ->
                events += "error:$message"
            },
            logWarning = { message ->
                events += "warning:$message"
            },
        )
    }
}
