package com.razumly.mvp.core.data.dataTypeModifiers

import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.dtos.TournamentDTO
import com.razumly.mvp.util.PythonExecutor
import kotlinx.serialization.json.Json

fun Tournament.Companion.validTournament(
    tournamentId: String,
    doubleElimination: Boolean = false,
    teamsCount: Int = 30,
    fieldCount: Int = 8,
    days: Int = 1,
    divisions: List<String> = listOf("B", "BB", "A", "AA", "Open"),
): Tournament {
    val result = PythonExecutor.executePythonScript(
        scriptModule = "src.tests.android_studio_test",
        args = mapOf(
            "id" to tournamentId,
            "teams" to teamsCount.toString(),
            "fields" to fieldCount.toString(),
            "days" to days.toString(),
            "divisions" to divisions.joinToString(" "),
            "double_elimination" to doubleElimination.toString(),
        )
    )
    val tournament = Json.decodeFromString<TournamentDTO>(result)
    return tournament
}