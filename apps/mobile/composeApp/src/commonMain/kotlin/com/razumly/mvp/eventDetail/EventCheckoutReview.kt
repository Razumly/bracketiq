package com.razumly.mvp.eventDetail

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.presentation.composables.TeamCard
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

data class EventCheckoutReviewState(
    val eventName: String,
    val ownerLabel: String,
    val team: TeamWithPlayers?,
    val priceCents: Int?,
    val answers: List<Pair<String, String>>,
    val isWaitlist: Boolean = false,
    val action: EventCheckoutAction = EventCheckoutAction.REGISTER,
    val documents: List<EventCheckoutDocument> = emptyList(),
)

enum class EventCheckoutAction(val buttonLabel: String, val explanation: String) {
    REGISTER("Confirm registration", "Confirm to submit this registration."),
    PAYMENT("Continue to payment", "Review the final total and choose a payment method before paying."),
    PLAN("Register with payment plan", "Confirm to register and create the payment plan shown."),
    MANUAL("Register with manual payment", "Confirm to register and create a bill. Payment proof can be added from your Profile."),
    APPROVAL("Request guardian approval", "Submit a registration request for your guardian to approve."),
    CHILD("Submit child registration", "Submit the child's registration. Payment or another guardian or Player action may remain."),
    PRICE_REQUIRED("Check registration price", "A valid registration price is required before this registration can continue."),
}

data class EventCheckoutDocument(val key: String, val title: String, val signer: String, val complete: Boolean)

internal fun checkoutReviewAction(action: JoinExecutionAction, isChild: Boolean): EventCheckoutAction {
    if (isChild) return if (action == JoinExecutionAction.CREATE_PURCHASE_INTENT) EventCheckoutAction.PAYMENT else EventCheckoutAction.CHILD
    return when (action) {
        JoinExecutionAction.JOIN_DIRECTLY -> EventCheckoutAction.REGISTER
        JoinExecutionAction.CREATE_PURCHASE_INTENT -> EventCheckoutAction.PAYMENT
        JoinExecutionAction.START_PAYMENT_PLAN -> EventCheckoutAction.PLAN
        JoinExecutionAction.START_MANUAL_PAYMENT -> EventCheckoutAction.MANUAL
        JoinExecutionAction.REQUEST_PARENT_APPROVAL -> EventCheckoutAction.APPROVAL
        JoinExecutionAction.REQUIRE_PRICE -> EventCheckoutAction.PRICE_REQUIRED
    }
}

internal class EventCheckoutReviewCoordinator {
    private val _review = MutableStateFlow<EventCheckoutReviewState?>(null)
    val review = _review.asStateFlow()
    private var continuation: (() -> Unit)? = null

    fun prepare(state: EventCheckoutReviewState, onConfirm: () -> Unit) {
        continuation = onConfirm
        _review.value = state
    }

    fun confirm() {
        val action = continuation ?: return
        cancel()
        action()
    }

    fun cancel() {
        continuation = null
        _review.value = null
    }
}

@Composable
internal fun EventCheckoutReview(
    state: EventCheckoutReviewState,
    onConfirm: () -> Unit,
    onBack: () -> Unit,
) {
    EventCheckoutDialog(
        step = EventCheckoutStep.REVIEW,
        onDismissRequest = onBack,
        title = { Text("Review registration") },
        text = {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Text(state.eventName, style = MaterialTheme.typography.titleLarge)
                state.team?.let { TeamCard(it) } ?: Text(state.ownerLabel, style = MaterialTheme.typography.titleMedium)
                if (state.isWaitlist) Text("This registration will join the waitlist.")
                state.answers.forEach { (question, answer) ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(question, style = MaterialTheme.typography.labelLarge)
                        Text(answer.ifBlank { "Not answered" })
                    }
                }
                HorizontalDivider()
                Text("Documents", style = MaterialTheme.typography.titleMedium)
                if (state.documents.isEmpty()) Text("No outstanding signing steps were returned for this registrant.")
                state.documents.forEach { document ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(document.title, style = MaterialTheme.typography.labelLarge)
                        Text("${document.signer} · ${if (document.complete) "Signed" else "Awaiting signature"}")
                    }
                }
                Text("These checks cover this registrant's authorized signing steps. Other Player and guardian requirements remain on the Event roster.")
                HorizontalDivider()
                Text("Registration price", style = MaterialTheme.typography.titleMedium)
                Text(when {
                    state.isWaitlist -> "No payment now"
                    state.priceCents == null -> "Price will be checked before payment"
                    state.priceCents == 0 -> "Free"
                    else -> state.priceCents.toPaymentPlanPreviewAmount()
                })
                Text(state.action.explanation)
            }
        },
        confirmButton = {
            Button(onClick = onConfirm, modifier = Modifier.fillMaxWidth()) {
                Text(state.action.buttonLabel)
            }
        },
        dismissButton = { TextButton(onClick = onBack) { Text("Back to registration") } },
    )
}
