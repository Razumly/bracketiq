package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.SportDTO
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.eventSearch.util.EventFilter
import dev.icerock.moko.geo.LatLng
import kotlin.test.Test
import kotlin.test.assertEquals

class DiscoverCatalogFiltersTest {
    @Test
    fun rental_filters_use_facility_coordinates_and_nearest_order() {
        val origin = LatLng(45.52, -122.67)
        val near = organization(
            id = "near",
            name = "Near facility",
            sports = listOf("Soccer"),
            coordinates = listOf(-122.68, 45.53),
        )
        val far = organization(
            id = "far",
            name = "Far facility",
            sports = listOf("Soccer"),
            coordinates = listOf(-122.33, 47.60),
        )
        val missing = organization(
            id = "missing",
            name = "Missing coordinates",
            sports = listOf("Soccer"),
            coordinates = null,
        )
        val sport = sport(id = "soccer", name = "Soccer")

        val withinRadius = filterAndSortDiscoverRentals(
            rentals = listOf(far, missing, near),
            filter = EventFilter(sportIds = setOf("soccer")),
            sports = listOf(sport),
            searchLocation = origin,
            radiusMiles = 50.0,
        )
        val nearestFirst = filterAndSortDiscoverRentals(
            rentals = listOf(far, missing, near),
            filter = EventFilter(sportIds = setOf("soccer")),
            sports = listOf(sport),
            searchLocation = origin,
            radiusMiles = 0.0,
        )

        assertEquals(listOf("near"), withinRadius.map(Organization::id))
        assertEquals(listOf("near", "far", "missing"), nearestFirst.map(Organization::id))
    }

    @Test
    fun team_filters_require_all_selected_team_and_distance_values() {
        val origin = LatLng(45.52, -122.67)
        val nearOrganization = organization(
            id = "near-org",
            name = "Near org",
            coordinates = listOf(-122.68, 45.53),
        )
        val farOrganization = organization(
            id = "far-org",
            name = "Far org",
            coordinates = listOf(-122.33, 47.60),
        )
        val matching = team(id = "matching", organizationId = nearOrganization.id)
        val far = team(id = "far", organizationId = farOrganization.id)
        val wrongSkill = team(
            id = "wrong-skill",
            organizationId = nearOrganization.id,
            skillId = "recreational",
        )
        val filter = EventFilter(
            sportIds = setOf("soccer"),
            divisionGenders = setOf("F"),
            skillDivisionTypeIds = setOf("premier"),
            ageDivisionTypeIds = setOf("u12"),
            divisionPriceMin = 50.0,
            divisionPriceMax = 100.0,
        )

        val result = filterAndSortDiscoverTeams(
            teams = listOf(far, wrongSkill, matching),
            filter = filter,
            sports = listOf(sport(id = "soccer", name = "Soccer")),
            organizationsById = mapOf(
                nearOrganization.id to nearOrganization,
                farOrganization.id to farOrganization,
            ),
            searchLocation = origin,
            radiusMiles = 50.0,
        )

        assertEquals(listOf("matching"), result.map(Team::id))
    }

    private fun organization(
        id: String,
        name: String,
        sports: List<String> = emptyList(),
        coordinates: List<Double>?,
    ): Organization = Organization(
        id = id,
        name = name,
        location = null,
        description = null,
        logoId = null,
        ownerId = "owner",
        website = null,
        sports = sports,
        hasStripeAccount = false,
        coordinates = coordinates,
    )

    private fun team(
        id: String,
        organizationId: String,
        skillId: String = "premier",
    ): Team = Team(
        division = "Girls U12 Premier",
        name = id,
        captainId = "captain",
        teamSize = 12,
        sport = "Soccer",
        skillDivisionTypeId = skillId,
        ageDivisionTypeId = "u12",
        divisionGender = "F",
        organizationId = organizationId,
        openRegistration = true,
        registrationPriceCents = 7_500,
        id = id,
    )

    private fun sport(id: String, name: String): Sport = SportDTO(name = name).toSport(id)
}
