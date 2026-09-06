package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventAuthorityCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal data class RefreshedEventAuthority(
    val eventId: String,
    val viewerId: String,
    val capabilities: EventAuthorityCapabilities,
) {
    fun matches(event: Event, viewerId: String): Boolean =
        event.id == eventId && this.viewerId == viewerId && event.capabilities == capabilities
}

/** Holds API verification for this screen session. Room grants alone do not unlock controls. */
internal class EventAuthoritySession {
    private var generation = 0L
    private val _verified = MutableStateFlow<RefreshedEventAuthority?>(null)
    val verified = _verified.asStateFlow()

    suspend fun refresh(
        eventId: String,
        viewerId: String,
        fetch: suspend (String) -> Result<Event>,
    ): Result<Event> {
        val request = ++generation
        _verified.value = null
        return fetch(eventId).onSuccess { event ->
            val capabilities = event.capabilities
            if (request == generation && event.id == eventId && capabilities?.viewerUserId == viewerId) {
                _verified.value = RefreshedEventAuthority(eventId, viewerId, capabilities)
            }
        }
    }

    fun isVerified(event: Event, viewerId: String): Boolean =
        _verified.value?.matches(event, viewerId) == true
}
