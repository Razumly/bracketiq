package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import com.razumly.mvp.core.presentation.localAllFocusManagers
import com.razumly.mvp.core.util.CurrencyAmountInputVisualTransformation

private val LightReadablePlaceholder = Color(0xFF6B7785)
private val LightReadableDisabled = Color(0xFF5E6B78)

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
    style: PlatformTextFieldStyle,
    externalFocusManager: PlatformFocusManager?,
    onImeAction: (() -> Unit)?,
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
    val glassStyle = style == PlatformTextFieldStyle.GlassPill
    val fieldShape = if (glassStyle) RoundedCornerShape(28.dp) else OutlinedTextFieldDefaults.shape
    val readablePlaceholder = if (isSystemInDarkTheme()) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        LightReadablePlaceholder
    }
    val readableDisabled = if (isSystemInDarkTheme()) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        LightReadableDisabled
    }
    val interactiveReadOnly = readOnly && onTap != null && enabled
    val defaultColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = MaterialTheme.colorScheme.onSurface,
        unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
        disabledTextColor = if (interactiveReadOnly) MaterialTheme.colorScheme.onSurface else readableDisabled,
        focusedContainerColor = MaterialTheme.colorScheme.surface,
        unfocusedContainerColor = MaterialTheme.colorScheme.surface,
        disabledContainerColor = if (interactiveReadOnly) {
            MaterialTheme.colorScheme.surface
        } else {
            MaterialTheme.colorScheme.surfaceContainerLow
        },
        errorContainerColor = MaterialTheme.colorScheme.surface,
        focusedBorderColor = MaterialTheme.colorScheme.primary,
        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
        disabledBorderColor = when {
            interactiveReadOnly && isError -> MaterialTheme.colorScheme.error
            interactiveReadOnly -> MaterialTheme.colorScheme.outline
            else -> MaterialTheme.colorScheme.outlineVariant
        },
        errorBorderColor = MaterialTheme.colorScheme.error,
        focusedLabelColor = MaterialTheme.colorScheme.primary,
        unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
        disabledLabelColor = when {
            interactiveReadOnly && isError -> MaterialTheme.colorScheme.error
            interactiveReadOnly -> MaterialTheme.colorScheme.onSurfaceVariant
            else -> readableDisabled
        },
        errorLabelColor = MaterialTheme.colorScheme.error,
        focusedPlaceholderColor = readablePlaceholder,
        unfocusedPlaceholderColor = readablePlaceholder,
        disabledPlaceholderColor = if (interactiveReadOnly) readablePlaceholder else readableDisabled,
        errorPlaceholderColor = readablePlaceholder,
        focusedSupportingTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unfocusedSupportingTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
        disabledSupportingTextColor = when {
            interactiveReadOnly && isError -> MaterialTheme.colorScheme.error
            interactiveReadOnly -> MaterialTheme.colorScheme.onSurfaceVariant
            else -> readableDisabled
        },
        errorSupportingTextColor = MaterialTheme.colorScheme.error,
        focusedLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unfocusedLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        disabledLeadingIconColor = if (interactiveReadOnly) {
            MaterialTheme.colorScheme.onSurfaceVariant
        } else {
            readableDisabled
        },
        errorLeadingIconColor = MaterialTheme.colorScheme.error,
        focusedTrailingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unfocusedTrailingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        disabledTrailingIconColor = if (interactiveReadOnly) {
            MaterialTheme.colorScheme.onSurfaceVariant
        } else {
            readableDisabled
        },
        errorTrailingIconColor = MaterialTheme.colorScheme.error,
        cursorColor = MaterialTheme.colorScheme.primary,
        errorCursorColor = MaterialTheme.colorScheme.error,
    )
    val glassColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = if (isError) MaterialTheme.colorScheme.error.copy(alpha = 0.55f) else Color.Transparent,
        unfocusedBorderColor = if (isError) MaterialTheme.colorScheme.error.copy(alpha = 0.45f) else Color.Transparent,
        disabledBorderColor = if (interactiveReadOnly && isError) {
            MaterialTheme.colorScheme.error.copy(alpha = 0.45f)
        } else {
            Color.Transparent
        },
        focusedTextColor = MaterialTheme.colorScheme.onSurface,
        unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
        disabledTextColor = if (interactiveReadOnly) MaterialTheme.colorScheme.onSurface else readableDisabled,
        focusedContainerColor = Color.Transparent,
        unfocusedContainerColor = Color.Transparent,
        disabledContainerColor = Color.Transparent,
        errorContainerColor = Color.Transparent,
        focusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
        disabledLabelColor = when {
            interactiveReadOnly && isError -> MaterialTheme.colorScheme.error
            interactiveReadOnly -> MaterialTheme.colorScheme.onSurfaceVariant
            else -> readableDisabled
        },
        focusedPlaceholderColor = readablePlaceholder,
        unfocusedPlaceholderColor = readablePlaceholder,
        disabledPlaceholderColor = if (interactiveReadOnly) readablePlaceholder else readableDisabled,
        focusedSupportingTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unfocusedSupportingTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
        disabledSupportingTextColor = when {
            interactiveReadOnly && isError -> MaterialTheme.colorScheme.error
            interactiveReadOnly -> MaterialTheme.colorScheme.onSurfaceVariant
            else -> readableDisabled
        },
        focusedLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unfocusedLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        disabledLeadingIconColor = if (interactiveReadOnly) {
            MaterialTheme.colorScheme.onSurfaceVariant
        } else {
            readableDisabled
        },
        focusedTrailingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unfocusedTrailingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        disabledTrailingIconColor = if (interactiveReadOnly) {
            MaterialTheme.colorScheme.onSurfaceVariant
        } else {
            readableDisabled
        },
        cursorColor = MaterialTheme.colorScheme.primary,
        errorCursorColor = MaterialTheme.colorScheme.error,
    )
    val colors = if (glassStyle) glassColors else defaultColors

    if (readOnly && onTap != null) {
        Box(
            modifier = finalModifier
                .semantics {
                    contentDescription = label.ifBlank { placeholder.ifBlank { value } }
                    if (value.isNotBlank() && value != label) {
                        stateDescription = value
                    }
                    if (isError && supportingText.isNotBlank()) {
                        error(supportingText)
                    }
                }
                .clickable(
                    enabled = enabled,
                    role = Role.Button,
                ) {
                    onTap()
                    composeFocusManager.clearFocus()
                },
        ) {
            OutlinedTextField(
                value = value,
                onValueChange = {},
                modifier = Modifier.fillMaxWidth(),
                label = if (label.isNotEmpty()) {
                    { Text(label) }
                } else null,
                placeholder = if (placeholder.isNotEmpty()) {
                    { Text(placeholder) }
                } else null,
                enabled = enabled,
                readOnly = true,
                textStyle = finalTextStyle,
                visualTransformation = if (isPassword) {
                    PasswordVisualTransformation()
                } else if (keyboardType == "money") {
                    CurrencyAmountInputVisualTransformation()
                } else {
                    VisualTransformation.None
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = resolveComposeKeyboardType(
                        keyboardType = keyboardType,
                        usesPasswordKeyboard = isPassword || keyboardType == "password",
                    ),
                    imeAction = imeAction,
                ),
                keyboardActions = KeyboardActions(
                    onNext = { androidManager.handleNextAction() },
                    onDone = { onImeAction?.invoke() ?: androidManager.handleDoneAction() },
                    onGo = { onImeAction?.invoke() ?: androidManager.handleDoneAction() },
                    onSend = { onImeAction?.invoke() ?: androidManager.handleDoneAction() },
                ),
                isError = isError,
                supportingText = if (supportingText.isNotEmpty()) {
                    {
                        Text(
                            supportingText,
                            color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else null,
                trailingIcon = trailingIcon,
                leadingIcon = leadingIcon,
                singleLine = true,
                shape = fieldShape,
                colors = colors,
            )
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .clip(fieldShape)
                    .clickable(
                        enabled = enabled,
                        role = Role.Button,
                    ) {
                        onTap()
                        composeFocusManager.clearFocus()
                    }
                    .clearAndSetSemantics {},
            )
        }
    } else {
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
                keyboardType = resolveComposeKeyboardType(
                    keyboardType = keyboardType,
                    usesPasswordKeyboard = isPassword || keyboardType == "password",
                ),
                imeAction = imeAction
            ),
            keyboardActions = KeyboardActions(
                onNext = { androidManager.handleNextAction() },
                onDone = { onImeAction?.invoke() ?: androidManager.handleDoneAction() },
                onGo = { onImeAction?.invoke() ?: androidManager.handleDoneAction() },
                onSend = { onImeAction?.invoke() ?: androidManager.handleDoneAction() }
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
            singleLine = true,
            shape = fieldShape,
            colors = colors,
        )
    }
}
