package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.flow.Flow

interface IEventAbsRepository : IMVPRepository {
    suspend fun getEvent(event: EventAbs): Result<EventAbsWithPlayers>
    fun getEventWithRelationsFlow(event: EventAbs): Flow<Result<EventAbsWithPlayers>>
    fun getEventsInBoundsFlow(bounds: Bounds, userLocation: LatLng): Flow<Result<List<EventAbsWithPlayers>>>
    suspend fun getEventsInBounds(bounds: Bounds, userLocation: LatLng): Result<List<EventAbs>>
    fun searchEventsFlow(searchQuery: String, userLocation: LatLng): Flow<Result<List<EventAbsWithPlayers>>>
    suspend fun searchEvents(searchQuery: String, userLocation: LatLng): Result<List<EventAbs>>
    suspend fun addCurrentUserToEvent(event: EventAbs): Result<Unit>
    suspend fun addTeamToEvent(event: EventAbs, team: TeamWithRelations): Result<Unit>
}