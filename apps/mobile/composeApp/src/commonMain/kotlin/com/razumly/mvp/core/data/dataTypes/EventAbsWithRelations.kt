package com.razumly.mvp.core.data.dataTypes

sealed interface EventAbsWithRelations {
    val event: EventAbs
    val players: List<UserData>
    val teams: List<Team>

    companion object {
        fun getEmptyEvent(event: EventAbs): EventAbsWithRelations =
            when (event) {
                is EventImp -> EventWithRelations(event)
                is Tournament -> TournamentWithRelations(event)
            }
    }
}


