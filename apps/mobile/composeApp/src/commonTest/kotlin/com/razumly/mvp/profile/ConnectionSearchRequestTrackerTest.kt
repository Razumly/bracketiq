package com.razumly.mvp.profile

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ConnectionSearchRequestTrackerTest {

    @Test
    fun given_newer_query_when_older_response_arrives_then_it_is_rejected() {
        val tracker = ConnectionSearchRequestTracker()
        val olderRequest = tracker.begin("sam")
        val currentRequest = tracker.begin("samuel")

        assertFalse(tracker.isCurrent(olderRequest, currentQuery = "samuel"))
        assertTrue(tracker.isCurrent(currentRequest, currentQuery = "samuel"))
    }

    @Test
    fun given_cleared_query_when_prior_response_arrives_then_it_is_rejected() {
        val tracker = ConnectionSearchRequestTracker()
        val pendingRequest = tracker.begin("alex")
        tracker.begin("")

        assertFalse(tracker.isCurrent(pendingRequest, currentQuery = ""))
    }

    @Test
    fun given_same_query_requested_twice_when_first_response_arrives_then_only_latest_request_is_accepted() {
        val tracker = ConnectionSearchRequestTracker()
        val firstRequest = tracker.begin("river")
        val secondRequest = tracker.begin("river")

        assertFalse(tracker.isCurrent(firstRequest, currentQuery = "river"))
        assertTrue(tracker.isCurrent(secondRequest, currentQuery = "river"))
    }

    @Test
    fun given_newer_connections_refresh_when_older_refresh_completes_then_the_older_refresh_is_rejected() {
        val tracker = ConnectionRefreshRequestTracker()
        val olderRefresh = tracker.begin()
        val currentRefresh = tracker.begin()

        assertFalse(tracker.isCurrent(olderRefresh))
        assertTrue(tracker.isCurrent(currentRefresh))
    }
}
