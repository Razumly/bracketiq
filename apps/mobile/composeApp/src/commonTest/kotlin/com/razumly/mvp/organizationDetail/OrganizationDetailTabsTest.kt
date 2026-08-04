package com.razumly.mvp.organizationDetail

import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import kotlin.test.Test
import kotlin.test.assertEquals

class OrganizationDetailTabsTest {

    @Test
    fun resolved_empty_organization_only_shows_overview_and_reviews() {
        assertEquals(
            listOf(
                OrganizationDetailTab.OVERVIEW,
                OrganizationDetailTab.REVIEWS,
            ),
            resolvedTabs(),
        )
    }

    @Test
    fun facility_content_shows_only_tabs_with_available_data_in_canonical_order() {
        assertEquals(
            listOf(
                OrganizationDetailTab.OVERVIEW,
                OrganizationDetailTab.REVIEWS,
                OrganizationDetailTab.EVENTS,
                OrganizationDetailTab.TEAMS,
                OrganizationDetailTab.RENTALS,
            ),
            resolvedTabs(
                hasEvents = true,
                hasTeams = true,
                hasRentals = true,
            ),
        )
    }

    @Test
    fun store_is_only_shown_when_products_exist() {
        assertEquals(
            listOf(
                OrganizationDetailTab.OVERVIEW,
                OrganizationDetailTab.REVIEWS,
                OrganizationDetailTab.STORE,
            ),
            resolvedTabs(hasProducts = true),
        )
    }

    @Test
    fun unresolved_initial_tab_is_preserved_until_its_data_source_finishes() {
        assertEquals(
            listOf(
                OrganizationDetailTab.OVERVIEW,
                OrganizationDetailTab.REVIEWS,
                OrganizationDetailTab.RENTALS,
            ),
            resolveOrganizationDetailTabs(
                initialTab = OrganizationDetailTab.RENTALS,
                eventsLoaded = true,
                hasEvents = false,
                teamsLoaded = true,
                hasTeams = false,
                rentalsLoaded = false,
                hasRentals = false,
                productsLoaded = true,
                hasProducts = false,
            ),
        )
    }

    @Test
    fun private_discover_organization_skips_eager_rental_availability() {
        assertEquals(
            false,
            shouldLoadInitialRentalAvailability(
                initialTab = OrganizationDetailTab.OVERVIEW,
                organization = organization(publicPageEnabled = false),
            ),
        )
    }

    @Test
    fun public_manager_and_direct_rental_views_load_rental_availability() {
        assertEquals(
            true,
            shouldLoadInitialRentalAvailability(
                initialTab = OrganizationDetailTab.OVERVIEW,
                organization = organization(publicPageEnabled = true),
            ),
        )
        assertEquals(
            true,
            shouldLoadInitialRentalAvailability(
                initialTab = OrganizationDetailTab.OVERVIEW,
                organization = organization(
                    publicPageEnabled = false,
                    viewerPermissions = listOf("organization.manage"),
                ),
            ),
        )
        assertEquals(
            true,
            shouldLoadInitialRentalAvailability(
                initialTab = OrganizationDetailTab.RENTALS,
                organization = organization(publicPageEnabled = false),
            ),
        )
    }

    private fun organization(
        publicPageEnabled: Boolean,
        viewerPermissions: List<String> = emptyList(),
    ): Organization = Organization(
        id = "org_1",
        name = "Organization",
        location = null,
        description = null,
        logoId = null,
        ownerId = "owner_1",
        website = null,
        hasStripeAccount = false,
        coordinates = null,
        publicPageEnabled = publicPageEnabled,
        viewerPermissions = viewerPermissions,
    )

    private fun resolvedTabs(
        hasEvents: Boolean = false,
        hasTeams: Boolean = false,
        hasRentals: Boolean = false,
        hasProducts: Boolean = false,
    ): List<OrganizationDetailTab> = resolveOrganizationDetailTabs(
        initialTab = OrganizationDetailTab.OVERVIEW,
        eventsLoaded = true,
        hasEvents = hasEvents,
        teamsLoaded = true,
        hasTeams = hasTeams,
        rentalsLoaded = true,
        hasRentals = hasRentals,
        productsLoaded = true,
        hasProducts = hasProducts,
    )
}
