package com.razumly.mvp.eventSearch

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.eventSearch.composables.EmptyDiscoverListItem

@Composable
internal fun RentalConfirmationContent(
    organization: Organization,
    selections: List<ResolvedRentalSelection>,
    totalPriceCents: Int,
    topPadding: Dp,
    bottomPadding: Dp,
    validationMessage: String?,
    canContinue: Boolean,
    onBack: () -> Unit,
    onContinue: () -> Unit,
) {
    val sortedSelections = remember(selections) {
        selections.sortedBy { selection -> selection.startInstant }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(
                start = 16.dp,
                end = 16.dp,
                top = topPadding + 16.dp,
                bottom = bottomPadding + 16.dp
            ),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(
            modifier = Modifier.weight(1f, fill = false),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            TextButton(onClick = onBack) {
                Text("Back to schedule")
            }

            Text(
                text = "Confirm rentals for ${organization.name.ifBlank { "Organization" }}",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold
            )

            if (sortedSelections.isEmpty()) {
                EmptyDiscoverListItem(
                    message = "No rental selections added yet."
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = false),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(sortedSelections, key = { resolved -> resolved.selection.id }) { resolved ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = resolved.field.displayLabel(),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "${resolved.startInstant.toDisplayDateTime()} - ${resolved.endInstant.toDisplayDateTime()}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    text = if (resolved.slots.size == 1) {
                                        "Slot: ${resolved.slots.first().toRentalAvailabilityLabel()}"
                                    } else {
                                        "Slots: ${resolved.slots.size} selected"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                val price = resolved.totalPriceCents
                                if (price > 0) {
                                    Text(
                                        text = "Price: ${(price / 100.0).moneyFormat()}",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (totalPriceCents > 0) {
                Text(
                    text = "Total rental: ${(totalPriceCents / 100.0).moneyFormat()}",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold
                )
            }

            validationMessage?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
            horizontalArrangement = Arrangement.End
        ) {
            Button(
                onClick = onContinue,
                enabled = canContinue
            ) {
                Text("Continue to create event")
            }
        }
    }
}
