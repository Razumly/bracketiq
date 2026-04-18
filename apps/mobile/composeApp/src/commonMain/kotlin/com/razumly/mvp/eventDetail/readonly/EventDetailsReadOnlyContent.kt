package com.razumly.mvp.eventDetail.readonly

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.util.normalizeDivisionDetail
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.composables.OrganizationVerificationBadge
import com.razumly.mvp.core.presentation.composables.PlayerCardWithActions
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.eventDetail.shared.DetailRowSpec

internal fun buildEventDetailsRows(
    event: Event,
    priceSummary: String,
    registrationSummary: String,
    refundSummary: String,
): List<DetailRowSpec> {
    return buildList {
        add(DetailRowSpec("Entry fee", priceSummary))
        add(
            DetailRowSpec(
                if (event.teamSignup) "Max teams" else "Max players",
                event.maxParticipants.toString(),
            ),
        )
        add(DetailRowSpec("Team size", event.teamSizeLimit.toString()))
        add(DetailRowSpec("Registration closes", "$registrationSummary \u203A"))
        add(DetailRowSpec("Refunds", "$refundSummary \u203A"))
        add(DetailRowSpec("Waitlist", "${event.waitListIds.size}"))
    }
}

internal fun buildScheduleDetailsRows(
    event: Event,
    fieldCount: Int,
    slotCount: Int,
): List<DetailRowSpec> {
    return buildList {
        add(DetailRowSpec("Field count", fieldCount.coerceAtLeast(0).toString()))
        add(DetailRowSpec("Weekly timeslots", slotCount.toString()))

        when (event.eventType) {
            EventType.LEAGUE -> {
                add(DetailRowSpec("Games per opponent", "${event.gamesPerOpponent ?: 1}"))
                if (event.usesSets) {
                    add(DetailRowSpec("Sets per match", "${event.setsPerMatch ?: 1}"))
                    add(DetailRowSpec("Set duration", "${event.setDurationMinutes ?: 20} minutes"))
                    if (event.pointsToVictory.isNotEmpty()) {
                        add(DetailRowSpec("Points to victory", event.pointsToVictory.joinToString()))
                    }
                } else {
                    add(DetailRowSpec("Match duration", "${event.matchDurationMinutes ?: 60} minutes"))
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
                    add(DetailRowSpec("Set duration", "${event.setDurationMinutes ?: 20} minutes"))
                } else {
                    add(DetailRowSpec("Match duration", "${event.matchDurationMinutes ?: 60} minutes"))
                }
                add(
                    DetailRowSpec(
                        "Bracket",
                        if (event.doubleElimination) "Double elimination" else "Single elimination",
                    ),
                )
                if (event.doubleElimination) {
                    add(DetailRowSpec("Winner set count", event.winnerSetCount.toString()))
                    if (event.winnerBracketPointsToVictory.isNotEmpty()) {
                        add(
                            DetailRowSpec(
                                "Winner set points",
                                event.winnerBracketPointsToVictory.joinToString(),
                            ),
                        )
                    }
                    add(DetailRowSpec("Loser set count", event.loserSetCount.toString()))
                    if (event.loserBracketPointsToVictory.isNotEmpty()) {
                        add(
                            DetailRowSpec(
                                "Loser set points",
                                event.loserBracketPointsToVictory.joinToString(),
                            ),
                        )
                    }
                } else {
                    add(DetailRowSpec("Bracket set count", event.winnerSetCount.toString()))
                    if (event.winnerBracketPointsToVictory.isNotEmpty()) {
                        add(
                            DetailRowSpec(
                                "Bracket set points",
                                event.winnerBracketPointsToVictory.joinToString(),
                            ),
                        )
                    }
                }
            }

            EventType.EVENT, EventType.WEEKLY_EVENT -> Unit
        }
    }
}

internal fun resolveReadOnlyFieldCount(
    event: Event,
    editableFields: List<Field>,
): Int {
    val linkedFieldCount = event.fieldIds.count { fieldId -> fieldId.isNotBlank() }
    return when {
        linkedFieldCount > 0 -> linkedFieldCount
        editableFields.isNotEmpty() -> editableFields.size
        else -> 0
    }
}
