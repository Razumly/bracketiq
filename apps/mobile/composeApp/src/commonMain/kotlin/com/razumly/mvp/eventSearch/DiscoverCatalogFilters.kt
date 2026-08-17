package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.util.calcDistance
import com.razumly.mvp.eventSearch.util.EventFilter
import dev.icerock.moko.geo.LatLng

internal fun filterAndSortDiscoverRentals(
    rentals: List<Organization>,
    filter: EventFilter,
    sports: List<Sport>,
    searchLocation: LatLng?,
    radiusMiles: Double,
): List<Organization> {
    val selectedSportTokens = selectedDiscoverSportTokens(filter, sports)
    return rentals
        .asSequence()
        .filter { rental ->
            selectedSportTokens.isEmpty() || rental.sports.any { sport ->
                sport.normalizedDiscoverFilterToken() in selectedSportTokens
            }
        }
        .filter { rental ->
            matchesDiscoverDistance(
                location = rental.discoverLocationOrNull(),
                searchLocation = searchLocation,
                radiusMiles = radiusMiles,
            )
        }
        .sortedWith(discoverDistanceComparator<Organization>(searchLocation) { rental ->
            rental.discoverLocationOrNull()
        }.thenBy { rental -> rental.name.lowercase() })
        .toList()
}

internal fun filterAndSortDiscoverTeams(
    teams: List<Team>,
    filter: EventFilter,
    sports: List<Sport>,
    organizationsById: Map<String, Organization>,
    searchLocation: LatLng?,
    radiusMiles: Double,
): List<Team> {
    val selectedSportTokens = selectedDiscoverSportTokens(filter, sports)
    val selectedGenders = filter.divisionGenders.normalizedDiscoverFilterTokens(String::uppercase)
    val selectedSkills = filter.skillDivisionTypeIds.normalizedDiscoverFilterTokens(String::lowercase)
    val selectedAges = filter.ageDivisionTypeIds.normalizedDiscoverFilterTokens(String::lowercase)

    return teams
        .asSequence()
        .filter { team ->
            selectedSportTokens.isEmpty() ||
                team.sport?.normalizedDiscoverFilterToken() in selectedSportTokens
        }
        .filter { team ->
            selectedGenders.isEmpty() ||
                team.divisionGender?.trim()?.uppercase() in selectedGenders
        }
        .filter { team ->
            selectedSkills.isEmpty() ||
                team.skillDivisionTypeId?.trim()?.lowercase() in selectedSkills
        }
        .filter { team ->
            selectedAges.isEmpty() ||
                team.ageDivisionTypeId?.trim()?.lowercase() in selectedAges
        }
        .filter { team ->
            val registrationPrice = team.registrationPriceCents / 100.0
            (filter.divisionPriceMin == null || registrationPrice >= filter.divisionPriceMin) &&
                (filter.divisionPriceMax == null || registrationPrice <= filter.divisionPriceMax)
        }
        .filter { team ->
            matchesDiscoverDistance(
                location = team.discoverLocationOrNull(organizationsById),
                searchLocation = searchLocation,
                radiusMiles = radiusMiles,
            )
        }
        .sortedWith(discoverDistanceComparator<Team>(searchLocation) { team ->
            team.discoverLocationOrNull(organizationsById)
        }.thenBy { team -> team.name.lowercase() })
        .toList()
}

private fun selectedDiscoverSportTokens(
    filter: EventFilter,
    sports: List<Sport>,
): Set<String> {
    val selectedIds = filter.sportIds.normalizedDiscoverFilterTokens(String::lowercase)
    if (selectedIds.isEmpty()) return emptySet()
    return buildSet {
        addAll(selectedIds)
        sports.forEach { sport ->
            if (sport.id.normalizedDiscoverFilterToken() in selectedIds) {
                add(sport.name.normalizedDiscoverFilterToken())
            }
        }
    }
}

private fun Set<String>.normalizedDiscoverFilterTokens(
    transform: (String) -> String,
): Set<String> = map { value -> transform(value.trim()) }
    .filter(String::isNotBlank)
    .toSet()

private fun String.normalizedDiscoverFilterToken(): String = trim().lowercase()

private fun Organization.discoverLocationOrNull(): LatLng? {
    val values = coordinates ?: return null
    if (values.size < 2) return null
    val longitude = values[0]
    val latitude = values[1]
    if (!latitude.isFinite() || !longitude.isFinite()) return null
    if (latitude !in -90.0..90.0 || longitude !in -180.0..180.0) return null
    return LatLng(latitude, longitude)
}

private fun Team.discoverLocationOrNull(
    organizationsById: Map<String, Organization>,
): LatLng? = organizationId
    ?.trim()
    ?.takeIf(String::isNotBlank)
    ?.let(organizationsById::get)
    ?.discoverLocationOrNull()

private fun matchesDiscoverDistance(
    location: LatLng?,
    searchLocation: LatLng?,
    radiusMiles: Double,
): Boolean {
    if (searchLocation == null || radiusMiles <= 0.0) return true
    return location != null && calcDistance(searchLocation, location) <= radiusMiles
}

private fun <T> discoverDistanceComparator(
    searchLocation: LatLng?,
    location: (T) -> LatLng?,
): Comparator<T> = compareBy { item ->
    searchLocation?.let { origin ->
        location(item)?.let { destination -> calcDistance(origin, destination) }
    } ?: Double.MAX_VALUE
}
