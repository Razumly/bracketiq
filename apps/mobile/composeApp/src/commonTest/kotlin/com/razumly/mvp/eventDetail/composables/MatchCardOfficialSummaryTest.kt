package com.razumly.mvp.eventDetail.composables

import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MatchCardOfficialSummaryTest {

    @Test
    fun resolve_official_summary_prefers_assigned_official_names() {
        val match = MatchMVP(
            matchId = 1,
            eventId = "event_1",
            officialIds = listOf(
                MatchOfficialAssignment(
                    positionId = "r2",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "user_1",
                    eventOfficialId = "event_official_1",
                ),
                MatchOfficialAssignment(
                    positionId = "scorekeeper",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "user_2",
                    eventOfficialId = "event_official_2",
                ),
            ),
            id = "match_1",
        )
        val positions = listOf(
            EventOfficialPosition(id = "r2", name = "R2"),
            EventOfficialPosition(id = "scorekeeper", name = "Scorekeeper"),
        )
        val users = mapOf(
            "user_1" to user(id = "user_1", firstName = "Alice", lastName = "Smith"),
            "user_2" to user(id = "user_2", firstName = "Bob", lastName = "Jones"),
        )

        val summary = resolveEventOfficialSummary(
            match = match,
            positions = positions,
            usersById = users,
            showEventOfficialNames = true,
        )

        assertEquals("Officials: Alice Smith, Bob Jones", summary)
    }

    @Test
    fun resolve_official_summary_falls_back_to_position_labels_when_user_not_found() {
        val match = MatchMVP(
            matchId = 1,
            eventId = "event_1",
            officialIds = listOf(
                MatchOfficialAssignment(
                    positionId = "r1",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "missing_user",
                    eventOfficialId = "event_official_1",
                ),
            ),
            id = "match_1",
        )
        val positions = listOf(
            EventOfficialPosition(id = "r1", name = "R1"),
        )

        val summary = resolveEventOfficialSummary(
            match = match,
            positions = positions,
            usersById = emptyMap(),
            showEventOfficialNames = true,
        )

        assertEquals("Officials: R1", summary)
    }

    @Test
    fun resolve_official_summary_limits_to_current_official_when_requested() {
        val match = MatchMVP(
            matchId = 1,
            eventId = "event_1",
            officialIds = listOf(
                MatchOfficialAssignment(
                    positionId = "r2",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "user_1",
                    eventOfficialId = "event_official_1",
                ),
                MatchOfficialAssignment(
                    positionId = "r1",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "user_2",
                    eventOfficialId = "event_official_2",
                ),
            ),
            id = "match_1",
        )
        val positions = listOf(
            EventOfficialPosition(id = "r2", name = "R2"),
            EventOfficialPosition(id = "r1", name = "R1"),
        )
        val users = mapOf(
            "user_1" to user(id = "user_1", firstName = "Alice", lastName = "Smith"),
            "user_2" to user(id = "user_2", firstName = "Bob", lastName = "Jones"),
        )

        val eventSummary = resolveEventOfficialSummary(
            match = match,
            positions = positions,
            usersById = users,
            showEventOfficialNames = true,
            currentUserId = "user_2",
            currentUserLabel = "Bob Jones",
            showOnlyCurrentOfficial = true,
        )
        val summary = resolveOfficialSummary(
            eventOfficialSummary = eventSummary,
            teamOfficialSummary = "Official: Main",
        )

        assertEquals("Officials: Bob Jones, Team: Main", summary)
    }

    @Test
    fun resolve_official_summary_uses_current_user_label_when_filtered_and_user_map_missing() {
        val match = MatchMVP(
            matchId = 1,
            eventId = "event_1",
            officialIds = listOf(
                MatchOfficialAssignment(
                    positionId = "r2",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "current_user",
                    eventOfficialId = "event_official_1",
                ),
            ),
            id = "match_1",
        )
        val positions = listOf(EventOfficialPosition(id = "r2", name = "R2"))

        val summary = resolveEventOfficialSummary(
            match = match,
            positions = positions,
            usersById = emptyMap(),
            showEventOfficialNames = true,
            currentUserId = "current_user",
            currentUserLabel = "Casey Ref",
            showOnlyCurrentOfficial = true,
        )

        assertEquals("Officials: Casey Ref", summary)
    }

    @Test
    fun calculate_manage_card_height_grows_with_official_slots() {
        val match = MatchMVP(
            matchId = 1,
            eventId = "event_1",
            id = "match_1",
        )
        val positions = listOf(
            EventOfficialPosition(id = "r1", name = "R1", count = 2, order = 0),
            EventOfficialPosition(id = "score", name = "Scorekeeper", count = 1, order = 1),
        )

        val height = calculateMatchCardHeightDp(
            match = match,
            positions = positions,
            manageMode = true,
        )

        assertTrue(height > MATCH_CARD_BASE_HEIGHT_DP)
        assertEquals(3, calculateManageOfficialLineCount(match, positions))
    }
}

private fun user(
    id: String,
    firstName: String,
    lastName: String,
): UserData = UserData(
    firstName = firstName,
    lastName = lastName,
    teamIds = emptyList(),
    friendIds = emptyList(),
    friendRequestIds = emptyList(),
    friendRequestSentIds = emptyList(),
    followingIds = emptyList(),
    userName = "",
    hasStripeAccount = false,
    uploadedImages = emptyList(),
    id = id,
)
