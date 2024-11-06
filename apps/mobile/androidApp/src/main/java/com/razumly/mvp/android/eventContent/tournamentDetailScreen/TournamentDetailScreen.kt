import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.Icon
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.razumly.mvp.android.eventContent.tournamentDetailComponents.MatchCard
import com.razumly.mvp.core.data.dataTypes.Match
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.eventContent.presentation.TournamentContentViewModel
import org.koin.compose.viewmodel.koinNavViewModel
import org.koin.core.annotation.KoinExperimentalAPI

@OptIn(KoinExperimentalAPI::class)
@Composable
fun TournamentDetailScreen(
    tournamentId: String,
    modifier: Modifier = Modifier,
    onNavToListScreen: () -> Unit = {}
) {
    val viewModel = koinNavViewModel<TournamentContentViewModel>()
    LaunchedEffect(Unit) {
        viewModel.loadTournament(tournamentId)
    }
    val tournament by viewModel.selectedTournament.collectAsStateWithLifecycle()
    val selectedDivision by viewModel.selectedDivision.collectAsStateWithLifecycle()
    val isBracketView by viewModel.isBracketView.collectAsStateWithLifecycle()
    val divisionMatches by viewModel.currentMatches.collectAsStateWithLifecycle()
    val roundsList by viewModel.rounds.collectAsStateWithLifecycle()

    Column(modifier = modifier.fillMaxSize()) {
        // Tournament Header
        tournament?.let { TournamentHeader(it) }

        // Division Tabs
        tournament?.divisions?.indexOf(selectedDivision)?.let {
            ScrollableTabRow(
                selectedTabIndex = it.coerceAtLeast(0),
                modifier = Modifier.fillMaxWidth(),
                edgePadding = 0.dp
            ) {
                tournament!!.divisions.forEach { division ->
                    Tab(
                        selected = division == selectedDivision,
                        onClick = { viewModel.selectDivision(division) },
                        text = { Text(division) }
                    )
                }
            }
        }

        // View Toggle
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
                checked = isBracketView,
                onCheckedChange = { viewModel.toggleBracketView() },
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

        // Content
        if (selectedDivision != null && tournament != null) {
            if (isBracketView) {
                TournamentBracketView(roundsList)
            } else {
                TournamentListView(
                    divisionMatches = divisionMatches,
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun TournamentHeader(tournament: Tournament) {
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
                    text = "${tournament.start.date} - ${tournament.end.date}",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}

@Composable
private fun TournamentListView(
    divisionMatches: List<Match?>,
    modifier: Modifier = Modifier
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
                    match = match,
                    onClick = { },
                )
            }
        }
    }
}

@Composable
fun TournamentBracketView(roundsList: List<List<Match?>>) {
    val lazyRowState = rememberLazyListState()
    val currentIndex = remember { mutableIntStateOf(0) }
    val columnScrollState = rememberScrollState()
    val maxHeightInRowDp = remember { mutableStateOf(Dp.Unspecified) }
    val columnHeight by animateDpAsState(
        targetValue = maxHeightInRowDp.value,
        label = "Column Height"
    )
    val localConfig = LocalConfiguration.current
    val cardHeight = 60
    val cardPadding = 20
    val cardContainerHeight = cardHeight + cardPadding
    val boxHeight = remember { mutableStateOf(Dp.Unspecified) }
    val width = localConfig.screenWidthDp / 1.5

    LaunchedEffect(lazyRowState) {
        snapshotFlow { lazyRowState.firstVisibleItemIndex }
            .collect { index ->
                currentIndex.intValue = index
                maxHeightInRowDp.value = if (roundsList[index].size > roundsList[index + 1].size) {
                    roundsList[index].filterNotNull().size.dp * cardContainerHeight
                } else {
                    roundsList[index + 1].size.dp * cardContainerHeight
                }
                if (boxHeight.value == Dp.Unspecified) {
                    boxHeight.value = maxHeightInRowDp.value
                }
            }
    }

    // Track visible items to calculate max height
    Box(
        modifier = Modifier
            .height(boxHeight.value)
            .verticalScroll(columnScrollState)
    ) {
        LazyRow(
            state = lazyRowState,
            modifier = Modifier
                .fillMaxHeight(),
        ) {
            items(roundsList) { round ->
                Column(
                    modifier = Modifier
                        .padding(start = 16.dp)
                        .fillMaxHeight()
                        .width(intrinsicSize = IntrinsicSize.Max)
                        .height(columnHeight),
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    round.chunked(2).forEach { matches ->
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight(),
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
                                        onClick = { },
                                        modifier = Modifier
                                            .height(cardHeight.dp)
                                            .width(width.dp)
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

@Preview
@Composable
fun PreviewTournamentDetailScreenView() {
    TournamentDetailScreen("", modifier = Modifier, onNavToListScreen = {})
}