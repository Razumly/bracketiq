package com.razumly.mvp.schedule

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventDetail.shared.staffingPriorityChoices

@Composable
internal fun StaffingPriorityReview(priority: String?) {
    val choice = staffingPriorityChoices().firstOrNull { it.priority.name == priority }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Officiating Plan", modifier = Modifier.semantics { heading() })
        if (choice == null) {
            Text("Staffing Priority unavailable. Coverage requirements cannot be shown.")
        } else {
            Text("Staffing Priority: ${choice.title}")
            Text(choice.description)
            Text("Required coverage: ${choice.requiredCoverage}")
            Text("Optional coverage: ${choice.optionalCoverage}")
        }
    }
}
