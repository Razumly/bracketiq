package com.razumly.mvp.teamManagement

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.StandardTextField
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.toLocalDateTime
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
@Composable
internal fun ManagedPlayerDateField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
) {
    var showPicker by remember { mutableStateOf(false) }
    val initialDate = value.takeIf { runCatching { LocalDate.parse(it) }.isSuccess }
        ?.let { LocalDate.parse(it).atStartOfDayIn(TimeZone.UTC) }

    StandardTextField(
        value = value,
        onValueChange = onValueChange,
        label = label,
        modifier = modifier,
        readOnly = true,
        onTap = { showPicker = true },
        trailingIcon = { Icon(Icons.Default.DateRange, contentDescription = "Select date") },
    )
    PlatformDateTimePicker(
        onDateSelected = { selected: Instant? ->
            selected?.toLocalDateTime(TimeZone.UTC)?.date?.let { onValueChange(it.toString()) }
            showPicker = false
        },
        onDismissRequest = { showPicker = false },
        showPicker = showPicker,
        getTime = false,
        showDate = true,
        canSelectPast = true,
        canSelectFuture = false,
        initialDate = initialDate,
    )
}
