package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.composables.PaymentProcessorButton
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.getScreenHeight
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.teamSizeFormat
import com.razumly.mvp.core.presentation.util.toDivisionCase
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.presentation.util.transitionSpec
import com.razumly.mvp.eventDetail.composables.DropdownField
import com.razumly.mvp.eventDetail.composables.MultiSelectDropdownField
import com.razumly.mvp.eventDetail.composables.NumberInputField
import com.razumly.mvp.eventDetail.composables.PointsTextField
import com.razumly.mvp.eventDetail.composables.SelectEventImage
import com.razumly.mvp.eventDetail.composables.TextInputField
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
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.free_entry_hint
import mvp.composeapp.generated.resources.invalid_price
import mvp.composeapp.generated.resources.max_players
import mvp.composeapp.generated.resources.max_teams
import mvp.composeapp.generated.resources.select_a_value
import mvp.composeapp.generated.resources.team_size_limit
import mvp.composeapp.generated.resources.value_range
import mvp.composeapp.generated.resources.value_too_low
import mvp.composeapp.generated.resources.enter_value
import org.jetbrains.compose.resources.stringResource

val LocalHazeState = compositionLocalOf { HazeState() }

@OptIn(ExperimentalHazeApi::class)
@Composable
fun EventDetails(
    paymentProcessor: IPaymentProcessor,
    mapComponent: MapComponent,
    hostHasAccount: Boolean,
    onHostCreateAccount: () -> Unit,
    eventWithRelations: EventAbsWithRelations,
    editEvent: EventAbs,
    onFavoriteClick: () -> Unit,
    navPadding: PaddingValues = PaddingValues(),
    onPlaceSelected: (MVPPlace?) -> Unit,
    editView: Boolean,
    onEditEvent: (EventImp.() -> EventImp) -> Unit,
    onEditTournament: (Tournament.() -> Tournament) -> Unit,
    isNewEvent: Boolean,
    onAddCurrentUser: (Boolean) -> Unit,
    onEventTypeSelected: (EventType) -> Unit,
    onSelectFieldCount: (Int) -> Unit,
    onBack: () -> Unit,
    joinButton: @Composable (isValid: Boolean) -> Unit
) {
    val event = eventWithRelations.event
    val host = eventWithRelations.host
    val hazeState = remember { HazeState() }
    val scrollState = rememberScrollState()
    var isValid by remember { mutableStateOf(false) }
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
    var revealCenter by remember { mutableStateOf(Offset.Zero) }
    var showImageSelector by rememberSaveable { mutableStateOf(false) }
    var selectedPlace by remember { mutableStateOf<MVPPlace?>(null) }

    // Validation states
    var isNameValid by remember { mutableStateOf(editEvent.name.isNotBlank()) }
    var isPriceValid by remember { mutableStateOf(editEvent.price >= 0) }
    var isMaxParticipantsValid by remember { mutableStateOf(editEvent.maxParticipants > 2) }
    var isTeamSizeValid by remember { mutableStateOf(editEvent.teamSizeLimit >= 2) }
    var isWinnerSetCountValid by remember { mutableStateOf(true) }
    var isLoserSetCountValid by remember { mutableStateOf(true) }
    var isWinnerPointsValid by remember { mutableStateOf(true) }
    var isLoserPointsValid by remember { mutableStateOf(true) }
    var isLocationValid by remember { mutableStateOf(editEvent.location.isNotBlank() && editEvent.lat != 0.0 && editEvent.long != 0.0) }
    var isFieldCountValid by remember { mutableStateOf(true) }
    var isSkillLevelValid by remember { mutableStateOf(true) }

    var fieldCount by remember { mutableStateOf(0) }
    var selectedDivisions by remember { mutableStateOf(editEvent.divisions) }
    var addSelfToEvent by remember { mutableStateOf(false) }

    val currentLocation by mapComponent.currentLocation.collectAsState()
    val painter = rememberAsyncImagePainter(event.imageUrl)
    val painterLoader = rememberPainterLoader()
    val colorState = rememberDominantColorState(loader = painterLoader)

    LaunchedEffect(painter) {
        colorState.updateFrom(painter)
    }

    // Validation effect
    LaunchedEffect(editEvent) {
        isNameValid = editEvent.name.isNotBlank()
        isPriceValid = editEvent.price >= 0
        isMaxParticipantsValid = editEvent.maxParticipants > 2
        isTeamSizeValid = editEvent.teamSizeLimit >= 2
        isLocationValid =
            editEvent.location.isNotBlank() && editEvent.lat != 0.0 && editEvent.long != 0.0
        isSkillLevelValid = editEvent.divisions.isNotEmpty()

        if (editEvent is Tournament) {
            isWinnerSetCountValid = editEvent.winnerSetCount in 1..5
            isWinnerPointsValid = editEvent.winnerBracketPointsToVictory.all { it > 0 }
            isFieldCountValid = fieldCount > 0
            if (editEvent.doubleElimination) {
                isLoserSetCountValid = editEvent.loserSetCount in 1..5
                isLoserPointsValid = editEvent.loserBracketPointsToVictory.all { it > 0 }
            } else {
                isLoserSetCountValid = true
                isLoserPointsValid = true
            }
        } else {
            isWinnerSetCountValid = true
            isWinnerPointsValid = true
            isLoserSetCountValid = true
            isLoserPointsValid = true
        }

        isValid =
            isPriceValid && isMaxParticipantsValid && isTeamSizeValid && isWinnerSetCountValid && isWinnerPointsValid && isLoserSetCountValid && isLoserPointsValid
    }

    val backgroundColor = colorState.result?.paletteOrNull?.vibrantSwatch?.color
        ?: MaterialTheme.colorScheme.background
    val onBackgroundColor = colorState.result?.paletteOrNull?.vibrantSwatch?.onColor
        ?: MaterialTheme.colorScheme.onBackground

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
                    if (!editView) event.imageUrl else editEvent.imageUrl,
                )

                if (!editView) {
                    PlatformBackButton(
                        { onBack() },
                        modifier = Modifier.padding(top = 32.dp, start = 8.dp)
                            .align(Alignment.TopStart),
                        text = "",
                        arrow = false
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
                                backgroundColor = backgroundColor,
                                tint = null,
                                blurRadius = 64.dp,
                                noiseFactor = 0f
                            )
                            progressive = HazeProgressive.verticalGradient(
                                easing = LinearOutSlowInEasing,
                                startIntensity = 0f,
                                endIntensity = 1f,
                                startY = 0f,
                                endY = 500f
                            )
                        }.padding(navPadding).padding(horizontal = 16.dp).padding(top = 32.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        CompositionLocalProvider(LocalHazeState provides hazeState) {
                            // Event Title - Animated
                            AnimatedCardSection(isOnSurface = false,
                                isEditMode = editView,
                                animationDelay = 0,
                                viewContent = {
                                    Text(
                                        text = event.name,
                                        style = MaterialTheme.typography.headlineMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = onBackgroundColor
                                    )
                                },
                                editContent = {
                                    OutlinedTextField(value = editEvent.name,
                                        onValueChange = { onEditEvent { copy(name = it) } },
                                        label = { Text("Event Name") },
                                        isError = !isNameValid,
                                        supportingText = {
                                            Text(
                                                text = stringResource(Res.string.enter_value),
                                                color = MaterialTheme.colorScheme.error
                                            )
                                        }
                                    )
                                })

                            // Location Display
                            Text(
                                text = if (!editView) event.location else editEvent.location,
                                style = MaterialTheme.typography.bodyMedium,
                                color = onBackgroundColor
                            )

                            // Map Button
                            Button(
                                onClick = { mapComponent.toggleMap() },
                                modifier = Modifier.align(Alignment.CenterHorizontally)
                                    .onGloballyPositioned {
                                        revealCenter = it.boundsInWindow().center
                                    },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color.Black, contentColor = Color.White
                                )
                            ) {
                                Icon(Icons.Default.Place, contentDescription = null)
                                Text(if (!editView) "View on Map" else "Edit Location")
                            }

                            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                joinButton(isValid)
                            }

                            // Description Card
                            AnimatedCardSection(isEditMode = editView,
                                animationDelay = 100,
                                viewContent = {
                                    CardSection(
                                        title = "Hosted by ${host?.firstName?.toTitleCase()} ${host?.lastName?.toTitleCase()}",
                                        content = event.description,
                                    )
                                },
                                editContent = {
                                    TextInputField(
                                        value = editEvent.description,
                                        label = "Description",
                                        onValueChange = { onEditEvent { copy(description = it) } },
                                        isError = false,
                                        errorMessage = "",
                                        supportingText = "Add a Description of the Event"
                                    )
                                })

                            // Event Type Card
                            AnimatedCardSection(isEditMode = editView,
                                animationDelay = 150,
                                viewContent = {
                                    CardSection(
                                        "Type",
                                        "${event.fieldType} • ${event.eventType}".toTitleCase(),
                                    )
                                },
                                editContent = {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        DropdownField(
                                            modifier = Modifier.weight(1.2f),
                                            value = editEvent.eventType.name,
                                            label = "Event Type"
                                        ) { dismiss ->
                                            EventType.entries.forEach { eventType ->
                                                DropdownMenuItem(onClick = {
                                                    dismiss()
                                                    onEventTypeSelected(eventType)
                                                }, text = { Text(text = eventType.name) })
                                            }
                                        }
                                        DropdownField(
                                            modifier = Modifier.weight(1f),
                                            value = editEvent.fieldType.name,
                                            label = "Field Type",
                                        ) { dismiss ->
                                            FieldType.entries.forEach { fieldType ->
                                                DropdownMenuItem(onClick = {
                                                    dismiss()
                                                    onEditEvent { copy(fieldType = fieldType) }
                                                }, text = { Text(text = fieldType.name) })
                                            }
                                        }
                                    }
                                })

                            // Price Card
                            AnimatedCardSection(isEditMode = editView,
                                animationDelay = 200,
                                viewContent = {
                                    CardSection("Price", event.price.moneyFormat())
                                },
                                editContent = {
                                    if (!hostHasAccount) {
                                        PaymentProcessorButton(
                                            onClick = onHostCreateAccount,
                                            paymentProcessor,
                                            "Create Stripe Connect Account to Change Price"
                                        )
                                    }
                                    NumberInputField(
                                        value = (editEvent.price * 100).toInt().toString(),
                                        label = "",
                                        enabled = hostHasAccount,
                                        onValueChange = { newText ->
                                            if (newText.isBlank()) {
                                                onEditEvent { copy(price = 0.0) }
                                                return@NumberInputField
                                            }
                                            val newCleaned = newText.filter { it.isDigit() }
                                            onEditEvent { copy(price = newCleaned.toDouble() / 100) }
                                        },
                                        isError = !isPriceValid,
                                        isMoney = true,
                                        errorMessage = stringResource(Res.string.invalid_price),
                                        supportingText = stringResource(Res.string.free_entry_hint)
                                    )
                                })

                            // Date Card
                            AnimatedCardSection(isEditMode = editView,
                                animationDelay = 250,
                                viewContent = {
                                    CardSection("Date", dateRangeText)
                                },
                                editContent = {
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        OutlinedTextField(
                                            value = editEvent.start.toLocalDateTime(
                                                TimeZone.currentSystemDefault()
                                            ).format(dateTimeFormat),
                                            onValueChange = {},
                                            label = { Text("Start Date & Time") },
                                            modifier = Modifier.weight(1f)
                                                .clickable(onClick = { showStartPicker = true }),
                                            readOnly = true,
                                            enabled = false,
                                            colors = OutlinedTextFieldDefaults.colors(
                                                disabledContainerColor = OutlinedTextFieldDefaults.colors().focusedContainerColor,
                                                disabledTextColor = OutlinedTextFieldDefaults.colors().focusedTextColor,
                                                disabledLabelColor = OutlinedTextFieldDefaults.colors().focusedLabelColor,
                                                disabledBorderColor = OutlinedTextFieldDefaults.colors().unfocusedIndicatorColor,
                                            )
                                        )
                                        OutlinedTextField(
                                            value = editEvent.end.toLocalDateTime(
                                                TimeZone.currentSystemDefault()
                                            ).format(dateTimeFormat),
                                            onValueChange = {},
                                            label = { Text("End Date & Time") },
                                            modifier = Modifier.weight(1f)
                                                .clickable(onClick = { showEndPicker = true }),
                                            readOnly = true,
                                            enabled = false,
                                            colors = OutlinedTextFieldDefaults.colors(
                                                disabledContainerColor = OutlinedTextFieldDefaults.colors().focusedContainerColor,
                                                disabledTextColor = OutlinedTextFieldDefaults.colors().focusedTextColor,
                                                disabledLabelColor = OutlinedTextFieldDefaults.colors().focusedLabelColor,
                                                disabledBorderColor = OutlinedTextFieldDefaults.colors().unfocusedIndicatorColor,
                                            )
                                        )
                                    }
                                })

                            // Divisions Card
                            AnimatedCardSection(isEditMode = editView,
                                animationDelay = 300,
                                viewContent = {
                                    CardSection(
                                        "Divisions",
                                        event.divisions.joinToString().toDivisionCase(),
                                    )
                                },
                                editContent = {
                                    MultiSelectDropdownField(
                                        selectedItems = selectedDivisions,
                                        label = "Skill levels",
                                        isError = !isSkillLevelValid,
                                        errorMessage = stringResource(Res.string.select_a_value),
                                    ) { newSelection ->
                                        selectedDivisions = newSelection
                                        onEditEvent { copy(divisions = selectedDivisions) }
                                    }
                                })

                            // Specifics Card
                            AnimatedCardSection(isEditMode = editView,
                                animationDelay = 350,
                                viewContent = {
                                    Text("Specifics", style = MaterialTheme.typography.titleMedium)
                                    Text(
                                        "Max Players: ${event.maxParticipants}",
                                        style = MaterialTheme.typography.bodyMedium
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
                                },
                                editContent = {
                                    Text("Specifics", style = MaterialTheme.typography.titleMedium)

                                    NumberInputField(
                                        value = editEvent.maxParticipants.toString(),
                                        label = if (!editEvent.teamSignup) stringResource(Res.string.max_players)
                                        else stringResource(Res.string.max_teams),
                                        onValueChange = { newValue ->
                                            if (newValue.all { it.isDigit() }) {
                                                if (newValue.isBlank()) {
                                                    onEditEvent { copy(maxParticipants = 0) }
                                                } else {
                                                    onEditEvent { copy(maxParticipants = newValue.toInt()) }
                                                }
                                            }
                                        },
                                        isError = !isMaxParticipantsValid,
                                        errorMessage = stringResource(Res.string.value_too_low, 1),
                                        isMoney = false,
                                    )

                                    NumberInputField(
                                        value = editEvent.teamSizeLimit.toString(),
                                        label = stringResource(Res.string.team_size_limit),
                                        onValueChange = { newValue ->
                                            if (newValue.all { it.isDigit() }) {
                                                if (newValue.isBlank()) {
                                                    onEditEvent { copy(teamSizeLimit = 0) }
                                                } else {
                                                    onEditEvent { copy(teamSizeLimit = newValue.toInt()) }
                                                }
                                            }
                                        },
                                        isError = !isTeamSizeValid,
                                        errorMessage = stringResource(Res.string.value_range, 2, 6),
                                        isMoney = false,
                                        placeholder = "2-6"
                                    )

                                    if (event is EventImp) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.padding(top = 8.dp)
                                        ) {
                                            Checkbox(checked = editEvent.teamSignup,
                                                onCheckedChange = { onEditEvent { copy(teamSignup = it) } })
                                            Text(text = "Team Event")
                                        }
                                    }

                                    if (isNewEvent) {
                                        AnimatedVisibility(!editEvent.teamSignup) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                modifier = Modifier.padding(top = 8.dp)
                                            ) {
                                                Checkbox(checked = addSelfToEvent,
                                                    onCheckedChange = {
                                                        addSelfToEvent = it
                                                        onAddCurrentUser(it)
                                                    })
                                                Text(text = "Join as participant")
                                            }
                                        }
                                    }

                                    // Tournament-specific fields
                                    if (editEvent is Tournament) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Checkbox(checked = editEvent.doubleElimination,
                                                onCheckedChange = { checked ->
                                                    onEditTournament { copy(doubleElimination = checked) }
                                                })
                                            Text("Double Elimination")
                                        }

                                        NumberInputField(
                                            value = fieldCount.toString(),
                                            onValueChange = { newValue ->
                                                if (newValue.all { it.isDigit() }) {
                                                    if (newValue.isBlank()) {
                                                        fieldCount = 0
                                                        onSelectFieldCount(0)
                                                    } else {
                                                        fieldCount = newValue.toInt()
                                                        onSelectFieldCount(newValue.toInt())
                                                    }
                                                }
                                            },
                                            label = "Field Count",
                                            isError = !isFieldCountValid,
                                            isMoney = false,
                                            errorMessage = stringResource(Res.string.value_too_low, 0),
                                        )

                                        // Winner bracket configuration
                                        NumberInputField(
                                            value = editEvent.winnerSetCount.toString(),
                                            onValueChange = { newValue ->
                                                if (newValue.all { it.isDigit() }) {
                                                    if (newValue.isBlank()) {
                                                        onEditTournament { copy(winnerSetCount = 0) }
                                                    } else {
                                                        onEditTournament {
                                                            copy(winnerSetCount = newValue.toInt(),
                                                                winnerBracketPointsToVictory = List(
                                                                    newValue.toInt()
                                                                ) { 0 })
                                                        }
                                                    }
                                                }
                                            },
                                            label = "Winner Set Count",
                                            isError = !isWinnerSetCountValid,
                                            isMoney = false,
                                            errorMessage = stringResource(Res.string.value_range, 1, 5),
                                        )

                                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                            val constrainedWinnerSetCount =
                                                remember(editEvent.winnerSetCount) {
                                                    maxOf(1, minOf(editEvent.winnerSetCount, 5))
                                                }

                                            val focusRequesters =
                                                remember(constrainedWinnerSetCount) {
                                                    List(constrainedWinnerSetCount) { FocusRequester() }
                                                }

                                            repeat(constrainedWinnerSetCount) { index ->
                                                PointsTextField(value = editEvent.winnerBracketPointsToVictory.getOrNull(
                                                    index
                                                )?.toString() ?: "",
                                                    label = "Set ${index + 1} Points to Win",
                                                    onValueChange = { newValue ->
                                                        if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                                                            val winnerPoints =
                                                                if (newValue.isBlank()) 0 else newValue.toInt()
                                                            onEditTournament {
                                                                copy(winnerBracketPointsToVictory = editEvent.winnerBracketPointsToVictory.toMutableList()
                                                                    .apply {
                                                                        // Ensure list is large enough
                                                                        while (size <= index) add(
                                                                            0
                                                                        )
                                                                        set(index, winnerPoints)
                                                                    })
                                                            }
                                                        }
                                                    },
                                                    focusRequester = focusRequesters[index],
                                                    nextFocus = {
                                                        if (index < constrainedWinnerSetCount - 1) {
                                                            focusRequesters[index + 1].requestFocus()
                                                        }
                                                    })
                                            }
                                        }

                                        // Loser bracket (if double elimination)
                                        if (editEvent.doubleElimination) {
                                            if (editEvent.doubleElimination) {
                                                NumberInputField(
                                                    value = editEvent.loserSetCount.toString(),
                                                    onValueChange = { newValue ->
                                                        if (newValue.all { it.isDigit() }) {
                                                            if (newValue.isBlank()) {
                                                                onEditTournament {
                                                                    copy(
                                                                        loserSetCount = 1
                                                                    )
                                                                } // Minimum 1
                                                            } else {
                                                                val setCount = minOf(
                                                                    newValue.toInt(),
                                                                    5
                                                                ) // Maximum 5
                                                                val actualSetCount =
                                                                    maxOf(setCount, 1)
                                                                onEditTournament {
                                                                    copy(
                                                                        loserSetCount = actualSetCount,
                                                                        loserBracketPointsToVictory = List(
                                                                            actualSetCount
                                                                        ) { 0 }
                                                                    )
                                                                }
                                                            }
                                                        }
                                                    },
                                                    label = "Loser Set Count (1-5)",
                                                    isError = !isLoserSetCountValid,
                                                    isMoney = false,
                                                    errorMessage = stringResource(Res.string.value_range, 1, 5),
                                                    placeholder = "1-5"
                                                )
                                            }
                                            // Calculate constrained loser set count
                                            val constrainedLoserSetCount =
                                                remember(editEvent.loserSetCount) {
                                                    maxOf(1, minOf(editEvent.loserSetCount, 5))
                                                }

                                            val loserFocusRequesters =
                                                remember(constrainedLoserSetCount) {
                                                    List(constrainedLoserSetCount) { FocusRequester() }
                                                }

                                            repeat(constrainedLoserSetCount) { index ->
                                                PointsTextField(
                                                    value = editEvent.loserBracketPointsToVictory.getOrNull(
                                                        index
                                                    )?.toString() ?: "",
                                                    label = "Set ${index + 1} Points to Win",
                                                    onValueChange = { newValue ->
                                                        if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                                                            val loserPoints =
                                                                if (newValue.isBlank()) 0 else newValue.toInt()
                                                            onEditTournament {
                                                                copy(
                                                                    loserBracketPointsToVictory = editEvent.loserBracketPointsToVictory.toMutableList()
                                                                        .apply {
                                                                            // Ensure list is large enough
                                                                            while (size <= index) add(
                                                                                0
                                                                            )
                                                                            set(index, loserPoints)
                                                                        }
                                                                )
                                                            }
                                                        }
                                                    },
                                                    focusRequester = loserFocusRequesters[index],
                                                    nextFocus = {
                                                        if (index < constrainedLoserSetCount - 1) {
                                                            loserFocusRequesters[index + 1].requestFocus()
                                                        }
                                                    }
                                                )
                                            }
                                        }
                                    }
                                })
                            Spacer(Modifier.height(32.dp))
                        }
                    }
                }
            }
        }
        // Date Pickers and Map (same as before)
        PlatformDateTimePicker(
            onDateSelected = { selectedInstant ->
                onEditEvent { copy(start = selectedInstant ?: Clock.System.now()) }
                showStartPicker = false
            },
            onDismissRequest = { showStartPicker = false },
            showPicker = showStartPicker,
        )

        PlatformDateTimePicker(
            onDateSelected = { selectedInstant ->
                onEditEvent { copy(end = selectedInstant ?: Clock.System.now()) }
                showEndPicker = false
            },
            onDismissRequest = { showEndPicker = false },
            showPicker = showEndPicker,
        )

        EventMap(
            component = mapComponent,
            onEventSelected = { showImageSelector = true },
            onPlaceSelected = { place ->
                if (editView) {
                    onPlaceSelected(place)
                    selectedPlace = place
                    showImageSelector = true
                }
            },
            canClickPOI = editView,
            focusedLocation = if (editEvent.location.isNotBlank()) {
                editEvent.let { LatLng(it.lat, it.long) }
            } else {
                currentLocation ?: LatLng(0.0, 0.0)
            },
            focusedEvent = if (editEvent.location.isNotBlank()) {
                editEvent
            } else if (event.location.isNotBlank()) {
                event
            } else {
                null
            },
            revealCenter = revealCenter,
            onBackPressed = { mapComponent.toggleMap() },
        )

        // Image selector dialog (same as before)
        if (showImageSelector && selectedPlace != null) {
            Dialog(onDismissRequest = {
                showImageSelector = false
                selectedPlace = null
            }) {
                Column(Modifier.fillMaxSize()) {
                    SelectEventImage(selectedPlace = selectedPlace!!,
                        onSelectedImage = { onEditEvent(it) })
                    Row(
                        Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Button(
                            onClick = {
                                showImageSelector = false
                                onEditEvent { copy(imageUrl = "") }
                                onPlaceSelected(null)
                            }, colors = ButtonColors(
                                containerColor = MaterialTheme.colorScheme.errorContainer,
                                contentColor = MaterialTheme.colorScheme.onErrorContainer,
                                disabledContainerColor = MaterialTheme.colorScheme.onSurface,
                                disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        ) {
                            Text("Cancel")
                        }
                        Button(enabled = editEvent.imageUrl.isNotEmpty(), onClick = {
                            showImageSelector = false
                            mapComponent.toggleMap()
                            selectedPlace = null
                        }) {
                            Text("Confirm")
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun AnimatedCardSection(
    isOnSurface: Boolean = true,
    isEditMode: Boolean,
    animationDelay: Int = 0,
    viewContent: @Composable ColumnScope.() -> Unit,
    editContent: @Composable ColumnScope.() -> Unit
) {
    val columnModifier = if (isOnSurface) {
        Modifier.fillMaxWidth().hazeEffect(LocalHazeState.current, CupertinoMaterials.thin())
            .padding(16.dp)
    } else {
        Modifier.fillMaxWidth().padding(16.dp)
    }

    Surface(
        color = Color.Transparent,
        shape = RoundedCornerShape(16.dp),
    ) {
        AnimatedContent(
            targetState = isEditMode,
            transitionSpec = { transitionSpec(animationDelay) },
            label = "cardTransition"
        ) { editMode ->
            Column(
                modifier = columnModifier,
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (editMode) {
                    editContent()
                } else {
                    viewContent()
                }
            }
        }
    }
}

@Composable
fun ColumnScope.CardSection(
    title: String, content: String
) {
    Text(
        text = title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center
    )
    Text(
        text = content, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center
    )
}

@Composable
fun BackgroundImage(modifier: Modifier, imageUrl: String) {
    val imageHeight = (getScreenHeight() * 0.75f)
    Column(
        modifier,
    ) {
        if (imageUrl.isNotBlank()) {
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
}