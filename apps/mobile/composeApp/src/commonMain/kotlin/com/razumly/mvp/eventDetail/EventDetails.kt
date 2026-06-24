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
import com.razumly.mvp.core.data.dataTypes.MatchIncidentTypeDefinitionMVP
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.LeagueConfig
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.MatchTimekeepingConfigMVP
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.divisionPriceRangeLabel
import com.razumly.mvp.core.data.dataTypes.label
import com.razumly.mvp.core.data.dataTypes.officialPositionSummary
import com.razumly.mvp.core.data.dataTypes.positionSummary
import com.razumly.mvp.core.data.dataTypes.toLeagueConfig
import com.razumly.mvp.core.data.dataTypes.toTournamentConfig
import com.razumly.mvp.core.data.dataTypes.usesTeamOfficialScheduling
import com.razumly.mvp.core.data.dataTypes.withLeagueConfig
import com.razumly.mvp.core.data.dataTypes.withTournamentConfig
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.dataTypes.skillsForSport
import com.razumly.mvp.core.data.dataTypes.enums.EventType
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
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
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
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.toEnumTitleCase
import com.razumly.mvp.core.presentation.util.toNameCase
import com.razumly.mvp.core.presentation.util.teamSizeFormat
import com.razumly.mvp.core.presentation.util.timeFormat
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.presentation.util.transitionSpec
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.core.util.resolvedTimeZone
import com.razumly.mvp.eventDetail.composables.CancellationRefundOptions
import com.razumly.mvp.eventDetail.composables.LeagueConfigurationFields
import com.razumly.mvp.eventDetail.composables.LeaguePlayoffConfigurationFields
import com.razumly.mvp.eventDetail.composables.LeagueScoringConfigFields
import com.razumly.mvp.eventDetail.composables.LeagueScheduleFields
import com.razumly.mvp.eventDetail.composables.NumberInputField
import com.razumly.mvp.eventDetail.composables.RegistrationOptions
import com.razumly.mvp.eventDetail.composables.SelectEventImage
import com.razumly.mvp.eventDetail.composables.TextInputField
import com.razumly.mvp.eventDetail.composables.TournamentConfigurationFields
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
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.format
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.enter_value
import org.jetbrains.compose.resources.stringResource
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.math.roundToInt

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
private const val DEFAULT_MVP_FEE_PERCENTAGE = 0.01
private const val LEAGUE_OR_TOURNAMENT_MVP_FEE_PERCENTAGE = 0.03

private fun customIncidentCodeFromLabel(label: String): String =
    label.trim()
        .uppercase()
        .replace(Regex("[^A-Z0-9]+"), "_")
        .trim('_')

private fun customIncidentDefinition(label: String): MatchIncidentTypeDefinitionMVP? {
    val trimmed = label.trim()
    val code = customIncidentCodeFromLabel(trimmed)
    if (trimmed.isBlank() || code.isBlank()) return null
    return MatchIncidentTypeDefinitionMVP(
        code = code,
        label = trimmed,
        kind = "DISCIPLINE",
        requiresTeam = true,
        requiresParticipant = false,
        defaultEnabled = true,
    )
}

private fun retainedCustomIncidentDefinitions(
    selected: List<String>,
    definitions: List<MatchIncidentTypeDefinitionMVP>,
    baseDefinitions: List<MatchIncidentTypeDefinitionMVP>,
): List<MatchIncidentTypeDefinitionMVP>? {
    val selectedCodes = selected.map { it.trim().uppercase() }.filter(String::isNotBlank).toSet()
    val baseCodes = baseDefinitions.map { it.code.trim().uppercase() }.filter(String::isNotBlank).toSet()
    val retained = definitions
        .mapNotNull { definition ->
            val code = definition.code.trim().uppercase()
            if (code.isBlank() || code !in selectedCodes || code in baseCodes) {
                null
            } else {
                definition.copy(code = code)
            }
        }
        .distinctBy { it.code }
    return retained.takeIf { it.isNotEmpty() }
}
private val readOnlyNameListItemHeight = 28.dp
private val readOnlyNameListSpacing = 4.dp
private val editableOfficialStaffListHeight = 160.dp * STAFF_LAZY_LIST_VISIBLE_COUNT
private val editableHostStaffListHeight = 130.dp * STAFF_LAZY_LIST_VISIBLE_COUNT

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
    rentalTimeLocked: Boolean = false,
    onHostCreateAccount: () -> Unit,
    onOpenLocationMap: () -> Unit,
    onPlaceSelected: (MVPPlace?) -> Unit,
    onEditEvent: (Event.() -> Event) -> Unit,
    onEditTournament: (Event.() -> Event) -> Unit,
    onAddCurrentUser: (Boolean) -> Unit,
    onEventTypeSelected: (EventType) -> Unit,
    sports: List<Sport> = emptyList(),
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
    var showUploadImagePicker by rememberSaveable { mutableStateOf(false) }
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
    val selectedUsersById = remember { mutableStateMapOf<String, UserData>() }
    var staffSearchQuery by rememberSaveable { mutableStateOf("") }
    var staffInviteFirstName by rememberSaveable { mutableStateOf("") }
    var staffInviteLastName by rememberSaveable { mutableStateOf("") }
    var staffInviteEmail by rememberSaveable { mutableStateOf("") }
    var draftInviteOfficial by rememberSaveable { mutableStateOf(false) }
    var draftInviteAssistantHost by rememberSaveable { mutableStateOf(false) }
    var staffEditorError by remember { mutableStateOf<String?>(null) }
    var pricePreviewBreakdown by remember { mutableStateOf<PricePreviewBreakdown?>(null) }
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
    fun alignPlayoffConfigWithLeagueConfig(
        leagueConfig: LeagueConfig,
        playoffConfig: TournamentConfig,
    ): TournamentConfig {
        return if (leagueConfig.usesSets) {
            playoffConfig.copy(
                usesSets = true,
                matchDurationMinutes = null,
                setDurationMinutes = playoffConfig.setDurationMinutes ?: leagueConfig.setDurationMinutes,
            )
        } else {
            playoffConfig.copy(
                usesSets = false,
                matchDurationMinutes = playoffConfig.matchDurationMinutes,
                setDurationMinutes = null,
                winnerSetCount = 1,
                loserSetCount = 1,
                winnerBracketPointsToVictory = playoffConfig.winnerBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
                loserBracketPointsToVictory = playoffConfig.loserBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
            )
        }
    }
    fun normalizeLeagueConfigWithSportMode(config: LeagueConfig): LeagueConfig {
        val setCount = when (config.setsPerMatch) {
            1, 3, 5 -> config.setsPerMatch
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
            alignPlayoffConfigWithLeagueConfig(
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
        val normalizedPlayoffConfig = alignPlayoffConfigWithLeagueConfig(
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
    fun applySingleDivisionDefaultsToDetails(
        details: List<DivisionDetail>,
        defaultPriceCents: Int,
        defaultMaxParticipants: Int,
        defaultPlayoffTeamCount: Int?,
        defaultPoolCount: Int? = null,
    ): List<DivisionDetail> {
        val normalizedPriceCents = defaultPriceCents.coerceAtLeast(0)
        val normalizedMaxParticipants = defaultMaxParticipants.takeIf { value -> value >= 2 }
        val normalizedPoolCount = defaultPoolCount?.takeIf { value -> value >= 1 }
        return details.map { detail ->
            detail.copy(
                price = normalizedPriceCents,
                maxParticipants = normalizedMaxParticipants,
                playoffTeamCount = defaultPlayoffTeamCount,
                poolCount = normalizedPoolCount ?: detail.poolCount,
                poolTeamCount = if (normalizedPoolCount != null && normalizedMaxParticipants != null) {
                    derivePoolTeamCount(
                        maxTeams = normalizedMaxParticipants,
                        poolCount = normalizedPoolCount,
                    )
                } else {
                    detail.poolTeamCount
                },
            )
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
            alignPlayoffConfigWithLeagueConfig(
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
        val detailLeagueConfig = detail.toLeagueConfig(editEvent.toLeagueConfig())
        val detailPlayoffConfig = alignPlayoffConfigWithLeagueConfig(
            leagueConfig = detailLeagueConfig,
            playoffConfig = detail.toTournamentConfig(editEvent.toTournamentConfig()),
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
            leagueConfig = detailLeagueConfig,
            playoffConfig = detailPlayoffConfig,
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

                eventDetailsHeroSection(
                    state = EventDetailsHeroState(
                        editView = editView,
                        isNewEvent = isNewEvent,
                        event = event,
                        editEvent = editEvent,
                        eventNameInput = eventNameInput,
                        isValid = isValid,
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
                        isSportValid = isSportValid,
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

                animatedCardSection(
                    sectionId = readOnlyUiModel.registration.sectionId,
                    sectionExpansionStates = sectionExpansionStates,
                    sectionTitle = readOnlyUiModel.registration.title,
                    collapsibleInEditMode = true,
                    collapsibleInViewMode = true,
                    viewSummary = readOnlyUiModel.registration.summary,
                    requiredMissingCount = editUiModel.registration.requiredMissingCount,
                    enabled = sportRequiredSectionEnabled,
                    onDisabledClick = ::showSelectSportMessage,
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
                        EventRegistrationQuestionsSection(
                            questions = eventRegistrationQuestions,
                            answers = eventRegistrationQuestionAnswers,
                            expanded = eventRegistrationQuestionsExpanded,
                            onToggleExpanded = onToggleEventRegistrationQuestions,
                            onAnswerChange = onEventRegistrationQuestionAnswerChange,
                        )
                    },
                    editContent = {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
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
                                modifier = Modifier.weight(1f),
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
                        val playoffsOrPoolsInput: @Composable () -> Unit = {
                            if (editEvent.eventType == EventType.LEAGUE) {
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
                            } else if (editEvent.eventType == EventType.TOURNAMENT) {
                                LabeledCheckboxRow(
                                    checked = editEvent.includePlayoffs,
                                    label = "Include Pool Play",
                                    onCheckedChange = { checked ->
                                        onEditEvent {
                                            val nextDivisionDetails = mergeDivisionDetailsForDivisions(
                                                divisions = divisions,
                                                existingDetails = divisionDetails,
                                                eventId = id,
                                            ).map { detail ->
                                                if (checked) {
                                                    detail.withDerivedTournamentPoolTeamCount(enabled = true)
                                                } else {
                                                    detail.copy(
                                                        playoffTeamCount = null,
                                                        poolCount = null,
                                                        poolTeamCount = null,
                                                    )
                                                }
                                            }
                                            copy(
                                                includePlayoffs = checked,
                                                playoffTeamCount = if (checked) playoffTeamCount else null,
                                                divisionDetails = nextDivisionDetails,
                                            )
                                        }
                                    },
                                )
                            }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Box(modifier = Modifier.weight(1f)) {
                                playoffsOrPoolsInput()
                            }
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

                        val automaticRefundsEnabled = if (editEvent.singleDivision) {
                            editEvent.priceCents > 0
                        } else {
                            divisionDetailsForSettings.any { detail -> (detail.price ?: 0) > 0 }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            RegistrationOptions(
                                cutoffHours = editEvent.registrationCutoffHours,
                                onCutoffHoursChange = {
                                    onEditEvent { copy(registrationCutoffHours = it) }
                                },
                                modifier = Modifier.weight(1f),
                            )
                            CancellationRefundOptions(
                                refundHours = editEvent.cancellationRefundHours,
                                onRefundHoursChange = {
                                    onEditEvent { copy(cancellationRefundHours = it) }
                                },
                                modifier = Modifier.weight(1f),
                                enabled = automaticRefundsEnabled,
                                disabledMessage = "Add a paid division to enable automatic refunds.",
                            )
                        }
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

                    },
                )

                if (showMatchRulesSection) {
                    animatedCardSection(
                        sectionId = readOnlyUiModel.matchRules.sectionId,
                        sectionExpansionStates = sectionExpansionStates,
                        sectionTitle = readOnlyUiModel.matchRules.title,
                        collapsibleInEditMode = true,
                        collapsibleInViewMode = true,
                        viewSummary = readOnlyUiModel.matchRules.summary,
                        enabled = sportRequiredSectionEnabled,
                        onDisabledClick = ::showSelectSportMessage,
                        isEditMode = eventDetailsMode == EventDetailsMode.EDIT,
                        lazyListState = lazyListState,
                        stickyHeaderTopInset = stickyHeaderTopInset,
                        animationDelay = 250,
                        viewContent = {
                            DetailKeyValueList(
                                rows = buildList {
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
                                    if (resolvedMatchRules.timekeeping.timerMode != "NONE") {
                                        add(
                                            DetailRowSpec(
                                                "${resolvedMatchRules.segmentLabel} length",
                                                "${resolvedMatchRules.timekeeping.segmentDurationMinutes ?: 0} minutes",
                                            ),
                                        )
                                        if (resolvedMatchRules.timekeeping.canUseAddedTime) {
                                            add(
                                                DetailRowSpec(
                                                    "Added time",
                                                    if (resolvedMatchRules.timekeeping.addedTimeEnabled) "Yes" else "No",
                                                ),
                                            )
                                        }
                                    }
                                    add(
                                        DetailRowSpec(
                                            "Create a scoring incident for each point / goal",
                                            if (event.autoCreatePointMatchIncidents) "Yes" else "No",
                                        ),
                                    )
                                    if (selectedMatchIncidentTypes.isNotEmpty()) {
                                        add(
                                            DetailRowSpec(
                                                "Incident types",
                                                selectedMatchIncidentTypes.joinToString(", ") { incidentType ->
                                                    matchIncidentLabel(incidentType)
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
                                text = "The sport defines the match format. This event can adjust supported result paths and incident capture without changing the sport default.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(localImageScheme.current.onSurfaceVariant),
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
                                if (baseMatchRules.timekeeping.timerMode != "NONE") {
                                    NumberInputField(
                                        modifier = Modifier.fillMaxWidth(),
                                        value = resolvedMatchRules.timekeeping.segmentDurationMinutes
                                            ?.toString()
                                            .orEmpty(),
                                        label = "${resolvedMatchRules.segmentLabel} length",
                                        isError = false,
                                        onValueChange = { value ->
                                            if (value.isNotEmpty() && !value.all { it.isDigit() }) {
                                                return@NumberInputField
                                            }
                                            val parsedDuration = value.toIntOrNull()?.takeIf { it > 0 }
                                            val durationOverride = parsedDuration
                                                ?.takeUnless { it == baseMatchRules.timekeeping.segmentDurationMinutes }
                                            val nextTimekeeping = (editEvent.matchRulesOverride?.timekeeping ?: MatchTimekeepingConfigMVP()).copy(
                                                segmentDurationMinutes = durationOverride,
                                            )
                                            val totalDuration = parsedDuration
                                                ?.let { duration -> duration * resolvedMatchRules.segmentCount.coerceAtLeast(1) }
                                            onEditEvent {
                                                copy(
                                                    usesSets = false,
                                                    setDurationMinutes = null,
                                                    matchDurationMinutes = totalDuration ?: matchDurationMinutes,
                                                    matchRulesOverride = copyMatchRulesOverride(
                                                        current = matchRulesOverride,
                                                        timekeeping = nextTimekeeping,
                                                    ),
                                                )
                                            }
                                        },
                                    )
                                    if (baseMatchRules.timekeeping.canUseAddedTime) {
                                        LabeledCheckboxRow(
                                            checked = resolvedMatchRules.timekeeping.addedTimeEnabled,
                                            label = "Allow added time",
                                            onCheckedChange = { checked ->
                                                val addedTimeOverride = checked.takeUnless { it == baseMatchRules.timekeeping.addedTimeEnabled }
                                                val nextTimekeeping = (editEvent.matchRulesOverride?.timekeeping ?: MatchTimekeepingConfigMVP()).copy(
                                                    addedTimeEnabled = addedTimeOverride,
                                                    stopAtRegulationEnd = addedTimeOverride?.not(),
                                                )
                                                onEditEvent {
                                                    copy(
                                                        matchRulesOverride = copyMatchRulesOverride(
                                                            current = matchRulesOverride,
                                                            timekeeping = nextTimekeeping,
                                                        ),
                                                    )
                                                }
                                            },
                                        )
                                    }
                                }
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
                                    val retainedDefinitions = retainedCustomIncidentDefinitions(
                                        selected = enforcedIncidentTypes,
                                        definitions = editEvent.matchRulesOverride?.incidentTypeDefinitions.orEmpty(),
                                        baseDefinitions = baseMatchRules.incidentTypeDefinitions,
                                    )
                                    onEditEvent {
                                        copy(
                                            matchRulesOverride = copyMatchRulesOverride(
                                                current = matchRulesOverride,
                                                supportedIncidentTypes = incidentOverride,
                                                incidentTypeDefinitions = retainedDefinitions,
                                            ),
                                        )
                                    }
                                },
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.Top,
                            ) {
                                StandardTextField(
                                    value = customIncidentDraft,
                                    onValueChange = { customIncidentDraft = it },
                                    modifier = Modifier.weight(1f),
                                    label = "Custom incident type",
                                    placeholder = "Blue card",
                                    imeAction = androidx.compose.ui.text.input.ImeAction.Done,
                                    onImeAction = {
                                        val definition = customIncidentDefinition(customIncidentDraft)
                                        if (definition != null) {
                                            val nextSelectedIncidentTypes = enforceAutoPointIncidentType(
                                                selected = selectedMatchIncidentTypes + definition.code,
                                                autoPointIncidentType = autoPointIncidentType,
                                                enabled = editEvent.autoCreatePointMatchIncidents,
                                            )
                                            val incidentOverride = supportedIncidentTypesOverrideOrNull(
                                                selected = nextSelectedIncidentTypes,
                                                defaults = baseMatchRules.supportedIncidentTypes,
                                            )
                                            val nextDefinitions = retainedCustomIncidentDefinitions(
                                                selected = nextSelectedIncidentTypes,
                                                definitions = editEvent.matchRulesOverride?.incidentTypeDefinitions.orEmpty()
                                                    .filterNot { existing -> existing.code.trim().uppercase() == definition.code }
                                                    + definition,
                                                baseDefinitions = baseMatchRules.incidentTypeDefinitions,
                                            )
                                            onEditEvent {
                                                copy(
                                                    matchRulesOverride = copyMatchRulesOverride(
                                                        current = matchRulesOverride,
                                                        supportedIncidentTypes = incidentOverride,
                                                        incidentTypeDefinitions = nextDefinitions,
                                                    ),
                                                )
                                            }
                                            customIncidentDraft = ""
                                        }
                                    },
                                )
                                Button(
                                    onClick = {
                                        val definition = customIncidentDefinition(customIncidentDraft) ?: return@Button
                                        val nextSelectedIncidentTypes = enforceAutoPointIncidentType(
                                            selected = selectedMatchIncidentTypes + definition.code,
                                            autoPointIncidentType = autoPointIncidentType,
                                            enabled = editEvent.autoCreatePointMatchIncidents,
                                        )
                                        val incidentOverride = supportedIncidentTypesOverrideOrNull(
                                            selected = nextSelectedIncidentTypes,
                                            defaults = baseMatchRules.supportedIncidentTypes,
                                        )
                                        val nextDefinitions = retainedCustomIncidentDefinitions(
                                            selected = nextSelectedIncidentTypes,
                                            definitions = editEvent.matchRulesOverride?.incidentTypeDefinitions.orEmpty()
                                                .filterNot { existing -> existing.code.trim().uppercase() == definition.code }
                                                + definition,
                                            baseDefinitions = baseMatchRules.incidentTypeDefinitions,
                                        )
                                        onEditEvent {
                                            copy(
                                                matchRulesOverride = copyMatchRulesOverride(
                                                    current = matchRulesOverride,
                                                    supportedIncidentTypes = incidentOverride,
                                                    incidentTypeDefinitions = nextDefinitions,
                                                ),
                                            )
                                        }
                                        customIncidentDraft = ""
                                    },
                                    enabled = customIncidentDefinition(customIncidentDraft) != null,
                                    modifier = Modifier.padding(top = 8.dp),
                                ) {
                                    Text("Add")
                                }
                            }
                            Text(
                                text = "Type a custom incident and add it to make it available for match officials.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(localImageScheme.current.onSurfaceVariant),
                            )
                            LabeledCheckboxRow(
                                checked = editEvent.autoCreatePointMatchIncidents,
                                label = "Create a scoring incident for each point / goal",
                                onCheckedChange = { checked ->
                                    val nextSelectedIncidentTypes = if (checked) {
                                        enforceAutoPointIncidentType(
                                            selected = selectedMatchIncidentTypes,
                                            autoPointIncidentType = autoPointIncidentType,
                                            enabled = true,
                                        )
                                    } else {
                                        val normalizedAutoPointType = autoPointIncidentType.trim().uppercase()
                                        selectedMatchIncidentTypes.filter { incidentType ->
                                            incidentType.trim().uppercase() != normalizedAutoPointType
                                        }
                                    }
                                    val incidentOverride = supportedIncidentTypesOverrideOrNull(
                                        selected = nextSelectedIncidentTypes,
                                        defaults = baseMatchRules.supportedIncidentTypes,
                                    )
                                    val retainedDefinitions = retainedCustomIncidentDefinitions(
                                        selected = nextSelectedIncidentTypes,
                                        definitions = editEvent.matchRulesOverride?.incidentTypeDefinitions.orEmpty(),
                                        baseDefinitions = baseMatchRules.incidentTypeDefinitions,
                                    )
                                    onEditEvent {
                                        copy(
                                            autoCreatePointMatchIncidents = checked,
                                            matchRulesOverride = copyMatchRulesOverride(
                                                current = matchRulesOverride,
                                                supportedIncidentTypes = incidentOverride,
                                                incidentTypeDefinitions = retainedDefinitions,
                                            ),
                                        )
                                    }
                                },
                            )
                            Text(
                                text = if (editEvent.autoCreatePointMatchIncidents) {
                                    "${matchIncidentLabel(autoPointIncidentType)} incidents will stay available while automatic scoring capture is on."
                                } else {
                                    "Officials can still add incidents manually when needed."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(localImageScheme.current.onSurfaceVariant),
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
                }

                if (showOfficialsPanel) {
                    animatedCardSection(
                        sectionId = readOnlyUiModel.staff.sectionId,
                        sectionExpansionStates = sectionExpansionStates,
                        sectionTitle = readOnlyUiModel.staff.title,
                        collapsibleInEditMode = true,
                        collapsibleInViewMode = true,
                        viewSummary = readOnlyUiModel.staff.summary,
                        enabled = sportRequiredSectionEnabled,
                        onDisabledClick = ::showSelectSportMessage,
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
                                            if (event.usesTeamOfficialScheduling()) "Yes" else "No",
                                        ),
                                    )
                                    if (event.usesTeamOfficialScheduling()) {
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
                                checked = editEvent.usesTeamOfficialScheduling(),
                                label = "Teams provide officials",
                                onCheckedChange = onUpdateDoTeamsOfficiate,
                            )
                            if (editEvent.usesTeamOfficialScheduling()) {
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
                        enabled = sportRequiredSectionEnabled,
                        onDisabledClick = ::showSelectSportMessage,
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
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Box(modifier = Modifier.weight(1f)) {
                            LabeledCheckboxRow(
                                checked = editEvent.singleDivision,
                                label = "Single Division",
                                enabled = true,
                                onCheckedChange = { checked ->
                                    val explicitPlayoffCount =
                                        editEvent.playoffTeamCount
                                            ?: divisionDetailsForSettings.firstOrNull()?.playoffTeamCount
                                    val explicitPoolCount =
                                        divisionDetailsForSettings.firstOrNull()?.poolCount
                                            ?: divisionEditor.poolCount
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
                                        if (useRelativeDueDates) {
                                            defaultInstallmentDueRelativeDays.size
                                        } else {
                                            defaultInstallmentDueDates.size
                                        },
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
                                                    price = editEvent.priceCents.coerceAtLeast(0),
                                                    maxParticipants = editEvent.maxParticipants
                                                        .takeIf { value -> value >= 2 },
                                                    playoffTeamCount = nextPlayoffCount,
                                                    poolCount = explicitPoolCount,
                                                    poolTeamCount = derivePoolTeamCount(
                                                        maxTeams = editEvent.maxParticipants,
                                                        poolCount = explicitPoolCount,
                                                    ),
                                                    allowPaymentPlans = defaultAllowPaymentPlans,
                                                    installmentCount = defaultInstallmentCount,
                                                    installmentDueDates = if (defaultAllowPaymentPlans) {
                                                        if (useRelativeDueDates) emptyList() else defaultInstallmentDueDates
                                                    } else {
                                                        emptyList()
                                                    },
                                                    installmentDueRelativeDays = if (defaultAllowPaymentPlans && useRelativeDueDates) {
                                                        defaultInstallmentDueRelativeDays
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
                                                val existingInstallmentDueRelativeDays = existing.installmentDueRelativeDays
                                                val existingInstallmentCount = maxOf(
                                                    existing.installmentCount ?: 0,
                                                    existingInstallmentAmounts.size,
                                                    if (useRelativeDueDates) {
                                                        existingInstallmentDueRelativeDays.size
                                                    } else {
                                                        existingInstallmentDueDates.size
                                                    },
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
                                                        if (useRelativeDueDates) {
                                                            emptyList()
                                                        } else if (existingInstallmentDueDates.isNotEmpty()) {
                                                            existingInstallmentDueDates
                                                        } else {
                                                            defaultInstallmentDueDates
                                                        }
                                                    } else {
                                                        emptyList()
                                                    },
                                                    installmentDueRelativeDays = if (existingAllowPaymentPlans && useRelativeDueDates) {
                                                        if (existingInstallmentDueRelativeDays.isNotEmpty()) {
                                                            existingInstallmentDueRelativeDays
                                                        } else {
                                                            defaultInstallmentDueRelativeDays
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
                                            allowTeamSplitDefault = if (checked) false else allowTeamSplitDefault,
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
                                    syncLeagueSlotsForSelectedDivisions(
                                        normalizedSelection = selectedDivisions,
                                        splitByDivisionOverride = !checked,
                                    )
                                },
                            )
                        }
                        Box(modifier = Modifier.weight(1f))
                    }

                    @Composable
                    fun DivisionScheduleConfigurationFields() {
                        if (editEvent.eventType == EventType.TOURNAMENT && editEvent.includePlayoffs) {
                            LeagueConfigurationFields(
                                title = "Pool Configuration",
                                leagueConfig = normalizeLeagueConfigWithSportMode(divisionEditor.leagueConfig).copy(
                                    includePlayoffs = false,
                                    playoffTeamCount = null,
                                ),
                                onLeagueConfigChange = ::updateDivisionLeagueConfig,
                            )
                        }

                        if (editEvent.eventType == EventType.TOURNAMENT) {
                            TournamentConfigurationFields(
                                title = "Tournament Configuration",
                                usesSets = divisionScheduleUsesSets,
                                tournamentConfig = divisionEditor.playoffConfig,
                                onTournamentConfigChange = ::updateDivisionTournamentConfig,
                            )
                        }

                        if (editEvent.eventType == EventType.LEAGUE) {
                            LeagueConfigurationFields(
                                leagueConfig = normalizeLeagueConfigWithSportMode(divisionEditor.leagueConfig).copy(
                                    includePlayoffs = editEvent.includePlayoffs,
                                    playoffTeamCount = divisionEditor.playoffTeamCount,
                                ),
                                onLeagueConfigChange = ::updateDivisionLeagueConfig,
                            )
                            if (editEvent.includePlayoffs) {
                                LeaguePlayoffConfigurationFields(
                                    leagueConfig = normalizeLeagueConfigWithSportMode(divisionEditor.leagueConfig).copy(
                                        includePlayoffs = true,
                                        playoffTeamCount = divisionEditor.playoffTeamCount,
                                    ),
                                    playoffConfig = divisionEditor.playoffConfig,
                                    onPlayoffConfigChange = ::updateDivisionPlayoffConfig,
                                )
                            }
                        }
                    }

                    AnimatedVisibility(editEvent.singleDivision) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            val singleDivisionTournamentPoolPlayEnabled = editEvent.isTournamentPoolPlayEnabled()
                            val singleDivisionPoolCount =
                                divisionEditorDefaults.poolCount
                                    ?: divisionDetailsForSettings.firstOrNull()?.poolCount
                                    ?: divisionEditor.poolCount
                            val singleDivisionPoolTeamCount = derivePoolTeamCount(
                                maxTeams = editEvent.maxParticipants,
                                poolCount = singleDivisionPoolCount,
                            )
                            FlowRow(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                MoneyInputField(
                                    value = editEvent.priceCents.coerceAtLeast(0).toString(),
                                    onValueChange = { value ->
                                        if (!hostHasAccount) {
                                            return@MoneyInputField
                                        }
                                        val parsedPrice = value
                                            .filter(Char::isDigit)
                                            .toIntOrNull()
                                            ?.coerceAtLeast(0)
                                            ?: 0
                                        divisionEditorDefaults = divisionEditorDefaults.copy(
                                            priceCents = parsedPrice,
                                        )
                                        if (divisionEditor.editingId.isNullOrBlank()) {
                                            divisionEditor = divisionEditor.copy(
                                                priceCents = parsedPrice,
                                                error = null,
                                            )
                                        }
                                        onEditEvent {
                                            val nextDetails = applySingleDivisionDefaultsToDetails(
                                                details = divisionDetails,
                                                defaultPriceCents = parsedPrice,
                                                defaultMaxParticipants = maxParticipants,
                                                defaultPlayoffTeamCount = if (includePlayoffs) playoffTeamCount else null,
                                                defaultPoolCount = if (singleDivisionTournamentPoolPlayEnabled) {
                                                    singleDivisionPoolCount
                                                } else {
                                                    null
                                                },
                                            )
                                            copy(
                                                priceCents = parsedPrice,
                                                divisionDetails = nextDetails,
                                            )
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth(0.48f),
                                    label = "Price",
                                    enabled = hostHasAccount,
                                    supportingContent = {
                                        PriceWithFeesPreviewSupportingText(
                                            amountCents = editEvent.priceCents,
                                            eventType = editEvent.eventType,
                                            baseLabel = "Price",
                                            onShowBreakdown = { pricePreviewBreakdown = it },
                                        )
                                    },
                                )
                                NumberInputField(
                                    modifier = Modifier.fillMaxWidth(0.48f),
                                    value = editEvent.maxParticipants
                                        .takeIf { value -> value > 0 }
                                        ?.toString()
                                        .orEmpty(),
                                    label = if (editEvent.teamSignup) "Max Teams" else "Max Participants",
                                    onValueChange = { value ->
                                        if (value.isEmpty() || value.all { it.isDigit() }) {
                                            val parsedMaxParticipants = value.toIntOrNull() ?: 0
                                            val nextDefaultMaxParticipants = parsedMaxParticipants
                                                .takeIf { parsed -> parsed >= 2 }
                                            divisionEditorDefaults = divisionEditorDefaults.copy(
                                                maxParticipants = nextDefaultMaxParticipants,
                                            )
                                            if (divisionEditor.editingId.isNullOrBlank()) {
                                                divisionEditor = divisionEditor.copy(
                                                    maxParticipants = nextDefaultMaxParticipants,
                                                    error = null,
                                                )
                                            }
                                            onEditEvent {
                                                val nextDetails = applySingleDivisionDefaultsToDetails(
                                                    details = divisionDetails,
                                                    defaultPriceCents = priceCents,
                                                    defaultMaxParticipants = parsedMaxParticipants,
                                                    defaultPlayoffTeamCount = if (includePlayoffs) playoffTeamCount else null,
                                                    defaultPoolCount = if (singleDivisionTournamentPoolPlayEnabled) {
                                                        singleDivisionPoolCount
                                                    } else {
                                                        null
                                                    },
                                                )
                                                copy(
                                                    maxParticipants = parsedMaxParticipants,
                                                    divisionDetails = nextDetails,
                                                )
                                            }
                                        }
                                    },
                                    isError = editEvent.maxParticipants < 2,
                                    errorMessage = "Required and must be at least 2.",
                                )
                                if (
                                    editEvent.includePlayoffs &&
                                    editEvent.eventType == EventType.LEAGUE
                                ) {
                                    Spacer(modifier = Modifier.fillMaxWidth(0.48f))
                                    NumberInputField(
                                        modifier = Modifier.fillMaxWidth(0.48f),
                                        value = editEvent.playoffTeamCount?.toString().orEmpty(),
                                        label = "Playoff Team Count",
                                        onValueChange = { value ->
                                            if (value.isNotEmpty() && !value.all { it.isDigit() }) {
                                                return@NumberInputField
                                            }
                                            val parsedPlayoffCount = value.toIntOrNull()
                                            divisionEditorDefaults = divisionEditorDefaults.copy(
                                                playoffTeamCount = parsedPlayoffCount?.takeIf { count -> count >= 2 },
                                            )
                                            if (divisionEditor.editingId.isNullOrBlank()) {
                                                divisionEditor = divisionEditor.copy(
                                                    playoffTeamCount = parsedPlayoffCount,
                                                    error = null,
                                                )
                                            }
                                            onEditEvent {
                                                val nextDetails = applySingleDivisionDefaultsToDetails(
                                                    details = divisionDetails,
                                                    defaultPriceCents = priceCents,
                                                    defaultMaxParticipants = maxParticipants,
                                                    defaultPlayoffTeamCount = parsedPlayoffCount,
                                                    defaultPoolCount = null,
                                                )
                                                copy(
                                                    playoffTeamCount = parsedPlayoffCount,
                                                    divisionDetails = nextDetails,
                                                )
                                            }
                                        },
                                        isError = (editEvent.playoffTeamCount ?: 0) < 2,
                                        errorMessage = "Required and must be at least 2.",
                                    )
                                }
                                if (singleDivisionTournamentPoolPlayEnabled) {
                                    NumberInputField(
                                        modifier = Modifier.fillMaxWidth(0.48f),
                                        value = editEvent.playoffTeamCount?.toString().orEmpty(),
                                        label = "Bracket Teams",
                                        onValueChange = { value ->
                                            if (value.isNotEmpty() && !value.all { it.isDigit() }) {
                                                return@NumberInputField
                                            }
                                            val parsedBracketTeams = value.toIntOrNull()
                                            divisionEditorDefaults = divisionEditorDefaults.copy(
                                                playoffTeamCount = parsedBracketTeams?.takeIf { count -> count >= 2 },
                                            )
                                            if (divisionEditor.editingId.isNullOrBlank()) {
                                                divisionEditor = divisionEditor.copy(
                                                    playoffTeamCount = parsedBracketTeams,
                                                    error = null,
                                                )
                                            }
                                            onEditEvent {
                                                val nextDetails = applySingleDivisionDefaultsToDetails(
                                                    details = divisionDetails,
                                                    defaultPriceCents = priceCents,
                                                    defaultMaxParticipants = maxParticipants,
                                                    defaultPlayoffTeamCount = parsedBracketTeams,
                                                    defaultPoolCount = singleDivisionPoolCount,
                                                )
                                                copy(
                                                    playoffTeamCount = parsedBracketTeams,
                                                    divisionDetails = nextDetails,
                                                )
                                            }
                                        },
                                        isError = (editEvent.playoffTeamCount ?: 0) < 2 ||
                                            (
                                                singleDivisionPoolCount != null &&
                                                    editEvent.playoffTeamCount != null &&
                                                    editEvent.playoffTeamCount % singleDivisionPoolCount != 0
                                                ),
                                        errorMessage = "Must be at least 2 and divide evenly by pools.",
                                    )
                                    NumberInputField(
                                        modifier = Modifier.fillMaxWidth(0.48f),
                                        value = singleDivisionPoolCount?.toString().orEmpty(),
                                        label = "Pool Count",
                                        onValueChange = { value ->
                                            if (value.isNotEmpty() && !value.all { it.isDigit() }) {
                                                return@NumberInputField
                                            }
                                            val parsedPoolCount = value.toIntOrNull()
                                            divisionEditorDefaults = divisionEditorDefaults.copy(
                                                poolCount = parsedPoolCount?.takeIf { count -> count >= 1 },
                                            )
                                            if (divisionEditor.editingId.isNullOrBlank()) {
                                                divisionEditor = divisionEditor.copy(
                                                    poolCount = parsedPoolCount,
                                                    error = null,
                                                )
                                            }
                                            onEditEvent {
                                                val nextDetails = applySingleDivisionDefaultsToDetails(
                                                    details = divisionDetails,
                                                    defaultPriceCents = priceCents,
                                                    defaultMaxParticipants = maxParticipants,
                                                    defaultPlayoffTeamCount = playoffTeamCount,
                                                    defaultPoolCount = parsedPoolCount,
                                                )
                                                copy(divisionDetails = nextDetails)
                                            }
                                        },
                                        isError = (singleDivisionPoolCount ?: 0) < 1 ||
                                            (
                                                singleDivisionPoolCount != null &&
                                                    editEvent.maxParticipants % singleDivisionPoolCount != 0
                                                ),
                                        errorMessage = "Max teams must divide evenly by pools.",
                                    )
                                    NumberInputField(
                                        modifier = Modifier.fillMaxWidth(0.48f),
                                        value = singleDivisionPoolTeamCount?.toString().orEmpty(),
                                        label = "Pool Team Count",
                                        enabled = false,
                                        onValueChange = {},
                                        isError = singleDivisionPoolTeamCount == null,
                                        errorMessage = "Derived from Pool Count and Max Teams",
                                        supportingText = "Derived from Pool Count and Max Teams",
                                    )
                                }
                            }
                            DivisionScheduleConfigurationFields()
                        }
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

                    val divisionInputsTitle = if (divisionEditor.editingId.isNullOrBlank()) {
                        "New Division"
                    } else {
                        "Edit Division"
                    }
                    FormSectionDivider()
                    CollapsibleEditorSubsectionHeader(
                        title = divisionInputsTitle,
                        expanded = divisionInputsExpanded,
                        onToggle = { divisionInputsExpanded = !divisionInputsExpanded },
                    )
                    AnimatedVisibility(visible = divisionInputsExpanded) {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            if (!editEvent.singleDivision) {
                                DivisionScheduleConfigurationFields()
                            }

                    Text(
                        text = "Division Info",
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
                            options = genderSelectOptions,
                            modifier = Modifier.weight(1f),
                            label = "Gender",
                            placeholder = "Select gender",
                            isError = divisionEditor.gender.isBlank(),
                            supportingText = if (divisionEditor.gender.isBlank()) {
                                "Select a gender."
                            } else {
                                ""
                            },
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
                            isError = divisionEditor.skillDivisionTypeId.isBlank(),
                            supportingText = if (divisionEditor.skillDivisionTypeId.isBlank()) {
                                "Select a skill division."
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
                        PlatformDropdown(
                            selectedValue = divisionEditor.ageDivisionTypeId,
                            onSelectionChange = { value ->
                                updateDivisionEditorSelection(ageDivisionTypeId = value)
                            },
                            options = ageDivisionTypeSelectOptions,
                            modifier = Modifier.weight(1f),
                            label = "Age Division",
                            placeholder = "Select age division",
                            isError = divisionEditor.ageDivisionTypeId.isBlank(),
                            supportingText = if (divisionEditor.ageDivisionTypeId.isBlank()) {
                                "Select an age division."
                            } else {
                                ""
                            },
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

                    AnimatedVisibility(!editEvent.singleDivision) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            FormSectionDivider()
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.Top,
                            ) {
                                MoneyInputField(
                                    value = divisionEditor.priceCents.coerceAtLeast(0).toString(),
                                    onValueChange = { value ->
                                        if (!divisionEditorReady || !hostHasAccount) {
                                            return@MoneyInputField
                                        }
                                        divisionEditor = divisionEditor.copy(
                                            priceCents = value.filter(Char::isDigit).toIntOrNull()?.coerceAtLeast(0) ?: 0,
                                            error = null,
                                        )
                                    },
                                    modifier = Modifier.weight(1f),
                                    label = "Division Price",
                                    enabled = hostHasAccount && divisionEditorReady,
                                    supportingContent = {
                                        PriceWithFeesPreviewSupportingText(
                                            amountCents = divisionEditor.priceCents,
                                            eventType = editEvent.eventType,
                                            baseLabel = "Division price",
                                            onShowBreakdown = { pricePreviewBreakdown = it },
                                        )
                                    },
                                )
                                NumberInputField(
                                    modifier = Modifier.weight(1f),
                                    value = divisionEditor.maxParticipants?.toString().orEmpty(),
                                    label = if (editEvent.teamSignup) {
                                        "Division Max Teams"
                                    } else {
                                        "Division Max Participants"
                                    },
                                    enabled = divisionEditorReady,
                                    onValueChange = { value ->
                                        if (!divisionEditorReady) {
                                            return@NumberInputField
                                        }
                                        if (value.isEmpty() || value.all { it.isDigit() }) {
                                            divisionEditor = divisionEditor.copy(
                                                maxParticipants = value.toIntOrNull(),
                                                error = null,
                                            )
                                        }
                                    },
                                    isError = divisionEditor.maxParticipants.let { maxParticipants ->
                                        maxParticipants == null || maxParticipants < 2
                                    },
                                    errorMessage = "Required and must be at least 2.",
                                )
                            }
                        }
                    }

                    if (editEvent.eventType == EventType.TOURNAMENT && !editEvent.singleDivision) {
                        val tournamentPoolPlayEnabled = editEvent.isTournamentPoolPlayEnabled()
                        val divisionMaxTeams = if (editEvent.singleDivision) {
                            editEvent.maxParticipants.takeIf { value -> value >= 2 } ?: 0
                        } else {
                            divisionEditor.maxParticipants ?: 0
                        }
                        val divisionPoolCount = divisionEditor.poolCount
                        val divisionBracketTeamCount = divisionEditor.playoffTeamCount
                        val divisionPoolTeamCount = derivePoolTeamCount(
                            maxTeams = divisionMaxTeams,
                            poolCount = divisionPoolCount,
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            if (editEvent.singleDivision) {
                                Box(modifier = Modifier.weight(1f))
                            } else {
                                NumberInputField(
                                    modifier = Modifier.weight(1f),
                                    value = divisionBracketTeamCount?.toString().orEmpty(),
                                    label = "Bracket Teams",
                                    enabled = tournamentPoolPlayEnabled && divisionEditorReady,
                                    onValueChange = { value ->
                                        if (!divisionEditorReady || !tournamentPoolPlayEnabled) {
                                            return@NumberInputField
                                        }
                                        if (value.isEmpty() || value.all { it.isDigit() }) {
                                            divisionEditor = divisionEditor.copy(
                                                playoffTeamCount = if (value.isBlank()) null else value.toIntOrNull(),
                                                error = null,
                                            )
                                        }
                                    },
                                    isError = tournamentPoolPlayEnabled &&
                                        ((divisionBracketTeamCount ?: 0) < 2 ||
                                            (
                                                divisionPoolCount != null &&
                                                    divisionBracketTeamCount != null &&
                                                    divisionBracketTeamCount % divisionPoolCount != 0
                                                )),
                                    errorMessage = "Must be at least 2 and divide evenly by pools.",
                                )
                            }
                            NumberInputField(
                                modifier = Modifier.weight(1f),
                                value = divisionPoolCount?.toString().orEmpty(),
                                label = "Pool Count",
                                enabled = tournamentPoolPlayEnabled && divisionEditorReady,
                                onValueChange = { value ->
                                    if (!divisionEditorReady || !tournamentPoolPlayEnabled) {
                                        return@NumberInputField
                                    }
                                    if (value.isEmpty() || value.all { it.isDigit() }) {
                                        divisionEditor = divisionEditor.copy(
                                            poolCount = if (value.isBlank()) null else value.toIntOrNull(),
                                            error = null,
                                        )
                                    }
                                },
                                isError = tournamentPoolPlayEnabled &&
                                    ((divisionPoolCount ?: 0) < 1 ||
                                        (
                                            divisionPoolCount != null &&
                                                divisionMaxTeams % divisionPoolCount != 0
                                            )),
                                errorMessage = "Max teams must divide evenly by pools.",
                            )
                        }
                        NumberInputField(
                            modifier = Modifier.fillMaxWidth(0.48f),
                            value = divisionPoolTeamCount?.toString().orEmpty(),
                            label = "Pool Team Count",
                            enabled = false,
                            onValueChange = {},
                            isError = divisionPoolTeamCount == null,
                            errorMessage = "Derived from Pool Count and Max Teams",
                            supportingText = "Derived from Pool Count and Max Teams",
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
                            val useRelativeDueDates = editEvent.eventType == EventType.WEEKLY_EVENT
                            val installmentCount = maxOf(
                                divisionEditor.installmentCount,
                                divisionEditor.installmentAmounts.size,
                                if (useRelativeDueDates) {
                                    divisionEditor.installmentDueRelativeDays.size
                                } else {
                                    divisionEditor.installmentDueDates.size
                                },
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
                                val dueOffset = divisionEditor.installmentDueRelativeDays.getOrNull(index) ?: 0
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
                                    if (useRelativeDueDates) {
                                        StandardTextField(
                                            value = dueOffset.toString(),
                                            onValueChange = { newValue ->
                                                val parsed = newValue.toIntOrNull() ?: 0
                                                val targetCount = maxOf(
                                                    installmentCount,
                                                    divisionEditor.installmentAmounts.size,
                                                    divisionEditor.installmentDueRelativeDays.size,
                                                )
                                                val nextRelativeDueDays = MutableList(targetCount) { dueIndex ->
                                                    divisionEditor.installmentDueRelativeDays.getOrNull(dueIndex) ?: 0
                                                }
                                                if (index in nextRelativeDueDays.indices) {
                                                    nextRelativeDueDays[index] = parsed
                                                }
                                                divisionEditor = divisionEditor.copy(
                                                    installmentDueDates = emptyList(),
                                                    installmentDueRelativeDays = nextRelativeDueDays,
                                                    error = null,
                                                )
                                            },
                                            label = "Due Offset",
                                            placeholder = "0",
                                            modifier = Modifier.weight(1f),
                                        )
                                    } else {
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

                    val showDivisionPlayoffTeamCount =
                        editEvent.eventType == EventType.LEAGUE &&
                            editEvent.includePlayoffs &&
                            !editEvent.singleDivision
                    val isEditingDivision = !divisionEditor.editingId.isNullOrBlank()
                    @Composable
                    fun DivisionActionLeadingField(modifier: Modifier) {
                        when {
                            showDivisionPlayoffTeamCount -> {
                                NumberInputField(
                                    modifier = modifier,
                                    value = divisionEditor.playoffTeamCount?.toString().orEmpty(),
                                    label = "Division Playoff Team Count",
                                    enabled = divisionEditorReady,
                                    onValueChange = { value ->
                                        if (!divisionEditorReady) {
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
                                    isError = (divisionEditor.playoffTeamCount ?: 0) < 2,
                                    errorMessage = "Required and must be at least 2.",
                                )
                            }
                            else -> Spacer(modifier = modifier)
                        }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (isEditingDivision) {
                            if (showDivisionPlayoffTeamCount) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.Top,
                                ) {
                                    DivisionActionLeadingField(Modifier.weight(1f))
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.End,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Button(
                                    onClick = { handleSaveDivisionDetail() },
                                    enabled = true,
                                ) {
                                    Text("Update Division")
                                }
                                TextButton(onClick = { resetDivisionEditor() }) {
                                    Text("Cancel Edit")
                                }
                            }
                        } else {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                DivisionActionLeadingField(Modifier.weight(1f))
                                Button(
                                    onClick = { handleSaveDivisionDetail() },
                                    enabled = true,
                                ) {
                                    Text("Add Division")
                                }
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
                    if (
                        editEvent.eventType == EventType.TOURNAMENT &&
                        editEvent.includePlayoffs &&
                        !isLeaguePlayoffTeamsValid
                    ) {
                        Text(
                            text = "Pool play requires pool count, bracket team count, and even pool sizing for each division.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }

                        }
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
                        enabled = sportRequiredSectionEnabled,
                        onDisabledClick = ::showSelectSportMessage,
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
                        enabled = sportRequiredSectionEnabled,
                        onDisabledClick = ::showSelectSportMessage,
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
                            LeagueScheduleFields(
                                fieldCount = fieldCount,
                                fields = editableFields,
                                slots = leagueTimeSlots,
                                availableRentalResources = availableRentalResources,
                                selectedRentalResourceIds = selectedRentalResourceIds,
                                onRentalResourceSelectionChange = onRentalResourceSelectionChange,
                                eventStart = editEvent.start,
                                eventEnd = if (editEvent.noFixedEndDateTime) {
                                    null
                                } else {
                                    editEvent.end.takeIf { it > editEvent.start }
                                },
                                eventTimeZone = editEventTimeZone,
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
                                showSlotDivisions = splitByDivisionScheduling,
                                lockSlotDivisions = false,
                                lockedDivisionIds = editEvent.divisions.normalizeDivisionIdentifiers(),
                                allowDivisionEditsWhenReadOnly = allowLockedSlotDivisionEdits,
                                allowLocalResourceCreationWithRentalResources = allowLocalResourceCreationWithRentalResources,
                                fieldCountError = if (!isFieldCountValid) {
                                    "Resource count must be at least 1."
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

    pricePreviewBreakdown?.let { breakdown ->
        PriceWithFeesPreviewDialog(
            breakdown = breakdown,
            onDismiss = { pricePreviewBreakdown = null },
        )
    }

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
        }, allowMultiple = false, mimeTypes = listOf(MimeType.IMAGE_ALL)
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

private data class PricePreviewBreakdown(
    val baseLabel: String,
    val amountCents: Int,
    val mvpFeeCents: Int,
    val subtotalBeforeStripeFeesCents: Int,
    val mvpFeePercentage: Double,
    val taxable: Boolean,
) {
    val totalDisplayValue: String
        get() = if (amountCents <= 0) {
            subtotalBeforeStripeFeesCents.formatCents()
        } else if (taxable) {
            "${subtotalBeforeStripeFeesCents.formatCents()} + Taxes + Stripe fees"
        } else {
            "${subtotalBeforeStripeFeesCents.formatCents()} + Stripe fees"
        }
}

@Composable
private fun PriceWithFeesPreviewSupportingText(
    amountCents: Int,
    eventType: EventType,
    baseLabel: String,
    taxable: Boolean = false,
    onShowBreakdown: (PricePreviewBreakdown) -> Unit,
) {
    val breakdown = remember(amountCents, eventType, baseLabel, taxable) {
        calculatePricePreviewBreakdown(
            amountCents = amountCents,
            eventType = eventType,
            baseLabel = baseLabel,
            taxable = taxable,
        )
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Total: ${breakdown.totalDisplayValue}",
            style = MaterialTheme.typography.bodySmall,
            color = Color(localImageScheme.current.onSurfaceVariant),
        )
        Text(
            text = "Breakdown",
            modifier = Modifier.clickable { onShowBreakdown(breakdown) },
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
            color = Color(localImageScheme.current.primary),
        )
    }
}

@Composable
private fun EventRegistrationQuestionsSection(
    questions: List<TeamJoinQuestion>,
    answers: Map<String, String>,
    expanded: Boolean,
    onToggleExpanded: () -> Unit,
    onAnswerChange: (String, String) -> Unit,
) {
    if (questions.isEmpty()) return

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggleExpanded),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Registration questions",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "${questions.size} ${if (questions.size == 1) "question" else "questions"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Icon(
                    imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (expanded) "Collapse registration questions" else "Expand registration questions",
                )
            }
            AnimatedVisibility(visible = expanded) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    questions.forEach { question ->
                        StandardTextField(
                            value = answers[question.id].orEmpty(),
                            onValueChange = { value -> onAnswerChange(question.id, value) },
                            modifier = Modifier.fillMaxWidth(),
                            label = if (question.required) "${question.prompt} *" else question.prompt,
                            placeholder = "Answer",
                            supportingText = if (question.answerType.equals("LONG_TEXT", ignoreCase = true)) {
                                "A short paragraph is fine."
                            } else {
                                ""
                            },
                            height = if (question.answerType.equals("LONG_TEXT", ignoreCase = true)) 128.dp else null,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PriceWithFeesPreviewDialog(
    breakdown: PricePreviewBreakdown,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Payment Breakdown") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Review the expected charges before saving this price.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                HorizontalDivider()
                FeePreviewRow(breakdown.baseLabel, breakdown.amountCents.formatCents())
                FeePreviewRow(
                    "BracketIQ fee (${breakdown.mvpFeePercentage.formatFeePercentage()})",
                    breakdown.mvpFeeCents.formatCents(),
                )
                if (breakdown.taxable) {
                    FeePreviewRow("Taxes", "Calculated at checkout")
                }
                if (breakdown.amountCents > 0) {
                    FeePreviewRow("Stripe fees", "Vary by payment method")
                }
                HorizontalDivider()
                FeePreviewRow("Total charged", breakdown.totalDisplayValue, isTotal = true)
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) {
                Text("Done")
            }
        },
    )
}

@Composable
private fun FeePreviewRow(
    label: String,
    value: String,
    isTotal: Boolean = false,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(1f),
            style = if (isTotal) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodySmall,
            fontWeight = if (isTotal) FontWeight.SemiBold else FontWeight.Normal,
        )
        Text(
            text = value,
            modifier = Modifier.weight(1f),
            style = if (isTotal) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodySmall,
            fontWeight = if (isTotal) FontWeight.SemiBold else FontWeight.Medium,
            textAlign = TextAlign.End,
        )
    }
}

private fun calculatePricePreviewBreakdown(
    amountCents: Int,
    eventType: EventType,
    baseLabel: String,
    taxable: Boolean,
): PricePreviewBreakdown {
    val normalizedAmountCents = amountCents.coerceAtLeast(0)
    val mvpFeePercentage = resolveMvpFeePercentage(eventType)

    if (normalizedAmountCents == 0) {
        return PricePreviewBreakdown(
            baseLabel = baseLabel,
            amountCents = 0,
            mvpFeeCents = 0,
            subtotalBeforeStripeFeesCents = 0,
            mvpFeePercentage = mvpFeePercentage,
            taxable = taxable,
        )
    }

    val mvpFeeCents = (normalizedAmountCents * mvpFeePercentage).roundToInt()

    return PricePreviewBreakdown(
        baseLabel = baseLabel,
        amountCents = normalizedAmountCents,
        mvpFeeCents = mvpFeeCents,
        subtotalBeforeStripeFeesCents = normalizedAmountCents + mvpFeeCents,
        mvpFeePercentage = mvpFeePercentage,
        taxable = taxable,
    )
}

private fun resolveMvpFeePercentage(eventType: EventType): Double {
    return if (eventType == EventType.LEAGUE || eventType == EventType.TOURNAMENT) {
        LEAGUE_OR_TOURNAMENT_MVP_FEE_PERCENTAGE
    } else {
        DEFAULT_MVP_FEE_PERCENTAGE
    }
}

private fun Int.formatCents(): String = (this / 100.0).moneyFormat()

private fun Double.formatFeePercentage(): String {
    val percentageValue = this * 100
    return if (percentageValue % 1.0 == 0.0) {
        "${percentageValue.toInt()}%"
    } else {
        "${percentageValue.formatOneDecimal()}%"
    }
}

private fun Double.formatOneDecimal(): String {
    return ((this * 10).roundToInt() / 10.0).toString()
}
