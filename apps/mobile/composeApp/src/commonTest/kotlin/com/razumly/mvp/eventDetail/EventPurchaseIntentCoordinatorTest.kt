package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressProfile
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
                signingUrl = "https://app.boldsign.com/sign/doc",
            ),
            registrationFlow = registrationFlow,
            events = events,
        )

        assertEquals(PurchaseIntentProcessingAction.WAITING_FOR_SIGNATURE, result)
        assertEquals("https://app.boldsign.com/sign/doc", registrationFlow.webSignaturePrompt.value?.url)
        assertEquals(
            listOf("error:Please complete document signing in the modal, then tap Purchase Ticket again."),
            events,
        )
    }

    @Test
    fun process_purchase_intent_blocks_missing_signature_url() {
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

        assertEquals(PurchaseIntentProcessingAction.WAITING_FOR_SIGNATURE, result)
        assertEquals(
            listOf(
                "warning:Purchase intent requires signature but did not include a signing URL.",
                "error:This registration requires a signed document, but the signing link is unavailable or invalid. Please retry before paying.",
            ),
            events,
        )
    }

    @Test
    fun process_purchase_intent_blocks_untrusted_signature_url() {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventPurchaseIntentCoordinator(registrationFlow)
        val events = mutableListOf<String>()

        val result = coordinator.processForTest(
            intent = PurchaseIntent(
                registrationId = "registration-1",
                requiresSignature = true,
                signingUrl = "https://evil.example/sign/doc",
            ),
            registrationFlow = registrationFlow,
            events = events,
        )

        assertEquals(PurchaseIntentProcessingAction.WAITING_FOR_SIGNATURE, result)
        assertEquals(null, registrationFlow.webSignaturePrompt.value)
        assertEquals(
            listOf(
                "warning:Purchase intent requires signature but included an untrusted signing URL.",
                "error:This registration requires a signed document, but the signing link is unavailable or invalid. Please retry before paying.",
            ),
            events,
        )
    }

    @Test
    fun trusted_purchase_signing_url_rejects_non_https_credentials_and_blank_paths() {
        assertEquals(null, trustedPurchaseSigningUrlOrNull("http://app.boldsign.com/sign/doc"))
        assertEquals(null, trustedPurchaseSigningUrlOrNull("https://app.boldsign.com@evil.example/sign/doc"))
        assertEquals(null, trustedPurchaseSigningUrlOrNull("https://app.boldsign.com/"))
        assertEquals(
            "https://app.boldsign.com/sign/doc?token=abc",
            trustedPurchaseSigningUrlOrNull("https://app.boldsign.com/sign/doc?token=abc"),
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
            setError = { message ->
                events += "error:$message"
            },
            logWarning = { message ->
                events += "warning:$message"
            },
        )
    }
}
