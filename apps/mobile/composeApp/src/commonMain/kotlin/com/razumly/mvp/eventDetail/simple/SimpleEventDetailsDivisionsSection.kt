package com.razumly.mvp.eventDetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.toDivisionDisplayLabels
import com.razumly.mvp.core.presentation.util.teamSizeFormat
import com.razumly.mvp.eventDetail.composables.NumberInputField
import com.razumly.mvp.eventDetail.division.DivisionDetailEditList
import com.razumly.mvp.eventDetail.shared.DetailGridItem
import com.razumly.mvp.eventDetail.shared.DetailKeyValueList
import com.razumly.mvp.eventDetail.shared.DetailRowSpec
import com.razumly.mvp.eventDetail.shared.DetailStatsGrid
import com.razumly.mvp.eventDetail.shared.animatedCardSection



internal fun LazyListScope.simpleEventDetailsDivisionsSection(
    state: EventDetailsDivisionsSectionState,
    actions: EventDetailsDivisionsSectionActions,
    showContainer: Boolean = true,
    editContent: @Composable ColumnScope.() -> Unit,
) {
    if (!state.editView) {
        return
    }

    animatedCardSection(
        sectionId = state.readOnlySection.sectionId,
        sectionExpansionStates = state.sectionExpansionStates,
        sectionTitle = state.readOnlySection.title,
        collapsibleInEditMode = true,
        collapsibleInViewMode = true,
        viewSummary = state.readOnlySection.summary,
        enabled = state.enabled,
        onDisabledClick = actions.onDisabledClick,
        isEditMode = state.eventDetailsMode == EventDetailsMode.EDIT,
        lazyListState = state.lazyListState,
        stickyHeaderTopInset = state.stickyHeaderTopInset,
        animationDelay = 400,
        showContainer = showContainer,
        requiredMissingCount = state.editSection.requiredMissingCount,
        viewContent = {
            EventDetailsDivisionsReadOnlyContent(
                event = state.event,
                teamsCount = state.teamsCount,
                freeAgentCount = state.freeAgentCount,
            )
        },
        editContent = editContent,
    )
}



@Composable
private fun EventDetailsDivisionsReadOnlyContent(
    event: Event,
    teamsCount: Int,
    freeAgentCount: Int,
) {
    val maxParticipantsLabel =
        if (event.teamSignup) "Max teams" else "Max players"
    val divisionsText =
        event.divisions.toDivisionDisplayLabels(event.divisionDetails).joinToString()
            .ifBlank { "Not set" }

    DetailStatsGrid(
        items = buildList {
            add(DetailGridItem(maxParticipantsLabel, event.maxParticipants.toString()))
            if (event.teamSignup) {
                add(DetailGridItem("Team size", event.teamSizeLimit.teamSizeFormat()))
            }
            add(DetailGridItem("Team event", if (event.teamSignup) "Yes" else "No"))
            add(DetailGridItem("Division mode", if (event.singleDivision) "Single" else "Multi"))
            add(DetailGridItem("Teams", teamsCount.toString()))
            add(DetailGridItem("Free agents", freeAgentCount.toString()))
        },
    )
    DetailKeyValueList(
        rows = buildList {
            add(DetailRowSpec("Divisions", divisionsText))
            when (event.eventType) {
                EventType.LEAGUE -> {
                    add(DetailRowSpec("Games per opponent", "${event.gamesPerOpponent ?: 1}"))
                    if (event.usesSets) {
                        add(DetailRowSpec("Sets per match", "${event.setsPerMatch ?: 1}"))
                        add(DetailRowSpec("Set duration", "${event.setDurationMinutes ?: 20} minutes"))
                        if (event.pointsToVictory.isNotEmpty()) {
                            add(
                                DetailRowSpec(
                                    "Points to victory",
                                    event.pointsToVictory.joinToString(),
                                ),
                            )
                        }
                    } else {
                        add(
                            DetailRowSpec(
                                "Match duration",
                                "${event.matchDurationMinutes ?: 60} minutes",
                            ),
                        )
                    }
                    add(DetailRowSpec("Rest time", "${event.restTimeMinutes ?: 0} minutes"))
                    if (event.includePlayoffs) {
                        add(
                            DetailRowSpec(
                                "Playoffs",
                                if (event.singleDivision) {
                                    event.playoffTeamCount?.let { "$it teams" } ?: "Not set"
                                } else {
                                    "Configured per division"
                                },
                            ),
                        )
                    }
                }

                EventType.TOURNAMENT -> {
                    if (event.usesSets) {
                        add(
                            DetailRowSpec(
                                "Set duration",
                                "${event.setDurationMinutes ?: 20} minutes",
                            ),
                        )
                    } else {
                        add(
                            DetailRowSpec(
                                "Match duration",
                                "${event.matchDurationMinutes ?: 60} minutes",
                            ),
                        )
                    }
                    add(
                        DetailRowSpec(
                            "Bracket",
                            if (event.doubleElimination) "Double elimination" else "Single elimination",
                        ),
                    )
                    add(DetailRowSpec("Winner set count", event.winnerSetCount.toString()))
                    if (event.winnerBracketPointsToVictory.isNotEmpty()) {
                        add(
                            DetailRowSpec(
                                "Winner points",
                                event.winnerBracketPointsToVictory.joinToString(),
                            ),
                        )
                    }
                    if (event.doubleElimination) {
                        add(
                            DetailRowSpec(
                                "Loser set count",
                                event.loserSetCount.toString(),
                            ),
                        )
                        if (event.loserBracketPointsToVictory.isNotEmpty()) {
                            add(
                                DetailRowSpec(
                                    "Loser points",
                                    event.loserBracketPointsToVictory.joinToString(),
                                ),
                            )
                        }
                    }
                }

                EventType.EVENT, EventType.TRYOUT, EventType.WEEKLY_EVENT -> {
                    // No additional event-only rows for now.
                }
            }
        },
    )
}

@Composable
internal fun SimpleEventDetailsDivisionEditorActionsContent(
    state: EventDetailsDivisionEditorActionsState,
    actions: EventDetailsDivisionEditorActions,
) {
    val showDivisionPlayoffTeamCount =
        state.editEvent.eventType == EventType.LEAGUE &&
            state.editEvent.includePlayoffs &&
            !state.editEvent.singleDivision
    val isEditingDivision = !state.divisionEditor.editingId.isNullOrBlank()

    @Composable
    fun DivisionActionLeadingField(modifier: Modifier) {
        when {
            showDivisionPlayoffTeamCount -> {
                NumberInputField(
                    modifier = modifier,
                    value = state.divisionEditor.playoffTeamCount?.toString().orEmpty(),
                    label = "Division Playoff Team Count",
                    enabled = state.divisionEditorReady,
                    onValueChange = { value ->
                        if (!state.divisionEditorReady) {
                            return@NumberInputField
                        }
                        if (value.isEmpty() || value.all { it.isDigit() }) {
                            val parsed = if (value.isBlank()) null else value.toIntOrNull()
                            actions.onDivisionEditorChange(
                                state.divisionEditor.copy(
                                    playoffTeamCount = parsed,
                                    error = null,
                                ),
                            )
                        }
                    },
                    isError = state.showValidationErrors &&
                        (state.divisionEditor.playoffTeamCount ?: 0) < 2,
                    errorMessage = "Required and must be at least 2.",
                )
            }

            else -> Spacer(modifier = modifier)
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (isEditingDivision) {
            if (showDivisionPlayoffTeamCount) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    DivisionActionLeadingField(Modifier.weight(1f))
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Button(
                    onClick = actions.onSaveDivision,
                    enabled = state.isPriceQuoteConfirmed,
                ) {
                    Text("Update Division")
                }
                TextButton(onClick = actions.onResetDivisionEditor) {
                    Text("Cancel Edit")
                }
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DivisionActionLeadingField(Modifier.weight(1f))
                Button(
                    onClick = actions.onSaveDivision,
                    enabled = state.isPriceQuoteConfirmed,
                ) {
                    Text("Add Division")
                }
            }
        }
    }

    if (state.divisionEditor.error != null) {
        Text(
            text = state.divisionEditor.error.orEmpty(),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
    if (state.showValidationErrors && !state.isSkillLevelValid) {
        Text(
            text = "Add at least one division.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
    if (
        state.editEvent.eventType == EventType.TOURNAMENT &&
        state.editEvent.includePlayoffs &&
        state.showValidationErrors && !state.isLeaguePlayoffTeamsValid
    ) {
        Text(
            text = "Pool play requires pool count, bracket team count, and even pool sizing for each division.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }

    DivisionDetailEditList(
        event = state.editEvent,
        divisionDetails = state.divisionDetails,
        onEditDivision = actions.onEditDivision,
        onRemoveDivision = actions.onRemoveDivision,
    )
}
