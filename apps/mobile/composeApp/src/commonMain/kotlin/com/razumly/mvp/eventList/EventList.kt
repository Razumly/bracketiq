package com.razumly.mvp.eventList

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults.SecondaryIndicator
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.icons.Beach
import com.razumly.mvp.icons.Grass
import com.razumly.mvp.icons.Groups
import com.razumly.mvp.icons.Indoor
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.Tournament

@Composable
fun EventList(
    component: EventListComponent,
    events: List<EventAbs>,
) {
    val backgroundColor = MaterialTheme.colorScheme.background
    val searchBoxColor = MaterialTheme.colorScheme.surface
    val outlineColor = MaterialTheme.colorScheme.outline

    // Track currently selected tab
    var selectedTabIndex by remember { mutableStateOf(0) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundColor)
    ) {
        // Search Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .background(backgroundColor),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .border(1.dp, outlineColor, RoundedCornerShape(24.dp))
                    .background(searchBoxColor, RoundedCornerShape(24.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Search",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Let’s play?",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 0.dp, bottom = 0.dp)
        ) {
            // Tab row with default indicator & bigger vertical space
            val tabs = listOf("Tournaments", "Beach", "Indoor", "Grass", "Groups")

            ScrollableTabRow(
                selectedTabIndex = selectedTabIndex,
                modifier = Modifier
                    .fillMaxWidth()
                    // If you want more space, do .height(56.dp) or add .padding(vertical = X.dp)
                    .height(56.dp),
                edgePadding = 0.dp,
                indicator = { tabPositions ->
                    // Default indicator is easier to see
                    SecondaryIndicator(
                        modifier = Modifier.tabIndicatorOffset(tabPositions[selectedTabIndex]),
                        color = MaterialTheme.colorScheme.primary
                    )
                },
                // Typically, contentColor sets the default color for icons/text
                contentColor = MaterialTheme.colorScheme.onSurface
            ) {
                tabs.forEachIndexed { index, title ->
                    val isSelected = (index == selectedTabIndex)

                    Tab(
                        selected = isSelected,
                        onClick = { selectedTabIndex = index },
                        modifier = Modifier.padding(vertical = 4.dp), // extra vertical space
                        text = {
                            Text(
                                text = title,
                                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
                                color = if (isSelected) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                }
                            )
                        },
                        icon = {
                            Icon(
                                when (title) {
                                    "Tournaments" -> MVPIcons.Tournament
                                    "Beach" -> MVPIcons.Beach
                                    "Indoor" -> MVPIcons.Indoor
                                    "Grass" -> MVPIcons.Grass
                                    else -> MVPIcons.Groups
                                },
                                contentDescription = title,
                                tint = if (isSelected) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                }
                            )
                        }
                    )
                }
            }

            LazyColumn(
                modifier = Modifier.weight(1f)
            ) {
                items(items = events, key = { it.id }) { event ->
                    EventCard(
                        event = event,
                        onFavoriteClick = {},
                        modifier = Modifier.clickable { component.selectEvent(event) }
                    )
                }
            }
        }
    }
}





