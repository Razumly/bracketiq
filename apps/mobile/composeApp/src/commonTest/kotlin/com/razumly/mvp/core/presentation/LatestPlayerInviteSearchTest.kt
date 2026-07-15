package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class LatestPlayerInviteSearchTest {

    @Test
    fun given_out_of_order_team_invite_results_when_older_finishes_last_then_latest_query_wins() = runTest {
        val harness = InviteSearchHarness(this)

        harness.start("sa")
        harness.start("sam")
        harness.complete("sam", user("latest-team-result"))
        assertEquals(listOf("latest-team-result"), harness.resultIds())

        harness.complete("sa", user("stale-team-result"))

        assertEquals(listOf("latest-team-result"), harness.resultIds())
    }

    @Test
    fun given_out_of_order_chat_invite_results_when_older_finishes_last_then_latest_query_wins() = runTest {
        val harness = InviteSearchHarness(this)

        harness.start("jo")
        harness.start("jordan")
        harness.complete("jordan", user("latest-chat-result"))
        assertEquals(listOf("latest-chat-result"), harness.resultIds())

        harness.complete("jo", user("stale-chat-result"))

        assertEquals(listOf("latest-chat-result"), harness.resultIds())
    }

    @Test
    fun given_running_team_invite_search_when_query_is_cleared_then_late_result_stays_invalidated() = runTest {
        val harness = InviteSearchHarness(this)
        harness.start("casey")

        harness.search.submit("")
        harness.complete("casey", user("late-team-result"))

        assertTrue(harness.resultIds().isEmpty())
    }

    @Test
    fun given_running_chat_invite_search_when_surface_is_destroyed_then_late_result_stays_invalidated() = runTest {
        val harness = InviteSearchHarness(this)
        harness.start("riley")

        harness.search.invalidate()
        harness.complete("riley", user("late-chat-result"))

        assertTrue(harness.resultIds().isEmpty())
    }

    @Test
    fun given_visible_results_when_a_new_valid_query_starts_then_old_results_clear_immediately() = runTest {
        val harness = InviteSearchHarness(this)
        harness.start("sa")
        harness.complete("sa", user("old-result"))
        assertEquals(listOf("old-result"), harness.resultIds())

        harness.search.submit("sam")

        assertTrue(harness.resultIds().isEmpty())
        harness.awaitRequest("sam")
        harness.complete("sam", user("new-result"))
        assertEquals(listOf("new-result"), harness.resultIds())
    }

    @Test
    fun given_an_older_search_fails_after_a_newer_search_succeeds_then_failure_is_suppressed() = runTest {
        val harness = InviteSearchHarness(this)
        harness.start("sa")
        harness.start("sam")
        harness.complete("sam", user("new-result"))

        harness.fail("sa", IllegalStateException("stale failure"))

        assertEquals(listOf("new-result"), harness.resultIds())
        assertTrue(harness.failures().isEmpty())
    }

    private fun user(id: String): UserData = UserData().copy(id = id)
}

@OptIn(ExperimentalCoroutinesApi::class)
private class InviteSearchHarness(private val scope: TestScope) {
    private val requests = mutableMapOf<String, CompletableDeferred<Result<List<UserData>>>>()
    private val failures = mutableListOf<Throwable>()

    val search = LatestPlayerInviteSearch(
        scope = scope,
        searchPlayers = { query ->
            val response = CompletableDeferred<Result<List<UserData>>>()
            requests[query] = response
            withContext(NonCancellable) { response.await() }
        },
        excludedUserId = { "current-user" },
        onFailure = failures::add,
    )

    suspend fun start(query: String) {
        search.submit(query)
        awaitRequest(query)
    }

    suspend fun awaitRequest(query: String) {
        scope.advanceTimeBy(PLAYER_INVITE_SEARCH_DEBOUNCE_MILLIS)
        scope.runCurrent()
        check(requests.containsKey(query)) { "Search request for '$query' did not start." }
    }

    suspend fun complete(query: String, vararg users: UserData) {
        checkNotNull(requests[query]).complete(Result.success(users.toList()))
        scope.runCurrent()
        assertTrue(failures.isEmpty())
    }

    suspend fun fail(query: String, error: Throwable) {
        checkNotNull(requests[query]).complete(Result.failure(error))
        scope.runCurrent()
    }

    fun resultIds(): List<String> = search.suggestions.value.map(UserData::id)

    fun failures(): List<Throwable> = failures.toList()
}
