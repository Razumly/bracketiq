package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.PlatformTextField


@Composable
fun PointsTextField(
    value: String,
    label: String,
    onValueChange: (String) -> Unit,
    focusRequester: FocusRequester,
    nextFocus: () -> Unit,
    isError: Boolean = false,
    errorMessage: String = ""
) {
    PlatformTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier
            .width(120.dp)
            .focusRequester(focusRequester)
            .onKeyEvent {
                if (it.key == Key.Enter) {
                    nextFocus()
                    true
                } else false
            },
        label = label,
        keyboardType = "numbers",
        isError = isError,
        supportingText = if (isError && errorMessage.isNotEmpty()) { errorMessage } else ""
    )
}

