package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.util.MoneyInputUtils
import kotlin.math.roundToInt

private const val PlatformFeePercentage = 0.01
private const val StripeProcessingPercentage = 0.029
private const val StripeFixedFeeCents = 30

data class InclusivePriceBreakdown(
    val hostReceivesCents: Int,
    val processingFeeCents: Int,
    val platformFeeCents: Int,
    val totalPriceCents: Int,
)

fun calculateInclusivePriceFromHostAmount(hostAmountCents: Int): InclusivePriceBreakdown {
    val hostAmount = hostAmountCents.coerceAtLeast(0)
    if (hostAmount == 0) {
        return InclusivePriceBreakdown(0, 0, 0, 0)
    }
    val platformFee = (hostAmount * PlatformFeePercentage).roundToInt()
    val total = ((hostAmount + platformFee + StripeFixedFeeCents) / (1 - StripeProcessingPercentage)).roundToInt()
    return InclusivePriceBreakdown(
        hostReceivesCents = hostAmount,
        processingFeeCents = (total - hostAmount - platformFee).coerceAtLeast(0),
        platformFeeCents = platformFee,
        totalPriceCents = total,
    )
}

fun calculateIncludedFeesFromTotalPrice(totalPriceCents: Int): InclusivePriceBreakdown {
    val total = totalPriceCents.coerceAtLeast(0)
    if (total == 0) {
        return InclusivePriceBreakdown(0, 0, 0, 0)
    }
    var low = 0
    var high = total
    var best = 0
    while (low <= high) {
        val mid = (low + high) / 2
        val candidateTotal = calculateInclusivePriceFromHostAmount(mid).totalPriceCents
        if (candidateTotal <= total) {
            best = mid
            low = mid + 1
        } else {
            high = mid - 1
        }
    }
    val platformFee = (best * PlatformFeePercentage).roundToInt()
    return InclusivePriceBreakdown(
        hostReceivesCents = best,
        processingFeeCents = (total - best - platformFee).coerceAtLeast(0),
        platformFeeCents = platformFee,
        totalPriceCents = total,
    )
}

private fun centsInputValue(cents: Int): String =
    cents.coerceAtLeast(0).takeIf { it > 0 }?.toString().orEmpty()

private fun formatCents(cents: Int): String =
    "\$${MoneyInputUtils.centsToDisplayValue(cents)}"

@Composable
fun InclusivePriceInput(
    totalPriceCents: Int,
    onTotalPriceChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    hostLabel: String = "Host take-home",
    totalLabel: String = "Online price",
    enabled: Boolean = true,
) {
    val breakdown = calculateIncludedFeesFromTotalPrice(totalPriceCents)
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MoneyInputField(
                value = centsInputValue(breakdown.hostReceivesCents),
                onValueChange = { value ->
                    val hostAmount = value.filter(Char::isDigit).toIntOrNull()?.coerceAtLeast(0) ?: 0
                    onTotalPriceChange(calculateInclusivePriceFromHostAmount(hostAmount).totalPriceCents)
                },
                modifier = Modifier.weight(1f),
                label = hostLabel,
                enabled = enabled,
            )
            MoneyInputField(
                value = centsInputValue(totalPriceCents),
                onValueChange = { value ->
                    onTotalPriceChange(value.filter(Char::isDigit).toIntOrNull()?.coerceAtLeast(0) ?: 0)
                },
                modifier = Modifier.weight(1f),
                label = totalLabel,
                enabled = enabled,
            )
        }
        Text(
            text = "${formatCents(breakdown.hostReceivesCents)} + ${formatCents(breakdown.processingFeeCents)} processing + ${formatCents(breakdown.platformFeeCents)} platform = ${formatCents(breakdown.totalPriceCents)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
