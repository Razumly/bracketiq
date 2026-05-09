package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.presentation.composables.StandardTextField

@Composable
fun RegistrationOptions(
    cutoffHours: Int,
    onCutoffHoursChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        StandardTextField(
            value = cutoffHours
                .coerceAtLeast(0)
                .takeIf { hours -> hours > 0 }
                ?.toString()
                .orEmpty(),
            onValueChange = { newValue ->
                if (!newValue.all(Char::isDigit)) return@StandardTextField
                onCutoffHoursChange(newValue.toIntOrNull() ?: 0)
            },
            modifier = Modifier.fillMaxWidth(),
            label = "Reg. Cutoff (Hours)",
            keyboardType = "number",
        )
    }
}
