package com.razumly.mvp.organizationDetail

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
