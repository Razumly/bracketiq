package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import coil3.compose.AsyncImage
import com.kmpalette.loader.rememberNetworkLoader
import com.kmpalette.rememberDominantColorState
import com.materialkolor.scheme.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.toLeagueConfig
import com.razumly.mvp.core.data.dataTypes.toTournamentConfig
import com.razumly.mvp.core.data.dataTypes.withLeagueConfig
import com.razumly.mvp.core.data.dataTypes.withTournamentConfig
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import com.razumly.mvp.core.data.util.normalizeDivisionLabels
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.MoneyInputField
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.composables.StripeButton
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.getScreenHeight
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.teamSizeFormat
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.presentation.util.transitionSpec
import com.razumly.mvp.eventDetail.composables.CancellationRefundOptions
import com.razumly.mvp.eventDetail.composables.LeagueConfigurationFields
import com.razumly.mvp.eventDetail.composables.LeagueScoringConfigFields
import com.razumly.mvp.eventDetail.composables.LeagueScheduleFields
import com.razumly.mvp.eventDetail.composables.MultiSelectDropdownField
import com.razumly.mvp.eventDetail.composables.NumberInputField
import com.razumly.mvp.eventDetail.composables.PointsTextField
import com.razumly.mvp.eventDetail.composables.RegistrationOptions
import com.razumly.mvp.eventDetail.composables.SelectEventImage
import com.razumly.mvp.eventDetail.composables.TextInputField
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import dev.chrisbanes.haze.ExperimentalHazeApi
import dev.icerock.moko.geo.LatLng
import io.github.aakira.napier.Napier
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.ismoy.imagepickerkmp.domain.models.MimeType
import io.github.ismoy.imagepickerkmp.presentation.ui.components.GalleryPickerLauncher
import io.ktor.http.Url
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.enter_value
import mvp.composeapp.generated.resources.free_entry_hint
import mvp.composeapp.generated.resources.invalid_price
import mvp.composeapp.generated.resources.max_players
import mvp.composeapp.generated.resources.max_teams
import mvp.composeapp.generated.resources.select_a_value
import mvp.composeapp.generated.resources.value_too_low
import org.jetbrains.compose.resources.stringResource
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

val localImageScheme = compositionLocalOf<DynamicScheme> { error("No color scheme provided") }

@OptIn(ExperimentalHazeApi::class, ExperimentalTime::class)
@Composable
fun EventDetails(
    paymentProcessor: IPaymentProcessor,
    mapComponent: MapComponent,
    hostHasAccount: Boolean,
    imageScheme: DynamicScheme,
    imageIds: List<String>,
    eventWithRelations: EventWithFullRelations,
    editEvent: Event,
    editView: Boolean,
    navPadding: PaddingValues = PaddingValues(),
    isNewEvent: Boolean,
    rentalTimeLocked: Boolean = false,
    onHostCreateAccount: () -> Unit,
    onPlaceSelected: (MVPPlace?) -> Unit,
    onEditEvent: (Event.() -> Event) -> Unit,
    onEditTournament: (Event.() -> Event) -> Unit,
    onAddCurrentUser: (Boolean) -> Unit,
    onEventTypeSelected: (EventType) -> Unit,
    sports: List<Sport> = emptyList(),
    editableFields: List<Field> = emptyList(),
    leagueTimeSlots: List<TimeSlot> = emptyList(),
    leagueScoringConfig: LeagueScoringConfigDTO = LeagueScoringConfigDTO(),
    onSportSelected: (String) -> Unit = {},
    onSelectFieldCount: (Int) -> Unit,
    onUpdateLocalFieldName: (Int, String) -> Unit = { _, _ -> },
    onUpdateLocalFieldDivisions: (Int, List<String>) -> Unit = { _, _ -> },
    onAddLeagueTimeSlot: () -> Unit = {},
    onUpdateLeagueTimeSlot: (Int, TimeSlot) -> Unit = { _, _ -> },
    onRemoveLeagueTimeSlot: (Int) -> Unit = {},
    onLeagueScoringConfigChange: (LeagueScoringConfigDTO) -> Unit = {},
    onUploadSelected: (GalleryPhotoResult) -> Unit,
    onDeleteImage: (String) -> Unit,
    onValidationChange: (Boolean, List<String>) -> Unit = { _, _ -> },
    joinButton: @Composable (isValid: Boolean) -> Unit
) {
    val event = eventWithRelations.event
    val host = eventWithRelations.host
    var isValid by remember { mutableStateOf(false) }
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
    var revealCenter by remember { mutableStateOf(Offset.Zero) }
    var showImageSelector by rememberSaveable { mutableStateOf(false) }
    var showUploadImagePicker by rememberSaveable { mutableStateOf(false) }
    var previousSelection by remember { mutableStateOf<LatLng?>(null) }

    // Validation states
    var isNameValid by remember { mutableStateOf(editEvent.name.isNotBlank()) }
    var isPriceValid by remember { mutableStateOf(editEvent.priceCents >= 0) }
    var isMaxParticipantsValid by remember { mutableStateOf(editEvent.maxParticipants > 1) }
    var isTeamSizeValid by remember { mutableStateOf(editEvent.teamSizeLimit >= 2) }
    var isWinnerSetCountValid by remember { mutableStateOf(true) }
    var isLoserSetCountValid by remember { mutableStateOf(true) }
    var isWinnerPointsValid by remember { mutableStateOf(true) }
    var isLoserPointsValid by remember { mutableStateOf(true) }
    var isLocationValid by remember { mutableStateOf(editEvent.location.isNotBlank() && editEvent.lat != 0.0 && editEvent.long != 0.0) }
    var isFieldCountValid by remember { mutableStateOf(true) }
    var isLeagueGamesValid by remember { mutableStateOf(true) }
    var isLeagueDurationValid by remember { mutableStateOf(true) }
    var isLeaguePointsValid by remember { mutableStateOf(true) }
    var isLeaguePlayoffTeamsValid by remember { mutableStateOf(true) }
    var isLeagueSlotsValid by remember { mutableStateOf(true) }
    var isSkillLevelValid by remember { mutableStateOf(true) }
    var isSportValid by remember { mutableStateOf(true) }
    var isColorLoaded by remember { mutableStateOf(editEvent.imageId.isNotBlank()) }

    val lazyListState = rememberLazyListState()

    var fieldCount by remember { mutableStateOf(editEvent.fieldCount ?: editableFields.size) }
    var selectedDivisions by remember { mutableStateOf(editEvent.divisions.normalizeDivisionLabels()) }
    var addSelfToEvent by remember { mutableStateOf(false) }
    val leagueSlotErrors = remember(leagueTimeSlots, editEvent.eventType, isNewEvent) {
        if (isNewEvent && editEvent.eventType == EventType.LEAGUE) {
            computeLeagueSlotErrors(leagueTimeSlots)
        } else {
            emptyMap()
        }
    }

    val roundedCornerSize = 32.dp
    val currentLocation by mapComponent.currentLocation.collectAsState()

    LaunchedEffect(editEvent.fieldCount) {
        val normalized = editEvent.fieldCount ?: editableFields.size
        if (normalized != fieldCount) {
            fieldCount = normalized
        }
    }

    LaunchedEffect(editEvent, fieldCount, leagueSlotErrors) {
        isNameValid = editEvent.name.isNotBlank()
        isPriceValid = editEvent.priceCents >= 0
        isMaxParticipantsValid = editEvent.maxParticipants > 1
        isTeamSizeValid = editEvent.teamSizeLimit >= 2
        isLocationValid =
            editEvent.location.isNotBlank() && editEvent.lat != 0.0 && editEvent.long != 0.0
        isSkillLevelValid = editEvent.eventType == EventType.LEAGUE || editEvent.divisions.isNotEmpty()
        isSportValid = !isNewEvent || !editEvent.sportId.isNullOrBlank()
        isLeagueSlotsValid = if (isNewEvent && editEvent.eventType == EventType.LEAGUE) {
            leagueTimeSlots.isNotEmpty() && leagueSlotErrors.isEmpty()
        } else {
            true
        }

        if (editEvent.eventType == EventType.TOURNAMENT) {
            isWinnerSetCountValid = editEvent.winnerSetCount in 1..5
            isWinnerPointsValid = editEvent.winnerBracketPointsToVictory.size >= editEvent.winnerSetCount &&
                editEvent.winnerBracketPointsToVictory.take(editEvent.winnerSetCount).all { it > 0 }
            if (editEvent.doubleElimination) {
                isLoserSetCountValid = editEvent.loserSetCount in 1..5
                isLoserPointsValid = editEvent.loserBracketPointsToVictory.size >= editEvent.loserSetCount &&
                    editEvent.loserBracketPointsToVictory.take(editEvent.loserSetCount).all { it > 0 }
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
        isFieldCountValid = if (isNewEvent && (editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT)) {
            fieldCount > 0
        } else {
            true
        }

        if (editEvent.eventType == EventType.LEAGUE) {
            val setCount = when (editEvent.setsPerMatch) {
                1, 3, 5 -> editEvent.setsPerMatch
                else -> null
            }
            isLeagueGamesValid = (editEvent.gamesPerOpponent ?: 0) >= 1
            isLeaguePlayoffTeamsValid = !editEvent.includePlayoffs || (editEvent.playoffTeamCount
                ?: 0) >= 2
            if (editEvent.usesSets) {
                isLeagueDurationValid = setCount != null && (editEvent.setDurationMinutes ?: 0) >= 5
                isLeaguePointsValid = setCount != null &&
                    editEvent.pointsToVictory.size >= setCount &&
                    editEvent.pointsToVictory.take(setCount).all { it > 0 }
            } else {
                isLeagueDurationValid = (editEvent.matchDurationMinutes ?: 0) >= 15
                isLeaguePointsValid = true
            }
        } else {
            isLeagueGamesValid = true
            isLeagueDurationValid = true
            isLeaguePointsValid = true
            isLeaguePlayoffTeamsValid = true
        }

        isValid =
            isPriceValid &&
                isMaxParticipantsValid &&
                isTeamSizeValid &&
                isWinnerSetCountValid &&
                isWinnerPointsValid &&
                isLoserSetCountValid &&
                isLoserPointsValid &&
                isLocationValid &&
                isSkillLevelValid &&
                isFieldCountValid &&
                isLeagueGamesValid &&
                isLeagueDurationValid &&
                isLeaguePointsValid &&
                isLeaguePlayoffTeamsValid &&
                isLeagueSlotsValid &&
                isSportValid &&
                isColorLoaded
    }

    val validationErrors = remember(
        isNameValid,
        isSportValid,
        isPriceValid,
        isMaxParticipantsValid,
        isTeamSizeValid,
        isSkillLevelValid,
        isLocationValid,
        isFieldCountValid,
        isWinnerSetCountValid,
        isWinnerPointsValid,
        isLoserSetCountValid,
        isLoserPointsValid,
        isLeagueGamesValid,
        isLeagueDurationValid,
        isLeaguePointsValid,
        isLeaguePlayoffTeamsValid,
        isLeagueSlotsValid,
        leagueTimeSlots,
        editEvent.imageId,
        editEvent.doubleElimination,
        editEvent.usesSets,
        isColorLoaded,
    ) {
        buildList {
            if (!isNameValid) {
                add("Event name is required.")
            }
            if (!isSportValid) {
                add("Select a sport to continue.")
            }
            if (!isPriceValid) {
                add("Price must be 0 or higher.")
            }
            if (!isMaxParticipantsValid) {
                add("Max participants must be at least 2.")
            }
            if (!isTeamSizeValid) {
                add("Team size must be at least 2.")
            }
            if (!isSkillLevelValid) {
                add("Select at least one skill level.")
            }
            if (!isLocationValid) {
                add("Select a location.")
            }
            if (!isFieldCountValid) {
                add("Field count must be at least 1.")
            }
            if (!isWinnerSetCountValid) {
                add("Winner set count must be 1, 3, or 5.")
            }
            if (!isWinnerPointsValid) {
                add("Winner points must be greater than 0 for every set.")
            }
            if (editEvent.doubleElimination && !isLoserSetCountValid) {
                add("Loser set count must be 1, 3, or 5.")
            }
            if (editEvent.doubleElimination && !isLoserPointsValid) {
                add("Loser points must be greater than 0 for every set.")
            }
            if (!isLeagueGamesValid) {
                add("Games per opponent must be at least 1.")
            }
            if (!isLeagueDurationValid) {
                add(
                    if (editEvent.usesSets) {
                        "Set duration must be at least 5 minutes and sets must be Best of 1, 3, or 5."
                    } else {
                        "Match duration must be at least 15 minutes."
                    }
                )
            }
            if (!isLeaguePointsValid) {
                add("Points to victory must be greater than 0 for every configured set.")
            }
            if (!isLeaguePlayoffTeamsValid) {
                add("Playoff team count must be at least 2 when playoffs are enabled.")
            }
            if (!isLeagueSlotsValid) {
                add(
                    if (leagueTimeSlots.isEmpty()) {
                        "Add at least one timeslot for league scheduling."
                    } else {
                        "Fix league timeslot issues before continuing."
                    }
                )
            }
            val imageError = when {
                editEvent.imageId.isBlank() -> "Select an image for the event."
                !isColorLoaded -> "Image is still loading."
                else -> null
            }
            if (imageError != null) {
                add(imageError)
            }
        }
    }

    LaunchedEffect(isValid, validationErrors) {
        onValidationChange(isValid, validationErrors)
    }

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

    CompositionLocalProvider(localImageScheme provides imageScheme) {
        Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
            val scrollOffset = lazyListState.firstVisibleItemScrollOffset

            BackgroundImage(
                modifier = Modifier
                    .fillMaxWidth()
                    .height((getScreenHeight() * 0.6f).dp)
                    .graphicsLayer(translationY = -scrollOffset.toFloat()),
                imageUrl = if (!editView) getImageUrl(event.imageId) else getImageUrl(editEvent.imageId),
            )
            LazyColumn(
                state = lazyListState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    bottom = navPadding.calculateBottomPadding() + 32.dp,
                ),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {

                item {
                    Box(modifier = Modifier.height((getScreenHeight() * 0.5f).dp)) {
                        if (editView) {
                            Button(
                                onClick = { showImageSelector = true },
                                modifier = Modifier.align(Alignment.Center).size(120.dp),
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color.Black,
                                    contentColor = Color.White
                                ),
                                contentPadding = PaddingValues(16.dp),
                                elevation = ButtonDefaults.buttonElevation(defaultElevation = 8.dp)
                            ) {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    Icon(
                                        Icons.Default.Image,
                                        contentDescription = null,
                                        modifier = Modifier.size(32.dp)
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        "Choose Image",
                                        style = MaterialTheme.typography.labelMedium,
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                            val imageErrorText = when {
                                editEvent.imageId.isBlank() -> "Select an image for the event."
                                !isColorLoaded -> "Image is still loading."
                                else -> null
                            }
                            if (imageErrorText != null) {
                                Text(
                                    text = imageErrorText,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.align(Alignment.BottomCenter)
                                        .padding(bottom = 16.dp)
                                )
                            }
                        }
                    }
                }
                // First content card - overlapping the image
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(
                            topStart = roundedCornerSize,
                            topEnd = roundedCornerSize,
                            bottomStart = 0.dp,
                            bottomEnd = 0.dp
                        ),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            // Event Title - Animated
                            AnimatedContent(
                                targetState = editView,
                                transitionSpec = { transitionSpec(0) },
                                label = "titleTransition"
                            ) { editMode ->
                                if (editMode) {
                                    PlatformTextField(
                                        value = editEvent.name,
                                        onValueChange = { onEditEvent { copy(name = it) } },
                                        label = "Event Name",
                                        isError = !isNameValid,
                                        supportingText = if (!isNameValid) {
                                            stringResource(Res.string.enter_value)
                                        } else {
                                            ""
                                        }
                                    )
                                } else {
                                    Text(
                                        text = event.name,
                                        style = MaterialTheme.typography.headlineMedium,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }

                            // Location Display
                            Text(
                                text = if (!editView) event.location else editEvent.location,
                                style = MaterialTheme.typography.bodyMedium,
                            )

                            // Map Button
                            Button(
                                onClick = { mapComponent.toggleMap() },
                                modifier = Modifier.onGloballyPositioned {
                                    revealCenter = it.boundsInWindow().center
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color.Black, contentColor = Color.White
                                )
                            ) {
                                Icon(Icons.Default.Place, contentDescription = null)
                                Text(if (!editView) "View on Map" else "Edit Location")
                            }

                            if (!isLocationValid) {
                                Text(
                                    text = "Select a Location",
                                    color = MaterialTheme.colorScheme.error
                                )
                            }

                            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                joinButton(isValid)
                            }
                        }
                    }
                }

                animatedCardSection(
                    sectionId = "event_basics",
                    sectionTitle = "Event Basics",
                    collapsibleInEditMode = true,
                    isEditMode = editView,
                    animationDelay = 100,
                    viewContent = {
                        CardSection(
                            title = "Hosted by ${host?.firstName?.toTitleCase()} ${host?.lastName?.toTitleCase()}",
                            content = event.description,
                        )
                        CardSection(
                            "Type",
                            "${event.fieldType} • ${event.eventType}".toTitleCase(),
                        )
                        val sportName = eventWithRelations.sport?.name
                            ?: sports.firstOrNull { it.id == event.sportId }?.name
                            ?: "Not selected"
                        CardSection("Sport", sportName)
                        CardSection("Date", dateRangeText)
                    },
                    editContent = {
                        TextInputField(
                            value = editEvent.description,
                            label = "Description",
                            onValueChange = { onEditEvent { copy(description = it) } },
                            isError = false,
                            errorMessage = "",
                            supportingText = "Add a description of the event",
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            PlatformDropdown(
                                selectedValue = editEvent.eventType.name,
                                onSelectionChange = { selectedValue ->
                                    val selectedEventType =
                                        EventType.entries.find { it.name == selectedValue }
                                    selectedEventType?.let { onEventTypeSelected(it) }
                                },
                                options = EventType.entries.map { eventType ->
                                    DropdownOption(
                                        value = eventType.name, label = eventType.name
                                    )
                                },
                                label = "Event Type",
                                modifier = Modifier.weight(1f),
                            )
                            PlatformDropdown(
                                selectedValue = editEvent.sportId.orEmpty(),
                                onSelectionChange = onSportSelected,
                                options = sports.map { sport ->
                                    DropdownOption(value = sport.id, label = sport.name)
                                },
                                label = "Sport",
                                placeholder = if (sports.isEmpty()) "No sports available" else "Select a sport",
                                isError = !isSportValid,
                                supportingText = if (!isSportValid) "Select a sport to continue." else "",
                                enabled = sports.isNotEmpty(),
                                modifier = Modifier.weight(1f),
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            PlatformDropdown(
                                selectedValue = editEvent.fieldType.name,
                                onSelectionChange = { selectedValue ->
                                    val selectedFieldType =
                                        FieldType.entries.find { it.name == selectedValue }
                                    selectedFieldType?.let { fieldType ->
                                        onEditEvent { copy(fieldType = fieldType) }
                                    }
                                },
                                options = FieldType.entries.map { fieldType ->
                                    DropdownOption(
                                        value = fieldType.name, label = fieldType.name
                                    )
                                },
                                label = "Field Type",
                                modifier = Modifier.weight(1f),
                            )
                            PlatformTextField(
                                value = editEvent.start.toLocalDateTime(
                                    TimeZone.currentSystemDefault()
                                ).format(dateTimeFormat),
                                onValueChange = {},
                                modifier = Modifier.weight(1f),
                                label = "Start Date & Time",
                                readOnly = true,
                                onTap = {
                                    if (!rentalTimeLocked) {
                                        showStartPicker = true
                                    }
                                },
                            )
                        }

                        if (editEvent.eventType == EventType.EVENT) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                PlatformTextField(
                                    value = editEvent.end.toLocalDateTime(
                                        TimeZone.currentSystemDefault()
                                    ).format(dateTimeFormat),
                                    onValueChange = {},
                                    modifier = Modifier.weight(1f),
                                    label = "End Date & Time",
                                    readOnly = true,
                                    onTap = {
                                        if (!rentalTimeLocked) {
                                            showEndPicker = true
                                        }
                                    },
                                )
                                Box(modifier = Modifier.weight(1f))
                            }
                        }

                        if (rentalTimeLocked) {
                            Text(
                                text = "Rental-selected start and end times are fixed and cannot be changed.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(localImageScheme.current.onSurface),
                            )
                        }
                        if (editEvent.eventType != EventType.EVENT) {
                            Text(
                                text = "Leagues and tournaments use generated schedules. End date follows start date.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(localImageScheme.current.onSurface),
                            )
                        }
                    },
                )

                animatedCardSection(
                    sectionId = "registration_pricing",
                    sectionTitle = "Registration & Pricing",
                    collapsibleInEditMode = true,
                    isEditMode = editView,
                    animationDelay = 200,
                    viewContent = {
                        CardSection("Price", event.price.moneyFormat())
                        CardSection(
                            "Registration Cutoff", when (editEvent.registrationCutoffHours) {
                                0 -> "No Cutoff"
                                1 -> "24 hours before event"
                                2 -> "48 hours before event"
                                else -> "No cutoff"
                            }
                        )
                        CardSection(
                            "Refund Policy", when (event.cancellationRefundHours) {
                                0 -> "Automatic Refund"
                                1 -> "24 hours before event"
                                2 -> "48 hours before event"
                                else -> "No cutoff (always allow refunds)"
                            }
                        )
                    },
                    editContent = {
                        if (!hostHasAccount) {
                            StripeButton(
                                onClick = onHostCreateAccount,
                                paymentProcessor,
                                "Create Stripe Connect Account to Change Price",
                            )
                        }
                        MoneyInputField(
                            value = editEvent.priceCents.toString(),
                            label = "Price",
                            enabled = hostHasAccount && !rentalTimeLocked,
                            onValueChange = { newText ->
                                if (newText.isBlank()) {
                                    onEditEvent { copy(priceCents = 0) }
                                    return@MoneyInputField
                                }
                                val newCleaned = newText.filter { it.isDigit() }
                                onEditEvent { copy(priceCents = newCleaned.toInt()) }
                            },
                            isError = !isPriceValid,
                            supportingText = if (isPriceValid) {
                                stringResource(Res.string.free_entry_hint)
                            } else {
                                stringResource(Res.string.invalid_price)
                            }
                        )
                        RegistrationOptions(
                            selectedOption = editEvent.registrationCutoffHours,
                            onOptionSelected = {
                                onEditEvent { copy(registrationCutoffHours = it) }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        if (editEvent.priceCents > 0) {
                            CancellationRefundOptions(
                                selectedOption = editEvent.cancellationRefundHours,
                                onOptionSelected = {
                                    onEditEvent { copy(cancellationRefundHours = it) }
                                },
                                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                            )
                        }
                    },
                )

                // Specifics Card
                animatedCardSection(
                    sectionId = "specifics",
                    sectionTitle = "Competition Settings",
                    collapsibleInEditMode = true,
                    isEditMode = editView,
                    animationDelay = 400,
                    defaultExpandedInEditMode = true,
                    viewContent = {
                    Text(
                        "Specifics",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color(localImageScheme.current.onSurface)
                    )
                    Text(
                        "Divisions: ${event.divisions.normalizeDivisionLabels().joinToString()}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(localImageScheme.current.onSurface)
                    )
                    Text(
                        "Max Participants: ${event.maxParticipants}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(localImageScheme.current.onSurface)
                    )
                    Text(
                        "Team Sizes: ${event.teamSizeLimit.teamSizeFormat()}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(localImageScheme.current.onSurface)
                    )
                    Text(
                        "Team Event: ${if (event.teamSignup) "Yes" else "No"}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(localImageScheme.current.onSurface)
                    )
                    Text(
                        "Single Division: ${if (event.singleDivision) "Yes" else "No"}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(localImageScheme.current.onSurface)
                    )
                    if (event.doTeamsRef != null) {
                        Text(
                            "Teams Provide Referees: ${if (event.doTeamsRef) "Yes" else "No"}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(localImageScheme.current.onSurface)
                        )
                    }
                    if (event.eventType == EventType.LEAGUE) {
                        Text(
                            "Games per Opponent: ${event.gamesPerOpponent ?: 1}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(localImageScheme.current.onSurface)
                        )
                        if (event.usesSets) {
                            Text(
                                "Sets per Match: ${event.setsPerMatch ?: 1}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color(localImageScheme.current.onSurface)
                            )
                            Text(
                                "Set Duration: ${(event.setDurationMinutes ?: 20)} minutes",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color(localImageScheme.current.onSurface)
                            )
                            Text(
                                "Points to Victory: ${event.pointsToVictory.joinToString()}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color(localImageScheme.current.onSurface)
                            )
                        } else {
                            Text(
                                "Match Duration: ${(event.matchDurationMinutes ?: 60)} minutes",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color(localImageScheme.current.onSurface)
                            )
                        }
                        Text(
                            "Rest Time: ${(event.restTimeMinutes ?: 0)} minutes",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(localImageScheme.current.onSurface)
                        )
                        if (event.includePlayoffs) {
                            Text(
                                "Playoffs: Included (${event.playoffTeamCount ?: 0} teams)",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color(localImageScheme.current.onSurface)
                            )
                        }
                    }
                    if (event.eventType == EventType.TOURNAMENT) {
                        Text(
                            if (event.doubleElimination) "Double Elimination" else "Single Elimination",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(localImageScheme.current.onSurface)
                        )
                        Text(
                            "Winner Set Count: ${event.winnerSetCount}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(localImageScheme.current.onSurface)
                        )
                        Text(
                            "Winner Points: ${event.winnerBracketPointsToVictory.joinToString()}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(localImageScheme.current.onSurface)
                        )
                        if (event.doubleElimination) {
                            Text(
                                "Loser Set Count: ${event.loserSetCount}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color(localImageScheme.current.onSurface)
                            )
                            Text(
                                "Loser Points: ${event.loserBracketPointsToVictory.joinToString()}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color(localImageScheme.current.onSurface)
                            )
                        }
                    }
                }, editContent = {
                    val label = if (!editEvent.teamSignup) stringResource(Res.string.max_players)
                    else stringResource(Res.string.max_teams)
                    val teamSizeOptions = listOf(
                        DropdownOption("2", "2"),
                        DropdownOption("3", "3"),
                        DropdownOption("4", "4"),
                        DropdownOption("5", "5"),
                        DropdownOption("6", "6"),
                        DropdownOption("7", "6+"),
                    )
                    val setCountOptions = (1..5).map { count ->
                        DropdownOption(value = count.toString(), label = count.toString())
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Box(modifier = Modifier.weight(1f)) {
                            LabeledCheckboxRow(
                                checked = if (editEvent.eventType == EventType.EVENT) editEvent.teamSignup else true,
                                label = "Team Event",
                                enabled = editEvent.eventType == EventType.EVENT,
                                onCheckedChange = { checked ->
                                    if (editEvent.eventType == EventType.EVENT) {
                                        onEditEvent { copy(teamSignup = checked) }
                                    }
                                },
                            )
                        }
                        Box(modifier = Modifier.weight(1f)) {
                            LabeledCheckboxRow(
                                checked = if (editEvent.eventType == EventType.EVENT) editEvent.singleDivision else true,
                                label = "Single Division",
                                enabled = editEvent.eventType == EventType.EVENT,
                                onCheckedChange = { checked ->
                                    if (editEvent.eventType == EventType.EVENT) {
                                        onEditEvent { copy(singleDivision = checked) }
                                    }
                                },
                            )
                        }
                    }

                    if (editEvent.eventType != EventType.EVENT) {
                        Text(
                            "Leagues and tournaments are always team events and use a single division.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(localImageScheme.current.onSurface),
                        )
                    }

                    if (isNewEvent) {
                        AnimatedVisibility(!editEvent.teamSignup) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.Top,
                            ) {
                                Box(modifier = Modifier.weight(1f)) {
                                    LabeledCheckboxRow(
                                        checked = addSelfToEvent,
                                        label = "Join as participant",
                                        onCheckedChange = {
                                            addSelfToEvent = it
                                            onAddCurrentUser(it)
                                        },
                                    )
                                }
                                Box(modifier = Modifier.weight(1f))
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        NumberInputField(
                            modifier = Modifier.weight(1f),
                            value = editEvent.maxParticipants.toString(),
                            label = label,
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
                            errorMessage = if (isMaxParticipantsValid) "" else stringResource(
                                Res.string.value_too_low, 2
                            )
                        )
                        PlatformDropdown(
                            selectedValue = editEvent.teamSizeLimit.toString(),
                            onSelectionChange = { selected ->
                                onEditEvent { copy(teamSizeLimit = selected.toInt()) }
                            },
                            options = teamSizeOptions,
                            label = "Team Size Limit",
                            modifier = Modifier.weight(1f),
                            isError = !isTeamSizeValid,
                            supportingText = if (!isTeamSizeValid) {
                                "Team size must be at least 2."
                            } else {
                                ""
                            },
                        )
                    }

                    MultiSelectDropdownField(
                        selectedItems = selectedDivisions,
                        label = "Skill Levels",
                        isError = !isSkillLevelValid,
                        errorMessage = stringResource(Res.string.select_a_value),
                    ) { newSelection ->
                        selectedDivisions = newSelection.normalizeDivisionLabels()
                        onEditEvent { copy(divisions = selectedDivisions) }
                    }

                    if (editEvent.eventType == EventType.LEAGUE) {
                        LeagueConfigurationFields(
                            leagueConfig = editEvent.toLeagueConfig(),
                            playoffConfig = editEvent.toTournamentConfig(),
                            onLeagueConfigChange = { updated ->
                                onEditEvent { withLeagueConfig(updated) }
                            },
                            onPlayoffConfigChange = { updated ->
                                onEditTournament { withTournamentConfig(updated) }
                            },
                        )
                        if (isNewEvent) {
                            val selectedSport = sports.firstOrNull { it.id == editEvent.sportId }
                            LeagueScoringConfigFields(
                                config = leagueScoringConfig,
                                sport = selectedSport,
                                onConfigChange = onLeagueScoringConfigChange,
                            )
                        }

                        if (!isLeagueGamesValid) {
                            Text(
                                "Games per opponent must be at least 1.",
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                        if (!isLeagueDurationValid) {
                            Text(
                                if (editEvent.usesSets) {
                                    "Set duration must be at least 5 minutes and sets must be Best of 1, 3, or 5."
                                } else {
                                    "Match duration must be at least 15 minutes."
                                },
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                        if (!isLeaguePointsValid) {
                            Text(
                                "Points to victory must be greater than 0 for every configured set.",
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                        if (!isLeaguePlayoffTeamsValid) {
                            Text(
                                "Playoff team count must be at least 2 when playoffs are enabled.",
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }

                    if (editEvent.eventType == EventType.TOURNAMENT) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Box(modifier = Modifier.weight(1f)) {
                                LabeledCheckboxRow(
                                    checked = editEvent.doubleElimination,
                                    label = "Double Elimination",
                                    onCheckedChange = { checked ->
                                        onEditTournament {
                                            copy(
                                                doubleElimination = checked,
                                                loserBracketPointsToVictory = listOf(21),
                                                loserSetCount = 1
                                            )
                                        }
                                    },
                                )
                            }
                            Box(modifier = Modifier.weight(1f))
                        }

                        PlatformTextField(
                            value = editEvent.prize,
                            onValueChange = {
                                if (it.length <= 50) onEditTournament {
                                    copy(prize = it)
                                }
                            },
                            label = "Prize",
                            supportingText = "If there is a prize, enter it here"
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            if (!isNewEvent) {
                                NumberInputField(
                                    modifier = Modifier.weight(1f),
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
                                    supportingText = if (!isFieldCountValid) stringResource(
                                        Res.string.value_too_low, 1
                                    ) else "",
                                )
                            } else {
                                Box(modifier = Modifier.weight(1f))
                            }

                            PlatformDropdown(
                                selectedValue = editEvent.winnerSetCount.toString(),
                                onSelectionChange = { selected ->
                                    val newValue = selected.toInt()
                                    onEditTournament {
                                        copy(
                                            winnerSetCount = newValue,
                                            winnerBracketPointsToVictory = List(newValue) { 21 }
                                        )
                                    }
                                },
                                options = setCountOptions,
                                label = "Winner Set Count",
                                modifier = Modifier.weight(1f),
                                isError = !isWinnerSetCountValid,
                                supportingText = if (!isWinnerSetCountValid) {
                                    "Winner set count must be 1, 3, or 5."
                                } else {
                                    ""
                                },
                            )
                        }

                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            val constrainedWinnerSetCount = remember(editEvent.winnerSetCount) {
                                maxOf(1, minOf(editEvent.winnerSetCount, 5))
                            }

                            val focusRequesters = remember(constrainedWinnerSetCount) {
                                List(constrainedWinnerSetCount) { FocusRequester() }
                            }

                            FlowRow(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(
                                    4.dp, Alignment.CenterHorizontally
                                ),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                repeat(constrainedWinnerSetCount) { index ->
                                    PointsTextField(
                                        value = editEvent.winnerBracketPointsToVictory.getOrNull(
                                            index
                                        )?.toString() ?: "",
                                        label = "Set ${index + 1} Points",
                                        onValueChange = { newValue ->
                                            if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                                                val winnerPoints = if (newValue.isBlank()) {
                                                    0
                                                } else {
                                                    if (editEvent.winnerBracketPointsToVictory.getOrNull(
                                                            index
                                                        ) == 0 && newValue.toInt() >= 10
                                                    ) {
                                                        newValue.toInt() / 10
                                                    } else {
                                                        newValue.toInt()
                                                    }
                                                }
                                                onEditTournament {
                                                    copy(
                                                        winnerBracketPointsToVictory = editEvent.winnerBracketPointsToVictory.toMutableList()
                                                            .apply {
                                                                while (size <= index) add(0)
                                                                set(index, winnerPoints)
                                                            }
                                                    )
                                                }
                                            }
                                        },
                                        isError = editEvent.winnerBracketPointsToVictory.getOrNull(
                                            index
                                        )?.let { it <= 0 } ?: true,
                                        errorMessage = "Points must be greater than 0",
                                        focusRequester = focusRequesters[index],
                                        nextFocus = {
                                            if (index < constrainedWinnerSetCount - 1) {
                                                focusRequesters[index + 1].requestFocus()
                                            }
                                        })
                                }
                            }
                            if (!isWinnerPointsValid) {
                                Text(
                                    text = "Winner points must be greater than 0 for every set.",
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                        }

                        if (editEvent.doubleElimination) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.Top,
                            ) {
                                PlatformDropdown(
                                    selectedValue = editEvent.loserSetCount.toString(),
                                    onSelectionChange = { selected ->
                                        val newValue = selected.toInt()
                                        onEditTournament {
                                            copy(
                                                loserSetCount = newValue,
                                                loserBracketPointsToVictory = List(newValue) { 21 }
                                            )
                                        }
                                    },
                                    options = setCountOptions,
                                    label = "Loser Set Count",
                                    modifier = Modifier.weight(1f),
                                    isError = !isLoserSetCountValid,
                                    supportingText = if (!isLoserSetCountValid) {
                                        "Loser set count must be 1, 3, or 5."
                                    } else {
                                        ""
                                    },
                                )
                                Box(modifier = Modifier.weight(1f))
                            }

                            val constrainedLoserSetCount = remember(editEvent.loserSetCount) {
                                maxOf(1, minOf(editEvent.loserSetCount, 5))
                            }

                            val loserFocusRequesters = remember(constrainedLoserSetCount) {
                                List(constrainedLoserSetCount) { FocusRequester() }
                            }

                            FlowRow(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(
                                    4.dp, Alignment.CenterHorizontally
                                ),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                repeat(constrainedLoserSetCount) { index ->
                                    PointsTextField(
                                        value = editEvent.loserBracketPointsToVictory.getOrNull(
                                            index
                                        )?.toString() ?: "",
                                        label = "Set ${index + 1} Points",
                                        onValueChange = { newValue ->
                                            if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                                                val loserPoints = if (newValue.isBlank()) {
                                                    0
                                                } else {
                                                    newValue.toInt()
                                                }
                                                onEditTournament {
                                                    copy(
                                                        loserBracketPointsToVictory = editEvent.loserBracketPointsToVictory.toMutableList()
                                                            .apply {
                                                                while (size <= index) add(0)
                                                                set(index, loserPoints)
                                                            })
                                                }
                                            }
                                        },
                                        isError = editEvent.loserBracketPointsToVictory.getOrNull(
                                            index
                                        )?.let { it <= 0 } ?: true,
                                        errorMessage = "Points must be greater than 0",
                                        focusRequester = loserFocusRequesters[index],
                                        nextFocus = {
                                            if (index < constrainedLoserSetCount - 1) {
                                                loserFocusRequesters[index + 1].requestFocus()
                                            }
                                        })
                                }
                            }
                            if (!isLoserPointsValid) {
                                Text(
                                    text = "Loser points must be greater than 0 for every set.",
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                            Spacer(Modifier.height(32.dp))
                        }
                    }
                })

                if (isNewEvent && (editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT)) {
                    animatedCardSection(
                        sectionId = "facility_schedule",
                        sectionTitle = "Facilities & Scheduling",
                        collapsibleInEditMode = true,
                        defaultExpandedInEditMode = false,
                        isEditMode = editView,
                        animationDelay = 450,
                        viewContent = {
                            CardSection("Field Count", (editEvent.fieldCount ?: 0).toString())
                            if (editEvent.eventType == EventType.LEAGUE) {
                                CardSection("Weekly Timeslots", "${eventWithRelations.timeSlots.size}")
                            }
                        },
                        editContent = {
                            LeagueScheduleFields(
                                fieldCount = fieldCount,
                                fields = editableFields,
                                slots = leagueTimeSlots,
                                onFieldCountChange = { count ->
                                    fieldCount = count
                                    onSelectFieldCount(count)
                                },
                                onFieldNameChange = onUpdateLocalFieldName,
                                onFieldDivisionsChange = onUpdateLocalFieldDivisions,
                                onAddSlot = onAddLeagueTimeSlot,
                                onUpdateSlot = onUpdateLeagueTimeSlot,
                                onRemoveSlot = onRemoveLeagueTimeSlot,
                                slotErrors = leagueSlotErrors,
                                showSlotEditor = editEvent.eventType == EventType.LEAGUE,
                                fieldCountError = if (!isFieldCountValid) {
                                    "Field count must be at least 1."
                                } else {
                                    null
                                },
                            )
                            if (!isLeagueSlotsValid && editEvent.eventType == EventType.LEAGUE) {
                                Text(
                                    text = "Fix league timeslot issues before continuing.",
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                        },
                    )
                }
            }
        }
    }
    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            val selected = selectedInstant ?: Clock.System.now()
            onEditEvent {
                if (eventType == EventType.EVENT) {
                    copy(start = selected)
                } else {
                    copy(start = selected, end = selected)
                }
            }
            showStartPicker = false
        },
        onDismissRequest = { showStartPicker = false },
        showPicker = showStartPicker && !rentalTimeLocked,
        getTime = true,
        canSelectPast = false,
    )

    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            onEditEvent { copy(end = selectedInstant ?: Clock.System.now()) }
            showEndPicker = false
        },
        onDismissRequest = { showEndPicker = false },
        showPicker = showEndPicker && editEvent.eventType == EventType.EVENT && !rentalTimeLocked,
        getTime = true,
        canSelectPast = false,
    )

    EventMap(
        component = mapComponent,
        onEventSelected = { showImageSelector = true },
        onPlaceSelected = { place ->
            if (editView) {
                onPlaceSelected(place)
                previousSelection = LatLng(place.coordinates[1], place.coordinates[0])
            }
        },
        canClickPOI = editView,
        focusedLocation = if (editEvent.location.isNotBlank()) {
            editEvent.let { LatLng(it.lat, it.long) }
        } else if (previousSelection != null) {
            previousSelection!!
        } else {
            currentLocation ?: LatLng(0.0, 0.0)
        },
        focusedEvent = if (event.location.isNotBlank()) {
            event
        } else {
            null
        },
        revealCenter = revealCenter,
        onBackPressed = { mapComponent.toggleMap() },
    )

    // ImagePickerKMP Integration
    if (showUploadImagePicker) {
        GalleryPickerLauncher(
            onPhotosSelected = { photos ->
            showUploadImagePicker = false
            if (photos.isNotEmpty()) {
                onUploadSelected(photos.first())
            }
        }, onError = { error ->
            Napier.d("Error uploading image: $error")
            showUploadImagePicker = false
        }, onDismiss = {
            showUploadImagePicker = false
        }, allowMultiple = false, mimeTypes = listOf(MimeType.IMAGE_JPEG, MimeType.IMAGE_PNG,
                MimeType.IMAGE_WEBP)
        )
    }

    var showImageDelete by remember { mutableStateOf(false) }
    var deleteImage by remember { mutableStateOf("") }

    val loader = rememberNetworkLoader()
    val dominantColorState = rememberDominantColorState(loader)

    LaunchedEffect(editEvent.imageId) {
        if (editEvent.imageId.isNotBlank()) {
            isColorLoaded = false
            loader.load(Url(getImageUrl(editEvent.imageId)))
            dominantColorState.updateFrom(Url(getImageUrl(editEvent.imageId)))
            onEditEvent { copy(imageId = editEvent.imageId) }
            isColorLoaded = true
        }
    }

    if (showImageSelector) {
        Dialog(onDismissRequest = {
            showImageSelector = false
        }) {
            Card {
                SelectEventImage(
                    onSelectedImage = { onEditEvent(it) },
                    imageIds = (imageIds + editEvent.imageId)
                        .filter(String::isNotBlank)
                        .distinct(),
                    onUploadSelected = { showUploadImagePicker = true },
                    onDeleteImage = {
                        showImageDelete = true
                        deleteImage = it
                    },
                    onConfirm = { showImageSelector = false },
                    onCancel = {
                        onEditEvent { copy(imageId = "") }
                        showImageSelector = false
                    })
            }


            if (showImageDelete) {
                AlertDialog(
                    onDismissRequest = { showImageDelete = false },
                    title = { Text("Delete Image") },
                    text = { Text("Are you sure you want to delete this image?") },
                    confirmButton = {
                        TextButton(onClick = {
                            onDeleteImage(deleteImage)
                            onEditEvent { copy(imageId = "") }
                            showImageDelete = false
                        }) {
                            Text("Delete")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showImageDelete = false }) {
                            Text("Cancel")
                        }
                    })
            }
        }
    }
}

fun LazyListScope.animatedCardSection(
    sectionId: String,
    sectionTitle: String? = null,
    collapsibleInEditMode: Boolean = false,
    defaultExpandedInEditMode: Boolean = true,
    isEditMode: Boolean,
    animationDelay: Int = 0,
    viewContent: @Composable() (ColumnScope.() -> Unit),
    editContent: @Composable() (ColumnScope.() -> Unit)
) {
    item(key = sectionId) {
        var expanded by rememberSaveable(sectionId, isEditMode) {
            mutableStateOf(if (isEditMode) defaultExpandedInEditMode else true)
        }
        LaunchedEffect(isEditMode) {
            if (!isEditMode) {
                expanded = true
            }
        }

        Card(
            modifier = Modifier.fillMaxSize(),
            shape = RectangleShape,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        ) {
            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp, horizontal = 16.dp),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (isEditMode && collapsibleInEditMode && sectionTitle != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = sectionTitle,
                                style = MaterialTheme.typography.titleMedium,
                                color = Color(localImageScheme.current.onSurface),
                            )
                            TextButton(onClick = { expanded = !expanded }) {
                                Icon(
                                    imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                    contentDescription = if (expanded) "Collapse section" else "Expand section",
                                )
                            }
                        }
                    }

                    AnimatedVisibility(
                        visible = !isEditMode || !collapsibleInEditMode || expanded,
                    ) {
                        AnimatedContent(
                            targetState = isEditMode,
                            transitionSpec = { transitionSpec(animationDelay) },
                            label = "cardTransition",
                        ) { editMode ->
                            Column(
                                modifier = Modifier.fillMaxWidth(),
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
            }
        }
    }
}

@Composable
fun ColumnScope.CardSection(
    title: String, content: String
) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        textAlign = TextAlign.Center,
        color = Color(localImageScheme.current.onSurface)
    )
    Text(
        text = content,
        style = MaterialTheme.typography.bodyMedium,
        textAlign = TextAlign.Center,
        color = Color(localImageScheme.current.onSurface)
    )
}

@Composable
private fun LabeledCheckboxRow(
    checked: Boolean,
    label: String,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = checked,
            enabled = enabled,
            onCheckedChange = onCheckedChange,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = Color(localImageScheme.current.onSurface),
        )
    }
}

private fun computeLeagueSlotErrors(slots: List<TimeSlot>): Map<Int, String> {
    if (slots.isEmpty()) return emptyMap()

    val errors = mutableMapOf<Int, String>()
    slots.forEachIndexed { index, slot ->
        val fieldId = slot.scheduledFieldId
        val days = slot.normalizedDaysOfWeek()
        val daySet = days.toSet()
        val start = slot.startTimeMinutes
        val end = slot.endTimeMinutes

        val requiredMissing = when {
            fieldId.isNullOrBlank() -> "Select a field."
            days.isEmpty() -> "Select at least one day."
            start == null -> "Select a start time."
            end == null -> "Select an end time."
            end <= start -> "Timeslot must end after it starts."
            else -> null
        }
        if (requiredMissing != null) {
            errors[index] = requiredMissing
            return@forEachIndexed
        }

        val hasOverlap = slots.withIndex().any { (otherIndex, other) ->
            if (otherIndex == index) return@any false
            if (other.scheduledFieldId != fieldId) return@any false
            val otherDays = other.normalizedDaysOfWeek()
            if (otherDays.isEmpty() || otherDays.none(daySet::contains)) return@any false

            val otherStart = other.startTimeMinutes
            val otherEnd = other.endTimeMinutes
            if (otherStart == null || otherEnd == null || otherEnd <= otherStart) return@any false
            slotsOverlap(start!!, end!!, otherStart, otherEnd)
        }

        if (hasOverlap) {
            errors[index] = "Overlaps with another timeslot for this field."
        }
    }
    return errors
}

private fun slotsOverlap(startA: Int, endA: Int, startB: Int, endB: Int): Boolean {
    return maxOf(startA, startB) < minOf(endA, endB)
}

@Composable
fun BackgroundImage(
    modifier: Modifier, imageUrl: String
) {
    Box(modifier) {
        if (imageUrl.isNotBlank()) {
            AsyncImage(
                model = imageUrl,
                contentDescription = "Event Image",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}
