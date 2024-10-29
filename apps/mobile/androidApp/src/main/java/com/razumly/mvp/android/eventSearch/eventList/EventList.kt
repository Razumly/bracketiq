import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.razumly.mvp.android.R
import com.razumly.mvp.android.eventSearch.eventList.EventCard
import com.razumly.mvp.core.presentation.MainViewModel
import com.razumly.mvp.eventSearch.presentation.EventSearchViewModel
import org.koin.androidx.compose.navigation.koinNavViewModel

@Composable
fun EventList(paddingValues: PaddingValues, modifier: Modifier) {
    val viewModel: EventSearchViewModel = koinNavViewModel()
    val events by viewModel.events.collectAsStateWithLifecycle()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(paddingValues)
    ) {
        // Category tabs
        ScrollableTabRow(
            selectedTabIndex = 0,
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.primary)
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
                    onFavoriteClick = { }
                )
            }
        }

        Button(
            onClick = { },
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text("Map")
        }
    }
}