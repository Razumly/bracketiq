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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.ChildStack
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.PreparePaymentProcessor
import com.razumly.mvp.core.presentation.util.backAnimation
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventCreate.steps.Preview
import com.razumly.mvp.eventDetail.EventDetails
import com.razumly.mvp.eventDetail.toEventWithFullRelations
import com.razumly.mvp.eventMap.MapComponent
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
    val defaultEvent by component.defaultEvent.collectAsState()
    val newEventState by component.newEventState.collectAsState()
    val childStack by component.childStack.subscribeAsState()
    val eventImageUrls by component.eventImageUrls.collectAsState()
    val isRentalFlow by component.isRentalFlow.collectAsState()
    val sports by component.sports.collectAsState()
    val localFields by component.localFields.collectAsState()
    val leagueSlots by component.leagueSlots.collectAsState()
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
                    copy(teamSignup = true, singleDivision = true, end = start)
                }
            }
        }
    }

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
                            component.createEvent()
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
                        onAddCurrentUser = component::addUserToEvent,
                        imageScheme = imageScheme,
                        imageIds = eventImageUrls,
                        sports = sports,
                        editableFields = localFields,
                        leagueTimeSlots = leagueSlots,
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
                        onAddLeagueTimeSlot = component::addLeagueTimeSlot,
                        onUpdateLeagueTimeSlot = { index, updated ->
                            component.updateLeagueTimeSlot(index) { updated }
                        },
                        onRemoveLeagueTimeSlot = component::removeLeagueTimeSlot,
                        onUploadSelected = component::onUploadSelected,
                        onDeleteImage = component::deleteImage,
                    ) { isValid -> canProceed = isValid }

                    is CreateEventComponent.Child.Preview -> Preview(
                        modifier = Modifier.fillMaxSize(),
                        component = component
                    )
                }
            }

        }
    )
}
