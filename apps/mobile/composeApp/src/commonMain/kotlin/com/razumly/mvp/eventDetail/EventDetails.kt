package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PictureInPicture
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.blur
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import coil3.compose.AsyncImage
import com.materialkolor.scheme.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.MoneyInputField
import com.razumly.mvp.core.presentation.composables.PaymentProcessorButton
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.getScreenHeight
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.teamSizeFormat
import com.razumly.mvp.core.presentation.util.toDivisionCase
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.presentation.util.transitionSpec
import com.razumly.mvp.eventDetail.composables.CancellationRefundOptions
import com.razumly.mvp.eventDetail.composables.LoserSetCountDropdown
import com.razumly.mvp.eventDetail.composables.MultiSelectDropdownField
import com.razumly.mvp.eventDetail.composables.NumberInputField
import com.razumly.mvp.eventDetail.composables.PointsTextField
import com.razumly.mvp.eventDetail.composables.RegistrationOptions
import com.razumly.mvp.eventDetail.composables.SelectEventImage
import com.razumly.mvp.eventDetail.composables.TeamSizeLimitDropdown
import com.razumly.mvp.eventDetail.composables.TextInputField
import com.razumly.mvp.eventDetail.composables.WinnerSetCountDropdown
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
import dev.chrisbanes.haze.rememberHazeState
import dev.icerock.moko.geo.LatLng
import io.github.aakira.napier.Napier
import io.github.ismoy.imagepickerkmp.GalleryPhotoHandler
import io.github.ismoy.imagepickerkmp.GalleryPickerLauncher
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
    imageUrls: List<String>,
    eventWithRelations: EventAbsWithRelations,
    editEvent: EventAbs,
    editView: Boolean,
    navPadding: PaddingValues = PaddingValues(),
    isNewEvent: Boolean,
    onHostCreateAccount: () -> Unit,
    onPlaceSelected: (MVPPlace?) -> Unit,
    onEditEvent: (EventImp.() -> EventImp) -> Unit,
    onEditTournament: (Tournament.() -> Tournament) -> Unit,
    onAddCurrentUser: (Boolean) -> Unit,
    onEventTypeSelected: (EventType) -> Unit,
    onSelectFieldCount: (Int) -> Unit,
    onUploadSelected: (GalleryPhotoHandler.PhotoResult) -> Unit,
    onDeleteImage: (String) -> Unit,
    joinButton: @Composable (isValid: Boolean) -> Unit
) {
    val event = eventWithRelations.event
    val host = eventWithRelations.host
    val hazeState = rememberHazeState()
    val scrollState = rememberScrollState()
    var isValid by remember { mutableStateOf(false) }
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
    var revealCenter by remember { mutableStateOf(Offset.Zero) }
    var showImageSelector by rememberSaveable { mutableStateOf(false) }
    var showUploadImagePicker by rememberSaveable { mutableStateOf(false) }
    var previousSelection by remember { mutableStateOf<LatLng?>(null) }

    // Validation states
    var isNameValid by remember { mutableStateOf(editEvent.name.isNotBlank()) }
    var isPriceValid by remember { mutableStateOf(editEvent.price >= 0) }
    var isMaxParticipantsValid by remember { mutableStateOf(editEvent.maxParticipants > 1) }
    var isTeamSizeValid by remember { mutableStateOf(editEvent.teamSizeLimit >= 2) }
    var isWinnerSetCountValid by remember { mutableStateOf(true) }
    var isLoserSetCountValid by remember { mutableStateOf(true) }
    var isWinnerPointsValid by remember { mutableStateOf(true) }
    var isLoserPointsValid by remember { mutableStateOf(true) }
    var isLocationValid by remember { mutableStateOf(editEvent.location.isNotBlank() && editEvent.lat != 0.0 && editEvent.long != 0.0) }
    var isFieldCountValid by remember { mutableStateOf(true) }
    var isSkillLevelValid by remember { mutableStateOf(true) }
    var isUploadingImage by remember { mutableStateOf(false) }

    var fieldCount by remember { mutableStateOf(0) }
    var selectedDivisions by remember { mutableStateOf(editEvent.divisions) }
    var addSelfToEvent by remember { mutableStateOf(false) }

    val currentLocation by mapComponent.currentLocation.collectAsState()

    LaunchedEffect(editEvent, fieldCount) {
        isNameValid = editEvent.name.isNotBlank()
        isPriceValid = editEvent.price >= 0
        isMaxParticipantsValid = editEvent.maxParticipants > 1
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
            isPriceValid && isMaxParticipantsValid && isTeamSizeValid && isWinnerSetCountValid && isWinnerPointsValid && isLoserSetCountValid && isLoserPointsValid && isLocationValid && isSkillLevelValid && isFieldCountValid
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
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().verticalScroll(scrollState)) {
                Box(Modifier.fillMaxSize()) {
                    BackgroundImage(
                        Modifier.matchParentSize().hazeSource(hazeState),
                        if (!editView) event.imageUrl else editEvent.imageUrl,
                    )
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
                                    endY = 2000f
                                )
                            }.padding(navPadding).padding(horizontal = 16.dp).padding(top = 32.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            // Event Title - Animated
                            AnimatedCardSection(
                                isOnSurface = false,
                                isEditMode = editView,
                                animationDelay = 0,
                                hazeState = hazeState,
                                viewContent = {
                                    Text(
                                        text = event.name,
                                        style = MaterialTheme.typography.headlineMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(imageScheme.primaryFixed)
                                    )
                                },
                                editContent = {
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
                                })

                            // Location Display
                            Text(
                                text = if (!editView) event.location else editEvent.location,
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color(imageScheme.primaryFixed)
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
                            Button(
                                onClick = { showImageSelector = true },
                                modifier = Modifier.align(Alignment.CenterHorizontally)
                            ) {
                                Icon(Icons.Default.PictureInPicture, contentDescription = null)
                                Text("Choose Image")
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

                            // Description Card
                            AnimatedCardSection(
                                isEditMode = editView,
                                animationDelay = 100,
                                hazeState = hazeState,
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
                            AnimatedCardSection(
                                isEditMode = editView,
                                animationDelay = 150,
                                hazeState = hazeState,
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
                                            modifier = Modifier.weight(1.2f)
                                        )
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
                                            modifier = Modifier.weight(1f)
                                        )
                                    }
                                })

                            // Price Card
                            AnimatedCardSection(
                                isEditMode = editView,
                                animationDelay = 200,
                                hazeState = hazeState,
                                viewContent = {
                                    CardSection("Price", event.price.moneyFormat())

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
                                        PaymentProcessorButton(
                                            onClick = onHostCreateAccount,
                                            paymentProcessor,
                                            "Create Stripe Connect Account to Change Price",
                                        )
                                    }
                                    MoneyInputField(
                                        value = (editEvent.price * 100).toInt().toString(),
                                        label = "Price",
                                        enabled = hostHasAccount,
                                        onValueChange = { newText ->
                                            if (newText.isBlank()) {
                                                onEditEvent { copy(price = 0.0) }
                                                return@MoneyInputField
                                            }
                                            val newCleaned = newText.filter { it.isDigit() }
                                            onEditEvent { copy(price = newCleaned.toDouble() / 100) }
                                        },
                                        isError = !isPriceValid,
                                        supportingText = if (isPriceValid) stringResource(Res.string.free_entry_hint) else stringResource(
                                            Res.string.invalid_price
                                        )
                                    )
                                    if (editEvent.price > 0.0) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text("Is Taxed")
                                            Checkbox(
                                                checked = editEvent.isTaxed, onCheckedChange = {
                                                    onEditEvent { copy(isTaxed = it) }
                                                })
                                        }
                                        CancellationRefundOptions(
                                            selectedOption = editEvent.cancellationRefundHours,
                                            onOptionSelected = {
                                                onEditEvent {
                                                    copy(
                                                        cancellationRefundHours = it
                                                    )
                                                }
                                            },
                                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                                        )
                                    }
                                })

                            AnimatedCardSection(
                                isEditMode = editView,
                                animationDelay = 250,
                                hazeState = hazeState,
                                viewContent = {
                                    CardSection(
                                        "Registration Cutoff",
                                        when (editEvent.registrationCutoffHours) {
                                            0 -> "No Cutoff"
                                            1 -> "24 hours before event"
                                            2 -> "48 hours before event"
                                            else -> "No cutoff"
                                        }
                                    )
                                },
                                editContent = {
                                    RegistrationOptions(
                                        selectedOption = editEvent.registrationCutoffHours,
                                        onOptionSelected = {
                                            onEditEvent { copy(registrationCutoffHours = it) }
                                        },
                                        modifier = Modifier.fillMaxWidth()
                                    )
                                })

                            // Date Card
                            AnimatedCardSection(
                                isEditMode = editView,
                                animationDelay = 300,
                                hazeState = hazeState,
                                viewContent = {
                                    CardSection("Date", dateRangeText)
                                },
                                editContent = {
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        PlatformTextField(
                                            value = editEvent.start.toLocalDateTime(
                                                TimeZone.currentSystemDefault()
                                            ).format(dateTimeFormat),
                                            onValueChange = {},
                                            modifier = Modifier.weight(1f),
                                            label = "Start Date & Time",
                                            readOnly = true,
                                            onTap = { showStartPicker = true })
                                        PlatformTextField(
                                            value = editEvent.end.toLocalDateTime(
                                                TimeZone.currentSystemDefault()
                                            ).format(dateTimeFormat),
                                            onValueChange = {},
                                            modifier = Modifier.weight(1f),
                                            label = "End Date & Time",
                                            readOnly = true,
                                            onTap = { showStartPicker = true })
                                    }
                                })

                            // Divisions Card
                            AnimatedCardSection(
                                isEditMode = editView,
                                animationDelay = 350,
                                hazeState = hazeState,
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
                                        modifier = Modifier.fillMaxWidth(.5f)
                                    ) { newSelection ->
                                        selectedDivisions = newSelection
                                        onEditEvent { copy(divisions = selectedDivisions) }
                                    }
                                })

                            // Specifics Card
                            AnimatedCardSection(
                                isEditMode = editView,
                                animationDelay = 400,
                                hazeState = hazeState,
                                viewContent = {
                                    Text(
                                        "Specifics",
                                        style = MaterialTheme.typography.titleMedium,
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
                                    if (event is Tournament) {
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
                                },
                                editContent = {
                                    Text("Specifics", style = MaterialTheme.typography.titleMedium)

                                    val label =
                                        if (!editEvent.teamSignup) stringResource(Res.string.max_players)
                                        else stringResource(Res.string.max_teams)
                                    NumberInputField(
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
                                            Res.string.value_too_low, 1
                                        )
                                    )
                                    TeamSizeLimitDropdown(
                                        selectedTeamSize = editEvent.teamSizeLimit,
                                        onTeamSizeSelected = { onEditEvent { copy(teamSizeLimit = it) } },
                                        modifier = Modifier.fillMaxWidth(.5f)
                                    )

                                    if (event is EventImp) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.padding(top = 8.dp)
                                        ) {
                                            Checkbox(
                                                checked = editEvent.teamSignup,
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
                                                Checkbox(
                                                    checked = addSelfToEvent, onCheckedChange = {
                                                        addSelfToEvent = it
                                                        onAddCurrentUser(it)
                                                    })
                                                Text(text = "Join as participant")
                                            }
                                        }
                                    }

                                    // Tournament-specific fields
                                    if (editEvent is Tournament) {
                                        PlatformTextField(
                                            value = editEvent.prize,
                                            onValueChange = {
                                                if (it.length <= 50) onEditTournament {
                                                    copy(
                                                        prize = it
                                                    )
                                                }
                                            },
                                            label = "Prize",
                                            supportingText = "If there is a prize, enter it here"
                                        )

                                        PlatformTextField(
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
                                            keyboardType = "number",
                                            isError = !isFieldCountValid,
                                            supportingText = if (!isFieldCountValid) stringResource(
                                                Res.string.value_too_low, 0
                                            ) else "",
                                        )

                                        WinnerSetCountDropdown(
                                            selectedCount = editEvent.winnerSetCount,
                                            onCountSelected = { newValue ->
                                                onEditTournament {
                                                    copy(
                                                        winnerSetCount = newValue,
                                                        winnerBracketPointsToVictory = List(newValue) { 21 })
                                                }
                                            },
                                            modifier = Modifier.fillMaxWidth(.5f)
                                                .padding(bottom = 16.dp)
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
                                                                val winnerPoints =
                                                                    if (newValue.isBlank()) {
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
                                                                                while (size <= index) add(
                                                                                    0
                                                                                )
                                                                                set(
                                                                                    index,
                                                                                    winnerPoints
                                                                                )
                                                                            })
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
                                        }

                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Checkbox(
                                                checked = editEvent.doubleElimination,
                                                onCheckedChange = { checked ->
                                                    onEditTournament {
                                                        copy(
                                                            doubleElimination = checked,
                                                            loserBracketPointsToVictory = listOf(21),
                                                            loserSetCount = 1
                                                        )
                                                    }
                                                })
                                            Text("Double Elimination")
                                        }

                                        if (editEvent.doubleElimination) {
                                            if (editEvent.doubleElimination) {
                                                LoserSetCountDropdown(
                                                    selectedCount = editEvent.loserSetCount,
                                                    onCountSelected = { newValue ->
                                                        onEditTournament {
                                                            copy(
                                                                loserSetCount = newValue,
                                                                loserBracketPointsToVictory = List(
                                                                    newValue
                                                                ) { 21 })
                                                        }
                                                    },
                                                    modifier = Modifier.fillMaxWidth(.5f)
                                                        .padding(bottom = 16.dp)
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
                                                                val loserPoints =
                                                                    if (newValue.isBlank()) {
                                                                        0
                                                                    } else {
                                                                        newValue.toInt()
                                                                    }
                                                                onEditTournament {
                                                                    copy(
                                                                        loserBracketPointsToVictory = editEvent.loserBracketPointsToVictory.toMutableList()
                                                                            .apply {
                                                                                while (size <= index) add(
                                                                                    0
                                                                                )
                                                                                set(
                                                                                    index,
                                                                                    loserPoints
                                                                                )
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
                                        }
                                    }
                                })
                            Spacer(Modifier.height(32.dp))
                        }
                    }
                }
            }
        }
        PlatformDateTimePicker(
            onDateSelected = { selectedInstant ->
                onEditEvent { copy(start = selectedInstant ?: Clock.System.now()) }
                showStartPicker = false
            },
            onDismissRequest = { showStartPicker = false },
            showPicker = showStartPicker,
            getTime = true,
            canSelectPast = false,
        )

        PlatformDateTimePicker(
            onDateSelected = { selectedInstant ->
                onEditEvent { copy(end = selectedInstant ?: Clock.System.now()) }
                showEndPicker = false
            },
            onDismissRequest = { showEndPicker = false },
            showPicker = showEndPicker,
            getTime = true,
            canSelectPast = false,
        )

        EventMap(
            component = mapComponent,
            onEventSelected = { showImageSelector = true },
            onPlaceSelected = { place ->
                if (editView) {
                    onPlaceSelected(place)
                    previousSelection = LatLng(place.lat, place.long)
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


        // ImagePickerKMP Integration
        if (showUploadImagePicker) {
            GalleryPickerLauncher(
                onPhotosSelected = { photos ->
                    showUploadImagePicker = false
                    if (photos.isNotEmpty()) {
                        onUploadSelected(photos.first())
                    }
                },
                onError = { error ->
                    Napier.d("Error uploading image: $error")
                    showUploadImagePicker = false
                },
                onDismiss = {
                    showUploadImagePicker = false
                },
                allowMultiple = false,
                mimeTypes = listOf("image/jpeg", "image/png", "image/webp")
            )
        }

        var showImageDelete by remember { mutableStateOf(false) }
        var deleteImageURL by remember { mutableStateOf("") }
        if (showImageSelector) {
            Dialog(onDismissRequest = {
                showImageSelector = false
            }) {
                Card {
                    SelectEventImage(
                        onSelectedImage = { onEditEvent(it) },
                        imageUrls = imageUrls,
                        onUploadSelected = { showUploadImagePicker = true },
                        onDeleteImage = {
                            showImageDelete = true
                            deleteImageURL = it
                        },
                        onConfirm = { showImageSelector = false },
                        onCancel = {
                            onEditEvent { copy(imageUrl = "") }
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
                                onDeleteImage(deleteImageURL)
                                onEditEvent { copy(imageUrl = "") }
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
}

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun AnimatedCardSection(
    isOnSurface: Boolean = true,
    isEditMode: Boolean,
    animationDelay: Int = 0,
    hazeState: HazeState,
    viewContent: @Composable() (ColumnScope.() -> Unit),
    editContent: @Composable() (ColumnScope.() -> Unit)
) {
    val columnModifier = if (isOnSurface) {
        Modifier.fillMaxWidth()
            .hazeEffect(hazeState, CupertinoMaterials.thin(Color(localImageScheme.current.surface)))
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
fun BackgroundImage(modifier: Modifier, imageUrl: String) {
    val imageHeight = (getScreenHeight() * 0.75f).dp
    var imageWidth by remember { mutableStateOf(0.dp) }
    val density = LocalDensity.current

    Column(modifier) {
        if (imageUrl.isNotBlank()) {
            // First image: Fixed height, width determined by aspect ratio
            AsyncImage(
                model = imageUrl,
                contentDescription = "Event Image",
                modifier = Modifier
                    .height(imageHeight)
                    .onGloballyPositioned { layoutCoordinates ->
                        val widthPx = layoutCoordinates.size.width
                        imageWidth = with(density) { widthPx.toDp() }
                    },
                contentScale = ContentScale.Crop,
            )

            // Second image: Match the measured width of the first image
            if (imageWidth > 0.dp) { // Only show when width is measured
                AsyncImage(
                    model = imageUrl,
                    contentDescription = "Flipped Hazy Background",
                    modifier = Modifier
                        .width(imageWidth)
                        .fillMaxHeight()
                        .graphicsLayer {
                            clip = true
                            rotationX = 180f
                        }
                        .graphicsLayer {
                            transformOrigin = TransformOrigin(0.5f, 1f)
                            scaleY = 50f // Adjust vertical scaling as needed
                        }
                        .blur(16.dp),
                    contentScale = ContentScale.Crop,
                )
            }
        }
    }
}
