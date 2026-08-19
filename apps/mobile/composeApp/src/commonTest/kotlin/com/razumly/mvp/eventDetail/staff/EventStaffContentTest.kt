package com.razumly.mvp.eventDetail.staff

import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.eventDetail.EventStaffRole
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class EventStaffContentTest {

    @Test
    fun assigned_staff_without_hydrated_user_shows_explicit_name_error() {
        val cards = buildAssignedStaffCards(
            role = EventStaffRole.OFFICIAL,
            userIds = listOf("official-1"),
            knownUsersById = emptyMap(),
            staffInvites = emptyList(),
        )

        assertEquals(1, cards.size)
        assertEquals(STAFF_NAME_UNAVAILABLE_LABEL, cards.single().title)
        assertFalse(cards.single().title.contains("official-1"))
    }

    @Test
    fun staff_with_incomplete_name_shows_explicit_name_error() {
        val user = UserData().copy(
            id = "official-1",
            firstName = "Jordan",
            lastName = "",
            userName = "jordan_official",
        )

        assertEquals(null, staffFullName(user))
        assertEquals(STAFF_NAME_UNAVAILABLE_LABEL, userDisplayName(user))
    }

    @Test
    fun staff_with_privacy_display_name_but_no_full_name_shows_explicit_name_error() {
        val user = UserData().copy(
            id = "official-1",
            firstName = "",
            lastName = "",
            privacyDisplayName = "jordan_official",
        )

        assertEquals(null, staffFullName(user))
        assertEquals(STAFF_NAME_UNAVAILABLE_LABEL, userDisplayName(user))
    }
}
