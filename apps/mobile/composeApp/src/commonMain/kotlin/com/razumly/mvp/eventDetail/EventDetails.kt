package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.network.userMessage
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.zIndex
import com.kmpalette.loader.rememberNetworkLoader
import com.kmpalette.rememberDominantColorState
import com.materialkolor.scheme.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.LeagueConfig
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.displayPriceRangeLabel
import com.razumly.mvp.core.data.dataTypes.evergreenDateDisplayLabel
import com.razumly.mvp.core.data.dataTypes.isAffiliateEvent
import com.razumly.mvp.core.data.dataTypes.label
import com.razumly.mvp.core.data.dataTypes.officialPositionSummary
import com.razumly.mvp.core.data.dataTypes.positionSummary
import com.razumly.mvp.core.data.dataTypes.toLeagueConfig
import com.razumly.mvp.core.data.dataTypes.toTournamentConfig
import com.razumly.mvp.core.data.dataTypes.usesManualRegistrationPayments
import com.razumly.mvp.core.data.dataTypes.withLeagueConfig
import com.razumly.mvp.core.data.dataTypes.withTournamentConfig
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.skillsForSport
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeName
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
import com.razumly.mvp.core.data.repositories.InclusivePriceQuote
import com.razumly.mvp.core.data.repositories.InclusivePriceQuoteDirection
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.getScreenHeight
import com.razumly.mvp.core.presentation.util.toEnumTitleCase
import com.razumly.mvp.core.presentation.util.toNameCase
import com.razumly.mvp.core.presentation.util.timeFormat
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.core.util.resolvedTimeZone
import com.razumly.mvp.eventDetail.composables.SelectEventImage
import com.razumly.mvp.eventDetail.readonly.resolveReadOnlyFieldCount
import com.razumly.mvp.eventDetail.shared.BackgroundImage
import com.razumly.mvp.eventDetail.shared.DetailRowSpec
import com.razumly.mvp.eventDetail.shared.localImageScheme
import com.razumly.mvp.eventDetail.staff.StaffAssignmentCardModel
import com.razumly.mvp.eventDetail.staff.buildAssignedStaffCards
import com.razumly.mvp.eventDetail.staff.buildDraftStaffCards
import com.razumly.mvp.eventDetail.staff.userDisplayName
import com.razumly.mvp.eventMap.MapComponent
import dev.chrisbanes.haze.ExperimentalHazeApi
import io.github.aakira.napier.Napier
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.ismoy.imagepickerkmp.domain.models.MimeType
import io.github.ismoy.imagepickerkmp.features.imagepicker.ui.rememberImagePickerKMP
import io.ktor.http.Url
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.format
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
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
private const val MAX_READ_ONLY_NAME_LIST_ITEMS = 5
private const val STAFF_LAZY_LIST_THRESHOLD = 4
private const val STAFF_LAZY_LIST_VISIBLE_COUNT = 4
private val readOnlyNameListItemHeight = 28.dp
private val readOnlyNameListSpacing = 4.dp
private val editableOfficialStaffListHeight = 160.dp * STAFF_LAZY_LIST_VISIBLE_COUNT
private val editableHostStaffListHeight = 130.dp * STAFF_LAZY_LIST_VISIBLE_COUNT

internal fun isEventInclusivePriceReady(
    editView: Boolean,
    manualPaymentsEnabled: Boolean,
    isQuoteConfirmed: Boolean,
): Boolean = !editView || manualPaymentsEnabled || isQuoteConfirmed

private fun kotlin.time.Instant.reinterpretSystemLocalSelectionIn(timeZone: TimeZone): kotlin.time.Instant {
    val local = toLocalDateTime(TimeZone.currentSystemDefault())
    return LocalDateTime(local.date, local.time).toInstant(timeZone)
}

private fun kotlin.time.Instant.asSystemLocalPickerInstant(timeZone: TimeZone): kotlin.time.Instant {
    val local = toLocalDateTime(timeZone)
    return LocalDateTime(local.date, local.time).toInstant(TimeZone.currentSystemDefault())
}

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
    showValidationErrors: Boolean = true,
    rentalTimeLocked: Boolean = false,
    onHostCreateAccount: () -> Unit,
    onOpenLocationMap: () -> Unit,
    onPlaceSelected: (MVPPlace?) -> Unit,
    onEditEvent: (Event.() -> Event) -> Unit,
    onEditTournament: (Event.() -> Event) -> Unit,
    onAddCurrentUser: (Boolean) -> Unit,
    onEventTypeSelected: (EventType) -> Unit,
    sports: List<Sport> = emptyList(),
    eventTagOptions: List<EventTag> = emptyList(),
    divisionTypeParameters: DivisionTypeParameters = DivisionTypeParameters(),
    editableFields: List<Field> = emptyList(),
    leagueTimeSlots: List<TimeSlot> = emptyList(),
    availableRentalResources: List<RentalResourceOption> = emptyList(),
    selectedRentalResourceIds: Set<String> = emptySet(),
    onRentalResourceSelectionChange: (String, Boolean) -> Unit = { _, _ -> },
    leagueScoringConfig: LeagueScoringConfigDTO = LeagueScoringConfigDTO(),
    organizationTemplates: List<OrganizationTemplateDocument> = emptyList(),
    organizationTemplatesLoading: Boolean = false,
    organizationTemplatesError: String? = null,
    eventRegistrationQuestions: List<TeamJoinQuestion> = emptyList(),
    eventRegistrationQuestionAnswers: Map<String, String> = emptyMap(),
    eventRegistrationQuestionsExpanded: Boolean = false,
    registrationHoldExpiresAt: String? = null,
    onToggleEventRegistrationQuestions: () -> Unit = {},
    onEventRegistrationQuestionAnswerChange: (String, String) -> Unit = { _, _ -> },
    onRegistrationHoldExpired: () -> Unit = {},
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
    onUpdateTeamCheckInMode: (TeamCheckInMode) -> Unit = {},
    onUpdateTeamCheckInOpenMinutesBefore: (Int) -> Unit = {},
    onUpdateAllowMatchRosterEdits: (Boolean) -> Unit = {},
    onUpdateAllowTemporaryMatchPlayers: (Boolean) -> Unit = {},
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
    onUploadSelected: (GalleryPhotoResult, () -> Unit) -> Unit,
    onDeleteImage: (String, () -> Unit) -> Unit,
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
    quoteInclusivePrice: suspend (
        InclusivePriceQuoteDirection,
        Int,
        String?,
    ) -> Result<InclusivePriceQuote> = { _, _, _ ->
        Result.failure(UnsupportedOperationException("Inclusive price quotes are unavailable."))
    },
    heroTopControls: @Composable BoxScope.() -> Unit = {},
    modifier: Modifier = Modifier,
    joinButton: @Composable (isValid: Boolean) -> Unit
) {
    val popupHandler = LocalPopupHandler.current
    val event = eventWithRelations.event
    val eventTimeZone = remember(event.timeZone) { event.resolvedTimeZone() }
    val editEventTimeZone = remember(editEvent.timeZone) { editEvent.resolvedTimeZone() }
    val host = eventWithRelations.host
    var isValid by remember { mutableStateOf(false) }
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
    var installmentDueDatePickerIndex by remember { mutableStateOf<Int?>(null) }
    var divisionInstallmentDueDatePickerIndex by remember { mutableStateOf<Int?>(null) }
    var showImageSelector by rememberSaveable { mutableStateOf(false) }
    // Validation states
    var isPriceValid by remember { mutableStateOf(editEvent.priceCents >= 0) }
    var isMaxParticipantsValid by remember { mutableStateOf(true) }
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
    val eventImagePicker = rememberImagePickerKMP()
    val launchEventImagePicker = remember(eventImagePicker) {
        {
            eventImagePicker.launchGallery(
                allowMultiple = false,
                mimeTypes = listOf(MimeType.IMAGE_ALL),
            )
        }
    }
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
    var divisionInputsExpanded by rememberSaveable(editEvent.id, editView) { mutableStateOf(true) }
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
    val splitByDivisionScheduling = remember(editEvent.singleDivision) {
        !editEvent.singleDivision
    }
    val normalizedDivisionDetails = remember(
        editEvent.divisions,
        editEvent.divisionDetails,
        editEvent.id,
        editEvent.eventType,
        editEvent.includePlayoffs,
    ) {
        editEvent.divisionDetailsForEventSettings()
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
        editEvent.installmentDueRelativeDays,
        editEvent.installmentAmounts,
        editEvent.eventType,
    ) {
        val useRelativeInstallmentDueDates = editEvent.eventType == EventType.WEEKLY_EVENT
        val tournamentPoolPlayEnabled = editEvent.isTournamentPoolPlayEnabled()
        normalizedDivisionDetails.map { detail ->
            val effectiveDivisionPrice = if (editEvent.singleDivision) {
                editEvent.priceCents.coerceAtLeast(0)
            } else {
                detail.price?.coerceAtLeast(0)
            }
            val effectiveMaxParticipants = if (editEvent.singleDivision) {
                editEvent.maxParticipants.takeIf { value -> value >= 2 }
            } else {
                detail.maxParticipants?.coerceAtLeast(2)
            }
            val detailInstallmentAmounts = detail.installmentAmounts.map { amount ->
                amount.coerceAtLeast(0)
            }
            val detailInstallmentDueDates = detail.installmentDueDates
                .map { dueDate -> dueDate.trim() }
                .filter(String::isNotBlank)
            val detailInstallmentDueRelativeDays = detail.installmentDueRelativeDays
            val detailInstallmentCount = maxOf(
                detail.installmentCount ?: 0,
                detailInstallmentAmounts.size,
                if (useRelativeInstallmentDueDates) {
                    detailInstallmentDueRelativeDays.size
                } else {
                    detailInstallmentDueDates.size
                },
            ).takeIf { count -> count > 0 }
            val detailAllowPaymentPlans = when {
                detail.allowPaymentPlans == false -> false
                detail.allowPaymentPlans == true -> detailInstallmentCount != null && (effectiveDivisionPrice ?: 0) > 0
                else -> false
            }

            detail.copy(
                price = effectiveDivisionPrice,
                maxParticipants = effectiveMaxParticipants,
                playoffTeamCount = when {
                    !editEvent.includePlayoffs -> null
                    editEvent.singleDivision -> editEvent.playoffTeamCount ?: detail.playoffTeamCount
                    else -> detail.playoffTeamCount
                },
                poolCount = if (tournamentPoolPlayEnabled) detail.poolCount else null,
                poolTeamCount = if (tournamentPoolPlayEnabled && effectiveMaxParticipants != null) {
                    derivePoolTeamCount(
                        maxTeams = effectiveMaxParticipants,
                        poolCount = detail.poolCount,
                    )
                } else {
                    null
                },
                allowPaymentPlans = detailAllowPaymentPlans,
                installmentCount = when {
                    detailAllowPaymentPlans -> detailInstallmentCount
                    else -> null
                },
                installmentDueDates = when {
                    useRelativeInstallmentDueDates -> emptyList()
                    detailAllowPaymentPlans -> detailInstallmentDueDates
                    else -> emptyList()
                },
                installmentDueRelativeDays = when {
                    !useRelativeInstallmentDueDates -> emptyList()
                    detailAllowPaymentPlans -> detailInstallmentDueRelativeDays
                    else -> emptyList()
                },
                installmentAmounts = when {
                    detailAllowPaymentPlans -> detailInstallmentAmounts
                    else -> emptyList()
                },
            )
        }
    }
    val divisionOptions = remember(divisionDetailsForSettings, selectedDivisions) {
        buildDivisionDropdownOptions(
            existingDetails = divisionDetailsForSettings,
            selectedDivisionIds = selectedDivisions,
        )
    }
    val slotDivisionOptions = divisionOptions
    val selectedSportForDivisionOptions = remember(sports, editEvent.sportId) {
        val normalizedSportId = editEvent.sportId?.trim().orEmpty()
        sports.firstOrNull { sport -> sport.id == normalizedSportId }
    }
    val divisionScheduleUsesSets = selectedSportForDivisionOptions?.usePointsPerSetWin ?: editEvent.usesSets
    val baseLeagueConfig = remember(editEvent) {
        editEvent.toLeagueConfig()
    }
    val baseTournamentConfig = remember(editEvent) {
        editEvent.toTournamentConfig()
    }
    val defaultDivisionConfigDetail = remember(
        editEvent.id,
        editEvent.singleDivision,
        editEvent.eventType,
        editEvent.includePlayoffs,
        divisionDetailsForSettings,
    ) {
        if (!editEvent.singleDivision && editEvent.isTournamentPoolPlayEnabled()) {
            divisionDetailsForSettings.firstOrNull()
        } else {
            null
        }
    }
    val divisionEditorBaseState = remember(
        editEvent.priceCents,
        editEvent.maxParticipants,
        editEvent.playoffTeamCount,
        editEvent.allowPaymentPlans,
        editEvent.installmentCount,
        editEvent.installmentDueDates,
        editEvent.installmentDueRelativeDays,
        editEvent.installmentAmounts,
        baseLeagueConfig,
        baseTournamentConfig,
        defaultDivisionConfigDetail,
    ) {
        defaultDivisionEditorState(
            defaultPriceCents = editEvent.priceCents,
            defaultMaxParticipants = editEvent.maxParticipants,
            defaultPlayoffTeamCount = editEvent.playoffTeamCount,
            defaultPoolCount = defaultDivisionConfigDetail?.poolCount,
            defaultAllowPaymentPlans = editEvent.allowPaymentPlans == true,
            defaultInstallmentCount = editEvent.installmentCount,
            defaultInstallmentDueDates = editEvent.installmentDueDates,
            defaultInstallmentDueRelativeDays = editEvent.installmentDueRelativeDays,
            defaultInstallmentAmounts = editEvent.installmentAmounts,
            defaultLeagueConfig = defaultDivisionConfigDetail?.toLeagueConfig(baseLeagueConfig)
                ?: baseLeagueConfig,
            defaultPlayoffConfig = defaultDivisionConfigDetail?.toTournamentConfig(baseTournamentConfig)
                ?: baseTournamentConfig,
        )
    }
    var divisionEditor by remember(editEvent.id) {
        mutableStateOf(divisionEditorBaseState)
    }
    var divisionEditorDefaults by remember(editEvent.id) {
        mutableStateOf(divisionEditorBaseState)
    }
    val inclusivePriceEditorKey = remember(
        editEvent.id,
        editEvent.singleDivision,
        divisionEditor.editingId,
    ) {
        if (editEvent.singleDivision) {
            "event-price:${editEvent.id}:single"
        } else {
            "event-price:${editEvent.id}:division:${divisionEditor.editingId.orEmpty().ifBlank { "new" }}"
        }
    }
    var confirmedInclusivePriceEditorKey by remember(editEvent.id) {
        mutableStateOf<String?>(null)
    }
    val isInclusivePriceQuoteConfirmed = isEventInclusivePriceReady(
        editView = editView,
        manualPaymentsEnabled = editEvent.usesManualRegistrationPayments(),
        isQuoteConfirmed = confirmedInclusivePriceEditorKey == inclusivePriceEditorKey,
    )
    val effectiveIsValid = isValid && isInclusivePriceQuoteConfirmed
    LaunchedEffect(editEvent.id, divisionEditorBaseState) {
        divisionEditorDefaults = divisionEditorBaseState
        val editorIsIdle = divisionEditor.editingId.isNullOrBlank() &&
            divisionEditor.gender.isBlank() &&
            divisionEditor.skillDivisionTypeId.isBlank() &&
            divisionEditor.ageDivisionTypeId.isBlank() &&
            !divisionEditor.nameTouched
        if (editorIsIdle) {
            divisionEditor = divisionEditorBaseState
        }
    }
    val skillDivisionTypeSelectOptions = remember(
        divisionDetailsForSettings,
        divisionTypeParameters,
        editEvent.sportId,
    ) {
        buildSkillDivisionTypeOptions(
            existingDetails = divisionDetailsForSettings,
            skillDivisionTypes = divisionTypeParameters.skillsForSport(editEvent.sportId),
        )
    }
    val ageDivisionTypeSelectOptions = remember(
        divisionDetailsForSettings,
        divisionTypeParameters.ages,
    ) {
        buildAgeDivisionTypeOptions(
            existingDetails = divisionDetailsForSettings,
            ageDivisionTypes = divisionTypeParameters.ages,
        )
    }
    val genderSelectOptions = remember(
        divisionDetailsForSettings,
        divisionTypeParameters.genders,
    ) {
        buildGenderOptions(
            existingDetails = divisionDetailsForSettings,
            genderTypes = divisionTypeParameters.genders,
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
    fun divisionDefaultsFromEditor(editor: DivisionEditorState): DivisionEditorState {
        return divisionDefaultsFromSavedEditor(editor)
    }
    fun resetDivisionEditor() {
        divisionInstallmentDueDatePickerIndex = null
        divisionEditor = divisionEditorDefaults
    }
    fun normalizeLeagueConfigWithSportMode(config: LeagueConfig): LeagueConfig {
        val setCount = when (val setsPerMatch = config.setsPerMatch) {
            1, 3, 5 -> setsPerMatch
            else -> 1
        }
        return if (divisionScheduleUsesSets) {
            val points = config.pointsToVictory.take(setCount).toMutableList()
            while (points.size < setCount) {
                points.add(21)
            }
            config.copy(
                usesSets = true,
                matchDurationMinutes = null,
                setsPerMatch = setCount,
                pointsToVictory = points,
            )
        } else {
            config.copy(
                usesSets = false,
                setDurationMinutes = null,
                setsPerMatch = null,
                pointsToVictory = emptyList(),
            )
        }
    }
    fun updateDivisionLeagueConfig(updated: LeagueConfig) {
        val normalizedLeagueConfig = normalizeLeagueConfigWithSportMode(updated).copy(
            includePlayoffs = editEvent.includePlayoffs,
            playoffTeamCount = divisionEditor.playoffTeamCount,
        )
        val normalizedPlayoffConfig = if (editEvent.eventType == EventType.LEAGUE) {
            alignDivisionPlayoffConfigWithLeagueConfig(
                leagueConfig = normalizedLeagueConfig,
                playoffConfig = divisionEditor.playoffConfig,
            )
        } else {
            divisionEditor.playoffConfig
        }
        divisionEditor = divisionEditor.copy(
            leagueConfig = normalizedLeagueConfig,
            playoffConfig = normalizedPlayoffConfig,
            error = null,
        )
        if (editEvent.singleDivision && editEvent.eventType == EventType.LEAGUE) {
            onEditEvent {
                val withLeague = withLeagueConfig(normalizedLeagueConfig)
                withLeague.copy(
                    divisionDetails = divisionDetails.map { detail ->
                        detail.withLeagueConfig(normalizedLeagueConfig)
                            .withTournamentConfig(if (includePlayoffs) normalizedPlayoffConfig else null)
                    },
                )
            }
        }
        if (editEvent.singleDivision && editEvent.eventType == EventType.TOURNAMENT && editEvent.includePlayoffs) {
            onEditEvent {
                copy(
                    divisionDetails = divisionDetails.map { detail ->
                        detail.withLeagueConfig(normalizedLeagueConfig)
                    },
                )
            }
        }
    }
    fun updateDivisionPlayoffConfig(updated: TournamentConfig) {
        val normalizedPlayoffConfig = alignDivisionPlayoffConfigWithLeagueConfig(
            leagueConfig = divisionEditor.leagueConfig,
            playoffConfig = updated,
        )
        divisionEditor = divisionEditor.copy(
            playoffConfig = normalizedPlayoffConfig,
            error = null,
        )
        if (editEvent.singleDivision && editEvent.eventType == EventType.LEAGUE && editEvent.includePlayoffs) {
            onEditEvent {
                copy(
                    divisionDetails = divisionDetails.map { detail ->
                        detail.withTournamentConfig(normalizedPlayoffConfig)
                    },
                )
            }
        }
    }
    fun normalizeTournamentConfigWithEventMode(config: TournamentConfig): TournamentConfig {
        return if (divisionScheduleUsesSets) {
            config.copy(
                usesSets = true,
                matchDurationMinutes = null,
            )
        } else {
            config.copy(
                usesSets = false,
                setDurationMinutes = null,
                winnerSetCount = 1,
                loserSetCount = 1,
                winnerBracketPointsToVictory = config.winnerBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
                loserBracketPointsToVictory = config.loserBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
            )
        }
    }
    fun updateDivisionTournamentConfig(updated: TournamentConfig) {
        val normalizedTournamentConfig = normalizeTournamentConfigWithEventMode(updated)
        divisionEditor = divisionEditor.copy(
            playoffConfig = normalizedTournamentConfig,
            error = null,
        )
        if (editEvent.singleDivision && editEvent.eventType == EventType.TOURNAMENT) {
            onEditTournament {
                withTournamentConfig(normalizedTournamentConfig)
            }
        }
    }
    fun syncLeagueSlotsForSelectedDivisions(
        normalizedSelection: List<String>,
        splitByDivisionOverride: Boolean? = null,
    ) {
        if (
            (editEvent.eventType != EventType.LEAGUE &&
                editEvent.eventType != EventType.TOURNAMENT &&
                editEvent.eventType != EventType.WEEKLY_EVENT) ||
            leagueTimeSlots.isEmpty()
        ) {
            return
        }
        val splitSlotsByDivision = splitByDivisionOverride ?: splitByDivisionScheduling
        val selectedDivisionSet = normalizedSelection.toSet()
        leagueTimeSlots.forEachIndexed { index, slot ->
            val currentDivisions = slot.normalizedDivisionIds()
            val filteredDivisions = currentDivisions.filter(selectedDivisionSet::contains)
            val nextSlotDivisions = if (splitSlotsByDivision) {
                filteredDivisions.ifEmpty { normalizedSelection }
            } else {
                normalizedSelection
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
        val useRelativeDueDates = editEvent.eventType == EventType.WEEKLY_EVENT
        val nextAmounts = divisionEditor.installmentAmounts.toMutableList()
        val nextDueDates = divisionEditor.installmentDueDates.toMutableList()
        val nextRelativeDueDays = divisionEditor.installmentDueRelativeDays.toMutableList()
        while (nextAmounts.size < safeCount) {
            nextAmounts.add(0)
        }
        while (nextDueDates.size < safeCount) {
            nextDueDates.add("")
        }
        while (nextRelativeDueDays.size < safeCount) {
            nextRelativeDueDays.add(0)
        }
        if (nextAmounts.size > safeCount) {
            nextAmounts.subList(safeCount, nextAmounts.size).clear()
        }
        if (nextDueDates.size > safeCount) {
            nextDueDates.subList(safeCount, nextDueDates.size).clear()
        }
        if (nextRelativeDueDays.size > safeCount) {
            nextRelativeDueDays.subList(safeCount, nextRelativeDueDays.size).clear()
        }
        divisionEditor = divisionEditor.copy(
            installmentCount = safeCount,
            installmentAmounts = nextAmounts,
            installmentDueDates = if (useRelativeDueDates) emptyList() else nextDueDates,
            installmentDueRelativeDays = if (useRelativeDueDates) nextRelativeDueDays else emptyList(),
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
                installmentDueRelativeDays = emptyList(),
                error = null,
            )
            return
        }
        val useRelativeDueDates = editEvent.eventType == EventType.WEEKLY_EVENT
        val fallbackCount = maxOf(
            divisionEditor.installmentCount,
            divisionEditor.installmentAmounts.size,
            divisionEditor.installmentDueDates.size,
            divisionEditor.installmentDueRelativeDays.size,
            1,
        )
        val nextAmounts = divisionEditor.installmentAmounts.toMutableList()
        val nextDueDates = divisionEditor.installmentDueDates.toMutableList()
        val nextRelativeDueDays = divisionEditor.installmentDueRelativeDays.toMutableList()
        while (nextAmounts.size < fallbackCount) {
            nextAmounts.add(0)
        }
        while (nextDueDates.size < fallbackCount) {
            nextDueDates.add("")
        }
        while (nextRelativeDueDays.size < fallbackCount) {
            nextRelativeDueDays.add(0)
        }
        divisionEditor = divisionEditor.copy(
            allowPaymentPlans = true,
            installmentCount = fallbackCount,
            installmentAmounts = nextAmounts,
            installmentDueDates = if (useRelativeDueDates) emptyList() else nextDueDates,
            installmentDueRelativeDays = if (useRelativeDueDates) nextRelativeDueDays else emptyList(),
            error = null,
        )
    }
    fun updateDivisionInstallmentAmount(index: Int, amountCents: Int) {
        val normalizedCount = maxOf(
            divisionEditor.installmentCount,
            divisionEditor.installmentAmounts.size,
            divisionEditor.installmentDueDates.size,
            divisionEditor.installmentDueRelativeDays.size,
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
            installmentDueRelativeDays = if (editEvent.eventType == EventType.WEEKLY_EVENT) {
                List(normalizedCount) { dueIndex ->
                    divisionEditor.installmentDueRelativeDays.getOrNull(dueIndex) ?: 0
                }
            } else {
                emptyList()
            },
            error = null,
        )
    }
    fun updateDivisionInstallmentDueDate(index: Int, dueDate: String) {
        val normalizedCount = maxOf(
            divisionEditor.installmentCount,
            divisionEditor.installmentAmounts.size,
            divisionEditor.installmentDueDates.size,
            divisionEditor.installmentDueRelativeDays.size,
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
            installmentDueDates = if (editEvent.eventType == EventType.WEEKLY_EVENT) emptyList() else nextDueDates,
            installmentDueRelativeDays = if (editEvent.eventType == EventType.WEEKLY_EVENT) {
                List(normalizedCount) { dueIndex ->
                    divisionEditor.installmentDueRelativeDays.getOrNull(dueIndex) ?: 0
                }
            } else {
                emptyList()
            },
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
                divisionEditor.installmentDueRelativeDays.size,
            ) + 1,
        )
    }
    fun removeDivisionInstallmentRow(index: Int) {
        val nextAmounts = divisionEditor.installmentAmounts.toMutableList()
        val nextDueDates = divisionEditor.installmentDueDates.toMutableList()
        val nextRelativeDueDays = divisionEditor.installmentDueRelativeDays.toMutableList()
        if (index !in nextAmounts.indices) {
            return
        }
        nextAmounts.removeAt(index)
        if (index in nextDueDates.indices) nextDueDates.removeAt(index)
        if (index in nextRelativeDueDays.indices) nextRelativeDueDays.removeAt(index)
        val nextCount = maxOf(nextAmounts.size, nextDueDates.size, nextRelativeDueDays.size, 1)
        while (nextAmounts.size < nextCount) {
            nextAmounts.add(0)
        }
        while (nextDueDates.size < nextCount) {
            nextDueDates.add("")
        }
        while (nextRelativeDueDays.size < nextCount) {
            nextRelativeDueDays.add(0)
        }
        if (divisionInstallmentDueDatePickerIndex == index) {
            divisionInstallmentDueDatePickerIndex = null
        }
        divisionEditor = divisionEditor.copy(
            installmentCount = nextCount,
            installmentAmounts = nextAmounts,
            installmentDueDates = if (editEvent.eventType == EventType.WEEKLY_EVENT) emptyList() else nextDueDates,
            installmentDueRelativeDays = if (editEvent.eventType == EventType.WEEKLY_EVENT) {
                nextRelativeDueDays
            } else {
                emptyList()
            },
            error = null,
        )
    }
    fun handleSaveDivisionDetail() {
        if (!isInclusivePriceQuoteConfirmed) {
            divisionEditor = divisionEditor.copy(
                error = "Wait for the online price quote before saving this division.",
            )
            return
        }
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
            divisionRecordMatchesSelection(detail, divisionEditor.editingId)
        }
        val normalizedToken = buildDivisionToken(
            gender = normalizedGender,
            skillDivisionTypeId = normalizedSkillDivisionTypeId,
            ageDivisionTypeId = normalizedAgeDivisionTypeId,
        )
        val duplicateByIdentity = findDuplicateDivisionIdentity(
            existingDetails = divisionDetailsForSettings,
            divisionToken = normalizedToken,
            editingId = existingDetail?.id,
        )
        if (duplicateByIdentity != null) {
            divisionEditor = divisionEditor.copy(
                error = "A division with this gender, skill division, and age division already exists.",
            )
            return
        }
        val normalizedDivisionName = resolvedDivisionName.normalizeDivisionNameKey()
        val duplicateByName = divisionDetailsForSettings.firstOrNull { existing ->
            val isCurrent = existingDetail != null && divisionRecordMatchesSelection(existing, existingDetail.id)
            !isCurrent && existing.name.normalizeDivisionNameKey() == normalizedDivisionName
        }
        if (duplicateByName != null) {
            divisionEditor = divisionEditor.copy(
                error = "Division name must be unique within this event.",
            )
            return
        }
        val nextDivisionId = existingDetail?.id ?: buildUniqueDivisionIdForToken(
            eventId = editEvent.id,
            divisionToken = normalizedToken,
            existingDivisionIds = divisionDetailsForSettings.map { detail -> detail.id },
        )
        val normalizedPrice = if (editEvent.singleDivision) {
            editEvent.priceCents.coerceAtLeast(0)
        } else {
            divisionEditor.priceCents.coerceAtLeast(0)
        }
        val normalizedMaxParticipants = if (editEvent.singleDivision) {
            editEvent.maxParticipants.takeIf { value -> value >= 2 }
        } else {
            val maxParticipants = divisionEditor.maxParticipants
            if (maxParticipants == null || maxParticipants < 2) {
                divisionEditor = divisionEditor.copy(
                    error = "Division max teams must be at least 2.",
                )
                return
            }
            maxParticipants
        }
        val divisionPlayoffTeamCount = divisionEditor.playoffTeamCount
        val tournamentPoolPlayEnabled = editEvent.isTournamentPoolPlayEnabled()
        val divisionPoolCount = divisionEditor.poolCount
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
        if (tournamentPoolPlayEnabled) {
            if (normalizedMaxParticipants == null) {
                divisionEditor = divisionEditor.copy(
                    error = "Division max teams must be at least 2.",
                )
                return
            }
            if (divisionPoolCount == null || divisionPoolCount < 1) {
                divisionEditor = divisionEditor.copy(
                    error = "Pool count is required when pool play is enabled.",
                )
                return
            }
            if (divisionPlayoffTeamCount == null || divisionPlayoffTeamCount < 2) {
                divisionEditor = divisionEditor.copy(
                    error = "Bracket team count is required when pool play is enabled.",
                )
                return
            }
            if (normalizedMaxParticipants % divisionPoolCount != 0) {
                divisionEditor = divisionEditor.copy(
                    error = "Division max teams must divide evenly by pool count.",
                )
                return
            }
            if (divisionPlayoffTeamCount % divisionPoolCount != 0) {
                divisionEditor = divisionEditor.copy(
                    error = "Bracket team count must divide evenly by pool count.",
                )
                return
            }
        }
        val normalizedPlayoffTeamCount = when {
            !editEvent.includePlayoffs -> null
            editEvent.singleDivision -> editEvent.playoffTeamCount ?: divisionPlayoffTeamCount
            editEvent.eventType == EventType.LEAGUE -> divisionPlayoffTeamCount
            editEvent.eventType == EventType.TOURNAMENT -> divisionPlayoffTeamCount
            else -> divisionPlayoffTeamCount
        }
        val normalizedLeagueConfig = normalizeLeagueConfigWithSportMode(divisionEditor.leagueConfig).copy(
            includePlayoffs = editEvent.includePlayoffs,
            playoffTeamCount = normalizedPlayoffTeamCount,
        )
        val normalizedDivisionPlayoffConfig = if (
            editEvent.eventType == EventType.LEAGUE &&
            editEvent.includePlayoffs
        ) {
            alignDivisionPlayoffConfigWithLeagueConfig(
                leagueConfig = normalizedLeagueConfig,
                playoffConfig = divisionEditor.playoffConfig,
            )
        } else {
            null
        }
        val normalizedDivisionTournamentConfig = if (editEvent.eventType == EventType.TOURNAMENT) {
            normalizeTournamentConfigWithEventMode(divisionEditor.playoffConfig)
        } else {
            null
        }
        val defaultInstallmentAmounts = editEvent.installmentAmounts.map { amount ->
            amount.coerceAtLeast(0)
        }
        val defaultInstallmentDueDates = editEvent.installmentDueDates
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val defaultInstallmentDueRelativeDays = editEvent.installmentDueRelativeDays
        val useRelativeDueDates = editEvent.eventType == EventType.WEEKLY_EVENT
        val defaultInstallmentCount = maxOf(
            editEvent.installmentCount ?: 0,
            defaultInstallmentAmounts.size,
            if (useRelativeDueDates) defaultInstallmentDueRelativeDays.size else defaultInstallmentDueDates.size,
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
        val editorInstallmentDueRelativeDays = divisionEditor.installmentDueRelativeDays
        val editorInstallmentCount = maxOf(
            divisionEditor.installmentCount,
            editorInstallmentAmounts.size,
            if (useRelativeDueDates) editorInstallmentDueRelativeDays.size else editorInstallmentDueDates.size,
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
            if (useRelativeDueDates) {
                emptyList()
            } else if (editEvent.singleDivision) {
                defaultInstallmentDueDates
            } else {
                editorInstallmentDueDates
            }
        } else {
            emptyList()
        }
        val normalizedInstallmentDueRelativeDays = if (normalizedAllowPaymentPlans && useRelativeDueDates) {
            if (editEvent.singleDivision) {
                defaultInstallmentDueRelativeDays
            } else {
                editorInstallmentDueRelativeDays
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
            if (useRelativeDueDates && normalizedInstallmentDueRelativeDays.size != normalizedInstallmentCount) {
                divisionEditor = divisionEditor.copy(
                    error = "Installment count must match installment due offsets.",
                )
                return
            }
            if (!useRelativeDueDates && normalizedInstallmentDueDates.size != normalizedInstallmentCount) {
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
        var nextDetail = (existingDetail ?: DivisionDetail(id = nextDivisionId)).copy(
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
            poolCount = if (tournamentPoolPlayEnabled) divisionPoolCount else null,
            poolTeamCount = if (tournamentPoolPlayEnabled && normalizedMaxParticipants != null) {
                derivePoolTeamCount(
                    maxTeams = normalizedMaxParticipants,
                    poolCount = divisionPoolCount,
                )
            } else {
                null
            },
            allowPaymentPlans = normalizedAllowPaymentPlans,
            installmentCount = normalizedInstallmentCount,
            installmentDueDates = normalizedInstallmentDueDates,
            installmentDueRelativeDays = normalizedInstallmentDueRelativeDays,
            installmentAmounts = normalizedInstallmentAmounts,
        )
        if (editEvent.eventType == EventType.LEAGUE) {
            nextDetail = nextDetail
                .withLeagueConfig(normalizedLeagueConfig)
                .withTournamentConfig(normalizedDivisionPlayoffConfig)
        } else if (editEvent.eventType == EventType.TOURNAMENT) {
            nextDetail = nextDetail
                .withLeagueConfig(normalizedLeagueConfig)
                .withTournamentConfig(normalizedDivisionTournamentConfig)
        }
        val nextDivisionDetails = if (divisionEditor.editingId.isNullOrBlank()) {
            divisionDetailsForSettings + nextDetail
        } else {
            divisionDetailsForSettings.map { detail ->
                if (divisionRecordMatchesSelection(detail, divisionEditor.editingId)) nextDetail else detail
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
            val baseEvent = copy(
                priceCents = normalizedPrice,
                maxParticipants = normalizedMaxParticipants ?: 0,
                divisions = nextDivisionIds,
                divisionDetails = mergedDivisionDetails,
                playoffTeamCount = if (
                    (eventType == EventType.LEAGUE || eventType == EventType.TOURNAMENT) &&
                    includePlayoffs &&
                    singleDivision
                ) {
                    playoffTeamCount ?: mergedDivisionDetails.firstOrNull()?.playoffTeamCount
                } else {
                    playoffTeamCount
                },
            )
            when {
                eventType == EventType.LEAGUE && singleDivision -> baseEvent.withLeagueConfig(normalizedLeagueConfig)
                eventType == EventType.TOURNAMENT && singleDivision && normalizedDivisionTournamentConfig != null ->
                    baseEvent.withTournamentConfig(normalizedDivisionTournamentConfig)
                else -> baseEvent
            }
        }
        syncLeagueSlotsForSelectedDivisions(nextDivisionIds)
        val nextDefaults = divisionDefaultsFromEditor(
            divisionEditor.copy(
                priceCents = normalizedPrice,
                maxParticipants = normalizedMaxParticipants,
                playoffTeamCount = normalizedPlayoffTeamCount,
                poolCount = if (tournamentPoolPlayEnabled) divisionPoolCount else null,
                playoffConfig = normalizedDivisionTournamentConfig ?: normalizedDivisionPlayoffConfig
                    ?: divisionEditor.playoffConfig,
            ),
        )
        divisionEditorDefaults = nextDefaults
        divisionInstallmentDueDatePickerIndex = null
        divisionEditor = nextDefaults
    }
    fun handleEditDivisionDetail(divisionId: String) {
        val detail = divisionDetailsForSettings.firstOrNull { existing ->
            divisionRecordMatchesSelection(existing, divisionId)
        } ?: return
        val parsedToken = parseDivisionToken(detail)
        val scheduleConfigs = resolveDivisionEditorScheduleConfigs(
            event = editEvent,
            detail = detail,
        )
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
            maxParticipants = detail.maxParticipants
                ?: editEvent.maxParticipants.takeIf { value -> value >= 2 },
            playoffTeamCount = if (editEvent.singleDivision) {
                editEvent.playoffTeamCount ?: detail.playoffTeamCount
            } else {
                detail.playoffTeamCount
            },
            poolCount = detail.poolCount,
            allowPaymentPlans = detail.allowPaymentPlans == true,
            installmentCount = maxOf(
                detail.installmentCount ?: 0,
                detail.installmentAmounts.size,
                detail.installmentDueDates.size,
                detail.installmentDueRelativeDays.size,
            ).takeIf { count -> count > 0 } ?: 0,
            installmentDueDates = detail.installmentDueDates,
            installmentDueRelativeDays = detail.installmentDueRelativeDays,
            installmentAmounts = detail.installmentAmounts,
            leagueConfig = scheduleConfigs.leagueConfig,
            playoffConfig = scheduleConfigs.playoffConfig,
            nameTouched = true,
            error = null,
        )
        divisionInputsExpanded = true
    }
    fun handleRemoveDivisionDetail(divisionId: String) {
        val nextDivisionDetails = divisionDetailsForSettings.filterNot { existing ->
            divisionRecordMatchesSelection(existing, divisionId)
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
                    (eventType == EventType.LEAGUE || eventType == EventType.TOURNAMENT) &&
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
        if (!divisionEditor.editingId.isNullOrBlank() && divisionEditor.editingId == divisionId) {
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
    val hasRentalBackedSlots = remember(leagueTimeSlots) {
        leagueTimeSlots.any { slot -> slot.isRentalBacked() }
    }
    val hasAvailableRentalResources = availableRentalResources.isNotEmpty()
    val allowLockedSlotDivisionEdits = (scheduleTimeLocked || hasRentalBackedSlots) && splitByDivisionScheduling
    val allowLocalResourceCreationWithRentalResources = editEvent.eventType == EventType.LEAGUE ||
        editEvent.eventType == EventType.TOURNAMENT
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
        hasRentalBackedSlots,
        hasAvailableRentalResources,
        supportsOptionalManualTimeSlots,
        useManualTimeSlots,
    ) {
        when {
            hasRentalBackedSlots -> true
            hasAvailableRentalResources && editEvent.eventType == EventType.EVENT -> false
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
                splitByDivision = splitByDivisionScheduling,
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
        isInclusivePriceQuoteConfirmed,
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
        validationErrors = if (isInclusivePriceQuoteConfirmed) {
            result.validationErrors
        } else {
            result.validationErrors + "Wait for the online price quote before continuing."
        }
        isValid = result.isValid
    }

    LaunchedEffect(effectiveIsValid, validationErrors) {
        onValidationChange(effectiveIsValid, validationErrors)
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

    val startDateTime = remember(event.start, eventTimeZone) {
        event.start.toLocalDateTime(eventTimeZone)
    }
    val endDateTime = remember(event.end, eventTimeZone) {
        event.end.toLocalDateTime(eventTimeZone)
    }
    val evergreenDateText = remember(event.scheduleText, event.dateDisplayMode, event.dateDisplayText) {
        event.evergreenDateDisplayLabel()
    }
    val eventMetaLine = remember(event.location, startDateTime, evergreenDateText) {
        val dateText = startDateTime.date.format(dateFormat)
        val timeText = startDateTime.time.format(timeFormat)
        listOf(event.location, evergreenDateText ?: "$dateText - $timeText")
            .filter { it.isNotBlank() }
            .joinToString(" - ")
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
    val sportRequiredSectionEnabled = !isNewEvent || editEvent.sportId?.isNotBlank() == true
    fun showSelectSportMessage() {
        popupHandler.showPopup("Please select a sport.")
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
    val matchIncidentDefinitionsByCode = remember(resolvedMatchRules.incidentTypeDefinitions) {
        resolvedMatchRules.incidentTypeDefinitions.associateBy { definition ->
            definition.code.trim().uppercase()
        }
    }
    fun matchIncidentLabel(incidentType: String): String =
        matchIncidentDefinitionsByCode[incidentType.trim().uppercase()]?.label
            ?: matchIncidentTypeLabel(incidentType)
    val availableMatchIncidentTypes = remember(
        baseMatchRules.supportedIncidentTypes,
        resolvedMatchRules.supportedIncidentTypes,
        resolvedMatchRules.incidentTypeDefinitions,
        autoPointIncidentType,
    ) {
        (
            listOf("POINT", "DISCIPLINE", "NOTE", "ADMIN") +
                baseMatchRules.supportedIncidentTypes +
                resolvedMatchRules.supportedIncidentTypes +
                resolvedMatchRules.incidentTypeDefinitions.map { it.code } +
                autoPointIncidentType
            )
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
    }
    val selectedMatchIncidentTypes = remember(
        resolvedMatchRules.supportedIncidentTypes,
        editEvent.autoCreatePointMatchIncidents,
        autoPointIncidentType,
    ) {
        val normalizedAutoPointType = autoPointIncidentType.trim().uppercase()
        resolvedMatchRules.supportedIncidentTypes
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
            .filter { incidentType ->
                editEvent.autoCreatePointMatchIncidents || incidentType.uppercase() != normalizedAutoPointType
            }
    }
    val matchRulesSummary = remember(editEvent.autoCreatePointMatchIncidents, selectedMatchIncidentTypes) {
        val incidentMode = if (editEvent.autoCreatePointMatchIncidents) "Automatic incidents" else "Manual incidents"
        val typeCount = selectedMatchIncidentTypes.size
        "$incidentMode · $typeCount ${if (typeCount == 1) "type" else "types"}"
    }
    val matchIncidentOptions = remember(
        availableMatchIncidentTypes,
        resolvedMatchRules.incidentTypeDefinitions,
        editEvent.autoCreatePointMatchIncidents,
        autoPointIncidentType,
    ) {
        val normalizedAutoPointType = autoPointIncidentType.trim().uppercase()
        availableMatchIncidentTypes
            .filter { incidentType ->
                editEvent.autoCreatePointMatchIncidents || incidentType.trim().uppercase() != normalizedAutoPointType
            }
            .map { incidentType ->
                DropdownOption(
                    value = incidentType,
                    label = matchIncidentLabel(incidentType),
                )
            }
    }
    var customIncidentDraft by rememberSaveable(editEvent.id, editView) {
        mutableStateOf("")
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
    val readOnlyDateRows = remember(
        startDateTime,
        endDateTime,
        startDateLabel,
        endDateLabel,
        sameDayDateRange,
        evergreenDateText,
    ) {
        when {
            evergreenDateText != null -> listOf(
                DetailRowSpec(label = "Schedule", value = evergreenDateText),
            )
            sameDayDateRange -> listOf(
                DetailRowSpec(
                    label = "Start Date & Time",
                    value = startDateTime.format(dateTimeFormat),
                ),
                DetailRowSpec(
                    label = "End Time",
                    value = endDateTime.time.format(timeFormat),
                ),
            )
            else -> listOf(
                DetailRowSpec(label = "Start Date", value = startDateLabel),
                DetailRowSpec(label = "End Date", value = endDateLabel),
            )
        }
    }
    val basicDateSummary = remember(startDateLabel, endDateLabel, startDateTime, endDateTime, sameDayDateRange, evergreenDateText) {
        evergreenDateText ?: if (sameDayDateRange) {
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
    val teamCheckInModeOptions = remember {
        TeamCheckInMode.entries.map { mode ->
            DropdownOption(
                value = mode.name,
                label = when (mode) {
                    TeamCheckInMode.OFF -> "Off"
                    TeamCheckInMode.EVENT -> "Event check-in"
                    TeamCheckInMode.MATCH -> "Match check-in"
                },
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
    val priceSummary = remember(event.affiliateUrl, event.teamSignup, event.priceCents, event.divisions, event.divisionDetails) {
        val priceLabel = event.displayPriceRangeLabel()
        when {
            event.isAffiliateEvent() -> priceLabel
            event.teamSignup -> "$priceLabel / team"
            else -> "$priceLabel / player"
        }
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
    val supportsScheduleConfig = remember(
        editEvent.eventType,
        scheduleTimeLocked,
        hasRentalBackedSlots,
        hasAvailableRentalResources,
    ) {
        editEvent.eventType == EventType.LEAGUE ||
            editEvent.eventType == EventType.TOURNAMENT ||
            editEvent.eventType == EventType.WEEKLY_EVENT ||
            hasRentalBackedSlots ||
            hasAvailableRentalResources ||
            (scheduleTimeLocked && editEvent.eventType == EventType.EVENT)
    }
    val facilitiesSummaryLine = remember(
        facilitiesFieldCount,
        eventWithRelations.timeSlots,
        editEvent.eventType,
        scheduleTimeLocked,
        hasRentalBackedSlots,
        hasAvailableRentalResources,
    ) {
        val fieldSummary = "${facilitiesFieldCount.coerceAtLeast(0)} resources"
        val slotSummary = if (
            editEvent.eventType == EventType.LEAGUE ||
                editEvent.eventType == EventType.TOURNAMENT ||
                editEvent.eventType == EventType.WEEKLY_EVENT ||
                hasRentalBackedSlots ||
                hasAvailableRentalResources ||
                (scheduleTimeLocked && editEvent.eventType == EventType.EVENT)
        ) {
            "${eventWithRelations.timeSlots.size} slots"
        } else {
            null
        }
        listOfNotNull(fieldSummary, slotSummary).joinToString(" - ")
    }
    val showSectionMissingBadges = isNewEvent && editView && showValidationErrors
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
            !isTeamSizeValid,
            editEvent.eventType == EventType.LEAGUE && editEvent.singleDivision && !isLeaguePlayoffTeamsValid,
            editEvent.eventType == EventType.TOURNAMENT && editEvent.includePlayoffs && editEvent.singleDivision && !isLeaguePlayoffTeamsValid,
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
            editEvent.eventType == EventType.TOURNAMENT && editEvent.includePlayoffs && !editEvent.singleDivision && !isLeaguePlayoffTeamsValid,
        ).count { it }
    } else {
        0
    }
    val eventDetailsMode = remember(editView) {
        if (editView) EventDetailsMode.EDIT else EventDetailsMode.READ_ONLY
    }
    val showMatchRulesSection = remember(editEvent.eventType) {
        shouldShowMatchRulesSection(editEvent.eventType)
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
                title = "Divisions",
                summary = competitionSummaryLine,
            ),
            leagueScoring = ReadOnlySectionModel(
                sectionId = "league_scoring",
                title = if (editView) "League Scoring Config" else "League Scoring Rules",
                summary = "Scoring rules",
            ),
            schedule = ReadOnlySectionModel(
                sectionId = "facility_schedule",
                title = "Schedule",
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
                title = "Divisions",
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
                title = "Schedule",
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
    val stickyHeaderTopInset = maxOf(topInset, statusBarInset) + 6.dp
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
    val contentBackdropOffset by remember(lazyListState, heroSpacerHeightPx) {
        derivedStateOf {
            if (lazyListState.firstVisibleItemIndex == 0) {
                (heroSpacerHeightPx - lazyListState.firstVisibleItemScrollOffset.toFloat())
                    .coerceIn(0f, heroSpacerHeightPx)
            } else {
                0f
            }
        }
    }
    val displayImageId = remember(
        editView,
        event.imageId,
        editEvent.imageId,
        eventWithRelations.organization?.logoId,
    ) {
        val primaryImageId = if (editView) editEvent.imageId else event.imageId
        primaryImageId.trim()
            .ifBlank {
                if (editView) {
                    ""
                } else {
                    eventWithRelations.organization?.logoId?.trim().orEmpty()
                }
            }
    }
    val isUsingOrganizationLogoFallback = remember(
        editView,
        event.imageId,
        eventWithRelations.organization?.logoId,
        displayImageId,
    ) {
        !editView &&
            event.imageId.trim().isBlank() &&
            eventWithRelations.organization?.logoId?.trim()?.takeIf { it.isNotBlank() } == displayImageId
    }
    val heroImageUrl = remember(displayImageId, isUsingOrganizationLogoFallback) {
        displayImageId
            .takeIf(String::isNotBlank)
            ?.let { imageId ->
                if (isUsingOrganizationLogoFallback) {
                    getImageUrl(fileId = imageId, width = 1600, height = 1600)
                } else {
                    getImageUrl(fileId = imageId, width = 1600, height = 1600, trim = true)
                }
            }
            .orEmpty()
    }

    CompositionLocalProvider(localImageScheme provides imageScheme) {
        Box(modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(heroHeight)
                    .graphicsLayer(translationY = -heroParallaxOffset),
            ) {
                BackgroundImage(
                    modifier = Modifier.fillMaxSize(),
                    imageUrl = heroImageUrl,
                )
            }
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer(translationY = contentBackdropOffset)
                    .clip(
                        RoundedCornerShape(
                            topStart = roundedCornerSize,
                            topEnd = roundedCornerSize,
                        )
                    )
                    .background(MaterialTheme.colorScheme.surface)
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

                eventDetailsHeroSection(
                    state = EventDetailsHeroState(
                        editView = editView,
                        isNewEvent = isNewEvent,
                        showValidationErrors = showValidationErrors,
                        event = event,
                        editEvent = editEvent,
                        eventNameInput = eventNameInput,
                        isValid = effectiveIsValid,
                        isLocationValid = isLocationValid,
                        isColorLoaded = isColorLoaded,
                        heroSpacerHeight = heroSpacerHeight,
                        roundedCornerSize = roundedCornerSize,
                        eventMetaLine = eventMetaLine,
                        summaryTags = summaryTags,
                        registrationHoldExpiresAt = registrationHoldExpiresAt,
                    ),
                    actions = EventDetailsHeroActions(
                        onShowImageSelector = { showImageSelector = true },
                        onEventNameInputChange = { eventNameInput = it },
                        onOpenLocationMap = onOpenLocationMap,
                        onMapRevealCenterChange = onMapRevealCenterChange,
                        onRegistrationHoldExpired = onRegistrationHoldExpired,
                        joinButton = joinButton,
                    ),
                )

                eventDetailsBasicInfoSection(
                    state = EventDetailsBasicInfoState(
                        readOnlySection = readOnlyUiModel.basics,
                        editSection = editUiModel.basics,
                        sectionExpansionStates = sectionExpansionStates,
                        eventDetailsMode = eventDetailsMode,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
                        host = host,
                        organization = eventWithRelations.organization,
                        isOrganizationEvent = isOrganizationEvent,
                        fallbackHostDisplayName = hostDisplayName,
                        currentUserForHostActions = currentUserForHostActions,
                        readOnlyBasicsRows = readOnlyBasicsRows,
                        event = event,
                        editEvent = editEvent,
                        editEventTimeZone = editEventTimeZone,
                        sports = sports,
                        eventTagOptions = eventTagOptions,
                        isSportValid = isSportValid,
                        showValidationErrors = showValidationErrors,
                        scheduleTimeLocked = scheduleTimeLocked,
                        rentalTimeLocked = rentalTimeLocked,
                    ),
                    actions = EventDetailsBasicInfoActions(
                        readOnlyActions = readOnlyActions,
                        onEditEvent = onEditEvent,
                        onSportSelected = onSportSelected,
                        onShowStartPicker = { showStartPicker = true },
                        onShowEndPicker = { showEndPicker = true },
                    ),
                )

                eventDetailsRegistrationSection(
                    state = EventDetailsRegistrationState(
                        readOnlySection = readOnlyUiModel.registration,
                        editSection = editUiModel.registration,
                        sectionExpansionStates = sectionExpansionStates,
                        eventDetailsMode = eventDetailsMode,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
                        enabled = sportRequiredSectionEnabled,
                        isNewEvent = isNewEvent,
                        rentalTimeLocked = rentalTimeLocked,
                        event = event,
                        editEvent = editEvent,
                        divisionDetails = divisionDetailsForSettings,
                        priceSummary = priceSummary,
                        registrationSummary = registrationSummary,
                        refundSummary = refundSummary,
                        isTeamSizeValid = isTeamSizeValid,
                        showValidationErrors = showValidationErrors,
                        isOrganizationEvent = isOrganizationEvent,
                        organizationTemplatesLoading = organizationTemplatesLoading,
                        organizationTemplatesError = organizationTemplatesError,
                        requiredTemplateOptions = requiredTemplateOptions,
                        selectedRequiredTemplateIds = selectedRequiredTemplateIds,
                        selectedRequiredTemplateLabels = selectedRequiredTemplateLabels,
                        eventRegistrationQuestions = eventRegistrationQuestions,
                        eventRegistrationQuestionAnswers = eventRegistrationQuestionAnswers,
                        eventRegistrationQuestionsExpanded = eventRegistrationQuestionsExpanded,
                    ),
                    actions = EventDetailsRegistrationActions(
                        onDisabledClick = ::showSelectSportMessage,
                        onEditEvent = onEditEvent,
                        onEventTypeSelected = onEventTypeSelected,
                        onToggleEventRegistrationQuestions = onToggleEventRegistrationQuestions,
                        onEventRegistrationQuestionAnswerChange = onEventRegistrationQuestionAnswerChange,
                    ),
                )

                eventDetailsMatchRulesSection(
                    state = EventDetailsMatchRulesState(
                        readOnlySection = readOnlyUiModel.matchRules,
                        sectionExpansionStates = sectionExpansionStates,
                        eventDetailsMode = eventDetailsMode,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
                        enabled = sportRequiredSectionEnabled,
                        showSection = showMatchRulesSection,
                        event = event,
                        editEvent = editEvent,
                        baseMatchRules = baseMatchRules,
                        resolvedMatchRules = resolvedMatchRules,
                        selectedMatchIncidentTypes = selectedMatchIncidentTypes,
                        matchIncidentOptions = matchIncidentOptions,
                        autoPointIncidentType = autoPointIncidentType,
                        customIncidentDraft = customIncidentDraft,
                        matchIncidentLabel = ::matchIncidentLabel,
                    ),
                    actions = EventDetailsMatchRulesActions(
                        onDisabledClick = ::showSelectSportMessage,
                        onEditEvent = onEditEvent,
                        onCustomIncidentDraftChange = { customIncidentDraft = it },
                    ),
                )

                eventDetailsStaffSection(
                    state = EventDetailsStaffState(
                        readOnlySection = readOnlyUiModel.staff,
                        sectionExpansionStates = sectionExpansionStates,
                        eventDetailsMode = eventDetailsMode,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
                        enabled = sportRequiredSectionEnabled,
                        showOfficialsPanel = showOfficialsPanel,
                        event = event,
                        editEvent = editEvent,
                        resolvedHostDisplay = resolvedHostDisplay,
                        assistantHostIds = assistantHostIds,
                        officialPositionSummary = officialPositionSummary,
                        officialSchedulingModeOptions = officialSchedulingModeOptions,
                        teamCheckInModeOptions = teamCheckInModeOptions,
                        officialPositionsExpanded = officialPositionsExpanded,
                        canLoadOfficialPositionDefaults = selectedSportForOfficialDefaults != null,
                        staffSearchQuery = staffSearchQuery,
                        visibleUserSuggestions = visibleUserSuggestions,
                        staffInviteFirstName = staffInviteFirstName,
                        staffInviteLastName = staffInviteLastName,
                        staffInviteEmail = staffInviteEmail,
                        draftInviteOfficial = draftInviteOfficial,
                        draftInviteAssistantHost = draftInviteAssistantHost,
                        staffEditorError = staffEditorError,
                        assignedStaffExpanded = assignedStaffExpanded,
                        officialStaffCards = officialStaffCards,
                        hostStaffCards = hostStaffCards,
                        editableOfficialStaffListHeight = editableOfficialStaffListHeight,
                        editableHostStaffListHeight = editableHostStaffListHeight,
                        eventOfficialRecordsByUserId = eventOfficialRecordsByUserId,
                        officialPositionOptions = officialPositionOptions,
                    ),
                    actions = EventDetailsStaffActions(
                        onDisabledClick = ::showSelectSportMessage,
                        onUpdateDoTeamsOfficiate = onUpdateDoTeamsOfficiate,
                        onUpdateTeamOfficialsMaySwap = onUpdateTeamOfficialsMaySwap,
                        onUpdateTeamCheckInMode = onUpdateTeamCheckInMode,
                        onUpdateTeamCheckInOpenMinutesBefore = onUpdateTeamCheckInOpenMinutesBefore,
                        onUpdateAllowMatchRosterEdits = onUpdateAllowMatchRosterEdits,
                        onUpdateAllowTemporaryMatchPlayers = onUpdateAllowTemporaryMatchPlayers,
                        onUpdateOfficialSchedulingMode = onUpdateOfficialSchedulingMode,
                        onToggleOfficialPositionsExpanded = {
                            officialPositionsExpanded = !officialPositionsExpanded
                        },
                        onLoadOfficialPositionDefaults = onLoadOfficialPositionDefaults,
                        onAddOfficialPosition = onAddOfficialPosition,
                        onUpdateOfficialPositionName = onUpdateOfficialPositionName,
                        onUpdateOfficialPositionCount = onUpdateOfficialPositionCount,
                        onRemoveOfficialPosition = onRemoveOfficialPosition,
                        onStaffSearchQueryChange = { newValue ->
                            staffSearchQuery = newValue
                            staffEditorError = null
                            onSearchUsers(newValue)
                        },
                        onAddOfficialId = { userId ->
                            staffEditorError = null
                            onAddOfficialId(userId)
                        },
                        onAddAssistantHostId = { userId ->
                            staffEditorError = null
                            onUpdateAssistantHostIds(
                                (assistantHostIds + userId)
                                    .map(String::trim)
                                    .filter(String::isNotBlank)
                                    .distinct()
                                    .filterNot { existingUserId -> existingUserId == editEvent.hostId },
                            )
                        },
                        onStaffInviteFirstNameChange = { staffInviteFirstName = it },
                        onStaffInviteLastNameChange = { staffInviteLastName = it },
                        onStaffInviteEmailChange = { staffInviteEmail = it },
                        onDraftInviteOfficialChange = { draftInviteOfficial = it },
                        onDraftInviteAssistantHostChange = { draftInviteAssistantHost = it },
                        onAddEmailInvite = {
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
                        onToggleAssignedStaffExpanded = {
                            assignedStaffExpanded = !assignedStaffExpanded
                        },
                        onRemoveOfficialId = onRemoveOfficialId,
                        onRemoveAssistantHostId = { userId ->
                            onUpdateAssistantHostIds(
                                assistantHostIds.filterNot { existingId ->
                                    existingId == userId
                                },
                            )
                        },
                        onRemovePendingStaffInvite = onRemovePendingStaffInvite,
                        onUpdateOfficialUserPositions = onUpdateOfficialUserPositions,
                    ),
                )

                eventDetailsDivisionsSection(
                    state = EventDetailsDivisionsSectionState(
                        readOnlySection = readOnlyUiModel.divisions,
                        editSection = editUiModel.divisions,
                        sectionExpansionStates = sectionExpansionStates,
                        eventDetailsMode = eventDetailsMode,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
                        enabled = sportRequiredSectionEnabled,
                        editView = editView,
                        event = event,
                        teamsCount = teamsCount,
                        freeAgentCount = freeAgentCount,
                    ),
                    actions = EventDetailsDivisionsSectionActions(
                        onDisabledClick = ::showSelectSportMessage,
                    ),
                    editContent = {
                        EventDetailsDivisionEditorForm(
                            state = EventDetailsDivisionEditorFormState(
                                editEvent = editEvent,
                                divisionDetails = divisionDetailsForSettings,
                                selectedDivisions = selectedDivisions,
                                divisionEditor = divisionEditor,
                                divisionEditorDefaults = divisionEditorDefaults,
                                divisionEditorReady = divisionEditorReady,
                                divisionScheduleUsesSets = divisionScheduleUsesSets,
                                skillDivisionTypeOptions = skillDivisionTypeSelectOptions,
                                ageDivisionTypeOptions = ageDivisionTypeSelectOptions,
                                genderOptions = genderSelectOptions,
                                divisionInputsExpanded = divisionInputsExpanded,
                                hostHasAccount = hostHasAccount,
                                isNewEvent = isNewEvent,
                                showValidationErrors = showValidationErrors,
                                addSelfToEvent = addSelfToEvent,
                                inclusivePriceEditorKey = inclusivePriceEditorKey,
                            ),
                            actions = EventDetailsDivisionEditorFormActions(
                                onEditEvent = onEditEvent,
                                onDivisionEditorChange = { divisionEditor = it },
                                onDivisionEditorDefaultsChange = { divisionEditorDefaults = it },
                                onUpdateDivisionEditorSelection = ::updateDivisionEditorSelection,
                                onNormalizeLeagueConfigWithSportMode = ::normalizeLeagueConfigWithSportMode,
                                onUpdateDivisionLeagueConfig = ::updateDivisionLeagueConfig,
                                onUpdateDivisionPlayoffConfig = ::updateDivisionPlayoffConfig,
                                onUpdateDivisionTournamentConfig = ::updateDivisionTournamentConfig,
                                onSyncLeagueSlotsForSelectedDivisions = ::syncLeagueSlotsForSelectedDivisions,
                                onSetDivisionPaymentPlansEnabled = ::setDivisionPaymentPlansEnabled,
                                onSyncDivisionInstallmentCount = ::syncDivisionInstallmentCount,
                                onUpdateDivisionInstallmentAmount = ::updateDivisionInstallmentAmount,
                                onSetDivisionInstallmentDueDatePickerIndex = { divisionInstallmentDueDatePickerIndex = it },
                                onAddDivisionInstallmentRow = ::addDivisionInstallmentRow,
                                onRemoveDivisionInstallmentRow = ::removeDivisionInstallmentRow,
                                onAddSelfToEventChange = { addSelfToEvent = it },
                                onAddCurrentUser = onAddCurrentUser,
                                onDivisionInputsExpandedChange = { divisionInputsExpanded = it },
                                quoteInclusivePrice = quoteInclusivePrice,
                                onPriceQuoteConfirmationChange = { isConfirmed ->
                                    if (isConfirmed) {
                                        confirmedInclusivePriceEditorKey = inclusivePriceEditorKey
                                    } else if (confirmedInclusivePriceEditorKey == inclusivePriceEditorKey) {
                                        confirmedInclusivePriceEditorKey = null
                                    }
                                    if (!isConfirmed) {
                                        onValidationChange(
                                            false,
                                            (validationErrors +
                                                "Wait for the online price quote before continuing.").distinct(),
                                        )
                                    }
                                },
                            ),
                        )

                    EventDetailsDivisionEditorActionsContent(
                        state = EventDetailsDivisionEditorActionsState(
                            editEvent = editEvent,
                            divisionEditor = divisionEditor,
                            divisionEditorReady = divisionEditorReady,
                            isSkillLevelValid = isSkillLevelValid,
                            isLeaguePlayoffTeamsValid = isLeaguePlayoffTeamsValid,
                            showValidationErrors = showValidationErrors,
                            divisionDetails = divisionDetailsForSettings,
                            isPriceQuoteConfirmed = isInclusivePriceQuoteConfirmed,
                        ),
                        actions = EventDetailsDivisionEditorActions(
                            onDivisionEditorChange = { divisionEditor = it },
                            onSaveDivision = ::handleSaveDivisionDetail,
                            onResetDivisionEditor = ::resetDivisionEditor,
                            onEditDivision = ::handleEditDivisionDetail,
                            onRemoveDivision = ::handleRemoveDivisionDetail,
                        ),
                    )
                    },
                )

                eventDetailsLeagueScoringSection(
                    state = EventDetailsLeagueScoringState(
                        readOnlySection = readOnlyUiModel.leagueScoring,
                        editSection = editUiModel.leagueScoring,
                        sectionExpansionStates = sectionExpansionStates,
                        eventDetailsMode = eventDetailsMode,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
                        enabled = sportRequiredSectionEnabled,
                        editEvent = editEvent,
                        sports = sports,
                        leagueScoringConfig = leagueScoringConfig,
                    ),
                    actions = EventDetailsLeagueScoringActions(
                        onDisabledClick = ::showSelectSportMessage,
                        onConfigChange = onLeagueScoringConfigChange,
                    ),
                )

                eventDetailsScheduleSection(
                    state = EventDetailsScheduleState(
                        readOnlySection = readOnlyUiModel.schedule,
                        editSection = editUiModel.schedule,
                        sectionExpansionStates = sectionExpansionStates,
                        eventDetailsMode = eventDetailsMode,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
                        enabled = sportRequiredSectionEnabled,
                        supportsScheduleConfig = supportsScheduleConfig,
                        event = event,
                        editEvent = editEvent,
                        readOnlyFieldCount = readOnlyFieldCount,
                        timeSlots = eventWithRelations.timeSlots,
                        fieldsById = fieldsById,
                        divisionDetails = divisionDetailsForSettings,
                        fallbackDivisionIds = normalizedEventDivisions,
                        fieldCount = fieldCount,
                        fields = editableFields,
                        leagueTimeSlots = leagueTimeSlots,
                        availableRentalResources = availableRentalResources,
                        selectedRentalResourceIds = selectedRentalResourceIds,
                        eventTimeZone = editEventTimeZone,
                        slotErrors = leagueSlotErrors,
                        slotEditorEnabled = slotEditorEnabled,
                        showUseManualTimeSlotsToggle = supportsOptionalManualTimeSlots,
                        useManualTimeSlots = useManualTimeSlots,
                        slotDivisionOptions = slotDivisionOptions,
                        showSlotDivisions = splitByDivisionScheduling,
                        allowDivisionEditsWhenReadOnly = allowLockedSlotDivisionEdits,
                        allowLocalResourceCreationWithRentalResources = allowLocalResourceCreationWithRentalResources,
                        isFieldCountValid = isFieldCountValid,
                        isLeagueSlotsValid = isLeagueSlotsValid,
                        showValidationErrors = showValidationErrors,
                        scheduleTimeLocked = scheduleTimeLocked,
                    ),
                    actions = EventDetailsScheduleActions(
                        onDisabledClick = ::showSelectSportMessage,
                        onRentalResourceSelectionChange = onRentalResourceSelectionChange,
                        onFieldCountChange = { count ->
                            fieldCount = count
                            onSelectFieldCount(count)
                        },
                        onFieldNameChange = onUpdateLocalFieldName,
                        onAddSlot = onAddLeagueTimeSlot,
                        onUpdateSlot = onUpdateLeagueTimeSlot,
                        onRemoveSlot = onRemoveLeagueTimeSlot,
                        onUseManualTimeSlotsChange = onUseManualTimeSlotsChange,
                    ),
                )

            }
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .zIndex(2f),
            ) {
                heroTopControls()
            }
        }
    }
    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            val selected = selectedInstant?.reinterpretSystemLocalSelectionIn(editEventTimeZone)
                ?: return@PlatformDateTimePicker
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
        initialDate = editEvent.start.asSystemLocalPickerInstant(editEventTimeZone),
    )

    PlatformDateTimePicker(
        onDateSelected = { selectedInstant ->
            val selected = selectedInstant?.reinterpretSystemLocalSelectionIn(editEventTimeZone)
                ?: return@PlatformDateTimePicker
            onEditEvent { copy(end = selected) }
            showEndPicker = false
        },
        onDismissRequest = { showEndPicker = false },
        showPicker = showEndPicker && !scheduleTimeLocked && !editEvent.noFixedEndDateTime,
        getTime = true,
        canSelectPast = false,
        initialDate = editEvent.end.asSystemLocalPickerInstant(editEventTimeZone),
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

    LaunchedEffect(eventImagePicker.result) {
        when (val outcome = resolveEventImagePickerOutcome(eventImagePicker.result)) {
            EventImagePickerOutcome.Ignore -> Unit
            is EventImagePickerOutcome.Upload -> {
                eventImagePicker.reset()
                onUploadSelected(
                    outcome.photo,
                    launchEventImagePicker,
                )
            }
            is EventImagePickerOutcome.Failure -> {
                eventImagePicker.reset()
                popupHandler.showPopup(
                    eventImageRetryError(
                        message = outcome.message,
                        onRetry = launchEventImagePicker,
                    ),
                )
            }
        }
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
        val imageUrl = Url(getImageUrl(fileId = imageId, width = 1600, trim = true))
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
                    initialSelectedImageId = editEvent.imageId,
                    onUploadSelected = launchEventImagePicker,
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
                            onDeleteImage(deleteImage) {
                                onEditEvent { copy(imageId = "") }
                            }
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
