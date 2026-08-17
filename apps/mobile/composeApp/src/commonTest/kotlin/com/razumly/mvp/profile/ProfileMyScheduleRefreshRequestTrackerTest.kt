package com.razumly.mvp.profile

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProfileMyScheduleRefreshRequestTrackerTest {

    @Test
    fun given_newer_schedule_refresh_when_older_response_arrives_then_only_latest_is_accepted() {
        val tracker = MyScheduleRefreshRequestTracker()
        val olderRefresh = tracker.begin()
        val latestRefresh = tracker.begin()

        assertFalse(tracker.isCurrent(olderRefresh))
        assertTrue(tracker.isCurrent(latestRefresh))
    }
}
