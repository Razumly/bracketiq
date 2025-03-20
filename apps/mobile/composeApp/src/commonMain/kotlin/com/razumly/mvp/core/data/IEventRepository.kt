package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithPlayers
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData

interface IEventRepository {
    suspend fun getEvent(event: EventAbs): Result<EventAbsWithPlayers>
    suspend fun createEvent(newEvent: EventImp): Result<EventImp>
    suspend fun updateEvent(newEvent: EventImp): Result<EventImp>
    suspend fun searchEvents(query: String): Result<List<EventAbs>>
    suspend fun addTeamToEvent(event: EventAbs, team: TeamWithRelations): Result<Unit>
    suspend fun addPlayerToEvent(event: EventAbs, player: UserData): Result<Unit>
}