package com.razumly.mvp.schedule

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.network.dto.EventEditorScheduleDiagnosticEvidenceDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleDiagnosticsDto

@Composable
internal fun ScheduleDiagnosticsReview(
    diagnostics: EventEditorScheduleDiagnosticsDto?,
    modifier: Modifier = Modifier,
) {
    if (diagnostics == null) return
    Column(
        modifier = modifier.semantics {
            stateDescription = "Schedule diagnostics"
        },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Schedule diagnostics")
        Text(diagnostics.message)
        Text(
            "Match Demand: ${diagnostics.matchDemand.total} total, " +
                "${diagnostics.matchDemand.placed} placed, " +
                "${diagnostics.matchDemand.unplaced} unplaced.",
        )
        Text(
            "Estimated Capacity: ${diagnostics.estimatedCapacity} matches. " +
                "Upper bound: ${diagnostics.estimatedCapacityIsUpperBound}. " +
                "Minimum capacity deficit: ${diagnostics.minimumDeficitMatches} matches.",
        )
        Text("Placement search complete: ${diagnostics.searchComplete}.")
        if (diagnostics.restrictingFactors.isEmpty()) {
            Text("Restricting Factors: none proven.")
        } else {
            Text("Restricting Factors")
            diagnostics.restrictingFactors.forEach { factor ->
                Text("${factor.factor} (${factor.confidence}): ${factor.message}")
                factor.evidence.forEach { evidence ->
                    Text(scheduleEvidenceLabel(evidence))
                }
            }
        }
        if (diagnostics.remedies.isEmpty()) {
            Text("Possible remedies: none supported by the evidence.")
        } else {
            Text("Possible remedies")
            diagnostics.remedies.forEach { remedy ->
                Text("${remedy.code} (${remedy.factor}): ${remedy.message}")
                remedy.evidence.forEach { evidence ->
                    Text(scheduleEvidenceLabel(evidence))
                }
            }
        }
    }
}

private fun scheduleEvidenceLabel(
    evidence: EventEditorScheduleDiagnosticEvidenceDto,
): String {
    val values = buildList {
        add("${evidence.kind}: ${evidence.message}")
        evidence.demand?.let { add("demand $it") }
        evidence.capacity?.let { add("capacity $it") }
        evidence.deficit?.let { add("deficit $it") }
        evidence.candidateCount?.let { add("candidates $it") }
        evidence.resourceIds?.takeIf { it.isNotEmpty() }?.let { add("Resources ${it.joinToString()}") }
        evidence.divisionIds?.takeIf { it.isNotEmpty() }?.let { add("Divisions ${it.joinToString()}") }
        evidence.teamIds?.takeIf { it.isNotEmpty() }?.let { add("Teams ${it.joinToString()}") }
        evidence.dependencyIds?.takeIf { it.isNotEmpty() }?.let { add("Dependencies ${it.joinToString()}") }
        evidence.officialIds?.takeIf { it.isNotEmpty() }?.let { add("Officials ${it.joinToString()}") }
        evidence.timeSlotIds?.takeIf { it.isNotEmpty() }?.let { add("Time Slots ${it.joinToString()}") }
        evidence.intervals?.takeIf { it.isNotEmpty() }?.forEach { interval ->
            add("Interval ${interval.start} to ${interval.end}")
        }
    }
    return values.joinToString("; ")
}
