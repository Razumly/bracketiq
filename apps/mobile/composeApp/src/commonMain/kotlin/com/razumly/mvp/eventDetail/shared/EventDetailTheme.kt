package com.razumly.mvp.eventDetail.shared

import androidx.compose.runtime.compositionLocalOf
import com.materialkolor.scheme.DynamicScheme

internal val localImageScheme = compositionLocalOf<DynamicScheme> { error("No color scheme provided") }