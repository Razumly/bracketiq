package com.razumly.mvp.eventDetail

import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.animateBounds
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.LookaheadScope
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventDetail.composables.ParticipantsSection
import com.razumly.mvp.icons.Groups
import com.razumly.mvp.icons.MVPIcons
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val FloatingDockShape = RoundedCornerShape(20.dp)
private val FloatingDockMinHeight = 60.dp
private val FloatingDockShadowPadding = 8.dp

private const val FloatingDockExpandDurationMillis = 260

@Composable
internal fun StickyActionBar(
    primaryLabel: String,
    primaryEnabled: Boolean,
    onPrimaryClick: () -> Unit,
    onMapClick: () -> Unit,
    onDirectionsClick: () -> Unit,
    directionsEnabled: Boolean,
    onMapButtonPositioned: (Offset) -> Unit,
    onShareClick: () -> Unit,
    selectedWeeklyOccurrenceLabel: String? = null,
    onClearSelectedWeeklyOccurrence: (() -> Unit)? = null,
    barAlpha: Float = 1f,
    shadowElevation: Dp = 6.dp,
    modifier: Modifier = Modifier
) {
    var mapButtonCenter by remember { mutableStateOf(Offset.Zero) }
    val clampedBarAlpha = barAlpha.coerceIn(0f, 1f)
    Surface(
        modifier = modifier
            .fillMaxWidth(),
        shape = FloatingDockShape,
        color = MaterialTheme.colorScheme.surface.copy(alpha = clampedBarAlpha),
        contentColor = MaterialTheme.colorScheme.onSurface,
        tonalElevation = 3.dp,
        shadowElevation = shadowElevation,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .alpha(clampedBarAlpha)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (!selectedWeeklyOccurrenceLabel.isNullOrBlank() && onClearSelectedWeeklyOccurrence != null) {
                Button(
                    onClick = onClearSelectedWeeklyOccurrence,
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = selectedWeeklyOccurrenceLabel,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Clear occurrence",
                        )
                    }
                }
            }
            Button(
                onClick = onPrimaryClick,
                enabled = primaryEnabled,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(14.dp)
            ) {
                Text(
                    text = primaryLabel,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            IconButton(
                onClick = {
                    onMapButtonPositioned(mapButtonCenter)
                    onMapClick()
                },
                modifier = Modifier.onGloballyPositioned {
                    mapButtonCenter = it.boundsInWindow().center
                    onMapButtonPositioned(mapButtonCenter)
                }
            ) {
                Icon(Icons.Default.Place, contentDescription = "Map")
            }
            IconButton(
                onClick = onDirectionsClick,
                enabled = directionsEnabled,
            ) {
                Icon(Icons.Default.Directions, contentDescription = "Directions")
            }
            IconButton(onClick = onShareClick) {
                Icon(Icons.Default.Share, contentDescription = "Share")
            }
        }
    }
}

@Composable
internal fun BracketFloatingBar(
    selectedPoolDivisionId: String? = null,
    poolOptions: List<BracketDivisionOption> = emptyList(),
    onPoolSelected: ((String?) -> Unit)? = null,
    includeAllPoolsOption: Boolean = true,
    showBracketToggle: Boolean = false,
    isLosersBracket: Boolean = false,
    onBracketToggle: () -> Unit = {},
    showMatchEditAction: Boolean = false,
    isEditingMatches: Boolean = false,
    onStartMatchEdit: (() -> Unit)? = null,
    onCancelMatchEdit: (() -> Unit)? = null,
    onCommitMatchEdit: (() -> Unit)? = null,
    primaryActionLabel: String? = null,
    onPrimaryActionClick: (() -> Unit)? = null,
    primaryActionEnabled: Boolean = true,
    primaryActionColors: ButtonColors? = null,
    showPrimaryActionFirst: Boolean = false,
    showConfirmResultsAction: Boolean = false,
    confirmResultsEnabled: Boolean = false,
    confirmResultsInProgress: Boolean = false,
    onConfirmResultsClick: () -> Unit = {},
    useVerticalLayout: Boolean = false,
    onCloseClick: (() -> Unit)? = null,
    wrapInSurface: Boolean = true,
    selectedWeeklyOccurrenceLabel: String? = null,
    onClearSelectedWeeklyOccurrence: (() -> Unit)? = null,
    onShowDetailsClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var isPoolMenuExpanded by remember { mutableStateOf(false) }
    val content: @Composable () -> Unit = {
        FloatingDockActionsLayout(
            useVerticalLayout = useVerticalLayout,
            onCloseClick = onCloseClick,
        ) {
            if (!selectedWeeklyOccurrenceLabel.isNullOrBlank() && onClearSelectedWeeklyOccurrence != null) {
                Button(
                    onClick = onClearSelectedWeeklyOccurrence,
                    modifier = Modifier.floatingDockActionWidth(),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = selectedWeeklyOccurrenceLabel,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Clear occurrence",
                        )
                    }
                }
            }
            if (showPrimaryActionFirst && !primaryActionLabel.isNullOrBlank() && onPrimaryActionClick != null) {
                Button(
                    onClick = onPrimaryActionClick,
                    enabled = primaryActionEnabled,
                    colors = primaryActionColors ?: ButtonDefaults.buttonColors(),
                    modifier = Modifier.floatingDockActionWidth(),
                ) {
                    Text(
                        text = primaryActionLabel,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (poolOptions.isNotEmpty() && onPoolSelected != null) {
                Box(
                    modifier = Modifier.floatingDockActionWidth(),
                    propagateMinConstraints = useVerticalLayout,
                ) {
                    Button(
                        onClick = { isPoolMenuExpanded = true },
                        modifier = Modifier.floatingDockActionWidth(minWidth = 96.dp),
                    ) {
                        Text(text = "Pool")
                    }
                    DropdownMenu(
                        expanded = isPoolMenuExpanded,
                        onDismissRequest = { isPoolMenuExpanded = false }
                    ) {
                        if (includeAllPoolsOption) {
                            DropdownMenuItem(
                                text = { Text("All pools") },
                                onClick = {
                                    isPoolMenuExpanded = false
                                    onPoolSelected(null)
                                },
                                leadingIcon = {
                                    if (selectedPoolDivisionId.isNullOrBlank()) {
                                        Icon(
                                            imageVector = Icons.Default.Check,
                                            contentDescription = null,
                                        )
                                    }
                                }
                            )
                        }
                        poolOptions.sortedAlphabetically().forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option.label) },
                                onClick = {
                                    isPoolMenuExpanded = false
                                    onPoolSelected(option.id)
                                },
                                leadingIcon = {
                                    if (option.id == selectedPoolDivisionId) {
                                        Icon(
                                            imageVector = Icons.Default.Check,
                                            contentDescription = null,
                                        )
                                    }
                                }
                            )
                        }
                    }
                }
            }
            if (showBracketToggle) {
                Button(
                    onClick = onBracketToggle,
                    modifier = Modifier.floatingDockActionWidth(),
                ) {
                    Text(
                        text = if (isLosersBracket) "Losers Bracket" else "Winners Bracket",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (showMatchEditAction) {
                if (isEditingMatches && onCommitMatchEdit != null && onCancelMatchEdit != null) {
                    Button(
                        onClick = onCommitMatchEdit,
                        modifier = Modifier.floatingDockActionWidth(),
                    ) {
                        Text("Save")
                    }
                    Button(
                        onClick = onCancelMatchEdit,
                        modifier = Modifier.floatingDockActionWidth(),
                    ) {
                        Text("Cancel")
                    }
                } else if (!isEditingMatches && onStartMatchEdit != null) {
                    Button(
                        onClick = onStartMatchEdit,
                        modifier = Modifier.floatingDockActionWidth(),
                    ) {
                        Text("Manage")
                    }
                }
            }
            if (showConfirmResultsAction) {
                Button(
                    onClick = onConfirmResultsClick,
                    enabled = confirmResultsEnabled,
                    modifier = Modifier.floatingDockActionWidth(),
                ) {
                    Text(
                        text = if (confirmResultsInProgress) "Confirming..." else "Confirm Results",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (!showPrimaryActionFirst &&
                !primaryActionLabel.isNullOrBlank() &&
                onPrimaryActionClick != null
            ) {
                Button(
                    onClick = onPrimaryActionClick,
                    enabled = primaryActionEnabled,
                    colors = primaryActionColors ?: ButtonDefaults.buttonColors(),
                    modifier = Modifier.floatingDockActionWidth(),
                ) {
                    Text(
                        text = primaryActionLabel,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Button(
                onClick = onShowDetailsClick,
                modifier = Modifier.floatingDockActionWidth(),
            ) {
                Text(
                    text = "Back to details",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
    if (wrapInSurface) {
        Surface(
            modifier = modifier.fillMaxWidth(),
            shape = FloatingDockShape,
            tonalElevation = 3.dp,
            shadowElevation = 6.dp
        ) {
            content()
        }
    } else {
        Box(modifier = modifier) {
            content()
        }
    }
}

@Composable
internal fun ExpandableFloatingDock(
    expanded: Boolean,
    onExpandClick: () -> Unit,
    onCollapseClick: () -> Unit,
    modifier: Modifier = Modifier,
    expandedContent: @Composable (Modifier, () -> Unit) -> Unit,
) {
    val dockBoundsTransform = remember {
        BoundsTransform { _, _ -> tween(durationMillis = FloatingDockExpandDurationMillis) }
    }
    var expandedActionsVisible by remember { mutableStateOf(false) }
    LaunchedEffect(expanded) {
        if (expanded) {
            expandedActionsVisible = false
            delay(FloatingDockExpandDurationMillis.toLong())
            expandedActionsVisible = true
        } else {
            expandedActionsVisible = false
        }
    }
    val expandedActionsAlpha by animateFloatAsState(
        targetValue = if (expandedActionsVisible) 1f else 0f,
        animationSpec = tween(durationMillis = 180),
        label = "floatingDockActionsAlpha",
    )
    LookaheadScope {
        Box(
            modifier = modifier
                .fillMaxWidth()
                .padding(FloatingDockShadowPadding),
            contentAlignment = Alignment.BottomEnd,
        ) {
            Surface(
                modifier = Modifier.animateBounds(
                    lookaheadScope = this@LookaheadScope,
                    modifier = if (expanded) {
                        Modifier
                    } else {
                        Modifier.size(FloatingDockMinHeight)
                    },
                    boundsTransform = dockBoundsTransform,
                ),
                shape = FloatingDockShape,
                color = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
                tonalElevation = 3.dp,
                shadowElevation = 6.dp,
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                ) {
                    if (expanded) {
                        Box(
                            modifier = Modifier.alpha(
                                if (expandedActionsVisible) expandedActionsAlpha else 0f,
                            )
                        ) {
                            expandedContent(
                                Modifier,
                                onCollapseClick,
                            )
                        }
                    } else {
                        FloatingDockMenuFab(onClick = onExpandClick)
                    }
                }
            }
        }
    }
}

@Composable
private fun FloatingDockMenuFab(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(FloatingDockMinHeight)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Default.MoreVert,
            contentDescription = "Show actions",
            modifier = Modifier.size(28.dp),
        )
    }
}

@Composable
private fun FloatingDockActionsLayout(
    useVerticalLayout: Boolean,
    onCloseClick: (() -> Unit)?,
    content: @Composable () -> Unit,
) {
    if (useVerticalLayout) {
        FloatingDockColumn(
            onCloseClick = onCloseClick,
            content = content,
        )
    } else {
        ScrollableFloatingDockRow(content = content)
    }
}

@Composable
private fun FloatingDockColumn(
    onCloseClick: (() -> Unit)?,
    content: @Composable () -> Unit,
) {
    FloatingDockVerticalActions(
        modifier = Modifier
            .padding(horizontal = 12.dp, vertical = 10.dp),
        onCloseClick = onCloseClick,
        content = content,
    )
}

@Composable
private fun FloatingDockVerticalActions(
    onCloseClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val verticalSpacing = with(LocalDensity.current) { 8.dp.roundToPx() }
    Layout(
        modifier = modifier,
        content = {
            content()
            if (onCloseClick != null) {
                FloatingDockCloseButton(onClick = onCloseClick)
            }
        },
    ) { measurables, constraints ->
        val hasCloseButton = onCloseClick != null && measurables.isNotEmpty()
        val closeMeasurable = if (hasCloseButton) measurables.last() else null
        val actionMeasurables = if (hasCloseButton) {
            measurables.dropLast(1)
        } else {
            measurables
        }
        val looseConstraints = constraints.copy(minWidth = 0, minHeight = 0)
        val closePlaceable = closeMeasurable?.measure(looseConstraints)
        val maxWidth = constraints.maxWidth
        val measuredActionWidth = actionMeasurables.maxOfOrNull { measurable ->
            measurable.maxIntrinsicWidth(constraints.maxHeight)
        } ?: 0
        val actionWidth = measuredActionWidth.coerceAtMost(maxWidth)
        val actionConstraints = looseConstraints.copy(
            minWidth = actionWidth,
            maxWidth = actionWidth,
        )
        val actionPlaceables = actionMeasurables.map { measurable ->
            measurable.measure(actionConstraints)
        }
        val closeHeight = closePlaceable?.height ?: 0
        val closeSpacing = if (closePlaceable != null && actionPlaceables.isNotEmpty()) {
            verticalSpacing
        } else {
            0
        }
        val actionsHeight = actionPlaceables.sumOf { placeable -> placeable.height } +
            (actionPlaceables.size - 1).coerceAtLeast(0) * verticalSpacing
        val contentWidth = maxOf(
            actionPlaceables.maxOfOrNull { placeable -> placeable.width } ?: 0,
            closePlaceable?.width ?: 0,
        )
        val layoutWidth = contentWidth
            .coerceAtLeast(constraints.minWidth)
            .coerceAtMost(maxWidth)
        val layoutHeight = (closeHeight + closeSpacing + actionsHeight)
            .coerceAtLeast(constraints.minHeight)
            .coerceAtMost(constraints.maxHeight)

        layout(width = layoutWidth, height = layoutHeight) {
            closePlaceable?.placeRelative(
                x = layoutWidth - closePlaceable.width,
                y = 0,
            )
            var y = closeHeight + closeSpacing
            actionPlaceables.forEach { placeable ->
                val x = ((layoutWidth - placeable.width) / 2).coerceAtLeast(0)
                placeable.placeRelative(x = x, y = y)
                y += placeable.height + verticalSpacing
            }
        }
    }
}

@Composable
private fun FloatingDockCloseButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(32.dp)
            .background(
                color = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.7f),
                shape = CircleShape,
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Default.Close,
            contentDescription = "Collapse actions",
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.onSurface,
        )
    }
}

private fun Modifier.floatingDockActionWidth(
    minWidth: Dp? = null,
): Modifier {
    var widthModifier = this
    if (minWidth != null) {
        widthModifier = widthModifier.widthIn(min = minWidth)
    }
    return widthModifier
}

@Composable
@Suppress("DEPRECATION")
private fun ScrollableFloatingDockRow(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val scrollState = rememberScrollState()
    val coroutineScope = rememberCoroutineScope()
    var rowSize by remember { mutableStateOf(IntSize.Zero) }
    val density = LocalDensity.current
    val showLeftIndicator by remember { derivedStateOf { scrollState.value > 0 } }
    val showRightIndicator by remember { derivedStateOf { scrollState.value < scrollState.maxValue } }
    val rowHeight = with(density) { rowSize.height.toDp() }

    Box(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(scrollState)
                .onSizeChanged { rowSize = it }
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            content()
        }
        DockEdgeFade(
            visible = showLeftIndicator && rowSize.height > 0,
            isLeft = true,
            height = rowHeight,
            modifier = Modifier.align(Alignment.CenterStart),
        )
        DockEdgeFade(
            visible = showRightIndicator && rowSize.height > 0,
            isLeft = false,
            height = rowHeight,
            modifier = Modifier.align(Alignment.CenterEnd),
        )
        DockScrollIndicator(
            visible = showLeftIndicator,
            icon = Icons.Filled.KeyboardArrowLeft,
            contentDescription = "Scroll dock left",
            onClick = {
                coroutineScope.launch {
                    val target = (scrollState.value - 220).coerceAtLeast(0)
                    scrollState.animateScrollTo(target)
                }
            },
            modifier = Modifier.align(Alignment.CenterStart),
        )
        DockScrollIndicator(
            visible = showRightIndicator,
            icon = Icons.Filled.KeyboardArrowRight,
            contentDescription = "Scroll dock right",
            onClick = {
                coroutineScope.launch {
                    val target = (scrollState.value + 220).coerceAtMost(scrollState.maxValue)
                    scrollState.animateScrollTo(target)
                }
            },
            modifier = Modifier.align(Alignment.CenterEnd),
        )
    }
}

@Composable
private fun DockEdgeFade(
    visible: Boolean,
    isLeft: Boolean,
    height: Dp,
    modifier: Modifier = Modifier,
) {
    if (!visible) return
    val surfaceColor = MaterialTheme.colorScheme.surface
    val colors = if (isLeft) {
        listOf(surfaceColor, surfaceColor.copy(alpha = 0f))
    } else {
        listOf(surfaceColor.copy(alpha = 0f), surfaceColor)
    }
    Box(
        modifier = modifier
            .height(height)
            .width(28.dp)
            .background(Brush.horizontalGradient(colors))
    )
}

@Composable
private fun DockScrollIndicator(
    visible: Boolean,
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!visible) return
    IconButton(
        onClick = onClick,
        modifier = modifier.padding(horizontal = 2.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
internal fun ParticipantsFloatingBar(
    selectedSection: ParticipantsSection,
    availableSections: List<ParticipantsSection>,
    onSectionSelected: (ParticipantsSection) -> Unit,
    showManageAction: Boolean = false,
    isManagingParticipants: Boolean = false,
    onStartManagingParticipants: (() -> Unit)? = null,
    onStopManagingParticipants: (() -> Unit)? = null,
    inviteActionLabel: String? = null,
    onInviteClick: (() -> Unit)? = null,
    useVerticalLayout: Boolean = false,
    onCloseClick: (() -> Unit)? = null,
    wrapInSurface: Boolean = true,
    selectedWeeklyOccurrenceLabel: String? = null,
    onClearSelectedWeeklyOccurrence: (() -> Unit)? = null,
    onShowDetailsClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var isSectionMenuExpanded by remember { mutableStateOf(false) }
    val content: @Composable () -> Unit = {
        FloatingDockActionsLayout(
            useVerticalLayout = useVerticalLayout,
            onCloseClick = onCloseClick,
        ) {
            if (!selectedWeeklyOccurrenceLabel.isNullOrBlank() && onClearSelectedWeeklyOccurrence != null) {
                Button(
                    onClick = onClearSelectedWeeklyOccurrence,
                    modifier = Modifier.floatingDockActionWidth(),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = selectedWeeklyOccurrenceLabel,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Clear occurrence",
                        )
                    }
                }
            }
            Box(
                modifier = Modifier.floatingDockActionWidth(),
                propagateMinConstraints = useVerticalLayout,
            ) {
                Button(
                    onClick = { isSectionMenuExpanded = true },
                    modifier = Modifier.floatingDockActionWidth(minWidth = 120.dp)
                ) {
                    Text(
                        text = selectedSection.label,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                DropdownMenu(
                    expanded = isSectionMenuExpanded,
                    onDismissRequest = { isSectionMenuExpanded = false }
                ) {
                    availableSections.forEach { section ->
                        DropdownMenuItem(
                            text = { Text(section.label) },
                            onClick = {
                                isSectionMenuExpanded = false
                                onSectionSelected(section)
                            },
                            leadingIcon = {
                                if (section == selectedSection) {
                                    Icon(
                                        imageVector = Icons.Default.Check,
                                        contentDescription = null
                                    )
                                }
                            }
                        )
                    }
                }
            }
            if (!inviteActionLabel.isNullOrBlank() && onInviteClick != null) {
                Button(
                    onClick = onInviteClick,
                    modifier = Modifier.floatingDockActionWidth(),
                ) {
                    Icon(
                        imageVector = if (inviteActionLabel.contains("Team", ignoreCase = true)) {
                            MVPIcons.Groups
                        } else {
                            Icons.Default.PersonAdd
                        },
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = inviteActionLabel,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (showManageAction) {
                if (isManagingParticipants && onStopManagingParticipants != null) {
                    Button(
                        onClick = onStopManagingParticipants,
                        modifier = Modifier.floatingDockActionWidth(),
                    ) {
                        Text("Done")
                    }
                } else if (!isManagingParticipants && onStartManagingParticipants != null) {
                    Button(
                        onClick = onStartManagingParticipants,
                        modifier = Modifier.floatingDockActionWidth(),
                    ) {
                        Text("Manage")
                    }
                }
            }
            Button(
                onClick = onShowDetailsClick,
                modifier = Modifier.floatingDockActionWidth(),
            ) {
                Text(
                    text = "Back to details",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
    if (wrapInSurface) {
        Surface(
            modifier = modifier.fillMaxWidth(),
            shape = FloatingDockShape,
            tonalElevation = 3.dp,
            shadowElevation = 6.dp
        ) {
            content()
        }
    } else {
        Box(modifier = modifier) {
            content()
        }
    }
}
