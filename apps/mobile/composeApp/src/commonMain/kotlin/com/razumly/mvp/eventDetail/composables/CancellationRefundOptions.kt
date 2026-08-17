package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.eventDetail.shared.LabeledCheckboxRow

@Composable
fun CancellationRefundOptions(
    refundHours: Int?,
    onRefundHoursChange: (Int?) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    disabledMessage: String? = null,
) {
    val checked = refundHours != null
    val fieldEnabled = enabled && checked

    Column(modifier = modifier) {
        StandardTextField(
            value = refundHours
                ?.coerceAtLeast(0)
                ?.takeIf { hours -> hours > 0 }
                ?.toString()
                .orEmpty(),
            onValueChange = { newValue ->
                if (!newValue.all(Char::isDigit)) return@StandardTextField
                onRefundHoursChange(newValue.toIntOrNull() ?: 0)
            },
            modifier = Modifier.fillMaxWidth(),
            label = "Refund Cutoff (Hours)",
            keyboardType = "number",
            enabled = fieldEnabled,
        )
        LabeledCheckboxRow(
            checked = checked,
            label = "Automatic Refunds",
            enabled = enabled,
            onCheckedChange = { nextChecked ->
                onRefundHoursChange(if (nextChecked) refundHours ?: 0 else null)
            },
        )
        if (!enabled && !disabledMessage.isNullOrBlank()) {
            Text(
                text = disabledMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
            )
        }
    }
}
