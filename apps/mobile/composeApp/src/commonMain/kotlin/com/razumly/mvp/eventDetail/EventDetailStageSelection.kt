package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel

internal fun DivisionDetail.isPlayoffDivisionKind(): Boolean =
    kind?.trim()?.equals("PLAYOFF", ignoreCase = true) == true

private fun MutableMap<String, String>.addDivisionOption(
    event: Event,
    rawId: String?,
    explicitLabel: String? = null,
) {
    val normalizedId = rawId
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    if (normalizedId.isBlank() || containsKey(normalizedId)) return

    val label = explicitLabel
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: normalizedId.toDivisionDisplayLabel(event.divisionDetails)
    this[normalizedId] = label.ifBlank { normalizedId }
}

private fun Map<String, String>.toBracketDivisionOptions(): List<BracketDivisionOption> =
    map { (id, label) -> BracketDivisionOption(id = id, label = label) }
        .sortedAlphabetically()

internal fun Event.playoffDivisionIdsForSelection(): Set<String> = buildSet {
    divisionDetails
        .filter(DivisionDetail::isPlayoffDivisionKind)
        .forEach { detail ->
            listOf(detail.id, detail.normalizedTournamentDivisionId())
                .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
                .filter(String::isNotBlank)
                .forEach(::add)
        }

    divisionDetails
        .flatMap { detail -> detail.playoffPlacementDivisionIds }
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .forEach(::add)

    inferredTournamentBracketDivisionIds()
        .filter(String::isNotBlank)
        .forEach(::add)
}

private fun MatchWithRelations.isBracketMatchForDivisionSelection(): Boolean =
    match.losersBracket ||
        !match.previousLeftId.isNullOrBlank() ||
        !match.previousRightId.isNullOrBlank() ||
        !match.winnerNextMatchId.isNullOrBlank() ||
        !match.loserNextMatchId.isNullOrBlank() ||
        previousLeftMatch != null ||
        previousRightMatch != null ||
        winnerNextMatch != null ||
        loserNextMatch != null

internal fun Event.leagueDivisionOptionsForStandings(
    fallbackOptions: List<BracketDivisionOption>,
    matches: List<MatchWithRelations>,
): List<BracketDivisionOption> {
    val playoffDivisionIds = playoffDivisionIdsForSelection()
    val options = linkedMapOf<String, String>()

    divisionDetails
        .filterNot(DivisionDetail::isPlayoffDivisionKind)
        .forEach { detail ->
            options.addDivisionOption(
                event = this,
                rawId = detail.id,
                explicitLabel = detail.name,
            )
        }

    divisions.forEach { divisionId ->
        val normalizedId = divisionId.normalizeDivisionIdentifier()
        if (normalizedId !in playoffDivisionIds) {
            options.addDivisionOption(this, divisionId)
        }
    }

    matches
        .filterNot(MatchWithRelations::isBracketMatchForDivisionSelection)
        .forEach { match ->
            val normalizedDivision = match.match.division
                ?.normalizeDivisionIdentifier()
                .orEmpty()
            if (normalizedDivision !in playoffDivisionIds) {
                options.addDivisionOption(this, match.match.division)
            }
        }

    return options
        .toBracketDivisionOptions()
        .ifEmpty {
            fallbackOptions.filter { option ->
                option.id.normalizeDivisionIdentifier() !in playoffDivisionIds
            }.sortedAlphabetically()
        }
}

internal fun Event.playoffDivisionOptionsForBracket(
    fallbackOptions: List<BracketDivisionOption>,
    matches: List<MatchWithRelations>,
): List<BracketDivisionOption> {
    val playoffDivisionIds = playoffDivisionIdsForSelection()
    val options = linkedMapOf<String, String>()

    divisionDetails
        .filter(DivisionDetail::isPlayoffDivisionKind)
        .forEach { detail ->
            options.addDivisionOption(
                event = this,
                rawId = detail.id,
                explicitLabel = detail.name,
            )
        }

    playoffDivisionIds.forEach { divisionId ->
        options.addDivisionOption(this, divisionId)
    }

    matches.forEach { match ->
        val normalizedDivision = match.match.division
            ?.normalizeDivisionIdentifier()
            .orEmpty()
        val matchesExplicitPlayoffDivision = playoffDivisionIds.isNotEmpty() &&
            normalizedDivision in playoffDivisionIds
        val matchesLegacyBracketShape = playoffDivisionIds.isEmpty() &&
            match.isBracketMatchForDivisionSelection()
        if (matchesExplicitPlayoffDivision || matchesLegacyBracketShape) {
            options.addDivisionOption(this, match.match.division)
        }
    }

    return options
        .toBracketDivisionOptions()
        .ifEmpty {
            fallbackOptions.filter { option ->
                option.id.normalizeDivisionIdentifier() in playoffDivisionIds
            }.sortedAlphabetically()
        }
}

private fun DivisionDetail.matchesSelectionDivision(divisionId: String?): Boolean {
    val normalizedDivisionId = divisionId
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    if (normalizedDivisionId.isBlank()) return false
    return id.normalizeDivisionIdentifier() == normalizedDivisionId ||
        normalizedTournamentDivisionId() == normalizedDivisionId
}

private fun DivisionDetail.referencesPlayoffDivision(playoffDivisionId: String?): Boolean {
    val normalizedPlayoffDivisionId = playoffDivisionId
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    if (normalizedPlayoffDivisionId.isBlank()) return false
    return playoffPlacementDivisionIds.any { placementDivisionId ->
        placementDivisionId.normalizeDivisionIdentifier() == normalizedPlayoffDivisionId
    }
}

internal fun Event.resolvePlayoffDivisionForLeagueDivision(leagueDivisionId: String?): String? =
    divisionDetails
        .firstOrNull { detail ->
            !detail.isPlayoffDivisionKind() && detail.matchesSelectionDivision(leagueDivisionId)
        }
        ?.playoffPlacementDivisionIds
        ?.firstNotNullOfOrNull { divisionId ->
            divisionId.normalizeDivisionIdentifier().takeIf(String::isNotBlank)
        }

internal fun Event.resolveLeagueDivisionForPlayoffDivision(playoffDivisionId: String?): String? =
    divisionDetails
        .firstOrNull { detail ->
            !detail.isPlayoffDivisionKind() && detail.referencesPlayoffDivision(playoffDivisionId)
        }
        ?.let { detail ->
            detail.id.normalizeDivisionIdentifier().takeIf(String::isNotBlank)
        }

internal fun Event.detailBracketDivisionOptions(
    tournamentPoolPlayEnabled: Boolean,
    tournamentBracketDivisionOptions: List<BracketDivisionOption>,
    joinDivisionOptions: List<BracketDivisionOption>,
    leagueDivisionOptions: List<BracketDivisionOption>,
    playoffDivisionOptions: List<BracketDivisionOption>,
): List<BracketDivisionOption> {
    if (tournamentPoolPlayEnabled) {
        val tournamentPoolDivisionIds = tournamentPoolDivisionOptions(bracketDivisionId = null)
            .map { option -> option.id.normalizeDivisionIdentifier() }
            .toSet()
        val bracketOptions = tournamentBracketDivisionOptions
            .filterNot { option ->
                option.id.normalizeDivisionIdentifier() in tournamentPoolDivisionIds
            }
        return bracketOptions.ifEmpty {
            joinDivisionOptions.filterNot { option ->
                option.id.normalizeDivisionIdentifier() in tournamentPoolDivisionIds
            }
        }.distinctById()
    }

    return when {
        eventType == EventType.LEAGUE &&
            splitLeaguePlayoffDivisions &&
            playoffDivisionOptions.isNotEmpty() -> {
            playoffDivisionOptions
        }

        eventType == EventType.LEAGUE -> {
            leagueDivisionOptions
        }

        else -> {
            joinDivisionOptions
        }
    }
}

internal fun Event.preferredStandingsStageDivisionId(
    tournamentPoolPlayEnabled: Boolean,
    selectedDivisionId: String?,
): String? =
    when {
        tournamentPoolPlayEnabled -> {
            resolveBracketDivisionForPool(selectedDivisionId) ?: selectedDivisionId
        }

        eventType == EventType.LEAGUE && splitLeaguePlayoffDivisions -> {
            resolveLeagueDivisionForPlayoffDivision(selectedDivisionId) ?: selectedDivisionId
        }

        else -> {
            selectedDivisionId
        }
    }

internal fun Event.preferredBracketStageDivisionId(
    tournamentPoolPlayEnabled: Boolean,
    playoffDivisionOptions: List<BracketDivisionOption>,
    selectedDivisionId: String?,
): String? =
    when {
        tournamentPoolPlayEnabled -> {
            resolveBracketDivisionForPool(selectedDivisionId) ?: selectedDivisionId
        }

        eventType == EventType.LEAGUE &&
            splitLeaguePlayoffDivisions &&
            playoffDivisionOptions.isNotEmpty() -> {
            resolvePlayoffDivisionForLeagueDivision(selectedDivisionId) ?: selectedDivisionId
        }

        else -> {
            selectedDivisionId
        }
    }

private fun DivisionDetail.referencesBracketDivision(bracketDivisionId: String?): Boolean {
    val normalizedBracketId = bracketDivisionId
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    if (normalizedBracketId.isBlank()) return false
    return tournamentBracketDivisionId()?.let { mappedDivisionId ->
        mappedDivisionId.normalizeDivisionIdentifier() == normalizedBracketId
    } == true
}

private fun Event.tournamentPoolSourceDetails(): List<DivisionDetail> {
    if (!isTournamentPoolPlayEnabled()) return emptyList()

    val detailsById = divisionDetails.associateBy { detail ->
        detail.normalizedTournamentDivisionId()
    }
    val sourceDetails = mutableListOf<DivisionDetail>()
    val seenIds = mutableSetOf<String>()

    fun addDetail(detail: DivisionDetail) {
        val normalizedId = detail.normalizedTournamentDivisionId()
        if (normalizedId.isNotBlank() && seenIds.add(normalizedId)) {
            sourceDetails += detail
        }
    }

    divisionDetails
        .filter { detail -> detail.isGeneratedTournamentPoolDivision() }
        .forEach(::addDetail)

    divisions.forEach { divisionId ->
        val normalizedId = divisionId.normalizeDivisionIdentifier()
        if (normalizedId.isBlank() || normalizedId in seenIds) return@forEach
        val bracketDivisionId = normalizedId.inferredTournamentBracketDivisionIdFromPool() ?: return@forEach
        addDetail(
            detailsById[normalizedId] ?: DivisionDetail(
                id = normalizedId,
                key = normalizedId,
                name = normalizedId.toDivisionDisplayLabel(divisionDetails),
                playoffPlacementDivisionIds = listOf(bracketDivisionId),
            ),
        )
    }

    return sourceDetails
}

internal fun Event.tournamentBracketDivisionOptions(
    fallbackOptions: List<BracketDivisionOption>,
): List<BracketDivisionOption> {
    if (!isTournamentPoolPlayEnabled()) return emptyList()
    val optionsById = linkedMapOf<String, String>()

    fun addOption(rawId: String?, explicitLabel: String? = null, sourcePool: DivisionDetail? = null) {
        val normalizedId = rawId
            ?.normalizeDivisionIdentifier()
            .orEmpty()
        if (normalizedId.isBlank() || optionsById.containsKey(normalizedId)) return
        optionsById[normalizedId] = explicitLabel
            ?.takeIf { it.isNotBlank() }
            ?: fallbackOptions.findBracketDivisionOption(normalizedId)?.label
            ?: divisionDetails.firstOrNull { detail ->
                detail.id.normalizeDivisionIdentifier() == normalizedId
            }?.name?.takeIf { it.isNotBlank() }
            ?: sourcePool?.name?.stripTournamentPoolSuffix()?.takeIf { it.isNotBlank() }
            ?: normalizedId.toDivisionDisplayLabel(divisionDetails)
    }

    divisionDetails
        .filter { detail -> detail.isTournamentPlayoffDivision() }
        .forEach { detail ->
            addOption(detail.normalizedTournamentDivisionId(), detail.name)
        }

    tournamentPoolSourceDetails()
        .forEach { detail ->
            addOption(detail.tournamentBracketDivisionId(), sourcePool = detail)
        }

    return optionsById.map { (id, label) ->
        BracketDivisionOption(id = id, label = label.ifBlank { id })
    }.sortedAlphabetically()
}

internal fun Event.tournamentPoolDivisionOptions(
    bracketDivisionId: String?,
): List<BracketDivisionOption> =
    tournamentPoolSourceDetails()
        .filter { detail ->
            bracketDivisionId.isNullOrBlank() || detail.referencesBracketDivision(bracketDivisionId)
        }
        .mapNotNull { detail ->
            val normalizedId = detail.normalizedTournamentDivisionId()
            if (normalizedId.isBlank()) {
                null
            } else {
                BracketDivisionOption(
                    id = normalizedId,
                    label = detail.name.ifBlank { normalizedId.toDivisionDisplayLabel(divisionDetails) },
                )
            }
        }
        .sortedAlphabetically()

internal fun Event.resolveBracketDivisionForPool(poolDivisionId: String?): String? {
    val normalizedPoolId = poolDivisionId
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    if (normalizedPoolId.isBlank()) return null
    return tournamentPoolSourceDetails()
        .firstOrNull { detail -> detail.normalizedTournamentDivisionId() == normalizedPoolId }
        ?.tournamentBracketDivisionId()
        ?.takeIf(String::isNotBlank)
}

internal fun Event.hasLosersBracketSelector(
    selectedDivisionId: String?,
    matches: List<MatchWithRelations>,
): Boolean {
    if (doubleElimination) return true

    val normalizedDivisionId = selectedDivisionId
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    val selectedDivisionHasDoubleEliminationConfig = divisionDetails.any { detail ->
        val detailMatchesSelectedDivision = normalizedDivisionId.isBlank() ||
            detail.id.normalizeDivisionIdentifier() == normalizedDivisionId ||
            detail.normalizedTournamentDivisionId() == normalizedDivisionId ||
            detail.referencesBracketDivision(normalizedDivisionId)

        detail.playoffConfig?.doubleElimination == true && detailMatchesSelectedDivision
    }
    if (selectedDivisionHasDoubleEliminationConfig) return true

    return matches.any { match ->
        val matchInSelectedDivision = normalizedDivisionId.isBlank() ||
            match.match.division?.normalizeDivisionIdentifier() == normalizedDivisionId

        match.match.losersBracket && matchInSelectedDivision
    }
}

internal fun Event.teamIdsForDivision(divisionId: String?): Set<String> {
    val normalizedDivisionId = divisionId
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    if (normalizedDivisionId.isBlank()) return emptySet()

    return divisionDetails
        .firstOrNull { detail ->
            detail.id.normalizeDivisionIdentifier() == normalizedDivisionId
        }
        ?.teamIds
        .orEmpty()
        .map { teamId -> teamId.trim() }
        .filter(String::isNotBlank)
        .toSet()
}
