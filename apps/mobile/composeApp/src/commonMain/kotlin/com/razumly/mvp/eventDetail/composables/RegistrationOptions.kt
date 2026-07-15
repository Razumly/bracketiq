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
    showValidationErrors: Boolean = false,
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
            label = "Registration cutoff (hours) *",
            keyboardType = "number",
            isError = showValidationErrors && cutoffHours < 0,
            supportingText = if (showValidationErrors && cutoffHours < 0) {
                "Enter 0 or more hours."
            } else {
                "Use 0 to keep registration open until the event starts."
            },
        )
    }
}
