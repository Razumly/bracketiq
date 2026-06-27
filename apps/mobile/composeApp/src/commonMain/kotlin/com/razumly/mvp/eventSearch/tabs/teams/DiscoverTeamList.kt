package com.razumly.mvp.eventSearch.tabs.teams

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.normalizedAffiliateUrl
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.guides.guideTarget
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.eventSearch.composables.EmptyDiscoverListItem

@Composable
fun DiscoverTeamList(
    teams: List<Team>,
    isLoading: Boolean,
    listState: LazyListState,
    firstElementPadding: PaddingValues,
    lastElementPadding: PaddingValues,
    emptyMessage: String,
    firstItemGuideTargetId: String? = null,
    onTeamClick: (Team) -> Unit,
) {
    LazyColumn(state = listState) {
        if (teams.isEmpty()) {
            item {
                EmptyDiscoverListItem(
                    message = if (isLoading) "Loading teams..." else emptyMessage,
                    modifier = Modifier
                        .padding(firstElementPadding)
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }
            return@LazyColumn
        }

        itemsIndexed(teams, key = { _, team -> team.id }) { index, team ->
            val padding = when (index) {
                0 -> firstElementPadding
                teams.size - 1 -> lastElementPadding
                else -> PaddingValues()
            }

            DiscoverTeamCard(
                team = team,
                onClick = { onTeamClick(team) },
                modifier = Modifier
                    .padding(padding)
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .fillMaxWidth()
                    .then(
                        if (index == 0 && firstItemGuideTargetId != null) {
                            Modifier.guideTarget(firstItemGuideTargetId)
                        } else {
                            Modifier
                        }
                    )
            )
        }
    }
}

@Composable
fun DiscoverTeamSuggestion(
    team: Team,
    onClick: () -> Unit,
) {
    DiscoverTeamCard(
        team = team,
        onClick = onClick,
        modifier = Modifier
            .padding(vertical = 4.dp, horizontal = 8.dp)
            .fillMaxWidth()
    )
}

@Composable
private fun DiscoverTeamCard(
    team: Team,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier.clickable(onClick = onClick)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                NetworkAvatar(
                    displayName = team.name.ifBlank { "Team" },
                    imageRef = team.profileImageId,
                    size = 36.dp,
                    contentDescription = "Team logo",
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = team.name.ifBlank { "Team" },
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = buildTeamSubtitle(team),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (team.normalizedAffiliateUrl() != null) {
                        "External registration"
                    } else {
                        "Open registration"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = if (team.registrationPriceCents > 0) {
                        (team.registrationPriceCents / 100.0).moneyFormat()
                    } else {
                        "Free"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun buildTeamSubtitle(team: Team): String {
    return listOfNotNull(
        team.sport?.trim()?.takeIf(String::isNotBlank),
        team.skillDivisionTypeName?.trim()?.takeIf(String::isNotBlank),
        team.ageDivisionTypeName?.trim()?.takeIf(String::isNotBlank),
    )
        .ifEmpty { listOf(team.division) }
        .joinToString(" • ")
}
