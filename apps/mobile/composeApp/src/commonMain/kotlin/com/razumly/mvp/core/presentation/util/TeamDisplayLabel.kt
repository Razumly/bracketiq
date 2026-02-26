package com.razumly.mvp.core.presentation.util

import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers

fun TeamWithPlayers.toTeamDisplayLabel(): String {
    val explicitName = team.name?.trim().orEmpty()
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

    return if (team.seed >= 0) {
        "Team ${team.seed + 1}"
    } else {
        "Team"
    }
}

