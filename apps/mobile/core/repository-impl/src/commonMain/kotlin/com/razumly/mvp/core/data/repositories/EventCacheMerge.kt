package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.buildEventOfficialRecordId
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers

private fun List<DivisionDetail>.preservesConfiguredDivisionDetailsFrom(cached: Event): Boolean {
    if (cached.divisionDetails.isEmpty()) return true
    return cached.divisions.normalizeDivisionIdentifiers().all { cachedDivisionId ->
        val cachedDetail = cached.divisionDetails.firstOrNull { detail ->
            detail.id.normalizeDivisionIdentifier() == cachedDivisionId
        }
        val currentDetail = firstOrNull { detail ->
            detail.id.normalizeDivisionIdentifier() == cachedDivisionId
        }
        cachedDetail == null ||
            (
                currentDetail != null &&
                    (cachedDetail.maxParticipants == null || currentDetail.maxParticipants != null)
                )
    }
}

private const val EVENT_DIVISION_MARKER = "__division__"
private const val EVENT_PHASE_MARKER = "__phase__"
private const val GENERATED_POOL_MARKER = "_pool_"

private fun DivisionDetail.isEditorGraphOwned(): Boolean {
    val normalizedKind = kind?.trim()?.uppercase()
    val hasPhaseIdentity = id.contains(EVENT_PHASE_MARKER, ignoreCase = true)
    return isSystemGenerated == true ||
        normalizedKind == "POOL" ||
        normalizedKind == "BRACKET" ||
        normalizedKind == "PHASE" ||
        (hasPhaseIdentity && normalizedKind != "PLAYOFF")
}

private fun String.encodedDivisionToken(
    eventId: String,
    requirePhaseIdentity: Boolean = false,
): String? {
    val normalizedId = normalizeDivisionIdentifier()
    val markerIndex = normalizedId.indexOf(EVENT_DIVISION_MARKER)
    if (markerIndex <= 0) return null
    if (!normalizedId.substring(0, markerIndex).equals(eventId.trim(), ignoreCase = true)) {
        return null
    }
    val tokenStart = markerIndex + EVENT_DIVISION_MARKER.length
    val phaseIndex = normalizedId.indexOf(EVENT_PHASE_MARKER, tokenStart)
    if (requirePhaseIdentity && phaseIndex < 0) return null
    val tokenEnd = if (phaseIndex >= 0) phaseIndex else normalizedId.length
    if (tokenEnd <= tokenStart) return null
    return normalizedId.substring(tokenStart, tokenEnd)
        .normalizeDivisionIdentifier()
        .takeIf(String::isNotBlank)
}

private fun String.editorCanonicalDivisionId(eventId: String): String =
    encodedDivisionToken(eventId) ?: normalizeDivisionIdentifier()

private fun DivisionDetail.encodedGraphDivisionMatchesIncoming(
    eventId: String,
    incomingCanonicalDivisionId: String,
): Boolean {
    val encodedDivision = id.encodedDivisionToken(
        eventId = eventId,
        requirePhaseIdentity = true,
    ) ?: return false
    val normalizedIncoming = incomingCanonicalDivisionId.normalizeDivisionIdentifier()
    if (normalizedIncoming.isBlank()) return false
    if (encodedDivision == normalizedIncoming) return true
    val generatedPoolPrefix = "$normalizedIncoming$GENERATED_POOL_MARKER"
    return encodedDivision.startsWith(generatedPoolPrefix) &&
        encodedDivision.length > generatedPoolPrefix.length
}

private fun Event.incomingEditorCanonicalDivisionIds(): Set<String> = buildSet {
    divisions.forEach { divisionId ->
        divisionId.editorCanonicalDivisionId(id)
            .takeIf(String::isNotBlank)
            ?.let(::add)
    }
    divisionDetails
        .filterNot(DivisionDetail::isEditorGraphOwned)
        .forEach { detail ->
            detail.id.editorCanonicalDivisionId(id)
                .takeIf(String::isNotBlank)
                ?.let(::add)
        }
}

private fun DivisionDetail.resolvesToIncomingCanonicalDivision(
    eventId: String,
    incomingCanonicalDivisionIds: Set<String>,
    cachedDetailsById: Map<String, DivisionDetail>,
): Boolean {
    var sourceId = sourceDivisionId
        ?.normalizeDivisionIdentifier()
        ?.takeIf(String::isNotBlank)
    val visited = mutableSetOf<String>()
    while (sourceId != null && visited.add(sourceId)) {
        if (
            incomingCanonicalDivisionIds.any { incomingId ->
                sourceId.editorCanonicalDivisionId(eventId) == incomingId
            }
        ) {
            return true
        }
        sourceId = cachedDetailsById[sourceId]
            ?.sourceDivisionId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
    }
    return incomingCanonicalDivisionIds.any { incomingId ->
        encodedGraphDivisionMatchesIncoming(
            eventId = eventId,
            incomingCanonicalDivisionId = incomingId,
        )
    }
}

internal fun Event.editorGraphDivisionIds(): List<String> {
    val graphDetailIds = divisionDetails
        .filter(DivisionDetail::isEditorGraphOwned)
        .map { detail -> detail.id.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toSet()
    return buildList {
        divisions.forEach { divisionId ->
            if (divisionId.normalizeDivisionIdentifier() in graphDetailIds) {
                add(divisionId)
            }
        }
        divisionDetails
            .filter(DivisionDetail::isEditorGraphOwned)
            .forEach { detail -> add(detail.id) }
    }
}

/**
 * A rebuilt schedule graph is authoritative for generated divisions and resource identities.
 * Keep editor-owned values from the canonical snapshot for matching configured rows.
 */
internal fun Event.withRebuiltEditorGraphState(graph: Event): Event {
    val canonicalDetailsById = divisionDetails.associateBy { detail ->
        detail.id.normalizeDivisionIdentifier()
    }
    val graphDetails = graph.divisionDetails.map { graphDetail ->
        if (graphDetail.isEditorGraphOwned()) {
            graphDetail
        } else {
            canonicalDetailsById[graphDetail.id.normalizeDivisionIdentifier()] ?: graphDetail
        }
    }
    return copy(
        divisions = graph.divisions,
        divisionDetails = graphDetails,
        teamIds = graph.teamIds,
        fieldIds = graph.fieldIds,
        timeSlotIds = graph.timeSlotIds,
    )
}

/**
 * Rebuilt graph fields carry the authoritative phase associations. Preserve canonical editor
 * values for fields with matching identities and never retain a stale cached field association.
 */
internal fun mergeRebuiltEditorGraphFields(
    canonical: List<com.razumly.mvp.core.data.dataTypes.Field>,
    graph: List<com.razumly.mvp.core.data.dataTypes.Field>,
): List<com.razumly.mvp.core.data.dataTypes.Field> {
    val canonicalById = canonical.associateBy { field -> field.id.trim() }
    return graph.map { graphField ->
        canonicalById[graphField.id.trim()]?.copy(divisions = graphField.divisions) ?: graphField
    }
}

/**
 * Rebuilt graph time slots carry the authoritative phase and scheduled-field associations.
 * Preserve canonical editor values for matching identities and use the exact graph row set.
 */
internal fun mergeRebuiltEditorGraphTimeSlots(
    canonical: List<TimeSlot>,
    graph: List<TimeSlot>,
): List<TimeSlot> {
    val canonicalById = canonical.associateBy { slot -> slot.id.trim() }
    return graph.map { graphSlot ->
        canonicalById[graphSlot.id.trim()]?.copy(
            divisions = graphSlot.divisions,
            scheduledFieldId = graphSlot.scheduledFieldId,
            scheduledFieldIds = graphSlot.scheduledFieldIds,
        ) ?: graphSlot
    }
}

/**
 * Editor snapshots intentionally omit generated graph phases. Keep only cached graph-owned rows
 * in Room while allowing every incoming editor row to replace its cached counterpart.
 */
internal fun Event.withCachedEditorDivisionState(cached: Event?, preserveMatchGraph: Boolean = false): Event {
    if (cached == null) return this

    val incomingCanonicalDivisionIds = incomingEditorCanonicalDivisionIds()
    val cachedDetailsById = cached.divisionDetails.associateBy { detail ->
        detail.id.normalizeDivisionIdentifier()
    }
    val cachedGraphDetails = cached.divisionDetails.filter(DivisionDetail::isEditorGraphOwned)
    val retainedCachedGraphDetails = cachedGraphDetails.filter { detail ->
        preserveMatchGraph || detail.resolvesToIncomingCanonicalDivision(
            eventId = id,
            incomingCanonicalDivisionIds = incomingCanonicalDivisionIds,
            cachedDetailsById = cachedDetailsById,
        )
    }
    val retainedGraphDetailIds = retainedCachedGraphDetails
        .map { detail -> detail.id.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toSet()
    val retainedCachedGraphDivisionIds = cached.editorGraphDivisionIds().filter { divisionId ->
        divisionId.normalizeDivisionIdentifier() in retainedGraphDetailIds
    }
    val mergedDivisionIds = mergeEditorDivisionIds(
        incoming = divisions,
        cached = retainedCachedGraphDivisionIds,
    )
    val knownDetailIds = divisionDetails
        .map { detail -> detail.id.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toMutableSet()
    val mergedDivisionDetails = buildList {
        addAll(divisionDetails)
        retainedCachedGraphDetails.forEach { detail ->
            val normalizedId = detail.id.normalizeDivisionIdentifier()
            if (normalizedId.isNotBlank() && knownDetailIds.add(normalizedId)) {
                add(detail)
            }
        }
    }
    return copy(
        divisions = mergedDivisionIds,
        divisionDetails = mergedDivisionDetails,
    )
}

/**
 * Editor saves replace the cached slot rows, but generated graph phase associations live on the
 * same slot IDs. Merge only those associations; all incoming slot fields remain authoritative.
 */
internal fun List<TimeSlot>.withCachedEditorDivisionAssociations(
    cached: List<TimeSlot>,
    cachedGraphDivisionIds: List<String>,
): List<TimeSlot> {
    if (isEmpty() || cached.isEmpty() || cachedGraphDivisionIds.isEmpty()) return this
    val graphDivisionIds = cachedGraphDivisionIds
        .map(String::normalizeDivisionIdentifier)
        .filter(String::isNotBlank)
        .toSet()
    val cachedById = cached.associateBy { slot -> slot.id.trim() }
    return map { slot ->
        val cachedSlot = cachedById[slot.id.trim()] ?: return@map slot
        val cachedGraphDivisions = cachedSlot.divisions.orEmpty().filter { divisionId ->
            divisionId.normalizeDivisionIdentifier() in graphDivisionIds
        }
        val mergedDivisions = mergeEditorDivisionIds(
            incoming = slot.divisions.orEmpty(),
            cached = cachedGraphDivisions,
        )
        if (mergedDivisions == slot.divisions.orEmpty()) {
            slot
        } else {
            slot.copy(divisions = mergedDivisions)
        }
    }
}

private fun mergeEditorDivisionIds(
    incoming: List<String>,
    cached: List<String>,
): List<String> {
    val knownIds = incoming
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toMutableSet()
    return buildList {
        addAll(incoming)
        cached.forEach { divisionId ->
            val normalizedId = divisionId.normalizeDivisionIdentifier()
            if (normalizedId.isNotBlank() && knownIds.add(normalizedId)) {
                add(divisionId)
            }
        }
    }
}



private fun List<String>.normalizedOfficialUserIds(): List<String> =
    map(String::trim)
        .filter(String::isNotBlank)
        .distinct()

private fun EventOfficial.isSyntheticOfficialIdsProjection(event: Event): Boolean {
    val configuredPositionIds = event.officialPositions
        .map { position -> position.id.trim() }
        .filter(String::isNotBlank)
        .toSet()
    val assignedPositionIds = positionIds
        .map(String::trim)
        .filter(String::isNotBlank)
        .toSet()
    return id.trim().equals(
        buildEventOfficialRecordId(event.id, userId.trim()),
        ignoreCase = true,
    ) &&
        fieldIds.none { fieldId -> fieldId.trim().isNotBlank() } &&
        assignedPositionIds == configuredPositionIds
}

private fun Event.isSyntheticOfficialIdsProjection(): Boolean {
    val incomingOfficialIds = officialIds.normalizedOfficialUserIds()
    val incomingOfficials = eventOfficials
    if (incomingOfficialIds.isEmpty() || incomingOfficials.isEmpty()) return false

    val incomingUserIds = incomingOfficials
        .map(EventOfficial::userId)
        .normalizedOfficialUserIds()
    return incomingUserIds.size == incomingOfficials.size &&
        incomingUserIds.toSet() == incomingOfficialIds.toSet() &&
        incomingOfficials.all { official ->
            official.isSyntheticOfficialIdsProjection(this)
        }
}

/**
 * List responses expose officialIds but omit detailed event-official assignments. The DTO mapper
 * fills the omission with an all-position projection. Do not let that projection widen a cached
 * official's position or field eligibility.
 */
internal fun Event.withCachedOfficialStateForPartialSnapshot(cached: Event?): Event {
    if (cached == null || !isSyntheticOfficialIdsProjection()) return this

    val cachedOfficialsByUserId = cached.eventOfficials.associateBy { official ->
        official.userId.trim()
    }
    if (cachedOfficialsByUserId.isEmpty()) return this

    val mergedOfficials = eventOfficials.map { incomingOfficial ->
        cachedOfficialsByUserId[incomingOfficial.userId.trim()]
            ?.copy(
                userId = incomingOfficial.userId,
                isActive = incomingOfficial.isActive,
            )
            ?: incomingOfficial
    }
    return copy(
        eventOfficials = mergedOfficials,
        officialIds = mergedOfficials.map(EventOfficial::userId).normalizedOfficialUserIds(),
    ).also { merged ->
        merged.nextOccurrence = nextOccurrence
    }
}



internal fun Event.withCachedDivisionStateForPartialSnapshot(cached: Event?): Event {
    val cachedDivisions = cached?.divisions?.normalizeDivisionIdentifiers().orEmpty()
    if (cached == null || cachedDivisions.isEmpty()) return this

    val currentDivisions = divisions.normalizeDivisionIdentifiers()
    val hasAllCachedDivisions = cachedDivisions.all { cachedDivisionId ->
        cachedDivisionId in currentDivisions
    }
    val preserveDivisions = !hasAllCachedDivisions
    val preserveDivisionDetails = preserveDivisions ||
        !divisionDetails.preservesConfiguredDivisionDetailsFrom(cached)

    if (!preserveDivisions && !preserveDivisionDetails) return this

    return copy(
        divisions = if (preserveDivisions) cached.divisions else divisions,
        divisionDetails = if (preserveDivisionDetails) cached.divisionDetails else divisionDetails,
    ).also { merged ->
        merged.nextOccurrence = nextOccurrence
    }
}

internal suspend fun DatabaseService.cachePartialEventsPreservingDivisionState(
    events: List<Event>,
): List<Event> {
    if (events.isEmpty()) return emptyList()
    val cachedById = getEventDao
        .getEventsByIds(events.map(Event::id))
        .associateBy(Event::id)
    val mergedEvents = events.map { event ->
        mergePersistedEventEditorLocks(
            incoming = event
                .withCachedDivisionStateForPartialSnapshot(cachedById[event.id])
                .withCachedOfficialStateForPartialSnapshot(cachedById[event.id]),
            cached = cachedById[event.id],
        )
    }
    getEventDao.upsertEvents(mergedEvents)
    return mergedEvents
}
