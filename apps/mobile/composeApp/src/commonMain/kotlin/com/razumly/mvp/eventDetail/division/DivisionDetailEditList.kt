package com.razumly.mvp.eventDetail.division

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.normalizeDivisionDetail
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.eventDetail.derivePoolTeamCount

@Composable
internal fun DivisionDetailEditList(
    event: Event,
    divisionDetails: List<DivisionDetail>,
    onEditDivision: (String) -> Unit,
    onRemoveDivision: (String) -> Unit,
) {
    if (divisionDetails.isEmpty()) return

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        divisionDetails.forEach { detail ->
            DivisionDetailEditCard(
                event = event,
                detail = detail,
                onEditDivision = onEditDivision,
                onRemoveDivision = onRemoveDivision,
            )
        }
    }
}

@Composable
private fun DivisionDetailEditCard(
    event: Event,
    detail: DivisionDetail,
    onEditDivision: (String) -> Unit,
    onRemoveDivision: (String) -> Unit,
) {
    val priceLabel = detail.price
        ?.coerceAtLeast(0)
        ?.toDouble()
        ?.div(100.0)
        ?.moneyFormat()
        ?: "Not set"
    val maxParticipants = detail.maxParticipants?.takeIf { value -> value > 0 }
    val maxParticipantsLabel = maxParticipants?.toString() ?: "Not set"
    val playoffTeams = when {
        event.eventType == EventType.LEAGUE && event.includePlayoffs -> {
            if (event.singleDivision) {
                event.playoffTeamCount ?: detail.playoffTeamCount
            } else {
                detail.playoffTeamCount
            }
        }
        event.eventType == EventType.TOURNAMENT && event.includePlayoffs -> detail.playoffTeamCount
        else -> null
    }
    val poolCount = if (event.eventType == EventType.TOURNAMENT && event.includePlayoffs) {
        detail.poolCount
    } else {
        null
    }
    val poolTeamCount = if (event.eventType == EventType.TOURNAMENT && event.includePlayoffs) {
                    maxParticipants?.let { value -> detail.poolTeamCount ?: derivePoolTeamCount(value, poolCount) }
                } else {
                    null
                }
    val normalizedDetail = detail.normalizeDivisionDetail(event.id)
    val detailMeta = listOf(
        normalizedDetail.gender.ifBlank { "C" },
        normalizedDetail.skillDivisionTypeName.ifBlank {
            normalizedDetail.skillDivisionTypeId.toDivisionDisplayLabel()
        },
        normalizedDetail.ageDivisionTypeName.ifBlank {
            normalizedDetail.ageDivisionTypeId.toDivisionDisplayLabel()
        },
    ).joinToString(" - ")

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        border = BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = normalizedDetail.name,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = detailMeta,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Price: $priceLabel - " +
                    "${if (event.teamSignup) "Max teams" else "Max participants"}: $maxParticipantsLabel",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val paymentPlanInstallmentCount = maxOf(
                detail.installmentCount ?: 0,
                detail.installmentAmounts.size,
                detail.installmentDueDates.size,
            )
            if (detail.allowPaymentPlans == true && paymentPlanInstallmentCount > 0) {
                Text(
                    text = "Payment plan: $paymentPlanInstallmentCount installments",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (playoffTeams != null) {
                Text(
                    text = if (event.eventType == EventType.TOURNAMENT) {
                        "Bracket teams: $playoffTeams"
                    } else {
                        "Playoff teams: $playoffTeams"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (poolCount != null) {
                Text(
                    text = "Pools: $poolCount - Pool teams: ${poolTeamCount ?: "Not set"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = { onEditDivision(detail.id) }) {
                    Text("Edit")
                }
                TextButton(onClick = { onRemoveDivision(detail.id) }) {
                    Text(
                        text = "Remove",
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}
