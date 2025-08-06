package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import com.razumly.mvp.core.util.CurrencyAmountInputVisualTransformation

@Composable
actual fun PlatformTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier,
    label: String,
    placeholder: String,
    isPassword: Boolean,
    keyboardType: String,
    isError: Boolean,
    supportingText: String,
    enabled: Boolean,
    readOnly: Boolean,
    trailingIcon: @Composable (() -> Unit)?,
    leadingIcon: @Composable (() -> Unit)?,
    textStyle: TextStyle?,
    fontSize: TextUnit?,
    height: Dp?,
    contentPadding: PaddingValues?,
    inputFilter: ((String) -> String)?,
    onTap: (() -> Unit)?
) {
    // Create the final text style
    val finalTextStyle = when {
        textStyle != null && fontSize != null -> textStyle.copy(fontSize = fontSize)
        textStyle != null -> textStyle
        fontSize != null -> TextStyle(fontSize = fontSize)
        else -> TextStyle.Default
    }

    // Apply height modifier if specified
    val finalModifier = if (height != null) {
        modifier.height(height)
    } else {
        modifier
    }

    OutlinedTextField(
        value = value,
        onValueChange = { newValue ->
            // Apply input filter if provided
            val filteredValue = inputFilter?.invoke(newValue) ?: newValue
            onValueChange(filteredValue)
        },
        modifier = finalModifier.clickable(onClick = { onTap }),
        label = if (label.isNotEmpty()) { { Text(label) } } else null,
        placeholder = if (placeholder.isNotEmpty()) { { Text(placeholder) } } else null,
        enabled = enabled,
        readOnly = readOnly,
        textStyle = finalTextStyle,
        visualTransformation = if (isPassword) {
            PasswordVisualTransformation()
        } else if (keyboardType == "money") {
            CurrencyAmountInputVisualTransformation()
        } else {
            VisualTransformation.None
        },
        keyboardOptions = KeyboardOptions(
            keyboardType = when (keyboardType) {
                "email" -> KeyboardType.Email
                "number", "money" -> KeyboardType.Number
                "password" -> KeyboardType.Password
                else -> KeyboardType.Text
            },
            imeAction = ImeAction.Next
        ),
        isError = isError,
        supportingText = if (supportingText.isNotEmpty()) {
            { Text(supportingText, color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant) }
        } else null,
        trailingIcon = trailingIcon,
        leadingIcon = leadingIcon,
        singleLine = true
    )
}
