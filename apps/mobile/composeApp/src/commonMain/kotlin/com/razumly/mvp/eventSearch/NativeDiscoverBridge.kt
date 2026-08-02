@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.repositories.EventSearchSort
import com.razumly.mvp.eventSearch.util.EventFilter
import kotlin.time.Instant

/**
 * A Swift-friendly, immutable projection of [EventFilter]. Kotlin sets and pairs are intentionally
 * exposed as lists and named scalar fields so the native iOS presentation never needs to construct
 * Kotlin receiver lambdas or unpack a generic Pair.
 */
data class NativeDiscoverFilterSnapshot(
    val sort: String,
    val priceEnabled: Boolean,
    val priceMin: Double,
    val priceMax: Double,
    val startDate: Instant,
    val endDate: Instant?,
    val sportIds: List<String>,
    val tagSlugs: List<String>,
    val divisionGenders: List<String>,
    val skillDivisionTypeIds: List<String>,
    val ageDivisionTypeIds: List<String>,
    val divisionPriceMinEnabled: Boolean,
    val divisionPriceMin: Double,
    val divisionPriceMaxEnabled: Boolean,
    val divisionPriceMax: Double,
)

/**
 * The active, already-loaded Discover lists after an explicit search submission. The query stays
 * outside the repositories because this interaction filters the content currently on screen; this
 * projection keeps the matching rules identical for the native SwiftUI and Compose presentations.
 */
data class NativeDiscoverSearchSnapshot(
    val events: List<Event>,
    val organizations: List<Organization>,
    val teams: List<Team>,
    val rentals: List<Organization>,
)

internal fun EventFilter.toNativeDiscoverFilterSnapshot(): NativeDiscoverFilterSnapshot =
    NativeDiscoverFilterSnapshot(
        sort = sort.name,
        priceEnabled = price != null,
        priceMin = price?.first ?: 0.0,
        priceMax = price?.second ?: 200.0,
        startDate = date.first,
        endDate = date.second,
        sportIds = sportIds.sorted(),
        tagSlugs = tagSlugs.sorted(),
        divisionGenders = divisionGenders.sorted(),
        skillDivisionTypeIds = skillDivisionTypeIds.sorted(),
        ageDivisionTypeIds = ageDivisionTypeIds.sorted(),
        divisionPriceMinEnabled = divisionPriceMin != null,
        divisionPriceMin = divisionPriceMin ?: 0.0,
        divisionPriceMaxEnabled = divisionPriceMax != null,
        divisionPriceMax = divisionPriceMax ?: 0.0,
    )

internal fun nativeDiscoverEventSort(value: String): EventSearchSort =
    EventSearchSort.entries.firstOrNull { candidate ->
        candidate.name == value.trim().uppercase()
    } ?: EventSearchSort.RECOMMENDED

internal fun normalizedDiscoverFilterValues(values: List<String>): Set<String> =
    values
        .map(String::trim)
        .filter(String::isNotBlank)
        .toSet()

internal fun buildNativeDiscoverSearchSnapshot(
    query: String,
    events: List<Event>,
    organizations: List<Organization>,
    teams: List<Team>,
    rentals: List<Organization>,
): NativeDiscoverSearchSnapshot = NativeDiscoverSearchSnapshot(
    events = events.filter { event ->
        discoverSearchMatches(
            query = query,
            values = buildList {
                add(event.name)
                add(event.description)
                add(event.location)
                add(event.address)
                add(event.sportId)
                addAll(event.divisions)
                event.divisionDetails.forEach { division ->
                    add(division.name)
                    add(division.divisionTypeName)
                    add(division.skillDivisionTypeName)
                    add(division.ageDivisionTypeName)
                    add(division.gender)
                }
                event.tags.forEach { tag ->
                    add(tag.name)
                    add(tag.slug)
                }
            },
        )
    },
    organizations = organizations.filter { organization ->
        organization.matchesDiscoverSearch(query)
    },
    teams = teams.filter { team ->
        discoverSearchMatches(
            query = query,
            values = listOf(
                team.name,
                team.division,
                team.kind,
                team.sport,
                team.skillDivisionTypeName,
                team.ageDivisionTypeName,
                team.divisionGender,
            ),
        )
    },
    rentals = rentals.filter { organization ->
        organization.matchesDiscoverSearch(query)
    },
)

private fun Organization.matchesDiscoverSearch(query: String): Boolean =
    discoverSearchMatches(
        query = query,
        values = buildList {
            add(name)
            add(location)
            add(address)
            add(description)
            add(website)
            addAll(sports)
            divisions.forEach { division ->
                add(division.name)
                add(division.divisionTypeName)
                add(division.skillDivisionTypeName)
                add(division.ageDivisionTypeName)
                add(division.gender)
            }
            facilities.forEach { facility ->
                add(facility.name)
                add(facility.location)
                add(facility.address)
            }
        },
    )

internal fun discoverSearchMatches(query: String, values: Iterable<String?>): Boolean {
    val queryTokens = query
        .trim()
        .lowercase()
        .split(Regex("\\s+"))
        .filter(String::isNotBlank)
    if (queryTokens.isEmpty()) return true

    val searchableText = values
        .mapNotNull { value -> value?.trim()?.lowercase()?.takeIf(String::isNotBlank) }
        .joinToString(separator = " ")
    return queryTokens.all(searchableText::contains)
}
