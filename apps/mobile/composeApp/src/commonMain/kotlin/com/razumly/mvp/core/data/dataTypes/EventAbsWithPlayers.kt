package com.razumly.mvp.core.data.dataTypes

sealed interface EventAbsWithPlayers {
    val event: EventAbs
    val players: List<UserData>

    companion object {
        fun getEmptyEvent(event: EventAbs): EventAbsWithPlayers =
            when (event) {
                is EventImp -> EventWithPlayers(event)
                is Tournament -> TournamentWithPlayers(event)
            }
    }
}


