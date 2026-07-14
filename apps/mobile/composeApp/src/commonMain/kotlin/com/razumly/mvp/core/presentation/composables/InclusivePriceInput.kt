package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.repositories.InclusivePriceQuote
import com.razumly.mvp.core.data.repositories.InclusivePriceQuoteDirection
import com.razumly.mvp.core.presentation.util.MoneyInputUtils

private fun formatCents(cents: Int): String =
    "\$${MoneyInputUtils.centsToDisplayValue(cents)}"

@Composable
fun InclusivePriceInput(
    totalPriceCents: Int,
    onConfirmedTotalPriceChange: (Int) -> Unit,
    quoteInclusivePrice: suspend (
        InclusivePriceQuoteDirection,
        Int,
        String?,
    ) -> Result<InclusivePriceQuote>,
    onQuoteConfirmationChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    hostLabel: String = "Host take-home",
    totalLabel: String = "Online price",
    enabled: Boolean = true,
    editorKey: Any? = Unit,
    eventType: String? = null,
    onUserEdit: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    val currentQuoteRequester by rememberUpdatedState(quoteInclusivePrice)
    val currentConfirmedTotalCallback by rememberUpdatedState(onConfirmedTotalPriceChange)
    val currentConfirmationCallback by rememberUpdatedState(onQuoteConfirmationChange)
    val currentUserEditCallback by rememberUpdatedState(onUserEdit)
    val coordinator = remember(editorKey, eventType) {
        InclusivePriceQuoteCoordinator(
            initialTotalPriceCents = totalPriceCents.coerceAtLeast(0),
            eventType = eventType,
            scope = scope,
            requestQuote = { direction, amountCents, quoteEventType ->
                currentQuoteRequester(direction, amountCents, quoteEventType)
            },
        )
    }
    val quoteState by coordinator.state.collectAsState()

    DisposableEffect(coordinator) {
        onDispose(coordinator::close)
    }

    LaunchedEffect(coordinator, totalPriceCents) {
        coordinator.syncExternalTotalPrice(totalPriceCents.coerceAtLeast(0))
    }

    LaunchedEffect(
        coordinator,
        quoteState.generation,
        quoteState.isCurrentInputConfirmed,
    ) {
        currentConfirmationCallback(quoteState.isCurrentInputConfirmed)
    }

    LaunchedEffect(coordinator, quoteState.acceptedGeneration) {
        if (quoteState.isCurrentInputConfirmed) {
            quoteState.acceptedQuote?.breakdown?.totalPriceCents?.let(currentConfirmedTotalCallback)
        }
    }

    val acceptedBreakdown = quoteState.acceptedQuote?.breakdown
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MoneyInputField(
                value = quoteState.hostInput,
                onValueChange = { value ->
                    currentUserEditCallback()
                    currentConfirmationCallback(false)
                    coordinator.updateHostInput(value.filter(Char::isDigit))
                },
                modifier = Modifier.weight(1f),
                label = hostLabel,
                enabled = enabled,
            )
            MoneyInputField(
                value = quoteState.totalInput,
                onValueChange = { value ->
                    currentUserEditCallback()
                    currentConfirmationCallback(false)
                    coordinator.updateTotalInput(value.filter(Char::isDigit))
                },
                modifier = Modifier.weight(1f),
                label = totalLabel,
                enabled = enabled,
            )
        }

        if (acceptedBreakdown != null) {
            val prefix = if (quoteState.isCurrentInputConfirmed) "" else "Last confirmed: "
            Text(
                text = prefix +
                    "${formatCents(acceptedBreakdown.hostReceivesCents)} + " +
                    "${formatCents(acceptedBreakdown.processingFeeCents)} processing + " +
                    "${formatCents(acceptedBreakdown.platformFeeCents)} platform = " +
                    formatCents(acceptedBreakdown.totalPriceCents),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (quoteState.isPending) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
                    strokeWidth = 2.dp,
                )
                Text(
                    text = "Refreshing online price…",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        quoteState.errorMessage?.let { errorMessage ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = errorMessage,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                TextButton(
                    onClick = coordinator::retry,
                ) {
                    Text("Retry")
                }
            }
        }
    }
}
