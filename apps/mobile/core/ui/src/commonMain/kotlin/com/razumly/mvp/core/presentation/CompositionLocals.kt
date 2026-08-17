package com.razumly.mvp.core.presentation

import androidx.collection.MutableObjectList
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.compositionLocalOf
import com.razumly.mvp.core.presentation.composables.PlatformFocusManager

val LocalNavBarPadding = compositionLocalOf<PaddingValues> {
    error("No padding values provided")
}

val localAllFocusManagers =
    compositionLocalOf<MutableObjectList<PlatformFocusManager>> { error("No List Provided") }
