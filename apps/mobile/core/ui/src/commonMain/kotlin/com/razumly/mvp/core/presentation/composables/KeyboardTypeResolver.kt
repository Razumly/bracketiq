package com.razumly.mvp.core.presentation.composables

import androidx.compose.ui.text.input.KeyboardType

internal fun resolveComposeKeyboardType(
    keyboardType: String,
    usesPasswordKeyboard: Boolean = false,
): KeyboardType = when {
    usesPasswordKeyboard -> KeyboardType.Password
    keyboardType == "email" -> KeyboardType.Email
    keyboardType == "decimal" -> KeyboardType.Decimal
    keyboardType == "number" || keyboardType == "numbers" || keyboardType == "money" -> KeyboardType.Number
    else -> KeyboardType.Text
}
