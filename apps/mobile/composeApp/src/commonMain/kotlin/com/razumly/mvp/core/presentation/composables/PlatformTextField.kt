package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit

@Composable
expect fun PlatformTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String = "",
    placeholder: String = "",
    isPassword: Boolean = false,
    keyboardType: String = "default",
    isError: Boolean = false,
    supportingText: String = "",
    enabled: Boolean = true,
    readOnly: Boolean = false,
    trailingIcon: @Composable (() -> Unit)? = null,
    leadingIcon: @Composable (() -> Unit)? = null,
    textStyle: TextStyle? = null,
    fontSize: TextUnit? = null,
    height: Dp? = null,
    contentPadding: PaddingValues? = null,
    inputFilter: ((String) -> String)? = null,
    onTap: (() -> Unit)? = null
)
