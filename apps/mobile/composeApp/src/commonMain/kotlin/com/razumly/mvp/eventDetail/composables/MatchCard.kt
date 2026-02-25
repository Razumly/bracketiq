@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Instant
import kotlin.time.ExperimentalTime

val localColors = compositionLocalOf<ColorPallete> { error("No colors provided")}

data class ColorPallete(
    val primary: Color,
    val onPrimary: Color,
    val primaryContainer: Color,
    val onPrimaryContainer: Color,
)
@Composable
fun MatchCard(
    match: MatchWithRelations?, onClick: () -> Unit, modifier: Modifier = Modifier
) {
    val component = LocalTournamentComponent.current
    val teams by component.divisionTeams.collectAsState()
    val matches by component.divisionMatches.collectAsState()
    val fields by component.divisionFields.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val matchCardColorPallet = if (match != null && match.match.losersBracket) {
        ColorPallete(MaterialTheme.colorScheme.tertiary,
            MaterialTheme.colorScheme.onTertiary,
            MaterialTheme.colorScheme.tertiaryContainer,
            MaterialTheme.colorScheme.onTertiaryContainer
        )
    } else {
        ColorPallete(MaterialTheme.colorScheme.primary,
            MaterialTheme.colorScheme.onPrimary,
            MaterialTheme.colorScheme.primaryContainer,
            MaterialTheme.colorScheme.onPrimaryContainer
        )
    }
    CompositionLocalProvider(localColors provides matchCardColorPallet) {
        Box(
            modifier = modifier
        ) {
            match?.let {
                val playoffPlaceholderBySlot = remember(
                    matches,
                    selectedEvent.divisions,
                    selectedEvent.divisionDetails,
                    selectedEvent.playoffTeamCount,
                    selectedEvent.includePlayoffs,
                    selectedEvent.singleDivision,
                    selectedEvent.eventType,
                ) {
                    if (
                        selectedEvent.eventType != EventType.LEAGUE ||
                        !selectedEvent.includePlayoffs ||
                        selectedEvent.singleDivision
                    ) {
                        emptyMap()
                    } else {
                        val slots = matches.values
                            .asSequence()
                            .filter { candidate ->
                                !candidate.match.losersBracket &&
                                    candidate.previousLeftMatch == null &&
                                    candidate.previousRightMatch == null
                            }
                            .flatMap { candidate ->
                                sequenceOf(
                                    PlayoffBracketSlot(
                                        matchId = candidate.match.id,
                                        divisionId = candidate.match.division,
                                        matchOrder = candidate.match.matchId,
                                        slot = BracketTeamSlot.TEAM1,
                                    ),
                                    PlayoffBracketSlot(
                                        matchId = candidate.match.id,
                                        divisionId = candidate.match.division,
                                        matchOrder = candidate.match.matchId,
                                        slot = BracketTeamSlot.TEAM2,
                                    ),
                                )
                            }
                            .toList()
                        buildLeaguePlayoffPlaceholderAssignments(
                            eventDivisions = selectedEvent.divisions,
                            divisionDetails = selectedEvent.divisionDetails,
                            eventPlayoffTeamCount = selectedEvent.playoffTeamCount,
                            slots = slots,
                        )
                    }
                }
                val matchDateTimeLabel = formatMatchDateTimeLabel(match.match.start)
                val showReferee = !match.match.teamRefereeId.isNullOrBlank() || match.teamReferee != null
                val refereeLabel = resolveRefereeLabel(
                    refereeTeamId = match.match.teamRefereeId,
                    teams = teams,
                    fallbackTeamName = match.teamReferee?.name,
                )
                FloatingBox(
                    modifier = Modifier.align(Alignment.TopCenter).offset(y = (-20).dp).zIndex(1f),
                    color = localColors.current.primaryContainer
                ) {
                    Text(
                        text = matchDateTimeLabel,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        style = MaterialTheme.typography.labelLarge,
                        color = localColors.current.onPrimaryContainer
                    )
                }
                Card(
                    modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
                    elevation = CardDefaults.cardElevation(4.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = localColors.current.primary,
                        contentColor = localColors.current.onPrimary
                    )
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MatchInfoSection(match, fields, selectedEvent.divisionDetails)
                        VerticalDivider(color = localColors.current.onPrimary)
                        TeamsSection(
                            team1 = teams[match.match.team1Id],
                            team2 = teams[match.match.team2Id],
                            match = match,
                            matches = matches,
                            playoffPlaceholders = playoffPlaceholderBySlot,
                        )
                    }
                }
                if (showReferee) {
                    FloatingBox(
                        modifier = Modifier.align(Alignment.BottomCenter).offset(y = 20.dp),
                        color = localColors.current.primaryContainer
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Text(
                                "Ref: $refereeLabel",
                                style = MaterialTheme.typography.labelLarge,
                                color = localColors.current.onPrimaryContainer
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FloatingBox(modifier: Modifier, color: Color, content: @Composable () -> Unit) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        color = color,
        shadowElevation = 5.dp
    ) {
        content()
    }
}

@Composable
private fun MatchInfoSection(
    match: MatchWithRelations,
    fields: List<FieldWithMatches>,
    divisionDetails: List<DivisionDetail>,
) {
    val fieldLabel = resolveFieldLabel(match, fields)
    val divisionLabel = match.match.division
        ?.toDivisionDisplayLabel(divisionDetails)
        .orEmpty()
        .ifBlank { "TBD" }
    Column(
        modifier = Modifier.padding(8.dp).width(IntrinsicSize.Max),
        verticalArrangement = Arrangement.SpaceEvenly
    ) {
        Text("M: ${match.match.matchId}", color = localColors.current.onPrimary)
        HorizontalDivider(color = localColors.current.onPrimary)
        Text(
            "F: $fieldLabel",
            color = localColors.current.onPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        HorizontalDivider(color = localColors.current.onPrimary)
        Text(
            "D: $divisionLabel",
            color = localColors.current.onPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

private fun resolveFieldLabel(match: MatchWithRelations, fields: List<FieldWithMatches>): String {
    val relationName = match.field?.name?.trim().orEmpty()
    if (relationName.isNotEmpty()) {
        return relationName
    }

    val relationNumber = match.field?.fieldNumber
    if (relationNumber != null && relationNumber > 0) {
        return "Field $relationNumber"
    }

    val mappedField = fields.firstOrNull { it.field.id == match.match.fieldId }?.field
    val mappedName = mappedField?.name?.trim().orEmpty()
    if (mappedName.isNotEmpty()) {
        return mappedName
    }

    val mappedNumber = mappedField?.fieldNumber
    if (mappedNumber != null && mappedNumber > 0) {
        return "Field $mappedNumber"
    }

    return "Field TBD"
}

@Composable
private fun TeamsSection(
    team1: TeamWithPlayers?,
    team2: TeamWithPlayers?,
    match: MatchWithRelations,
    matches: Map<String, MatchWithRelations>,
    playoffPlaceholders: Map<BracketSlotKey, String>,
) {
    Column(
        modifier = Modifier.padding(8.dp).fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        val leftMatch = matches[match.previousLeftMatch?.id]
        val rightMatch = matches[match.previousRightMatch?.id]
        TeamRow(
            team = team1,
            points = match.match.team1Points,
            previousMatch = leftMatch,
            isLosersBracket = match.match.losersBracket,
            playoffPlaceholder = playoffPlaceholders[BracketSlotKey(match.match.id, BracketTeamSlot.TEAM1)],
        )
        HorizontalDivider(thickness = 1.dp, color = localColors.current.onPrimary)
        TeamRow(
            team = team2,
            points = match.match.team2Points,
            previousMatch = rightMatch,
            isLosersBracket = match.match.losersBracket,
            playoffPlaceholder = playoffPlaceholders[BracketSlotKey(match.match.id, BracketTeamSlot.TEAM2)],
        )
    }
}

@Composable
private fun TeamRow(
    team: TeamWithPlayers?,
    points: List<Int>,
    previousMatch: MatchWithRelations?,
    isLosersBracket: Boolean,
    playoffPlaceholder: String?,
) {
    val label = when {
        team != null -> resolveTeamLabel(team)
        previousMatch?.match?.matchId != null -> {
            val prefix =
                if (isLosersBracket && !previousMatch.match.losersBracket) "Loser" else "Winner"
            "$prefix of match #${previousMatch.match.matchId}"
        }
        !playoffPlaceholder.isNullOrBlank() -> playoffPlaceholder
        else -> "TBD"
    }

    Row(
        modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(1f),
            overflow = TextOverflow.Ellipsis,
            maxLines = 1,
            color = localColors.current.onPrimary
        )
        if (points.isNotEmpty()) {
            Text(
                " ${points.joinToString(separator = ", ")}",
                color = localColors.current.onPrimary
            )
        }
    }
}

private fun resolveTeamLabel(team: TeamWithPlayers): String {
    val explicitTeamName = team.team.name?.trim().orEmpty()
    if (explicitTeamName.isNotEmpty()) {
        return explicitTeamName
    }
    val playerNames = team.players.map { player ->
        val lastInitial = player.lastName.firstOrNull()?.toString().orEmpty()
        if (lastInitial.isNotEmpty()) {
            "${player.firstName}.$lastInitial"
        } else {
            player.firstName
        }
    }.filter { it.isNotBlank() }
    return playerNames.joinToString(" & ").ifBlank { "TBD" }
}

private fun resolveRefereeLabel(
    refereeTeamId: String?,
    teams: Map<String, TeamWithPlayers>,
    fallbackTeamName: String?,
): String {
    val refereeTeam = refereeTeamId?.let { teams[it] }
    if (refereeTeam != null) {
        return resolveTeamLabel(refereeTeam)
    }
    val fallback = fallbackTeamName?.trim().orEmpty()
    return fallback.ifBlank { "TBD" }
}

internal enum class BracketTeamSlot { TEAM1, TEAM2 }

internal data class BracketSlotKey(
    val matchId: String,
    val slot: BracketTeamSlot,
)

internal data class PlayoffBracketSlot(
    val matchId: String,
    val divisionId: String?,
    val matchOrder: Int,
    val slot: BracketTeamSlot,
)

internal fun buildLeaguePlayoffPlaceholderAssignments(
    eventDivisions: List<String>,
    divisionDetails: List<DivisionDetail>,
    eventPlayoffTeamCount: Int?,
    slots: List<PlayoffBracketSlot>,
): Map<BracketSlotKey, String> {
    if (divisionDetails.isEmpty() || slots.isEmpty()) {
        return emptyMap()
    }

    val orderedDetails = orderDivisionDetailsForMappings(eventDivisions, divisionDetails)
        .filter { detail -> detail.playoffPlacementDivisionIds.isNotEmpty() }
    if (orderedDetails.isEmpty()) {
        return emptyMap()
    }

    val slotsByPlayoffDivision = slots
        .mapNotNull { slot ->
            val normalizedDivisionId = slot.divisionId?.normalizeDivisionIdentifier().orEmpty()
            if (normalizedDivisionId.isEmpty()) {
                null
            } else {
                normalizedDivisionId to slot
            }
        }
        .groupBy(keySelector = { it.first }, valueTransform = { it.second })
    if (slotsByPlayoffDivision.isEmpty()) {
        return emptyMap()
    }

    val result = mutableMapOf<BracketSlotKey, String>()
    for ((playoffDivisionId, divisionSlots) in slotsByPlayoffDivision) {
        val labels = buildMappedPlacementLabelsForPlayoffDivision(
            playoffDivisionId = playoffDivisionId,
            mappingDivisionDetails = orderedDetails,
            allDivisionDetails = divisionDetails,
            eventPlayoffTeamCount = eventPlayoffTeamCount,
        )
        if (labels.isEmpty()) {
            continue
        }
        val orderedSlots = divisionSlots.sortedWith(
            compareBy<PlayoffBracketSlot> { it.matchOrder }
                .thenBy { slot -> if (slot.slot == BracketTeamSlot.TEAM1) 0 else 1 }
        )
        orderedSlots.zip(labels).forEach { (slot, label) ->
            result[BracketSlotKey(slot.matchId, slot.slot)] = label
        }
    }

    return result
}

private fun buildMappedPlacementLabelsForPlayoffDivision(
    playoffDivisionId: String,
    mappingDivisionDetails: List<DivisionDetail>,
    allDivisionDetails: List<DivisionDetail>,
    eventPlayoffTeamCount: Int?,
): List<String> {
    val labels = mutableListOf<String>()
    val maxPlacementIndex = mappingDivisionDetails.maxOfOrNull { detail ->
        maxOf(
            detail.playoffPlacementDivisionIds.size,
            detail.playoffTeamCount ?: eventPlayoffTeamCount ?: 0,
        )
    } ?: 0

    for (placementIndex in 0 until maxPlacementIndex) {
        for (detail in mappingDivisionDetails) {
            val placementLimit = detail.playoffTeamCount
                ?: eventPlayoffTeamCount
                ?: detail.playoffPlacementDivisionIds.size
            if (placementIndex >= placementLimit) {
                continue
            }
            val mappedPlayoffDivisionId = detail.playoffPlacementDivisionIds
                .getOrNull(placementIndex)
                ?.normalizeDivisionIdentifier()
                .orEmpty()
            if (mappedPlayoffDivisionId.isEmpty() || !divisionsEquivalent(mappedPlayoffDivisionId, playoffDivisionId)) {
                continue
            }
            labels += "${formatOrdinalPlacement(placementIndex + 1)} place (${resolveDivisionDisplayName(detail, allDivisionDetails)})"
        }
    }

    return labels
}

private fun orderDivisionDetailsForMappings(
    eventDivisions: List<String>,
    divisionDetails: List<DivisionDetail>,
): List<DivisionDetail> {
    if (divisionDetails.isEmpty()) {
        return emptyList()
    }
    val remaining = divisionDetails.toMutableList()
    val ordered = mutableListOf<DivisionDetail>()
    eventDivisions.forEach { divisionId ->
        val normalizedDivisionId = divisionId.normalizeDivisionIdentifier()
        if (normalizedDivisionId.isEmpty()) {
            return@forEach
        }
        val matchedIndex = remaining.indexOfFirst { detail ->
            divisionsEquivalent(detail.id, normalizedDivisionId) ||
                divisionsEquivalent(detail.key, normalizedDivisionId)
        }
        if (matchedIndex >= 0) {
            ordered += remaining.removeAt(matchedIndex)
        }
    }
    ordered += remaining
    return ordered
}

private fun resolveDivisionDisplayName(
    detail: DivisionDetail,
    allDivisionDetails: List<DivisionDetail>,
): String {
    val explicitName = detail.name.trim()
    if (explicitName.isNotEmpty()) {
        return explicitName
    }
    val fallbackId = detail.id.takeIf { it.isNotBlank() } ?: detail.key
    return fallbackId.toDivisionDisplayLabel(allDivisionDetails)
}

internal fun formatOrdinalPlacement(position: Int): String {
    val value = position.coerceAtLeast(1)
    val modHundred = value % 100
    val suffix = if (modHundred in 11..13) {
        "th"
    } else {
        when (value % 10) {
            1 -> "st"
            2 -> "nd"
            3 -> "rd"
            else -> "th"
        }
    }
    return "$value$suffix"
}

private fun formatMatchDateTimeLabel(start: Instant): String {
    val localDateTime = start.toLocalDateTime(TimeZone.currentSystemDefault())
    val month = localDateTime.date.monthNumber.toString().padStart(2, '0')
    val day = localDateTime.date.dayOfMonth.toString().padStart(2, '0')
    val year = localDateTime.date.year
    val hour24 = localDateTime.time.hour
    val minute = localDateTime.time.minute.toString().padStart(2, '0')
    val amPm = if (hour24 >= 12) "PM" else "AM"
    val hour12 = when (val normalizedHour = hour24 % 12) {
        0 -> 12
        else -> normalizedHour
    }
    return "$month/$day/$year $hour12:$minute $amPm"
}
