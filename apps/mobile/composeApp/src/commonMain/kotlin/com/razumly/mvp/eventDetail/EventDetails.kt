package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil3.compose.AsyncImage
import com.kmpalette.loader.rememberNetworkLoader
import com.kmpalette.rememberDominantColorState
import com.materialkolor.scheme.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.toLeagueConfig
import com.razumly.mvp.core.data.dataTypes.toTournamentConfig
import com.razumly.mvp.core.data.dataTypes.withLeagueConfig
import com.razumly.mvp.core.data.dataTypes.withTournamentConfig
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.DEFAULT_AGE_DIVISION
import com.razumly.mvp.core.data.util.DEFAULT_AGE_DIVISION_OPTIONS
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION_OPTIONS
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeName
import com.razumly.mvp.core.data.util.buildEventDivisionId
import com.razumly.mvp.core.data.util.buildGenderSkillAgeDivisionToken
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionDetail
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.util.extractDivisionTokenFromId
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.data.util.toDivisionDisplayLabels
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.MoneyInputField
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.composables.SearchPlayerDialog
import com.razumly.mvp.core.presentation.composables.StripeButton
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.getScreenHeight
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.MoneyInputUtils
import com.razumly.mvp.core.presentation.util.teamSizeFormat
import com.razumly.mvp.core.presentation.util.timeFormat
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.presentation.util.transitionSpec
import com.razumly.mvp.eventDetail.composables.CancellationRefundOptions
import com.razumly.mvp.eventDetail.composables.LeagueConfigurationFields
import com.razumly.mvp.eventDetail.composables.LeaguePlayoffConfigurationFields
import com.razumly.mvp.eventDetail.composables.LeagueScoringConfigFields
import com.razumly.mvp.eventDetail.composables.LeagueScheduleFields
import com.razumly.mvp.eventDetail.composables.DivisionOption
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
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.enter_value
import mvp.composeapp.generated.resources.free_entry_hint
import mvp.composeapp.generated.resources.invalid_price
import mvp.composeapp.generated.resources.max_players
import mvp.composeapp.generated.resources.max_teams
import mvp.composeapp.generated.resources.value_too_low
import org.jetbrains.compose.resources.stringResource
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

val localImageScheme = compositionLocalOf<DynamicScheme> { error("No color scheme provided") }

private enum class UserPickerTarget {
    HOST,
    ASSISTANT_HOST,
    REFEREE,
}

@OptIn(ExperimentalHazeApi::class, ExperimentalTime::class)
@Composable
fun EventDetails(
    paymentProcessor: IPaymentProcessor,
    mapComponent: MapComponent,
    hostHasAccount: Boolean,
    imageScheme: DynamicScheme,
    imageIds: List<String>,
    mapRevealCenter: Offset = Offset.Zero,
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
    organizationTemplates: List<OrganizationTemplateDocument> = emptyList(),
    organizationTemplatesLoading: Boolean = false,
    organizationTemplatesError: String? = null,
    onSportSelected: (String) -> Unit = {},
    onSelectFieldCount: (Int) -> Unit,
    onUpdateLocalFieldName: (Int, String) -> Unit = { _, _ -> },
    onUpdateLocalFieldDivisions: (Int, List<String>) -> Unit = { _, _ -> },
    onAddLeagueTimeSlot: () -> Unit = {},
    onUpdateLeagueTimeSlot: (Int, TimeSlot) -> Unit = { _, _ -> },
    onRemoveLeagueTimeSlot: (Int) -> Unit = {},
    onLeagueScoringConfigChange: (LeagueScoringConfigDTO) -> Unit = {},
    userSuggestions: List<UserData> = emptyList(),
    onSearchUsers: (String) -> Unit = {},
    onEnsureUserByEmail: suspend (String) -> Result<UserData> = {
        Result.failure(IllegalStateException("Invite by email is not supported."))
    },
    onUpdateHostId: (String) -> Unit = {},
    onUpdateAssistantHostIds: (List<String>) -> Unit = {},
    onUpdateDoTeamsRef: (Boolean) -> Unit = {},
    onAddRefereeId: (String) -> Unit = {},
    onRemoveRefereeId: (String) -> Unit = {},
    onSetPaymentPlansEnabled: (Boolean) -> Unit = {},
    onSetInstallmentCount: (Int) -> Unit = {},
    onUpdateInstallmentAmount: (Int, Int) -> Unit = { _, _ -> },
    onUpdateInstallmentDueDate: (Int, String) -> Unit = { _, _ -> },
    onAddInstallmentRow: () -> Unit = {},
    onRemoveInstallmentRow: (Int) -> Unit = {},
    onUploadSelected: (GalleryPhotoResult) -> Unit,
    onDeleteImage: (String) -> Unit,
    onMapRevealCenterChange: (Offset) -> Unit = {},
    onFloatingDockVisibilityChange: (Boolean) -> Unit = {},
    onValidationChange: (Boolean, List<String>) -> Unit = { _, _ -> },
    joinButton: @Composable (isValid: Boolean) -> Unit
) {
    val event = eventWithRelations.event
    val host = eventWithRelations.host
    var isValid by remember { mutableStateOf(false) }
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
    var installmentDueDatePickerIndex by remember { mutableStateOf<Int?>(null) }
    var divisionInstallmentDueDatePickerIndex by remember { mutableStateOf<Int?>(null) }
    var showImageSelector by rememberSaveable { mutableStateOf(false) }
    var showUploadImagePicker by rememberSaveable { mutableStateOf(false) }
    var previousSelection by remember { mutableStateOf<LatLng?>(null) }

    // Validation states
    var isNameValid by remember { mutableStateOf(editEvent.name.isNotBlank()) }
    var isPriceValid by remember { mutableStateOf(editEvent.priceCents >= 0) }
    var isMaxParticipantsValid by remember { mutableStateOf(editEvent.maxParticipants > 1) }
    var isTeamSizeValid by remember { mutableStateOf(editEvent.teamSizeLimit >= 1) }
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
    var isFixedEndDateRangeValid by remember { mutableStateOf(true) }
    var isPaymentPlansValid by remember { mutableStateOf(true) }
    var isColorLoaded by remember { mutableStateOf(editEvent.imageId.isNotBlank()) }
    var paymentPlanValidationErrors by remember { mutableStateOf<List<String>>(emptyList()) }

    val coroutineScope = rememberCoroutineScope()
    var userPickerTarget by remember { mutableStateOf<UserPickerTarget?>(null) }
    var pickerError by remember { mutableStateOf<String?>(null) }
    val selectedUsersById = remember { mutableStateMapOf<String, UserData>() }

    val lazyListState = rememberLazyListState()

    var fieldCount by remember { mutableStateOf(editEvent.fieldCount ?: editableFields.size) }
    val selectedDivisions = remember(editEvent.divisions) {
        editEvent.divisions.normalizeDivisionIdentifiers()
    }
    val normalizedDivisionDetails = remember(
        editEvent.divisions,
        editEvent.divisionDetails,
        editEvent.id,
    ) {
        mergeDivisionDetailsForDivisions(
            divisions = editEvent.divisions,
            existingDetails = editEvent.divisionDetails,
            eventId = editEvent.id,
        )
    }
    val divisionDetailsForSettings = remember(
        normalizedDivisionDetails,
        editEvent.singleDivision,
        editEvent.includePlayoffs,
        editEvent.playoffTeamCount,
        editEvent.priceCents,
        editEvent.maxParticipants,
        editEvent.allowPaymentPlans,
        editEvent.installmentCount,
        editEvent.installmentDueDates,
        editEvent.installmentAmounts,
    ) {
        val defaultInstallmentAmounts = editEvent.installmentAmounts.map { amount ->
            amount.coerceAtLeast(0)
        }
        val defaultInstallmentDueDates = editEvent.installmentDueDates
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val defaultInstallmentCount = maxOf(
            editEvent.installmentCount ?: 0,
            defaultInstallmentAmounts.size,
            defaultInstallmentDueDates.size,
        ).takeIf { count -> count > 0 }
        val defaultAllowPaymentPlans = editEvent.allowPaymentPlans == true &&
            defaultInstallmentCount != null &&
            editEvent.priceCents.coerceAtLeast(0) > 0

        normalizedDivisionDetails.map { detail ->
            val fallbackMaxParticipants = editEvent.maxParticipants.coerceAtLeast(2)
            val effectiveDivisionPrice = if (editEvent.singleDivision) {
                editEvent.priceCents.coerceAtLeast(0)
            } else {
                (detail.price ?: editEvent.priceCents).coerceAtLeast(0)
            }
            val detailInstallmentAmounts = detail.installmentAmounts.map { amount ->
                amount.coerceAtLeast(0)
            }
            val detailInstallmentDueDates = detail.installmentDueDates
                .map { dueDate -> dueDate.trim() }
                .filter(String::isNotBlank)
            val detailInstallmentCount = maxOf(
                detail.installmentCount ?: 0,
                detailInstallmentAmounts.size,
                detailInstallmentDueDates.size,
            ).takeIf { count -> count > 0 }
            val detailAllowPaymentPlans = when {
                editEvent.singleDivision -> defaultAllowPaymentPlans
                detail.allowPaymentPlans == false -> false
                detail.allowPaymentPlans == true -> detailInstallmentCount != null && effectiveDivisionPrice > 0
                else -> defaultAllowPaymentPlans
            }

            detail.copy(
                price = effectiveDivisionPrice,
                maxParticipants = if (editEvent.singleDivision) {
                    fallbackMaxParticipants
                } else {
                    (detail.maxParticipants ?: fallbackMaxParticipants).coerceAtLeast(2)
                },
                playoffTeamCount = when {
                    !editEvent.includePlayoffs -> null
                    editEvent.singleDivision -> (
                        editEvent.playoffTeamCount
                            ?: detail.playoffTeamCount
                            ?: fallbackMaxParticipants
                        ).coerceAtLeast(2)
                    else -> (
                        detail.playoffTeamCount
                            ?: fallbackMaxParticipants
                        ).coerceAtLeast(2)
                },
                allowPaymentPlans = detailAllowPaymentPlans,
                installmentCount = when {
                    editEvent.singleDivision -> defaultInstallmentCount
                    detailAllowPaymentPlans -> detailInstallmentCount ?: defaultInstallmentCount
                    else -> null
                },
                installmentDueDates = when {
                    editEvent.singleDivision -> defaultInstallmentDueDates
                    detailAllowPaymentPlans -> if (detailInstallmentDueDates.isNotEmpty()) {
                        detailInstallmentDueDates
                    } else {
                        defaultInstallmentDueDates
                    }
                    else -> emptyList()
                },
                installmentAmounts = when {
                    editEvent.singleDivision -> defaultInstallmentAmounts
                    detailAllowPaymentPlans -> if (detailInstallmentAmounts.isNotEmpty()) {
                        detailInstallmentAmounts
                    } else {
                        defaultInstallmentAmounts
                    }
                    else -> emptyList()
                },
            )
        }
    }
    val divisionOptions = remember(divisionDetailsForSettings, selectedDivisions) {
        (
            selectedDivisions +
                divisionDetailsForSettings.map { detail -> detail.id } +
                divisionDetailsForSettings.map { detail -> detail.key }
            ).normalizeDivisionIdentifiers().map { divisionId ->
            DivisionOption(
                value = divisionId,
                label = divisionId.toDivisionDisplayLabel(divisionDetailsForSettings),
            )
        }
    }
    val slotDivisionOptions = remember(divisionOptions) {
        divisionOptions.map { option ->
            DropdownOption(value = option.value, label = option.label)
        }
    }
    var divisionEditor by remember(editEvent.id) {
        mutableStateOf(
            defaultDivisionEditorState(
                defaultPriceCents = editEvent.priceCents,
                defaultMaxParticipants = editEvent.maxParticipants,
                defaultPlayoffTeamCount = editEvent.playoffTeamCount ?: editEvent.maxParticipants,
                defaultAllowPaymentPlans = editEvent.allowPaymentPlans == true,
                defaultInstallmentCount = editEvent.installmentCount,
                defaultInstallmentDueDates = editEvent.installmentDueDates,
                defaultInstallmentAmounts = editEvent.installmentAmounts,
            ),
        )
    }
    val skillDivisionTypeSelectOptions = remember(divisionDetailsForSettings) {
        buildSkillDivisionTypeOptions(
            existingDetails = divisionDetailsForSettings,
        )
    }
    val ageDivisionTypeSelectOptions = remember(divisionDetailsForSettings) {
        buildAgeDivisionTypeOptions(
            existingDetails = divisionDetailsForSettings,
        )
    }
    val divisionEditorReady = remember(
        divisionEditor.gender,
        divisionEditor.skillDivisionTypeId,
        divisionEditor.ageDivisionTypeId,
    ) {
        divisionEditor.gender.isNotBlank() &&
            divisionEditor.skillDivisionTypeId.isNotBlank() &&
            divisionEditor.ageDivisionTypeId.isNotBlank()
    }
    fun resetDivisionEditor() {
        divisionInstallmentDueDatePickerIndex = null
        divisionEditor = defaultDivisionEditorState(
            defaultPriceCents = editEvent.priceCents,
            defaultMaxParticipants = editEvent.maxParticipants,
            defaultPlayoffTeamCount = editEvent.playoffTeamCount ?: editEvent.maxParticipants,
            defaultAllowPaymentPlans = editEvent.allowPaymentPlans == true,
            defaultInstallmentCount = editEvent.installmentCount,
            defaultInstallmentDueDates = editEvent.installmentDueDates,
            defaultInstallmentAmounts = editEvent.installmentAmounts,
        )
    }
    fun syncLeagueSlotsForSelectedDivisions(normalizedSelection: List<String>) {
        if (
            !isNewEvent ||
            (editEvent.eventType != EventType.LEAGUE && editEvent.eventType != EventType.TOURNAMENT) ||
            leagueTimeSlots.isEmpty()
        ) {
            return
        }
        val selectedDivisionSet = normalizedSelection.toSet()
        leagueTimeSlots.forEachIndexed { index, slot ->
            val currentDivisions = slot.normalizedDivisionIds()
            val filteredDivisions = currentDivisions.filter(selectedDivisionSet::contains)
            val nextSlotDivisions = if (editEvent.singleDivision) {
                normalizedSelection
            } else {
                filteredDivisions.ifEmpty { normalizedSelection }
            }
            if (nextSlotDivisions != currentDivisions) {
                onUpdateLeagueTimeSlot(index, slot.copy(divisions = nextSlotDivisions))
            }
        }
    }
    fun updateDivisionEditorSelection(
        gender: String? = null,
        skillDivisionTypeId: String? = null,
        ageDivisionTypeId: String? = null,
    ) {
        val previous = divisionEditor
        val nextGender = gender ?: previous.gender
        val nextSkillDivisionTypeId = if (skillDivisionTypeId != null) {
            skillDivisionTypeId.normalizeDivisionIdentifier()
        } else {
            previous.skillDivisionTypeId
        }
        val nextAgeDivisionTypeId = if (ageDivisionTypeId != null) {
            ageDivisionTypeId.normalizeDivisionIdentifier()
        } else {
            previous.ageDivisionTypeId
        }
        val resolvedSkillDivisionTypeName = resolveDivisionTypeName(
            divisionTypeId = nextSkillDivisionTypeId,
            existingDetails = divisionDetailsForSettings,
            fallbackOptions = skillDivisionTypeSelectOptions,
        )
        val resolvedAgeDivisionTypeName = resolveDivisionTypeName(
            divisionTypeId = nextAgeDivisionTypeId,
            existingDetails = divisionDetailsForSettings,
            fallbackOptions = ageDivisionTypeSelectOptions,
        )
        val hasRequiredFields = nextGender.isNotBlank() &&
            nextSkillDivisionTypeId.isNotBlank() &&
            nextAgeDivisionTypeId.isNotBlank()
        val autoName = if (hasRequiredFields) {
            buildDivisionName(
                gender = nextGender,
                skillDivisionTypeName = resolvedSkillDivisionTypeName,
                ageDivisionTypeName = resolvedAgeDivisionTypeName,
            )
        } else {
            ""
        }
        divisionEditor = previous.copy(
            gender = nextGender,
            skillDivisionTypeId = nextSkillDivisionTypeId,
            skillDivisionTypeName = resolvedSkillDivisionTypeName,
            ageDivisionTypeId = nextAgeDivisionTypeId,
            ageDivisionTypeName = resolvedAgeDivisionTypeName,
            name = when {
                !hasRequiredFields -> ""
                previous.nameTouched -> previous.name
                else -> autoName
            },
            nameTouched = hasRequiredFields && previous.nameTouched,
            error = null,
        )
    }
    fun syncDivisionInstallmentCount(count: Int) {
        val safeCount = count.coerceAtLeast(1)
        val nextAmounts = divisionEditor.installmentAmounts.toMutableList()
        val nextDueDates = divisionEditor.installmentDueDates.toMutableList()
        while (nextAmounts.size < safeCount) {
            nextAmounts.add(0)
        }
        while (nextDueDates.size < safeCount) {
            nextDueDates.add("")
        }
        if (nextAmounts.size > safeCount) {
            nextAmounts.subList(safeCount, nextAmounts.size).clear()
        }
        if (nextDueDates.size > safeCount) {
            nextDueDates.subList(safeCount, nextDueDates.size).clear()
        }
        divisionEditor = divisionEditor.copy(
            installmentCount = safeCount,
            installmentAmounts = nextAmounts,
            installmentDueDates = nextDueDates,
            error = null,
        )
    }
    fun setDivisionPaymentPlansEnabled(enabled: Boolean) {
        if (!enabled) {
            divisionInstallmentDueDatePickerIndex = null
            divisionEditor = divisionEditor.copy(
                allowPaymentPlans = false,
                installmentCount = 0,
                installmentAmounts = emptyList(),
                installmentDueDates = emptyList(),
                error = null,
            )
            return
        }
        val fallbackCount = maxOf(
            divisionEditor.installmentCount,
            divisionEditor.installmentAmounts.size,
            divisionEditor.installmentDueDates.size,
            1,
        )
        val nextAmounts = divisionEditor.installmentAmounts.toMutableList()
        val nextDueDates = divisionEditor.installmentDueDates.toMutableList()
        while (nextAmounts.size < fallbackCount) {
            nextAmounts.add(0)
        }
        while (nextDueDates.size < fallbackCount) {
            nextDueDates.add("")
        }
        divisionEditor = divisionEditor.copy(
            allowPaymentPlans = true,
            installmentCount = fallbackCount,
            installmentAmounts = nextAmounts,
            installmentDueDates = nextDueDates,
            error = null,
        )
    }
    fun updateDivisionInstallmentAmount(index: Int, amountCents: Int) {
        val normalizedCount = maxOf(
            divisionEditor.installmentCount,
            divisionEditor.installmentAmounts.size,
            divisionEditor.installmentDueDates.size,
            index + 1,
            1,
        )
        val nextAmounts = divisionEditor.installmentAmounts.toMutableList()
        while (nextAmounts.size < normalizedCount) {
            nextAmounts.add(0)
        }
        nextAmounts[index] = amountCents.coerceAtLeast(0)
        divisionEditor = divisionEditor.copy(
            installmentCount = normalizedCount,
            installmentAmounts = nextAmounts,
            error = null,
        )
    }
    fun updateDivisionInstallmentDueDate(index: Int, dueDate: String) {
        val normalizedCount = maxOf(
            divisionEditor.installmentCount,
            divisionEditor.installmentAmounts.size,
            divisionEditor.installmentDueDates.size,
            index + 1,
            1,
        )
        val nextDueDates = divisionEditor.installmentDueDates.toMutableList()
        while (nextDueDates.size < normalizedCount) {
            nextDueDates.add("")
        }
        nextDueDates[index] = dueDate.trim()
        divisionEditor = divisionEditor.copy(
            installmentCount = normalizedCount,
            installmentDueDates = nextDueDates,
            error = null,
        )
    }
    fun addDivisionInstallmentRow() {
        syncDivisionInstallmentCount(
            maxOf(
                1,
                divisionEditor.installmentCount,
                divisionEditor.installmentAmounts.size,
                divisionEditor.installmentDueDates.size,
            ) + 1,
        )
    }
    fun removeDivisionInstallmentRow(index: Int) {
        val nextAmounts = divisionEditor.installmentAmounts.toMutableList()
        val nextDueDates = divisionEditor.installmentDueDates.toMutableList()
        if (index !in nextAmounts.indices || index !in nextDueDates.indices) {
            return
        }
        nextAmounts.removeAt(index)
        nextDueDates.removeAt(index)
        val nextCount = maxOf(nextAmounts.size, nextDueDates.size, 1)
        while (nextAmounts.size < nextCount) {
            nextAmounts.add(0)
        }
        while (nextDueDates.size < nextCount) {
            nextDueDates.add("")
        }
        if (divisionInstallmentDueDatePickerIndex == index) {
            divisionInstallmentDueDatePickerIndex = null
        }
        divisionEditor = divisionEditor.copy(
            installmentCount = nextCount,
            installmentAmounts = nextAmounts,
            installmentDueDates = nextDueDates,
            error = null,
        )
    }
    fun handleSaveDivisionDetail() {
        val normalizedGender = divisionEditor.gender.uppercase()
        val normalizedSkillDivisionTypeId = divisionEditor.skillDivisionTypeId.normalizeDivisionIdentifier()
        val normalizedAgeDivisionTypeId = divisionEditor.ageDivisionTypeId.normalizeDivisionIdentifier()
        val resolvedSkillDivisionTypeName = resolveDivisionTypeName(
            divisionTypeId = normalizedSkillDivisionTypeId,
            existingDetails = divisionDetailsForSettings,
            fallbackOptions = skillDivisionTypeSelectOptions,
        )
        val resolvedAgeDivisionTypeName = resolveDivisionTypeName(
            divisionTypeId = normalizedAgeDivisionTypeId,
            existingDetails = divisionDetailsForSettings,
            fallbackOptions = ageDivisionTypeSelectOptions,
        )
        val resolvedDivisionTypeId = buildCombinedDivisionTypeId(
            skillDivisionTypeId = normalizedSkillDivisionTypeId,
            ageDivisionTypeId = normalizedAgeDivisionTypeId,
        )
        val resolvedDivisionTypeName = buildCombinedDivisionTypeName(
            skillDivisionTypeName = resolvedSkillDivisionTypeName,
            ageDivisionTypeName = resolvedAgeDivisionTypeName,
        )
        val resolvedDivisionName = divisionEditor.name.trim().ifBlank {
            buildDivisionName(
                gender = normalizedGender,
                skillDivisionTypeName = resolvedSkillDivisionTypeName,
                ageDivisionTypeName = resolvedAgeDivisionTypeName,
            )
        }
        if (
            normalizedGender.isBlank() ||
            normalizedSkillDivisionTypeId.isBlank() ||
            normalizedAgeDivisionTypeId.isBlank()
        ) {
            divisionEditor = divisionEditor.copy(
                error = "Select gender, skill division, and age division before adding.",
            )
            return
        }
        if (resolvedDivisionName.isBlank()) {
            divisionEditor = divisionEditor.copy(error = "Division name is required.")
            return
        }
        val existingDetail = divisionDetailsForSettings.firstOrNull { detail ->
            divisionsEquivalent(detail.id, divisionEditor.editingId)
        }
        val normalizedDivisionName = resolvedDivisionName.normalizeDivisionNameKey()
        val duplicateByName = divisionDetailsForSettings.firstOrNull { existing ->
            val isCurrent = existingDetail != null && divisionsEquivalent(existing.id, existingDetail.id)
            !isCurrent && existing.name.normalizeDivisionNameKey() == normalizedDivisionName
        }
        if (duplicateByName != null) {
            divisionEditor = divisionEditor.copy(
                error = "Division name must be unique within this event.",
            )
            return
        }
        val normalizedToken = buildDivisionToken(
            gender = normalizedGender,
            skillDivisionTypeId = normalizedSkillDivisionTypeId,
            ageDivisionTypeId = normalizedAgeDivisionTypeId,
        )
        val nextDivisionId = existingDetail?.id ?: buildUniqueDivisionIdForToken(
            eventId = editEvent.id,
            divisionToken = normalizedToken,
            existingDivisionIds = divisionDetailsForSettings.map { detail -> detail.id },
        )
        val fallbackMaxParticipants = editEvent.maxParticipants.coerceAtLeast(2)
        val normalizedPrice = if (editEvent.singleDivision) {
            editEvent.priceCents.coerceAtLeast(0)
        } else {
            divisionEditor.priceCents.coerceAtLeast(0)
        }
        val normalizedMaxParticipants = if (editEvent.singleDivision) {
            fallbackMaxParticipants
        } else {
            divisionEditor.maxParticipants.coerceAtLeast(2)
        }
        val normalizedPlayoffTeamCount = when {
            editEvent.eventType != EventType.LEAGUE || !editEvent.includePlayoffs -> null
            editEvent.singleDivision -> (
                editEvent.playoffTeamCount
                    ?: divisionEditor.playoffTeamCount
                    ?: fallbackMaxParticipants
                ).coerceAtLeast(2)

            else -> divisionEditor.playoffTeamCount.coerceAtLeast(2)
        }
        val defaultInstallmentAmounts = editEvent.installmentAmounts.map { amount ->
            amount.coerceAtLeast(0)
        }
        val defaultInstallmentDueDates = editEvent.installmentDueDates
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val defaultInstallmentCount = maxOf(
            editEvent.installmentCount ?: 0,
            defaultInstallmentAmounts.size,
            defaultInstallmentDueDates.size,
        ).takeIf { count -> count > 0 }
        val defaultAllowPaymentPlans = editEvent.allowPaymentPlans == true &&
            defaultInstallmentCount != null &&
            editEvent.priceCents.coerceAtLeast(0) > 0
        val editorInstallmentAmounts = divisionEditor.installmentAmounts.map { amount ->
            amount.coerceAtLeast(0)
        }
        val editorInstallmentDueDates = divisionEditor.installmentDueDates
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val editorInstallmentCount = maxOf(
            divisionEditor.installmentCount,
            editorInstallmentAmounts.size,
            editorInstallmentDueDates.size,
        ).takeIf { count -> count > 0 }
        val normalizedAllowPaymentPlans = if (editEvent.singleDivision) {
            defaultAllowPaymentPlans
        } else {
            divisionEditor.allowPaymentPlans && normalizedPrice > 0 && editorInstallmentCount != null
        }
        val normalizedInstallmentCount = if (normalizedAllowPaymentPlans) {
            if (editEvent.singleDivision) {
                defaultInstallmentCount
            } else {
                editorInstallmentCount
            }
        } else {
            null
        }
        val normalizedInstallmentAmounts = if (normalizedAllowPaymentPlans) {
            if (editEvent.singleDivision) {
                defaultInstallmentAmounts
            } else {
                editorInstallmentAmounts
            }
        } else {
            emptyList()
        }
        val normalizedInstallmentDueDates = if (normalizedAllowPaymentPlans) {
            if (editEvent.singleDivision) {
                defaultInstallmentDueDates
            } else {
                editorInstallmentDueDates
            }
        } else {
            emptyList()
        }
        if (!editEvent.singleDivision && normalizedAllowPaymentPlans) {
            if (normalizedInstallmentCount == null || normalizedInstallmentCount <= 0) {
                divisionEditor = divisionEditor.copy(
                    error = "Installment count must be at least 1 when payment plans are enabled.",
                )
                return
            }
            if (normalizedInstallmentAmounts.size != normalizedInstallmentCount) {
                divisionEditor = divisionEditor.copy(
                    error = "Installment count must match installment amounts.",
                )
                return
            }
            if (normalizedInstallmentDueDates.size != normalizedInstallmentCount) {
                divisionEditor = divisionEditor.copy(
                    error = "Installment count must match installment due dates.",
                )
                return
            }
            if (normalizedInstallmentAmounts.sum() != normalizedPrice) {
                divisionEditor = divisionEditor.copy(
                    error = "Installment total must equal the division price.",
                )
                return
            }
        }
        val nextDetail = (existingDetail ?: DivisionDetail(id = nextDivisionId)).copy(
            id = nextDivisionId,
            key = normalizedToken,
            name = resolvedDivisionName,
            gender = normalizedGender,
            ratingType = "SKILL",
            divisionTypeId = resolvedDivisionTypeId,
            divisionTypeName = resolvedDivisionTypeName,
            skillDivisionTypeId = normalizedSkillDivisionTypeId,
            skillDivisionTypeName = resolvedSkillDivisionTypeName,
            ageDivisionTypeId = normalizedAgeDivisionTypeId,
            ageDivisionTypeName = resolvedAgeDivisionTypeName,
            price = normalizedPrice,
            maxParticipants = normalizedMaxParticipants,
            playoffTeamCount = normalizedPlayoffTeamCount,
            allowPaymentPlans = normalizedAllowPaymentPlans,
            installmentCount = normalizedInstallmentCount,
            installmentDueDates = normalizedInstallmentDueDates,
            installmentAmounts = normalizedInstallmentAmounts,
        )
        val nextDivisionDetails = if (divisionEditor.editingId.isNullOrBlank()) {
            divisionDetailsForSettings + nextDetail
        } else {
            divisionDetailsForSettings.map { detail ->
                if (divisionsEquivalent(detail.id, divisionEditor.editingId)) nextDetail else detail
            }
        }
        val nextDivisionIds = nextDivisionDetails
            .map { detail -> detail.id }
            .normalizeDivisionIdentifiers()
        val mergedDivisionDetails = mergeDivisionDetailsForDivisions(
            divisions = nextDivisionIds,
            existingDetails = nextDivisionDetails,
            eventId = editEvent.id,
        )
        onEditEvent {
            copy(
                divisions = nextDivisionIds,
                divisionDetails = mergedDivisionDetails,
                playoffTeamCount = if (
                    eventType == EventType.LEAGUE &&
                    includePlayoffs &&
                    singleDivision
                ) {
                    mergedDivisionDetails.firstOrNull()?.playoffTeamCount
                        ?: fallbackMaxParticipants
                } else {
                    playoffTeamCount
                },
            )
        }
        syncLeagueSlotsForSelectedDivisions(nextDivisionIds)
        resetDivisionEditor()
    }
    fun handleEditDivisionDetail(divisionId: String) {
        val detail = divisionDetailsForSettings.firstOrNull { existing ->
            divisionsEquivalent(existing.id, divisionId)
        } ?: return
        val parsedToken = parseDivisionToken(detail)
        divisionEditor = DivisionEditorState(
            editingId = detail.id,
            gender = parsedToken.gender,
            skillDivisionTypeId = parsedToken.skillDivisionTypeId,
            skillDivisionTypeName = detail.skillDivisionTypeName.ifBlank {
                parsedToken.skillDivisionTypeId.toDivisionDisplayLabel()
            },
            ageDivisionTypeId = parsedToken.ageDivisionTypeId,
            ageDivisionTypeName = detail.ageDivisionTypeName.ifBlank {
                parsedToken.ageDivisionTypeId.toDivisionDisplayLabel()
            },
            name = detail.name,
            priceCents = (detail.price ?: editEvent.priceCents).coerceAtLeast(0),
            maxParticipants = (
                detail.maxParticipants
                    ?: editEvent.maxParticipants
                ).coerceAtLeast(2),
            playoffTeamCount = (
                detail.playoffTeamCount
                    ?: detail.maxParticipants
                    ?: editEvent.playoffTeamCount
                    ?: editEvent.maxParticipants
                ).coerceAtLeast(2),
            allowPaymentPlans = detail.allowPaymentPlans == true,
            installmentCount = maxOf(
                detail.installmentCount ?: 0,
                detail.installmentAmounts.size,
                detail.installmentDueDates.size,
            ).takeIf { count -> count > 0 } ?: 0,
            installmentDueDates = detail.installmentDueDates,
            installmentAmounts = detail.installmentAmounts,
            nameTouched = true,
            error = null,
        )
    }
    fun handleRemoveDivisionDetail(divisionId: String) {
        val nextDivisionDetails = divisionDetailsForSettings.filterNot { existing ->
            divisionsEquivalent(existing.id, divisionId)
        }
        val nextDivisionIds = nextDivisionDetails.map { detail -> detail.id }.normalizeDivisionIdentifiers()
        val mergedDivisionDetails = mergeDivisionDetailsForDivisions(
            divisions = nextDivisionIds,
            existingDetails = nextDivisionDetails,
            eventId = editEvent.id,
        )
        onEditEvent {
            copy(
                divisions = nextDivisionIds,
                divisionDetails = mergedDivisionDetails,
                playoffTeamCount = if (
                    eventType == EventType.LEAGUE &&
                    includePlayoffs &&
                    singleDivision
                ) {
                    mergedDivisionDetails.firstOrNull()?.playoffTeamCount
                } else {
                    playoffTeamCount
                },
            )
        }
        syncLeagueSlotsForSelectedDivisions(nextDivisionIds)
        if (!divisionEditor.editingId.isNullOrBlank() && divisionsEquivalent(divisionEditor.editingId, divisionId)) {
            resetDivisionEditor()
        }
    }
    var addSelfToEvent by remember { mutableStateOf(false) }
    val isOrganizationEvent = remember(editEvent.organizationId) {
        !editEvent.organizationId.isNullOrBlank()
    }
    val selectedRequiredTemplateIds = remember(editEvent.requiredTemplateIds) {
        editEvent.requiredTemplateIds.normalizeTemplateIds()
    }
    val requiredTemplateOptions = remember(organizationTemplates) {
        organizationTemplates.map { template ->
            DropdownOption(
                value = template.id,
                label = template.toRequiredTemplateLabel(),
            )
        }
    }
    val requiredTemplateOptionLookup = remember(requiredTemplateOptions) {
        requiredTemplateOptions.associateBy { option -> option.value }
    }
    val requiredTemplateOptionsWithFallback = remember(
        requiredTemplateOptions,
        requiredTemplateOptionLookup,
        selectedRequiredTemplateIds,
    ) {
        val options = mutableListOf<DropdownOption>()
        options.addAll(requiredTemplateOptions)
        selectedRequiredTemplateIds.forEach { templateId ->
            if (!requiredTemplateOptionLookup.containsKey(templateId)) {
                options.add(
                    DropdownOption(
                        value = templateId,
                        label = "Template $templateId",
                    ),
                )
            }
        }
        options
    }
    val leagueSlotErrors = remember(
        leagueTimeSlots,
        editEvent.eventType,
        editEvent.singleDivision,
        editEvent.divisions,
        isNewEvent,
    ) {
        if (isNewEvent && (editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT)) {
            computeLeagueSlotErrors(
                slots = leagueTimeSlots,
                singleDivision = editEvent.singleDivision,
                selectedDivisionIds = editEvent.divisions.normalizeDivisionIdentifiers(),
            )
        } else {
            emptyMap()
        }
    }

    val roundedCornerSize = 32.dp
    val currentLocation by mapComponent.currentLocation.collectAsState()

    LaunchedEffect(
        isNewEvent,
        editView,
        editEvent.divisions,
        editEvent.divisionDetails,
        editEvent.id,
    ) {
        if (!isNewEvent || !editView) {
            return@LaunchedEffect
        }
        if (editEvent.divisions.normalizeDivisionIdentifiers().isNotEmpty()) {
            return@LaunchedEffect
        }
        val seededDivisions = listOf(DEFAULT_DIVISION)
        val seededDivisionDetails = mergeDivisionDetailsForDivisions(
            divisions = seededDivisions,
            existingDetails = editEvent.divisionDetails,
            eventId = editEvent.id,
        )
        onEditEvent {
            copy(
                divisions = seededDivisions,
                divisionDetails = seededDivisionDetails,
            )
        }
    }

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
        isTeamSizeValid = editEvent.teamSizeLimit >= 1
        isLocationValid =
            editEvent.location.isNotBlank() && editEvent.lat != 0.0 && editEvent.long != 0.0
        isSkillLevelValid = editEvent.eventType == EventType.LEAGUE || editEvent.divisions.isNotEmpty()
        isSportValid = !isNewEvent || !editEvent.sportId.isNullOrBlank()
        val requiresFixedEndValidation = (
            editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT
        ) && !editEvent.noFixedEndDateTime
        isFixedEndDateRangeValid = !requiresFixedEndValidation || editEvent.end > editEvent.start
        isLeagueSlotsValid = if (isNewEvent && (editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT)) {
            leagueTimeSlots.isNotEmpty() && leagueSlotErrors.isEmpty()
        } else {
            true
        }

        if (editEvent.eventType == EventType.TOURNAMENT) {
            isWinnerSetCountValid = editEvent.winnerSetCount in setOf(1, 3, 5)
            isWinnerPointsValid = editEvent.winnerBracketPointsToVictory.size >= editEvent.winnerSetCount &&
                editEvent.winnerBracketPointsToVictory.take(editEvent.winnerSetCount).all { it > 0 }
            if (editEvent.doubleElimination) {
                isLoserSetCountValid = editEvent.loserSetCount in setOf(1, 3, 5)
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
            isLeagueGamesValid = (editEvent.gamesPerOpponent ?: 1) >= 1
            isLeaguePlayoffTeamsValid = if (!editEvent.includePlayoffs) {
                true
            } else if (editEvent.singleDivision) {
                (editEvent.playoffTeamCount ?: 0) >= 2
            } else {
                val details = mergeDivisionDetailsForDivisions(
                    divisions = editEvent.divisions,
                    existingDetails = editEvent.divisionDetails,
                    eventId = editEvent.id,
                )
                details.isNotEmpty() && details.all { detail -> (detail.playoffTeamCount ?: 0) >= 2 }
            }
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

        paymentPlanValidationErrors = validatePaymentPlans(
            event = editEvent,
            divisionDetails = divisionDetailsForSettings,
        )
        isPaymentPlansValid = paymentPlanValidationErrors.isEmpty()

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
                isFixedEndDateRangeValid &&
                isSportValid &&
                isPaymentPlansValid &&
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
        isFixedEndDateRangeValid,
        isPaymentPlansValid,
        paymentPlanValidationErrors,
        leagueTimeSlots,
        editEvent.imageId,
        editEvent.doubleElimination,
        editEvent.usesSets,
        editEvent.teamSignup,
        isColorLoaded,
    ) {
        buildList {
            if (!isNameValid) {
                add("Event name is required.")
            }
            if (!isSportValid) {
                add("Select a sport to continue.")
            }
            if (!isFixedEndDateRangeValid) {
                add("End date/time must be after start date/time when no fixed end date/time is disabled.")
            }
            if (!isPriceValid) {
                add("Price must be 0 or higher.")
            }
            if (!isMaxParticipantsValid) {
                add(
                    if (editEvent.teamSignup) {
                        "Max teams must be at least 2."
                    } else {
                        "Max participants must be at least 2."
                    },
                )
            }
            if (!isTeamSizeValid) {
                add("Team size must be at least 1.")
            }
            if (!isSkillLevelValid) {
                add("Add at least one division.")
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
                add(
                    if (editEvent.singleDivision) {
                        "Playoff team count must be at least 2 when playoffs are enabled."
                    } else {
                        "Each division must have a playoff team count of at least 2 when playoffs are enabled."
                    }
                )
            }
            if (!isLeagueSlotsValid) {
                add(
                    if (leagueTimeSlots.isEmpty()) {
                        "Add at least one timeslot for scheduling."
                    } else {
                        "Fix timeslot issues before continuing."
                    }
                )
            }
            if (!isPaymentPlansValid) {
                addAll(paymentPlanValidationErrors)
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

    LaunchedEffect(lazyListState) {
        var lastIndex = 0
        var lastOffset = 0
        snapshotFlow {
            lazyListState.firstVisibleItemIndex to lazyListState.firstVisibleItemScrollOffset
        }.collect { (index, offset) ->
            val atTop = index == 0 && offset <= 4
            val scrollDelta = when {
                index > lastIndex -> Int.MAX_VALUE
                index < lastIndex -> Int.MIN_VALUE
                else -> offset - lastOffset
            }
            val movedDown = scrollDelta >= 12
            val movedUp = scrollDelta <= -12
            when {
                atTop -> onFloatingDockVisibilityChange(true)
                movedDown -> onFloatingDockVisibilityChange(false)
                movedUp -> onFloatingDockVisibilityChange(true)
            }
            lastIndex = index
            lastOffset = offset
        }
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
    val eventMetaLine = remember(event.location, event.start) {
        val localDateTime = event.start.toLocalDateTime(TimeZone.currentSystemDefault())
        val dateText = localDateTime.date.format(dateFormat)
        val timeText = localDateTime.time.format(timeFormat)
        listOf(event.location, "$dateText • $timeText").filter { it.isNotBlank() }.joinToString(" • ")
    }
    val eventSportName = remember(eventWithRelations.sport, sports, event.sportId) {
        eventWithRelations.sport?.name
            ?: sports.firstOrNull { it.id == event.sportId }?.name
            ?: event.sportId
                ?.takeIf(String::isNotBlank)
                ?.replace('_', ' ')
                ?.replace('-', ' ')
                ?.toTitleCase()
            ?: "Sport not set"
    }
    val summaryTags = remember(event.eventType, eventSportName, event.teamSizeLimit, event.singleDivision) {
        buildList {
            add(eventSportName)
            add(event.eventType.name.toTitleCase())
            add("Teams of ${event.teamSizeLimit}")
            add(if (event.singleDivision) "Single division" else "Multi division")
        }
    }
    val hostDisplayName = remember(host, eventWithRelations.organization) {
        val hostName = buildString {
            val firstName = host?.firstName?.toTitleCase().orEmpty()
            val lastName = host?.lastName?.toTitleCase().orEmpty()
            if (firstName.isNotBlank()) {
                append(firstName)
            }
            if (lastName.isNotBlank()) {
                if (isNotEmpty()) append(" ")
                append(lastName)
            }
        }.trim()
        when {
            hostName.isNotBlank() -> hostName
            !eventWithRelations.organization?.name.isNullOrBlank() -> eventWithRelations.organization?.name.orEmpty()
            else -> "Hosted by organizer"
        }
    }
    LaunchedEffect(host, eventWithRelations.players, userSuggestions) {
        host?.let { selectedUsersById[it.id] = it }
        eventWithRelations.players.forEach { selectedUsersById[it.id] = it }
        userSuggestions.forEach { selectedUsersById[it.id] = it }
    }
    val knownUsersById = remember(host, eventWithRelations.players, userSuggestions, selectedUsersById.size) {
        buildMap<String, UserData> {
            host?.let { put(it.id, it) }
            eventWithRelations.players.forEach { put(it.id, it) }
            userSuggestions.forEach { put(it.id, it) }
            selectedUsersById.forEach { (id, user) -> put(id, user) }
        }
    }
    val freeAgentCount = remember(event.freeAgentIds) { event.freeAgentIds.size }
    val teamsCount = remember(eventWithRelations.teams) { eventWithRelations.teams.size }
    val registrationSummary = remember(editEvent.registrationCutoffHours) {
        editEvent.registrationCutoffHours.toRegistrationCutoffSummary()
    }
    val refundSummary = remember(event.cancellationRefundHours) {
        event.cancellationRefundHours.toRefundSummary()
    }
    val priceSummary = remember(event.teamSignup, event.price) {
        if (event.teamSignup) "${event.price.moneyFormat()} / team" else "${event.price.moneyFormat()} / player"
    }
    val basicsSummaryLine = remember(event.location, dateRangeText, hostDisplayName) {
        listOf(hostDisplayName, event.location, dateRangeText)
            .filter { it.isNotBlank() }
            .joinToString(" • ")
    }
    val pricingSummaryLine = remember(priceSummary, registrationSummary, refundSummary) {
        listOf(priceSummary, registrationSummary, refundSummary)
            .filter { it.isNotBlank() }
            .joinToString(" • ")
    }
    val competitionSummaryLine = remember(
        event.teamSignup,
        event.singleDivision,
        event.maxParticipants,
        event.teamSizeLimit,
        event.eventType,
        event.gamesPerOpponent,
    ) {
        val maxLabel = if (event.teamSignup) "Max teams ${event.maxParticipants}" else "Max players ${event.maxParticipants}"
        val leagueSummary = if (event.eventType == EventType.LEAGUE) {
            "Games/opponent ${event.gamesPerOpponent ?: 1}"
        } else {
            null
        }
        listOf(
            if (event.singleDivision) "Single division" else "Multi division",
            maxLabel,
            "Team size ${event.teamSizeLimit}",
            leagueSummary,
        ).filterNotNull().joinToString(" • ")
    }
    val facilitiesSummaryLine = remember(fieldCount, eventWithRelations.timeSlots, editEvent.eventType) {
        val fieldSummary = "${fieldCount.coerceAtLeast(0)} fields"
        val slotSummary = if (editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT) {
            "${eventWithRelations.timeSlots.size} weekly slots"
        } else {
            null
        }
        listOf(fieldSummary, slotSummary).filterNotNull().joinToString(" • ")
    }
    val heroHeightFraction = if (editView) 0.6f else 0.32f
    val heroSpacerFraction = if (editView) 0.5f else 0.24f
    val heroHeight = (getScreenHeight() * heroHeightFraction).dp
    val heroSpacerHeight = (getScreenHeight() * heroSpacerFraction).dp
    val heroSpacerHeightPx = with(LocalDensity.current) { heroSpacerHeight.toPx() }
    val heroParallaxOffset = if (lazyListState.firstVisibleItemIndex == 0) {
        lazyListState.firstVisibleItemScrollOffset.toFloat().coerceAtMost(heroSpacerHeightPx)
    } else {
        heroSpacerHeightPx
    }

    CompositionLocalProvider(localImageScheme provides imageScheme) {
        Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
            BackgroundImage(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(heroHeight)
                    .graphicsLayer(translationY = -heroParallaxOffset),
                imageUrl = if (!editView) getImageUrl(event.imageId) else getImageUrl(editEvent.imageId),
            )
            LazyColumn(
                state = lazyListState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    // Keep final content scrollable above the floating action dock in view mode.
                    bottom = navPadding.calculateBottomPadding() + if (editView) 32.dp else 120.dp,
                ),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {

                item {
                    Box(modifier = Modifier.height(heroSpacerHeight)) {
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
                            horizontalAlignment = if (editView) Alignment.CenterHorizontally else Alignment.Start
                        ) {
                            if (editView && isNewEvent) {
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp),
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.secondaryContainer,
                                    ),
                                    border = BorderStroke(
                                        width = 1.dp,
                                        color = MaterialTheme.colorScheme.outlineVariant,
                                    ),
                                ) {
                                    Text(
                                        text = "For more complex events and billing use the web version.",
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 12.dp, vertical = 10.dp),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                                    )
                                }
                            }

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

                            if (editView) {
                                Text(
                                    text = editEvent.location,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                Button(
                                    onClick = { mapComponent.toggleMap() },
                                    modifier = Modifier.onGloballyPositioned {
                                        onMapRevealCenterChange(it.boundsInWindow().center)
                                    },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = Color.Black, contentColor = Color.White
                                    )
                                ) {
                                    Icon(Icons.Default.Place, contentDescription = null)
                                    Text("Edit Location")
                                }
                                if (!isLocationValid) {
                                    Text(
                                        text = "Select a Location",
                                        color = MaterialTheme.colorScheme.error
                                    )
                                }
                            } else {
                                Text(
                                    text = eventMetaLine,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Color(localImageScheme.current.onSurfaceVariant)
                                )
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    summaryTags.forEach { tag ->
                                        SummaryTagChip(label = tag)
                                    }
                                }
                            }

                            Box(
                                Modifier.fillMaxWidth(),
                                contentAlignment = if (editView) Alignment.Center else Alignment.CenterStart
                            ) {
                                joinButton(isValid)
                            }
                        }
                    }
                }

                animatedCardSection(
                    sectionId = "event_basics",
                    sectionTitle = "Basic Information",
                    collapsibleInEditMode = true,
                    collapsibleInViewMode = true,
                    viewSummary = basicsSummaryLine,
                    defaultExpandedInViewMode = false,
                    isEditMode = editView,
                    animationDelay = 100,
                    viewContent = {
                        DetailKeyValueList(
                            rows = listOf(
                                DetailRowSpec(label = "Hosted by", value = hostDisplayName),
                                DetailRowSpec(label = "Season dates", value = dateRangeText),
                                DetailRowSpec(label = "Location", value = event.location),
                                DetailRowSpec(label = "Type", value = event.eventType.name.toTitleCase()),
                                DetailRowSpec(label = "Sport", value = eventSportName),
                            ),
                        )
                        if (event.description.isNotBlank()) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "About",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                ),
                            )
                            Text(
                                text = event.description,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }
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
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }

                        val supportsNoFixedEndDateTime =
                            editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT

                        if (editEvent.eventType == EventType.EVENT || supportsNoFixedEndDateTime) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
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
                                PlatformTextField(
                                    value = editEvent.end.toLocalDateTime(
                                        TimeZone.currentSystemDefault()
                                    ).format(dateTimeFormat),
                                    onValueChange = {},
                                    modifier = Modifier.weight(1f),
                                    label = "End Date & Time",
                                    readOnly = true,
                                    onTap = {
                                        if (!rentalTimeLocked && !(supportsNoFixedEndDateTime && editEvent.noFixedEndDateTime)) {
                                            showEndPicker = true
                                        }
                                    },
                                )
                            }
                        } else {
                            PlatformTextField(
                                value = editEvent.start.toLocalDateTime(
                                    TimeZone.currentSystemDefault()
                                ).format(dateTimeFormat),
                                onValueChange = {},
                                modifier = Modifier.fillMaxWidth(),
                                label = "Start Date & Time",
                                readOnly = true,
                                onTap = {
                                    if (!rentalTimeLocked) {
                                        showStartPicker = true
                                    }
                                },
                            )
                        }

                        if (supportsNoFixedEndDateTime) {
                            val minimumFixedEnd = kotlin.time.Instant.fromEpochMilliseconds(
                                editEvent.start.toEpochMilliseconds() + 60L * 60L * 1000L
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(
                                    checked = editEvent.noFixedEndDateTime,
                                    enabled = !rentalTimeLocked,
                                    onCheckedChange = { checked ->
                                        onEditEvent {
                                            copy(
                                                noFixedEndDateTime = checked,
                                                end = if (!checked && end <= start) {
                                                    minimumFixedEnd
                                                } else {
                                                    end
                                                },
                                            )
                                        }
                                    },
                                )
                                Text(
                                    text = "No fixed end date/time",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Color(localImageScheme.current.onSurface),
                                )
                            }
                            if (editEvent.noFixedEndDateTime) {
                                Text(
                                    text = "Open-ended scheduling is enabled. Turn this off to enforce a fixed end date/time.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(localImageScheme.current.onSurface),
                                )
                            }
                        }

                        if (rentalTimeLocked) {
                            Text(
                                text = "Rental-selected start and end times are fixed and cannot be changed.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(localImageScheme.current.onSurface),
                            )
                        }
                    },
                )

                animatedCardSection(
                    sectionId = "event_details",
                    sectionTitle = "Event Details",
                    collapsibleInEditMode = true,
                    collapsibleInViewMode = true,
                    viewSummary = pricingSummaryLine,
                    defaultExpandedInViewMode = false,
                    isEditMode = editView,
                    animationDelay = 200,
                    viewContent = {
                        DetailKeyValueList(
                            rows = listOf(
                                DetailRowSpec("Event type", event.eventType.name.toTitleCase()),
                                DetailRowSpec("Host", hostDisplayName),
                                DetailRowSpec("Entry fee", priceSummary),
                                DetailRowSpec(
                                    if (event.teamSignup) "Max teams" else "Max players",
                                    event.maxParticipants.toString(),
                                ),
                                DetailRowSpec("Team size", event.teamSizeLimit.toString()),
                                DetailRowSpec("Registration closes", "$registrationSummary \u203A"),
                                DetailRowSpec("Refunds", "$refundSummary \u203A"),
                                DetailRowSpec("Waitlist", "${event.waitListIds.size}"),
                            ),
                        )
                    },
                    editContent = {
                        val maxParticipantsLabel = if (!editEvent.teamSignup) {
                            stringResource(Res.string.max_players)
                        } else {
                            stringResource(Res.string.max_teams)
                        }
                        val assistantHostIds = remember(editEvent.assistantHostIds, editEvent.hostId) {
                            editEvent.assistantHostIds
                                .map { it.trim() }
                                .filter { it.isNotBlank() && it != editEvent.hostId }
                                .distinct()
                        }
                        val resolvedHostDisplay = knownUsersById[editEvent.hostId]?.let(::userDisplayName)
                            ?: editEvent.hostId.ifBlank { "No host selected" }

                        PlatformDropdown(
                            selectedValue = editEvent.eventType.name,
                            onSelectionChange = { selectedValue ->
                                val selectedEventType = EventType.entries.find { it.name == selectedValue }
                                selectedEventType?.let { onEventTypeSelected(it) }
                            },
                            options = EventType.entries.map { eventType ->
                                DropdownOption(
                                    value = eventType.name,
                                    label = eventType.name,
                                )
                            },
                            label = "Event Type",
                            modifier = Modifier.fillMaxWidth(),
                        )

                        Text(
                            text = "Hosts",
                            style = MaterialTheme.typography.titleSmall,
                            color = Color(localImageScheme.current.onSurface),
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Primary host: $resolvedHostDisplay",
                                modifier = Modifier.weight(1f),
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color(localImageScheme.current.onSurface),
                            )
                            TextButton(
                                onClick = {
                                    pickerError = null
                                    userPickerTarget = UserPickerTarget.HOST
                                },
                            ) {
                                Text("Select host")
                            }
                        }
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = "Assistant hosts",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color(localImageScheme.current.onSurface),
                            )
                            if (assistantHostIds.isEmpty()) {
                                Text(
                                    text = "No assistant hosts selected.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(localImageScheme.current.onSurfaceVariant),
                                )
                            } else {
                                assistantHostIds.forEach { assistantHostId ->
                                    val assistantLabel = knownUsersById[assistantHostId]?.let(::userDisplayName)
                                        ?: assistantHostId
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            text = assistantLabel,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Color(localImageScheme.current.onSurface),
                                        )
                                        TextButton(
                                            onClick = {
                                                onUpdateAssistantHostIds(
                                                    assistantHostIds.filterNot { existing -> existing == assistantHostId },
                                                )
                                            },
                                        ) {
                                            Text(
                                                text = "Remove",
                                                color = MaterialTheme.colorScheme.error,
                                            )
                                        }
                                    }
                                }
                            }
                            TextButton(
                                onClick = {
                                    pickerError = null
                                    userPickerTarget = UserPickerTarget.ASSISTANT_HOST
                                },
                            ) {
                                Text("Add assistant host")
                            }
                        }
                        if (pickerError != null) {
                            Text(
                                text = pickerError.orEmpty(),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            NumberInputField(
                                modifier = Modifier.weight(1f),
                                value = editEvent.maxParticipants.toString(),
                                label = if (editEvent.singleDivision) {
                                    maxParticipantsLabel
                                } else {
                                    "Default $maxParticipantsLabel"
                                },
                                enabled = true,
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
                                ),
                                supportingText = if (editEvent.singleDivision) {
                                    null
                                } else {
                                    "Used as the default capacity for new divisions."
                                },
                            )
                            NumberInputField(
                                modifier = Modifier.weight(1f),
                                value = editEvent.teamSizeLimit.toString(),
                                label = "Team Size Limit",
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
                                supportingText = if (!isTeamSizeValid) {
                                    "Team size must be at least 1."
                                } else {
                                    ""
                                },
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            NumberInputField(
                                modifier = Modifier.weight(1f),
                                value = editEvent.minAge?.toString().orEmpty(),
                                label = "Min Age",
                                onValueChange = { newValue ->
                                    if (!newValue.all { it.isDigit() }) return@NumberInputField
                                    onEditEvent {
                                        copy(minAge = newValue.toIntOrNull())
                                    }
                                },
                                isError = false,
                            )
                            NumberInputField(
                                modifier = Modifier.weight(1f),
                                value = editEvent.maxAge?.toString().orEmpty(),
                                label = "Max Age",
                                onValueChange = { newValue ->
                                    if (!newValue.all { it.isDigit() }) return@NumberInputField
                                    onEditEvent {
                                        copy(maxAge = newValue.toIntOrNull())
                                    }
                                },
                                isError = false,
                            )
                        }

                        if (editEvent.eventType == EventType.LEAGUE) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.Top,
                            ) {
                                Box(modifier = Modifier.weight(1f)) {
                                    LabeledCheckboxRow(
                                        checked = editEvent.includePlayoffs,
                                        label = "Include Playoffs",
                                        onCheckedChange = { checked ->
                                            val fallbackMaxParticipants =
                                                editEvent.maxParticipants.coerceAtLeast(2)
                                            val fallbackSingleDivisionPlayoffCount = (
                                                editEvent.playoffTeamCount
                                                    ?: divisionDetailsForSettings.firstOrNull()?.playoffTeamCount
                                                    ?: fallbackMaxParticipants
                                                ).coerceAtLeast(2)
                                            onEditEvent {
                                                val nextDivisionDetails = mergeDivisionDetailsForDivisions(
                                                    divisions = divisions,
                                                    existingDetails = divisionDetails,
                                                    eventId = id,
                                                ).map { detail ->
                                                    when {
                                                        !checked -> detail.copy(playoffTeamCount = null)
                                                        singleDivision -> detail.copy(
                                                            playoffTeamCount = fallbackSingleDivisionPlayoffCount,
                                                        )
                                                        else -> detail.copy(
                                                            playoffTeamCount = (
                                                                detail.playoffTeamCount
                                                                    ?: (detail.maxParticipants ?: fallbackMaxParticipants)
                                                                ).coerceAtLeast(2),
                                                        )
                                                    }
                                                }
                                                copy(
                                                    includePlayoffs = checked,
                                                    playoffTeamCount = if (checked) {
                                                        fallbackSingleDivisionPlayoffCount
                                                    } else {
                                                        null
                                                    },
                                                    divisionDetails = nextDivisionDetails,
                                                )
                                            }
                                        },
                                    )
                                }
                                NumberInputField(
                                    modifier = Modifier.weight(1f),
                                    value = editEvent.playoffTeamCount?.toString().orEmpty(),
                                    label = if (editEvent.singleDivision) {
                                        "Playoff Team Count"
                                    } else {
                                        "Default Playoff Team Count"
                                    },
                                    enabled = editEvent.includePlayoffs,
                                    onValueChange = { newValue ->
                                        if (!editEvent.includePlayoffs) return@NumberInputField
                                        if (!newValue.all { it.isDigit() }) return@NumberInputField
                                        onEditEvent {
                                            copy(playoffTeamCount = newValue.toIntOrNull()?.coerceAtLeast(2))
                                        }
                                    },
                                    isError = editEvent.includePlayoffs &&
                                        (editEvent.playoffTeamCount ?: 0) < 2,
                                    errorMessage = "Required when playoffs are enabled",
                                    supportingText = if (editEvent.singleDivision) {
                                        null
                                    } else {
                                        "Used as the default playoff team count for new divisions."
                                    },
                                )
                            }
                        }

                        if (!hostHasAccount) {
                            StripeButton(
                                onClick = onHostCreateAccount,
                                paymentProcessor,
                                "Create Stripe Connect Account to Change Price",
                            )
                        }
                        MoneyInputField(
                            value = editEvent.priceCents.toString(),
                            label = if (editEvent.singleDivision) "Price" else "Default Price",
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
                            supportingText = if (!editEvent.singleDivision) {
                                "Used as the default price for new divisions."
                            } else if (isPriceValid) {
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
                        if (isOrganizationEvent) {
                            PlatformDropdown(
                                selectedValue = "",
                                onSelectionChange = {},
                                options = requiredTemplateOptionsWithFallback,
                                label = "Required Documents",
                                placeholder = if (organizationTemplatesLoading) {
                                    "Loading templates..."
                                } else {
                                    "Select templates"
                                },
                                enabled = !organizationTemplatesLoading,
                                multiSelect = true,
                                selectedValues = selectedRequiredTemplateIds,
                                onMultiSelectionChange = { values ->
                                    val normalizedTemplateIds = values.normalizeTemplateIds()
                                    onEditEvent { copy(requiredTemplateIds = normalizedTemplateIds) }
                                },
                                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                            )
                            if (!organizationTemplatesError.isNullOrBlank()) {
                                Text(
                                    text = organizationTemplatesError,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.error,
                                )
                            } else if (
                                !organizationTemplatesLoading &&
                                requiredTemplateOptions.isEmpty()
                            ) {
                                Text(
                                    text = "No templates yet. Create one in your organization Document Templates tab.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(localImageScheme.current.onSurfaceVariant),
                                )
                            }
                        }
                        if (editEvent.priceCents > 0) {
                            CancellationRefundOptions(
                                selectedOption = editEvent.cancellationRefundHours,
                                onOptionSelected = {
                                    onEditEvent { copy(cancellationRefundHours = it) }
                                },
                                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                            )
                        }

                        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                        if (isNewEvent) {
                            Text(
                                text = "Payment plans can be configured on the web version.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(localImageScheme.current.onSurfaceVariant),
                            )
                        } else {
                            Text(
                                text = if (editEvent.singleDivision) {
                                    "Payment Plans"
                                } else {
                                    "Default Payment Plan"
                                },
                                style = MaterialTheme.typography.titleSmall,
                                color = Color(localImageScheme.current.onSurface),
                            )
                            if (!editEvent.singleDivision) {
                                Text(
                                    text = "Used as the default payment plan when adding new divisions.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(localImageScheme.current.onSurfaceVariant),
                                )
                            }
                            LabeledCheckboxRow(
                                checked = editEvent.allowPaymentPlans == true,
                                label = if (editEvent.singleDivision) {
                                    "Allow payment plans"
                                } else {
                                    "Allow default payment plan"
                                },
                                enabled = hostHasAccount && editEvent.priceCents > 0,
                                onCheckedChange = onSetPaymentPlansEnabled,
                            )
                            if (editEvent.allowPaymentPlans == true) {
                                val installmentCount =
                                    maxOf(
                                        editEvent.installmentCount ?: 0,
                                        editEvent.installmentAmounts.size,
                                        editEvent.installmentDueDates.size,
                                        1,
                                    )

                                NumberInputField(
                                    value = installmentCount.toString(),
                                    label = "Installment Count",
                                    onValueChange = { newValue ->
                                        if (!newValue.all { it.isDigit() }) return@NumberInputField
                                        val parsed = newValue.toIntOrNull() ?: 1
                                        onSetInstallmentCount(parsed.coerceAtLeast(1))
                                    },
                                    isError = installmentCount <= 0,
                                    errorMessage = if (installmentCount <= 0) {
                                        "Installment count must be at least 1."
                                    } else {
                                        ""
                                    },
                                )

                                repeat(installmentCount) { index ->
                                    val amountCents = editEvent.installmentAmounts.getOrNull(index) ?: 0
                                    val dueDate = editEvent.installmentDueDates.getOrNull(index).orEmpty()
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.Top,
                                    ) {
                                        MoneyInputField(
                                            value = amountCents.toString(),
                                            label = "Installment ${index + 1} Amount",
                                            onValueChange = { newValue ->
                                                val parsed = newValue.filter { it.isDigit() }.toIntOrNull() ?: 0
                                                onUpdateInstallmentAmount(index, parsed)
                                            },
                                            modifier = Modifier.weight(1f),
                                        )
                                        PlatformTextField(
                                            value = dueDate,
                                            onValueChange = {},
                                            label = "Due Date",
                                            placeholder = "YYYY-MM-DD",
                                            modifier = Modifier.weight(1f),
                                            readOnly = true,
                                            onTap = { installmentDueDatePickerIndex = index },
                                        )
                                    }
                                    if (installmentCount > 1) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.End,
                                        ) {
                                            TextButton(
                                                onClick = { onRemoveInstallmentRow(index) },
                                            ) {
                                                Text(
                                                    text = "Remove installment",
                                                    color = MaterialTheme.colorScheme.error,
                                                )
                                            }
                                        }
                                    }
                                }

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    TextButton(onClick = onAddInstallmentRow) {
                                        Text("Add installment")
                                    }
                                    val installmentTotal = editEvent.installmentAmounts.sum()
                                    val totalsMatch = installmentTotal == editEvent.priceCents
                                    Text(
                                        text = if (editEvent.singleDivision) {
                                            "Total ${installmentTotal.toDouble().div(100).moneyFormat()} / ${editEvent.priceCents.toDouble().div(100).moneyFormat()}"
                                        } else {
                                            "Default total ${installmentTotal.toDouble().div(100).moneyFormat()} / ${editEvent.priceCents.toDouble().div(100).moneyFormat()}"
                                        },
                                        color = if (totalsMatch) {
                                            Color(localImageScheme.current.onSurfaceVariant)
                                        } else {
                                            MaterialTheme.colorScheme.error
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                if (!isPaymentPlansValid) {
                                    paymentPlanValidationErrors.forEach { paymentError ->
                                        Text(
                                            text = paymentError,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.error,
                                        )
                                    }
                                }
                            }
                        }
                    },
                )

                animatedCardSection(
                    sectionId = "referees",
                    sectionTitle = "Referees",
                    collapsibleInEditMode = true,
                    collapsibleInViewMode = true,
                    viewSummary = "${event.refereeIds.size} selected",
                    defaultExpandedInViewMode = false,
                    isEditMode = editView,
                    animationDelay = 300,
                    viewContent = {
                        DetailKeyValueList(
                            rows = listOf(
                                DetailRowSpec(
                                    "Teams provide referees",
                                    if (event.doTeamsRef == true) "Yes" else "No",
                                ),
                                DetailRowSpec("Selected referees", event.refereeIds.size.toString()),
                            ),
                        )
                    },
                    editContent = {
                        LabeledCheckboxRow(
                            checked = editEvent.doTeamsRef == true,
                            label = "Teams provide referees",
                            onCheckedChange = onUpdateDoTeamsRef,
                        )
                        Text(
                            text = "Selected referees",
                            style = MaterialTheme.typography.titleSmall,
                            color = Color(localImageScheme.current.onSurface),
                        )
                        if (editEvent.refereeIds.isEmpty()) {
                            Text(
                                text = "No referees selected yet.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(localImageScheme.current.onSurfaceVariant),
                            )
                        } else {
                            editEvent.refereeIds.forEach { refereeId ->
                                val refereeLabel = knownUsersById[refereeId]?.let(::userDisplayName)
                                    ?: refereeId
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        text = refereeLabel,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Color(localImageScheme.current.onSurface),
                                    )
                                    TextButton(
                                        onClick = { onRemoveRefereeId(refereeId) },
                                    ) {
                                        Text(
                                            text = "Remove",
                                            color = MaterialTheme.colorScheme.error,
                                        )
                                    }
                                }
                            }
                        }
                        TextButton(
                            onClick = {
                                pickerError = null
                                userPickerTarget = UserPickerTarget.REFEREE
                            },
                        ) {
                            Text("Add referee by name/email")
                        }
                        if (pickerError != null && userPickerTarget == UserPickerTarget.REFEREE) {
                            Text(
                                text = pickerError.orEmpty(),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    },
                )

                // Specifics Card
                animatedCardSection(
                    sectionId = "specifics",
                    sectionTitle = "Division Settings",
                    collapsibleInEditMode = true,
                    collapsibleInViewMode = true,
                    viewSummary = competitionSummaryLine,
                    defaultExpandedInViewMode = false,
                    isEditMode = editView,
                    animationDelay = 400,
                    defaultExpandedInEditMode = true,
                    viewContent = {
                        val maxParticipantsLabel =
                            if (event.teamSignup) "Max teams" else "Max players"
                        val divisionsText =
                            event.divisions.toDivisionDisplayLabels(event.divisionDetails).joinToString()
                                .ifBlank { "Not set" }
                        DetailStatsGrid(
                            items = listOf(
                                DetailGridItem(maxParticipantsLabel, event.maxParticipants.toString()),
                                DetailGridItem("Team size", event.teamSizeLimit.teamSizeFormat()),
                                DetailGridItem("Team event", if (event.teamSignup) "Yes" else "No"),
                                DetailGridItem("Division mode", if (event.singleDivision) "Single" else "Multi"),
                                DetailGridItem("Teams", teamsCount.toString()),
                                DetailGridItem("Free agents", freeAgentCount.toString()),
                            ),
                        )
                        DetailKeyValueList(
                            rows = buildList {
                                add(DetailRowSpec("Divisions", divisionsText))
                                when (event.eventType) {
                                    EventType.LEAGUE -> {
                                        add(DetailRowSpec("Games per opponent", "${event.gamesPerOpponent ?: 1}"))
                                        if (event.usesSets) {
                                            add(DetailRowSpec("Sets per match", "${event.setsPerMatch ?: 1}"))
                                            add(DetailRowSpec("Set duration", "${event.setDurationMinutes ?: 20} minutes"))
                                            if (event.pointsToVictory.isNotEmpty()) {
                                                add(
                                                    DetailRowSpec(
                                                        "Points to victory",
                                                        event.pointsToVictory.joinToString(),
                                                    ),
                                                )
                                            }
                                        } else {
                                            add(
                                                DetailRowSpec(
                                                    "Match duration",
                                                    "${event.matchDurationMinutes ?: 60} minutes",
                                                ),
                                            )
                                        }
                                        add(DetailRowSpec("Rest time", "${event.restTimeMinutes ?: 0} minutes"))
                                        if (event.includePlayoffs) {
                                            add(
                                                DetailRowSpec(
                                                    "Playoffs",
                                                    if (event.singleDivision) {
                                                        "${event.playoffTeamCount ?: 0} teams"
                                                    } else {
                                                        "Configured per division"
                                                    },
                                                ),
                                            )
                                        }
                                    }

                                    EventType.TOURNAMENT -> {
                                        add(
                                            DetailRowSpec(
                                                "Bracket",
                                                if (event.doubleElimination) "Double elimination" else "Single elimination",
                                            ),
                                        )
                                        add(DetailRowSpec("Winner set count", event.winnerSetCount.toString()))
                                        if (event.winnerBracketPointsToVictory.isNotEmpty()) {
                                            add(
                                                DetailRowSpec(
                                                    "Winner points",
                                                    event.winnerBracketPointsToVictory.joinToString(),
                                                ),
                                            )
                                        }
                                        if (event.doubleElimination) {
                                            add(
                                                DetailRowSpec(
                                                    "Loser set count",
                                                    event.loserSetCount.toString(),
                                                ),
                                            )
                                            if (event.loserBracketPointsToVictory.isNotEmpty()) {
                                                add(
                                                    DetailRowSpec(
                                                        "Loser points",
                                                        event.loserBracketPointsToVictory.joinToString(),
                                                    ),
                                                )
                                            }
                                        }
                                    }

                                    EventType.EVENT -> {
                                        // No additional event-only rows for now.
                                    }
                                }
                            },
                        )
                    },
                    editContent = {
                    Text(
                        text = "Team settings",
                        style = MaterialTheme.typography.titleSmall,
                        color = Color(localImageScheme.current.onSurface),
                    )

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
                                checked = if (isNewEvent) true else editEvent.singleDivision,
                                label = "Single Division",
                                enabled = !isNewEvent,
                                onCheckedChange = { checked ->
                                    if (isNewEvent) {
                                        return@LabeledCheckboxRow
                                    }
                                    val fallbackMaxParticipants = editEvent.maxParticipants.coerceAtLeast(2)
                                    val fallbackPlayoffCount = (
                                        editEvent.playoffTeamCount
                                            ?: divisionDetailsForSettings.firstOrNull()?.playoffTeamCount
                                            ?: fallbackMaxParticipants
                                        ).coerceAtLeast(2)
                                    val defaultInstallmentAmounts = editEvent.installmentAmounts.map { amount ->
                                        amount.coerceAtLeast(0)
                                    }
                                    val defaultInstallmentDueDates = editEvent.installmentDueDates
                                        .map { dueDate -> dueDate.trim() }
                                        .filter(String::isNotBlank)
                                    val defaultInstallmentCount = maxOf(
                                        editEvent.installmentCount ?: 0,
                                        defaultInstallmentAmounts.size,
                                        defaultInstallmentDueDates.size,
                                    ).takeIf { count -> count > 0 }
                                    val defaultAllowPaymentPlans = editEvent.allowPaymentPlans == true &&
                                        defaultInstallmentCount != null &&
                                        editEvent.priceCents.coerceAtLeast(0) > 0
                                    onEditEvent {
                                        val normalizedDivisions = divisions.normalizeDivisionIdentifiers()
                                        val nextDivisionDetails = mergeDivisionDetailsForDivisions(
                                            divisions = normalizedDivisions,
                                            existingDetails = divisionDetails,
                                            eventId = id,
                                        ).map { existing ->
                                            val nextPlayoffCount = if (!includePlayoffs) {
                                                null
                                            } else if (checked) {
                                                fallbackPlayoffCount
                                            } else {
                                                (
                                                    existing.playoffTeamCount
                                                        ?: fallbackMaxParticipants
                                                    ).coerceAtLeast(2)
                                            }
                                            if (checked) {
                                                existing.copy(
                                                    playoffTeamCount = nextPlayoffCount,
                                                    allowPaymentPlans = defaultAllowPaymentPlans,
                                                    installmentCount = defaultInstallmentCount,
                                                    installmentDueDates = if (defaultAllowPaymentPlans) {
                                                        defaultInstallmentDueDates
                                                    } else {
                                                        emptyList()
                                                    },
                                                    installmentAmounts = if (defaultAllowPaymentPlans) {
                                                        defaultInstallmentAmounts
                                                    } else {
                                                        emptyList()
                                                    },
                                                )
                                            } else {
                                                val existingInstallmentAmounts = existing.installmentAmounts
                                                    .map { amount -> amount.coerceAtLeast(0) }
                                                val existingInstallmentDueDates = existing.installmentDueDates
                                                    .map { dueDate -> dueDate.trim() }
                                                    .filter(String::isNotBlank)
                                                val existingInstallmentCount = maxOf(
                                                    existing.installmentCount ?: 0,
                                                    existingInstallmentAmounts.size,
                                                    existingInstallmentDueDates.size,
                                                ).takeIf { count -> count > 0 } ?: defaultInstallmentCount
                                                val existingAllowPaymentPlans = when (existing.allowPaymentPlans) {
                                                    null -> defaultAllowPaymentPlans
                                                    else -> existing.allowPaymentPlans == true
                                                } && existingInstallmentCount != null
                                                existing.copy(
                                                    playoffTeamCount = nextPlayoffCount,
                                                    allowPaymentPlans = existingAllowPaymentPlans,
                                                    installmentCount = if (existingAllowPaymentPlans) {
                                                        existingInstallmentCount
                                                    } else {
                                                        null
                                                    },
                                                    installmentDueDates = if (existingAllowPaymentPlans) {
                                                        if (existingInstallmentDueDates.isNotEmpty()) {
                                                            existingInstallmentDueDates
                                                        } else {
                                                            defaultInstallmentDueDates
                                                        }
                                                    } else {
                                                        emptyList()
                                                    },
                                                    installmentAmounts = if (existingAllowPaymentPlans) {
                                                        if (existingInstallmentAmounts.isNotEmpty()) {
                                                            existingInstallmentAmounts
                                                        } else {
                                                            defaultInstallmentAmounts
                                                        }
                                                    } else {
                                                        emptyList()
                                                    },
                                                )
                                            }
                                        }
                                        copy(
                                            singleDivision = checked,
                                            playoffTeamCount = if (includePlayoffs) {
                                                if (checked) {
                                                    fallbackPlayoffCount
                                                } else {
                                                    (playoffTeamCount ?: fallbackPlayoffCount).coerceAtLeast(2)
                                                }
                                            } else {
                                                null
                                            },
                                            divisionDetails = nextDivisionDetails,
                                        )
                                    }
                                },
                            )
                        }
                    }

                    if (isNewEvent) {
                        Text(
                            text = "Split-by-division setup is available on the web version.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(localImageScheme.current.onSurfaceVariant),
                        )
                    }

                    if (editEvent.eventType != EventType.EVENT) {
                        Text(
                            "Leagues and tournaments are always team events. Use Single Division to keep one shared capacity for all divisions.",
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

                    Text(
                        text = "Divisions",
                        style = MaterialTheme.typography.titleSmall,
                        color = Color(localImageScheme.current.onSurface),
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        PlatformDropdown(
                            selectedValue = divisionEditor.gender,
                            onSelectionChange = { value ->
                                updateDivisionEditorSelection(gender = value)
                            },
                            options = DIVISION_GENDER_OPTIONS,
                            modifier = Modifier.weight(1f),
                            label = "Gender",
                            placeholder = "Select gender",
                        )
                        PlatformDropdown(
                            selectedValue = divisionEditor.skillDivisionTypeId,
                            onSelectionChange = { value ->
                                updateDivisionEditorSelection(skillDivisionTypeId = value)
                            },
                            options = skillDivisionTypeSelectOptions,
                            modifier = Modifier.weight(1f),
                            label = "Skill Division",
                            placeholder = "Select skill division",
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        PlatformDropdown(
                            selectedValue = divisionEditor.ageDivisionTypeId,
                            onSelectionChange = { value ->
                                updateDivisionEditorSelection(ageDivisionTypeId = value)
                            },
                            options = ageDivisionTypeSelectOptions,
                            modifier = Modifier.weight(1f),
                            label = "Age Division",
                            placeholder = "Select age division",
                        )
                        PlatformTextField(
                            value = divisionEditor.name,
                            onValueChange = { value ->
                                divisionEditor = divisionEditor.copy(
                                    name = value,
                                    nameTouched = true,
                                    error = null,
                                )
                            },
                            modifier = Modifier.weight(1f),
                            label = "Division Name",
                            enabled = divisionEditorReady,
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        MoneyInputField(
                            value = MoneyInputUtils.centsToDisplayValue(
                                if (editEvent.singleDivision) {
                                    editEvent.priceCents.coerceAtLeast(0)
                                } else {
                                    divisionEditor.priceCents.coerceAtLeast(0)
                                },
                            ),
                            onValueChange = { value ->
                                if (!divisionEditorReady || editEvent.singleDivision || !hostHasAccount) {
                                    return@MoneyInputField
                                }
                                divisionEditor = divisionEditor.copy(
                                    priceCents = MoneyInputUtils.displayValueToCents(value).coerceAtLeast(0),
                                    error = null,
                                )
                            },
                            modifier = Modifier.weight(1f),
                            label = "Division Price",
                            enabled = !editEvent.singleDivision && hostHasAccount && divisionEditorReady,
                        )
                        NumberInputField(
                            modifier = Modifier.weight(1f),
                            value = if (editEvent.singleDivision) {
                                editEvent.maxParticipants.coerceAtLeast(2).toString()
                            } else {
                                divisionEditor.maxParticipants.coerceAtLeast(2).toString()
                            },
                            label = if (editEvent.teamSignup) {
                                "Division Max Teams"
                            } else {
                                "Division Max Participants"
                            },
                            enabled = !editEvent.singleDivision && divisionEditorReady,
                            onValueChange = { value ->
                                if (!divisionEditorReady || editEvent.singleDivision) {
                                    return@NumberInputField
                                }
                                if (value.all { it.isDigit() }) {
                                    val parsed = value.toIntOrNull()?.coerceAtLeast(2) ?: 2
                                    divisionEditor = divisionEditor.copy(
                                        maxParticipants = parsed,
                                        error = null,
                                    )
                                }
                            },
                            isError = false,
                        )
                    }

                    if (editEvent.eventType == EventType.LEAGUE) {
                        NumberInputField(
                            modifier = Modifier.fillMaxWidth(),
                            value = if (editEvent.singleDivision) {
                                (editEvent.playoffTeamCount ?: editEvent.maxParticipants.coerceAtLeast(2)).toString()
                            } else {
                                divisionEditor.playoffTeamCount.coerceAtLeast(2).toString()
                            },
                            label = "Division Playoff Team Count",
                            enabled = !editEvent.singleDivision && editEvent.includePlayoffs && divisionEditorReady,
                            onValueChange = { value ->
                                if (
                                    !divisionEditorReady ||
                                    editEvent.singleDivision ||
                                    !editEvent.includePlayoffs
                                ) {
                                    return@NumberInputField
                                }
                                if (value.all { it.isDigit() }) {
                                    val parsed = value.toIntOrNull()?.coerceAtLeast(2) ?: 2
                                    divisionEditor = divisionEditor.copy(
                                        playoffTeamCount = parsed,
                                        error = null,
                                    )
                                }
                            },
                            isError = false,
                            supportingText = if (!editEvent.includePlayoffs) {
                                "Enable playoffs to set playoff team count per division."
                            } else {
                                null
                            },
                        )
                    }

                    if (!isNewEvent && !editEvent.singleDivision) {
                        HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                        Text(
                            text = "Division Payment Plan",
                            style = MaterialTheme.typography.titleSmall,
                            color = Color(localImageScheme.current.onSurface),
                        )
                        LabeledCheckboxRow(
                            checked = divisionEditor.allowPaymentPlans,
                            label = "Allow payment plan for this division",
                            enabled = hostHasAccount && divisionEditor.priceCents > 0 && divisionEditorReady,
                            onCheckedChange = { checked ->
                                if (!divisionEditorReady || !hostHasAccount) {
                                    return@LabeledCheckboxRow
                                }
                                setDivisionPaymentPlansEnabled(checked)
                            },
                        )
                        if (divisionEditor.allowPaymentPlans) {
                            val installmentCount = maxOf(
                                divisionEditor.installmentCount,
                                divisionEditor.installmentAmounts.size,
                                divisionEditor.installmentDueDates.size,
                                1,
                            )
                            NumberInputField(
                                value = installmentCount.toString(),
                                label = "Installment Count",
                                onValueChange = { newValue ->
                                    if (!newValue.all { it.isDigit() }) return@NumberInputField
                                    val parsed = newValue.toIntOrNull() ?: 1
                                    syncDivisionInstallmentCount(parsed.coerceAtLeast(1))
                                },
                                isError = installmentCount <= 0,
                                errorMessage = "Installment count must be at least 1.",
                            )
                            repeat(installmentCount) { index ->
                                val amountCents = divisionEditor.installmentAmounts.getOrNull(index) ?: 0
                                val dueDate = divisionEditor.installmentDueDates.getOrNull(index).orEmpty()
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.Top,
                                ) {
                                    MoneyInputField(
                                        value = amountCents.toString(),
                                        label = "Installment ${index + 1} Amount",
                                        onValueChange = { newValue ->
                                            val parsed = newValue.filter(Char::isDigit).toIntOrNull() ?: 0
                                            updateDivisionInstallmentAmount(index, parsed)
                                        },
                                        modifier = Modifier.weight(1f),
                                    )
                                    PlatformTextField(
                                        value = dueDate,
                                        onValueChange = {},
                                        label = "Due Date",
                                        placeholder = "YYYY-MM-DD",
                                        modifier = Modifier.weight(1f),
                                        readOnly = true,
                                        onTap = { divisionInstallmentDueDatePickerIndex = index },
                                    )
                                }
                                if (installmentCount > 1) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.End,
                                    ) {
                                        TextButton(
                                            onClick = { removeDivisionInstallmentRow(index) },
                                        ) {
                                            Text(
                                                text = "Remove installment",
                                                color = MaterialTheme.colorScheme.error,
                                            )
                                        }
                                    }
                                }
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                TextButton(onClick = { addDivisionInstallmentRow() }) {
                                    Text("Add installment")
                                }
                                val installmentTotal = divisionEditor.installmentAmounts.sum()
                                val totalsMatch = installmentTotal == divisionEditor.priceCents
                                Text(
                                    text = "Total ${installmentTotal.toDouble().div(100).moneyFormat()} / ${divisionEditor.priceCents.toDouble().div(100).moneyFormat()}",
                                    color = if (totalsMatch) {
                                        Color(localImageScheme.current.onSurfaceVariant)
                                    } else {
                                        MaterialTheme.colorScheme.error
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }

                    if (editEvent.singleDivision) {
                        Text(
                            text = if (editEvent.eventType == EventType.LEAGUE) {
                                "Division price, capacity, payment plan, and playoff team count mirror event-level values while single division is enabled."
                            } else {
                                "Division price, capacity, and payment plan mirror event-level values while single division is enabled."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(localImageScheme.current.onSurfaceVariant),
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Button(
                            onClick = { handleSaveDivisionDetail() },
                            enabled = true,
                        ) {
                            Text(if (divisionEditor.editingId.isNullOrBlank()) "Add Division" else "Update Division")
                        }
                        if (!divisionEditor.editingId.isNullOrBlank()) {
                            TextButton(onClick = { resetDivisionEditor() }) {
                                Text("Cancel Edit")
                            }
                        }
                    }

                    if (divisionEditor.error != null) {
                        Text(
                            text = divisionEditor.error.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    if (!isSkillLevelValid) {
                        Text(
                            text = "Add at least one division.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }

                    if (divisionDetailsForSettings.isNotEmpty()) {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            divisionDetailsForSettings.forEach { detail ->
                                val priceCents = if (editEvent.singleDivision) {
                                    editEvent.priceCents.coerceAtLeast(0)
                                } else {
                                    (detail.price ?: editEvent.priceCents).coerceAtLeast(0)
                                }
                                val maxParticipants = if (editEvent.singleDivision) {
                                    editEvent.maxParticipants.coerceAtLeast(2)
                                } else {
                                    (detail.maxParticipants ?: editEvent.maxParticipants).coerceAtLeast(2)
                                }
                                val playoffTeams = if (
                                    editEvent.eventType == EventType.LEAGUE &&
                                    editEvent.includePlayoffs
                                ) {
                                    if (editEvent.singleDivision) {
                                        editEvent.playoffTeamCount ?: maxParticipants
                                    } else {
                                        detail.playoffTeamCount ?: maxParticipants
                                    }
                                } else {
                                    null
                                }
                                val normalizedDetail = detail.normalizeDivisionDetail(editEvent.id)
                                val detailMeta = listOf(
                                    normalizedDetail.gender.ifBlank { "C" },
                                    normalizedDetail.skillDivisionTypeName.ifBlank {
                                        normalizedDetail.skillDivisionTypeId.toDivisionDisplayLabel()
                                    },
                                    normalizedDetail.ageDivisionTypeName.ifBlank {
                                        normalizedDetail.ageDivisionTypeId.toDivisionDisplayLabel()
                                    },
                                ).joinToString(" • ")

                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                                    ),
                                    border = BorderStroke(
                                        1.dp,
                                        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                                    ),
                                ) {
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 12.dp, vertical = 10.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Text(
                                            text = detail.name,
                                            style = MaterialTheme.typography.titleSmall,
                                            color = MaterialTheme.colorScheme.onSurface,
                                        )
                                        Text(
                                            text = detailMeta,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        Text(
                                            text = "Price: ${priceCents.toDouble().div(100.0).moneyFormat()} • ${if (editEvent.teamSignup) "Max teams" else "Max participants"}: $maxParticipants",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        val paymentPlanInstallmentCount = maxOf(
                                            detail.installmentCount ?: 0,
                                            detail.installmentAmounts.size,
                                            detail.installmentDueDates.size,
                                        )
                                        if (detail.allowPaymentPlans == true && paymentPlanInstallmentCount > 0) {
                                            Text(
                                                text = "Payment plan: $paymentPlanInstallmentCount installments",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                        if (playoffTeams != null) {
                                            Text(
                                                text = "Playoff teams: ${playoffTeams.coerceAtLeast(2)}",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.End,
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            TextButton(onClick = { handleEditDivisionDetail(detail.id) }) {
                                                Text("Edit")
                                            }
                                            TextButton(onClick = { handleRemoveDivisionDetail(detail.id) }) {
                                                Text(
                                                    text = "Remove",
                                                    color = MaterialTheme.colorScheme.error,
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                })

                if (isNewEvent && editEvent.eventType == EventType.LEAGUE) {
                    animatedCardSection(
                        sectionId = "league_scoring",
                        sectionTitle = "League Scoring Config",
                        collapsibleInEditMode = true,
                        collapsibleInViewMode = true,
                        viewSummary = "Scoring rules",
                        defaultExpandedInViewMode = false,
                        defaultExpandedInEditMode = true,
                        isEditMode = editView,
                        animationDelay = 440,
                        viewContent = {
                            DetailKeyValueList(
                                rows = listOf(
                                    DetailRowSpec(
                                        "Scoring profile",
                                        sports.firstOrNull { it.id == editEvent.sportId }?.name ?: "Default",
                                    ),
                                ),
                            )
                        },
                        editContent = {
                            val selectedSport = sports.firstOrNull { it.id == editEvent.sportId }
                            LeagueScoringConfigFields(
                                config = leagueScoringConfig,
                                sport = selectedSport,
                                onConfigChange = onLeagueScoringConfigChange,
                            )
                        },
                    )
                }

                if (isNewEvent && (editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT)) {
                    animatedCardSection(
                        sectionId = "facility_schedule",
                        sectionTitle = "Schedule Config",
                        collapsibleInEditMode = true,
                        collapsibleInViewMode = true,
                        viewSummary = facilitiesSummaryLine,
                        defaultExpandedInViewMode = false,
                        defaultExpandedInEditMode = false,
                        isEditMode = editView,
                        animationDelay = 450,
                        viewContent = {
                            DetailKeyValueList(
                                rows = buildList {
                                    add(DetailRowSpec("Field count", (editEvent.fieldCount ?: 0).toString()))
                                    if (editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT) {
                                        add(
                                            DetailRowSpec(
                                                "Weekly timeslots",
                                                "${eventWithRelations.timeSlots.size}",
                                            ),
                                        )
                                    }
                                },
                            )
                        },
                        editContent = {
                            val setCountOptions = listOf(
                                DropdownOption(value = "1", label = "Best of 1"),
                                DropdownOption(value = "3", label = "Best of 3"),
                                DropdownOption(value = "5", label = "Best of 5"),
                            )
                            if (editEvent.eventType == EventType.LEAGUE) {
                                LeagueConfigurationFields(
                                    leagueConfig = editEvent.toLeagueConfig(),
                                    onLeagueConfigChange = { updated ->
                                        onEditEvent { withLeagueConfig(updated) }
                                    },
                                )
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
                                        if (editEvent.singleDivision) {
                                            "Playoff team count must be at least 2 when playoffs are enabled."
                                        } else {
                                            "Each division must have a playoff team count of at least 2 when playoffs are enabled."
                                        },
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
                                    val normalizedWinnerSetCount = remember(editEvent.winnerSetCount) {
                                        when (editEvent.winnerSetCount) {
                                            1, 3, 5 -> editEvent.winnerSetCount
                                            else -> 1
                                        }
                                    }

                                    PlatformDropdown(
                                        selectedValue = normalizedWinnerSetCount.toString(),
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
                                }

                                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                    val constrainedWinnerSetCount = remember(editEvent.winnerSetCount) {
                                        when (editEvent.winnerSetCount) {
                                            1, 3, 5 -> editEvent.winnerSetCount
                                            else -> 1
                                        }
                                    }

                                    val focusRequesters = remember(constrainedWinnerSetCount) {
                                        List(constrainedWinnerSetCount) { FocusRequester() }
                                    }

                                    FlowRow(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        repeat(constrainedWinnerSetCount) { index ->
                                            PointsTextField(
                                                modifier = Modifier.fillMaxWidth(0.48f),
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
                                    val normalizedLoserSetCount = remember(editEvent.loserSetCount) {
                                        when (editEvent.loserSetCount) {
                                            1, 3, 5 -> editEvent.loserSetCount
                                            else -> 1
                                        }
                                    }
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.Top,
                                    ) {
                                        PlatformDropdown(
                                            selectedValue = normalizedLoserSetCount.toString(),
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
                                        when (editEvent.loserSetCount) {
                                            1, 3, 5 -> editEvent.loserSetCount
                                            else -> 1
                                        }
                                    }

                                    val loserFocusRequesters = remember(constrainedLoserSetCount) {
                                        List(constrainedLoserSetCount) { FocusRequester() }
                                    }

                                    FlowRow(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        repeat(constrainedLoserSetCount) { index ->
                                            PointsTextField(
                                                modifier = Modifier.fillMaxWidth(0.48f),
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
                                    Spacer(Modifier.height(12.dp))
                                }
                            }

                            LeagueScheduleFields(
                                fieldCount = fieldCount,
                                fields = editableFields,
                                slots = leagueTimeSlots,
                                onFieldCountChange = { count ->
                                    fieldCount = count
                                    onSelectFieldCount(count)
                                },
                                onFieldNameChange = onUpdateLocalFieldName,
                                onAddSlot = onAddLeagueTimeSlot,
                                onUpdateSlot = onUpdateLeagueTimeSlot,
                                onRemoveSlot = onRemoveLeagueTimeSlot,
                                slotErrors = leagueSlotErrors,
                                showSlotEditor = editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT,
                                slotDivisionOptions = slotDivisionOptions,
                                lockSlotDivisions = editEvent.singleDivision,
                                lockedDivisionIds = editEvent.divisions.normalizeDivisionIdentifiers(),
                                fieldCountError = if (!isFieldCountValid) {
                                    "Field count must be at least 1."
                                } else {
                                    null
                                },
                            )
                            if (editEvent.eventType == EventType.LEAGUE && editEvent.includePlayoffs) {
                                LeaguePlayoffConfigurationFields(
                                    leagueConfig = editEvent.toLeagueConfig(),
                                    playoffConfig = editEvent.toTournamentConfig(),
                                    onPlayoffConfigChange = { updated ->
                                        onEditTournament { withTournamentConfig(updated) }
                                    },
                                )
                            }
                            if (!isLeagueSlotsValid &&
                                (editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT)
                            ) {
                                Text(
                                    text = "Fix timeslot issues before continuing.",
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                        },
                    )
                }
            }
        }
    }
    userPickerTarget?.let { pickerTarget ->
        val selectedIdsForTarget = when (pickerTarget) {
            UserPickerTarget.HOST -> listOfNotNull(editEvent.hostId.takeIf(String::isNotBlank))
            UserPickerTarget.ASSISTANT_HOST -> editEvent.assistantHostIds
            UserPickerTarget.REFEREE -> editEvent.refereeIds
        }
        SearchPlayerDialog(
            freeAgents = emptyList(),
            friends = emptyList(),
            suggestions = userSuggestions.filterNot { candidate ->
                selectedIdsForTarget.contains(candidate.id)
            },
            onSearch = onSearchUsers,
            onPlayerSelected = { user ->
                selectedUsersById[user.id] = user
                when (pickerTarget) {
                    UserPickerTarget.HOST -> onUpdateHostId(user.id)
                    UserPickerTarget.ASSISTANT_HOST -> {
                        val updated = (
                            editEvent.assistantHostIds +
                                user.id
                            ).map { id -> id.trim() }
                            .filter(String::isNotBlank)
                            .distinct()
                            .filterNot { id -> id == editEvent.hostId }
                        onUpdateAssistantHostIds(updated)
                    }

                    UserPickerTarget.REFEREE -> onAddRefereeId(user.id)
                }
                pickerError = null
                userPickerTarget = null
            },
            onInviteByEmail = { email ->
                coroutineScope.launch {
                    onEnsureUserByEmail(email)
                        .onSuccess { user ->
                            selectedUsersById[user.id] = user
                            when (pickerTarget) {
                                UserPickerTarget.HOST -> onUpdateHostId(user.id)
                                UserPickerTarget.ASSISTANT_HOST -> {
                                    val updated = (
                                        editEvent.assistantHostIds +
                                            user.id
                                        ).map { id -> id.trim() }
                                        .filter(String::isNotBlank)
                                        .distinct()
                                        .filterNot { id -> id == editEvent.hostId }
                                    onUpdateAssistantHostIds(updated)
                                }

                                UserPickerTarget.REFEREE -> onAddRefereeId(user.id)
                            }
                            pickerError = null
                            userPickerTarget = null
                        }
                        .onFailure { error ->
                            pickerError = error.message ?: "Unable to invite by email."
                        }
                }
            },
            onDismiss = {
                userPickerTarget = null
                pickerError = null
            },
            eventName = editEvent.name.ifBlank { "Event" },
            entryLabel = when (pickerTarget) {
                UserPickerTarget.HOST -> "Host"
                UserPickerTarget.ASSISTANT_HOST -> "Assistant Host"
                UserPickerTarget.REFEREE -> "Referee"
            },
        )
    }

    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            val selected = selectedInstant ?: Clock.System.now()
            onEditEvent {
                val minimumEnd = kotlin.time.Instant.fromEpochMilliseconds(
                    selected.toEpochMilliseconds() + 60L * 60L * 1000L
                )
                copy(
                    start = selected,
                    end = if (!noFixedEndDateTime && end <= selected) minimumEnd else end,
                )
            }
            showStartPicker = false
        },
        onDismissRequest = { showStartPicker = false },
        showPicker = showStartPicker && !rentalTimeLocked,
        getTime = true,
        canSelectPast = false,
        initialDate = editEvent.start,
    )

    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            onEditEvent { copy(end = selectedInstant ?: Clock.System.now()) }
            showEndPicker = false
        },
        onDismissRequest = { showEndPicker = false },
        showPicker = showEndPicker && !rentalTimeLocked,
        getTime = true,
        canSelectPast = false,
        initialDate = editEvent.end,
    )

    val installmentInitialDate = remember(installmentDueDatePickerIndex, editEvent.installmentDueDates) {
        val selectedInstallmentIndex = installmentDueDatePickerIndex ?: return@remember null
        val rawDueDate = editEvent.installmentDueDates.getOrNull(selectedInstallmentIndex)?.trim().orEmpty()
        if (rawDueDate.isBlank()) {
            return@remember null
        }
        runCatching {
            LocalDate.parse(rawDueDate).atStartOfDayIn(TimeZone.currentSystemDefault())
        }.getOrNull()
    }

    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            val targetIndex = installmentDueDatePickerIndex
            if (targetIndex != null) {
                val selectedDate = (selectedInstant ?: Clock.System.now())
                    .toLocalDateTime(TimeZone.currentSystemDefault())
                    .date
                onUpdateInstallmentDueDate(targetIndex, selectedDate.toString())
            }
            installmentDueDatePickerIndex = null
        },
        onDismissRequest = { installmentDueDatePickerIndex = null },
        showPicker = installmentDueDatePickerIndex != null,
        getTime = false,
        canSelectPast = false,
        initialDate = installmentInitialDate,
    )

    val divisionInstallmentInitialDate = remember(
        divisionInstallmentDueDatePickerIndex,
        divisionEditor.installmentDueDates,
    ) {
        val selectedInstallmentIndex = divisionInstallmentDueDatePickerIndex ?: return@remember null
        val rawDueDate = divisionEditor.installmentDueDates
            .getOrNull(selectedInstallmentIndex)
            ?.trim()
            .orEmpty()
        if (rawDueDate.isBlank()) {
            return@remember null
        }
        runCatching {
            LocalDate.parse(rawDueDate).atStartOfDayIn(TimeZone.currentSystemDefault())
        }.getOrNull()
    }

    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            val targetIndex = divisionInstallmentDueDatePickerIndex
            if (targetIndex != null) {
                val selectedDate = (selectedInstant ?: Clock.System.now())
                    .toLocalDateTime(TimeZone.currentSystemDefault())
                    .date
                updateDivisionInstallmentDueDate(targetIndex, selectedDate.toString())
            }
            divisionInstallmentDueDatePickerIndex = null
        },
        onDismissRequest = { divisionInstallmentDueDatePickerIndex = null },
        showPicker = divisionInstallmentDueDatePickerIndex != null,
        getTime = false,
        canSelectPast = false,
        initialDate = divisionInstallmentInitialDate,
    )

    EventMap(
        component = mapComponent,
        onEventSelected = { showImageSelector = true },
        onPlaceSelected = { place ->
            if (editView) {
                onPlaceSelected(place)
                previousSelection = LatLng(place.latitude, place.longitude)
                mapComponent.toggleMap()
            }
        },
        onPlaceSelectionPoint = { x, y ->
            onMapRevealCenterChange(Offset(x, y))
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
        revealCenter = mapRevealCenter,
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
        val imageId = editEvent.imageId.trim()
        if (imageId.isBlank()) {
            isColorLoaded = false
            return@LaunchedEffect
        }

        isColorLoaded = false
        onEditEvent { copy(imageId = imageId) }
        val imageUrl = Url(getImageUrl(imageId))
        runCatching {
            loader.load(imageUrl)
            dominantColorState.updateFrom(imageUrl)
        }.onFailure { throwable ->
            Napier.w(
                message = "Failed to extract event image colors for imageId=$imageId",
                throwable = throwable
            )
        }
        isColorLoaded = true
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

@Composable
private fun SummaryTagChip(label: String) {
    Box(
        modifier = Modifier
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                shape = RoundedCornerShape(12.dp)
            )
            .padding(horizontal = 10.dp, vertical = 6.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

fun LazyListScope.animatedCardSection(
    sectionId: String,
    sectionTitle: String? = null,
    collapsibleInEditMode: Boolean = false,
    collapsibleInViewMode: Boolean = false,
    defaultExpandedInEditMode: Boolean = true,
    defaultExpandedInViewMode: Boolean = true,
    viewSummary: String? = null,
    editSummary: String? = null,
    isEditMode: Boolean,
    animationDelay: Int = 0,
    viewContent: @Composable() (ColumnScope.() -> Unit),
    editContent: @Composable() (ColumnScope.() -> Unit)
) {
    item(key = sectionId) {
        val isCollapsible = if (isEditMode) collapsibleInEditMode else collapsibleInViewMode
        val defaultExpanded = if (isEditMode) defaultExpandedInEditMode else defaultExpandedInViewMode
        var expanded by rememberSaveable(sectionId, isEditMode) {
            mutableStateOf(defaultExpanded)
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface),
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp, horizontal = 16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (sectionTitle != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text(
                                    text = sectionTitle,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = Color(localImageScheme.current.onSurface),
                                )
                                if (isCollapsible && !expanded) {
                                    val summaryText = if (isEditMode) editSummary else viewSummary
                                    if (!summaryText.isNullOrBlank()) {
                                        Text(
                                            text = summaryText,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                            if (isCollapsible) {
                                TextButton(onClick = { expanded = !expanded }) {
                                    Icon(
                                        imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                        contentDescription = if (expanded) "Collapse section" else "Expand section",
                                    )
                                }
                            }
                        }
                    }

                    AnimatedVisibility(
                        visible = !isCollapsible || expanded,
                    ) {
                        AnimatedContent(
                            targetState = isEditMode,
                            transitionSpec = { transitionSpec(animationDelay) },
                            label = "cardTransition",
                        ) { editMode ->
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.Start,
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

private data class DetailRowSpec(
    val label: String,
    val value: String?,
)

private data class DetailGridItem(
    val label: String,
    val value: String?,
)

@Composable
private fun DetailKeyValueList(
    rows: List<DetailRowSpec>,
    modifier: Modifier = Modifier,
) {
    val normalizedRows = rows
        .map { row -> row.copy(value = row.value?.trim()) }
        .filter { !it.value.isNullOrBlank() }
    if (normalizedRows.isEmpty()) return

    Column(
        modifier = modifier.fillMaxWidth(),
    ) {
        normalizedRows.forEachIndexed { index, row ->
            DetailKeyValueRow(
                label = row.label,
                value = row.value.orEmpty(),
            )
            if (index < normalizedRows.lastIndex) {
                HorizontalDivider(
                    color = MaterialTheme.colorScheme.outlineVariant,
                    thickness = 1.dp,
                )
            }
        }
    }
}

@Composable
private fun DetailKeyValueRow(
    label: String,
    value: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(0.44f),
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        )
        Text(
            text = value,
            modifier = Modifier.weight(0.56f),
            style = MaterialTheme.typography.bodyMedium.copy(
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
            ),
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.End,
        )
    }
}

@Composable
private fun DetailStatsGrid(
    items: List<DetailGridItem>,
    modifier: Modifier = Modifier,
) {
    val normalizedItems = items
        .map { item -> item.copy(value = item.value?.trim()) }
        .filter { !it.value.isNullOrBlank() }
    if (normalizedItems.isEmpty()) return

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        normalizedItems.chunked(2).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                row.forEach { item ->
                    Card(
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                        ),
                        border = BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                        ),
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 10.dp, vertical = 9.dp),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text(
                                text = item.label,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                ),
                            )
                            Text(
                                text = item.value.orEmpty(),
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.SemiBold,
                                ),
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }
                if (row.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

internal data class DivisionEditorState(
    val editingId: String? = null,
    val gender: String = "",
    val skillDivisionTypeId: String = "",
    val skillDivisionTypeName: String = "",
    val ageDivisionTypeId: String = "",
    val ageDivisionTypeName: String = "",
    val name: String = "",
    val priceCents: Int = 0,
    val maxParticipants: Int = 2,
    val playoffTeamCount: Int = 2,
    val allowPaymentPlans: Boolean = false,
    val installmentCount: Int = 0,
    val installmentDueDates: List<String> = emptyList(),
    val installmentAmounts: List<Int> = emptyList(),
    val nameTouched: Boolean = false,
    val error: String? = null,
)

internal data class ParsedDivisionToken(
    val gender: String,
    val skillDivisionTypeId: String,
    val ageDivisionTypeId: String,
)

internal val DIVISION_TOKEN_PATTERN = Regex("^([mfc])_(age|skill)_(.+)$")
internal val COMBINED_DIVISION_TOKEN_PATTERN = Regex("^([mfc])_skill_(.+)_age_(.+)$")
internal val DIVISION_NAME_WHITESPACE_PATTERN = Regex("\\s+")

internal val DIVISION_GENDER_OPTIONS = listOf(
    DropdownOption(value = "M", label = "Men"),
    DropdownOption(value = "F", label = "Women"),
    DropdownOption(value = "C", label = "Coed"),
)

internal fun defaultDivisionEditorState(
    defaultPriceCents: Int,
    defaultMaxParticipants: Int,
    defaultPlayoffTeamCount: Int?,
    defaultAllowPaymentPlans: Boolean,
    defaultInstallmentCount: Int?,
    defaultInstallmentDueDates: List<String>,
    defaultInstallmentAmounts: List<Int>,
): DivisionEditorState {
    val fallbackMax = defaultMaxParticipants.coerceAtLeast(2)
    val fallbackPlayoff = (defaultPlayoffTeamCount ?: fallbackMax).coerceAtLeast(2)
    val normalizedInstallmentAmounts = defaultInstallmentAmounts.map { amount ->
        amount.coerceAtLeast(0)
    }
    val normalizedInstallmentDueDates = defaultInstallmentDueDates
        .map { dueDate -> dueDate.trim() }
        .filter(String::isNotBlank)
    val normalizedInstallmentCount = maxOf(
        defaultInstallmentCount ?: 0,
        normalizedInstallmentAmounts.size,
        normalizedInstallmentDueDates.size,
    ).takeIf { count -> count > 0 } ?: 0
    val normalizedAllowPaymentPlans = defaultAllowPaymentPlans &&
        normalizedInstallmentCount > 0 &&
        defaultPriceCents.coerceAtLeast(0) > 0
    return DivisionEditorState(
        editingId = null,
        gender = "",
        skillDivisionTypeId = "",
        skillDivisionTypeName = "",
        ageDivisionTypeId = "",
        ageDivisionTypeName = "",
        name = "",
        priceCents = defaultPriceCents.coerceAtLeast(0),
        maxParticipants = fallbackMax,
        playoffTeamCount = fallbackPlayoff,
        allowPaymentPlans = normalizedAllowPaymentPlans,
        installmentCount = if (normalizedAllowPaymentPlans) normalizedInstallmentCount else 0,
        installmentDueDates = if (normalizedAllowPaymentPlans) normalizedInstallmentDueDates else emptyList(),
        installmentAmounts = if (normalizedAllowPaymentPlans) normalizedInstallmentAmounts else emptyList(),
        nameTouched = false,
        error = null,
    )
}

internal fun buildSkillDivisionTypeOptions(
    existingDetails: List<DivisionDetail>,
): List<DropdownOption> {
    val options = linkedMapOf<String, String>()
    fun addOption(divisionTypeId: String, label: String? = null) {
        val normalizedId = divisionTypeId.normalizeDivisionIdentifier()
        if (normalizedId.isBlank()) return
        options[normalizedId] = label?.trim().takeIf { !it.isNullOrBlank() }
            ?: normalizedId.toDivisionDisplayLabel()
    }

    DEFAULT_DIVISION_OPTIONS.forEach { divisionTypeId ->
        addOption(divisionTypeId)
    }
    existingDetails.forEach { detail ->
        val normalizedDetail = detail.normalizeDivisionDetail()
        addOption(
            divisionTypeId = normalizedDetail.skillDivisionTypeId,
            label = normalizedDetail.skillDivisionTypeName,
        )
    }
    return options.map { (value, label) ->
        DropdownOption(value = value, label = label)
    }
}

internal fun buildAgeDivisionTypeOptions(
    existingDetails: List<DivisionDetail>,
): List<DropdownOption> {
    val options = linkedMapOf<String, String>()
    fun addOption(divisionTypeId: String, label: String? = null) {
        val normalizedId = divisionTypeId.normalizeDivisionIdentifier()
        if (normalizedId.isBlank()) return
        options[normalizedId] = label?.trim().takeIf { !it.isNullOrBlank() }
            ?: normalizedId.toDivisionDisplayLabel()
    }

    DEFAULT_AGE_DIVISION_OPTIONS.forEach { divisionTypeId ->
        addOption(divisionTypeId)
    }
    existingDetails.forEach { detail ->
        val normalizedDetail = detail.normalizeDivisionDetail()
        addOption(
            divisionTypeId = normalizedDetail.ageDivisionTypeId,
            label = normalizedDetail.ageDivisionTypeName,
        )
    }
    return options.map { (value, label) ->
        DropdownOption(value = value, label = label)
    }
}

internal fun resolveDivisionTypeName(
    divisionTypeId: String,
    existingDetails: List<DivisionDetail>,
    fallbackOptions: List<DropdownOption>,
): String {
    val normalizedDivisionTypeId = divisionTypeId.normalizeDivisionIdentifier()
    if (normalizedDivisionTypeId.isBlank()) return ""
    existingDetails.firstOrNull { detail ->
        val normalizedDetail = detail.normalizeDivisionDetail()
        normalizedDetail.skillDivisionTypeId.normalizeDivisionIdentifier() == normalizedDivisionTypeId ||
            normalizedDetail.ageDivisionTypeId.normalizeDivisionIdentifier() == normalizedDivisionTypeId ||
            normalizedDetail.divisionTypeId.normalizeDivisionIdentifier() == normalizedDivisionTypeId
    }?.let { matchedDetail ->
        val normalizedDetail = matchedDetail.normalizeDivisionDetail()
        val resolvedName = when {
            normalizedDetail.skillDivisionTypeId.normalizeDivisionIdentifier() == normalizedDivisionTypeId -> {
                normalizedDetail.skillDivisionTypeName
            }
            normalizedDetail.ageDivisionTypeId.normalizeDivisionIdentifier() == normalizedDivisionTypeId -> {
                normalizedDetail.ageDivisionTypeName
            }
            else -> normalizedDetail.divisionTypeName
        }.trim()
        if (resolvedName.isNotBlank()) {
            return resolvedName
        }
    }

    fallbackOptions.firstOrNull { option ->
        option.value.normalizeDivisionIdentifier() == normalizedDivisionTypeId
    }?.label?.takeIf { it.isNotBlank() }?.let { return it }

    return normalizedDivisionTypeId.toDivisionDisplayLabel(existingDetails)
}

internal fun parseDivisionToken(detail: DivisionDetail): ParsedDivisionToken {
    val tokenFromDetail = detail.key.normalizeDivisionIdentifier().ifBlank {
        detail.id.extractDivisionTokenFromId().orEmpty()
    }
    val combinedMatch = COMBINED_DIVISION_TOKEN_PATTERN.matchEntire(tokenFromDetail)
    if (combinedMatch != null) {
        return ParsedDivisionToken(
            gender = combinedMatch.groupValues[1].uppercase(),
            skillDivisionTypeId = combinedMatch.groupValues[2].normalizeDivisionIdentifier()
                .ifBlank { DEFAULT_DIVISION },
            ageDivisionTypeId = combinedMatch.groupValues[3].normalizeDivisionIdentifier()
                .ifBlank { DEFAULT_AGE_DIVISION },
        )
    }
    val legacyMatch = DIVISION_TOKEN_PATTERN.matchEntire(tokenFromDetail)
    if (legacyMatch != null) {
        val normalizedLegacyDivisionTypeId = legacyMatch.groupValues[3]
            .normalizeDivisionIdentifier()
            .ifBlank { DEFAULT_DIVISION }
        val legacyRatingType = legacyMatch.groupValues[2].uppercase()
        return ParsedDivisionToken(
            gender = legacyMatch.groupValues[1].uppercase(),
            skillDivisionTypeId = if (legacyRatingType == "SKILL") {
                normalizedLegacyDivisionTypeId
            } else {
                DEFAULT_DIVISION
            },
            ageDivisionTypeId = if (legacyRatingType == "AGE") {
                normalizedLegacyDivisionTypeId
            } else {
                DEFAULT_AGE_DIVISION
            },
        )
    }
    val normalizedDetail = detail.normalizeDivisionDetail()
    val fallbackGender = normalizedDetail.gender.trim().uppercase().ifBlank { "C" }
    return ParsedDivisionToken(
        gender = fallbackGender,
        skillDivisionTypeId = normalizedDetail.skillDivisionTypeId.normalizeDivisionIdentifier()
            .ifBlank { DEFAULT_DIVISION },
        ageDivisionTypeId = normalizedDetail.ageDivisionTypeId.normalizeDivisionIdentifier()
            .ifBlank { DEFAULT_AGE_DIVISION },
    )
}

internal fun buildUniqueDivisionIdForToken(
    eventId: String,
    divisionToken: String,
    existingDivisionIds: List<String>,
): String {
    val usedDivisionIds = existingDivisionIds
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toSet()

    var suffix = 1
    while (true) {
        val scopedEventId = if (suffix == 1) eventId else "${eventId}_$suffix"
        val candidate = buildEventDivisionId(scopedEventId, divisionToken)
            .normalizeDivisionIdentifier()
        if (!usedDivisionIds.contains(candidate)) {
            return candidate
        }
        suffix += 1
    }
}

internal fun String.normalizeDivisionNameKey(): String {
    return trim()
        .lowercase()
        .replace(DIVISION_NAME_WHITESPACE_PATTERN, " ")
}

internal fun buildDivisionToken(
    gender: String,
    skillDivisionTypeId: String,
    ageDivisionTypeId: String,
): String {
    return buildGenderSkillAgeDivisionToken(
        gender = gender,
        skillDivisionTypeId = skillDivisionTypeId,
        ageDivisionTypeId = ageDivisionTypeId,
    )
}

internal fun buildDivisionName(
    gender: String,
    skillDivisionTypeName: String,
    ageDivisionTypeName: String,
): String {
    val normalizedSkillDivisionTypeName = skillDivisionTypeName.trim().ifBlank {
        DEFAULT_DIVISION.toDivisionDisplayLabel()
    }
    val normalizedAgeDivisionTypeName = ageDivisionTypeName.trim().ifBlank {
        DEFAULT_AGE_DIVISION.toDivisionDisplayLabel()
    }
    return when (gender.trim().uppercase()) {
        "M" -> "Men's $normalizedSkillDivisionTypeName $normalizedAgeDivisionTypeName"
        "F" -> "Women's $normalizedSkillDivisionTypeName $normalizedAgeDivisionTypeName"
        else -> "Coed $normalizedSkillDivisionTypeName $normalizedAgeDivisionTypeName"
    }
}

private fun Int.toRegistrationCutoffSummary(): String {
    return when (this) {
        0 -> "No cutoff"
        1 -> "24h before start"
        2 -> "48h before start"
        else -> "No cutoff"
    }
}

private fun Int.toRefundSummary(): String {
    return when (this) {
        0 -> "Automatic refunds"
        1 -> "24h before start"
        2 -> "48h before start"
        else -> "No cutoff"
    }
}

private fun List<String>.normalizeTemplateIds(): List<String> {
    return map { templateId -> templateId.trim() }
        .filter(String::isNotBlank)
        .distinct()
}

private fun OrganizationTemplateDocument.toRequiredTemplateLabel(): String {
    val normalizedTitle = title.trim().ifBlank { "Untitled Template" }
    val normalizedType = if (type.trim().equals("TEXT", ignoreCase = true)) "TEXT" else "PDF"
    val signerLabel = templateSignerTypeLabel(requiredSignerType)
    return "$normalizedTitle ($normalizedType, $signerLabel)"
}

private fun templateSignerTypeLabel(rawType: String?): String {
    return when (
        rawType?.trim()?.uppercase()?.replace('-', '_')?.replace(' ', '_')?.replace('/', '_')
    ) {
        "PARENT_GUARDIAN" -> "Parent/Guardian"
        "CHILD" -> "Child"
        "PARENT_GUARDIAN_CHILD", "PARENT_GUARDIAN_AND_CHILD" -> "Parent/Guardian + Child"
        else -> "Participant"
    }
}

private fun userDisplayName(user: UserData): String {
    val fullName = user.fullName.trim()
    return when {
        fullName.isNotBlank() -> fullName
        user.userName.trim().isNotBlank() -> user.userName.trim()
        else -> user.id
    }
}

private fun validatePaymentPlans(
    event: Event,
    divisionDetails: List<DivisionDetail> = emptyList(),
): List<String> {
    fun validatePlan(
        label: String,
        priceCents: Int,
        allowPaymentPlans: Boolean,
        installmentCount: Int?,
        installmentAmounts: List<Int>,
        installmentDueDates: List<String>,
    ): List<String> {
        if (!allowPaymentPlans) return emptyList()

        val errors = mutableListOf<String>()
        val normalizedAmounts = installmentAmounts.map { amount -> amount.coerceAtLeast(0) }
        val normalizedDueDates = installmentDueDates
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val normalizedCount = maxOf(
            installmentCount ?: 0,
            normalizedAmounts.size,
            normalizedDueDates.size,
        )

        if (priceCents <= 0) {
            errors += "$label: set a price greater than 0 before enabling payment plans."
        }
        if (normalizedCount <= 0) {
            errors += "$label: installment count must be at least 1 when payment plans are enabled."
        }
        if (normalizedAmounts.size != normalizedCount) {
            errors += "$label: installment count must match installment amounts."
        }
        if (normalizedDueDates.size != normalizedCount) {
            errors += "$label: installment count must match installment due dates."
        }

        val parsedDueDates = normalizedDueDates.mapIndexed { index, dueDate ->
            runCatching { LocalDate.parse(dueDate) }
                .getOrElse {
                    errors += "$label: installment ${index + 1} due date must use YYYY-MM-DD."
                    null
                }
        }
        if (parsedDueDates.filterNotNull().zipWithNext().any { (previous, next) -> next < previous }) {
            errors += "$label: installment due dates must be in chronological order."
        }

        if (normalizedAmounts.sum() != priceCents) {
            errors += "$label: installment total must equal the configured price."
        }

        return errors
    }

    if (event.singleDivision) {
        return validatePlan(
            label = "Payment plan",
            priceCents = event.priceCents.coerceAtLeast(0),
            allowPaymentPlans = event.allowPaymentPlans == true,
            installmentCount = event.installmentCount,
            installmentAmounts = event.installmentAmounts,
            installmentDueDates = event.installmentDueDates,
        ).distinct()
    }

    val errors = mutableListOf<String>()
    errors += validatePlan(
        label = "Default payment plan",
        priceCents = event.priceCents.coerceAtLeast(0),
        allowPaymentPlans = event.allowPaymentPlans == true,
        installmentCount = event.installmentCount,
        installmentAmounts = event.installmentAmounts,
        installmentDueDates = event.installmentDueDates,
    )

    divisionDetails.forEach { detail ->
        val detailName = detail.name.trim().ifBlank { detail.id }
        errors += validatePlan(
            label = "Division \"$detailName\" payment plan",
            priceCents = (detail.price ?: event.priceCents).coerceAtLeast(0),
            allowPaymentPlans = detail.allowPaymentPlans == true,
            installmentCount = detail.installmentCount,
            installmentAmounts = detail.installmentAmounts,
            installmentDueDates = detail.installmentDueDates,
        )
    }

    return errors.distinct()
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

private fun computeLeagueSlotErrors(
    slots: List<TimeSlot>,
    singleDivision: Boolean,
    selectedDivisionIds: List<String>,
): Map<Int, String> {
    if (slots.isEmpty()) return emptyMap()

    val errors = mutableMapOf<Int, String>()
    val normalizedSelectedDivisions = selectedDivisionIds.normalizeDivisionIdentifiers()
    val selectedDivisionSet = normalizedSelectedDivisions.toSet()
    slots.forEachIndexed { index, slot ->
        val fieldIds = slot.normalizedScheduledFieldIds()
        val fieldIdSet = fieldIds.toSet()
        val days = slot.normalizedDaysOfWeek()
        val daySet = days.toSet()
        val slotDivisionIds = slot.normalizedDivisionIds().normalizeDivisionIdentifiers()
        val slotDivisionSet = slotDivisionIds.toSet()
        val start = slot.startTimeMinutes
        val end = slot.endTimeMinutes

        val requiredMissing = when {
            fieldIds.isEmpty() -> "Select at least one field."
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

        if (singleDivision && selectedDivisionSet.isNotEmpty() && slotDivisionSet != selectedDivisionSet) {
            errors[index] = "Single division requires every timeslot to include all selected divisions."
            return@forEachIndexed
        }

        val hasOverlap = slots.withIndex().any { (otherIndex, other) ->
            if (otherIndex == index) return@any false
            val otherFieldSet = other.normalizedScheduledFieldIds().toSet()
            if (otherFieldSet.isEmpty() || otherFieldSet.intersect(fieldIdSet).isEmpty()) return@any false
            val otherDays = other.normalizedDaysOfWeek()
            if (otherDays.isEmpty() || otherDays.none(daySet::contains)) return@any false

            val otherStart = other.startTimeMinutes
            val otherEnd = other.endTimeMinutes
            if (otherStart == null || otherEnd == null || otherEnd <= otherStart) return@any false
            slotsOverlap(start!!, end!!, otherStart, otherEnd)
        }

        if (hasOverlap) {
            errors[index] = "Overlaps with another timeslot for one or more selected fields."
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
