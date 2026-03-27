package com.razumly.mvp.eventDetail.composables

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.util.ceilDiv
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import kotlinx.coroutines.flow.distinctUntilChanged

private val BRACKET_CONNECTOR_WIDTH = 20.dp
private val BRACKET_CONNECTOR_STROKE = 2.dp
private const val BRACKET_LAYOUT_ANIMATION_MS = 300

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun TournamentBracketView(
    showFab: (Boolean) -> Unit,
    onMatchClick: (MatchWithRelations) -> Unit = {},
    isEditingMatches: Boolean = false,
    editableMatches: List<MatchWithRelations> = emptyList(),
    onEditMatch: ((MatchWithRelations) -> Unit)? = null,
    showEventOfficialNames: Boolean = true,
    limitOfficialsToCurrentUser: Boolean = false,
) {
    val component = LocalTournamentComponent.current
    val losersBracket by component.losersBracket.collectAsState()
    val roundsList by component.rounds.collectAsState()
    val editableRounds by component.editableRounds.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val columnScrollState = rememberScrollState()
    val displayRounds = if (isEditingMatches) {
        editableRounds
    } else {
        roundsList
    }
    val lazyRowState = rememberLazyListState()
    var maxHeightInRowDp by remember { mutableStateOf(0.dp) }
    val columnHeight by animateDpAsState(
        targetValue = maxHeightInRowDp,
        animationSpec = tween(
            durationMillis = BRACKET_LAYOUT_ANIMATION_MS,
            easing = FastOutSlowInEasing
        ),
        label = "Column Height"
    )
    val cardHeight = remember(
        isEditingMatches,
        showEventOfficialNames,
        selectedEvent.officialPositions,
        editableMatches,
        roundsList,
    ) {
        if (!isEditingMatches) {
            MATCH_CARD_BASE_HEIGHT_DP
        } else {
            val candidateMatches = editableMatches.ifEmpty {
                roundsList
                    .flatten()
                    .filterNotNull()
            }
            candidateMatches.maxOfOrNull { candidate ->
                calculateMatchCardHeightDp(
                    match = candidate.match,
                    positions = selectedEvent.officialPositions,
                    manageMode = true,
                )
            } ?: MATCH_CARD_BASE_HEIGHT_DP
        }
    }
    val cardPadding = 64
    val cardContainerHeight = cardHeight + cardPadding
    var boxHeight by remember { mutableStateOf(Dp.Unspecified) }
    var previousBoxHeight by remember { mutableStateOf(Dp.Unspecified) }
    val animatedBoxHeight by animateDpAsState(
        targetValue = boxHeight.takeIf { it != Dp.Unspecified } ?: 0.dp,
        animationSpec = tween(
            durationMillis = BRACKET_LAYOUT_ANIMATION_MS,
            easing = FastOutSlowInEasing
        ),
        label = "Bracket Container Height"
    )
    val width = getScreenWidth() / 1.5
    val cardWidthDp = width.dp
    var maxHeightIndex by remember { mutableIntStateOf(0) }
    val navBarPadding = LocalNavBarPadding.current.calculateBottomPadding()
    val density = LocalDensity.current
    var viewportHeightPx by remember { mutableIntStateOf(0) }
    var prevColumnScroll by remember { mutableStateOf(columnScrollState.value) }
    var isScrollingUp by remember { mutableStateOf(true) }
    var isAutoVerticalScroll by remember { mutableStateOf(false) }
    var suppressFabAfterAutoScroll by remember { mutableStateOf(false) }
    val isScrollingLeft by lazyRowState.isScrollingUp()
    var pendingCollapseClamp by remember { mutableStateOf(false) }
    var collapseAnchorColumnIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(columnScrollState) {
        snapshotFlow { columnScrollState.value }.distinctUntilChanged().collect { currentScroll ->
            isScrollingUp = currentScroll <= prevColumnScroll
            prevColumnScroll = currentScroll
        }
    }

    LaunchedEffect(
        columnScrollState.isScrollInProgress,
        isScrollingUp,
        isAutoVerticalScroll,
        suppressFabAfterAutoScroll,
    ) {
        if (
            columnScrollState.isScrollInProgress &&
            !isAutoVerticalScroll &&
            !suppressFabAfterAutoScroll
        ) {
            showFab(isScrollingUp)
        }
    }

    LaunchedEffect(lazyRowState.isScrollInProgress, isScrollingLeft) {
        if (lazyRowState.isScrollInProgress) {
            showFab(isScrollingLeft)
        }
    }

    LaunchedEffect(suppressFabAfterAutoScroll, columnScrollState.isScrollInProgress) {
        if (suppressFabAfterAutoScroll && !columnScrollState.isScrollInProgress) {
            suppressFabAfterAutoScroll = false
        }
    }

    LaunchedEffect(lazyRowState, displayRounds, losersBracket, cardContainerHeight) {
        // Function to calculate height
        fun calculateMaxHeight(index: Int) {
            var maxSize = 0
            val itemsInViewCount =
                lazyRowState.layoutInfo.visibleItemsInfo.size.takeIf { it > 0 } ?: displayRounds.size
            val lastItemInViewIndex =
                (index + itemsInViewCount - 1).coerceAtMost(displayRounds.size - 1)

            if (displayRounds.isNotEmpty() && index < displayRounds.size) {
                displayRounds.slice(index..lastItemInViewIndex).forEachIndexed { i, round ->
                    val notNullSize = round.filterNotNull().size
                    val halfSize = round.size.ceilDiv(2)
                    val currentIndex = index + i

                    if (!losersBracket && round.any { it?.match?.losersBracket == true } && i != 0) {
                        if (round.size * 2 > maxSize) {
                            maxSize = round.size * 2
                            maxHeightIndex = currentIndex
                        }
                    } else if (notNullSize > halfSize || (losersBracket && i == 0) || (index != 0 && notNullSize == halfSize)) {
                        if (round.size > maxSize) {
                            maxSize = round.size
                            maxHeightIndex = currentIndex
                        }
                    } else {
                        if (notNullSize > maxSize) {
                            maxSize = notNullSize
                            maxHeightIndex = currentIndex
                        }
                    }
                }

                maxHeightInRowDp = maxSize.dp * cardContainerHeight

                val rawBoxHeight = maxHeightInRowDp + navBarPadding + 16.dp
                val minBoxHeight = if (viewportHeightPx > 0) {
                    with(density) { viewportHeightPx.toDp() }
                } else {
                    0.dp
                }
                val nextBoxHeight = rawBoxHeight.coerceAtLeast(minBoxHeight)
                val hasPreviousHeight = previousBoxHeight != Dp.Unspecified
                val isCollapsing = hasPreviousHeight && nextBoxHeight < previousBoxHeight
                if (isCollapsing) {
                    collapseAnchorColumnIndex = lazyRowState.firstVisibleItemIndex
                    pendingCollapseClamp = true
                }
                boxHeight = nextBoxHeight
                previousBoxHeight = nextBoxHeight
            }
        }

        // Run initial calculation
        calculateMaxHeight(0)

        // Listen for changes
        snapshotFlow { lazyRowState.firstVisibleItemIndex }.collect { index ->
            calculateMaxHeight(index)
        }
    }

    LaunchedEffect(
        pendingCollapseClamp,
        collapseAnchorColumnIndex,
        boxHeight,
        maxHeightInRowDp,
        viewportHeightPx,
        columnScrollState.isScrollInProgress,
    ) {
        if (!pendingCollapseClamp) return@LaunchedEffect
        if (columnScrollState.isScrollInProgress || viewportHeightPx <= 0) return@LaunchedEffect
        val safeAnchorIndex = collapseAnchorColumnIndex.coerceIn(0, displayRounds.lastIndex.coerceAtLeast(0))
        if (displayRounds.isEmpty() || safeAnchorIndex >= displayRounds.size) {
            pendingCollapseClamp = false
            return@LaunchedEffect
        }
        // Ensure the container height animation has started before clamping.
        withFrameNanos { }

        val boxHeightPx = with(density) { (boxHeight.takeIf { it != Dp.Unspecified } ?: 0.dp).roundToPx() }
        val contentHeightPx = with(density) { maxHeightInRowDp.roundToPx() }
        val contentTopPx = ((boxHeightPx - contentHeightPx) / 2).coerceAtLeast(0)
        val contentBottomPx = contentTopPx + contentHeightPx

        val viewportTopPx = columnScrollState.value
        val viewportBottomPx = viewportTopPx + viewportHeightPx
        val intersectsContentBand = viewportBottomPx > contentTopPx && viewportTopPx < contentBottomPx

        if (!intersectsContentBand) {
            val viewportCenterPx = viewportTopPx + viewportHeightPx / 2
            val contentCenterPx = contentTopPx + contentHeightPx / 2
            val targetScroll = if (viewportCenterPx > contentCenterPx) {
                // Too low: pull up until the content's bottom edge is visible.
                (contentBottomPx - viewportHeightPx).coerceAtLeast(0)
            } else {
                // Too high: push down until the content's top edge is visible.
                contentTopPx
            }.coerceIn(0, columnScrollState.maxValue)

            if (targetScroll != columnScrollState.value) {
                isAutoVerticalScroll = true
                suppressFabAfterAutoScroll = true
                try {
                    columnScrollState.animateScrollTo(
                        targetScroll,
                        animationSpec = tween(
                            durationMillis = BRACKET_LAYOUT_ANIMATION_MS,
                            easing = FastOutSlowInEasing
                        )
                    )
                } finally {
                    isAutoVerticalScroll = false
                }
            }
        }
        pendingCollapseClamp = false
    }


    Column(
        Modifier.fillMaxSize()
            .onSizeChanged { viewportHeightPx = it.height }
            .verticalScroll(columnScrollState)
            .background(MaterialTheme.colorScheme.background)
    ) {
        Column(Modifier.fillMaxWidth()) {
            LazyRow(
                state = lazyRowState,
                modifier = Modifier.height(animatedBoxHeight).fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                itemsIndexed(displayRounds, key = { _, round ->
                    round.filterNotNull().joinToString { it.match.id }
                }) { colIndex, round ->
                    val showOutgoingConnectors = colIndex < displayRounds.lastIndex
                    Column(
                        modifier = Modifier.padding(start = if (colIndex == 0) 16.dp else 0.dp)
                            .width(intrinsicSize = IntrinsicSize.Max).height(columnHeight),
                        verticalArrangement = Arrangement.SpaceBetween,
                    ) {
                        round.chunked(2).forEachIndexed { chunkIndex, matches ->
                            val filteredMatches = if (colIndex == 0 || maxHeightIndex == colIndex) {
                                matches.filterNotNull()
                            } else {
                                matches
                            }
                            val resolvedMatches = filteredMatches.map { match ->
                                if (isEditingMatches && editableMatches.isNotEmpty()) {
                                    editableMatches.find { it.match.id == match?.match?.id } ?: match
                                } else {
                                    match
                                }
                            }
                            val oppositeMatchIndex = resolvedMatches.indexOfFirst { match ->
                                match != null && match.match.losersBracket != losersBracket
                            }.takeIf { it >= 0 }
                            val currentBracketMatch = resolvedMatches.firstOrNull { match ->
                                match != null && match.match.losersBracket == losersBracket
                            }
                            val oppositeMatch = oppositeMatchIndex?.let { index ->
                                resolvedMatches.getOrNull(index)
                            }
                            val visibleColumnPosition = colIndex - lazyRowState.firstVisibleItemIndex
                            val useOffsetOppositeLayout =
                                oppositeMatchIndex != null &&
                                    currentBracketMatch != null &&
                                    visibleColumnPosition >= 2
                            var visible by remember(colIndex, chunkIndex, matches) {
                                mutableStateOf(
                                    true
                                )
                            }

                            val pairWeight by animateFloatAsState(
                                targetValue = if (visible) 1.0f else 0.01f,
                                animationSpec = tween(
                                    durationMillis = BRACKET_LAYOUT_ANIMATION_MS,
                                    easing = FastOutSlowInEasing
                                ),
                                label = "Card Visibility",
                            )
                            LaunchedEffect(maxHeightIndex) {
                                snapshotFlow { lazyRowState.firstVisibleItemIndex }.collect {
                                    visible = (matches.filterNotNull()
                                        .isNotEmpty() || (colIndex == it))
                                }
                            }
                            Box(
                                modifier = Modifier.weight(pairWeight)
                                    .background(MaterialTheme.colorScheme.background),
                                contentAlignment = Alignment.Center
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxHeight(),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(
                                        modifier = Modifier.fillMaxHeight(),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                    ) {
                                        SharedTransitionLayout {
                                            AnimatedContent(
                                                targetState = useOffsetOppositeLayout,
                                                transitionSpec = {
                                                    (EnterTransition.None togetherWith ExitTransition.None)
                                                        .using(SizeTransform(clip = false))
                                                },
                                                label = "OppositeBracketPairLayout"
                                            ) { isOffsetLayout ->
                                                if (isOffsetLayout) {
                                                    val oppositeOffsetY = if (oppositeMatchIndex == 0) {
                                                        -cardContainerHeight.dp
                                                    } else {
                                                        cardContainerHeight.dp
                                                    }
                                                    Box(
                                                        modifier = Modifier
                                                            .fillMaxHeight()
                                                            .width(cardWidthDp)
                                                    ) {
                                                        if (currentBracketMatch != null) {
                                                            MatchCard(
                                                                match = currentBracketMatch,
                                                                onClick = {
                                                                    if (isEditingMatches) {
                                                                        onEditMatch?.invoke(currentBracketMatch)
                                                                    } else {
                                                                        onMatchClick(currentBracketMatch)
                                                                    }
                                                                },
                                                                modifier = Modifier
                                                                    .align(Alignment.Center)
                                                                    .height(cardHeight.dp)
                                                                    .width(cardWidthDp)
                                                                    .sharedElement(
                                                                        sharedContentState = rememberSharedContentState(
                                                                            key = "bracket-card-${currentBracketMatch.match.id}"
                                                                        ),
                                                                        animatedVisibilityScope = this@AnimatedContent,
                                                                        boundsTransform = { _, _ ->
                                                                            tween(
                                                                                durationMillis = BRACKET_LAYOUT_ANIMATION_MS,
                                                                                easing = FastOutSlowInEasing
                                                                            )
                                                                        },
                                                                    ),
                                                                showEventOfficialNames = showEventOfficialNames,
                                                                limitOfficialsToCurrentUser = limitOfficialsToCurrentUser,
                                                                manageMode = isEditingMatches,
                                                            )
                                                        }
                                                        if (oppositeMatch != null) {
                                                            MatchCard(
                                                                match = oppositeMatch,
                                                                onClick = {
                                                                    if (isEditingMatches) {
                                                                        onEditMatch?.invoke(oppositeMatch)
                                                                    } else {
                                                                        onMatchClick(oppositeMatch)
                                                                    }
                                                                },
                                                                modifier = Modifier
                                                                    .align(Alignment.Center)
                                                                    .offset(y = oppositeOffsetY)
                                                                    .height(cardHeight.dp)
                                                                    .width(cardWidthDp)
                                                                    .sharedElement(
                                                                        sharedContentState = rememberSharedContentState(
                                                                            key = "bracket-card-${oppositeMatch.match.id}"
                                                                        ),
                                                                        animatedVisibilityScope = this@AnimatedContent,
                                                                        boundsTransform = { _, _ ->
                                                                            tween(
                                                                                durationMillis = BRACKET_LAYOUT_ANIMATION_MS,
                                                                                easing = FastOutSlowInEasing
                                                                            )
                                                                        },
                                                                    ),
                                                                showEventOfficialNames = showEventOfficialNames,
                                                                limitOfficialsToCurrentUser = limitOfficialsToCurrentUser,
                                                                manageMode = isEditingMatches,
                                                            )
                                                        }
                                                    }
                                                } else {
                                                    Column(
                                                        modifier = Modifier.fillMaxHeight(),
                                                        horizontalAlignment = Alignment.CenterHorizontally,
                                                        verticalArrangement = Arrangement.SpaceAround,
                                                    ) {
                                                        resolvedMatches.forEach { displayMatch ->
                                                            Box(
                                                                modifier = Modifier
                                                                    .height(cardHeight.dp)
                                                                    .width(cardWidthDp)
                                                            ) {
                                                                if (displayMatch != null) {
                                                                    MatchCard(
                                                                        match = displayMatch,
                                                                        onClick = {
                                                                            if (isEditingMatches) {
                                                                                onEditMatch?.invoke(displayMatch)
                                                                            } else {
                                                                                onMatchClick(displayMatch)
                                                                            }
                                                                        },
                                                                        modifier = Modifier
                                                                            .height(cardHeight.dp)
                                                                            .width(cardWidthDp)
                                                                            .sharedElement(
                                                                                sharedContentState = rememberSharedContentState(
                                                                                    key = "bracket-card-${displayMatch.match.id}"
                                                                                ),
                                                                                animatedVisibilityScope = this@AnimatedContent,
                                                                                boundsTransform = { _, _ ->
                                                                                    tween(
                                                                                        durationMillis = BRACKET_LAYOUT_ANIMATION_MS,
                                                                                        easing = FastOutSlowInEasing
                                                                                    )
                                                                                },
                                                                            ),
                                                                        showEventOfficialNames = showEventOfficialNames,
                                                                        limitOfficialsToCurrentUser = limitOfficialsToCurrentUser,
                                                                        manageMode = isEditingMatches,
                                                                    )
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    PairConnectorCanvas(
                                        matches = filteredMatches,
                                        enabled = showOutgoingConnectors,
                                        modifier = Modifier.fillMaxHeight(),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PairConnectorCanvas(
    matches: List<MatchWithRelations?>,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    val lineColor = MaterialTheme.colorScheme.onSurfaceVariant
    val connectorWidth = if (enabled) BRACKET_CONNECTOR_WIDTH else 0.dp
    Canvas(
        modifier = modifier.width(connectorWidth)
    ) {
        if (!enabled) {
            return@Canvas
        }
        val strokeWidthPx = BRACKET_CONNECTOR_STROKE.toPx()
        val startX = 0f
        val joinX = size.width * 0.55f
        val tipX = size.width - (strokeWidthPx / 2f)

        when (matches.size) {
            2 -> {
                val topY = size.height * 0.25f
                val bottomY = size.height * 0.75f
                val topVisible = matches[0] != null
                val bottomVisible = matches[1] != null

                when {
                    topVisible && bottomVisible -> {
                        val middleY = (topY + bottomY) / 2f
                        drawLine(
                            color = lineColor,
                            start = Offset(startX, topY),
                            end = Offset(joinX, topY),
                            strokeWidth = strokeWidthPx,
                            cap = StrokeCap.Round,
                        )
                        drawLine(
                            color = lineColor,
                            start = Offset(startX, bottomY),
                            end = Offset(joinX, bottomY),
                            strokeWidth = strokeWidthPx,
                            cap = StrokeCap.Round,
                        )
                        drawLine(
                            color = lineColor,
                            start = Offset(joinX, topY),
                            end = Offset(joinX, bottomY),
                            strokeWidth = strokeWidthPx,
                            cap = StrokeCap.Round,
                        )
                        drawLine(
                            color = lineColor,
                            start = Offset(joinX, middleY),
                            end = Offset(tipX, middleY),
                            strokeWidth = strokeWidthPx,
                            cap = StrokeCap.Round,
                        )
                    }

                    topVisible || bottomVisible -> {
                        val y = if (topVisible) topY else bottomY
                        drawLine(
                            color = lineColor,
                            start = Offset(startX, y),
                            end = Offset(tipX, y),
                            strokeWidth = strokeWidthPx,
                            cap = StrokeCap.Round,
                        )
                    }
                }
            }

            1 -> {
                if (matches[0] != null) {
                    val centerY = size.height / 2f
                    drawLine(
                        color = lineColor,
                        start = Offset(startX, centerY),
                        end = Offset(tipX, centerY),
                        strokeWidth = strokeWidthPx,
                        cap = StrokeCap.Round,
                    )
                }
            }
        }
    }
}
