package com.razumly.mvp.core.data

actual class Database {
    actual suspend fun getTournament(tournamentId: String): Tournament? {
        TODO("Not yet implemented")
    }

    actual suspend fun getTeam(teamId: String): Team? {
        TODO("Not yet implemented")
    }

    actual suspend fun getMatch(matchId: String): Match? {
        TODO("Not yet implemented")
    }

    actual suspend fun getField(fieldId: String): Field? {
        TODO("Not yet implemented")
    }

    actual suspend fun login(email: String, password: String) {
    }
}