package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.util.toTitleCase


@Composable
fun SearchPlayerDialog(
    freeAgents: List<UserData>,
    friends: List<UserData>,
    onSearch: (query: String) -> Unit,
    onPlayerSelected: (UserData) -> Unit,
    onDismiss: () -> Unit,
    suggestions: List<UserData>,
    eventName: String
) {
    var searchQuery by remember { mutableStateOf("") }
    var showSearchOverlay by remember { mutableStateOf(false) }
    var searchBoxPosition by remember { mutableStateOf(Offset.Zero) }
    var searchBoxSize by remember { mutableStateOf(IntSize.Zero) }

    Dialog(
        onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f))
                .padding(16.dp)
        ) {
            Card(
                modifier = Modifier.fillMaxWidth().align(Alignment.TopCenter),
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Add User", style = MaterialTheme.typography.titleLarge
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    SearchBox(
                        placeholder = "Search Players",
                        filter = false,
                        onChange = { newQuery ->
                            searchQuery = newQuery
                            onSearch(newQuery)
                        },
                        onSearch = { searchQuery = it },
                        modifier = Modifier,
                        onFocusChange = { isFocused ->
                            if (isFocused) {
                                showSearchOverlay = true
                            } else if (searchQuery.isEmpty()) {
                                showSearchOverlay = false
                            }
                        },
                        onPositionChange = { position, size ->
                            searchBoxPosition = position
                            searchBoxSize = size
                        }
                    )
                }
            }
            SearchOverlay(
                isVisible = showSearchOverlay,
                searchQuery = searchQuery,
                searchBoxPosition = searchBoxPosition,
                searchBoxSize = searchBoxSize,
                onDismiss = {
                    showSearchOverlay = false
                },
                initial = {
                    LazyColumn {
                        if (freeAgents.isNotEmpty()) {
                            item {
                                Card(
                                    Modifier
                                        .padding(vertical = 4.dp, horizontal = 8.dp)
                                        .fillMaxWidth()
                                ) {
                                    Text(
                                        text = "Free Agents of $eventName",
                                        modifier = Modifier.padding(8.dp),
                                        overflow = TextOverflow.Ellipsis,
                                        maxLines = 1,
                                        style = MaterialTheme.typography.bodyLarge
                                    )
                                }
                            }
                            items(freeAgents) { player ->
                                Row(modifier = Modifier.fillMaxWidth().clickable {
                                    onPlayerSelected(player)
                                    onDismiss()
                                }.padding(8.dp)) {
                                    PlayerCard(player)
                                }
                            }
                        }
                        if (friends.isNotEmpty()) {
                            item {
                                Card(
                                    Modifier
                                        .padding(vertical = 4.dp, horizontal = 8.dp)
                                        .fillMaxWidth()
                                ) {
                                    Text(
                                        text = "Friends",
                                        modifier = Modifier.padding(8.dp),
                                        overflow = TextOverflow.Ellipsis,
                                        maxLines = 1,
                                        style = MaterialTheme.typography.bodyLarge
                                    )
                                }
                            }
                            items(friends) { friend ->
                                Row(modifier = Modifier.fillMaxWidth().clickable {
                                    onPlayerSelected(friend)
                                    onDismiss()
                                }.padding(8.dp)) {
                                    PlayerCard(friend)
                                }
                            }
                        }
                    }
                },
                suggestions = {
                    LazyColumn {
                        items(suggestions) { player ->
                            Row(modifier = Modifier.fillMaxWidth().clickable {
                                onPlayerSelected(player)
                                onDismiss()
                            }.padding(8.dp)) {
                                PlayerCard(player)
                            }
                        }
                    }
                }
            )
        }
    }
}