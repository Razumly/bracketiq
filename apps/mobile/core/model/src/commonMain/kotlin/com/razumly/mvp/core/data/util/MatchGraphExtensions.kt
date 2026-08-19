package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations

fun MatchMVP.persistenceDivisionId(): String? = phaseDivisionId ?: division

fun MatchWithRelations.isGraphMatch(): Boolean =
    !match.phaseDivisionId.isNullOrBlank() ||
        !match.previousLeftId.isNullOrBlank() ||
        !match.previousRightId.isNullOrBlank() ||
        !match.winnerNextMatchId.isNullOrBlank() ||
        !match.loserNextMatchId.isNullOrBlank() ||
        previousRightMatch != null ||
        previousLeftMatch != null ||
        winnerNextMatch != null ||
        loserNextMatch != null

fun MatchWithRelations.matchesDivisionIdentifier(
    normalizedDivisionId: String,
): Boolean {
    val normalizedPhaseDivisionId = match.phaseDivisionId?.normalizeDivisionIdentifier()
    return if (!normalizedPhaseDivisionId.isNullOrBlank()) {
        normalizedPhaseDivisionId == normalizedDivisionId
    } else {
        match.division?.normalizeDivisionIdentifier() == normalizedDivisionId ||
            match.sourceDivisionId?.normalizeDivisionIdentifier() == normalizedDivisionId
    }
}
