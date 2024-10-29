package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Match
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.Tournament

actual class AppwriteRepository {
    actual suspend fun getTournament(tournamentId: String): Tournament? {
        TODO("Not yet implemented")
    }

    actual suspend fun getTeams(teamId: String): Team? {
        TODO("Not yet implemented")
    }

    actual suspend fun getMatches(matchId: String): Match? {
        TODO("Not yet implemented")
    }

    actual suspend fun getFields(fieldId: String): Field? {
        TODO("Not yet implemented")
    }

    actual suspend fun login(email: String, password: String) {
    }
}