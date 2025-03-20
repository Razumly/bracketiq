package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithPlayers
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData

class EventRepository: IEventRepository {
    override suspend fun getEvent(event: EventAbs): Result<EventAbsWithPlayers> {
        TODO("Not yet implemented")
    }

    override suspend fun createEvent(newEvent: EventImp): Result<EventImp> {
        TODO("Not yet implemented")
    }

    override suspend fun updateEvent(newEvent: EventImp): Result<EventImp> {
        TODO("Not yet implemented")
    }

    override suspend fun searchEvents(query: String): Result<List<EventAbs>> {
        TODO("Not yet implemented")
    }

    override suspend fun addTeamToEvent(event: EventAbs, team: TeamWithRelations): Result<Unit> {
        TODO("Not yet implemented")
    }

    override suspend fun addPlayerToEvent(event: EventAbs, player: UserData): Result<Unit> {
        TODO("Not yet implemented")
    }
}