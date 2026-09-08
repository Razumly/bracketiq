@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import kotlin.time.Instant
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertEquals

class ChildEventEligibilityTest {
    private val event = Event().copy(start = Instant.parse("2027-06-15T18:00:00Z"), teamSignup = false, minAge = 10, maxAge = 12)
    private fun child(dob: String?) = JoinChildOption("child", "Avery Rivera", null, false, dateOfBirth = dob)

    @Test
    fun given_birthdays_when_filtering_then_event_age_limits_are_inclusive() {
        assertTrue(isChildEligibleForEvent(child("2017-06-15"), event, null))
        assertFalse(isChildEligibleForEvent(child("2017-06-16"), event, null))
        assertTrue(isChildEligibleForEvent(child("2014-06-16"), event, null))
        assertFalse(isChildEligibleForEvent(child("2014-06-15"), event, null))
        assertEquals(10, childAgeAtEvent(child("2017-06-15"), event))
    }

    @Test
    fun given_team_event_or_invalid_birthdate_when_filtering_then_child_is_not_offered() {
        assertFalse(isChildEligibleForEvent(child("2016-01-01"), event.copy(teamSignup = true), null))
        listOf(null, "", "bad date", "2016-02-30", "2030-01-01").forEach {
            assertFalse(isChildEligibleForEvent(child(it), event, null))
        }
    }

    @Test
    fun given_division_limit_when_event_age_passes_then_division_cutoff_also_applies() {
        val division = DivisionDetail(id = "junior", divisionTypeId = "c_skill_open_age_u10")
        val volleyball = event.copy(sportIds = listOf("Indoor Volleyball"), divisionDetails = listOf(division))
        assertFalse(isChildEligibleForEvent(child("2016-06-30"), volleyball, "junior"))
        assertTrue(isChildEligibleForEvent(child("2016-07-02"), volleyball, "junior"))
        assertFalse(isChildEligibleForEvent(child("2016-07-02"), volleyball, "missing"))
    }

    @Test
    fun given_leap_birthday_when_reference_precedes_birthday_then_age_is_not_rounded_up() {
        val leapEvent = event.copy(start = Instant.parse("2027-02-28T12:00:00Z"), minAge = 11, maxAge = null)
        assertEquals(10, childAgeAtEvent(child("2016-02-29"), leapEvent))
        assertFalse(isChildEligibleForEvent(child("2016-02-29"), leapEvent, null))
    }
}
