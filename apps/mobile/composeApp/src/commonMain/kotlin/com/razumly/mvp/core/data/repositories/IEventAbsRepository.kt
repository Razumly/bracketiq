package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.flow.Flow

interface IEventAbsRepository : IMVPRepository {
    fun getEventWithRelationsFlow(event: EventAbs): Flow<Result<EventAbsWithRelations>>
    fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<EventAbs>>>
    fun searchEventsFlow(searchQuery: String, userLocation: LatLng): Flow<Result<List<EventAbs>>>
    suspend fun updateEvent(event: EventAbs): Result<Unit>
    suspend fun removeTeamFromEvent(event: EventAbs, teamWithPlayers: TeamWithPlayers): Result<Unit>
    suspend fun removeCurrentUserFromEvent(event: EventAbs): Result<Unit>
    suspend fun getEvent(event: EventAbs): Result<EventAbsWithRelations>
    suspend fun getEventsInBounds(bounds: Bounds): Result<List<EventAbs>>
    suspend fun searchEvents(searchQuery: String, userLocation: LatLng): Result<List<EventAbs>>
    suspend fun addCurrentUserToEvent(event: EventAbs): Result<Unit>
    suspend fun addTeamToEvent(event: EventAbs, team: TeamWithPlayers): Result<Unit>
}