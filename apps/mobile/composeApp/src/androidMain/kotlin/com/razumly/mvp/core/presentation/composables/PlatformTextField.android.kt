package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.localAllFocusManagers
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
    onTap: (() -> Unit)?,
    imeAction: ImeAction,
    externalFocusManager: PlatformFocusManager?
) {
    val focusManager = externalFocusManager ?: rememberPlatformFocusManager()
    val allFocusManagers = localAllFocusManagers.current

    DisposableEffect(focusManager) {
        allFocusManagers.add(focusManager)
        onDispose {
            allFocusManagers.remove(focusManager)
        }
    }
    val androidManager = focusManager as AndroidFocusManager
    val composeFocusManager = LocalFocusManager.current

    // Set compose focus manager
    LaunchedEffect(Unit) {
        androidManager.setComposeFocusManager(composeFocusManager)
    }

    // Create the final text style
    val finalTextStyle = when {
        textStyle != null && fontSize != null -> textStyle.copy(fontSize = fontSize)
        textStyle != null -> textStyle
        fontSize != null -> TextStyle(fontSize = fontSize)
        else -> TextStyle.Default
    }

    val finalModifier = if (height != null) {
        modifier.height(height)
    } else {
        modifier
    }

    // Handle tap-only fields differently
    if (readOnly && onTap != null) {
        // Use a clickable Box for tap-only fields to avoid focus conflicts
        Box(
            modifier = finalModifier
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(4.dp))
                .clickable(onClick = onTap)
                .padding(16.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                leadingIcon?.let {
                    it()
                    Spacer(modifier = Modifier.width(8.dp))
                }

                Text(
                    text = value.ifEmpty { placeholder },
                    style = finalTextStyle.copy(
                        color = if (value.isEmpty())
                            MaterialTheme.colorScheme.onSurfaceVariant
                        else
                            MaterialTheme.colorScheme.onSurface
                    ),
                    modifier = Modifier.weight(1f)
                )

                trailingIcon?.let {
                    Spacer(modifier = Modifier.width(8.dp))
                    it()
                }
            }
        }
    } else {
        // Use OutlinedTextField with enhanced keyboard handling
        OutlinedTextField(
            value = value,
            onValueChange = { newValue ->
                val filteredValue = inputFilter?.invoke(newValue) ?: newValue
                onValueChange(filteredValue)
            },
            modifier = finalModifier.platformFocusable(androidManager, enabled),
            label = if (label.isNotEmpty()) {
                { Text(label) }
            } else null,
            placeholder = if (placeholder.isNotEmpty()) {
                { Text(placeholder) }
            } else null,
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
                imeAction = imeAction
            ),
            keyboardActions = KeyboardActions(
                onNext = { androidManager.handleNextAction() },
                onDone = { androidManager.handleDoneAction() },
                onGo = { androidManager.handleDoneAction() },
                onSend = { androidManager.handleDoneAction() }
            ),
            isError = isError,
            supportingText = if (supportingText.isNotEmpty()) {
                {
                    Text(
                        supportingText,
                        color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else null,
            trailingIcon = trailingIcon,
            leadingIcon = leadingIcon,
            singleLine = true
        )
    }
}
