package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.flow.Flow

interface IEventAbsRepository : IMVPRepository {
    suspend fun getEvent(event: EventAbs): Result<EventAbsWithRelations>
    fun getEventsInBounds(bounds: Bounds, userLocation: LatLng): Flow<Result<List<EventAbsWithRelations>>>
    fun getEvents(query: String, userLocation: LatLng): Flow<Result<List<EventAbsWithRelations>>>
    suspend fun searchEvents(searchQuery: String, userLocation: LatLng): Flow<Result<List<EventAbsWithRelations>>>
    suspend fun addCurrentUserToEvent(event: EventAbs): Result<Unit>
    suspend fun addTeamToEvent(event: EventAbs, team: TeamWithRelations): Result<Unit>
}