package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventAuthorityCapabilities
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventDetailAccessRulesTest {
    @Test
    fun given_unclaimed_external_event_when_local_host_matches_then_server_read_only_state_blocks_management() {
        val event = Event(
            hostId = "host-1",
            organizationId = "org-1",
            affiliateUrl = "https://partner.example/register",
            capabilities = EventAuthorityCapabilities(
                viewerUserId = "host-1",
                readOnlyReason = "MANAGEMENT_AUTHORITY_UNVERIFIED",
            ),
        )
        assertFalse(canManageEventForUser(event, user("host-1"), organization(ownerId = "host-1")))
        assertFalse(canManageEventForUser(event.copy(capabilities = null), user("host-1"), null))
        assertFalse(canManageEventForUser(event.copy(affiliateUrl = null), user("host-1"), null))
    }

    @Test
    fun given_claimed_event_when_authority_changes_then_only_the_server_authorized_viewer_can_manage_it() {
        val event = Event(
            hostId = "old-host",
            affiliateUrl = "https://partner.example/register",
            capabilities = EventAuthorityCapabilities(
                viewerUserId = "new-owner", canEdit = true, canManageStaff = true, readOnly = false,
            ),
        )
        assertTrue(canManageEventForUser(event, user("new-owner"), null))
        assertFalse(canManageEventForUser(event, user("old-host"), null))
        assertTrue(canManageEventForUser(event.copy(affiliateUrl = null), user("new-owner"), null))
    }

    @Test
    fun given_payment_configuration_when_checking_edit_support_then_mobile_does_not_add_a_restriction() {
        assertTrue(canEditEventDetails(Event()))
        assertTrue(
            canEditEventDetails(
                Event(
                    allowPaymentPlans = true,
                    installmentCount = 2,
                    installmentAmounts = listOf(1000, 1000),
                ),
            ),
        )
    }

    @Test
    fun can_edit_event_details_rejects_archived_events() {
        assertFalse(
            canEditEventDetails(
                Event(archivedAt = "2026-06-01T00:00:00Z"),
            ),
        )
    }

    @Test
    fun can_manage_event_for_user_accepts_host_assistant_and_org_manager() {
        assertFalse(canManageEventForUser(Event(hostId = "host-1"), UserData(), null))
        assertTrue(canManageEventForUser(Event(hostId = "host-1"), user(" host-1 "), null))
        assertTrue(
            canManageEventForUser(
                event = Event(assistantHostIds = listOf("assistant-1")),
                user = user(" assistant-1 "),
                organization = null,
            ),
        )
        assertTrue(
            canManageEventForUser(
                event = Event(),
                user = user("org-owner"),
                organization = organization(ownerId = " org-owner "),
            ),
        )
        assertTrue(
            canManageEventForUser(
                event = Event(),
                user = user("staff-1"),
                organization = organization(
                    ownerId = "owner-1",
                    viewerPermissions = listOf(" events.manage "),
                ),
            ),
        )
        assertFalse(
            canManageEventForUser(
                event = Event(hostId = "host-1"),
                user = user("viewer-1"),
                organization = organization(ownerId = "owner-1"),
            ),
        )
    }

    @Test
    fun normalized_team_ids_trim_drop_blanks_and_distinct() {
        assertEquals(
            listOf("team-1", "team-2"),
            listOf(" team-1 ", "", "team-2", "team-1").normalizedTeamIds(),
        )
    }

    @Test
    fun playoff_placement_division_ids_include_mapped_playoff_and_inferred_tournament_brackets() {
        val bracketId = "event-1__division__open"
        val event = Event(
            id = "event-1",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            divisions = listOf("${bracketId}_pool_a"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "league-open",
                    playoffPlacementDivisionIds = listOf(" mapped-playoff "),
                ),
                DivisionDetail(
                    id = "kind-playoff",
                    kind = "PLAYOFF",
                ),
                DivisionDetail(
                    id = "${bracketId}_pool_a",
                    isSystemGenerated = true,
                ),
            ),
        )

        assertEquals(
            setOf("mapped_playoff", "kind_playoff", bracketId),
            event.playoffPlacementDivisionIdsNormalized(),
        )
        assertTrue(event.isPlayoffPlacementDivision(" mapped playoff "))
        assertFalse(event.isPlayoffPlacementDivision("league-open"))
    }

    @Test
    fun default_selected_division_skips_league_playoff_divisions() {
        val event = Event(
            eventType = EventType.LEAGUE,
            divisions = listOf(" playoff-gold ", " open "),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "open",
                    playoffPlacementDivisionIds = listOf("playoff-gold"),
                ),
                DivisionDetail(
                    id = "playoff-gold",
                    kind = "PLAYOFF",
                ),
            ),
        )

        assertEquals("open", event.resolveDefaultSelectedDivisionId())
    }

    @Test
    fun default_selected_division_uses_first_normalized_division_for_non_league_events() {
        assertEquals(
            "division_a",
            Event(
                eventType = EventType.TOURNAMENT,
                divisions = listOf(" Division A ", "Division B"),
            ).resolveDefaultSelectedDivisionId(),
        )
    }

    private fun user(id: String): UserData =
        UserData().copy(id = id)

    private fun organization(
        ownerId: String,
        viewerPermissions: List<String> = emptyList(),
    ): Organization =
        Organization(
            id = "org-1",
            name = "Org",
            location = null,
            description = null,
            logoId = null,
            ownerId = ownerId,
            website = null,
            hasStripeAccount = false,
            coordinates = null,
            fieldIds = emptyList(),
            viewerPermissions = viewerPermissions,
        )
}
