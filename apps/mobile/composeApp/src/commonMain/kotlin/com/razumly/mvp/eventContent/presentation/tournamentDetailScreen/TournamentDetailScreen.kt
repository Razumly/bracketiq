package com.razumly.mvp.eventContent.presentation.tournamentDetailScreen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.lazy.LazyListState
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
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.util.ceilDiv
import com.razumly.mvp.eventContent.presentation.TournamentContentComponent
import com.razumly.mvp.eventContent.presentation.tournamentDetailScreen.tournamentDetailComponents.MatchCard
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue

val LocalTournament = compositionLocalOf<Tournament> { error("No tournament provided") }

data class TournamentScreenState(
    val tournament: Tournament? = null,
    val selectedDivision: String? = null,
    val isBracketView: Boolean = false,
    val losersBracket: Boolean = false,
    val divisionMatches: List<MatchWithRelations> = emptyList(),
    val rounds: List<List<MatchWithRelations?>> = emptyList()
)

@Composable
fun TournamentDetailScreen(
    component: TournamentContentComponent
) {
    val tournament by component.selectedTournament.collectAsState()
    val selectedDivision by component.selectedDivision.collectAsState()
    val isBracketView by component.isBracketView.collectAsState()
    val losersBracket by component.losersBracket.collectAsState()
    val divisionMatches by component.divisionMatches.collectAsState()
    val rounds by component.rounds.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        tournament?.let { tournamentData ->
            TournamentHeader(tournamentData)

            DivisionsTabRow(
                divisions = tournamentData.divisions,
                selectedDivision = selectedDivision,
                onDivisionSelected = { component.selectDivision(it) }
            )

            TournamentControls(
                selectedDivision = selectedDivision,
                isBracketView = isBracketView,
                losersBracket = losersBracket,
                onBracketViewToggled = { component.toggleBracketView() },
                onLosersBracketToggled = { component.toggleLosersBracket() }
            )
            val screenState = TournamentScreenState(
                tournament = tournament,
                selectedDivision = selectedDivision,
                isBracketView = isBracketView,
                losersBracket = losersBracket,
                divisionMatches = divisionMatches,
                rounds = rounds
            )

            if (selectedDivision != null) {
                TournamentContent(
                    screenState = screenState,
                    onMatchSelected = { component.matchSelected(it) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}


@Composable
private fun DivisionsTabRow(
    divisions: List<String>,
    selectedDivision: String?,
    onDivisionSelected: (String) -> Unit
) {
    val selectedIndex = divisions.indexOf(selectedDivision).coerceAtLeast(0)

    ScrollableTabRow(
        selectedTabIndex = selectedIndex,
        modifier = Modifier.fillMaxWidth(),
        edgePadding = 0.dp,
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface
    ) {
        divisions.forEach { division ->
            Tab(
                selected = division == selectedDivision,
                onClick = { onDivisionSelected(division) },
                text = {
                    Text(
                        text = division,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            )
        }
    }
}

@Composable
private fun TournamentControls(
    selectedDivision: String?,
    isBracketView: Boolean,
    losersBracket: Boolean,
    onBracketViewToggled: () -> Unit,
    onLosersBracketToggled: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = selectedDivision ?: "Select Division",
            style = MaterialTheme.typography.titleMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Switch(
                checked = losersBracket,
                onCheckedChange = { onLosersBracketToggled() },
                thumbContent = {
                    Icon(
                        imageVector = if (losersBracket) Icons.Default.Delete else Icons.Default.Star,
                        contentDescription = if (losersBracket) "Show Winners" else "Show Losers",
                        modifier = Modifier.size(SwitchDefaults.IconSize)
                    )
                }
            )

            Switch(
                checked = isBracketView,
                onCheckedChange = { onBracketViewToggled() },
                thumbContent = {
                    Icon(
                        imageVector = if (isBracketView)
                            Icons.Default.DateRange
                        else
                            Icons.AutoMirrored.Filled.List,
                        contentDescription = if (isBracketView) "Show List" else "Show Bracket",
                        modifier = Modifier.size(SwitchDefaults.IconSize)
                    )
                }
            )
        }
    }
}

@Composable
private fun TournamentContent(
    screenState: TournamentScreenState,
    onMatchSelected: (MatchMVP) -> Unit,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier) {
        if (screenState.isBracketView) {
            TournamentBracketView(
                roundsList = screenState.rounds,
                losersBracket = screenState.losersBracket,
                onMatchClick = onMatchSelected
            )
        } else {
            TournamentListView(
                matches = screenState.divisionMatches,
                onMatchSelected = onMatchSelected
            )
        }
    }
}


@Composable
fun TournamentHeader(tournament: Tournament) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
            .background(
                color = MaterialTheme.colorScheme.surface,
                shape = MaterialTheme.shapes.medium
            )
            .padding(16.dp)
    ) {
        TournamentTitle(tournament.name)

        if (tournament.description.isNotEmpty()) {
            TournamentDescription(tournament.description)
        }

        TournamentMetadata(
            location = tournament.location,
            startDate = tournament.start,
            endDate = tournament.end
        )
    }
}

@Composable
private fun TournamentTitle(name: String) {
    Text(
        text = name,
        style = MaterialTheme.typography.headlineMedium,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
        color = MaterialTheme.colorScheme.onSurface
    )
}

@Composable
private fun TournamentDescription(description: String) {
    Text(
        text = description,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 8.dp),
        maxLines = 3,
        overflow = TextOverflow.Ellipsis
    )
}

@Composable
private fun TournamentMetadata(
    location: String,
    startDate: Instant,
    endDate: Instant
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        LocationInfo(location)
        DateInfo(startDate, endDate)
    }
}

@Composable
private fun LocationInfo(location: String) {
    Column {
        Text(
            text = "Location",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary
        )
        Text(
            text = location,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(end = 8.dp)
        )
    }
}

@Composable
private fun DateInfo(startDate: Instant, endDate: Instant) {
    Column(horizontalAlignment = Alignment.End) {
        Text(
            text = "Date",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary
        )
        Text(
            text = formatDateRange(startDate, endDate),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}

private fun formatDateRange(startDate: Instant, endDate: Instant): String {
    val timeZone = TimeZone.currentSystemDefault()
    val startLocal = startDate.toLocalDateTime(timeZone)
    val endLocal = endDate.toLocalDateTime(timeZone)

    return buildString {
        // Same year
        if (startLocal.year == endLocal.year) {
            // Same month
            if (startLocal.monthNumber == endLocal.monthNumber) {
                append("${startLocal.dayOfMonth}")
                if (startLocal.dayOfMonth != endLocal.dayOfMonth) {
                    append("-${endLocal.dayOfMonth}")
                }
                append(" ${startLocal.month.name.lowercase().capitalize()}")
            } else {
                append("${startLocal.dayOfMonth} ${startLocal.month.name.lowercase().capitalize()}")
                append(" - ")
                append("${endLocal.dayOfMonth} ${endLocal.month.name.lowercase().capitalize()}")
            }
            append(" ${startLocal.year}")
        } else {
            append("${startLocal.dayOfMonth} ${startLocal.month.name.lowercase().capitalize()} ${startLocal.year}")
            append(" - ")
            append("${endLocal.dayOfMonth} ${endLocal.month.name.lowercase().capitalize()} ${endLocal.year}")
        }
    }
}

private fun String.capitalize(): String {
    return this.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
}


@Composable
fun TournamentListView(
    matches: List<MatchWithRelations>,
    onMatchSelected: (MatchMVP) -> Unit,
    modifier: Modifier = Modifier
) {
    val listState = rememberLazyListState()

    LazyColumn(
        state = listState,
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(
            horizontal = 16.dp,
            vertical = 8.dp
        ),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(
            items = matches,
            key = { it.match.id },
            contentType = { "match" }
        ) { match ->
            MatchListItem(
                match = match,
                onMatchSelected = onMatchSelected
            )
        }
    }
}

@Composable
private fun MatchListItem(
    match: MatchWithRelations,
    onMatchSelected: (MatchMVP) -> Unit
) {
    val cardColors = CardDefaults.cardColors(
        containerColor = if (match.match.losersBracket) {
            MaterialTheme.colorScheme.tertiaryContainer
        } else {
            MaterialTheme.colorScheme.primaryContainer
        },
        contentColor = if (match.match.losersBracket) {
            MaterialTheme.colorScheme.onTertiaryContainer
        } else {
            MaterialTheme.colorScheme.onPrimaryContainer
        }
    )

    MatchCard(
        match = match,
        onMatchSelected = onMatchSelected,
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize(),
        cardColors = cardColors
    )
}



private data class BracketViewState(
    val maxHeightInRowDp: Dp = Dp.Unspecified,
    val boxHeight: Dp = Dp.Unspecified,
    val maxHeightIndex: Int = 0
)

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun TournamentBracketView(
    roundsList: List<List<MatchWithRelations?>>,
    losersBracket: Boolean,
    onMatchClick: (MatchMVP) -> Unit = {}
) {
    val lazyRowState = rememberLazyListState()
    val columnScrollState = rememberScrollState()
    val viewState = rememberBracketViewState(roundsList, losersBracket, lazyRowState)

    BoxWithConstraints(
        modifier = Modifier.fillMaxSize()
    ) {
        // Calculate card width based on available container width
        val cardWidth = maxWidth.coerceAtMost(400.dp)

        Box(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(columnScrollState)
        ) {
            LazyRow(
                state = lazyRowState,
                modifier = Modifier.height(viewState.boxHeight)
            ) {
                itemsIndexed(
                    items = roundsList,
                    key = { _, round -> round.filterNotNull().joinToString { it.match.id } }
                ) { colIndex, round ->
                    BracketColumn(
                        round = round,
                        colIndex = colIndex,
                        maxHeightIndex = viewState.maxHeightIndex,
                        columnHeight = viewState.maxHeightInRowDp,
                        width = cardWidth,
                        losersBracket = losersBracket,
                        onMatchClick = onMatchClick,
                        lazyRowState = lazyRowState
                    )
                }
            }
        }
    }
}



@Composable
private fun rememberBracketViewState(
    roundsList: List<List<MatchWithRelations?>>,
    losersBracket: Boolean,
    lazyRowState: LazyListState
): BracketViewState {
    val cardHeight = 60
    val cardPadding = 20
    val cardContainerHeight = cardHeight + cardPadding

    val viewState = remember { mutableStateOf(BracketViewState()) }

    LaunchedEffect(lazyRowState, roundsList, losersBracket) {
        snapshotFlow { lazyRowState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect { index ->
                val itemsInViewCount = lazyRowState.layoutInfo.visibleItemsInfo.size
                val lastItemInViewIndex = (index + itemsInViewCount - 1)
                    .coerceAtMost(roundsList.lastIndex)

                calculateMaxHeight(
                    roundsList = roundsList,
                    startIndex = index,
                    endIndex = lastItemInViewIndex,
                    losersBracket = losersBracket,
                    cardContainerHeight = cardContainerHeight,
                    currentState = viewState.value
                )?.let { newState ->
                    viewState.value = newState
                }
            }
    }

    return viewState.value
}

@Composable
private fun BracketColumn(
    round: List<MatchWithRelations?>,
    colIndex: Int,
    maxHeightIndex: Int,
    columnHeight: Dp,
    width: Dp,
    losersBracket: Boolean,
    onMatchClick: (MatchMVP) -> Unit,
    lazyRowState: LazyListState
) {
    Column(
        modifier = Modifier
            .padding(start = 16.dp)
            .width(IntrinsicSize.Max)
            .height(columnHeight),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        round.chunked(2).forEachIndexed { chunkIndex, matches ->
            BracketChunk(
                matches = matches,
                colIndex = colIndex,
                chunkIndex = chunkIndex,
                maxHeightIndex = maxHeightIndex,
                width = width,
                losersBracket = losersBracket,
                onMatchClick = onMatchClick,
                lazyRowState = lazyRowState
            )
        }
    }
}

@Composable
private fun BracketChunk(
    matches: List<MatchWithRelations?>,
    colIndex: Int,
    chunkIndex: Int,
    maxHeightIndex: Int,
    width: Dp,
    losersBracket: Boolean,
    onMatchClick: (MatchMVP) -> Unit,
    lazyRowState: LazyListState
) {
    val visible = remember(colIndex, chunkIndex, matches) {
        mutableStateOf(true)
    }

    LaunchedEffect(maxHeightIndex) {
        snapshotFlow { lazyRowState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect {
                visible.value = matches.filterNotNull().isNotEmpty() ||
                        maxHeightIndex == colIndex
            }
    }

    Column(modifier = Modifier.fillMaxHeight()) {
        AnimatedVisibility(
            visible = visible.value,
            modifier = Modifier.weight(1f),
            enter = expandVertically(expandFrom = Alignment.Top),
            exit = shrinkVertically(shrinkTowards = Alignment.Top)
        ) {
            BracketMatchCards(
                matches = matches,
                width = width,
                losersBracket = losersBracket,
                onMatchClick = onMatchClick
            )
        }
    }
}


@Composable
private fun BracketMatchCards(
    matches: List<MatchWithRelations?>,
    width: Dp,
    losersBracket: Boolean,
    onMatchClick: (MatchMVP) -> Unit
) {
    Box(
        modifier = Modifier.fillMaxHeight(),
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
                    onMatchSelected = onMatchClick,
                    modifier = Modifier
                        .height(60.dp)
                        .width(width),
                    cardColors = CardDefaults.cardColors(
                        containerColor = if (match.match.losersBracket == losersBracket) {
                            MaterialTheme.colorScheme.tertiaryContainer
                        } else {
                            MaterialTheme.colorScheme.surface
                        },
                        contentColor = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                )
            }
        }
    }
}



private fun calculateMaxHeight(
    roundsList: List<List<MatchWithRelations?>>,
    startIndex: Int,
    endIndex: Int,
    losersBracket: Boolean,
    cardContainerHeight: Int,
    currentState: BracketViewState
): BracketViewState? {
    var maxSize = 0
    var maxHeightIndex = currentState.maxHeightIndex

    roundsList.slice(startIndex..endIndex).forEachIndexed { i, round ->
        val notNullSize = round.filterNotNull().size
        val halfSize = round.size.ceilDiv(2)

        if (notNullSize > halfSize || (losersBracket && i == 0) ||
            (startIndex != 0 && notNullSize == halfSize)) {
            if (round.size > maxSize) {
                maxSize = round.size
                maxHeightIndex = startIndex + i
            }
        } else if (notNullSize > maxSize) {
            maxSize = notNullSize
            maxHeightIndex = startIndex + i
        }
    }

    val newMaxHeight = maxSize.dp * cardContainerHeight
    val newBoxHeight = if (currentState.boxHeight == Dp.Unspecified ||
        newMaxHeight > currentState.boxHeight) {
        newMaxHeight
    } else {
        currentState.boxHeight
    }

    return if (newMaxHeight != currentState.maxHeightInRowDp ||
        newBoxHeight != currentState.boxHeight ||
        maxHeightIndex != currentState.maxHeightIndex) {
        currentState.copy(
            maxHeightInRowDp = newMaxHeight,
            boxHeight = newBoxHeight,
            maxHeightIndex = maxHeightIndex
        )
    } else null
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