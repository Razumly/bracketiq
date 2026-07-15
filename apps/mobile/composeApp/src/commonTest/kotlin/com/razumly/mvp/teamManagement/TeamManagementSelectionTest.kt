package com.razumly.mvp.teamManagement

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TeamManagementSelectionTest {

    @Test
    fun given_selected_team_removed_by_refresh_then_selection_is_cleared() {
        val selected = team(id = "team-1", name = "Original name")

        val resolved = resolveSelectedTeamAfterRefresh(
            selectedTeam = selected,
            refreshedTeams = emptyList(),
            isDraft = false,
        )

        assertNull(resolved)
    }

    @Test
    fun given_selected_team_still_present_then_refresh_replaces_stale_snapshot() {
        val selected = team(id = "team-1", name = "Original name")
        val refreshed = team(id = "team-1", name = "Updated name")

        val resolved = resolveSelectedTeamAfterRefresh(
            selectedTeam = selected,
            refreshedTeams = listOf(refreshed),
            isDraft = false,
        )

        assertEquals(refreshed, resolved)
    }

    @Test
    fun given_unsaved_team_draft_then_empty_refresh_keeps_editor_open() {
        val draft = team(id = "draft-team", name = "New team")

        val resolved = resolveSelectedTeamAfterRefresh(
            selectedTeam = draft,
            refreshedTeams = emptyList(),
            isDraft = true,
        )

        assertEquals(draft, resolved)
    }

    private fun team(id: String, name: String): TeamWithPlayers = TeamWithPlayers(
        team = Team(captainId = "captain").copy(id = id, name = name),
        captain = null,
        players = emptyList(),
        pendingPlayers = emptyList(),
    )
}
