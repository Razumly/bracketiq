package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

internal const val PLAYER_INVITE_SEARCH_DEBOUNCE_MILLIS = 250L
private const val PLAYER_INVITE_SEARCH_MIN_QUERY_LENGTH = 2

/**
 * Owns one invite search surface. Every submit invalidates the previous generation, so even a
 * repository call that ignores coroutine cancellation cannot publish results for an older query.
 */
internal class LatestPlayerInviteSearch(
    private val scope: CoroutineScope,
    private val searchPlayers: suspend (String) -> Result<List<UserData>>,
    private val excludedUserId: () -> String,
    private val onFailure: (Throwable) -> Unit,
    private val debounceMillis: Long = PLAYER_INVITE_SEARCH_DEBOUNCE_MILLIS,
) {
    private val _suggestions = MutableStateFlow<List<UserData>>(emptyList())
    val suggestions: StateFlow<List<UserData>> = _suggestions.asStateFlow()

    private var generation = 0L
    private var searchJob: Job? = null

    fun submit(rawQuery: String) {
        val query = rawQuery.trim()
        val requestGeneration = ++generation
        searchJob?.cancel()
        searchJob = null
        _suggestions.value = emptyList()

        if (query.length < PLAYER_INVITE_SEARCH_MIN_QUERY_LENGTH) {
            return
        }

        searchJob = scope.launch {
            if (debounceMillis > 0) {
                delay(debounceMillis)
            }
            val result = try {
                searchPlayers(query)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Throwable) {
                Result.failure(error)
            }

            if (requestGeneration != generation || !currentCoroutineContext().isActive) {
                return@launch
            }

            result
                .onSuccess { users ->
                    val currentUserId = excludedUserId().trim()
                    _suggestions.value = users.filterNot { user ->
                        currentUserId.isNotEmpty() && user.id == currentUserId
                    }
                }
                .onFailure { error ->
                    _suggestions.value = emptyList()
                    onFailure(error)
                }
        }
    }

    fun invalidate() {
        generation += 1
        searchJob?.cancel()
        searchJob = null
        _suggestions.value = emptyList()
    }
}
