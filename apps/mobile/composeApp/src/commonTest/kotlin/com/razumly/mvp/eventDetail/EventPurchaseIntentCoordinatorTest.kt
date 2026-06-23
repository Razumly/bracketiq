package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressProfile
import com.razumly.mvp.core.data.repositories.FeeBreakdown
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import kotlinx.coroutines.test.runTest
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

    @Test
    fun billing_address_gate_prompts_for_incomplete_address_and_loads_saved_address() = runTest {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventPurchaseIntentCoordinator(registrationFlow)
        val events = mutableListOf<String>()

        val prompted = coordinator.ensureBillingAddressOrPrompt(
            getBillingAddress = {
                Result.success(
                    BillingAddressProfile(
                        billingAddress = BillingAddressDraft(
                            line1 = " 123 Main ",
                            city = "",
                            state = " wa ",
                            postalCode = " 98101 ",
                        ),
                    )
                )
            },
            onReady = { events += "ready" },
            setError = { message -> events += "error:$message" },
        )
        val loadedAddress = coordinator.loadSavedBillingAddress {
            Result.success(
                BillingAddressProfile(
                    billingAddress = BillingAddressDraft(
                        line1 = " 123 Main ",
                        city = " Seattle ",
                        state = " wa ",
                        postalCode = " 98101 ",
                    )
                )
            )
        }
        val ready = coordinator.ensureBillingAddressOrPrompt(
            getBillingAddress = { Result.success(BillingAddressProfile(billingAddress = loadedAddress)) },
            onReady = { events += "should-not-run" },
            setError = { message -> events += "error:$message" },
        )

        assertEquals(false, prompted)
        assertEquals("123 Main", registrationFlow.billingAddressPrompt.value?.line1)
        assertEquals("WA", registrationFlow.billingAddressPrompt.value?.state)
        assertEquals(BillingAddressDraft("123 Main", null, "Seattle", "WA", "98101", "US"), loadedAddress)
        assertEquals(true, ready)
        assertEquals(emptyList(), events)
    }

    @Test
    fun submit_billing_address_saves_address_and_runs_pending_continuation() = runTest {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventPurchaseIntentCoordinator(registrationFlow)
        val events = mutableListOf<String>()
        registrationFlow.showBillingAddressPrompt(
            billingAddress = null,
            onReady = { events += "ready" },
        )

        coordinator.submitBillingAddress(
            address = BillingAddressDraft(line1 = "123 Main", city = "Seattle", state = "WA", postalCode = "98101"),
            updateBillingAddress = { address ->
                events += "update:${address.line1}:${address.city}"
                Result.success(BillingAddressProfile(billingAddress = address))
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
            setError = { message -> events += "error:$message" },
        )

        assertEquals(
            listOf(
                "show:Saving billing address...",
                "update:123 Main:Seattle",
                "ready",
                "hide",
            ),
            events,
        )
        assertEquals(null, registrationFlow.billingAddressPrompt.value)
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
