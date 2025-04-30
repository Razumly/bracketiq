package com.razumly.mvp.eventSearch

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FabPosition
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.EventCard
import com.razumly.mvp.core.presentation.composables.SearchBox
import com.razumly.mvp.core.presentation.util.CircularRevealShape
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.home.LocalNavBarPadding
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun EventSearchScreen(
    component: DefaultSearchEventListComponent,
    mapComponent: MapComponent,
) {
    val events by component.events.collectAsState()
    val showMapCard by component.showMapCard.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val hazeState = remember { HazeState() }
    val offsetNavPadding =
        PaddingValues(bottom = LocalNavBarPadding.current.calculateBottomPadding().plus(32.dp))
    val lazyListState = rememberLazyListState()
    var fabOffset by remember { mutableStateOf(Offset.Zero) }
    var revealCenter by remember { mutableStateOf(Offset.Zero) }
    val suggestions by component.suggestedEvents.collectAsState()

    val animationProgress by animateFloatAsState(
        targetValue = if (showMapCard) 1f else 0f, animationSpec = tween(durationMillis = 1000)
    )

    Box {
        BindLocationTrackerEffect(component.locationTracker)
        Scaffold(
            topBar = {
                Column(
                    modifier = Modifier.wrapContentSize().hazeEffect(
                        hazeState, HazeMaterials.ultraThin(NavigationBarDefaults.containerColor)
                    ).statusBarsPadding()
                ) {
                    SearchBox(placeholder = "Search for Events",
                        filter = true,
                        onChange = { query -> component.suggestEvents(query) },
                        onSearch = {},
                        initialList = { },
                        suggestions = {
                            LazyColumn {
                            items(suggestions) { event ->
                                Card(
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                                        .clickable(onClick = {
                                            component.viewEvent(event)
                                        }).fillMaxWidth(),
                                    elevation = CardDefaults.cardElevation(4.dp),
                                    shape = RoundedCornerShape(12.dp),
                                ) {
                                    EventCard(event,
                                        {},
                                        Modifier.padding(8.dp),
                                        navPadding = PaddingValues(bottom = 16.dp),
                                        onMapClick = { offset ->
                                            revealCenter = offset
                                            component.onMapClick(event)
                                        },
                                    )
                                }
                            }
                        } })
                }
            },
            floatingActionButton = {
                AnimatedVisibility(visible = lazyListState.isScrollingUp().value || showMapCard,
                    enter = (slideInVertically { it / 2 } + fadeIn()),
                    exit = (slideOutVertically { it / 2 } + fadeOut())) {
                    Button(onClick = {
                        revealCenter = fabOffset
                        component.onMapClick()
                    },
                        modifier = Modifier.padding(offsetNavPadding)
                            .onGloballyPositioned { layoutCoordinates ->
                                val boundsInWindow = layoutCoordinates.boundsInWindow()
                                fabOffset = boundsInWindow.center
                            },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.Black, contentColor = Color.White
                        )
                    ) {
                        val text = if (showMapCard) "List" else "Map"
                        val icon =
                            if (showMapCard) Icons.AutoMirrored.Filled.List else Icons.Default.Place
                        Text(text)
                        Icon(icon, contentDescription = "$text Button")
                    }
                }
            },
            floatingActionButtonPosition = FabPosition.Center,
        ) { paddingValues ->
            val firstElementPadding = PaddingValues(top = paddingValues.calculateTopPadding())
            Box(
                Modifier.hazeSource(hazeState).fillMaxSize()
            ) {
                EventList(
                    component,
                    events.map { it },
                    firstElementPadding,
                    offsetNavPadding,
                    lazyListState,
                ) { offset ->
                    revealCenter = offset
                }
                EventMap(
                    component = mapComponent,
                    onEventSelected = { event ->
                        component.viewEvent(event)
                    },
                    onPlaceSelected = {},
                    canClickPOI = false,
                    modifier = Modifier.graphicsLayer {
                        alpha = if (animationProgress > 0f) 1f else 0f
                    }.clip(CircularRevealShape(animationProgress, revealCenter)),
                    searchBarPadding = PaddingValues(),
                    focusedLocation = selectedEvent?.let {
                        LatLng(it.lat, it.long)
                    },
                    focusedEvent = null
                )
            }
        }
    }
}