package com.razumly.mvp.core.presentation.util

import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData

fun TeamWithPlayers.toTeamDisplayLabel(fallbackLabel: String = "Team"): String =
    teamDisplayLabel(
        teamName = team.name,
        players = players,
        fallbackLabel = fallbackLabel,
    )

fun TeamWithRelations.toTeamDisplayLabel(fallbackLabel: String = "Team"): String =
    teamDisplayLabel(
        teamName = team.name,
        players = players,
        fallbackLabel = fallbackLabel,
    )

private fun teamDisplayLabel(
    teamName: String,
    players: List<UserData>,
    fallbackLabel: String,
): String {
    val explicitName = teamName.trim()
    if (explicitName.isNotEmpty()) {
        return explicitName
    }

    val playerNames = players
        .asSequence()
        .map { player ->
            val firstName = player.firstName.trim()
            if (firstName.isEmpty()) return@map ""

            val lastInitial = player.lastName
                .trim()
                .firstOrNull()
                ?.uppercaseChar()
                ?.toString()
                .orEmpty()

            if (lastInitial.isNotEmpty()) {
                "$firstName.$lastInitial"
            } else {
                firstName
            }
        }
        .filter { it.isNotBlank() }
        .toList()

    if (playerNames.isNotEmpty()) {
        return playerNames.joinToString(" & ")
    }

    return fallbackLabel.trim().ifBlank { "Team" }
}
