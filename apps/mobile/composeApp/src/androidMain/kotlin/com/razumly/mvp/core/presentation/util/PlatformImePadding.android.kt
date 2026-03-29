package com.razumly.mvp.core.presentation.util

import androidx.compose.foundation.layout.imePadding
import androidx.compose.ui.Modifier

actual fun Modifier.platformImePadding(): Modifier = this.imePadding()
