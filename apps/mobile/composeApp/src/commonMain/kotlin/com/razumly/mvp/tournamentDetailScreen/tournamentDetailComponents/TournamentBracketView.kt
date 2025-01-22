package com.razumly.mvp.tournamentDetailScreen.tournamentDetailComponents

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.core.util.ceilDiv
import com.razumly.mvp.tournamentDetailScreen.LocalTournamentComponent

@Composable
fun TournamentBracketView(
    losersBracket: Boolean,
    nestedScrollConnection: NestedScrollConnection,
    onMatchClick: (MatchWithRelations) -> Unit = {},
) {
    val component = LocalTournamentComponent.current
    val roundsList by component.rounds.collectAsState()

    val lazyRowState = rememberLazyListState()
    val columnScrollState = rememberScrollState()
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
                boxHeight.value = maxHeightInRowDp.value
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(columnScrollState)
            .nestedScroll(nestedScrollConnection)
    ) {
        LazyRow(
            state = lazyRowState,
            modifier = Modifier
                .height(boxHeight.value),
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
                        val visible = remember(colIndex, chunkIndex, matches) {
                            mutableStateOf(
                                true
                            )
                        }
                        LaunchedEffect(maxHeightIndex) {
                            snapshotFlow { lazyRowState.firstVisibleItemIndex }.collect {
                                visible.value = matches.filterNotNull().isNotEmpty() ||
                                        maxHeightIndex.intValue == colIndex
                            }
                        }
                        AnimatedVisibility(
                            visible = visible.value,
                            modifier = Modifier.weight(1f),
                            enter = expandVertically(
                                expandFrom = Alignment.Top
                            ),
                            exit = shrinkVertically(
                                shrinkTowards = Alignment.Top
                            )
                        ) {
                            Box(
                                modifier = Modifier.background(MaterialTheme.colorScheme.background),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(
                                    modifier = Modifier.fillMaxHeight(),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.SpaceAround
                                ) {
                                    matches.filterNotNull().forEach { match ->
                                        MatchCard(
                                            match = match,
                                            onClick = { onMatchClick(match) },
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