package com.razumly.mvp.eventDetail.composables

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.util.ceilDiv
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import kotlinx.coroutines.flow.distinctUntilChanged

@Composable
fun TournamentBracketView(
    showFab: (Boolean) -> Unit,
    onMatchClick: (MatchWithRelations) -> Unit = {},
    isEditingMatches: Boolean = false,
    editableMatches: List<MatchWithRelations> = emptyList(),
    onEditMatch: ((MatchWithRelations) -> Unit)? = null,
) {
    val component = LocalTournamentComponent.current
    val losersBracket by component.losersBracket.collectAsState()
    val roundsList by component.rounds.collectAsState()
    val editableRounds by component.editableRounds.collectAsState()
    val columnScrollState = rememberScrollState()
    val displayRounds = if (isEditingMatches) {
        editableRounds
    } else {
        roundsList
    }
    val lazyRowState = rememberLazyListState()
    var maxHeightInRowDp by remember { mutableStateOf(Dp.Unspecified) }
    val columnHeight by animateDpAsState(
        targetValue = maxHeightInRowDp, label = "Column Height"
    )
    val cardHeight = 90
    val cardPadding = 64
    val cardContainerHeight = cardHeight + cardPadding
    var boxHeight by remember { mutableStateOf(Dp.Unspecified) }
    val width = getScreenWidth() / 1.5
    val cardWidthDp = width.dp
    var maxHeightIndex by remember { mutableIntStateOf(0) }
    val navBarPadding = LocalNavBarPadding.current.calculateBottomPadding()
    var prevColumnScroll by remember { mutableStateOf(columnScrollState.value) }
    var isScrollingUp by remember { mutableStateOf(true) }
    val isScrollingLeft by lazyRowState.isScrollingUp()

    LaunchedEffect(columnScrollState) {
        snapshotFlow { columnScrollState.value }.distinctUntilChanged().collect { currentScroll ->
            isScrollingUp = currentScroll <= prevColumnScroll
            prevColumnScroll = currentScroll
        }
    }

    LaunchedEffect(isScrollingUp) {
        showFab(isScrollingUp)
    }

    LaunchedEffect(isScrollingLeft) {
        showFab(isScrollingLeft)
    }

    LaunchedEffect(lazyRowState, roundsList, losersBracket) {
        // Function to calculate height
        fun calculateMaxHeight(index: Int) {
            var maxSize = 0
            val itemsInViewCount =
                lazyRowState.layoutInfo.visibleItemsInfo.size.takeIf { it > 0 } ?: roundsList.size
            val lastItemInViewIndex =
                (index + itemsInViewCount - 1).coerceAtMost(roundsList.size - 1)

            if (roundsList.isNotEmpty() && index < roundsList.size) {
                roundsList.slice(index..lastItemInViewIndex).forEachIndexed { i, round ->
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

                if (boxHeight == Dp.Unspecified || maxHeightInRowDp > boxHeight) {
                    boxHeight = maxHeightInRowDp + navBarPadding + 16.dp
                }
            }
        }

        // Run initial calculation
        calculateMaxHeight(0)

        // Listen for changes
        snapshotFlow { lazyRowState.firstVisibleItemIndex }.collect { index ->
            calculateMaxHeight(index)
        }
    }


    Column(
        Modifier.fillMaxSize().verticalScroll(columnScrollState)
            .background(MaterialTheme.colorScheme.background)
    ) {
        Column(Modifier.fillMaxWidth()) {
            LazyRow(
                state = lazyRowState,
                modifier = Modifier.height(boxHeight).fillMaxWidth(),
            ) {
                itemsIndexed(displayRounds, key = { _, round ->
                    round.filterNotNull().joinToString { it.match.id }
                }) { colIndex, round ->
                    Column(
                        modifier = Modifier.padding(start = 16.dp)
                            .width(intrinsicSize = IntrinsicSize.Max).height(columnHeight),
                        verticalArrangement = Arrangement.SpaceBetween,
                    ) {
                        round.chunked(2).forEachIndexed { chunkIndex, matches ->
                            val filteredMatches = remember(colIndex, maxHeightIndex, lazyRowState) {
                                if (colIndex == 0 || maxHeightIndex == colIndex) {
                                    matches.filterNotNull()
                                } else {
                                    matches
                                }
                            }
                            var visible by remember(colIndex, chunkIndex, matches) {
                                mutableStateOf(
                                    true
                                )
                            }

                            val pairWeight by animateFloatAsState(
                                targetValue = if (visible) 1.0f else 0.01f,
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
                                Column(
                                    modifier = Modifier.fillMaxHeight(),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.SpaceAround
                                ) {
                                    filteredMatches.forEach { match ->
                                        val displayMatch = if (isEditingMatches && editableMatches.isNotEmpty()) {
                                            editableMatches.find { it.match.id == match?.match?.id } ?: match
                                        } else {
                                            match
                                        }

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
                                                        .width(cardWidthDp),
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
        }
    }
}
