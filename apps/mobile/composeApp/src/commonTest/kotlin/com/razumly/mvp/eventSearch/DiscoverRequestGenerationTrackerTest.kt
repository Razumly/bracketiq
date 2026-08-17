package com.razumly.mvp.eventSearch

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DiscoverRequestGenerationTrackerTest {
    @Test
    fun given_filter_refresh_when_an_older_page_finishes_then_only_the_latest_generation_is_accepted() {
        val tracker = DiscoverRequestGenerationTracker()
        val olderGeneration = tracker.currentGeneration()

        val latestGeneration = tracker.invalidate()

        assertFalse(tracker.isCurrent(olderGeneration))
        assertTrue(tracker.isCurrent(latestGeneration))
    }

    @Test
    fun given_multiple_forced_refreshes_when_a_middle_request_finishes_then_it_is_rejected() {
        val tracker = DiscoverRequestGenerationTracker()
        tracker.invalidate()
        val middleGeneration = tracker.currentGeneration()
        val latestGeneration = tracker.invalidate()

        assertFalse(tracker.isCurrent(middleGeneration))
        assertTrue(tracker.isCurrent(latestGeneration))
    }
}
