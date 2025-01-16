package com.razumly.mvp.eventContent.presentation.tournamentDetailScreen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.core.util.ceilDiv
import com.razumly.mvp.eventContent.presentation.TournamentContentComponent
import com.razumly.mvp.eventContent.presentation.tournamentDetailScreen.tournamentDetailComponents.MatchCard
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

val LocalTournament = compositionLocalOf<Tournament> { error("No tournament provided") }

@Composable
fun TournamentDetailScreen(
    component: TournamentContentComponent
) {
    val tournament by component.selectedTournament.collectAsState()
    val selectedDivision by component.selectedDivision.collectAsState()
    val isBracketView by component.isBracketView.collectAsState()
    val divisionMatches by component.divisionMatches.collectAsState()
    val roundsList by component.rounds.collectAsState()
    val losersBracket by component.losersBracket.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        tournament?.let { TournamentHeader(it) }

        tournament?.divisions?.indexOf(selectedDivision)?.let {
            ScrollableTabRow(
                selectedTabIndex = it.coerceAtLeast(0),
                modifier = Modifier.fillMaxWidth(),
                edgePadding = 0.dp
            ) {
                tournament!!.divisions.forEach { division ->
                    Tab(
                        selected = division == selectedDivision,
                        onClick = { component.selectDivision(division) },
                        text = { Text(division) }
                    )
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = selectedDivision ?: "Select Division",
                style = MaterialTheme.typography.titleMedium
            )
            Switch(
                checked = losersBracket,
                onCheckedChange = { component.toggleLosersBracket() },
                thumbContent = {
                    Icon(
                        imageVector = if (losersBracket)
                            Icons.Default.Delete
                        else
                            Icons.Default.Star,
                        contentDescription = null,
                        modifier = Modifier.size(SwitchDefaults.IconSize)
                    )
                })

            Switch(
                checked = isBracketView,
                onCheckedChange = { component.toggleBracketView() },
                thumbContent = {
                    Icon(
                        imageVector = if (isBracketView)
                            Icons.Default.DateRange
                        else
                            Icons.AutoMirrored.Filled.List,
                        contentDescription = null,
                        modifier = Modifier.size(SwitchDefaults.IconSize)
                    )
                }
            )
        }


        if (selectedDivision != null && tournament != null) {
            CompositionLocalProvider(LocalTournament provides tournament!!) {
                if (isBracketView) {
                    TournamentBracketView(component, roundsList, losersBracket) { match ->
                        component.matchSelected(match)
                    }
                } else {
                    TournamentListView(
                        component,
                        divisionMatches,
                        Modifier.weight(1f)
                    ) { match ->
                        component.matchSelected(match)
                    }
                }
            }
        }
    }
}

@Composable
fun TournamentHeader(tournament: Tournament) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Text(
            text = tournament.name,
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = tournament.description,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(vertical = 8.dp)
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    text = "Location",
                    style = MaterialTheme.typography.labelMedium
                )
                Text(
                    text = tournament.location,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            Column {
                Text(
                    text = "Date",
                    style = MaterialTheme.typography.labelMedium
                )
                Text(
                    text = "${tournament.start.toLocalDateTime(TimeZone.UTC)} - ${
                        tournament.end.toLocalDateTime(
                            TimeZone.UTC
                        )
                    }",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}

@Composable
private fun TournamentListView(
    component: TournamentContentComponent,
    divisionMatches: List<MatchWithRelations?>,
    modifier: Modifier = Modifier,
    onMatchClick: (MatchWithRelations) -> Unit,
) {
    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Filter matches by division and sort by round/position

        items(divisionMatches) { match ->
            if (match != null) {
                MatchCard(
                    component = component,
                    match = match,
                    onClick = { onMatchClick(match) },
                    losersBracket = false

//                    cardColors = CardColors(
//                        MaterialTheme.colorScheme.primaryContainer,
//                        MaterialTheme.colorScheme.onPrimaryContainer,
//                        MaterialTheme.colorScheme.tertiaryContainer,
//                        MaterialTheme.colorScheme.onTertiaryContainer
//                    )
                )
            }
        }
    }
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun TournamentBracketView(
    component: TournamentContentComponent,
    roundsList: List<List<MatchWithRelations?>>,
    losersBracket: Boolean,
    onMatchClick: (MatchWithRelations) -> Unit = {}
) {
    val lazyRowState = rememberLazyListState()
    val columnScrollState = rememberScrollState()
    val maxHeightInRowDp = remember { mutableStateOf(Dp.Unspecified) }
    val columnHeight by animateDpAsState(
        targetValue = maxHeightInRowDp.value,
        label = "Column Height"
    )
    val cardHeight = 120
    val cardPadding = 20
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
                                            component,
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

//
//@Preview
//@Composable
//fun PreviewBracket() {
//    val matches = listOf(
//        listOf(
//            MatchWithRelations(
//                match = MatchMVP(
//                    matchNumber = 1,
//                    team1 = null,
//                    team2 = null,
//                    tournamentId = "id0sjf0",
//                    refId = null,
//                    field = null,
//                    start = Instant.DISTANT_PAST,
//                    end = null,
//                    division = "null",
//                    team1Points = listOf(0, 0, 0),
//                    team2Points = listOf(0, 0, 0),
//                    losersBracket = false,
//                    winnerNextMatchId = null,
//                    loserNextMatchId = null,
//                    previousLeftMatchId = null,
//                    previousRightMatchId = null,
//                    setResults = listOf(0, 0, 0),
//                    refCheckedIn = false,
//                    id = "sdofoe0h08"
//                ),
//                team1 = null,
//                team2 = null,
//                ref = null,
//                field = null,
//                winnerNextMatch = null,
//                loserNextMatch = null,
//                previousLeftMatch = null,
//                previousRightMatch = null
//            ), MatchWithRelations(
//                match = MatchMVP(
//                    matchNumber = 1,
//                    team1 = null,
//                    team2 = null,
//                    tournamentId = "id0sjf0",
//                    refId = null,
//                    field = null,
//                    start = Instant.DISTANT_PAST,
//                    end = null,
//                    division = "null",
//                    team1Points = listOf(0, 0, 0),
//                    team2Points = listOf(0, 0, 0),
//                    losersBracket = false,
//                    winnerNextMatchId = null,
//                    loserNextMatchId = null,
//                    previousLeftMatchId = null,
//                    previousRightMatchId = null,
//                    setResults = listOf(0, 0, 0),
//                    refCheckedIn = false,
//                    id = "sdofoe0h08"
//                ),
//                team1 = null,
//                team2 = null,
//                ref = null,
//                field = null,
//                winnerNextMatch = null,
//                loserNextMatch = null,
//                previousLeftMatch = null,
//                previousRightMatch = null
//            ), MatchWithRelations(
//                match = MatchMVP(
//                    matchNumber = 1,
//                    team1 = null,
//                    team2 = null,
//                    tournamentId = "id0sjf0",
//                    refId = null,
//                    field = null,
//                    start = Instant.DISTANT_PAST,
//                    end = null,
//                    division = "null",
//                    team1Points = listOf(0, 0, 0),
//                    team2Points = listOf(0, 0, 0),
//                    losersBracket = false,
//                    winnerNextMatchId = null,
//                    loserNextMatchId = null,
//                    previousLeftMatchId = null,
//                    previousRightMatchId = null,
//                    setResults = listOf(0, 0, 0),
//                    refCheckedIn = false,
//                    id = "sdofoe0h08"
//                ),
//                team1 = null,
//                team2 = null,
//                ref = null,
//                field = null,
//                winnerNextMatch = null,
//                loserNextMatch = null,
//                previousLeftMatch = null,
//                previousRightMatch = null
//            ), MatchWithRelations(
//                match = MatchMVP(
//                    matchNumber = 1,
//                    team1 = null,
//                    team2 = null,
//                    tournamentId = "id0sjf0",
//                    refId = null,
//                    field = null,
//                    start = Instant.DISTANT_PAST,
//                    end = null,
//                    division = "null",
//                    team1Points = listOf(0, 0, 0),
//                    team2Points = listOf(0, 0, 0),
//                    losersBracket = false,
//                    winnerNextMatchId = null,
//                    loserNextMatchId = null,
//                    previousLeftMatchId = null,
//                    previousRightMatchId = null,
//                    setResults = listOf(0, 0, 0),
//                    refCheckedIn = false,
//                    id = "sdofoe0h08"
//                ),
//                team1 = null,
//                team2 = null,
//                ref = null,
//                field = null,
//                winnerNextMatch = null,
//                loserNextMatch = null,
//                previousLeftMatch = null,
//                previousRightMatch = null
//            ), MatchWithRelations(
//                match = MatchMVP(
//                    matchNumber = 1,
//                    team1 = null,
//                    team2 = null,
//                    tournamentId = "id0sjf0",
//                    refId = null,
//                    field = null,
//                    start = Instant.DISTANT_PAST,
//                    end = null,
//                    division = "null",
//                    team1Points = listOf(0, 0, 0),
//                    team2Points = listOf(0, 0, 0),
//                    losersBracket = false,
//                    winnerNextMatchId = null,
//                    loserNextMatchId = null,
//                    previousLeftMatchId = null,
//                    previousRightMatchId = null,
//                    setResults = listOf(0, 0, 0),
//                    refCheckedIn = false,
//                    id = "sdofoe0h08"
//                ),
//                team1 = null,
//                team2 = null,
//                ref = null,
//                field = null,
//                winnerNextMatch = null,
//                loserNextMatch = null,
//                previousLeftMatch = null,
//                previousRightMatch = null
//            ),
//            null,
//            null
//        )
//    )
//
//    TournamentBracketView(matches, false)
//}