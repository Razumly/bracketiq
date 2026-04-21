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
@Composable
internal fun ReadOnlyDivisionsList(
    event: Event,
    divisionDetails: List<DivisionDetail>,
) {
    Spacer(modifier = Modifier.height(8.dp))
    var expanded by rememberSaveable(event.id) { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { expanded = !expanded },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = "Divisions (${divisionDetails.size})",
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (expanded) "Hide" else "Show")
            Spacer(modifier = Modifier.size(4.dp))
            Icon(
                imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (expanded) "Collapse divisions" else "Expand divisions",
            )
        }
    }

    if (event.singleDivision) {
        Text(
            text = "Single-division events mirror event-level capacity and pricing settings.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    AnimatedVisibility(visible = expanded) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (divisionDetails.isEmpty()) {
                Text(
                    text = "No divisions configured.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                divisionDetails.forEach { detail ->
                    ReadOnlyDivisionCard(
                        event = event,
                        detail = detail,
                        allDivisionDetails = divisionDetails,
                    )
                }
            }
        }
    }
}

@Composable
private fun ReadOnlyDivisionCard(
    event: Event,
    detail: DivisionDetail,
    allDivisionDetails: List<DivisionDetail>,
) {
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
    val priceCents = (detail.price ?: event.priceCents).coerceAtLeast(0)
    val maxParticipants = (detail.maxParticipants ?: event.maxParticipants).coerceAtLeast(2)
    val paymentPlanInstallmentCount = maxOf(
        detail.installmentCount ?: 0,
        detail.installmentAmounts.size,
        detail.installmentDueDates.size,
    )
    val playoffTeams = if (
        event.eventType == EventType.LEAGUE &&
        event.includePlayoffs &&
        !event.singleDivision
    ) {
        detail.playoffTeamCount
    } else {
        null
    }

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
                text = detail.name.ifBlank { detail.id.toDivisionDisplayLabel(allDivisionDetails) },
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = detailMeta,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Price: ${priceCents.toDouble().div(100.0).moneyFormat()} - " +
                    "${if (event.teamSignup) "Max teams" else "Max participants"}: $maxParticipants",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (paymentPlanInstallmentCount > 0 && detail.allowPaymentPlans == true) {
                Text(
                    text = "Payment plan: $paymentPlanInstallmentCount installments",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (playoffTeams != null) {
                Text(
                    text = "Playoff teams: $playoffTeams",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}