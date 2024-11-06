import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.FabPosition
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.razumly.mvp.android.R
import com.razumly.mvp.android.eventSearch.eventList.EventCard
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.eventSearch.presentation.EventSearchViewModel
import org.koin.androidx.compose.navigation.koinNavViewModel

@Composable
fun EventListScreen(onTournamentSelected: (String) -> Unit) {
    val viewModel: EventSearchViewModel = koinNavViewModel()
    val events by viewModel.events.collectAsStateWithLifecycle()

    val selectedEvent = viewModel.selectedEvent.collectAsStateWithLifecycle()

    if (selectedEvent.value != null) {
        val eventId = selectedEvent.value!!.id
        if (selectedEvent.value!!.collectionId == "tournaments") {
            viewModel.selectEvent(null)
            onTournamentSelected(eventId)
        }
    }

    Scaffold(
        floatingActionButton = {
            Button(
                onClick = { },
                modifier = Modifier
                    .padding(16.dp),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    Color.Black,
                    Color.White
                )
            ) {
                Text("Map")
                Icon(Icons.Default.Place, contentDescription = "Map")
            }
        },
        floatingActionButtonPosition = FabPosition.Center
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color.Transparent)
        ) {
            // Category tabs
            ScrollableTabRow(
                selectedTabIndex = 0,
                modifier = Modifier
                    .fillMaxWidth(),
                edgePadding = 0.dp
            ) {
                listOf(
                    "Tournaments",
                    "Beach",
                    "Indoor",
                    "Grass",
                    "Groups"
                ).forEachIndexed { index, title ->
                    Tab(
                        selected = index == 0,
                        onClick = { },
                        text = { Text(title) },
                        icon = {
                            Icon(
                                painter = painterResource(
                                    when (title) {
                                        "Tournaments" -> R.drawable.ic_tournament
                                        "Beach" -> R.drawable.ic_beach
                                        "Indoor" -> R.drawable.ic_indoor
                                        "Grass" -> R.drawable.ic_grass
                                        else -> R.drawable.ic_groups
                                    }
                                ),
                                contentDescription = title
                            )
                        }
                    )
                }
            }

            LazyColumn(
                modifier = Modifier.weight(1f)
            ) {
                items(
                    items = events,
                    key = { it.id }
                ) { event ->
                    EventCard(
                        event = event,
                        onFavoriteClick = { },
                    )
                }
            }
        }
    }
}