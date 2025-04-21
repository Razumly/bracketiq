package com.razumly.mvp.core.presentation.composables

import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import coil3.compose.AsyncImage
import coil3.compose.rememberAsyncImagePainter
import com.kmpalette.color
import com.kmpalette.loader.rememberPainterLoader
import com.kmpalette.onColor
import com.kmpalette.rememberDominantColorState
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.util.CircularRevealShape
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.getScreenHeight
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.teamSizeFormat
import com.razumly.mvp.core.presentation.util.toDivisionCase
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.eventCreate.steps.DateTimePickerDialog
import com.razumly.mvp.eventDetail.EditDetails
import com.razumly.mvp.eventDetail.composables.SelectEventImage
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import dev.chrisbanes.haze.ExperimentalHazeApi
import dev.chrisbanes.haze.HazeInputScale
import dev.chrisbanes.haze.HazeProgressive
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.CupertinoMaterials
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.icerock.moko.geo.LatLng
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime

@OptIn(ExperimentalHazeMaterialsApi::class, ExperimentalHazeApi::class)
@Composable
fun EventDetails(
    mapComponent: MapComponent,
    eventWithRelations: EventAbsWithRelations,
    editEvent: EventAbs,
    onFavoriteClick: () -> Unit,
    favoritesModifier: Modifier,
    navPadding: PaddingValues = PaddingValues(),
    onPlaceSelected: (MVPPlace) -> Unit,
    editView: Boolean,
    onEditEvent: (EventImp.() -> EventImp) -> Unit,
    onEditTournament: (Tournament.() -> Tournament) -> Unit,
    onEditEventComplete: () -> Unit,
    isNewEvent: Boolean,
    onAddCurrentUser: (Boolean) -> Unit,
    onEventTypeSelected: (EventType) -> Unit,
    joinButton: @Composable () -> Unit
) {
    val event = eventWithRelations.event
    val host = eventWithRelations.host
    val hazeState = remember { HazeState() }
    val scrollState = rememberScrollState()
    var isEditing by remember { mutableStateOf(false) }
    var isValid by remember { mutableStateOf(false) }
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
    var revealCenter by remember { mutableStateOf(Offset.Zero) }
    var showMapCard by remember { mutableStateOf(false) }
    var showImageSelector by rememberSaveable { mutableStateOf(false) }
    var selectedPlace by remember { mutableStateOf<MVPPlace?>(null) }

    val animationProgress by animateFloatAsState(
        targetValue = if (showMapCard) 1f else 0f, animationSpec = tween(durationMillis = 1000)
    )

    val painter = rememberAsyncImagePainter(event.imageUrl)
    val painterLoader = rememberPainterLoader()
    val colorState = rememberDominantColorState(loader = painterLoader)
    LaunchedEffect(painter) {
        colorState.updateFrom(painter)
    }

    val primary =
        colorState.result?.paletteOrNull?.vibrantSwatch?.color ?: MaterialTheme.colorScheme.primary
    val secondary =
        colorState.result?.paletteOrNull?.mutedSwatch?.color ?: MaterialTheme.colorScheme.secondary
    val onBackground = colorState.result?.paletteOrNull?.vibrantSwatch?.onColor
        ?: MaterialTheme.colorScheme.background

    val dateRangeText = remember(event.start, event.end) {
        val startDate = event.start.toLocalDateTime(TimeZone.currentSystemDefault()).date
        val endDate = event.end.toLocalDateTime(TimeZone.currentSystemDefault()).date

        val startStr = startDate.format(dateFormat)

        if (startDate != endDate) {
            val endStr = endDate.format(dateFormat)
            "$startStr - $endStr"
        } else {
            startStr
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(scrollState)) {
            Box(Modifier.fillMaxSize()) {
                BackgroundImage(
                    Modifier.matchParentSize().hazeSource(hazeState, key = "BackGround"),
                    if (!isEditing) event.imageUrl else editEvent.imageUrl,
                )

                IconButton(
                    onClick = onFavoriteClick, modifier = favoritesModifier.align(Alignment.TopEnd)
                ) {
                    Icon(
                        painter = rememberVectorPainter(Icons.Default.AddCircle),
                        contentDescription = "Favorite",
                    )
                }

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Spacer(Modifier.height(getScreenHeight().dp / 2))
                    Column(
                        Modifier.fillMaxWidth().hazeEffect(hazeState) {

                            inputScale = HazeInputScale.Fixed(0.5f)
                            style = HazeStyle(
                                backgroundColor = primary,
                                tint = null,
                                blurRadius = 64.dp,
                                noiseFactor = 0f
                            )
                            progressive = HazeProgressive.verticalGradient(
                                easing = LinearOutSlowInEasing,
                                startIntensity = 0f,
                                endIntensity = 1f,
                                startY = 0f,
                                endY = 300f
                            )
                        }.padding(navPadding).padding(horizontal = 16.dp).padding(top = 32.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        if (isEditing) {
                            OutlinedTextField(value = editEvent.name,
                                onValueChange = { onEditEvent { (copy(name = it)) } },
                                label = { Text("Event Name") })
                        } else {
                            Text(
                                text = event.name,
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold,
                                color = onBackground
                            )
                        }
                        Text(
                            text = if (!isEditing) event.location else editEvent.location,
                            style = MaterialTheme.typography.bodyMedium,
                            color = onBackground
                        )

                        Button(
                            onClick = {
                                showMapCard = true
                            },
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                                .onGloballyPositioned {
                                    revealCenter = it.boundsInWindow().center
                                },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color.Black, contentColor = Color.White
                            )
                        ) {
                            Icon(Icons.Default.Place, contentDescription = null)
                            Text(if (!isEditing) "View on Map" else "Edit Location")
                        }

                        if (!isEditing) {
                            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                joinButton()
                            }
                        }

                        if (editView) {
                            if (isEditing) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(onClick = {
                                        onEditEventComplete()
                                        isEditing = false
                                    }, enabled = isValid) {
                                        Text("Confirm")
                                    }
                                    Button(onClick = {
                                        isEditing = false
                                    }) {
                                        Text("Cancel")
                                    }
                                }
                            } else {
                                Button(onClick = { isEditing = true }) {
                                    Text("Edit")
                                }
                            }
                        }
                        if (isEditing) {
                            EditDetails(
                                host = host,
                                event = editEvent,
                                hazeState = hazeState,
                                onEventTypeSelected = onEventTypeSelected,
                                onEditEvent = onEditEvent,
                                onEditTournament = onEditTournament,
                                onIsValid = { isValid = it },
                                onShowStartPicker = { showStartPicker = true },
                                onShowEndPicker = { showEndPicker = true },
                                isNewEvent = isNewEvent,
                                onAddCurrentUser = onAddCurrentUser
                            )
                        } else {
                            NormalDetails(host, event, hazeState, dateRangeText)
                        }
                        Spacer(Modifier.height(32.dp))
                    }
                }

                if (showStartPicker) {
                    DateTimePickerDialog(onDateTimeSelected = { selectedInstant ->
                        onEditEvent { copy(start = selectedInstant) }
                        showStartPicker = false
                    }, onDismissRequest = { showStartPicker = false })
                }

                // Similarly for the end date/time.
                if (showEndPicker) {
                    DateTimePickerDialog(onDateTimeSelected = { selectedInstant ->
                        onEditEvent { copy(end = selectedInstant) }
                        showEndPicker = false
                    }, onDismissRequest = { showEndPicker = false })
                }
            }
        }
        EventMap(
            component = mapComponent,
            onEventSelected = {
                showImageSelector = true
            }, onPlaceSelected = { place ->
                if (isEditing) {
                    onPlaceSelected(place)
                    selectedPlace = place
                    showImageSelector = true
                }
            }, canClickPOI = isEditing,
            modifier = Modifier.graphicsLayer {
                alpha = if (animationProgress > 0f) 1f else 0f
            }.clip(CircularRevealShape(animationProgress, revealCenter)),
            searchBarPadding = PaddingValues(),
            focusedLocation = editEvent.let {
                LatLng(it.lat, it.long)
            },
            focusedEvent = editEvent
        )

        if (showImageSelector && selectedPlace != null) {
            Dialog(onDismissRequest = {
                showImageSelector = false
                selectedPlace = null
            }) {
                SelectEventImage(
                    selectedPlace = selectedPlace!!,
                    onSelectedImage = { onEditEvent(it) }
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    Button(
                        enabled = editEvent.imageUrl.isNotEmpty(),
                        onClick = {
                            showImageSelector = false
                            showMapCard = false
                            selectedPlace = null
                        }
                    ) {
                        Text("Confirm")
                    }
                    Button(onClick = {
                        showImageSelector = false
                    }) {
                        Text("Cancel")
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun NormalDetails(host: UserData, event: EventAbs, hazeState: HazeState, dateRangeText: String) {
    CardSection(
        "Hosted by ${host.firstName} ${host.lastName}", event.description, hazeState
    )
    CardSection(
        "Price", event.price.moneyFormat(), hazeState
    )
    CardSection(
        "Date", dateRangeText, hazeState
    )
    CardSection(
        "Type", "${event.fieldType} • ${event.eventType}".toTitleCase(), hazeState
    )
    CardSection(
        "Divisions", event.divisions.joinToString().toDivisionCase(), hazeState
    )

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = Color.Transparent,
        modifier = Modifier.wrapContentSize()

    ) {
        Column(
            Modifier.hazeEffect(hazeState, CupertinoMaterials.thin()).padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Specifics", style = MaterialTheme.typography.titleMedium)
            Text(
                "Max Players: ${event.maxParticipants}", style = MaterialTheme.typography.bodyMedium
            )
            Text(
                "Team Sizes: ${event.teamSizeLimit.teamSizeFormat()}",
                style = MaterialTheme.typography.bodyMedium
            )
            if (event is Tournament) {
                Text(
                    if (event.doubleElimination) "Double Elimination" else "Single Elimination",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    "Winner Set Count: ${event.winnerSetCount}",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    "Winner Points: ${event.winnerBracketPointsToVictory.joinToString()}",
                    style = MaterialTheme.typography.bodyMedium
                )
                if (event.doubleElimination) {
                    Text(
                        "Loser Set Count: ${event.loserSetCount}",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        "Loser Points: ${event.loserBracketPointsToVictory.joinToString()}",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun EditCardSection(hazeState: HazeState, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        color = Color.Transparent,
        shape = RoundedCornerShape(16.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().hazeEffect(hazeState, CupertinoMaterials.thin())
                .padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally
        ) {
            content()
        }
    }
}

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun CardSection(title: String, content: String, hazeState: HazeState) {
    Surface(
        color = Color.Transparent,
        shape = RoundedCornerShape(16.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().hazeEffect(hazeState, CupertinoMaterials.thin())
                .padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(content, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun BackgroundImage(modifier: Modifier, imageUrl: String) {
    val imageHeight = (getScreenHeight() * 0.75f)
    Column(
        modifier
    ) {
        AsyncImage(
            model = imageUrl,
            contentDescription = "Event Image",
            modifier = Modifier.height(imageHeight.dp),
            contentScale = ContentScale.Crop,
        )

        AsyncImage(model = imageUrl,
            contentDescription = "Flipped Hazy Background",
            modifier = Modifier.fillMaxSize().graphicsLayer {
                clip = true
                rotationX = 180f
            }.graphicsLayer {
                transformOrigin = TransformOrigin(0.5f, 1f)
                scaleY = 50f
            }.blur(32.dp),
            contentScale = ContentScale.Crop,
            clipToBounds = true
        )
    }
}

