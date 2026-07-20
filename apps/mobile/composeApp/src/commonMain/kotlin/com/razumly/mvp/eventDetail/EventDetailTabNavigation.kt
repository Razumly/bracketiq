package com.razumly.mvp.eventDetail

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.icons.Groups
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.ProfileActionEvents
import com.razumly.mvp.icons.TournamentBracket
import com.razumly.mvp.icons.Trophy

internal enum class DetailTab(
    val label: String,
    val icon: ImageVector,
) {
    PARTICIPANTS("Participants", MVPIcons.Groups),
    BRACKET("Bracket", MVPIcons.TournamentBracket),
    SCHEDULE("Schedule", MVPIcons.ProfileActionEvents),
    LEAGUES("Standings", MVPIcons.Trophy),
}

private data class EventDetailTabVisuals(
    val badgeContainer: Color,
    val badgeContent: Color,
    val labelColor: Color,
    val borderColor: Color,
)

private data class EventDetailTabIconStyle(
    val size: Dp,
    val xOffset: Dp = 0.dp,
    val yOffset: Dp = 0.dp,
)

internal val DivisionPillContentTopOffset = 40.dp

@Composable
private fun eventDetailTabVisuals(selected: Boolean): EventDetailTabVisuals {
    val colorScheme = MaterialTheme.colorScheme
    return if (selected) {
        EventDetailTabVisuals(
            badgeContainer = colorScheme.primary,
            badgeContent = colorScheme.onPrimary,
            labelColor = colorScheme.onSurface,
            borderColor = colorScheme.primary.copy(alpha = 0.2f),
        )
    } else {
        EventDetailTabVisuals(
            badgeContainer = colorScheme.surfaceContainerHigh,
            badgeContent = colorScheme.primary.copy(alpha = 0.88f),
            labelColor = colorScheme.onSurfaceVariant,
            borderColor = colorScheme.outlineVariant,
        )
    }
}

@Composable
private fun eventDetailTabIconStyle(tab: DetailTab): EventDetailTabIconStyle =
    when (tab) {
        DetailTab.BRACKET -> EventDetailTabIconStyle(size = 20.dp)
        DetailTab.PARTICIPANTS -> EventDetailTabIconStyle(size = 20.dp)
        DetailTab.SCHEDULE -> EventDetailTabIconStyle(size = 20.dp)
        DetailTab.LEAGUES -> EventDetailTabIconStyle(size = 20.dp)
    }

@Composable
private fun EventDetailTabIcon(
    tab: DetailTab,
    selected: Boolean,
    modifier: Modifier = Modifier,
) {
    val visuals = eventDetailTabVisuals(selected)
    val iconStyle = eventDetailTabIconStyle(tab)
    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = visuals.badgeContainer,
        contentColor = visuals.badgeContent,
        shadowElevation = if (selected) 2.dp else 0.dp,
        tonalElevation = if (selected) 2.dp else 0.dp,
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .border(
                    width = 1.dp,
                    color = visuals.borderColor,
                    shape = CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = tab.icon,
                contentDescription = null,
                modifier = Modifier
                    .offset(x = iconStyle.xOffset, y = iconStyle.yOffset)
                    .size(iconStyle.size),
            )
        }
    }
}

@Composable
private fun RowScope.EventDetailTabButton(
    tab: DetailTab,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val visuals = eventDetailTabVisuals(selected)
    Column(
        modifier = Modifier
            .weight(1f)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        EventDetailTabIcon(
            tab = tab,
            selected = selected,
        )
        Text(
            text = tab.label,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            color = visuals.labelColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Box(
            modifier = Modifier
                .width(if (selected) 28.dp else 18.dp)
                .height(3.dp)
                .background(
                    color = if (selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f)
                    },
                    shape = RoundedCornerShape(999.dp),
                )
        )
    }
}

@Composable
internal fun EventDetailTabStrip(
    availableTabs: List<DetailTab>,
    selectedTab: DetailTab,
    onTabSelected: (DetailTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(28.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        tonalElevation = 1.dp,
        shadowElevation = 4.dp,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            availableTabs.forEach { tab ->
                EventDetailTabButton(
                    tab = tab,
                    selected = selectedTab == tab,
                    onClick = { onTabSelected(tab) },
                )
            }
        }
    }
}

@Composable
private fun EventDetailSelectedDivisionPill(
    prefix: String = "Division",
    label: String,
    selectedDivisionId: String?,
    divisionOptions: List<BracketDivisionOption>,
    onDivisionSelected: (String) -> Unit,
    fillSurfaceMaxWidth: Boolean = false,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val canOpen = divisionOptions.size > 1
    val arrowRotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = tween(durationMillis = 180),
        label = "divisionPillArrowRotation",
    )

    Box(modifier = modifier) {
        Surface(
            modifier = Modifier
                .then(if (fillSurfaceMaxWidth) Modifier.fillMaxWidth() else Modifier)
                .heightIn(min = 48.dp)
                .clickable(
                    enabled = canOpen,
                    onClick = { expanded = !expanded },
                ),
            shape = CircleShape,
            color = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
            tonalElevation = 1.dp,
            shadowElevation = 1.dp,
        ) {
            Row(
                modifier = Modifier.padding(
                    start = 14.dp,
                    end = if (canOpen) 8.dp else 14.dp,
                    top = 7.dp,
                    bottom = 7.dp,
                ),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = "$prefix: $label",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (canOpen) {
                    Icon(
                        imageVector = Icons.Default.KeyboardArrowDown,
                        contentDescription = null,
                        modifier = Modifier
                            .size(18.dp)
                            .rotate(arrowRotation),
                    )
                }
            }
        }
        DropdownMenu(
            expanded = canOpen && expanded,
            onDismissRequest = { expanded = false },
        ) {
            divisionOptions.sortedAlphabetically().forEach { option ->
                val selected = option.id.normalizeDivisionIdentifier() ==
                    selectedDivisionId?.normalizeDivisionIdentifier().orEmpty()
                DropdownMenuItem(
                    text = { Text(option.label) },
                    onClick = {
                        expanded = false
                        onDivisionSelected(option.id)
                    },
                    trailingIcon = if (selected) {
                        {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                            )
                        }
                    } else {
                        null
                    },
                    colors = MenuDefaults.itemColors(
                        textColor = if (selected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    ),
                )
            }
        }
    }
}

@Composable
internal fun EventDetailDivisionSelectorBar(
    divisionState: SelectedDivisionPillState?,
    poolState: SelectedDivisionPillState?,
    showBracketToggle: Boolean = false,
    isLosersBracket: Boolean = false,
    onDivisionSelected: (String) -> Unit,
    onPoolSelected: (String) -> Unit,
    onBracketToggle: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val usesBracketControlRow = showBracketToggle
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(
                if (usesBracketControlRow) {
                    Modifier
                } else {
                    Modifier.horizontalScroll(rememberScrollState())
                },
            )
            .padding(horizontal = 12.dp),
        horizontalArrangement = if (usesBracketControlRow) {
            Arrangement.spacedBy(8.dp)
        } else {
            Arrangement.Center
        },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        divisionState?.let { state ->
            EventDetailSelectedDivisionPill(
                prefix = "Division",
                label = state.label,
                selectedDivisionId = state.selectedDivisionId,
                divisionOptions = state.options,
                onDivisionSelected = onDivisionSelected,
                fillSurfaceMaxWidth = usesBracketControlRow,
                modifier = if (usesBracketControlRow) {
                    Modifier.weight(1f)
                } else {
                    Modifier.widthIn(max = if (poolState == null) 280.dp else 240.dp)
                },
            )
        }
        if (divisionState != null && poolState != null) {
            Spacer(modifier = Modifier.width(8.dp))
        }
        poolState?.let { state ->
            EventDetailSelectedDivisionPill(
                prefix = "Pool",
                label = state.label,
                selectedDivisionId = state.selectedDivisionId,
                divisionOptions = state.options,
                onDivisionSelected = onPoolSelected,
                modifier = Modifier.widthIn(max = 180.dp),
            )
        }
        if (showBracketToggle) {
            Button(
                onClick = onBracketToggle,
                modifier = if (divisionState == null) {
                    Modifier.widthIn(min = 112.dp)
                } else {
                    Modifier.weight(0.34f)
                },
                contentPadding = PaddingValues(horizontal = 8.dp),
            ) {
                Text(
                    text = if (isLosersBracket) "Losers" else "Winners",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
