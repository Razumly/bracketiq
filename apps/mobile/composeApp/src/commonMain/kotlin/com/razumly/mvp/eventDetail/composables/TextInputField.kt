package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import com.razumly.mvp.core.presentation.composables.PlatformTextField

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
) {
    Column(modifier = modifier) {
        PlatformTextField(
            value = value,
            onValueChange = onValueChange,
            label = label,
            isError = isError,
            modifier = Modifier.fillMaxWidth(),
            supportingText =
                if (isError && errorMessage != null) {
                        errorMessage
                    
                } else supportingText ?: ""
            ,
            placeholder = placeholder ?: ""
        )
    }
}