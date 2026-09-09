package com.razumly.mvp.eventDetail.shared

import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.StaffingPriority
import com.razumly.mvp.core.data.dataTypes.label

internal data class StaffingPriorityChoice(
    val priority: StaffingPriority,
    val title: String,
    val description: String,
    val requiredCoverage: String,
    val optionalCoverage: String,
)

private val STAFFING_PRIORITY_CHOICES = listOf(
    StaffingPriorityChoice(
        priority = StaffingPriority.FULL_COVERAGE_REQUIRED,
        title = StaffingPriority.FULL_COVERAGE_REQUIRED.label(),
        description = "Require every Team duty and named Official Position to be conflict-free.",
        requiredCoverage = "Team duties and named Official Positions.",
        optionalCoverage = "None. Missing required coverage can leave Matches unscheduled.",
    ),
    StaffingPriorityChoice(
        priority = StaffingPriority.TEAM_COVERAGE_REQUIRED,
        title = StaffingPriority.TEAM_COVERAGE_REQUIRED.label(),
        description = "Require Team duties. Named official gaps remain warnings.",
        requiredCoverage = "Team duties.",
        optionalCoverage = "Named Official Positions. Gaps remain warnings.",
    ),
    StaffingPriorityChoice(
        priority = StaffingPriority.OFFICIAL_COVERAGE_REQUIRED,
        title = StaffingPriority.OFFICIAL_COVERAGE_REQUIRED.label(),
        description = "Require named Official Positions. Team-duty gaps remain warnings.",
        requiredCoverage = "Named Official Positions.",
        optionalCoverage = "Team duties. Gaps remain warnings.",
    ),
    StaffingPriorityChoice(
        priority = StaffingPriority.BEST_AVAILABLE_COVERAGE,
        title = StaffingPriority.BEST_AVAILABLE_COVERAGE.label(),
        description = "Prioritize Match placement and assign available coverage without blocking.",
        requiredCoverage = "None. Staffing gaps do not block Match placement.",
        optionalCoverage = "Team duties and named Official Positions. Gaps remain warnings.",
    ),
    StaffingPriorityChoice(
        priority = StaffingPriority.FULL_COVERAGE_WITH_CONFLICTS_ALLOWED,
        title = StaffingPriority.FULL_COVERAGE_WITH_CONFLICTS_ALLOWED.label(),
        description = "Keep full staffing assignments even when conflicts remain.",
        requiredCoverage = "Team duties and named Official Positions. Assignment conflicts are allowed.",
        optionalCoverage = "None. Missing required coverage can leave Matches unscheduled.",
    ),
)

internal fun staffingPriorityChoices(): List<StaffingPriorityChoice> = STAFFING_PRIORITY_CHOICES

@Composable
internal fun StaffingPrioritySelector(
    selectedPriority: StaffingPriority,
    onPrioritySelected: (StaffingPriority) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth().selectableGroup(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        staffingPriorityChoices().forEach { choice ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .selectable(
                        selected = selectedPriority == choice.priority,
                        role = Role.RadioButton,
                        onClick = { onPrioritySelected(choice.priority) },
                    )
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.Top,
            ) {
                RadioButton(
                    selected = selectedPriority == choice.priority,
                    onClick = null,
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
