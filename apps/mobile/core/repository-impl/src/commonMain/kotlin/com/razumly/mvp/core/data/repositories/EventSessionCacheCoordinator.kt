package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/** Owns viewer-scoped event-cache projection, startup cleanup, and session invalidation. */
internal class EventSessionCacheCoordinator(
    private val databaseService: DatabaseService,
    private val userRepository: IUserRepository,
    coroutineDispatcher: CoroutineDispatcher,
) {
    private val scope = CoroutineScope(SupervisorJob() + coroutineDispatcher)

    init {
        scope.launch {
            databaseService.getEventDao.deleteAllEvents()
        }
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            var hasObservedUser = false
            var lastUserId: String? = null
            userRepository.currentUser.collect { currentUserResult ->
                val currentUserId = currentUserResult.getOrNull()
                    ?.id
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                if (!hasObservedUser) {
                    lastUserId = currentUserId
                    hasObservedUser = true
                    return@collect
                }
                if (currentUserId != lastUserId) {
                    clearForSessionChange()
                    lastUserId = currentUserId
                }
            }
        }
    }

    fun observeCachedEvents(): Flow<Result<List<Event>>> =
        combine(
            databaseService.getEventDao.getAllCachedEvents(),
            userRepository.currentUser,
        ) { cached, currentUserResult ->
            Result.success(filterHiddenEvents(cached, currentUserResult.getOrNull()))
        }

    fun close() {
        scope.cancel()
    }

    fun filterHiddenEvents(events: List<Event>, currentUser: UserData?): List<Event> {
        val hiddenEventIds = currentUser?.hiddenEventIds
            ?.map { hiddenId -> hiddenId.trim() }
            ?.filter(String::isNotBlank)
            ?.toSet()
            ?: emptySet()
        if (hiddenEventIds.isEmpty()) {
            return events
        }
        return events.filterNot { event -> hiddenEventIds.contains(event.id) }
    }

    private suspend fun clearForSessionChange() {
        databaseService.getEventDao.clearAllEventsWithCrossRefs()
        databaseService.getEventParticipantManagementDao.clearAll()
        databaseService.getEventComplianceDao.clearAll()
    }
}
