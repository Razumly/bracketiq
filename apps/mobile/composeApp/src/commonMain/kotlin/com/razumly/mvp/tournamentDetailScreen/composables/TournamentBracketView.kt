package com.razumly.mvp.tournamentDetailScreen.composables

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
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
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.core.util.ceilDiv
import com.razumly.mvp.home.LocalNavBarPadding
import com.razumly.mvp.tournamentDetailScreen.LocalTournamentComponent

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun SharedTransitionScope.TournamentBracketView(
    onMatchClick: (MatchWithRelations) -> Unit = {},
) {
    val component = LocalTournamentComponent.current
    val losersBracket by component.losersBracket.collectAsState()
    val roundsList by component.rounds.collectAsState()
    val showDetails by component.showDetails.collectAsState()
    val columnScrollState = rememberScrollState()

    val lazyRowState = rememberLazyListState()
    val maxHeightInRowDp = remember { mutableStateOf(Dp.Unspecified) }
    val columnHeight by animateDpAsState(
        targetValue = maxHeightInRowDp.value,
        label = "Column Height"
    )
    val cardHeight = 90
    val cardPadding = 64
    val cardContainerHeight = cardHeight + cardPadding
    val boxHeight = remember { mutableStateOf(Dp.Unspecified) }
    val width = getScreenWidth() / 1.5
    val maxHeightIndex = remember { mutableIntStateOf(0) }
    val navBarPadding = LocalNavBarPadding.current.calculateBottomPadding()

    LaunchedEffect(lazyRowState, roundsList, losersBracket) {
        snapshotFlow { lazyRowState.firstVisibleItemIndex }.collect { index ->
            var maxSize = 0
            val itemsInViewCount = lazyRowState.layoutInfo.visibleItemsInfo.size
            val lastItemInViewIndex = index + itemsInViewCount - 1
            roundsList.slice(index..lastItemInViewIndex).forEachIndexed { i, round ->
                val notNullSize = round.filterNotNull().size
                val halfSize = round.size.ceilDiv(2)
                if (notNullSize > halfSize || (losersBracket && i == 0) || (index != 0 && notNullSize == halfSize)) {
                    if (round.size > maxSize) {
                        maxSize = round.size
                        maxHeightIndex.intValue = index + i
                    }
                } else {
                    if ((notNullSize) > maxSize) {
                        maxSize = notNullSize
                        maxHeightIndex.intValue = index + i
                    }
                }
            }
            maxHeightInRowDp.value = maxSize.dp * cardContainerHeight
            if (boxHeight.value == Dp.Unspecified || maxHeightInRowDp.value > boxHeight.value) {
                boxHeight.value = maxHeightInRowDp.value + navBarPadding + 16.dp
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(columnScrollState)
            .background(MaterialTheme.colorScheme.background)
    ) {
        Header(component)
        CollapsableHeader(component)
        Column(Modifier.fillMaxWidth()) {
            LazyRow(
                state = lazyRowState,
                modifier = Modifier
                    .height(boxHeight.value)
                    .fillMaxWidth(),
            ) {
                itemsIndexed(roundsList, key = { _, round ->
                    round.filterNotNull().joinToString { it.match.id }
                }) { colIndex, round ->
                    Column(
                        modifier = Modifier
                            .padding(start = 16.dp)
                            .width(intrinsicSize = IntrinsicSize.Max)
                            .height(columnHeight),
                        verticalArrangement = Arrangement.SpaceBetween,
                    ) {
                        round.chunked(2).forEachIndexed { chunkIndex, matches ->
                            val filteredMatches = if (colIndex == 0) {
                                matches.filterNotNull()
                            } else {
                                matches
                            }
                            val visible = remember(colIndex, chunkIndex, matches) {
                                mutableStateOf(
                                    true
                                )
                            }

                            val pairWeight = animateFloatAsState(
                                targetValue = if (visible.value) 1.0f else 0.01f,
                                label = "Card Visibility",
                            )
                            LaunchedEffect(maxHeightIndex) {
                                snapshotFlow { lazyRowState.firstVisibleItemIndex }.collect {
                                    visible.value = (matches.filterNotNull().isNotEmpty() ||
                                            maxHeightIndex.intValue == colIndex)
                                }
                            }
                            Box(
                                modifier = Modifier
                                    .weight(pairWeight.value)
                                    .background(MaterialTheme.colorScheme.background),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxHeight(),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.SpaceAround
                                ) {
                                    filteredMatches.forEach { match ->
                                        MatchCard(
                                            match = match,
                                            onClick = {
                                                if (match != null) {
                                                    onMatchClick(match)
                                                }
                                            },
                                            modifier = Modifier
                                                .height(cardHeight.dp)
                                                .width(width.dp),
                                            losersBracket = losersBracket
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