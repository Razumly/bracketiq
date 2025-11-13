package com.razumly.mvp.core.data.dataTypes

sealed interface EventAbsWithRelations {
    val event: EventAbs
    val players: List<UserData>
    val teams: List<Team>
    val host: UserData?

    companion object {
        fun getEmptyEvent(event: EventAbs): EventAbsWithRelations =
            EventWithRelations(event as Event, UserData())
    }
}


