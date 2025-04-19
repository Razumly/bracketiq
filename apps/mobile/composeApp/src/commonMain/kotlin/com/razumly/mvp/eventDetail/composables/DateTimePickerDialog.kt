package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import network.chaintech.kmp_date_time_picker.ui.datetimepicker.WheelDateTimePickerDialog
import network.chaintech.kmp_date_time_picker.utils.now

@Composable
fun DateTimePickerDialog(
    onDateTimeSelected: (Instant) -> Unit,
    onDismissRequest: () -> Unit
) {
    WheelDateTimePickerDialog(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 22.dp, bottom = 26.dp),
        title = "DUE DATE",
        doneLabel = "Done",
        rowCount = 5,
        height = 180.dp,
        shape = RoundedCornerShape(18.dp),
        onDoneClick = {
            onDateTimeSelected(it.toInstant(TimeZone.currentSystemDefault()))
        },
        onDismiss = {
            onDismissRequest()
        },
        showDatePicker = true,
        minDate = LocalDateTime.now(),
    )
}