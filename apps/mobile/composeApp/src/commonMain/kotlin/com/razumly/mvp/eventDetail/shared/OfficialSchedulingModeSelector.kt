package com.razumly.mvp.eventDetail.shared

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.label

internal data class OfficialSchedulingModeChoice(
    val mode: OfficialSchedulingMode,
    val title: String,
    val description: String,
)

internal fun officialSchedulingModeChoices(): List<OfficialSchedulingModeChoice> = listOf(
    OfficialSchedulingModeChoice(
        mode = OfficialSchedulingMode.STAFFING,
        title = OfficialSchedulingMode.STAFFING.label(),
        description = "Schedule only matches that can be fully staffed without conflicts.",
    ),
    OfficialSchedulingModeChoice(
        mode = OfficialSchedulingMode.TEAM_STAFFING,
        title = OfficialSchedulingMode.TEAM_STAFFING.label(),
        description = "Use teams to provide officials and avoid scheduling conflicts.",
    ),
    OfficialSchedulingModeChoice(
        mode = OfficialSchedulingMode.SCHEDULE,
        title = OfficialSchedulingMode.SCHEDULE.label(),
        description = "Schedule matches first, then assign available officials when possible.",
    ),
    OfficialSchedulingModeChoice(
        mode = OfficialSchedulingMode.OFF,
        title = OfficialSchedulingMode.OFF.label(),
        description = "Assign available officials without blocking the schedule for conflicts.",
    ),
)

@Composable
internal fun OfficialSchedulingModeSelector(
    selectedMode: OfficialSchedulingMode,
    onModeSelected: (OfficialSchedulingMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        officialSchedulingModeChoices().forEach { choice ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onModeSelected(choice.mode) }
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.Top,
            ) {
                RadioButton(
                    selected = selectedMode == choice.mode,
                    onClick = { onModeSelected(choice.mode) },
                )
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(top = 10.dp, end = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = choice.title,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Text(
                        text = choice.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
