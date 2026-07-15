package com.razumly.mvp.eventSearch.util

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.eventTagIdentity
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
data class EventFilter(
    val price: Pair<Double, Double>? = null,
    val date: Pair<Instant, Instant?> = Pair(Clock.System.now(), null),
    val sportIds: Set<String> = emptySet(),
    val tagSlugs: Set<String> = emptySet(),
    val divisionGenders: Set<String> = emptySet(),
    val skillDivisionTypeIds: Set<String> = emptySet(),
    val ageDivisionTypeIds: Set<String> = emptySet(),
    val divisionPriceMin: Double? = null,
    val divisionPriceMax: Double? = null,
) {
    fun filter(event: Event, includePastEvents: Boolean = false): Boolean {
        if (sportIds.isNotEmpty()) {
            val eventSportId = event.sportId?.trim()?.takeIf(String::isNotBlank) ?: return false
            if (eventSportId !in sportIds) return false
        }
        if (tagSlugs.isNotEmpty()) {
            val eventTagSlugs = event.tags.map { tag -> tag.eventTagIdentity() }.toSet()
            if (eventTagSlugs.none { tagSlug -> tagSlug in tagSlugs }) return false
        }
        val hasDivisionCriteria = price != null ||
            divisionPriceMin != null ||
            divisionPriceMax != null ||
            divisionGenders.isNotEmpty() ||
            skillDivisionTypeIds.isNotEmpty() ||
            ageDivisionTypeIds.isNotEmpty()
        if (hasDivisionCriteria) {
            val normalizedGenders = divisionGenders.map { it.trim().uppercase() }.toSet()
            val normalizedSkills = skillDivisionTypeIds.map { it.trim().lowercase() }.toSet()
            val normalizedAges = ageDivisionTypeIds.map { it.trim().lowercase() }.toSet()
            val matchingDivision = event.divisionDetails.any { division ->
                val divisionPrice = division.price?.toDouble()?.div(100.0)
                val pairedPriceMatches = price == null ||
                    (divisionPrice != null && divisionPrice >= price.first && divisionPrice <= price.second)
                val minimumPriceMatches = divisionPriceMin == null ||
                    (divisionPrice != null && divisionPrice >= divisionPriceMin)
                val maximumPriceMatches = divisionPriceMax == null ||
                    (divisionPrice != null && divisionPrice <= divisionPriceMax)
                val genderMatches = normalizedGenders.isEmpty() ||
                    division.gender.trim().uppercase() in normalizedGenders
                val skillMatches = normalizedSkills.isEmpty() ||
                    division.skillDivisionTypeId.trim().lowercase() in normalizedSkills
                val ageMatches = normalizedAges.isEmpty() ||
                    division.ageDivisionTypeId.trim().lowercase() in normalizedAges
                pairedPriceMatches && minimumPriceMatches && maximumPriceMatches &&
                    genderMatches && skillMatches && ageMatches
            }
            val hasOnlyPriceCriteria = divisionGenders.isEmpty() &&
                skillDivisionTypeIds.isEmpty() &&
                ageDivisionTypeIds.isEmpty()
            val legacyEventPriceMatches = event.divisionDetails.isEmpty() && hasOnlyPriceCriteria &&
                (price == null || event.price in price.first..price.second) &&
                (divisionPriceMin == null || event.price >= divisionPriceMin) &&
                (divisionPriceMax == null || event.price <= divisionPriceMax)
            if (!matchingDivision && !legacyEventPriceMatches) return false
        }
        val usesWeeklyEndFiltering = event.eventType == EventType.WEEKLY_EVENT
        val effectiveWeeklyEnd = if (usesWeeklyEndFiltering && event.noFixedEndDateTime && event.end <= event.start) {
            Instant.DISTANT_FUTURE
        } else {
            event.end
        }
        if (!includePastEvents) {
            if (usesWeeklyEndFiltering) {
                if (effectiveWeeklyEnd < date.first) return false
            } else if (event.start < date.first) {
                return false
            }
        }
        if (date.second != null) {
            if (usesWeeklyEndFiltering) {
                if (event.start > date.second!!) return false
            } else if (event.start > date.second!!) {
                return false
            }
        }
        return true
    }
}
