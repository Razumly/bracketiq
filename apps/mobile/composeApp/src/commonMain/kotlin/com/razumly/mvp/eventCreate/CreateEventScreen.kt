package com.razumly.mvp.eventCreate

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.FabPosition
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.ChildStack
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.addOfficialPosition
import com.razumly.mvp.core.data.dataTypes.removeOfficialPosition
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.data.dataTypes.updateOfficialPosition
import com.razumly.mvp.core.data.dataTypes.updateOfficialUserPositions
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.PreparePaymentProcessor
import com.razumly.mvp.core.presentation.util.backAnimation
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventCreate.steps.Preview
import com.razumly.mvp.eventDetail.EventDetails
import com.razumly.mvp.eventDetail.toEventWithFullRelations
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import dev.icerock.moko.geo.LatLng
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.create_tournament
import mvp.composeapp.generated.resources.next
import mvp.composeapp.generated.resources.previous
import org.jetbrains.compose.resources.stringResource

@OptIn(ExperimentalDecomposeApi::class)
@Composable
fun CreateEventScreen(
    component: CreateEventComponent,
    mapComponent: MapComponent,
) {
    var canProceed by remember { mutableStateOf(false) }
    var validationErrors by remember { mutableStateOf<List<String>>(emptyList()) }
    var mapRevealCenter by remember { mutableStateOf(Offset.Zero) }
    var previousMapSelection by remember { mutableStateOf<LatLng?>(null) }
    val defaultEvent by component.defaultEvent.collectAsState()
    val newEventState by component.newEventState.collectAsState()
    val childStack by component.childStack.subscribeAsState()
    val eventImageUrls by component.eventImageUrls.collectAsState()
    val isRentalFlow by component.isRentalFlow.collectAsState()
    val sports by component.sports.collectAsState()
    val localFields by component.localFields.collectAsState()
    val leagueSlots by component.leagueSlots.collectAsState()
    val leagueScoringConfig by component.leagueScoringConfig.collectAsState()
    val suggestedUsers by component.suggestedUsers.collectAsState()
    val pendingStaffInvites by component.pendingStaffInvites.collectAsState()
    val showMap by mapComponent.showMap.collectAsState()
    val isEditing = true
    val currentUser by component.currentUser.collectAsState()
    val isDark = isSystemInDarkTheme()
    val loadingHandler = LocalLoadingHandler.current
    val errorHandler = LocalPopupHandler.current

    PreparePaymentProcessor(component)

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                errorHandler.showPopup(error)
            }
        }
    }

    var imageScheme by remember {
        mutableStateOf(
            DynamicScheme(
                seedColor = Color(newEventState.seedColor),
                isDark = isDark,
                specVersion = ColorSpec.SpecVersion.SPEC_2025,
                style = PaletteStyle.Neutral,
            )
        )
    }

    LaunchedEffect(newEventState) {
        imageScheme = DynamicScheme(
            seedColor = Color(newEventState.seedColor),
            isDark = isDark,
            specVersion = ColorSpec.SpecVersion.SPEC_2025,
            style = PaletteStyle.Neutral,
        )
    }

    LaunchedEffect(isRentalFlow, newEventState.eventType) {
        if (isRentalFlow && newEventState.eventType != EventType.EVENT) {
            component.onTypeSelected(EventType.EVENT)
        }
    }

    val eventWithRelations = remember(defaultEvent, newEventState) {
        defaultEvent
            .toEventWithFullRelations(listOf(), listOf())
            .copy(event = newEventState)
    }

    val eventWithCreateRelations = remember(eventWithRelations, sports, leagueSlots) {
        eventWithRelations.copy(
            sport = sports.firstOrNull { it.id == newEventState.sportId },
            timeSlots = leagueSlots,
        )
    }
    val selectedSport = remember(sports, newEventState.sportId) {
        sports.firstOrNull { it.id == newEventState.sportId }
    }

    val onEditEvent: (Event.() -> Event) -> Unit = remember(component, isRentalFlow) {
        { update ->
            component.updateEventField {
                update().applyCreateSelectionRules(isRentalFlow)
            }
        }
    }

    val onEditTournament: (Event.() -> Event) -> Unit = remember(component, isRentalFlow) {
        { update ->
            component.updateTournamentField {
                update().applyCreateSelectionRules(isRentalFlow)
            }
        }
    }

    val onEventTypeSelected: (EventType) -> Unit = remember(component, isRentalFlow) {
        { selectedType ->
            val normalizedType = if (isRentalFlow) EventType.EVENT else selectedType
            component.onTypeSelected(normalizedType)
            if (normalizedType == EventType.LEAGUE || normalizedType == EventType.TOURNAMENT) {
                component.updateEventField {
                    copy(teamSignup = true, singleDivision = true, noFixedEndDateTime = true)
                }
            }
        }
    }
    val onUpdateHostId: (String) -> Unit = remember(component) { component::updateHostId }
    val onUpdateAssistantHostIds: (List<String>) -> Unit =
        remember(component) { component::updateAssistantHostIds }
    val onUpdateDoTeamsOfficiate: (Boolean) -> Unit = remember(component) { component::updateDoTeamsOfficiate }
    val onUpdateTeamOfficialsMaySwap: (Boolean) -> Unit =
        remember(component) { component::updateTeamOfficialsMaySwap }
    val onAddOfficialId: (String) -> Unit = remember(component) { component::addOfficialId }
    val onRemoveOfficialId: (String) -> Unit = remember(component) { component::removeOfficialId }
    val onUpdateOfficialSchedulingMode: (OfficialSchedulingMode) -> Unit =
        remember(component) {
            { mode ->
                component.updateEventField {
                    copy(officialSchedulingMode = mode)
                }
            }
        }
    val onAddOfficialPosition: () -> Unit = remember(component, selectedSport) {
        {
            component.updateEventField {
                addOfficialPosition(sport = selectedSport)
            }
        }
    }
    val onUpdateOfficialPositionName: (String, String) -> Unit =
        remember(component, selectedSport) {
            { positionId, name ->
                component.updateEventField {
                    updateOfficialPosition(
                        positionId = positionId,
                        name = name,
                        sport = selectedSport,
                    )
                }
            }
        }
    val onUpdateOfficialPositionCount: (String, Int) -> Unit =
        remember(component, selectedSport) {
            { positionId, count ->
                component.updateEventField {
                    updateOfficialPosition(
                        positionId = positionId,
                        count = count,
                        sport = selectedSport,
                    )
                }
            }
        }
    val onRemoveOfficialPosition: (String) -> Unit = remember(component, selectedSport) {
        { positionId ->
            component.updateEventField {
                removeOfficialPosition(
                    positionId = positionId,
                    sport = selectedSport,
                )
            }
        }
    }
    val onUpdateOfficialUserPositions: (String, List<String>) -> Unit =
        remember(component, selectedSport) {
            { userId, positionIds ->
                component.updateEventField {
                    updateOfficialUserPositions(
                        userId = userId,
                        positionIds = positionIds,
                        sport = selectedSport,
                    )
                }
            }
        }
    val onSetPaymentPlansEnabled: (Boolean) -> Unit =
        remember(component) { component::setPaymentPlansEnabled }
    val onSetInstallmentCount: (Int) -> Unit = remember(component) { component::setInstallmentCount }
    val onUpdateInstallmentAmount: (Int, Int) -> Unit =
        remember(component) { component::updateInstallmentAmount }
    val onUpdateInstallmentDueDate: (Int, String) -> Unit =
        remember(component) { component::updateInstallmentDueDate }
    val onAddInstallmentRow: () -> Unit = remember(component) { component::addInstallmentRow }
    val onRemoveInstallmentRow: (Int) -> Unit = remember(component) { component::removeInstallmentRow }
    val onSearchUsers: (String) -> Unit = remember(component) { component::searchUsers }
    val onEnsureUserByEmail: suspend (String) -> Result<UserData> =
        remember(component) { { email -> component.ensureUserByEmail(email) } }
    val onAddPendingStaffInvite:
        suspend (String, String, String, Set<com.razumly.mvp.eventDetail.EventStaffRole>) -> Result<Unit> =
        remember(component) { { firstName, lastName, email, roles ->
            component.addPendingStaffInvite(firstName, lastName, email, roles)
        } }
    val onRemovePendingStaffInvite:
        (String, com.razumly.mvp.eventDetail.EventStaffRole?) -> Unit =
        remember(component) { component::removePendingStaffInvite }

    CircularRevealUnderlay(
        isRevealed = showMap,
        revealCenterInWindow = mapRevealCenter,
        animationDurationMillis = 800,
        modifier = Modifier.fillMaxSize(),
        backgroundContent = {
            EventMap(
                component = mapComponent,
                onEventSelected = { _ ->
                    mapComponent.toggleMap()
                },
                onPlaceSelected = { place ->
                    component.selectPlace(place)
                    previousMapSelection = LatLng(place.latitude, place.longitude)
                    mapComponent.toggleMap()
                },
                onPlaceSelectionPoint = { x, y ->
                    mapRevealCenter = Offset(x, y)
                },
                canClickPOI = true,
                focusedLocation = if (newEventState.location.isNotBlank()) {
                    LatLng(newEventState.lat, newEventState.long)
                } else if (previousMapSelection != null) {
                    previousMapSelection!!
                } else {
                    mapComponent.currentLocation.value ?: LatLng(0.0, 0.0)
                },
                focusedEvent = null,
                onBackPressed = mapComponent::toggleMap,
            )
        },
    ) {
        Scaffold(
            modifier = Modifier.padding(LocalNavBarPadding.current),
            floatingActionButton = {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    if (childStack.active.instance == CreateEventComponent.Child.EventInfo) {
                        Spacer(Modifier.width(48.dp))
                        FloatingActionButton(
                            onClick = {
                                if (canProceed) {
                                    component.nextStep()
                                } else {
                                    errorHandler.showPopup(buildValidationPopupMessage(validationErrors))
                                }
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = stringResource(Res.string.next)
                            )
                        }
                    } else {
                        FloatingActionButton(
                            onClick = {
                                component.previousStep()
                            }
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(Res.string.previous)
                            )
                        }
                        FloatingActionButton(
                            onClick = {
                                if (canProceed) {
                                    component.createEvent()
                                } else {
                                    errorHandler.showPopup(buildValidationPopupMessage(validationErrors))
                                }
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = stringResource(Res.string.create_tournament)
                            )
                        }
                    }
                }
            },
            floatingActionButtonPosition = FabPosition.Center,
            content = {
                ChildStack(childStack, animation = backAnimation(
                    backHandler = component.backHandler,
                    onBack = component::onBackClicked,
                )) { child ->
                    when (child.instance) {
                        is CreateEventComponent.Child.EventInfo -> EventDetails(
                            paymentProcessor = component,
                            mapComponent = mapComponent,
                            hostHasAccount = currentUser?.hasStripeAccount ?: false,
                            eventWithRelations = eventWithCreateRelations,
                            editEvent = newEventState,
                            navPadding = LocalNavBarPadding.current,
                            editView = isEditing,
                            isNewEvent = true,
                            rentalTimeLocked = isRentalFlow,
                            onAddCurrentUser = component::addUserToEvent,
                            imageScheme = imageScheme,
                            imageIds = eventImageUrls,
                            sports = sports,
                            editableFields = localFields,
                            leagueTimeSlots = leagueSlots,
                            leagueScoringConfig = leagueScoringConfig,
                            onHostCreateAccount = component::createAccount,
                            onPlaceSelected = component::selectPlace,
                            onEditEvent = onEditEvent,
                            onEditTournament = onEditTournament,
                            onEventTypeSelected = onEventTypeSelected,
                            onSportSelected = { sportId ->
                                onEditEvent { copy(sportId = sportId.takeIf(String::isNotBlank)) }
                            },
                            onSelectFieldCount = component::selectFieldCount,
                            onUpdateLocalFieldName = component::updateLocalFieldName,
                            onUpdateLocalFieldDivisions = component::updateLocalFieldDivisions,
                            onAddLeagueTimeSlot = component::addLeagueTimeSlot,
                            onUpdateLeagueTimeSlot = { index, updated ->
                                component.updateLeagueTimeSlot(index) { updated }
                            },
                            onRemoveLeagueTimeSlot = component::removeLeagueTimeSlot,
                            onLeagueScoringConfigChange = { updated ->
                                component.updateLeagueScoringConfig { updated }
                            },
                            pendingStaffInvites = pendingStaffInvites,
                            userSuggestions = suggestedUsers,
                            onSearchUsers = onSearchUsers,
                            onEnsureUserByEmail = onEnsureUserByEmail,
                            onAddPendingStaffInvite = onAddPendingStaffInvite,
                            onRemovePendingStaffInvite = onRemovePendingStaffInvite,
                            onUpdateHostId = onUpdateHostId,
                            onUpdateAssistantHostIds = onUpdateAssistantHostIds,
                            onUpdateDoTeamsOfficiate = onUpdateDoTeamsOfficiate,
                            onUpdateTeamOfficialsMaySwap = onUpdateTeamOfficialsMaySwap,
                            onAddOfficialId = onAddOfficialId,
                            onRemoveOfficialId = onRemoveOfficialId,
                            onUpdateOfficialSchedulingMode = onUpdateOfficialSchedulingMode,
                            onLoadOfficialPositionDefaults = {
                                onEditEvent {
                                    syncOfficialStaffing(
                                        sport = sports.firstOrNull { sport -> sport.id == sportId },
                                        replacePositionsWithSportDefaults = true,
                                    )
                                }
                            },
                            onAddOfficialPosition = onAddOfficialPosition,
                            onUpdateOfficialPositionName = onUpdateOfficialPositionName,
                            onUpdateOfficialPositionCount = onUpdateOfficialPositionCount,
                            onRemoveOfficialPosition = onRemoveOfficialPosition,
                            onUpdateOfficialUserPositions = onUpdateOfficialUserPositions,
                            onSetPaymentPlansEnabled = onSetPaymentPlansEnabled,
                            onSetInstallmentCount = onSetInstallmentCount,
                            onUpdateInstallmentAmount = onUpdateInstallmentAmount,
                            onUpdateInstallmentDueDate = onUpdateInstallmentDueDate,
                            onAddInstallmentRow = onAddInstallmentRow,
                            onRemoveInstallmentRow = onRemoveInstallmentRow,
                            onUploadSelected = component::onUploadSelected,
                            onDeleteImage = component::deleteImage,
                            onMapRevealCenterChange = { center ->
                                mapRevealCenter = center
                            },
                            onValidationChange = { isValid, errors ->
                                canProceed = isValid
                                validationErrors = errors
                            },
                            joinButton = {}
                        )

                        is CreateEventComponent.Child.Preview -> Preview(
                            modifier = Modifier.fillMaxSize(),
                            component = component
                        )
                    }
                }

            }
        )
    }
}

private fun buildValidationPopupMessage(errors: List<String>): String {
    if (errors.isEmpty()) {
        return "Please fix the highlighted fields."
    }
    if (errors.size == 1) {
        return errors.first()
    }
    val shown = errors.take(3)
    val remaining = errors.size - shown.size
    val suffix = if (remaining > 0) " +$remaining more" else ""
    return "Fix: ${shown.joinToString("; ")}$suffix"
}
