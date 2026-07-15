package com.razumly.mvp.eventDetail

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme as createDynamicScheme
import com.materialkolor.scheme.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace

internal fun Event.toSelectedEventLocationPlace(): MVPPlace? {
    if (location.isBlank() || (lat == 0.0 && long == 0.0)) return null
    return MVPPlace(
        name = location,
        id = "__selected_event_location__",
        coordinates = listOf(long, lat),
        address = address,
    )
}

@Composable
internal fun rememberEventDetailImageScheme(
    selectedEventSeedColor: Int,
    editedEventSeedColor: Int,
    isEditing: Boolean,
    isDark: Boolean,
): DynamicScheme {
    var imageScheme by remember {
        mutableStateOf(
            createDynamicScheme(
                seedColor = Color(selectedEventSeedColor),
                isDark = isDark,
                specVersion = ColorSpec.SpecVersion.SPEC_2025,
                style = PaletteStyle.Neutral,
            ),
        )
    }
    LaunchedEffect(isEditing, selectedEventSeedColor, editedEventSeedColor) {
        imageScheme = createDynamicScheme(
            seedColor = Color(if (isEditing) editedEventSeedColor else selectedEventSeedColor),
            isDark = isDark,
            specVersion = ColorSpec.SpecVersion.SPEC_2025,
            style = PaletteStyle.Neutral,
        )
    }
    return imageScheme
}
