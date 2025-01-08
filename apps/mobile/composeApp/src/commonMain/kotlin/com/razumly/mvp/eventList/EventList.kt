package com.razumly.mvp.eventList

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FabPosition
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.icons.Beach
import com.razumly.mvp.icons.Grass
import com.razumly.mvp.icons.Groups
import com.razumly.mvp.icons.Indoor
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.Tournament

@Composable
fun EventList(
    events: List<EventAbs>,
    onEventSelected: (EventAbs) -> Unit,
    ) {

    Column(
        modifier = Modifier
            .fillMaxSize()
        // keep your existing bg color or .background(Color.Transparent)
    ) {
        // 1) Glassy Search Bar
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .shadow(8.dp, shape = RoundedCornerShape(24.dp))
                .clip(RoundedCornerShape(24.dp))
                .background(Color.White.copy(alpha = 0.6f)) // or adjust alpha
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Search, contentDescription = "Search")
                Spacer(Modifier.width(8.dp))
                Text("Let’s play?", color = Color.Gray)
                // or a TextField if you want actual input
            }
        }



        Scaffold(
        floatingActionButton = {
            Button(
                onClick = { },
                modifier = Modifier
                    .padding(16.dp),
                colors = ButtonDefaults.buttonColors(
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
            ScrollableTabRow(
                selectedTabIndex = 0,
                modifier = Modifier.fillMaxWidth(),
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
                                when (title) {
                                    "Tournaments" -> MVPIcons.Tournament
                                    "Beach" -> MVPIcons.Beach
                                    "Indoor" -> MVPIcons.Indoor
                                    "Grass" -> MVPIcons.Grass
                                    else -> MVPIcons.Groups
                                },
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
                        modifier = Modifier
                            .clickable { onEventSelected(event) }
                    )
                }
            }
        }
    }
}
}
