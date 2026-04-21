package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.network.userMessage
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.mapSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.snapshots.SnapshotStateMap
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.zIndex
import coil3.compose.AsyncImage
import com.kmpalette.loader.rememberNetworkLoader
import com.kmpalette.rememberDominantColorState
import com.materialkolor.scheme.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.divisionPriceRangeLabel
import com.razumly.mvp.core.data.dataTypes.label
import com.razumly.mvp.core.data.dataTypes.officialPositionSummary
import com.razumly.mvp.core.data.dataTypes.positionSummary
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
import com.razumly.mvp.core.presentation.composables.OrganizationVerificationBadge
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.util.extractDivisionTokenFromId
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.data.util.toDivisionDisplayLabels
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.MoneyInputField
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.composables.PlayerCardWithActions
import com.razumly.mvp.core.presentation.composables.StripeButton
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.getScreenHeight
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.toEnumTitleCase
import com.razumly.mvp.core.presentation.util.toNameCase
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
import com.razumly.mvp.eventDetail.division.DivisionDetailEditList
import com.razumly.mvp.eventDetail.edit.RequiredDocumentsSection
import com.razumly.mvp.eventDetail.readonly.HostedByReadOnlyRow
import com.razumly.mvp.eventDetail.readonly.ReadOnlyDivisionsList
import com.razumly.mvp.eventDetail.readonly.ReadOnlyNameList
import com.razumly.mvp.eventDetail.readonly.ScheduleTimeslotsReadOnlyList
import com.razumly.mvp.eventDetail.readonly.buildEventDetailsRows
import com.razumly.mvp.eventDetail.readonly.buildScheduleDetailsRows
import com.razumly.mvp.eventDetail.readonly.resolveReadOnlyFieldCount
import com.razumly.mvp.eventDetail.shared.BackgroundImage
import com.razumly.mvp.eventDetail.shared.CollapsibleEditorSubsectionHeader
import com.razumly.mvp.eventDetail.shared.DetailGridItem
import com.razumly.mvp.eventDetail.shared.DetailKeyValueList
import com.razumly.mvp.eventDetail.shared.DetailRowSpec
import com.razumly.mvp.eventDetail.shared.DetailStatsGrid
import com.razumly.mvp.eventDetail.shared.FormSectionDivider
import com.razumly.mvp.eventDetail.shared.LabeledCheckboxRow
import com.razumly.mvp.eventDetail.shared.SummaryTagChip
import com.razumly.mvp.eventDetail.shared.animatedCardSection
import com.razumly.mvp.eventDetail.shared.localImageScheme
import com.razumly.mvp.eventDetail.staff.EditableStaffCardList
import com.razumly.mvp.eventDetail.staff.StaffAssignmentCard
import com.razumly.mvp.eventDetail.staff.StaffAssignmentCardModel
import com.razumly.mvp.eventDetail.staff.buildAssignedStaffCards
import com.razumly.mvp.eventDetail.staff.buildDraftStaffCards
import com.razumly.mvp.eventDetail.staff.userDisplayName
import com.razumly.mvp.eventMap.MapComponent
import dev.chrisbanes.haze.ExperimentalHazeApi
import io.github.aakira.napier.Napier
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.ismoy.imagepickerkmp.domain.models.MimeType
import io.github.ismoy.imagepickerkmp.presentation.ui.components.GalleryPickerLauncher
import io.ktor.http.Url
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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

private val SectionExpansionStatesSaver = mapSaver(
    save = { stateMap: SnapshotStateMap<String, Boolean> ->
        stateMap.toMap()
    },
    restore = { restored ->
        mutableStateMapOf<String, Boolean>().apply {
            restored.forEach { (key, value) ->
                this[key] = value as Boolean
            }
        }
    },
)
private const val MOBILE_EVENT_DETAILS_BREAKPOINT_DP = 600
private const val MAX_READ_ONLY_NAME_LIST_ITEMS = 5
private const val STAFF_LAZY_LIST_THRESHOLD = 4
private const val STAFF_LAZY_LIST_VISIBLE_COUNT = 4
private val readOnlyNameListItemHeight = 28.dp
private val readOnlyNameListSpacing = 4.dp
private val editableOfficialStaffListHeight = 160.dp * STAFF_LAZY_LIST_VISIBLE_COUNT
private val editableHostStaffListHeight = 130.dp * STAFF_LAZY_LIST_VISIBLE_COUNT

@OptIn(ExperimentalHazeApi::class, ExperimentalTime::class)
@Suppress("UNUSED_PARAMETER")
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
    showOfficialsPanel: Boolean = true,
    navPadding: PaddingValues = PaddingValues(),
    topInset: Dp = 0.dp,
    isNewEvent: Boolean,
    rentalTimeLocked: Boolean = false,
    onHostCreateAccount: () -> Unit,
    onOpenLocationMap: () -> Unit,
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
    pendingStaffInvites: List<PendingStaffInviteDraft> = emptyList(),
    onSportSelected: (String) -> Unit = {},
    onSelectFieldCount: (Int) -> Unit,
    onUpdateLocalFieldName: (Int, String) -> Unit = { _, _ -> },
    onUpdateLocalFieldDivisions: (Int, List<String>) -> Unit = { _, _ -> },
    useManualTimeSlots: Boolean = true,
    onUseManualTimeSlotsChange: (Boolean) -> Unit = {},
    onAddLeagueTimeSlot: () -> Unit = {},
    onUpdateLeagueTimeSlot: (Int, TimeSlot) -> Unit = { _, _ -> },
    onRemoveLeagueTimeSlot: (Int) -> Unit = {},
    onLeagueScoringConfigChange: (LeagueScoringConfigDTO) -> Unit = {},
    userSuggestions: List<UserData> = emptyList(),
    onSearchUsers: (String) -> Unit = {},
    onEnsureUserByEmail: suspend (String) -> Result<UserData> = {
        Result.failure(IllegalStateException("Invite by email is not supported."))
    },
    onAddPendingStaffInvite: suspend (
        firstName: String,
        lastName: String,
        email: String,
        roles: Set<EventStaffRole>,
    ) -> Result<Unit> = { _, _, _, _ ->
        Result.failure(IllegalStateException("Staff invites are not supported."))
    },
    onRemovePendingStaffInvite: (String, EventStaffRole?) -> Unit = { _, _ -> },
    onUpdateHostId: (String) -> Unit = {},
    onUpdateAssistantHostIds: (List<String>) -> Unit = {},
    onUpdateDoTeamsOfficiate: (Boolean) -> Unit = {},
    onUpdateTeamOfficialsMaySwap: (Boolean) -> Unit = {},
    onAddOfficialId: (String) -> Unit = {},
    onRemoveOfficialId: (String) -> Unit = {},
    onUpdateOfficialSchedulingMode: (OfficialSchedulingMode) -> Unit = {},
    onLoadOfficialPositionDefaults: () -> Unit = {},
    onAddOfficialPosition: () -> Unit = {},
    onUpdateOfficialPositionName: (String, String) -> Unit = { _, _ -> },
    onUpdateOfficialPositionCount: (String, Int) -> Unit = { _, _ -> },
    onRemoveOfficialPosition: (String) -> Unit = {},
    onUpdateOfficialUserPositions: (String, List<String>) -> Unit = { _, _ -> },
    onSetPaymentPlansEnabled: (Boolean) -> Unit = {},
    onSetInstallmentCount: (Int) -> Unit = {},
    onUpdateInstallmentAmount: (Int, Int) -> Unit = { _, _ -> },
    onUpdateInstallmentDueDate: (Int, String) -> Unit = { _, _ -> },
    onAddInstallmentRow: () -> Unit = {},
    onRemoveInstallmentRow: (Int) -> Unit = {},
    onUploadSelected: (GalleryPhotoResult) -> Unit,
    onDeleteImage: (String) -> Unit,
    currentUserForHostActions: UserData? = null,
    onHostMessageUser: (UserData) -> Unit = {},
    onHostSendFriendRequest: (UserData) -> Unit = {},
    onHostFollowUser: (UserData) -> Unit = {},
    onHostUnfollowUser: (UserData) -> Unit = {},
    onHostBlockUser: (UserData, Boolean) -> Unit = { _, _ -> },
    onHostUnblockUser: (UserData) -> Unit = {},
    onHostFollowOrganization: (Organization) -> Unit = {},
    onMapRevealCenterChange: (Offset) -> Unit = {},
    onFloatingDockVisibilityChange: (Boolean) -> Unit = {},
    onValidationChange: (Boolean, List<String>) -> Unit = { _, _ -> },
    joinButton: @Composable (isValid: Boolean) -> Unit
) {
    val event = eventWithRelations.event
    val host = eventWithRelations.host
    val isMobileEventDetailsLayout = getScreenWidth() < MOBILE_EVENT_DETAILS_BREAKPOINT_DP
    var isValid by remember { mutableStateOf(false) }
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
    var installmentDueDatePickerIndex by remember { mutableStateOf<Int?>(null) }
    var divisionInstallmentDueDatePickerIndex by remember { mutableStateOf<Int?>(null) }
    var showImageSelector by rememberSaveable { mutableStateOf(false) }
    var showUploadImagePicker by rememberSaveable { mutableStateOf(false) }
    var editLocationButtonCenter by remember { mutableStateOf(Offset.Zero) }
    // Validation states
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
    var validationErrors by remember { mutableStateOf<List<String>>(emptyList()) }

    val coroutineScope = rememberCoroutineScope()
    val selectedUsersById = remember { mutableStateMapOf<String, UserData>() }
    var staffSearchQuery by rememberSaveable { mutableStateOf("") }
    var staffInviteFirstName by rememberSaveable { mutableStateOf("") }
    var staffInviteLastName by rememberSaveable { mutableStateOf("") }
    var staffInviteEmail by rememberSaveable { mutableStateOf("") }
    var draftInviteOfficial by rememberSaveable { mutableStateOf(false) }
    var draftInviteAssistantHost by rememberSaveable { mutableStateOf(false) }
    var staffEditorError by remember { mutableStateOf<String?>(null) }
    var officialPositionsExpanded by rememberSaveable(editEvent.id, editView) { mutableStateOf(false) }
    var assignedStaffExpanded by rememberSaveable(editEvent.id, editView) { mutableStateOf(false) }
    val sectionExpansionStates = rememberSaveable(
        editEvent.id,
        saver = SectionExpansionStatesSaver,
    ) {
        mutableStateMapOf<String, Boolean>()
    }

    val lazyListState = rememberLazyListState()

    var fieldCount by remember {
        mutableStateOf(resolveReadOnlyFieldCount(event = editEvent, editableFields = editableFields))
    }
    var eventNameInput by rememberSaveable(editEvent.id, editView) { mutableStateOf(editEvent.name) }
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
                    editEvent.singleDivision -> editEvent.playoffTeamCount ?: detail.playoffTeamCount
                    else -> detail.playoffTeamCount
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
                defaultPlayoffTeamCount = editEvent.playoffTeamCount,
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
            defaultPlayoffTeamCount = editEvent.playoffTeamCount,
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
        val divisionPlayoffTeamCount = divisionEditor.playoffTeamCount
        if (
            editEvent.eventType == EventType.LEAGUE &&
            editEvent.includePlayoffs &&
            !editEvent.singleDivision &&
            (divisionPlayoffTeamCount == null || divisionPlayoffTeamCount < 2)
        ) {
            divisionEditor = divisionEditor.copy(
                error = "Playoff team count is required for each division when playoffs are enabled.",
            )
            return
        }
        val normalizedPlayoffTeamCount = when {
            editEvent.eventType != EventType.LEAGUE || !editEvent.includePlayoffs -> null
            editEvent.singleDivision -> editEvent.playoffTeamCount ?: divisionPlayoffTeamCount
            else -> divisionPlayoffTeamCount
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
                    playoffTeamCount ?: mergedDivisionDetails.firstOrNull()?.playoffTeamCount
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
            playoffTeamCount = if (editEvent.singleDivision) {
                editEvent.playoffTeamCount ?: detail.playoffTeamCount
            } else {
                detail.playoffTeamCount
            },
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
                    playoffTeamCount ?: mergedDivisionDetails.firstOrNull()?.playoffTeamCount
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
    val selectedRequiredTemplateLabels = remember(
        selectedRequiredTemplateIds,
        requiredTemplateOptionLookup,
    ) {
        selectedRequiredTemplateIds.map { templateId ->
            requiredTemplateOptionLookup[templateId]?.label ?: templateId
        }
    }
    val scheduleTimeLocked = remember(
        rentalTimeLocked,
        editEvent.organizationId,
        leagueTimeSlots,
        editableFields,
    ) {
        isScheduleEditingLocked(
            event = editEvent,
            timeSlots = leagueTimeSlots,
            fields = editableFields,
            rentalTimeLocked = rentalTimeLocked,
        )
    }
    val supportsOptionalManualTimeSlots = remember(
        isNewEvent,
        scheduleTimeLocked,
        editEvent.eventType,
        editEvent.noFixedEndDateTime,
        editEvent.end,
        editEvent.start,
    ) {
        isNewEvent &&
            !scheduleTimeLocked &&
            !editEvent.noFixedEndDateTime &&
            editEvent.end > editEvent.start &&
            (
                editEvent.eventType == EventType.LEAGUE ||
                    editEvent.eventType == EventType.TOURNAMENT
                )
    }
    val slotEditorEnabled = remember(
        editEvent.eventType,
        scheduleTimeLocked,
        supportsOptionalManualTimeSlots,
        useManualTimeSlots,
    ) {
        when {
            editEvent.eventType == EventType.WEEKLY_EVENT -> true
            editEvent.eventType == EventType.LEAGUE || editEvent.eventType == EventType.TOURNAMENT -> {
                !supportsOptionalManualTimeSlots || useManualTimeSlots
            }

            scheduleTimeLocked && editEvent.eventType == EventType.EVENT -> true
            else -> false
        }
    }
    val leagueSlotErrors = remember(
        leagueTimeSlots,
        editEvent.eventType,
        editEvent.singleDivision,
        editEvent.divisions,
        isNewEvent,
    ) {
        if (
            isNewEvent &&
            (
                editEvent.eventType == EventType.LEAGUE ||
                    editEvent.eventType == EventType.TOURNAMENT ||
                    editEvent.eventType == EventType.WEEKLY_EVENT
                )
        ) {
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

    LaunchedEffect(editView, editEvent.id) {
        eventNameInput = editEvent.name
    }

    LaunchedEffect(eventNameInput, editView, editEvent.id) {
        if (!editView) return@LaunchedEffect
        if (eventNameInput == editEvent.name) return@LaunchedEffect
        // Keep typing local and sync to shared draft in short bursts.
        delay(120)
        if (eventNameInput != editEvent.name) {
            onEditEvent {
                if (name == eventNameInput) this else copy(name = eventNameInput)
            }
        }
    }

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

    LaunchedEffect(editEvent.fieldIds, editableFields.size) {
        val normalized = resolveReadOnlyFieldCount(event = editEvent, editableFields = editableFields)
        if (normalized != fieldCount) {
            fieldCount = normalized
        }
    }

    LaunchedEffect(
        editEvent,
        fieldCount,
        leagueSlotErrors,
        divisionDetailsForSettings,
        leagueTimeSlots,
        isColorLoaded,
        isNewEvent,
        scheduleTimeLocked,
    ) {
        // Coalesce rapid keystrokes so validation work does not contend with typing.
        delay(80)
        val result = withContext(Dispatchers.Default) {
            computeEventValidationResult(
                editEvent = editEvent,
                isNewEvent = isNewEvent,
                fieldCount = fieldCount,
                leagueTimeSlots = leagueTimeSlots,
                leagueSlotErrors = leagueSlotErrors,
                slotEditorEnabled = slotEditorEnabled,
                divisionDetailsForSettings = divisionDetailsForSettings,
                isColorLoaded = isColorLoaded,
                scheduleTimeLocked = scheduleTimeLocked,
            )
        }

        isPriceValid = result.isPriceValid
        isMaxParticipantsValid = result.isMaxParticipantsValid
        isTeamSizeValid = result.isTeamSizeValid
        isWinnerSetCountValid = result.isWinnerSetCountValid
        isLoserSetCountValid = result.isLoserSetCountValid
        isWinnerPointsValid = result.isWinnerPointsValid
        isLoserPointsValid = result.isLoserPointsValid
        isLocationValid = result.isLocationValid
        isFieldCountValid = result.isFieldCountValid
        isLeagueGamesValid = result.isLeagueGamesValid
        isLeagueDurationValid = result.isLeagueDurationValid
        isLeaguePointsValid = result.isLeaguePointsValid
        isLeaguePlayoffTeamsValid = result.isLeaguePlayoffTeamsValid
        isLeagueSlotsValid = result.isLeagueSlotsValid
        isSkillLevelValid = result.isSkillLevelValid
        isSportValid = result.isSportValid
        isFixedEndDateRangeValid = result.isFixedEndDateRangeValid
        isPaymentPlansValid = result.isPaymentPlansValid
        paymentPlanValidationErrors = result.paymentPlanValidationErrors
        validationErrors = result.validationErrors
        isValid = result.isValid
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

    val eventTimeZone = remember { TimeZone.currentSystemDefault() }
    val startDateTime = remember(event.start, eventTimeZone) {
        event.start.toLocalDateTime(eventTimeZone)
    }
    val endDateTime = remember(event.end, eventTimeZone) {
        event.end.toLocalDateTime(eventTimeZone)
    }
    val eventMetaLine = remember(event.location, startDateTime) {
        val dateText = startDateTime.date.format(dateFormat)
        val timeText = startDateTime.time.format(timeFormat)
        listOf(event.location, "$dateText - $timeText").filter { it.isNotBlank() }.joinToString(" - ")
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
    val selectedSportForOfficialDefaults = remember(sports, editEvent.sportId) {
        val normalizedSportId = editEvent.sportId
            ?.trim()
            ?.takeIf(String::isNotBlank)
        normalizedSportId?.let { sportId ->
            sports.firstOrNull { sport -> sport.id == sportId }
        }
    }
    val baseMatchRules = remember(editEvent.eventType, editEvent.usesSets, editEvent.setsPerMatch, editEvent.winnerSetCount, editEvent.officialPositions, selectedSportForOfficialDefaults) {
        resolveEventMatchRules(
            event = editEvent.copy(matchRulesOverride = null),
            sport = selectedSportForOfficialDefaults,
        )
    }
    val resolvedMatchRules = remember(editEvent, selectedSportForOfficialDefaults) {
        resolveEventMatchRules(
            event = editEvent,
            sport = selectedSportForOfficialDefaults,
        )
    }
    val autoPointIncidentType = remember(resolvedMatchRules.autoCreatePointIncidentType) {
        (resolvedMatchRules.autoCreatePointIncidentType ?: "POINT")
            .trim()
            .ifBlank { "POINT" }
    }
    val availableMatchIncidentTypes = remember(baseMatchRules.supportedIncidentTypes, resolvedMatchRules.supportedIncidentTypes, autoPointIncidentType) {
        (
            listOf("POINT", "DISCIPLINE", "NOTE", "ADMIN") +
                baseMatchRules.supportedIncidentTypes +
                resolvedMatchRules.supportedIncidentTypes +
                autoPointIncidentType
            )
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
    }
    val selectedMatchIncidentTypes = remember(resolvedMatchRules.supportedIncidentTypes) {
        resolvedMatchRules.supportedIncidentTypes
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
    }
    val matchRulesSummary = remember(resolvedMatchRules.scoringModel, resolvedMatchRules.segmentCount) {
        "${matchScoringModelLabel(resolvedMatchRules.scoringModel)} · ${resolvedMatchRules.segmentCount}"
    }
    val matchIncidentOptions = remember(availableMatchIncidentTypes) {
        availableMatchIncidentTypes.map { incidentType ->
            DropdownOption(
                value = incidentType,
                label = matchIncidentTypeLabel(incidentType),
            )
        }
    }
    var lastAutoLoadedOfficialDefaultsSportId by rememberSaveable(editEvent.id, editView) {
        mutableStateOf<String?>(null)
    }
    val summaryTags = remember(event.eventType, eventSportName, event.teamSizeLimit, event.singleDivision) {
        buildList {
            add(eventSportName)
            add(event.eventType.name.toEnumTitleCase())
            add("Teams of ${event.teamSizeLimit}")
            add(if (event.singleDivision) "Single division" else "Multi division")
        }
    }
    LaunchedEffect(editView, selectedSportForOfficialDefaults?.id) {
        if (!editView) return@LaunchedEffect
        val selectedSportId = selectedSportForOfficialDefaults?.id
        if (selectedSportId == null) {
            lastAutoLoadedOfficialDefaultsSportId = null
            return@LaunchedEffect
        }
        if (lastAutoLoadedOfficialDefaultsSportId == selectedSportId) return@LaunchedEffect
        if (editEvent.officialPositions.isEmpty()) {
            onLoadOfficialPositionDefaults()
        }
        lastAutoLoadedOfficialDefaultsSportId = selectedSportId
    }
    val hostDisplayName = remember(host, eventWithRelations.organization, isOrganizationEvent) {
        val organizationName = eventWithRelations.organization?.name.orEmpty()
        val hostName = buildString {
            val firstName = host?.firstName?.toNameCase().orEmpty()
            val lastName = host?.lastName?.toNameCase().orEmpty()
            if (firstName.isNotBlank()) {
                append(firstName)
            }
            if (lastName.isNotBlank()) {
                if (isNotEmpty()) append(" ")
                append(lastName)
            }
        }.trim()
        when {
            isOrganizationEvent && organizationName.isNotBlank() -> organizationName
            hostName.isNotBlank() -> hostName
            organizationName.isNotBlank() -> organizationName
            else -> "Hosted by organizer"
        }
    }
    val startDateLabel = remember(startDateTime) {
        startDateTime.date.format(dateFormat)
    }
    val endDateLabel = remember(endDateTime) {
        endDateTime.date.format(dateFormat)
    }
    val sameDayDateRange = remember(startDateTime, endDateTime) {
        startDateTime.date == endDateTime.date
    }
    val readOnlyDateRows = remember(startDateTime, endDateTime, startDateLabel, endDateLabel, sameDayDateRange) {
        if (sameDayDateRange) {
            listOf(
                DetailRowSpec(
                    label = "Start Date & Time",
                    value = startDateTime.format(dateTimeFormat),
                ),
                DetailRowSpec(
                    label = "End Time",
                    value = endDateTime.time.format(timeFormat),
                ),
            )
        } else {
            listOf(
                DetailRowSpec(label = "Start Date", value = startDateLabel),
                DetailRowSpec(label = "End Date", value = endDateLabel),
            )
        }
    }
    val basicDateSummary = remember(startDateLabel, endDateLabel, startDateTime, endDateTime, sameDayDateRange) {
        if (sameDayDateRange) {
            "$startDateLabel, ${startDateTime.time.format(timeFormat)}-${endDateTime.time.format(timeFormat)}"
        } else {
            "$startDateLabel - $endDateLabel"
        }
    }
    val readOnlyBasicsRows = remember(event.location, event.eventType, eventSportName, readOnlyDateRows) {
        buildList {
            addAll(readOnlyDateRows)
            add(DetailRowSpec(label = "Location", value = event.location))
            add(DetailRowSpec(label = "Type", value = event.eventType.name.toEnumTitleCase()))
            add(DetailRowSpec(label = "Sport", value = eventSportName))
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
    val persistedStaffInvites = remember(eventWithRelations.staffInvites) {
        eventWithRelations.staffInvites.filter { invite ->
            invite.type.equals("STAFF", ignoreCase = true) &&
                invite.eventId?.trim() == event.id
        }
    }
    val assistantHostIds = remember(editEvent.hostId, editEvent.assistantHostIds) {
        editEvent.assistantHostIds
            .map { userId -> userId.trim() }
            .filter(String::isNotBlank)
            .filterNot { userId -> userId == editEvent.hostId.trim() }
            .distinct()
    }
    val resolvedHostDisplay = remember(editEvent.hostId, knownUsersById, hostDisplayName) {
        knownUsersById[editEvent.hostId]?.let(::userDisplayName)
            ?: hostDisplayName.takeIf(String::isNotBlank)
            ?: "No host selected"
    }
    val visibleUserSuggestions = remember(staffSearchQuery, userSuggestions) {
        val normalizedQuery = staffSearchQuery.trim()
        if (normalizedQuery.isBlank()) {
            emptyList()
        } else {
            userSuggestions
        }
    }
    val sortedPendingStaffInvites = remember(pendingStaffInvites) {
        pendingStaffInvites
            .map(PendingStaffInviteDraft::normalized)
            .sortedBy { draft -> draft.displayName().lowercase() }
    }
    val eventOfficialRecordsByUserId = remember(editEvent.eventOfficials) {
        editEvent.eventOfficials.associateBy { official -> official.userId.trim() }
    }
    val officialPositionOptions = remember(editEvent.officialPositions) {
        editEvent.officialPositions
            .sortedBy(EventOfficialPosition::order)
            .map { position ->
                DropdownOption(
                    value = position.id,
                    label = "${position.name} x${position.count.coerceAtLeast(1)}",
                )
            }
    }
    val officialSchedulingModeOptions = remember {
        OfficialSchedulingMode.entries.map { mode ->
            DropdownOption(
                value = mode.name,
                label = mode.label(),
            )
        }
    }
    val officialPositionSummary = remember(editEvent.officialPositions) {
        editEvent.officialPositionSummary().ifBlank { "None" }
    }
    val officialStaffCards = remember(
        editEvent.officialIds,
        editEvent.eventOfficials,
        editEvent.officialPositions,
        knownUsersById,
        persistedStaffInvites,
        sortedPendingStaffInvites,
    ) {
        buildAssignedStaffCards(
            role = EventStaffRole.OFFICIAL,
            userIds = editEvent.officialIds,
            knownUsersById = knownUsersById,
            staffInvites = persistedStaffInvites,
        ).map { card ->
            val eventOfficial = card.userId?.let(eventOfficialRecordsByUserId::get)
            card.copy(
                subtitle = eventOfficial?.positionSummary(editEvent.officialPositions) ?: "No positions selected",
            )
        } + buildDraftStaffCards(
            role = EventStaffRole.OFFICIAL,
            drafts = sortedPendingStaffInvites,
        )
    }
    val hostStaffCards = remember(editEvent.hostId, assistantHostIds, knownUsersById, persistedStaffInvites, sortedPendingStaffInvites) {
        buildList {
            if (editEvent.hostId.isNotBlank()) {
                add(
                    StaffAssignmentCardModel(
                        key = "host:${editEvent.hostId}",
                        title = resolvedHostDisplay,
                        subtitle = "Primary Host",
                        role = EventStaffRole.ASSISTANT_HOST,
                    ),
                )
            }
            addAll(
                buildAssignedStaffCards(
                    role = EventStaffRole.ASSISTANT_HOST,
                    userIds = assistantHostIds,
                    knownUsersById = knownUsersById,
                    staffInvites = persistedStaffInvites,
                ).map { card ->
                    card.copy(subtitle = card.subtitle ?: "Assistant Host")
                },
            )
            addAll(
                buildDraftStaffCards(
                    role = EventStaffRole.ASSISTANT_HOST,
                    drafts = sortedPendingStaffInvites,
                ),
            )
        }
    }
    val freeAgentCount = remember(event.freeAgentIds) { event.freeAgentIds.size }
    val teamsCount = remember(event.eventType, event.teamSignup, eventWithRelations.teams) {
        event.visibleTeams(eventWithRelations.teams).size
    }
    val registrationSummary = remember(editEvent.registrationCutoffHours) {
        editEvent.registrationCutoffHours.toRegistrationCutoffSummary()
    }
    val refundSummary = remember(event.cancellationRefundHours) {
        formatRefundSummary(event.cancellationRefundHours)
    }
    val priceSummary = remember(event.teamSignup, event.priceCents, event.divisions, event.divisionDetails) {
        if (event.teamSignup) "${event.divisionPriceRangeLabel()} / team" else "${event.divisionPriceRangeLabel()} / player"
    }
    val basicsSummaryLine = remember(event.location, basicDateSummary, hostDisplayName) {
        listOf(hostDisplayName, event.location, basicDateSummary)
            .filter { it.isNotBlank() }
            .joinToString(" - ")
    }
    val pricingSummaryLine = remember(priceSummary, registrationSummary, refundSummary) {
        listOf(priceSummary, registrationSummary, refundSummary)
            .filter { it.isNotBlank() }
            .joinToString(" - ")
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
        listOfNotNull(
            if (event.singleDivision) "Single division" else "Multi division",
            maxLabel,
            "Team size ${event.teamSizeLimit}",
            leagueSummary,
        ).joinToString(" - ")
    }
    val readOnlyFieldCount = remember(event.fieldIds, editableFields.size) {
        resolveReadOnlyFieldCount(event = event, editableFields = editableFields)
    }
    val facilitiesFieldCount = if (editView) fieldCount else readOnlyFieldCount
    val supportsScheduleConfig = remember(editEvent.eventType, scheduleTimeLocked) {
        editEvent.eventType == EventType.LEAGUE ||
            editEvent.eventType == EventType.TOURNAMENT ||
            editEvent.eventType == EventType.WEEKLY_EVENT ||
            (scheduleTimeLocked && editEvent.eventType == EventType.EVENT)
    }
    val facilitiesSummaryLine = remember(
        facilitiesFieldCount,
        eventWithRelations.timeSlots,
        editEvent.eventType,
        scheduleTimeLocked,
    ) {
        val fieldSummary = "${facilitiesFieldCount.coerceAtLeast(0)} fields"
        val slotSummary = if (
            editEvent.eventType == EventType.LEAGUE ||
                editEvent.eventType == EventType.TOURNAMENT ||
                editEvent.eventType == EventType.WEEKLY_EVENT ||
                (scheduleTimeLocked && editEvent.eventType == EventType.EVENT)
        ) {
            "${eventWithRelations.timeSlots.size} slots"
        } else {
            null
        }
        listOfNotNull(fieldSummary, slotSummary).joinToString(" - ")
    }
    val showSectionMissingBadges = isNewEvent && editView
    val basicsMissingRequiredCount = if (showSectionMissingBadges) {
        listOf(
            !isSportValid,
            !isFixedEndDateRangeValid,
        ).count { it }
    } else {
        0
    }
    val eventDetailsMissingRequiredCount = if (showSectionMissingBadges) {
        listOf(
            !isMaxParticipantsValid,
            !isTeamSizeValid,
            !isPriceValid,
            !isPaymentPlansValid,
            editEvent.eventType == EventType.LEAGUE && editEvent.singleDivision && !isLeaguePlayoffTeamsValid,
        ).count { it }
    } else {
        0
    }
    val divisionSettingsMissingRequiredCount = if (showSectionMissingBadges) {
        listOf(
            !isSkillLevelValid,
        ).count { it }
    } else {
        0
    }
    val scheduleMissingRequiredCount = if (showSectionMissingBadges) {
        listOf(
            !isFieldCountValid,
            !isLeagueSlotsValid,
            !isLeagueGamesValid,
            !isLeagueDurationValid,
            !isLeaguePointsValid,
            editEvent.eventType == EventType.TOURNAMENT && !isWinnerSetCountValid,
            editEvent.eventType == EventType.TOURNAMENT && !isWinnerPointsValid,
            editEvent.eventType == EventType.TOURNAMENT && editEvent.doubleElimination && !isLoserSetCountValid,
            editEvent.eventType == EventType.TOURNAMENT && editEvent.doubleElimination && !isLoserPointsValid,
            editEvent.eventType == EventType.LEAGUE && !editEvent.singleDivision && !isLeaguePlayoffTeamsValid,
        ).count { it }
    } else {
        0
    }
    val eventDetailsMode = remember(editView) {
        if (editView) EventDetailsMode.EDIT else EventDetailsMode.READ_ONLY
    }
    val readOnlyActions = remember(
        onOpenLocationMap,
        onHostMessageUser,
        onHostSendFriendRequest,
        onHostFollowUser,
        onHostUnfollowUser,
        onHostBlockUser,
        onHostUnblockUser,
        onHostFollowOrganization,
    ) {
        EventDetailsReadOnlyActions(
            onOpenLocationMap = onOpenLocationMap,
            onMessageUser = onHostMessageUser,
            onSendFriendRequest = onHostSendFriendRequest,
            onFollowUser = onHostFollowUser,
            onUnfollowUser = onHostUnfollowUser,
            onBlockUser = onHostBlockUser,
            onUnblockUser = onHostUnblockUser,
            onFollowOrganization = onHostFollowOrganization,
        )
    }
    val editActions = remember(
        onPlaceSelected,
        onEditEvent,
        onEditTournament,
        onAddCurrentUser,
        onEventTypeSelected,
        onSportSelected,
    ) {
        EventDetailsEditActions(
            onPlaceSelected = onPlaceSelected,
            onEditEvent = onEditEvent,
            onEditTournament = onEditTournament,
            onAddCurrentUser = onAddCurrentUser,
            onEventTypeSelected = onEventTypeSelected,
            onSportSelected = onSportSelected,
        )
    }
    val readOnlyUiModel = remember(
        event.id,
        basicsSummaryLine,
        pricingSummaryLine,
        matchRulesSummary,
        assistantHostIds.size,
        event.officialIds.size,
        competitionSummaryLine,
        facilitiesSummaryLine,
        editView,
    ) {
        EventDetailsReadOnlyUiModel(
            eventId = event.id,
            basics = ReadOnlySectionModel(
                sectionId = "event_basics",
                title = "Basic Information",
                summary = basicsSummaryLine,
            ),
            registration = ReadOnlySectionModel(
                sectionId = "event_details",
                title = "Event Details",
                summary = pricingSummaryLine,
            ),
            matchRules = ReadOnlySectionModel(
                sectionId = "match_rules",
                title = "Match Rules",
                summary = matchRulesSummary,
            ),
            staff = ReadOnlySectionModel(
                sectionId = "officials",
                title = "Staff",
                summary = "${assistantHostIds.size + event.officialIds.size} assigned",
            ),
            divisions = ReadOnlySectionModel(
                sectionId = "specifics",
                title = "Division Settings",
                summary = competitionSummaryLine,
            ),
            leagueScoring = ReadOnlySectionModel(
                sectionId = "league_scoring",
                title = if (editView) "League Scoring Config" else "League Scoring Rules",
                summary = "Scoring rules",
            ),
            schedule = ReadOnlySectionModel(
                sectionId = "facility_schedule",
                title = if (editView) "Schedule Config" else "Schedule",
                summary = facilitiesSummaryLine,
            ),
        )
    }
    val editUiModel = remember(
        editEvent.id,
        isNewEvent,
        basicsSummaryLine,
        pricingSummaryLine,
        matchRulesSummary,
        assistantHostIds.size,
        event.officialIds.size,
        competitionSummaryLine,
        facilitiesSummaryLine,
        basicsMissingRequiredCount,
        eventDetailsMissingRequiredCount,
        divisionSettingsMissingRequiredCount,
        scheduleMissingRequiredCount,
        editView,
    ) {
        EventDetailsEditUiModel(
            eventId = editEvent.id,
            isNewEvent = isNewEvent,
            basics = EditSectionModel(
                sectionId = "event_basics",
                title = "Basic Information",
                summary = basicsSummaryLine,
                requiredMissingCount = basicsMissingRequiredCount,
            ),
            registration = EditSectionModel(
                sectionId = "event_details",
                title = "Event Details",
                summary = pricingSummaryLine,
                requiredMissingCount = eventDetailsMissingRequiredCount,
            ),
            matchRules = EditSectionModel(
                sectionId = "match_rules",
                title = "Match Rules",
                summary = matchRulesSummary,
            ),
            staff = EditSectionModel(
                sectionId = "officials",
                title = "Staff",
                summary = "${assistantHostIds.size + event.officialIds.size} assigned",
            ),
            divisions = EditSectionModel(
                sectionId = "specifics",
                title = "Division Settings",
                summary = competitionSummaryLine,
                requiredMissingCount = divisionSettingsMissingRequiredCount,
            ),
            leagueScoring = EditSectionModel(
                sectionId = "league_scoring",
                title = if (editView) "League Scoring Config" else "League Scoring Rules",
                summary = "Scoring rules",
            ),
            schedule = EditSectionModel(
                sectionId = "facility_schedule",
                title = if (editView) "Schedule Config" else "Schedule",
                summary = facilitiesSummaryLine,
                requiredMissingCount = scheduleMissingRequiredCount,
            ),
        )
    }
    val normalizedEventDivisions = remember(event.divisions) {
        event.divisions.normalizeDivisionIdentifiers()
    }
    val fieldsById = remember(editableFields) {
        editableFields.associateBy(Field::id)
    }
    val heroHeightFraction = if (editView) 0.6f else 0.32f
    val heroSpacerFraction = if (editView) 0.5f else 0.24f
    val heroHeight = (getScreenHeight() * heroHeightFraction).dp
    val statusBarInset = with(LocalDensity.current) { WindowInsets.statusBars.getTop(this).toDp() }
    val stickyHeaderTopInset = maxOf(topInset, statusBarInset + 12.dp)
    val heroSpacerHeight = (getScreenHeight() * heroSpacerFraction).dp
    val heroSpacerHeightPx = with(LocalDensity.current) { heroSpacerHeight.toPx() }
    val heroParallaxOffset by remember(lazyListState, heroSpacerHeightPx) {
        derivedStateOf {
            if (lazyListState.firstVisibleItemIndex == 0) {
                lazyListState.firstVisibleItemScrollOffset.toFloat().coerceAtMost(heroSpacerHeightPx)
            } else {
                heroSpacerHeightPx
            }
        }
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
                                    val hasNameError = eventNameInput.isBlank()
                                    StandardTextField(
                                        value = eventNameInput,
                                        onValueChange = { eventNameInput = it },
                                        label = "Event Name",
                                        isError = hasNameError,
                                        supportingText = if (hasNameError) {
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
                                    onClick = {
                                        onMapRevealCenterChange(editLocationButtonCenter)
                                        onOpenLocationMap()
                                    },
                                    modifier = Modifier.onGloballyPositioned {
                                        editLocationButtonCenter = it.boundsInWindow().center
                                        onMapRevealCenterChange(editLocationButtonCenter)
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
                    sectionId = readOnlyUiModel.basics.sectionId,
                    sectionExpansionStates = sectionExpansionStates,
                    sectionTitle = readOnlyUiModel.basics.title,
                    collapsibleInEditMode = true,
                    collapsibleInViewMode = true,
                    viewSummary = readOnlyUiModel.basics.summary,
                    requiredMissingCount = editUiModel.basics.requiredMissingCount,
                    isEditMode = eventDetailsMode == EventDetailsMode.EDIT,
                    lazyListState = lazyListState,
                    stickyHeaderTopInset = stickyHeaderTopInset,
                    animationDelay = 100,
                    viewContent = {
                        HostedByReadOnlyRow(
                            host = host,
                            organization = eventWithRelations.organization,
                            isOrganizationEvent = isOrganizationEvent,
                            fallbackHostDisplayName = hostDisplayName,
                            currentUser = currentUserForHostActions,
                            onMessageUser = readOnlyActions.onMessageUser,
                            onSendFriendRequest = readOnlyActions.onSendFriendRequest,
                            onFollowUser = readOnlyActions.onFollowUser,
                            onUnfollowUser = readOnlyActions.onUnfollowUser,
                            onBlockUser = readOnlyActions.onBlockUser,
                            onUnblockUser = readOnlyActions.onUnblockUser,
                            onFollowOrganization = readOnlyActions.onFollowOrganization,
                        )
                        HorizontalDivider(
                            color = MaterialTheme.colorScheme.outlineVariant,
                            thickness = 1.dp,
                        )
                        DetailKeyValueList(
                            rows = readOnlyBasicsRows,
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
                        FormSectionDivider()

                        val supportsNoFixedEndDateTime =
                            editEvent.eventType == EventType.LEAGUE ||
                                editEvent.eventType == EventType.TOURNAMENT ||
                                editEvent.eventType == EventType.WEEKLY_EVENT

                        if (editEvent.eventType == EventType.EVENT || supportsNoFixedEndDateTime) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                StandardTextField(
                                    value = editEvent.start.toLocalDateTime(
                                        TimeZone.currentSystemDefault()
                                    ).format(dateTimeFormat),
                                    onValueChange = {},
                                    modifier = Modifier.weight(1f),
                                    label = "Start Date & Time",
                                    readOnly = true,
                                    onTap = {
                                        if (!scheduleTimeLocked) {
                                            showStartPicker = true
                                        }
                                    },
                                )
                                StandardTextField(
                                    value = editEvent.end.toLocalDateTime(
                                        TimeZone.currentSystemDefault()
                                    ).format(dateTimeFormat),
                                    onValueChange = {},
                                    modifier = Modifier.weight(1f),
                                    label = "End Date & Time",
                                    enabled = !scheduleTimeLocked &&
                                        !(supportsNoFixedEndDateTime && editEvent.noFixedEndDateTime),
                                    readOnly = true,
                                    onTap = {
                                        if (!scheduleTimeLocked && !(supportsNoFixedEndDateTime && editEvent.noFixedEndDateTime)) {
                                            showEndPicker = true
                                        }
                                    },
                                )
                            }
                        } else {
                            StandardTextField(
                                value = editEvent.start.toLocalDateTime(
                                    TimeZone.currentSystemDefault()
                                ).format(dateTimeFormat),
                                onValueChange = {},
                                modifier = Modifier.fillMaxWidth(),
                                label = "Start Date & Time",
                                readOnly = true,
                                onTap = {
                                    if (!scheduleTimeLocked) {
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
                                    enabled = !scheduleTimeLocked,
                                    onCheckedChange = { checked ->
                                        onEditEvent {
                                            copy(
                                                noFixedEndDateTime = checked,
                                                end = when {
                                                    end <= start -> minimumFixedEnd
                                                    else -> end
                                                },
                                            )
                                        }
                                    },
                                )
                                Text(
                                    text = "No fixed end datetime scheduling",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Color(localImageScheme.current.onSurface),
                                )
                            }
                            if (editEvent.noFixedEndDateTime) {
                                Text(
                                    text = "Scheduling can extend past the displayed end date/time. Turn this off to enforce the end date/time.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(localImageScheme.current.onSurface),
                                )
                            }
                        }

                        if (scheduleTimeLocked) {
                            Text(
                                text = if (rentalTimeLocked) {
                                    "Rental-selected start and end times are fixed and cannot be changed."
                                } else {
                                    "Facility-managed timeslots lock the event time range in mobile edit mode."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(localImageScheme.current.onSurface),
                            )
                        }
                    },
                )

                animatedCardSection(
                    sectionId = readOnlyUiModel.registration.sectionId,
                    sectionExpansionStates = sectionExpansionStates,
                    sectionTitle = readOnlyUiModel.registration.title,
                    collapsibleInEditMode = true,
                    collapsibleInViewMode = true,
                    viewSummary = readOnlyUiModel.registration.summary,
                    requiredMissingCount = editUiModel.registration.requiredMissingCount,
                    isEditMode = eventDetailsMode == EventDetailsMode.EDIT,
                    lazyListState = lazyListState,
                    stickyHeaderTopInset = stickyHeaderTopInset,
                    animationDelay = 200,
                    viewContent = {
                        DetailKeyValueList(
                            rows = buildEventDetailsRows(
                                event = event,
                                priceSummary = priceSummary,
                                registrationSummary = registrationSummary,
                                refundSummary = refundSummary,
                            ),
                        )
                        ReadOnlyDivisionsList(
                            event = event,
                            divisionDetails = divisionDetailsForSettings,
                        )
                    },
                    editContent = {
                        val maxParticipantsLabel = if (!editEvent.teamSignup) {
                            stringResource(Res.string.max_players)
                        } else {
                            stringResource(Res.string.max_teams)
                        }
                        PlatformDropdown(
                            selectedValue = editEvent.eventType.name,
                            onSelectionChange = { selectedValue ->
                                val selectedEventType = EventType.entries.find { it.name == selectedValue }
                                selectedEventType?.let { onEventTypeSelected(it) }
                            },
                            options = EventType.entries
                                .filterNot { eventType ->
                                    isNewEvent && rentalTimeLocked && eventType == EventType.WEEKLY_EVENT
                                }
                                .map { eventType ->
                                    DropdownOption(
                                        value = eventType.name,
                                        label = eventType.name.toEnumTitleCase(),
                                    )
                                },
                            label = "Event Type",
                            modifier = Modifier.fillMaxWidth(),
                        )
                        FormSectionDivider()

                        val teamCapacityInputs: @Composable () -> Unit = {
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
                        }
                        val leaguePlayoffInputs: @Composable () -> Unit = {
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
                                                    onEditEvent {
                                                        val nextDivisionDetails = mergeDivisionDetailsForDivisions(
                                                            divisions = divisions,
                                                            existingDetails = divisionDetails,
                                                            eventId = id,
                                                        ).map { detail ->
                                                            when {
                                                                !checked -> detail.copy(playoffTeamCount = null)
                                                                singleDivision -> detail.copy(
                                                                    playoffTeamCount = playoffTeamCount
                                                                        ?: detail.playoffTeamCount,
                                                                )
                                                                else -> detail
                                                            }
                                                        }
                                                        copy(
                                                            includePlayoffs = checked,
                                                            playoffTeamCount = when {
                                                                !checked -> null
                                                                singleDivision -> playoffTeamCount
                                                                    ?: nextDivisionDetails.firstOrNull()?.playoffTeamCount
                                                                else -> playoffTeamCount
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
                                            if (newValue.isNotEmpty() && !newValue.all { it.isDigit() }) return@NumberInputField
                                            onEditEvent {
                                                copy(playoffTeamCount = if (newValue.isBlank()) null else newValue.toIntOrNull())
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
                        }
                        if (isMobileEventDetailsLayout) {
                            teamCapacityInputs()
                            leaguePlayoffInputs()
                        } else {
                            teamCapacityInputs()
                            leaguePlayoffInputs()
                        }
                        FormSectionDivider()

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
                        FormSectionDivider()

                        if (!hostHasAccount) {
                            StripeButton(
                                onClick = onHostCreateAccount,
                                paymentProcessor = paymentProcessor,
                                text = "Create Stripe Connect Account to Change Price",
                                modifier = Modifier.align(Alignment.CenterHorizontally),
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
                        RequiredDocumentsSection(
                            isOrganizationEvent = isOrganizationEvent,
                            rentalTimeLocked = rentalTimeLocked,
                            organizationTemplatesLoading = organizationTemplatesLoading,
                            organizationTemplatesError = organizationTemplatesError,
                            requiredTemplateOptions = requiredTemplateOptions,
                            selectedRequiredTemplateIds = selectedRequiredTemplateIds,
                            selectedRequiredTemplateLabels = selectedRequiredTemplateLabels,
                            onRequiredTemplateIdsChange = { normalizedTemplateIds ->
                                onEditEvent { copy(requiredTemplateIds = normalizedTemplateIds) }
                            },
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

                        FormSectionDivider()
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
                                        StandardTextField(
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
                    sectionId = readOnlyUiModel.matchRules.sectionId,
                    sectionExpansionStates = sectionExpansionStates,
                    sectionTitle = readOnlyUiModel.matchRules.title,
                    collapsibleInEditMode = true,
                    collapsibleInViewMode = true,
                    viewSummary = readOnlyUiModel.matchRules.summary,
                    isEditMode = eventDetailsMode == EventDetailsMode.EDIT,
                    lazyListState = lazyListState,
                    stickyHeaderTopInset = stickyHeaderTopInset,
                    animationDelay = 250,
                    viewContent = {
                        DetailKeyValueList(
                            rows = buildList {
                                add(
                                    DetailRowSpec(
                                        "Scoring model",
                                        matchScoringModelLabel(resolvedMatchRules.scoringModel),
                                    ),
                                )
                                add(
                                    DetailRowSpec(
                                        "${resolvedMatchRules.segmentLabel} count",
                                        resolvedMatchRules.segmentCount.toString(),
                                    ),
                                )
                                add(
                                    DetailRowSpec(
                                        "Point incident type",
                                        matchIncidentTypeLabel(autoPointIncidentType),
                                    ),
                                )
                                if (resolvedMatchRules.canUseOvertime) {
                                    add(
                                        DetailRowSpec(
                                            "Allow overtime",
                                            if (resolvedMatchRules.supportsOvertime) "Yes" else "No",
                                        ),
                                    )
                                }
                                if (resolvedMatchRules.canUseShootout) {
                                    add(
                                        DetailRowSpec(
                                            "Allow shootout / tiebreak",
                                            if (resolvedMatchRules.supportsShootout) "Yes" else "No",
                                        ),
                                    )
                                }
                                add(
                                    DetailRowSpec(
                                        "Automatic point incidents",
                                        if (event.autoCreatePointMatchIncidents) "Yes" else "No",
                                    ),
                                )
                                add(
                                    DetailRowSpec(
                                        "Point incidents require participant",
                                        if (resolvedMatchRules.pointIncidentRequiresParticipant) "Yes" else "No",
                                    ),
                                )
                                if (selectedMatchIncidentTypes.isNotEmpty()) {
                                    add(
                                        DetailRowSpec(
                                            "Incident types",
                                            selectedMatchIncidentTypes.joinToString(", ") { incidentType ->
                                                matchIncidentTypeLabel(incidentType)
                                            },
                                        ),
                                    )
                                }
                                if (resolvedMatchRules.officialRoles.isNotEmpty()) {
                                    add(
                                        DetailRowSpec(
                                            "Suggested officials",
                                            resolvedMatchRules.officialRoles.joinToString(", "),
                                        ),
                                    )
                                }
                            },
                        )
                    },
                    editContent = {
                        Text(
                            text = "The sport defines the match format. This event can adjust segment count, supported result paths, and incident capture without changing the sport default.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(localImageScheme.current.onSurfaceVariant),
                        )
                        DetailStatsGrid(
                            items = listOf(
                                DetailGridItem(
                                    label = "Scoring model",
                                    value = matchScoringModelLabel(resolvedMatchRules.scoringModel),
                                ),
                                DetailGridItem(
                                    label = "Segment label",
                                    value = resolvedMatchRules.segmentLabel,
                                ),
                                DetailGridItem(
                                    label = "Point incident type",
                                    value = matchIncidentTypeLabel(autoPointIncidentType),
                                ),
                            ),
                        )
                        FormSectionDivider()
                        NumberInputField(
                            value = editEvent.matchRulesOverride?.segmentCount?.toString().orEmpty(),
                            label = "${resolvedMatchRules.segmentLabel} Count",
                            placeholder = baseMatchRules.segmentCount.toString(),
                            supportingText = "Leave blank to use the sport default of ${baseMatchRules.segmentCount}.",
                            onValueChange = { newValue ->
                                if (newValue.isNotEmpty() && !newValue.all { it.isDigit() }) return@NumberInputField
                                val nextValue = newValue.toIntOrNull()
                                    ?.takeIf { it > 0 }
                                    ?.takeUnless { it == baseMatchRules.segmentCount }
                                onEditEvent {
                                    copy(
                                        matchRulesOverride = copyMatchRulesOverride(
                                            current = matchRulesOverride,
                                            segmentCount = nextValue,
                                        ),
                                    )
                                }
                            },
                            isError = false,
                        )
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            if (baseMatchRules.canUseOvertime) {
                                LabeledCheckboxRow(
                                    checked = resolvedMatchRules.supportsOvertime,
                                    label = "Allow overtime",
                                    onCheckedChange = { checked ->
                                        onEditEvent {
                                            copy(
                                                matchRulesOverride = copyMatchRulesOverride(
                                                    current = matchRulesOverride,
                                                    supportsOvertime = checked.takeUnless { it == baseMatchRules.supportsOvertime },
                                                ),
                                            )
                                        }
                                    },
                                )
                            }
                            if (baseMatchRules.canUseShootout) {
                                LabeledCheckboxRow(
                                    checked = resolvedMatchRules.supportsShootout,
                                    label = "Allow shootout / tiebreak",
                                    onCheckedChange = { checked ->
                                        onEditEvent {
                                            copy(
                                                matchRulesOverride = copyMatchRulesOverride(
                                                    current = matchRulesOverride,
                                                    supportsShootout = checked.takeUnless { it == baseMatchRules.supportsShootout },
                                                ),
                                            )
                                        }
                                    },
                                )
                            }
                            LabeledCheckboxRow(
                                checked = editEvent.autoCreatePointMatchIncidents,
                                label = "Create a scoring incident for each point / goal",
                                onCheckedChange = { checked ->
                                    val enforcedIncidentTypes = enforceAutoPointIncidentType(
                                        selected = selectedMatchIncidentTypes,
                                        autoPointIncidentType = autoPointIncidentType,
                                        enabled = checked,
                                    )
                                    val incidentOverride = supportedIncidentTypesOverrideOrNull(
                                        selected = enforcedIncidentTypes,
                                        defaults = baseMatchRules.supportedIncidentTypes,
                                    )
                                    onEditEvent {
                                        copy(
                                            autoCreatePointMatchIncidents = checked,
                                            matchRulesOverride = copyMatchRulesOverride(
                                                current = matchRulesOverride,
                                                supportedIncidentTypes = incidentOverride,
                                            ),
                                        )
                                    }
                                },
                            )
                            Text(
                                text = if (editEvent.autoCreatePointMatchIncidents) {
                                    "${matchIncidentTypeLabel(autoPointIncidentType)} incidents will stay available while automatic scoring capture is on."
                                } else {
                                    "Officials can still add incidents manually when needed."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(localImageScheme.current.onSurfaceVariant),
                            )
                            LabeledCheckboxRow(
                                checked = resolvedMatchRules.pointIncidentRequiresParticipant,
                                label = "Point incidents require a participant",
                                onCheckedChange = { checked ->
                                    onEditEvent {
                                        copy(
                                            matchRulesOverride = copyMatchRulesOverride(
                                                current = matchRulesOverride,
                                                pointIncidentRequiresParticipant = checked.takeUnless {
                                                    it == baseMatchRules.pointIncidentRequiresParticipant
                                                },
                                            ),
                                        )
                                    }
                                },
                            )
                        }
                        PlatformDropdown(
                            selectedValue = "",
                            onSelectionChange = {},
                            options = matchIncidentOptions,
                            label = "Incident types available in matches",
                            modifier = Modifier.fillMaxWidth(),
                            multiSelect = true,
                            selectedValues = selectedMatchIncidentTypes,
                            onMultiSelectionChange = { selectedValues ->
                                val enforcedIncidentTypes = enforceAutoPointIncidentType(
                                    selected = selectedValues,
                                    autoPointIncidentType = autoPointIncidentType,
                                    enabled = editEvent.autoCreatePointMatchIncidents,
                                )
                                val incidentOverride = supportedIncidentTypesOverrideOrNull(
                                    selected = enforcedIncidentTypes,
                                    defaults = baseMatchRules.supportedIncidentTypes,
                                )
                                onEditEvent {
                                    copy(
                                        matchRulesOverride = copyMatchRulesOverride(
                                            current = matchRulesOverride,
                                            supportedIncidentTypes = incidentOverride,
                                        ),
                                    )
                                }
                            },
                        )
                        if (resolvedMatchRules.officialRoles.isNotEmpty()) {
                            Text(
                                text = "Suggested officials: ${resolvedMatchRules.officialRoles.joinToString(", ")}",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(localImageScheme.current.onSurfaceVariant),
                            )
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                        ) {
                            TextButton(
                                onClick = {
                                    onEditEvent {
                                        copy(matchRulesOverride = null)
                                    }
                                },
                                enabled = editEvent.matchRulesOverride != null,
                            ) {
                                Text("Reset to sport defaults")
                            }
                        }
                    },
                )

                if (showOfficialsPanel) {
                    animatedCardSection(
                        sectionId = readOnlyUiModel.staff.sectionId,
                        sectionExpansionStates = sectionExpansionStates,
                        sectionTitle = readOnlyUiModel.staff.title,
                        collapsibleInEditMode = true,
                        collapsibleInViewMode = true,
                        viewSummary = readOnlyUiModel.staff.summary,
                        isEditMode = eventDetailsMode == EventDetailsMode.EDIT,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
                        animationDelay = 300,
                        viewContent = {
                            DetailKeyValueList(
                                rows = buildList {
                                    add(
                                        DetailRowSpec(
                                            "Teams provide officials",
                                            if (event.doTeamsOfficiate == true) "Yes" else "No",
                                        ),
                                    )
                                    if (event.doTeamsOfficiate == true) {
                                        add(
                                            DetailRowSpec(
                                                "Team officials may swap",
                                                if (event.teamOfficialsMaySwap == true) "Yes" else "No",
                                            ),
                                        )
                                    }
                                    add(DetailRowSpec("Primary host", resolvedHostDisplay))
                                    add(DetailRowSpec("Assistant hosts", assistantHostIds.size.toString()))
                                    add(DetailRowSpec("Officials", event.officialIds.size.toString()))
                                    add(
                                        DetailRowSpec(
                                            "Staffing mode",
                                            event.officialSchedulingMode.label(),
                                        ),
                                    )
                                    add(DetailRowSpec("Official positions", officialPositionSummary))
                                },
                            )
                        },
                        editContent = {
                            LabeledCheckboxRow(
                                checked = editEvent.doTeamsOfficiate == true,
                                label = "Teams provide officials",
                                onCheckedChange = onUpdateDoTeamsOfficiate,
                            )
                            if (editEvent.doTeamsOfficiate == true) {
                                LabeledCheckboxRow(
                                    checked = editEvent.teamOfficialsMaySwap == true,
                                    label = "Team officials may swap",
                                    onCheckedChange = onUpdateTeamOfficialsMaySwap,
                                )
                            }
                            Text(
                                text = "Official scheduling",
                                style = MaterialTheme.typography.titleSmall,
                                color = Color(localImageScheme.current.onSurface),
                            )
                            PlatformDropdown(
                                selectedValue = editEvent.officialSchedulingMode.name,
                                onSelectionChange = { selectedMode ->
                                    OfficialSchedulingMode.entries
                                        .firstOrNull { mode -> mode.name == selectedMode }
                                        ?.let(onUpdateOfficialSchedulingMode)
                                },
                                options = officialSchedulingModeOptions,
                                label = "Scheduling mode",
                                modifier = Modifier.fillMaxWidth(),
                            )
                            FormSectionDivider()
                            CollapsibleEditorSubsectionHeader(
                                title = "Event official positions",
                                expanded = officialPositionsExpanded,
                                onToggle = { officialPositionsExpanded = !officialPositionsExpanded },
                            )
                            AnimatedVisibility(visible = officialPositionsExpanded) {
                                Column(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text(
                                        text = "Sport defaults are copied into this event.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Color(localImageScheme.current.onSurfaceVariant),
                                    )
                                    TextButton(
                                        onClick = onLoadOfficialPositionDefaults,
                                        enabled = selectedSportForOfficialDefaults != null,
                                        modifier = Modifier.align(Alignment.End),
                                    ) {
                                        Text("Load defaults")
                                    }
                                    if (editEvent.officialPositions.isEmpty()) {
                                        Text(
                                            text = "No official positions configured yet.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Color(localImageScheme.current.onSurfaceVariant),
                                        )
                                    } else {
                                        editEvent.officialPositions
                                            .sortedBy(EventOfficialPosition::order)
                                            .forEach { position ->
                                                Card(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    colors = CardDefaults.cardColors(
                                                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                                    ),
                                                ) {
                                                    Column(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .padding(12.dp),
                                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                                    ) {
                                                        StandardTextField(
                                                            value = position.name,
                                                            onValueChange = { newName ->
                                                                onUpdateOfficialPositionName(position.id, newName)
                                                            },
                                                            label = "Position name",
                                                            modifier = Modifier.fillMaxWidth(),
                                                        )
                                                        Row(
                                                            modifier = Modifier.fillMaxWidth(),
                                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                            verticalAlignment = Alignment.Bottom,
                                                        ) {
                                                            NumberInputField(
                                                                modifier = Modifier.weight(1f),
                                                                value = position.count.toString(),
                                                                label = "Slots",
                                                                isError = false,
                                                                onValueChange = { newValue ->
                                                                    val nextCount = newValue.toIntOrNull()
                                                                    if (newValue.isBlank()) {
                                                                        onUpdateOfficialPositionCount(position.id, 1)
                                                                    } else if (nextCount != null) {
                                                                        onUpdateOfficialPositionCount(position.id, nextCount.coerceAtLeast(1))
                                                                    }
                                                                },
                                                            )
                                                            Button(
                                                                onClick = { onRemoveOfficialPosition(position.id) },
                                                            ) {
                                                                Text("Remove")
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                    }
                                    TextButton(
                                        onClick = onAddOfficialPosition,
                                        modifier = Modifier.align(Alignment.End),
                                    ) {
                                        Text("Add position")
                                    }
                                }
                            }
                            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                            Text(
                                text = "Add / Invite Staff",
                                style = MaterialTheme.typography.titleSmall,
                                color = Color(localImageScheme.current.onSurface),
                            )
                            StandardTextField(
                                value = staffSearchQuery,
                                onValueChange = { newValue ->
                                    staffSearchQuery = newValue
                                    staffEditorError = null
                                    onSearchUsers(newValue)
                                },
                                label = "Search existing users",
                                placeholder = "Name or username",
                                modifier = Modifier.fillMaxWidth(),
                            )
                            if (staffSearchQuery.isNotBlank() && visibleUserSuggestions.isEmpty()) {
                                Text(
                                    text = "No matching users.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(localImageScheme.current.onSurfaceVariant),
                                )
                            }
                            visibleUserSuggestions.take(6).forEach { suggestedUser ->
                                val canAddOfficial = !editEvent.officialIds.contains(suggestedUser.id)
                                val canAddAssistant = suggestedUser.id != editEvent.hostId &&
                                    !assistantHostIds.contains(suggestedUser.id)
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                    ),
                                ) {
                                    Column(
                                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Text(
                                            text = userDisplayName(suggestedUser),
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            Button(
                                                onClick = {
                                                    staffEditorError = null
                                                    onAddOfficialId(suggestedUser.id)
                                                },
                                                enabled = canAddOfficial,
                                                modifier = Modifier.weight(1f),
                                            ) {
                                                Text("Add as official")
                                            }
                                            Button(
                                                onClick = {
                                                    staffEditorError = null
                                                    onUpdateAssistantHostIds(
                                                        (assistantHostIds + suggestedUser.id)
                                                            .map(String::trim)
                                                            .filter(String::isNotBlank)
                                                            .distinct()
                                                            .filterNot { userId -> userId == editEvent.hostId },
                                                    )
                                                },
                                                enabled = canAddAssistant,
                                                modifier = Modifier.weight(1f),
                                            ) {
                                                Text("Add as assistant")
                                            }
                                        }
                                    }
                                }
                            }
                            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                            Text(
                                text = "Email invite",
                                style = MaterialTheme.typography.titleSmall,
                                color = Color(localImageScheme.current.onSurface),
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                StandardTextField(
                                    value = staffInviteFirstName,
                                    onValueChange = { staffInviteFirstName = it },
                                    label = "First Name",
                                    modifier = Modifier.weight(1f),
                                )
                                StandardTextField(
                                    value = staffInviteLastName,
                                    onValueChange = { staffInviteLastName = it },
                                    label = "Last Name",
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            StandardTextField(
                                value = staffInviteEmail,
                                onValueChange = { staffInviteEmail = it },
                                label = "Email",
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Box(modifier = Modifier.weight(1f)) {
                                    LabeledCheckboxRow(
                                        checked = draftInviteOfficial,
                                        label = "Official",
                                        onCheckedChange = { draftInviteOfficial = it },
                                    )
                                }
                                Box(modifier = Modifier.weight(1f)) {
                                    LabeledCheckboxRow(
                                        checked = draftInviteAssistantHost,
                                        label = "Assistant Host",
                                        onCheckedChange = { draftInviteAssistantHost = it },
                                    )
                                }
                            }
                            Button(
                                onClick = {
                                    val roles = buildSet {
                                        if (draftInviteOfficial) add(EventStaffRole.OFFICIAL)
                                        if (draftInviteAssistantHost) add(EventStaffRole.ASSISTANT_HOST)
                                    }
                                    coroutineScope.launch {
                                        onAddPendingStaffInvite(
                                            staffInviteFirstName,
                                            staffInviteLastName,
                                            staffInviteEmail,
                                            roles,
                                        ).onSuccess {
                                            staffEditorError = null
                                            staffInviteFirstName = ""
                                            staffInviteLastName = ""
                                            staffInviteEmail = ""
                                            draftInviteOfficial = false
                                            draftInviteAssistantHost = false
                                        }.onFailure { error ->
                                            staffEditorError = error.userMessage("Unable to add staff invite.")
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Add email invite")
                            }
                            staffEditorError?.let { errorText ->
                                Text(
                                    text = errorText,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                            CollapsibleEditorSubsectionHeader(
                                title = "Assigned staff",
                                expanded = assignedStaffExpanded,
                                onToggle = { assignedStaffExpanded = !assignedStaffExpanded },
                            )
                            AnimatedVisibility(visible = assignedStaffExpanded) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.Top,
                                ) {
                                    Column(
                                        modifier = Modifier.weight(1f),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Text(
                                            text = "Officials",
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        EditableStaffCardList(
                                            cards = officialStaffCards,
                                            emptyText = "No officials selected yet.",
                                            lazyListHeight = editableOfficialStaffListHeight,
                                        ) { card ->
                                            val assignedUserId = card.userId
                                            val selectedPositionIds = assignedUserId
                                                ?.let(eventOfficialRecordsByUserId::get)
                                                ?.positionIds
                                                .orEmpty()
                                            StaffAssignmentCard(
                                                card = card,
                                                onRemoveAssigned = { userId, role ->
                                                    if (role == EventStaffRole.OFFICIAL) {
                                                        onRemoveOfficialId(userId)
                                                    }
                                                },
                                                onRemoveDraft = onRemovePendingStaffInvite,
                                                extraContent = if (assignedUserId != null && officialPositionOptions.isNotEmpty()) {
                                                    {
                                                        PlatformDropdown(
                                                            selectedValue = "",
                                                            onSelectionChange = {},
                                                            options = officialPositionOptions,
                                                            label = "Eligible positions",
                                                            modifier = Modifier.fillMaxWidth(),
                                                            multiSelect = true,
                                                            selectedValues = selectedPositionIds,
                                                            onMultiSelectionChange = { selectedIds ->
                                                                onUpdateOfficialUserPositions(
                                                                    assignedUserId,
                                                                    selectedIds,
                                                                )
                                                            },
                                                        )
                                                    }
                                                } else {
                                                    null
                                                },
                                            )
                                        }
                                    }
                                    Column(
                                        modifier = Modifier.weight(1f),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Text(
                                            text = "Hosts",
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        EditableStaffCardList(
                                            cards = hostStaffCards,
                                            emptyText = "No host staff assigned yet.",
                                            lazyListHeight = editableHostStaffListHeight,
                                        ) { card ->
                                            StaffAssignmentCard(
                                                card = card,
                                                onRemoveAssigned = { userId, role ->
                                                    if (role == EventStaffRole.ASSISTANT_HOST) {
                                                        onUpdateAssistantHostIds(
                                                            assistantHostIds.filterNot { existingId ->
                                                                existingId == userId
                                                            },
                                                        )
                                                    }
                                                },
                                                onRemoveDraft = onRemovePendingStaffInvite,
                                            )
                                        }
                                    }
                                }
                            }
                        },
                    )
                }

                if (editView) {
                    // Specifics Card
                    animatedCardSection(
                        sectionId = readOnlyUiModel.divisions.sectionId,
                        sectionExpansionStates = sectionExpansionStates,
                        sectionTitle = readOnlyUiModel.divisions.title,
                        collapsibleInEditMode = true,
                        collapsibleInViewMode = true,
                        viewSummary = readOnlyUiModel.divisions.summary,
                        isEditMode = eventDetailsMode == EventDetailsMode.EDIT,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
                        animationDelay = 400,
                        requiredMissingCount = editUiModel.divisions.requiredMissingCount,
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
                                                        event.playoffTeamCount?.let { "$it teams" } ?: "Not set"
                                                    } else {
                                                        "Configured per division"
                                                    },
                                                ),
                                            )
                                        }
                                    }

                                    EventType.TOURNAMENT -> {
                                        if (event.usesSets) {
                                            add(
                                                DetailRowSpec(
                                                    "Set duration",
                                                    "${event.setDurationMinutes ?: 20} minutes",
                                                ),
                                            )
                                        } else {
                                            add(
                                                DetailRowSpec(
                                                    "Match duration",
                                                    "${event.matchDurationMinutes ?: 60} minutes",
                                                ),
                                            )
                                        }
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

                                    EventType.EVENT, EventType.WEEKLY_EVENT -> {
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
                                checked = if (
                                    editEvent.eventType == EventType.EVENT ||
                                    editEvent.eventType == EventType.WEEKLY_EVENT
                                ) {
                                    editEvent.teamSignup
                                } else {
                                    true
                                },
                                label = "Team Event",
                                enabled = editEvent.eventType == EventType.EVENT ||
                                    editEvent.eventType == EventType.WEEKLY_EVENT,
                                onCheckedChange = { checked ->
                                    if (
                                        editEvent.eventType == EventType.EVENT ||
                                        editEvent.eventType == EventType.WEEKLY_EVENT
                                    ) {
                                        onEditEvent { copy(teamSignup = checked) }
                                    }
                        },
                    )
                }
                        Box(modifier = Modifier.weight(1f)) {
                            LabeledCheckboxRow(
                                checked = if (isNewEvent) true else editEvent.singleDivision,
                                label = "Single Division",
                                enabled = false,
                                onCheckedChange = { checked ->
                                    if (isNewEvent) {
                                        return@LabeledCheckboxRow
                                    }
                                    val explicitPlayoffCount =
                                        editEvent.playoffTeamCount
                                            ?: divisionDetailsForSettings.firstOrNull()?.playoffTeamCount
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
                                                explicitPlayoffCount ?: existing.playoffTeamCount
                                            } else {
                                                existing.playoffTeamCount ?: playoffTeamCount
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
                                                    explicitPlayoffCount
                                                } else {
                                                    playoffTeamCount
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
                        StandardTextField(
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
                    FormSectionDivider()

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        MoneyInputField(
                            value = if (editEvent.singleDivision) {
                                editEvent.priceCents.coerceAtLeast(0).toString()
                            } else {
                                divisionEditor.priceCents.coerceAtLeast(0).toString()
                            },
                            onValueChange = { value ->
                                if (!divisionEditorReady || editEvent.singleDivision || !hostHasAccount) {
                                    return@MoneyInputField
                                }
                                divisionEditor = divisionEditor.copy(
                                    priceCents = value.filter(Char::isDigit).toIntOrNull()?.coerceAtLeast(0) ?: 0,
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
                                editEvent.playoffTeamCount?.toString().orEmpty()
                            } else {
                                divisionEditor.playoffTeamCount?.toString().orEmpty()
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
                                if (value.isEmpty() || value.all { it.isDigit() }) {
                                    val parsed = if (value.isBlank()) null else value.toIntOrNull()
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
                                    StandardTextField(
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

                    DivisionDetailEditList(
                        event = editEvent,
                        divisionDetails = divisionDetailsForSettings,
                        onEditDivision = ::handleEditDivisionDetail,
                        onRemoveDivision = ::handleRemoveDivisionDetail,
                    )
                    }

                    )
                }

                if (editEvent.eventType == EventType.LEAGUE) {
                    animatedCardSection(
                        sectionId = readOnlyUiModel.leagueScoring.sectionId,
                        sectionExpansionStates = sectionExpansionStates,
                        sectionTitle = if (eventDetailsMode == EventDetailsMode.EDIT) {
                            editUiModel.leagueScoring.title
                        } else {
                            readOnlyUiModel.leagueScoring.title
                        },
                        collapsibleInEditMode = true,
                        collapsibleInViewMode = true,
                        viewSummary = readOnlyUiModel.leagueScoring.summary,
                        isEditMode = eventDetailsMode == EventDetailsMode.EDIT,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
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

                if (supportsScheduleConfig) {
                    animatedCardSection(
                        sectionId = readOnlyUiModel.schedule.sectionId,
                        sectionExpansionStates = sectionExpansionStates,
                        sectionTitle = if (eventDetailsMode == EventDetailsMode.EDIT) {
                            editUiModel.schedule.title
                        } else {
                            readOnlyUiModel.schedule.title
                        },
                        collapsibleInEditMode = true,
                        collapsibleInViewMode = true,
                        viewSummary = readOnlyUiModel.schedule.summary,
                        requiredMissingCount = editUiModel.schedule.requiredMissingCount,
                        isEditMode = eventDetailsMode == EventDetailsMode.EDIT,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
                        animationDelay = 450,
                        viewContent = {
                            DetailKeyValueList(
                                rows = buildScheduleDetailsRows(
                                    event = event,
                                    fieldCount = readOnlyFieldCount,
                                    slotCount = eventWithRelations.timeSlots.size,
                                ),
                            )
                            ScheduleTimeslotsReadOnlyList(
                                slots = eventWithRelations.timeSlots,
                                fieldsById = fieldsById,
                                divisionDetails = divisionDetailsForSettings,
                                fallbackDivisionIds = normalizedEventDivisions,
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
                                if (editEvent.includePlayoffs) {
                                    FormSectionDivider()
                                    LeaguePlayoffConfigurationFields(
                                        leagueConfig = editEvent.toLeagueConfig(),
                                        playoffConfig = editEvent.toTournamentConfig(),
                                        onPlayoffConfigChange = { updated ->
                                            onEditTournament { withTournamentConfig(updated) }
                                        },
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
                                Text(
                                    text = if (editEvent.usesSets) {
                                        "Set-based scoring is determined by the selected sport."
                                    } else {
                                        "Timed match scoring is determined by the selected sport."
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )

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

                                StandardTextField(
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
                                    NumberInputField(
                                        modifier = Modifier.weight(1f),
                                        value = if (editEvent.usesSets) {
                                            (editEvent.setDurationMinutes ?: 20).toString()
                                        } else {
                                            (editEvent.matchDurationMinutes ?: 60).toString()
                                        },
                                        onValueChange = { newValue ->
                                            if (newValue.all { it.isDigit() }) {
                                                onEditTournament {
                                                    if (editEvent.usesSets) {
                                                        copy(setDurationMinutes = newValue.toIntOrNull())
                                                    } else {
                                                        copy(matchDurationMinutes = newValue.toIntOrNull() ?: 0)
                                                    }
                                                }
                                            }
                                        },
                                        label = if (editEvent.usesSets) {
                                            "Set Duration (min)"
                                        } else {
                                            "Match Duration (min)"
                                        },
                                        isError = !isLeagueDurationValid,
                                        supportingText = if (!isLeagueDurationValid) {
                                            if (editEvent.usesSets) {
                                                "Set duration must be at least 5 minutes."
                                            } else {
                                                "Match duration must be at least 15 minutes."
                                            }
                                        } else {
                                            ""
                                        },
                                    )
                                    Box(modifier = Modifier.weight(1f))
                                }

                                if (editEvent.usesSets) {
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

                                        Box(modifier = Modifier.weight(1f))
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
                                } else {
                                    Spacer(Modifier.height(12.dp))
                                }
                            }

                            if (
                                editEvent.eventType == EventType.LEAGUE ||
                                    editEvent.eventType == EventType.TOURNAMENT
                            ) {
                                FormSectionDivider()
                            }
                            LeagueScheduleFields(
                                fieldCount = fieldCount,
                                fields = editableFields,
                                slots = leagueTimeSlots,
                                eventStart = editEvent.start,
                                eventEnd = if (editEvent.noFixedEndDateTime) {
                                    null
                                } else {
                                    editEvent.end.takeIf { it > editEvent.start }
                                },
                                onFieldCountChange = { count ->
                                    fieldCount = count
                                    onSelectFieldCount(count)
                                },
                                onFieldNameChange = onUpdateLocalFieldName,
                                onAddSlot = onAddLeagueTimeSlot,
                                onUpdateSlot = onUpdateLeagueTimeSlot,
                                onRemoveSlot = onRemoveLeagueTimeSlot,
                                slotErrors = leagueSlotErrors,
                                showSlotEditor = slotEditorEnabled,
                                showUseManualTimeSlotsToggle = supportsOptionalManualTimeSlots,
                                useManualTimeSlots = useManualTimeSlots,
                                onUseManualTimeSlotsChange = onUseManualTimeSlotsChange,
                                slotDivisionOptions = slotDivisionOptions,
                                lockSlotDivisions = editEvent.singleDivision,
                                lockedDivisionIds = editEvent.divisions.normalizeDivisionIdentifiers(),
                                fieldCountError = if (!isFieldCountValid) {
                                    "Field count must be at least 1."
                                } else {
                                    null
                                },
                                readOnly = scheduleTimeLocked,
                            )
                            if (
                                !isLeagueSlotsValid &&
                                (
                                    editEvent.eventType == EventType.LEAGUE ||
                                        editEvent.eventType == EventType.TOURNAMENT ||
                                        editEvent.eventType == EventType.WEEKLY_EVENT
                                    )
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
    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            val selected = selectedInstant ?: return@PlatformDateTimePicker
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
        showPicker = showStartPicker && !scheduleTimeLocked,
        getTime = true,
        canSelectPast = false,
        initialDate = editEvent.start,
    )

    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            val selected = selectedInstant ?: return@PlatformDateTimePicker
            onEditEvent { copy(end = selected) }
            showEndPicker = false
        },
        onDismissRequest = { showEndPicker = false },
        showPicker = showEndPicker && !scheduleTimeLocked && !editEvent.noFixedEndDateTime,
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
