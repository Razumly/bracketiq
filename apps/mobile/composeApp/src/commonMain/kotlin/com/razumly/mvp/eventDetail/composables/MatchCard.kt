@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.border
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.assignedOfficialUserIds
import com.razumly.mvp.core.data.dataTypes.officialAssignmentLabels
import com.razumly.mvp.core.data.dataTypes.normalizedOfficialAssignments
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock
import kotlin.time.Instant
import kotlin.time.ExperimentalTime

val localColors = compositionLocalOf<ColorPallete> { error("No colors provided")}

data class ColorPallete(
    val primary: Color,
    val onPrimary: Color,
    val primaryContainer: Color,
    val onPrimaryContainer: Color,
)

private val AlternateBracketPrimary = Color(0xFF0F5C5A)
private val AlternateBracketOnPrimary = Color(0xFFFFFFFF)
private val AlternateBracketContainer = Color(0xFFD9F4EF)
private val AlternateBracketOnContainer = Color(0xFF123B39)
private val CurrentUserMatchGlowColor = Color(0xFF2FCC71)
private val CurrentUserMatchGlowAmbientColor = CurrentUserMatchGlowColor.copy(alpha = 0.7f)
private val CurrentUserMatchGlowSpotColor = CurrentUserMatchGlowColor.copy(alpha = 0.85f)
private val CurrentUserMatchGlowBorderColor = CurrentUserMatchGlowColor.copy(alpha = 0.9f)
private val MatchCardShape = RoundedCornerShape(14.dp)

internal const val MATCH_CARD_BASE_HEIGHT_DP = 90
private const val MATCH_CARD_MANAGE_SECTION_BASE_HEIGHT_DP = 12
private const val MATCH_CARD_MANAGE_LINE_HEIGHT_DP = 17

@Composable
fun MatchCard(
    match: MatchWithRelations?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    showEventOfficialNames: Boolean = true,
    limitOfficialsToCurrentUser: Boolean = false,
    manageMode: Boolean = false,
) {
    val component = LocalTournamentComponent.current
    val teams by component.divisionTeams.collectAsState()
    val matches by component.divisionMatches.collectAsState()
    val fields by component.divisionFields.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val eventWithRelations by component.eventWithRelations.collectAsState()
    val usersById = remember(eventWithRelations.players) {
        eventWithRelations.players.associateBy(UserData::id)
    }
    val matchCardColorPallet = if (match != null && match.match.losersBracket) {
        ColorPallete(
            AlternateBracketPrimary,
            AlternateBracketOnPrimary,
            AlternateBracketContainer,
            AlternateBracketOnContainer,
        )
    } else {
        ColorPallete(
            MaterialTheme.colorScheme.primary,
            MaterialTheme.colorScheme.onPrimary,
            MaterialTheme.colorScheme.primaryContainer,
            MaterialTheme.colorScheme.onPrimaryContainer,
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
                        !selectedEvent.includePlayoffs
                    ) {
                        emptyMap()
                    } else {
                        val slots = buildLeaguePlayoffEntrantSlots(matches)
                        if (selectedEvent.singleDivision) {
                            buildSingleDivisionPlayoffPlaceholderAssignments(
                                slots = slots,
                                playoffTeamCount = selectedEvent.playoffTeamCount
                                    ?: selectedEvent.divisionDetails
                                        .firstOrNull()
                                        ?.playoffTeamCount,
                            )
                        } else {
                            buildLeaguePlayoffPlaceholderAssignments(
                                eventDivisions = selectedEvent.divisions,
                                divisionDetails = selectedEvent.divisionDetails,
                                eventPlayoffTeamCount = selectedEvent.playoffTeamCount,
                                slots = slots,
                            )
                        }
                    }
                }
                val matchDateTimeLabel = formatMatchDateTimeLabel(match.match.start)
                val eventOfficialSummary = resolveEventOfficialSummary(
                    match = match.match,
                    positions = selectedEvent.officialPositions,
                    usersById = usersById,
                    showEventOfficialNames = showEventOfficialNames,
                    currentUserId = currentUser.id,
                    currentUserLabel = resolveUserLabel(currentUser),
                    showOnlyCurrentOfficial = limitOfficialsToCurrentUser,
                )
                val manageOfficialRows = if (manageMode) {
                    buildManageOfficialRows(
                        match = match.match,
                        positions = selectedEvent.officialPositions,
                        usersById = usersById,
                        currentUserId = currentUser.id,
                        currentUserLabel = resolveUserLabel(currentUser),
                        showEventOfficialNames = true,
                    )
                } else {
                    emptyList()
                }
                val teamOfficialSummary = resolveTeamOfficialSummary(
                    match = match.match,
                    teams = teams,
                    fallbackTeamName = match.teamOfficial?.name,
                )
                val officialSummary = if (manageMode) {
                    teamOfficialSummary
                } else {
                    resolveOfficialSummary(
                        eventOfficialSummary = eventOfficialSummary,
                        teamOfficialSummary = teamOfficialSummary,
                    )
                }
                val showOfficial = !officialSummary.isNullOrBlank()
                val showManageOfficials = manageMode && manageOfficialRows.isNotEmpty()
                val highlightForCurrentUser = remember(match, teams, currentUser.id) {
                    matchBelongsToUser(
                        match = match,
                        teams = teams,
                        currentUserId = currentUser.id,
                    )
                }
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
                    modifier = Modifier
                        .fillMaxWidth()
                        .then(
                            if (highlightForCurrentUser) {
                                Modifier
                                    .shadow(
                                        elevation = 14.dp,
                                        shape = MatchCardShape,
                                        ambientColor = CurrentUserMatchGlowAmbientColor,
                                        spotColor = CurrentUserMatchGlowSpotColor,
                                    )
                                    .border(
                                        width = 1.5.dp,
                                        color = CurrentUserMatchGlowBorderColor,
                                        shape = MatchCardShape,
                                    )
                            } else {
                                Modifier
                            }
                        )
                        .clickable(onClick = onClick),
                    shape = MatchCardShape,
                    elevation = CardDefaults.cardElevation(
                        defaultElevation = if (highlightForCurrentUser) 8.dp else 4.dp,
                    ),
                    colors = CardDefaults.cardColors(
                        containerColor = localColors.current.primary,
                        contentColor = localColors.current.onPrimary
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(vertical = 4.dp),
                        verticalAlignment = if (showManageOfficials) Alignment.Top else Alignment.CenterVertically
                    ) {
                        MatchInfoSection(
                            match = match,
                            fields = fields,
                            showManageOfficials = showManageOfficials,
                            manageOfficialRows = manageOfficialRows,
                        )
                        VerticalDivider(color = localColors.current.onPrimary)
                        TeamsSection(
                            team1 = teams[match.match.team1Id],
                            team2 = teams[match.match.team2Id],
                            match = match,
                            matches = matches,
                            playoffPlaceholders = playoffPlaceholderBySlot,
                            displaySetCount = resolveDisplaySetCount(selectedEvent, match.match),
                            showManageOfficials = showManageOfficials,
                            manageOfficialRows = manageOfficialRows,
                        )
                    }
                }
                if (showOfficial) {
                    FloatingBox(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .offset(y = 20.dp)
                            .zIndex(1f),
                        color = localColors.current.primaryContainer
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Text(
                                officialSummary,
                                style = MaterialTheme.typography.labelLarge,
                                color = localColors.current.onPrimaryContainer,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
    }
}

internal fun matchBelongsToUser(
    match: MatchWithRelations,
    teams: Map<String, TeamWithPlayers>,
    currentUserId: String,
): Boolean {
    val normalizedCurrentUserId = currentUserId.trim()
    if (normalizedCurrentUserId.isBlank()) {
        return false
    }

    if (match.match.assignedOfficialUserIds().any { assignedUserId ->
            assignedUserId == normalizedCurrentUserId
        }) {
        return true
    }

    val candidateTeams = listOfNotNull(
        resolveMatchTeam(match.match.team1Id, teams, match.team1),
        resolveMatchTeam(match.match.team2Id, teams, match.team2),
        resolveMatchTeam(match.match.teamOfficialId, teams, match.teamOfficial),
    )
    return candidateTeams.any { team -> team.includesUser(normalizedCurrentUserId) }
}

private fun resolveMatchTeam(
    matchTeamId: String?,
    teams: Map<String, TeamWithPlayers>,
    relationTeam: Team?,
): Team? {
    val normalizedTeamId = matchTeamId?.trim()?.takeIf(String::isNotBlank)
    if (normalizedTeamId != null) {
        teams[normalizedTeamId]?.team?.let { mappedTeam ->
            return mappedTeam
        }
    }
    return relationTeam
}

private fun Team.includesUser(userId: String): Boolean {
    return captainId.trim() == userId ||
        managerId?.trim() == userId ||
        headCoachId?.trim() == userId ||
        coachIds.any { coachId -> coachId.trim() == userId } ||
        playerIds.any { playerId -> playerId.trim() == userId }
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
    showManageOfficials: Boolean,
    manageOfficialRows: List<ManageOfficialRow>,
) {
    val fieldLabel = resolveFieldLabel(match, fields)
    val rowTextStyle = if (showManageOfficials) {
        MaterialTheme.typography.bodyLarge
    } else {
        MaterialTheme.typography.bodyMedium
    }
    Column(
        modifier = Modifier
            .padding(
                start = 8.dp,
                top = 8.dp,
                end = 8.dp,
                bottom = if (showManageOfficials) 2.dp else 8.dp,
            )
            .width(IntrinsicSize.Max),
        verticalArrangement = if (showManageOfficials) Arrangement.Top else Arrangement.SpaceEvenly
    ) {
        Text(
            text = "M: ${match.match.matchId}",
            style = rowTextStyle,
            color = localColors.current.onPrimary,
        )
        HorizontalDivider(color = localColors.current.onPrimary)
        Text(
            "F: $fieldLabel",
            style = rowTextStyle,
            color = localColors.current.onPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        if (showManageOfficials) {
            manageOfficialRows.forEach { row ->
                HorizontalDivider(color = localColors.current.onPrimary)
                Text(
                    text = row.positionLabel,
                    style = rowTextStyle,
                    color = localColors.current.onPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
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
    displaySetCount: Int,
    showManageOfficials: Boolean,
    manageOfficialRows: List<ManageOfficialRow>,
) {
    val rowTextStyle = if (showManageOfficials) {
        MaterialTheme.typography.bodyLarge
    } else {
        MaterialTheme.typography.bodyMedium
    }
    Column(
        modifier = Modifier
            .padding(
                start = 8.dp,
                top = 8.dp,
                end = 8.dp,
                bottom = if (showManageOfficials) 2.dp else 8.dp,
            )
            .fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        val leftMatch = resolvePreviousMatch(
            relationMatchId = match.previousLeftMatch?.id,
            fallbackMatchId = match.match.previousLeftId,
            matches = matches,
        )
        val rightMatch = resolvePreviousMatch(
            relationMatchId = match.previousRightMatch?.id,
            fallbackMatchId = match.match.previousRightId,
            matches = matches,
        )
        TeamRow(
            team = team1,
            points = match.match.team1Points.take(displaySetCount),
            previousMatch = leftMatch,
            isLosersBracket = match.match.losersBracket,
            playoffPlaceholder = playoffPlaceholders[BracketSlotKey(match.match.id, BracketTeamSlot.TEAM1)],
            forceUniformStyle = showManageOfficials,
        )
        HorizontalDivider(thickness = 1.dp, color = localColors.current.onPrimary)
        TeamRow(
            team = team2,
            points = match.match.team2Points.take(displaySetCount),
            previousMatch = rightMatch,
            isLosersBracket = match.match.losersBracket,
            playoffPlaceholder = playoffPlaceholders[BracketSlotKey(match.match.id, BracketTeamSlot.TEAM2)],
            forceUniformStyle = showManageOfficials,
        )
        if (showManageOfficials) {
            manageOfficialRows.forEach { row ->
                HorizontalDivider(thickness = 1.dp, color = localColors.current.onPrimary)
                Text(
                    text = row.officialLabel,
                    modifier = Modifier.fillMaxWidth(),
                    style = rowTextStyle,
                    color = localColors.current.onPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun TeamRow(
    team: TeamWithPlayers?,
    points: List<Int>,
    previousMatch: MatchWithRelations?,
    isLosersBracket: Boolean,
    playoffPlaceholder: String?,
    forceUniformStyle: Boolean = false,
) {
    val usesReferenceLabel = team == null
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
            style = if (forceUniformStyle) {
                MaterialTheme.typography.bodyLarge
            } else {
                if (usesReferenceLabel) {
                    MaterialTheme.typography.bodyMedium
                } else {
                    MaterialTheme.typography.bodyLarge
                }
            },
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

private fun resolveDisplaySetCount(event: Event, match: MatchMVP): Int {
    val fallbackSetCount = listOf(
        match.setResults.size,
        match.team1Points.size,
        match.team2Points.size,
        1,
    ).maxOrNull() ?: 1

    if (!event.usesSets) {
        return 1
    }

    return when {
        match.losersBracket -> event.loserSetCount.coerceAtLeast(1)
        event.eventType == EventType.LEAGUE && !isBracketMatch(match) ->
            (event.setsPerMatch ?: fallbackSetCount).coerceAtLeast(1)
        else -> event.winnerSetCount.coerceAtLeast(1)
    }
}

private fun isBracketMatch(match: MatchMVP): Boolean {
    return match.losersBracket ||
        !match.previousLeftId.isNullOrBlank() ||
        !match.previousRightId.isNullOrBlank() ||
        !match.winnerNextMatchId.isNullOrBlank() ||
        !match.loserNextMatchId.isNullOrBlank()
}

private fun resolveTeamLabel(team: TeamWithPlayers): String {
    val explicitTeamName = team.team.name.trim()
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

internal data class ManageOfficialRow(
    val positionLabel: String,
    val officialLabel: String,
)

internal fun calculateMatchCardHeightDp(
    match: MatchMVP,
    positions: List<EventOfficialPosition>,
    manageMode: Boolean,
): Int {
    if (!manageMode) {
        return MATCH_CARD_BASE_HEIGHT_DP
    }
    val lineCount = calculateManageOfficialLineCount(match, positions)
    if (lineCount == 0) {
        return MATCH_CARD_BASE_HEIGHT_DP
    }
    return MATCH_CARD_BASE_HEIGHT_DP +
        MATCH_CARD_MANAGE_SECTION_BASE_HEIGHT_DP +
        (lineCount * MATCH_CARD_MANAGE_LINE_HEIGHT_DP)
}

internal fun calculateManageOfficialLineCount(
    match: MatchMVP,
    positions: List<EventOfficialPosition>,
): Int {
    val normalizedAssignments = match.normalizedOfficialAssignments()
    val legacyOfficialId = match.officialId?.trim()?.takeIf(String::isNotBlank)
    val slots = positions
        .sortedBy(EventOfficialPosition::order)
        .flatMap { position ->
            val slotCount = position.count.coerceAtLeast(1)
            (0 until slotCount).map { slotIndex -> position.id to slotIndex }
        }
    val slotKeys = slots.toSet()
    val extraAssignments = normalizedAssignments.count { assignment ->
        !slotKeys.contains(assignment.positionId to assignment.slotIndex)
    }
    return when {
        slots.isNotEmpty() -> slots.size + extraAssignments
        normalizedAssignments.isNotEmpty() -> normalizedAssignments.size
        legacyOfficialId != null -> 1
        else -> 0
    }
}

internal fun buildManageOfficialRows(
    match: MatchMVP,
    positions: List<EventOfficialPosition>,
    usersById: Map<String, UserData>,
    currentUserId: String? = null,
    currentUserLabel: String? = null,
    showEventOfficialNames: Boolean,
): List<ManageOfficialRow> {
    if (!showEventOfficialNames) {
        return emptyList()
    }
    val normalizedCurrentUserId = currentUserId?.trim()?.takeIf(String::isNotBlank)
    val normalizedCurrentUserLabel = currentUserLabel?.trim()?.takeIf(String::isNotBlank)
    val normalizedAssignments = match.normalizedOfficialAssignments()
    val legacyOfficialId = match.officialId?.trim()?.takeIf(String::isNotBlank)
    if (normalizedAssignments.isEmpty() && positions.isEmpty() && legacyOfficialId == null) {
        return emptyList()
    }

    val assignmentLabels = if (normalizedAssignments.isNotEmpty()) {
        match.officialAssignmentLabels(positions)
    } else {
        emptyList()
    }
    val assignmentLabelsByKey = normalizedAssignments.mapIndexed { index, assignment ->
        (assignment.positionId to assignment.slotIndex) to (assignmentLabels.getOrNull(index) ?: "Official")
    }.toMap()
    val assignmentsByKey = normalizedAssignments.associateBy { assignment -> assignment.positionId to assignment.slotIndex }

    val positionSlots = positions
        .sortedBy(EventOfficialPosition::order)
        .flatMap { position ->
            val slotCount = position.count.coerceAtLeast(1)
            val baseLabel = position.name.trim().ifBlank { "Official" }
            (0 until slotCount).map { slotIndex ->
                val slotLabel = if (slotCount > 1) "$baseLabel ${slotIndex + 1}" else baseLabel
                Triple(position.id, slotIndex, slotLabel)
            }
        }

    val rows = mutableListOf<ManageOfficialRow>()
    val handledKeys = mutableSetOf<Pair<String, Int>>()

    positionSlots.forEach { (positionId, slotIndex, slotLabel) ->
        val key = positionId to slotIndex
        handledKeys += key
        val assignment = assignmentsByKey[key]
        val officialLabel: String = when {
            assignment == null -> "TBD"
            else -> {
                val resolvedUserLabel = usersById[assignment.userId]
                    ?.let(::resolveUserLabel)
                    ?.takeIf(String::isNotBlank)
                val currentUserFallback = if (assignment.userId == normalizedCurrentUserId) {
                    normalizedCurrentUserLabel ?: ""
                } else {
                    ""
                }
                resolvedUserLabel ?: currentUserFallback.ifBlank { "TBD" }
            }
        }
        rows += ManageOfficialRow(
            positionLabel = slotLabel,
            officialLabel = officialLabel,
        )
    }

    normalizedAssignments.forEach { assignment ->
        val key = assignment.positionId to assignment.slotIndex
        if (handledKeys.contains(key)) return@forEach
        val positionLabel = assignmentLabelsByKey[key] ?: "Official"
        val resolvedUserLabel = usersById[assignment.userId]
            ?.let(::resolveUserLabel)
            ?.takeIf(String::isNotBlank)
        val currentUserFallback = if (assignment.userId == normalizedCurrentUserId) {
            normalizedCurrentUserLabel ?: ""
        } else {
            ""
        }
        val officialLabel: String = resolvedUserLabel ?: currentUserFallback.ifBlank { "TBD" }
        rows += ManageOfficialRow(positionLabel = positionLabel, officialLabel = officialLabel)
    }

    if (normalizedAssignments.isEmpty() && legacyOfficialId != null) {
        val legacyOfficialLabel = usersById[legacyOfficialId]
            ?.let(::resolveUserLabel)
            ?.takeIf(String::isNotBlank)
            ?: if (legacyOfficialId == normalizedCurrentUserId) {
                normalizedCurrentUserLabel ?: ""
            } else {
                ""
            }
            .ifBlank { "TBD" }
        if (rows.isNotEmpty()) {
            rows[0] = rows[0].copy(officialLabel = legacyOfficialLabel)
        } else {
            rows += ManageOfficialRow(positionLabel = "Official", officialLabel = legacyOfficialLabel)
        }
    }

    return rows
}

internal fun resolveOfficialSummary(
    eventOfficialSummary: String?,
    teamOfficialSummary: String?,
): String? {
    if (eventOfficialSummary.isNullOrBlank()) {
        return teamOfficialSummary
    }
    if (teamOfficialSummary.isNullOrBlank()) {
        return eventOfficialSummary
    }
    val teamLabel = teamOfficialSummary.removePrefix("Official: ").trim().ifBlank { teamOfficialSummary }
    return "$eventOfficialSummary, Team: $teamLabel"
}

internal fun resolveEventOfficialSummary(
    match: MatchMVP,
    positions: List<EventOfficialPosition>,
    usersById: Map<String, UserData>,
    showEventOfficialNames: Boolean,
    currentUserId: String? = null,
    currentUserLabel: String? = null,
    showOnlyCurrentOfficial: Boolean = false,
): String? {
    val normalizedCurrentUserId = currentUserId?.trim()?.takeIf(String::isNotBlank)
    val normalizedCurrentUserLabel = currentUserLabel?.trim()?.takeIf(String::isNotBlank)
    if (!showEventOfficialNames) {
        return null
    }

    val normalizedAssignments = match.normalizedOfficialAssignments()
    val assignmentLabels = if (normalizedAssignments.isNotEmpty()) {
        match.officialAssignmentLabels(positions)
    } else {
        emptyList()
    }
    val labeledAssignments = normalizedAssignments.mapIndexed { index, assignment ->
        assignment to assignmentLabels.getOrNull(index)
    }
    val visibleAssignments = if (showOnlyCurrentOfficial) {
        val currentUserIdForFilter = normalizedCurrentUserId ?: return null
        labeledAssignments.filter { (assignment, _) -> assignment.userId == currentUserIdForFilter }
    } else {
        labeledAssignments
    }
    val assignmentDisplayNames = visibleAssignments.map { (assignment, label) ->
        val currentUserFallbackLabel = if (assignment.userId == normalizedCurrentUserId) {
            normalizedCurrentUserLabel
        } else {
            null
        }
        usersById[assignment.userId]
            ?.let(::resolveUserLabel)
            ?.takeIf(String::isNotBlank)
            ?: currentUserFallbackLabel
            ?: label
            ?: "Official"
    }.distinct()
    if (assignmentDisplayNames.isNotEmpty()) {
        return "Officials: ${assignmentDisplayNames.joinToString(", ")}"
    }

    val legacyOfficialId = match.officialId?.trim()?.takeIf(String::isNotBlank)
    if (!showOnlyCurrentOfficial || legacyOfficialId == normalizedCurrentUserId) {
        val officialUser = legacyOfficialId?.let { usersById[it] }
        if (officialUser != null) {
            return "Official: ${resolveUserLabel(officialUser)}"
        }
        if (legacyOfficialId != null && legacyOfficialId == normalizedCurrentUserId && normalizedCurrentUserLabel != null) {
            return "Official: $normalizedCurrentUserLabel"
        }
    }

    return null
}

internal fun resolveTeamOfficialSummary(
    match: MatchMVP,
    teams: Map<String, TeamWithPlayers>,
    fallbackTeamName: String?,
): String? {
    val officialTeamSummary = match.teamOfficialId?.let { teams[it] }
        ?.let(::resolveTeamLabel)
        ?: fallbackTeamName?.trim()?.takeIf(String::isNotBlank)
    return officialTeamSummary?.let { "Official: $it" }
}

private fun resolveUserLabel(user: UserData): String {
    val fullName = user.fullName.trim()
    if (fullName.isNotEmpty()) {
        return fullName
    }
    val userName = user.userName.trim()
    return userName.ifBlank { "TBD" }
}

internal enum class BracketTeamSlot { TEAM1, TEAM2 }

internal data class BracketSlotKey(
    val matchId: String,
    val slot: BracketTeamSlot,
)

internal data class PlayoffBracketSlot(
    val matchId: String,
    val divisionId: String?,
    val seed: Int?,
    val slot: BracketTeamSlot,
)

internal fun buildLeaguePlayoffEntrantSlots(
    matches: Map<String, MatchWithRelations>,
): List<PlayoffBracketSlot> {
    if (matches.isEmpty()) {
        return emptyList()
    }

    return matches.values.asSequence().flatMap { candidate ->
        if (candidate.match.losersBracket) {
            return@flatMap emptySequence()
        }

        val leftHasResolvablePrevious = hasResolvablePreviousMatch(
            relationMatch = candidate.previousLeftMatch,
            fallbackMatchId = candidate.match.previousLeftId,
            matches = matches,
        )
        val rightHasResolvablePrevious = hasResolvablePreviousMatch(
            relationMatch = candidate.previousRightMatch,
            fallbackMatchId = candidate.match.previousRightId,
            matches = matches,
        )
        val leftEntrantSlot = !leftHasResolvablePrevious
        val rightEntrantSlot = !rightHasResolvablePrevious
        if (!leftEntrantSlot && !rightEntrantSlot) {
            return@flatMap emptySequence()
        }

        val slots = mutableListOf<PlayoffBracketSlot>()
        if (leftEntrantSlot) {
            slots += PlayoffBracketSlot(
                matchId = candidate.match.id,
                divisionId = candidate.match.division,
                seed = candidate.match.team1Seed,
                slot = BracketTeamSlot.TEAM1,
            )
        }
        if (rightEntrantSlot) {
            slots += PlayoffBracketSlot(
                matchId = candidate.match.id,
                divisionId = candidate.match.division,
                seed = candidate.match.team2Seed,
                slot = BracketTeamSlot.TEAM2,
            )
        }
        slots.asSequence()
    }.toList()
}

private fun hasResolvablePreviousMatch(
    relationMatch: MatchMVP?,
    fallbackMatchId: String?,
    matches: Map<String, MatchWithRelations>,
): Boolean {
    if (relationMatch != null) {
        return true
    }
    val normalizedId = fallbackMatchId
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: return false
    return matches.containsKey(normalizedId)
}

private fun resolvePreviousMatch(
    relationMatchId: String?,
    fallbackMatchId: String?,
    matches: Map<String, MatchWithRelations>,
): MatchWithRelations? {
    val relationId = relationMatchId
        ?.trim()
        ?.takeIf(String::isNotBlank)
    if (relationId != null) {
        matches[relationId]?.let { return it }
    }
    val fallbackId = fallbackMatchId
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: return null
    return matches[fallbackId]
}

internal fun buildSingleDivisionPlayoffPlaceholderAssignments(
    slots: List<PlayoffBracketSlot>,
    playoffTeamCount: Int?,
): Map<BracketSlotKey, String> {
    if (slots.isEmpty()) {
        return emptyMap()
    }

    val maxSeed = playoffTeamCount?.coerceAtLeast(0) ?: return emptyMap()
    if (maxSeed == 0) {
        return emptyMap()
    }

    val assignments = mutableMapOf<BracketSlotKey, String>()
    slots.forEach { slot ->
        val seed = slot.seed ?: return@forEach
        if (seed < 1 || seed > maxSeed) {
            return@forEach
        }
        assignments[BracketSlotKey(slot.matchId, slot.slot)] =
            "${formatOrdinalPlacement(seed)} place"
    }
    return assignments
}

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
        val labelsByPlacement = buildMappedPlacementLabelsForPlayoffDivision(
            playoffDivisionId = playoffDivisionId,
            mappingDivisionDetails = orderedDetails,
            allDivisionDetails = divisionDetails,
            eventPlayoffTeamCount = eventPlayoffTeamCount,
        )
        if (labelsByPlacement.isEmpty()) {
            continue
        }
        val orderedSlots = divisionSlots.sortedWith(
            compareBy<PlayoffBracketSlot>(
                { it.seed ?: Int.MAX_VALUE },
                { it.matchId },
                { it.slot.ordinal },
            ),
        )
        val assignedPerPlacement = mutableMapOf<Int, Int>()
        val unresolvedSlots = mutableListOf<PlayoffBracketSlot>()

        orderedSlots.forEach { slot ->
            val slotSeed = slot.seed
            if (slotSeed == null || slotSeed < 1) {
                unresolvedSlots += slot
                return@forEach
            }
            val labelsForPlacement = labelsByPlacement[slotSeed]
            if (labelsForPlacement.isNullOrEmpty()) {
                unresolvedSlots += slot
                return@forEach
            }
            val placementOffset = assignedPerPlacement[slotSeed] ?: 0
            val label = labelsForPlacement.getOrNull(placementOffset)
            if (label == null) {
                unresolvedSlots += slot
                return@forEach
            }
            assignedPerPlacement[slotSeed] = placementOffset + 1
            result[BracketSlotKey(slot.matchId, slot.slot)] = label
        }

        if (unresolvedSlots.isNotEmpty()) {
            val remainingLabels = labelsByPlacement
                .entries
                .sortedBy { it.key }
                .flatMap { entry ->
                    val consumedCount = assignedPerPlacement[entry.key] ?: 0
                    entry.value.drop(consumedCount)
                }
            unresolvedSlots.zip(remainingLabels).forEach { (slot, label) ->
                result[BracketSlotKey(slot.matchId, slot.slot)] = label
            }
        }
    }

    return result
}

private fun buildMappedPlacementLabelsForPlayoffDivision(
    playoffDivisionId: String,
    mappingDivisionDetails: List<DivisionDetail>,
    allDivisionDetails: List<DivisionDetail>,
    eventPlayoffTeamCount: Int?,
): Map<Int, List<String>> {
    val labelsByPlacement = mutableMapOf<Int, List<String>>()
    val maxPlacementIndex = mappingDivisionDetails.maxOfOrNull { detail ->
        maxOf(
            detail.playoffPlacementDivisionIds.size,
            detail.playoffTeamCount ?: eventPlayoffTeamCount ?: 0,
        )
    } ?: 0

    for (placementIndex in 0 until maxPlacementIndex) {
        val placementLabels = mutableListOf<String>()
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
            placementLabels += "${formatOrdinalPlacement(placementIndex + 1)} place (${resolveDivisionDisplayName(detail, allDivisionDetails)})"
        }
        if (placementLabels.isNotEmpty()) {
            labelsByPlacement[placementIndex + 1] = placementLabels
        }
    }

    return labelsByPlacement
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

private fun formatMatchDateTimeLabel(start: Instant?): String {
    val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
    return formatMatchDateTimeLabel(start = start, today = today)
}

internal fun formatMatchDateTimeLabel(start: Instant?, today: LocalDate): String {
    if (start == null) {
        return "TBD"
    }
    val localDateTime = start.toLocalDateTime(TimeZone.currentSystemDefault())
    val hour24 = localDateTime.time.hour
    val minute = localDateTime.time.minute.toString().padStart(2, '0')
    val amPm = if (hour24 >= 12) "P.M." else "A.M."
    val hour12 = when (val normalizedHour = hour24 % 12) {
        0 -> 12
        else -> normalizedHour
    }
    val formattedTime = "$hour12:$minute $amPm"
    if (localDateTime.date == today) {
        return formattedTime
    }

    val monthName = localDateTime.date.month.name
        .take(3)
        .lowercase()
        .replaceFirstChar { it.titlecase() }
    return "${localDateTime.date.day} $monthName, ${localDateTime.date.year} $formattedTime"
}
