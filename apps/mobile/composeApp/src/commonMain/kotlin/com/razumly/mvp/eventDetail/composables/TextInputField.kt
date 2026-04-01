package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.presentation.composables.StandardTextField

@Composable
fun TextInputField(
    modifier: Modifier = Modifier,
    value: String,
    label: String,
    onValueChange: (String) -> Unit,
    isError: Boolean,
    errorMessage: String? = null,
    supportingText: String? = null,
    placeholder: String? = null,
    enabled: Boolean = true,
) {
    Column(modifier = modifier) {
        StandardTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            label = label,
            placeholder = placeholder ?: "",
            enabled = enabled,
            isError = isError
            ,
            supportingText =
                if (isError && errorMessage != null) {
                        errorMessage

                } else supportingText ?: ""
        )
    }
}
