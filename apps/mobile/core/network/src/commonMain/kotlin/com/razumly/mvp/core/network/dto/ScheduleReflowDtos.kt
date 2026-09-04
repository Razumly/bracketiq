package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import kotlinx.serialization.Serializable
import kotlin.time.Instant

const val SCHEDULE_REFLOW_CONTRACT_VERSION = 1

@Serializable
enum class ScheduleReflowFieldPolicy { KEEP_ASSIGNED_FIELDS, ALLOW_ELIGIBLE_FIELD_CHANGES }

@Serializable
enum class ScheduleReflowStatus { CHANGED, NO_OP, INFEASIBLE, SEARCH_LIMIT, STALE }

@Serializable
data class ScheduleReflowRequestDto(
    val contractVersion: Int,
    val eventId: String,
    val changedMatchIds: List<String>,
    val expectedScheduleRevision: String,
    val fieldPolicy: ScheduleReflowFieldPolicy,
) {
    fun validate() {
        require(contractVersion == SCHEDULE_REFLOW_CONTRACT_VERSION)
        require(eventId.isNotBlank() && expectedScheduleRevision.isNotBlank())
        require(changedMatchIds.size in 1..2048 && changedMatchIds.all(String::isNotBlank))
        require(changedMatchIds.distinct().size == changedMatchIds.size)
    }
}

@Serializable
data class ScheduleReflowPlacementDto(val start: String, val end: String, val fieldId: String)

@Serializable
data class ScheduleReflowOfficialAssignmentDto(
    val positionId: String,
    val slotIndex: Int,
    val holderType: OfficialAssignmentHolderType,
    val userId: String?,
    val eventOfficialId: String?,
    val checkedIn: Boolean,
    val hasConflict: Boolean,
) {
    fun toModel() = MatchOfficialAssignment(positionId, slotIndex, holderType, userId, eventOfficialId, checkedIn, hasConflict)
}

@Serializable
data class ScheduleReflowAssignmentsDto(
    val teamOfficialId: String?,
    val officialAssignments: List<ScheduleReflowOfficialAssignmentDto>,
)

@Serializable
data class ScheduleReflowPlacementChangeDto(
    val matchId: String,
    val before: ScheduleReflowPlacementDto,
    val after: ScheduleReflowPlacementDto,
)

@Serializable
data class ScheduleReflowAssignmentChangeDto(
    val matchId: String,
    val before: ScheduleReflowAssignmentsDto,
    val after: ScheduleReflowAssignmentsDto,
)

@Serializable
data class ScheduleReflowWarningDto(val code: String, val matchIds: List<String>, val message: String)

@Serializable
data class ScheduleReflowResultDto(
    val contractVersion: Int,
    val eventId: String,
    val status: ScheduleReflowStatus,
    val scheduleRevision: String,
    val affectedMatchIds: List<String>,
    val protectedMatchIds: List<String>,
    val placementChanges: List<ScheduleReflowPlacementChangeDto>,
    val assignmentChanges: List<ScheduleReflowAssignmentChangeDto>,
    val warnings: List<ScheduleReflowWarningDto>,
    val exploredStates: Int,
    val graph: EventEditorMaintenanceGraphDto?,
) {
    val hasPlacementChanges: Boolean get() = placementChanges.isNotEmpty()
    val isAssignmentOnly: Boolean get() = assignmentChanges.isNotEmpty() && !hasPlacementChanges

    fun validateFor(expectedEventId: String) {
        require(contractVersion == SCHEDULE_REFLOW_CONTRACT_VERSION) { "Unsupported Reflow contract version." }
        require(eventId == expectedEventId && scheduleRevision.isNotBlank()) { "Invalid Reflow identity." }
        require(exploredStates >= 0)
        val changed = status == ScheduleReflowStatus.CHANGED
        require(changed == (graph != null) && changed == (hasPlacementChanges || assignmentChanges.isNotEmpty())) {
            "Only a changed Reflow can contain a graph and changes."
        }
        for (ids in listOf(affectedMatchIds, protectedMatchIds, placementChanges.map { it.matchId }, assignmentChanges.map { it.matchId })) {
            require(ids.all(String::isNotBlank) && ids.distinct().size == ids.size) { "Invalid Reflow Match IDs." }
        }
        val changedIds = (placementChanges.map { it.matchId } + assignmentChanges.map { it.matchId }).toSet()
        require(affectedMatchIds.containsAll(changedIds) && changedIds.none { it in protectedMatchIds }) {
            "Reflow changed a protected or unaffected Match."
        }
        placementChanges.forEach { change ->
            for (placement in listOf(change.before, change.after)) {
                require(placement.fieldId.isNotBlank() && Instant.parse(placement.end) > Instant.parse(placement.start))
            }
            require(change.before != change.after)
        }
        assignmentChanges.forEach { change ->
            require(change.before != change.after)
            for (value in listOf(change.before, change.after)) {
                require(value.teamOfficialId == null || value.teamOfficialId.isNotBlank())
                val slots = value.officialAssignments.map { it.positionId to it.slotIndex }
                require(slots.distinct().size == slots.size)
                require(value.officialAssignments.all { it.positionId.isNotBlank() && it.slotIndex >= 0 })
            }
        }
        graph?.let { value ->
            require(value.canonicalEvent?.id == eventId && value.canonicalMatches.isNotEmpty()) { "Reflow needs a canonical Match Graph." }
            val ids = value.canonicalMatches.map { it.id }
            require(ids.distinct().size == ids.size && ids.containsAll(changedIds))
            require(value.canonicalMatches.all { it.eventId == eventId })
        }
    }
}
