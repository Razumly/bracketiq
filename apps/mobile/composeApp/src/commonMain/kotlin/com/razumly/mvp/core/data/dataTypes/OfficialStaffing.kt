package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
enum class OfficialSchedulingMode {
    STAFFING,
    SCHEDULE,
    OFF,
}

@Serializable
data class SportOfficialPositionTemplate(
    val name: String,
    val count: Int = 1,
)

@Serializable
data class EventOfficialPosition(
    val id: String,
    val name: String,
    val count: Int = 1,
    val order: Int = 0,
)

@Serializable
data class EventOfficial(
    val id: String,
    val userId: String,
    val positionIds: List<String> = emptyList(),
    val fieldIds: List<String> = emptyList(),
    val isActive: Boolean = true,
)

@Serializable
enum class OfficialAssignmentHolderType {
    OFFICIAL,
    PLAYER,
}

@Serializable
data class MatchOfficialAssignment(
    val positionId: String,
    val slotIndex: Int,
    val holderType: OfficialAssignmentHolderType,
    val userId: String,
    val eventOfficialId: String? = null,
    val checkedIn: Boolean = false,
    val hasConflict: Boolean = false,
)

fun OfficialSchedulingMode.label(): String = when (this) {
    OfficialSchedulingMode.STAFFING -> "Staffing first"
    OfficialSchedulingMode.SCHEDULE -> "Schedule first"
    OfficialSchedulingMode.OFF -> "Ignore staffing conflicts"
}

fun buildEventOfficialPositionId(
    eventId: String,
    order: Int,
    name: String,
): String {
    val slug = name
        .trim()
        .lowercase()
        .replace(Regex("[^a-z0-9]+"), "_")
        .trim('_')
        .take(24)
        .ifBlank { "official" }
    return "event_pos_${eventId}_${order}_${slug}"
}

fun buildEventOfficialRecordId(
    eventId: String,
    userId: String,
): String {
    val slug = userId
        .trim()
        .lowercase()
        .replace(Regex("[^a-z0-9]+"), "_")
        .trim('_')
        .ifBlank { "user" }
    return "event_official_${eventId}_$slug"
}

private fun normalizeCount(value: Int?): Int = (value ?: 1).coerceAtLeast(1)

private fun normalizeOptionalToken(value: String?): String? =
    value?.trim()?.takeIf(String::isNotBlank)

private fun normalizeIdList(values: List<String>): List<String> = values
    .map(String::trim)
    .filter(String::isNotBlank)
    .distinct()

private fun MatchOfficialAssignment.normalizedOrNull(): MatchOfficialAssignment? {
    val normalizedPositionId = positionId.trim()
    val normalizedUserId = userId.trim()
    if (normalizedPositionId.isBlank() || normalizedUserId.isBlank() || slotIndex < 0) {
        return null
    }
    val normalizedEventOfficialId = eventOfficialId?.trim()?.takeIf(String::isNotBlank)
    if (holderType == OfficialAssignmentHolderType.OFFICIAL && normalizedEventOfficialId == null) {
        return null
    }
    if (holderType == OfficialAssignmentHolderType.PLAYER && normalizedEventOfficialId != null) {
        return null
    }
    return copy(
        positionId = normalizedPositionId,
        slotIndex = slotIndex,
        userId = normalizedUserId,
        eventOfficialId = normalizedEventOfficialId,
    )
}

fun List<MatchOfficialAssignment>.normalizedMatchOfficialAssignments(): List<MatchOfficialAssignment> {
    if (isEmpty()) return emptyList()
    val seenSlots = mutableSetOf<String>()
    return mapNotNull(MatchOfficialAssignment::normalizedOrNull)
        .filter { assignment ->
            val slotKey = "${assignment.positionId}:${assignment.slotIndex}"
            seenSlots.add(slotKey)
        }
}

private fun List<MatchOfficialAssignment>.primaryOfficialAssignment(): MatchOfficialAssignment? =
    firstOrNull { assignment -> assignment.holderType == OfficialAssignmentHolderType.OFFICIAL }

fun MatchMVP.normalizedOfficialAssignments(): List<MatchOfficialAssignment> =
    officialIds.normalizedMatchOfficialAssignments()

fun MatchMVP.primaryAssignedOfficialId(): String? =
    normalizedOfficialAssignments().primaryOfficialAssignment()?.userId
        ?: normalizeOptionalToken(officialId)

fun MatchMVP.primaryAssignedOfficialCheckedIn(): Boolean =
    normalizedOfficialAssignments().primaryOfficialAssignment()?.checkedIn
        ?: (officialCheckedIn == true)

fun MatchMVP.assignedOfficialUserIds(): List<String> {
    val assignedIds = normalizedOfficialAssignments().map(MatchOfficialAssignment::userId)
    val legacyOfficialId = normalizeOptionalToken(officialId)
    return (assignedIds + listOfNotNull(legacyOfficialId)).distinct()
}

fun MatchMVP.isUserAssignedToOfficialSlot(userId: String): Boolean {
    val normalizedUserId = userId.trim()
    if (normalizedUserId.isBlank()) return false
    return assignedOfficialUserIds().contains(normalizedUserId)
}

fun MatchMVP.isUserCheckedInForOfficialSlot(userId: String): Boolean {
    val normalizedUserId = userId.trim()
    if (normalizedUserId.isBlank()) return false
    val directAssignment = normalizedOfficialAssignments()
        .firstOrNull { assignment -> assignment.userId == normalizedUserId }
    return when {
        directAssignment != null -> directAssignment.checkedIn
        normalizeOptionalToken(officialId) == normalizedUserId -> officialCheckedIn == true
        else -> false
    }
}

fun MatchMVP.updateOfficialAssignmentCheckIn(
    userId: String,
    checkedIn: Boolean,
): MatchMVP {
    val normalizedUserId = userId.trim()
    if (normalizedUserId.isBlank()) return this
    val normalizedAssignments = normalizedOfficialAssignments()
    val hasDirectAssignment = normalizedAssignments.any { assignment -> assignment.userId == normalizedUserId }
    val updatedAssignments = if (hasDirectAssignment) {
        normalizedAssignments.map { assignment ->
            if (assignment.userId == normalizedUserId) {
                assignment.copy(checkedIn = checkedIn)
            } else {
                assignment
            }
        }
    } else {
        normalizedAssignments
    }
    val primaryOfficial = updatedAssignments.primaryOfficialAssignment()
    val legacyOfficialId = if (updatedAssignments.isNotEmpty()) {
        primaryOfficial?.userId
    } else {
        normalizeOptionalToken(officialId)
    }
    val legacyCheckedIn = if (updatedAssignments.isNotEmpty()) {
        primaryOfficial?.checkedIn == true
    } else if (normalizeOptionalToken(officialId) == normalizedUserId) {
        checkedIn
    } else {
        officialCheckedIn == true
    }
    return copy(
        officialIds = updatedAssignments,
        officialId = legacyOfficialId,
        officialCheckedIn = legacyCheckedIn,
    )
}

fun MatchMVP.officialAssignmentLabels(
    positions: List<EventOfficialPosition>,
): List<String> {
    val positionsById = positions.associateBy(EventOfficialPosition::id)
    return normalizedOfficialAssignments().map { assignment ->
        val position = positionsById[assignment.positionId]
        val baseLabel = position?.name?.trim()?.takeUnless { it.isBlank() } ?: "Official"
        val slotLabel = if ((position?.count ?: 1) > 1) {
            "$baseLabel ${assignment.slotIndex + 1}"
        } else {
            baseLabel
        }
        if (assignment.holderType == OfficialAssignmentHolderType.PLAYER) {
            "$slotLabel (Player)"
        } else {
            slotLabel
        }
    }
}

private fun List<EventOfficialPosition>.normalizedForEvent(eventId: String): List<EventOfficialPosition> {
    if (isEmpty()) return emptyList()
    val normalized = mutableListOf<EventOfficialPosition>()
    val seenIds = mutableSetOf<String>()
    forEachIndexed { index, position ->
        val normalizedName = position.name.trim()
        if (normalizedName.isBlank()) return@forEachIndexed
        val normalizedId = position.id.trim().ifBlank {
            buildEventOfficialPositionId(eventId, index, normalizedName)
        }
        if (!seenIds.add(normalizedId)) return@forEachIndexed
        normalized += EventOfficialPosition(
            id = normalizedId,
            name = normalizedName,
            count = normalizeCount(position.count),
            order = index,
        )
    }
    return normalized
}

private fun List<SportOfficialPositionTemplate>.normalizedTemplates(): List<SportOfficialPositionTemplate> {
    if (isEmpty()) return emptyList()
    return mapNotNull { template ->
        val normalizedName = template.name.trim()
        if (normalizedName.isBlank()) {
            null
        } else {
            SportOfficialPositionTemplate(
                name = normalizedName,
                count = normalizeCount(template.count),
            )
        }
    }
}

fun Sport.defaultEventOfficialPositions(eventId: String): List<EventOfficialPosition> =
    officialPositionTemplates
        .normalizedTemplates()
        .mapIndexed { index, template ->
            EventOfficialPosition(
                id = buildEventOfficialPositionId(eventId, index, template.name),
                name = template.name,
                count = template.count,
                order = index,
            )
        }

private fun positionsMatchTemplates(
    positions: List<EventOfficialPosition>,
    templates: List<SportOfficialPositionTemplate>,
): Boolean {
    val normalizedPositions = positions
        .map { position -> position.name.trim() to normalizeCount(position.count) }
    val normalizedTemplates = templates
        .normalizedTemplates()
        .map { template -> template.name.trim() to normalizeCount(template.count) }
    return normalizedPositions == normalizedTemplates
}

fun Event.shouldReplaceOfficialPositionsWithSportDefaults(
    previousSport: Sport?,
    nextSport: Sport?,
): Boolean {
    if (sportId == nextSport?.id && officialPositions.isEmpty()) {
        return true
    }
    val previousTemplates = previousSport?.officialPositionTemplates.orEmpty()
    if (officialPositions.isEmpty()) {
        return true
    }
    if (!positionsMatchTemplates(officialPositions, previousTemplates)) {
        return false
    }
    return nextSport?.officialPositionTemplates.orEmpty().normalizedTemplates().isNotEmpty()
}

fun Event.syncOfficialStaffing(
    sport: Sport? = null,
    replacePositionsWithSportDefaults: Boolean = false,
): Event {
    val sportDefaults = sport?.defaultEventOfficialPositions(id).orEmpty()
    val resolvedPositions = when {
        replacePositionsWithSportDefaults && sportDefaults.isNotEmpty() -> sportDefaults
        officialPositions.isNotEmpty() -> officialPositions.normalizedForEvent(id)
        officialIds.isNotEmpty() && sportDefaults.isNotEmpty() -> sportDefaults
        officialIds.isNotEmpty() -> listOf(
            EventOfficialPosition(
                id = buildEventOfficialPositionId(id, 0, "Official"),
                name = "Official",
                count = 1,
                order = 0,
            ),
        )
        else -> emptyList()
    }
    val validPositionIds = resolvedPositions.map(EventOfficialPosition::id)
    val validPositionIdSet = validPositionIds.toSet()
    val validFieldIdSet = fieldIds.map(String::trim).filter(String::isNotBlank).toSet()
    val seededOfficials = if (eventOfficials.isNotEmpty()) {
        eventOfficials
    } else {
        officialIds.mapNotNull { officialUserId ->
            val normalizedUserId = officialUserId.trim()
            if (normalizedUserId.isBlank()) {
                null
            } else {
                EventOfficial(
                    id = buildEventOfficialRecordId(id, normalizedUserId),
                    userId = normalizedUserId,
                    positionIds = validPositionIds,
                    fieldIds = emptyList(),
                    isActive = true,
                )
            }
        }
    }
    val normalizedOfficials = seededOfficials
        .mapNotNull { official ->
            val normalizedUserId = official.userId.trim()
            if (normalizedUserId.isBlank()) return@mapNotNull null
            val resolvedPositionIds = official.positionIds
                .map(String::trim)
                .filter(validPositionIdSet::contains)
                .distinct()
                .ifEmpty { validPositionIds }
            if (resolvedPositionIds.isEmpty()) return@mapNotNull null
            EventOfficial(
                id = official.id.trim().ifBlank { buildEventOfficialRecordId(id, normalizedUserId) },
                userId = normalizedUserId,
                positionIds = resolvedPositionIds,
                fieldIds = official.fieldIds
                    .map(String::trim)
                    .filter(validFieldIdSet::contains)
                    .distinct(),
                isActive = official.isActive,
            )
        }
        .distinctBy(EventOfficial::userId)
    return copy(
        officialPositions = resolvedPositions,
        eventOfficials = normalizedOfficials,
        officialIds = normalizedOfficials.map(EventOfficial::userId),
    )
}

fun Event.addOfficialUser(
    userId: String,
    sport: Sport? = null,
): Event {
    val normalizedUserId = userId.trim()
    if (normalizedUserId.isBlank()) return this
    val synced = syncOfficialStaffing(sport = sport)
    val staffingSeeded = if (synced.officialPositions.isEmpty()) {
        synced.copy(
            officialPositions = listOf(
                EventOfficialPosition(
                    id = buildEventOfficialPositionId(synced.id, 0, "Official"),
                    name = "Official",
                    count = 1,
                    order = 0,
                ),
            ),
        ).syncOfficialStaffing(sport = sport)
    } else {
        synced
    }
    if (staffingSeeded.eventOfficials.any { official -> official.userId == normalizedUserId }) {
        return staffingSeeded
    }
    val positionIds = staffingSeeded.officialPositions.map(EventOfficialPosition::id)
    return staffingSeeded.copy(
        eventOfficials = staffingSeeded.eventOfficials + EventOfficial(
            id = buildEventOfficialRecordId(staffingSeeded.id, normalizedUserId),
            userId = normalizedUserId,
            positionIds = positionIds,
            fieldIds = emptyList(),
            isActive = true,
        ),
    ).syncOfficialStaffing(sport = sport)
}

fun Event.removeOfficialUser(
    userId: String,
    sport: Sport? = null,
): Event {
    val normalizedUserId = userId.trim()
    if (normalizedUserId.isBlank()) return this
    return copy(
        eventOfficials = eventOfficials.filterNot { official -> official.userId == normalizedUserId },
        officialIds = officialIds.filterNot { officialId -> officialId.trim() == normalizedUserId },
    ).syncOfficialStaffing(sport = sport)
}

fun Event.updateOfficialUserPositions(
    userId: String,
    positionIds: List<String>,
    sport: Sport? = null,
): Event {
    val normalizedUserId = userId.trim()
    if (normalizedUserId.isBlank()) return this
    val synced = syncOfficialStaffing(sport = sport)
    val validPositionIds = synced.officialPositions.map(EventOfficialPosition::id).toSet()
    val normalizedPositionIds = positionIds
        .map(String::trim)
        .filter(validPositionIds::contains)
        .distinct()
    val updatedOfficials = synced.eventOfficials.mapNotNull { official ->
        if (official.userId != normalizedUserId) {
            official
        } else if (normalizedPositionIds.isEmpty()) {
            null
        } else {
            official.copy(positionIds = normalizedPositionIds)
        }
    }
    return synced.copy(eventOfficials = updatedOfficials).syncOfficialStaffing(sport = sport)
}

fun Event.addOfficialPosition(
    name: String = "Official",
    count: Int = 1,
    sport: Sport? = null,
): Event {
    val synced = syncOfficialStaffing(sport = sport)
    val newPosition = EventOfficialPosition(
        id = buildEventOfficialPositionId(synced.id, synced.officialPositions.size, name),
        name = name.trim().ifBlank { "Official" },
        count = normalizeCount(count),
        order = synced.officialPositions.size,
    )
    return synced.copy(
        officialPositions = synced.officialPositions + newPosition,
        eventOfficials = synced.eventOfficials.map { official ->
            official.copy(positionIds = (official.positionIds + newPosition.id).distinct())
        },
    ).syncOfficialStaffing(sport = sport)
}

fun Event.updateOfficialPosition(
    positionId: String,
    name: String? = null,
    count: Int? = null,
    sport: Sport? = null,
): Event {
    val normalizedPositionId = positionId.trim()
    if (normalizedPositionId.isBlank()) return this
    return copy(
        officialPositions = officialPositions.map { position ->
            if (position.id != normalizedPositionId) {
                position
            } else {
                position.copy(
                    name = name?.trim()?.ifBlank { position.name } ?: position.name,
                    count = normalizeCount(count ?: position.count),
                )
            }
        },
    ).syncOfficialStaffing(sport = sport)
}

fun Event.removeOfficialPosition(
    positionId: String,
    sport: Sport? = null,
): Event {
    val normalizedPositionId = positionId.trim()
    if (normalizedPositionId.isBlank()) return this
    val updatedPositions = officialPositions.filterNot { position -> position.id == normalizedPositionId }
    val updatedOfficials = eventOfficials.mapNotNull { official ->
        val remainingPositionIds = official.positionIds.filterNot { assignedId -> assignedId == normalizedPositionId }
        if (remainingPositionIds.isEmpty()) {
            null
        } else {
            official.copy(positionIds = remainingPositionIds)
        }
    }
    return copy(
        officialPositions = updatedPositions,
        eventOfficials = updatedOfficials,
        officialIds = updatedOfficials.map(EventOfficial::userId),
    ).syncOfficialStaffing(sport = sport)
}

fun EventOfficial.positionSummary(
    positions: List<EventOfficialPosition>,
): String {
    if (positionIds.isEmpty()) return "No positions selected"
    val labels = positions
        .filter { position -> positionIds.contains(position.id) }
        .sortedBy(EventOfficialPosition::order)
        .map(EventOfficialPosition::name)
    return if (labels.isEmpty()) {
        "No positions selected"
    } else {
        labels.joinToString(", ")
    }
}

fun Event.officialPositionSummary(): String = officialPositions
    .sortedBy(EventOfficialPosition::order)
    .joinToString(", ") { position -> "${position.name} x${normalizeCount(position.count)}" }
