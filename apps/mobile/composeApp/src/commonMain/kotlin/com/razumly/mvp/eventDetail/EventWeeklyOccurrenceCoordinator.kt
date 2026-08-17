package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantsSummary
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.time.Instant

internal sealed class WeeklySessionSelectionResult {
    data class Selected(val selection: SelectedWeeklyOccurrenceState) : WeeklySessionSelectionResult()
    data class Rejected(val message: String) : WeeklySessionSelectionResult()
}

internal class EventWeeklyOccurrenceCoordinator {
    private val _selectedWeeklyOccurrence = MutableStateFlow<SelectedWeeklyOccurrenceState?>(null)
    val selectedWeeklyOccurrence = _selectedWeeklyOccurrence.asStateFlow()

    private val _selectedWeeklyOccurrenceSummary = MutableStateFlow<WeeklyOccurrenceSummary?>(null)
    val selectedWeeklyOccurrenceSummary = _selectedWeeklyOccurrenceSummary.asStateFlow()

    private val _weeklyOccurrenceSummaries = MutableStateFlow<Map<String, WeeklyOccurrenceSummary>>(emptyMap())
    val weeklyOccurrenceSummaries = _weeklyOccurrenceSummaries.asStateFlow()

    private val _overviewParticipantSummary = MutableStateFlow<EventParticipantsSummary?>(null)
    val overviewParticipantSummary = _overviewParticipantSummary.asStateFlow()

    fun handleSelectedEventChanged(isWeeklyParent: Boolean) {
        _weeklyOccurrenceSummaries.value = emptyMap()
        if (!isWeeklyParent) {
            _selectedWeeklyOccurrence.value = null
            _selectedWeeklyOccurrenceSummary.value = null
        }
        _overviewParticipantSummary.value = null
    }

    fun clearOverviewParticipantSummary() {
        _overviewParticipantSummary.value = null
    }

    fun clearSelectedWeeklyOccurrenceSummary() {
        _selectedWeeklyOccurrenceSummary.value = null
    }

    fun updateSelectedSummaryFromCache(isWeeklyParent: Boolean, selection: SelectedWeeklyOccurrenceState?) {
        if (!isWeeklyParent) {
            _selectedWeeklyOccurrenceSummary.value = null
            return
        }
        _selectedWeeklyOccurrenceSummary.value = selection
            ?.let { occurrence ->
                weeklyOccurrenceSummaryKey(
                    slotId = occurrence.slotId,
                    occurrenceDate = occurrence.occurrenceDate,
                )?.let(_weeklyOccurrenceSummaries.value::get)
            }
    }

    fun currentSelection(): EventOccurrenceSelection? {
        val selection = _selectedWeeklyOccurrence.value ?: return null
        return EventOccurrenceSelection(
            slotId = selection.slotId,
            occurrenceDate = selection.occurrenceDate,
            label = selection.label,
        )
    }

    fun hasSelectedOccurrenceStarted(now: Instant): Boolean {
        val selection = _selectedWeeklyOccurrence.value ?: return false
        return now >= selection.sessionStart
    }

    fun selectWeeklySession(
        isWeeklyParent: Boolean,
        sessionStart: Instant,
        sessionEnd: Instant,
        slotId: String?,
        occurrenceDate: String?,
        label: String?,
    ): WeeklySessionSelectionResult {
        if (!isWeeklyParent) {
            return WeeklySessionSelectionResult.Rejected(
                "Weekly occurrences are only available from parent weekly events.",
            )
        }
        if (sessionEnd <= sessionStart) {
            return WeeklySessionSelectionResult.Rejected("Selected weekly occurrence time is invalid.")
        }
        val normalizedSlotId = slotId?.trim()?.takeIf(String::isNotBlank)
        val normalizedOccurrenceDate = occurrenceDate?.trim()?.takeIf(String::isNotBlank)
        if (normalizedSlotId == null || normalizedOccurrenceDate == null) {
            return WeeklySessionSelectionResult.Rejected("Select a valid weekly occurrence.")
        }
        val selection = SelectedWeeklyOccurrenceState(
            slotId = normalizedSlotId,
            occurrenceDate = normalizedOccurrenceDate,
            label = label?.trim()?.takeIf(String::isNotBlank) ?: normalizedOccurrenceDate,
            sessionStart = sessionStart,
            sessionEnd = sessionEnd,
        )
        _selectedWeeklyOccurrence.value = selection
        return WeeklySessionSelectionResult.Selected(selection)
    }

    fun clearSelectedWeeklySession() {
        _selectedWeeklyOccurrence.value = null
    }

    fun rememberWeeklyOccurrenceSummary(
        occurrence: EventOccurrenceSelection,
        summary: WeeklyOccurrenceSummary,
    ) {
        val key = weeklyOccurrenceSummaryKey(
            slotId = occurrence.slotId,
            occurrenceDate = occurrence.occurrenceDate,
        ) ?: return
        _weeklyOccurrenceSummaries.value = _weeklyOccurrenceSummaries.value + (key to summary)
        val selected = _selectedWeeklyOccurrence.value
        if (selected != null &&
            selected.slotId == occurrence.slotId &&
            selected.occurrenceDate == occurrence.occurrenceDate
        ) {
            _selectedWeeklyOccurrenceSummary.value = summary
        }
    }

    fun applySelectedOccurrenceParticipantSummary(
        occurrence: EventOccurrenceSelection?,
        weeklySelectionRequired: Boolean,
        participantCount: Int,
        participantCapacity: Int?,
    ) {
        _selectedWeeklyOccurrenceSummary.value = if (occurrence == null || weeklySelectionRequired) {
            null
        } else {
            WeeklyOccurrenceSummary(
                participantCount = participantCount,
                participantCapacity = participantCapacity,
            ).also { summary ->
                rememberWeeklyOccurrenceSummary(occurrence, summary)
            }
        }
    }

    fun applyOverviewParticipantSummary(
        isWeeklyParent: Boolean,
        weeklySelectionRequired: Boolean,
        participantCount: Int,
        participantCapacity: Int?,
    ) {
        _overviewParticipantSummary.value = if (isWeeklyParent || weeklySelectionRequired) {
            null
        } else {
            EventParticipantsSummary(
                participantCount = participantCount,
                participantCapacity = participantCapacity,
                weeklySelectionRequired = false,
            )
        }
    }

    fun pendingOccurrenceSummaries(
        occurrences: List<EventOccurrenceSelection>,
    ): List<EventOccurrenceSelection> {
        val selectedKey = currentSelection()?.let { occurrence ->
            weeklyOccurrenceSummaryKey(
                slotId = occurrence.slotId,
                occurrenceDate = occurrence.occurrenceDate,
            )
        }
        return occurrences
            .mapNotNull { occurrence ->
                val slotId = occurrence.slotId.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
                val occurrenceDate = occurrence.occurrenceDate.trim().takeIf(String::isNotBlank)
                    ?: return@mapNotNull null
                EventOccurrenceSelection(
                    slotId = slotId,
                    occurrenceDate = occurrenceDate,
                    label = occurrence.label,
                )
            }
            .distinctBy { occurrence -> "${occurrence.slotId}|${occurrence.occurrenceDate}" }
            .filter { occurrence ->
                val key = weeklyOccurrenceSummaryKey(
                    slotId = occurrence.slotId,
                    occurrenceDate = occurrence.occurrenceDate,
                )
                key != null &&
                    key != selectedKey &&
                    !_weeklyOccurrenceSummaries.value.containsKey(key)
            }
    }
}

internal fun occurrencesMatch(
    left: EventOccurrenceSelection?,
    right: EventOccurrenceSelection?,
): Boolean {
    return when {
        left == null && right == null -> true
        left == null || right == null -> false
        else -> left.slotId == right.slotId && left.occurrenceDate == right.occurrenceDate
    }
}
