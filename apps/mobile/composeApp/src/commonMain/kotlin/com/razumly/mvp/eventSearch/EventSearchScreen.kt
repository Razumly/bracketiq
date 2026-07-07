@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.FabPosition
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToDownIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kizitonwose.calendar.compose.WeekCalendar
import com.kizitonwose.calendar.compose.weekcalendar.rememberWeekCalendarState
import com.kizitonwose.calendar.core.Week
import com.kizitonwose.calendar.core.WeekDay
import com.kizitonwose.calendar.core.WeekDayPosition
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.normalizedAffiliateUrl
import com.razumly.mvp.core.data.dataTypes.normalizedAffiliateRentalUrl
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.defaultEventTagOptions
import com.razumly.mvp.core.data.dataTypes.eventTagIdentity
import com.razumly.mvp.core.data.dataTypes.normalizedEventTags
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.composables.SearchBox
import com.razumly.mvp.core.presentation.composables.SearchOverlay
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.guides.AppGuide
import com.razumly.mvp.core.presentation.guides.AppGuideStep
import com.razumly.mvp.core.presentation.guides.AppGuideTargets
import com.razumly.mvp.core.presentation.guides.LocalGuideController
import com.razumly.mvp.core.presentation.guides.guideTarget
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventSearch.composables.EmptyDiscoverListItem
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MAP_ACTION_BUTTON_EXTRA_DOWN_OFFSET
import com.razumly.mvp.eventMap.MAP_ACTION_BUTTON_NAV_PADDING
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.eventSearch.tabs.events.composables.EventsTabContent
import com.razumly.mvp.eventSearch.tabs.organizations.DiscoverOrganizationList
import com.razumly.mvp.eventSearch.tabs.organizations.toMvpPlaceOrNull
import com.razumly.mvp.eventSearch.tabs.organizations.composables.DiscoverOrganizationSuggestion
import com.razumly.mvp.eventSearch.tabs.rentals.DiscoverRentalList
import com.razumly.mvp.eventSearch.tabs.rentals.composables.DiscoverRentalSuggestion
import com.razumly.mvp.eventSearch.tabs.teams.DiscoverTeamList
import com.razumly.mvp.eventSearch.tabs.teams.DiscoverTeamSuggestion
import com.razumly.mvp.icons.Jersey
import com.razumly.mvp.icons.MVPIcons
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import dev.chrisbanes.haze.rememberHazeState
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.toInstant
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.time.Duration.Companion.minutes
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private enum class DiscoverTab(val label: String, val searchPlaceholder: String) {
    EVENTS(label = "Events", searchPlaceholder = "Search events"),
    ORGANIZATIONS(label = "Orgs", searchPlaceholder = "Search orgs"),
    TEAMS(label = "Teams", searchPlaceholder = "Search teams"),
    RENTALS(label = "Rentals", searchPlaceholder = "Search rentals")
}

private fun DiscoverTab.icon(): ImageVector = when (this) {
    DiscoverTab.EVENTS -> Icons.Default.DateRange
    DiscoverTab.ORGANIZATIONS -> Icons.Default.Groups
    DiscoverTab.TEAMS -> MVPIcons.Jersey
    DiscoverTab.RENTALS -> Icons.Default.Business
}

internal enum class RentalDetailsStep {
    BUILDER,
    CONFIRMATION,
}

internal enum class RentalDragHandle {
    TOP,
    BOTTOM,
}

internal data class RentalSelectionDraft(
    val id: Long,
    val fieldId: String,
    val date: LocalDate,
    val startMinutes: Int,
    val endMinutes: Int,
)

internal data class ResolvedRentalSelection(
    val selection: RentalSelectionDraft,
    val field: Field,
    val slots: List<TimeSlot>,
    val startInstant: Instant,
    val endInstant: Instant,
    val totalPriceCents: Int,
)

internal data class RentalBusyRange(
    val eventId: String,
    val eventName: String,
    val startMinutes: Int,
    val endMinutes: Int,
)
private val DISCOVER_FIRST_ITEM_EXTRA_TOP_GAP = 4.dp
private val DISCOVER_PULL_INDICATOR_TOP_OFFSET = 64.dp
private val DISCOVER_TAB_ROW_HEIGHT = 40.dp
private const val DISCOVER_SEARCH_THIS_AREA_THRESHOLD_MILES = 0.25
private const val DISCOVER_MAP_REVEAL_DURATION_MILLIS = 700
private const val DISCOVER_GUIDE_ID = "discover_onboarding_v1"
private const val DISCOVER_GUIDE_TARGET_TABS = "discover.tabs"
private const val DISCOVER_GUIDE_TARGET_SEARCH = "discover.search"
private const val DISCOVER_GUIDE_TARGET_FILTERS = "discover.filters"
private const val DISCOVER_GUIDE_TARGET_FIRST_RESULT = "discover.first_result"
private const val DISCOVER_GUIDE_TARGET_MAP = "discover.map"
private val DISCOVER_GUIDE_REQUIRED_TARGETS = setOf(
    DISCOVER_GUIDE_TARGET_TABS,
    DISCOVER_GUIDE_TARGET_SEARCH,
)

@Composable
private fun DiscoverFilterSportSection(
    sports: List<Sport>,
    selectedSportIds: Set<String>,
    onSportToggled: (Sport) -> Unit,
) {
    if (sports.isEmpty()) return
    var sportsExpanded by rememberSaveable { mutableStateOf(selectedSportIds.isNotEmpty()) }
    val selectedSports = remember(sports, selectedSportIds) {
        sports.filter { sport -> sport.id in selectedSportIds }
    }
    val selectedSummary = when {
        selectedSports.isEmpty() -> "Any sport"
        selectedSports.size == 1 -> selectedSports.first().name
        else -> "${selectedSports.size} sports selected"
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { sportsExpanded = !sportsExpanded }
                .padding(vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Sports",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = selectedSummary,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            IconButton(onClick = { sportsExpanded = !sportsExpanded }) {
                Icon(
                    imageVector = if (sportsExpanded) {
                        Icons.Default.KeyboardArrowUp
                    } else {
                        Icons.Default.KeyboardArrowDown
                    },
                    contentDescription = if (sportsExpanded) "Collapse sports" else "Expand sports",
                )
            }
        }
        AnimatedVisibility(
            visible = sportsExpanded,
            enter = expandVertically(animationSpec = tween(180)) + fadeIn(),
            exit = shrinkVertically(animationSpec = tween(180)) + fadeOut(),
        ) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                sports.forEach { sport ->
                    FilterChip(
                        selected = sport.id in selectedSportIds,
                        onClick = { onSportToggled(sport) },
                        label = {
                            Text(
                                text = sport.name,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun DiscoverFilterTagSection(
    tags: List<EventTag>,
    selectedTagSlugs: Set<String>,
    onTagToggled: (EventTag) -> Unit,
) {
    if (tags.isEmpty()) return
    var tagsExpanded by rememberSaveable { mutableStateOf(selectedTagSlugs.isNotEmpty()) }
    val selectedTags = remember(tags, selectedTagSlugs) {
        tags.filter { tag -> tag.eventTagIdentity() in selectedTagSlugs }
    }
    val selectedSummary = when {
        selectedTags.isEmpty() -> "Any tag"
        selectedTags.size == 1 -> selectedTags.first().name
        else -> "${selectedTags.size} tags selected"
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { tagsExpanded = !tagsExpanded }
                .padding(vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Tags",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = selectedSummary,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            IconButton(onClick = { tagsExpanded = !tagsExpanded }) {
                Icon(
                    imageVector = if (tagsExpanded) {
                        Icons.Default.KeyboardArrowUp
                    } else {
                        Icons.Default.KeyboardArrowDown
                    },
                    contentDescription = if (tagsExpanded) "Collapse tags" else "Expand tags",
                )
            }
        }
        AnimatedVisibility(
            visible = tagsExpanded,
            enter = expandVertically(animationSpec = tween(180)) + fadeIn(),
            exit = shrinkVertically(animationSpec = tween(180)) + fadeOut(),
        ) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                tags.forEach { tag ->
                    val tagSlug = tag.eventTagIdentity()
                    FilterChip(
                        selected = tagSlug in selectedTagSlugs,
                        onClick = { onTagToggled(tag) },
                        label = {
                            Text(
                                text = tag.name,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun DiscoverFilterLocationSection(
    locationLabel: String,
    pickerVisible: Boolean,
    query: String,
    onQueryChange: (String) -> Unit,
    suggestions: List<MVPPlace>,
    isSearching: Boolean,
    canUseCurrentLocation: Boolean,
    onTogglePicker: () -> Unit,
    onUseCurrentLocation: () -> Unit,
    onSuggestionSelected: (MVPPlace) -> Unit,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = "Location",
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onTogglePicker)
                .padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Default.Place,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = locationLabel,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onTogglePicker) {
                Text(if (pickerVisible) "Hide" else "Change")
            }
        }

        AnimatedVisibility(
            visible = pickerVisible,
            enter = expandVertically(animationSpec = tween(180)) + fadeIn(),
            exit = shrinkVertically(animationSpec = tween(180)) + fadeOut(),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                StandardTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    placeholder = "Search city or area code",
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null,
                            modifier = Modifier.size(22.dp),
                        )
                    },
                    textStyle = MaterialTheme.typography.bodyMedium.copy(
                        fontSize = 14.sp,
                        lineHeight = 18.sp,
                    ),
                    placeholderTextStyle = MaterialTheme.typography.bodyMedium.copy(
                        fontSize = 14.sp,
                        lineHeight = 18.sp,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                    height = 52.dp,
                )

                if (canUseCurrentLocation) {
                    LocationChoiceRow(
                        title = "My location",
                        subtitle = "Use your current location for distance filters",
                        onClick = onUseCurrentLocation,
                    )
                }

                when {
                    query.trim().length < 2 -> Text(
                        text = "Type at least 2 characters.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                    )

                    isSearching -> Text(
                        text = "Searching locations...",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                    )

                    suggestions.isEmpty() -> Text(
                        text = "No locations found.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                    )

                    else -> suggestions.take(5).forEach { place ->
                        LocationChoiceRow(
                            title = place.name,
                            subtitle = place.address,
                            onClick = { onSuggestionSelected(place) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LocationChoiceRow(
    title: String,
    subtitle: String?,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 8.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (!subtitle.isNullOrBlank()) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun EventSearchScreen(
    component: EventSearchComponent,
    mapComponent: MapComponent,
) {
    val events by component.events.collectAsState()
    val organizations by component.organizations.collectAsState()
    val allOrganizations by component.allOrganizations.collectAsState()
    val organizationSuggestions by component.suggestedOrganizations.collectAsState()
    val teamSuggestions by component.suggestedTeams.collectAsState()
    val isLoadingOrganizations by component.isLoadingOrganizations.collectAsState()
    val hasMoreOrganizations by component.hasMoreOrganizations.collectAsState()
    val rentals by component.rentals.collectAsState()
    val isLoadingRentals by component.isLoadingRentals.collectAsState()
    val hasMoreRentals by component.hasMoreRentals.collectAsState()
    val teams by component.teams.collectAsState()
    val isLoadingTeams by component.isLoadingTeams.collectAsState()
    val hasMoreTeams by component.hasMoreTeams.collectAsState()
    val isMapVisible by mapComponent.showMap.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val hazeState = rememberHazeState()
    val offsetNavPadding =
        PaddingValues(
            bottom = LocalNavBarPadding.current.calculateBottomPadding().plus(MAP_ACTION_BUTTON_NAV_PADDING)
        )

    val eventsListState = rememberLazyListState()
    val organizationsListState = rememberLazyListState()
    val teamsListState = rememberLazyListState()
    val rentalsListState = rememberLazyListState()

    var fabOffset by remember { mutableStateOf(Offset.Zero) }
    var revealCenter by remember { mutableStateOf(Offset.Zero) }
    val suggestions by component.suggestedEvents.collectAsState()
    val currentLocation by component.currentLocation.collectAsState()
    val mapViewCenter by mapComponent.currentViewCenter.collectAsState()
    val mapViewRadiusMiles by mapComponent.currentViewRadiusMiles.collectAsState()
    val currentFilter by component.filter.collectAsState()
    val currentRadius by component.currentRadius.collectAsState()
    val selectedSearchLocationLabel by component.selectedSearchLocationLabel.collectAsState()
    val sports by component.sports.collectAsState()
    val eventTagOptions = remember(events) {
        (defaultEventTagOptions + events.flatMap { event -> event.tags })
            .normalizedEventTags()
            .sortedBy { tag -> tag.name.lowercase() }
    }

    var selectedTab by rememberSaveable { mutableStateOf(DiscoverTab.EVENTS) }
    var searchQuery by remember { mutableStateOf("") }
    var showSearchOverlay by remember { mutableStateOf(false) }
    var searchBoxPosition by remember { mutableStateOf(Offset.Zero) }
    var searchBoxSize by remember { mutableStateOf(IntSize.Zero) }

    val isLoadingMore by component.isLoadingMore.collectAsState()
    val hasMoreEvents by component.hasMoreEvents.collectAsState()

    var showFab by remember { mutableStateOf(true) }
    var showFloatingSearch by remember { mutableStateOf(true) }
    var showingFilter by remember { mutableStateOf(false) }
    var filterDismissRequest by remember { mutableStateOf(0) }
    var showLocationPicker by remember { mutableStateOf(false) }
    var locationQuery by remember { mutableStateOf("") }
    var locationSuggestions by remember { mutableStateOf<List<MVPPlace>>(emptyList()) }
    var isSearchingLocations by remember { mutableStateOf(false) }
    var lastMapSearchCenter by remember { mutableStateOf<LatLng?>(null) }
    var lastMapSearchRadiusMiles by remember { mutableStateOf<Double?>(null) }
    var loadedInitialMapArea by remember { mutableStateOf(false) }
    val guideController = LocalGuideController.current
    val discoverGuide = remember {
        AppGuide(
            id = DISCOVER_GUIDE_ID,
            steps = listOf(
                AppGuideStep(
                    id = "tabs",
                    targetId = DISCOVER_GUIDE_TARGET_TABS,
                    title = "Browse by category",
                    body = "Switch between events, organizations, and rentals from the Discover tabs.",
                ),
                AppGuideStep(
                    id = "search",
                    targetId = DISCOVER_GUIDE_TARGET_SEARCH,
                    title = "Search Discover",
                    body = "Search for events, venues, organizations, and rental locations from the active tab.",
                ),
                AppGuideStep(
                    id = "filters",
                    targetId = DISCOVER_GUIDE_TARGET_FILTERS,
                    title = "Narrow event results",
                    body = "Use filters when you need to narrow event results by type or details.",
                ),
                AppGuideStep(
                    id = "first_result",
                    targetId = DISCOVER_GUIDE_TARGET_FIRST_RESULT,
                    title = "Open a result",
                    body = "Tap a card to view details, register, manage available actions, or inspect rental options.",
                ),
                AppGuideStep(
                    id = "map",
                    targetId = DISCOVER_GUIDE_TARGET_MAP,
                    title = "Use the map",
                    body = "Open the map to compare nearby results by location.",
                ),
                AppGuideStep(
                    id = "create",
                    targetId = AppGuideTargets.BottomNavCenterAction,
                    title = "Create from anywhere",
                    body = "Use the center action to create an event or jump back into an active event shortcut.",
                ),
            ),
        )
    }

    val eventsScrollingUp by eventsListState.isScrollingUp()
    val organizationsScrollingUp by organizationsListState.isScrollingUp()
    val teamsScrollingUp by teamsListState.isScrollingUp()
    val rentalsScrollingUp by rentalsListState.isScrollingUp()
    val uriHandler = LocalUriHandler.current

    val density = LocalDensity.current
    val fixedTabFontSize = (13f / density.fontScale).sp
    var overlayTopOffset by remember { mutableStateOf(0.dp) }
    var overlayStartOffset by remember { mutableStateOf(0.dp) }
    var overlayWidth by remember { mutableStateOf(0.dp) }
    val searchAreaButtonTopOffset = if (searchBoxSize.height > 0) {
        overlayTopOffset + 16.dp
    } else {
        136.dp
    }

    val organizationLookup = remember(allOrganizations, rentals) {
        (allOrganizations + rentals).associateBy { organization -> organization.id }
    }
    val organizationLogoIdsById = remember(allOrganizations, rentals) {
        (allOrganizations + rentals)
            .mapNotNull { organization ->
                val logoId = organization.logoId?.trim()?.takeIf(String::isNotBlank)
                if (logoId == null) {
                    null
                } else {
                    organization.id to logoId
                }
            }
            .toMap()
    }
    val organizationPlaces = remember(organizations) {
        organizations.mapNotNull { organization ->
            organization.toMvpPlaceOrNull(MVPPlace.MARKER_KIND_ORGANIZATION)
        }
    }
    val rentalPlaces = remember(rentals) {
        rentals.mapNotNull { organization ->
            organization.toMvpPlaceOrNull(MVPPlace.MARKER_KIND_RENTAL)
        }
    }
    val hasDiscoverTabsTarget = guideController?.hasTarget(DISCOVER_GUIDE_TARGET_TABS) == true
    val hasDiscoverSearchTarget = guideController?.hasTarget(DISCOVER_GUIDE_TARGET_SEARCH) == true
    val hasDiscoverFirstResultTarget = guideController?.hasTarget(DISCOVER_GUIDE_TARGET_FIRST_RESULT) == true
    val hasDiscoverMapTarget = guideController?.hasTarget(DISCOVER_GUIDE_TARGET_MAP) == true
    val hasDiscoverCreateTarget = guideController?.hasTarget(AppGuideTargets.BottomNavCenterAction) == true

    val currentListScrollingUp = when (selectedTab) {
        DiscoverTab.EVENTS -> eventsScrollingUp
        DiscoverTab.ORGANIZATIONS -> organizationsScrollingUp
        DiscoverTab.TEAMS -> teamsScrollingUp
        DiscoverTab.RENTALS -> rentalsScrollingUp
    }
    val isRefreshingCurrentTab = when (selectedTab) {
        DiscoverTab.EVENTS -> isLoadingMore
        DiscoverTab.ORGANIZATIONS -> isLoadingOrganizations
        DiscoverTab.TEAMS -> isLoadingTeams
        DiscoverTab.RENTALS -> isLoadingRentals
    }
    val hasMapSearchMoved = mapViewCenter?.let { currentCenter ->
        lastMapSearchCenter?.let { previousCenter ->
            distanceMilesBetween(currentCenter, previousCenter) >= DISCOVER_SEARCH_THIS_AREA_THRESHOLD_MILES
        }
    } == true
    val showSearchThisArea = isMapVisible &&
        (hasMapSearchMoved || mapRadiusChangedEnough(mapViewRadiusMiles, lastMapSearchRadiusMiles))

    val loadingHandler = LocalLoadingHandler.current
    val popupHandler = LocalPopupHandler.current
    val openTeam: (Team) -> Unit = { team ->
        val affiliateUrl = team.normalizedAffiliateUrl()
        if (affiliateUrl != null) {
            runCatching { uriHandler.openUri(affiliateUrl) }
                .onFailure { throwable ->
                    popupHandler.showPopup(
                        com.razumly.mvp.core.util.ErrorMessage(
                            throwable.message ?: "Unable to open registration link.",
                        )
                    )
                }
        } else {
            component.viewTeam(team)
        }
    }
    val openRental: (Organization) -> Unit = { organization ->
        val affiliateUrl = organization.normalizedAffiliateRentalUrl()
        if (affiliateUrl != null) {
            runCatching { uriHandler.openUri(affiliateUrl) }
                .onFailure { throwable ->
                    popupHandler.showPopup(
                        com.razumly.mvp.core.util.ErrorMessage(
                            throwable.message ?: "Unable to open booking link.",
                        )
                    )
                }
        } else {
            component.viewOrganization(
                organization,
                com.razumly.mvp.core.presentation.OrganizationDetailTab.RENTALS
            )
        }
    }

    LaunchedEffect(searchBoxSize, searchBoxPosition) {
        overlayTopOffset = with(density) {
            searchBoxPosition.y.toDp() + searchBoxSize.height.toDp() + 4.dp
        }

        overlayStartOffset = with(density) {
            searchBoxPosition.x.toDp()
        }

        overlayWidth = with(density) {
            searchBoxSize.width.toDp()
        }
    }

    LaunchedEffect(isMapVisible, selectedTab, events, organizationPlaces, rentalPlaces) {
        if (!isMapVisible) {
            return@LaunchedEffect
        }
        when (selectedTab) {
            DiscoverTab.EVENTS -> {
                mapComponent.setPlaces(emptyList())
                mapComponent.setEvents(events)
            }
            DiscoverTab.ORGANIZATIONS -> {
                mapComponent.setEvents(emptyList())
                mapComponent.setPlaces(organizationPlaces)
            }
            DiscoverTab.RENTALS -> {
                mapComponent.setEvents(emptyList())
                mapComponent.setPlaces(rentalPlaces)
            }
            DiscoverTab.TEAMS -> {
                mapComponent.setEvents(emptyList())
                mapComponent.setPlaces(emptyList())
            }
        }
    }

    LaunchedEffect(isMapVisible, currentLocation, mapViewCenter, mapViewRadiusMiles) {
        if (!isMapVisible) {
            lastMapSearchCenter = null
            lastMapSearchRadiusMiles = null
            loadedInitialMapArea = false
            return@LaunchedEffect
        }
        if (!loadedInitialMapArea && mapViewRadiusMiles != null) {
            val initialCenter = currentLocation ?: mapViewCenter
            if (initialCenter != null) {
                delay(DISCOVER_MAP_REVEAL_DURATION_MILLIS.toLong())
                component.searchThisArea(initialCenter, mapViewRadiusMiles)
                lastMapSearchCenter = initialCenter
                lastMapSearchRadiusMiles = mapViewRadiusMiles
                loadedInitialMapArea = true
            }
        }
    }

    LaunchedEffect(currentListScrollingUp, isMapVisible, showingFilter, selectedTab) {
        showFab = !isMapVisible && currentListScrollingUp && !showingFilter
    }

    LaunchedEffect(currentListScrollingUp, isMapVisible, showSearchOverlay, showingFilter, searchQuery) {
        showFloatingSearch = isMapVisible ||
            currentListScrollingUp ||
            showSearchOverlay ||
            showingFilter ||
            searchQuery.isNotEmpty()
    }

    LaunchedEffect(selectedTab) {
        if (selectedTab != DiscoverTab.EVENTS) {
            showingFilter = false
        }
    }

    LaunchedEffect(showingFilter, showLocationPicker, locationQuery) {
        val normalizedQuery = locationQuery.trim()
        if (!showingFilter || !showLocationPicker || normalizedQuery.length < 2) {
            locationSuggestions = emptyList()
            isSearchingLocations = false
            return@LaunchedEffect
        }

        delay(250)
        isSearchingLocations = true
        locationSuggestions = runCatching {
            mapComponent.searchLocationPlaces(normalizedQuery)
        }.getOrElse {
            emptyList()
        }
        isSearchingLocations = false
    }

    LaunchedEffect(selectedTab, searchQuery) {
        val normalizedQuery = searchQuery.trim()
        if (normalizedQuery.length < 2) {
            component.suggestEvents("")
            component.suggestOrganizations("", rentalsOnly = selectedTab == DiscoverTab.RENTALS)
            component.suggestTeams("")
            return@LaunchedEffect
        }

        delay(250)
        when (selectedTab) {
            DiscoverTab.EVENTS -> component.suggestEvents(normalizedQuery)
            DiscoverTab.ORGANIZATIONS -> component.suggestOrganizations(normalizedQuery, rentalsOnly = false)
            DiscoverTab.TEAMS -> component.suggestTeams(normalizedQuery)
            DiscoverTab.RENTALS -> component.suggestOrganizations(normalizedQuery, rentalsOnly = true)
        }
    }

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
            }
        }
    }

    LaunchedEffect(
        guideController,
        selectedTab,
        showSearchOverlay,
        showingFilter,
        isMapVisible,
        searchQuery,
        hasDiscoverTabsTarget,
        hasDiscoverSearchTarget,
        hasDiscoverFirstResultTarget,
        hasDiscoverMapTarget,
        hasDiscoverCreateTarget,
    ) {
        if (guideController == null) return@LaunchedEffect
        if (selectedTab != DiscoverTab.EVENTS) return@LaunchedEffect
        if (showSearchOverlay || showingFilter || isMapVisible || searchQuery.isNotEmpty()) return@LaunchedEffect

        guideController.maybeStartGuide(
            guide = discoverGuide,
            requiredTargetIds = DISCOVER_GUIDE_REQUIRED_TARGETS,
        )
    }

    val openDiscoverMap: (Offset, com.razumly.mvp.core.data.dataTypes.Event?) -> Unit = { center, event ->
        revealCenter = center
        component.onMapClick(event)
        mapComponent.openMap()
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val filterDropdownMaxHeight = if (searchBoxSize.height > 0) {
            with(density) {
                val screenHeightPx = maxHeight.toPx()
                val dropdownTopPx = searchBoxPosition.y + searchBoxSize.height
                val navBottomPx = offsetNavPadding.calculateBottomPadding().toPx()
                val availablePx = screenHeightPx - dropdownTopPx - navBottomPx - 32.dp.toPx()
                availablePx.coerceAtLeast(640.dp.toPx()).toDp()
            }
        } else {
            null
        }
        val discoverMapContent: @Composable BoxScope.() -> Unit = {
            EventMap(
                component = mapComponent,
                onEventSelected = { event ->
                    if (selectedTab == DiscoverTab.EVENTS) {
                        component.viewEvent(event)
                    }
                },
                onPlaceSelected = { place ->
                    val organization = organizationLookup[place.id]
                    when (selectedTab) {
                        DiscoverTab.ORGANIZATIONS -> {
                            if (organization != null) {
                                component.viewOrganization(organization)
                            }
                        }

                        DiscoverTab.RENTALS -> {
                            if (organization != null) {
                                openRental(organization)
                            }
                        }

                        DiscoverTab.TEAMS -> {}
                        else -> {}
                    }
                },
                canClickPOI = false,
                organizationLogoIdsById = organizationLogoIdsById,
                focusedLocation = selectedEvent?.takeIf { selectedTab == DiscoverTab.EVENTS }?.let {
                    LatLng(it.latitude, it.longitude)
                } ?: currentLocation ?: LatLng(0.0, 0.0),
                focusedEvent = selectedEvent?.takeIf { selectedTab == DiscoverTab.EVENTS },
                modifier = Modifier.fillMaxSize(),
                onBackPressed = mapComponent::closeMap,
            )
        }

        BindLocationTrackerEffect(component.locationTracker)
        CircularRevealUnderlay(
            isRevealed = isMapVisible,
            revealCenterInWindow = revealCenter,
            modifier = Modifier
                .fillMaxSize()
                .hazeSource(hazeState),
            backgroundContent = {
                discoverMapContent()
            },
            foregroundContent = {
                Scaffold(
                    topBar = {
                        Spacer(
                            modifier = Modifier
                                .fillMaxWidth()
                                .statusBarsPadding()
                                .height(DISCOVER_TAB_ROW_HEIGHT)
                        )
                    },
                    floatingActionButton = {
                        AnimatedVisibility(
                            visible = showFab,
                            enter = (slideInVertically { it / 2 } + fadeIn()),
                            exit = (slideOutVertically { it / 2 } + fadeOut())
                        ) {
                            Button(
                                onClick = {
                                    openDiscoverMap(fabOffset, null)
                                },
                                modifier = Modifier
                                    .padding(offsetNavPadding)
                                    .offset(y = MAP_ACTION_BUTTON_EXTRA_DOWN_OFFSET)
                                    .onGloballyPositioned { layoutCoordinates ->
                                        val boundsInWindow = layoutCoordinates.boundsInWindow()
                                        fabOffset = boundsInWindow.center
                                    }
                                    .guideTarget(DISCOVER_GUIDE_TARGET_MAP),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color.Black,
                                    contentColor = Color.White
                                )
                            ) {
                                val text = "Map"
                                val icon = Icons.Default.Place
                                Text(text)
                                Icon(icon, contentDescription = "$text Button")
                            }
                        }
                    },
                    floatingActionButtonPosition = FabPosition.Center,
                ) { paddingValues ->
                    val firstElementPadding = PaddingValues(
                        top = paddingValues.calculateTopPadding().plus(72.dp + DISCOVER_FIRST_ITEM_EXTRA_TOP_GAP)
                    )
                    PullToRefreshContainer(
                        isRefreshing = isRefreshingCurrentTab,
                        onRefresh = {
                            when (selectedTab) {
                                DiscoverTab.EVENTS -> component.refreshEvents(force = true)
                                DiscoverTab.ORGANIZATIONS -> component.refreshOrganizations(force = true)
                                DiscoverTab.TEAMS -> component.refreshTeams(force = true)
                                DiscoverTab.RENTALS -> component.refreshRentals(force = true)
                            }
                        },
                        modifier = Modifier.fillMaxSize(),
                        enabled = !isMapVisible,
                        shiftContentWithPull = true,
                        indicatorTopPadding = paddingValues.calculateTopPadding()
                            .plus(DISCOVER_PULL_INDICATOR_TOP_OFFSET),
                    ) {
                        Box(
                            Modifier
                                .fillMaxSize()
                                .pointerInput(showingFilter) {
                                    if (!showingFilter) return@pointerInput

                                    awaitPointerEventScope {
                                        while (true) {
                                            val event = awaitPointerEvent(PointerEventPass.Initial)
                                            if (event.changes.any { it.changedToDownIgnoreConsumed() }) {
                                                filterDismissRequest += 1
                                            }
                                        }
                                    }
                                }
                        ) {
                            when (selectedTab) {
                                DiscoverTab.EVENTS -> {
                                    EventsTabContent(
                                        events = events,
                                        organizationLogoIdsById = organizationLogoIdsById,
                                        firstElementPadding = firstElementPadding,
                                        lastElementPadding = offsetNavPadding,
                                        lazyListState = eventsListState,
                                        isLoadingMore = isLoadingMore,
                                        hasMoreEvents = hasMoreEvents,
                                        onLoadMore = { component.loadMoreEvents() },
                                        onMapClick = { offset, event ->
                                            openDiscoverMap(offset, event)
                                        },
                                        onEventClick = { event ->
                                            component.viewEvent(event)
                                        },
                                        onCreateEventClick = component::startEventCreate,
                                        firstItemGuideTargetId = DISCOVER_GUIDE_TARGET_FIRST_RESULT,
                                    )
                                }

                                DiscoverTab.ORGANIZATIONS -> {
                                    DiscoverOrganizationList(
                                        organizations = organizations,
                                        isLoading = isLoadingOrganizations,
                                        hasMore = hasMoreOrganizations,
                                        onLoadMore = { component.loadMoreOrganizations() },
                                        listState = organizationsListState,
                                        firstElementPadding = firstElementPadding,
                                        lastElementPadding = offsetNavPadding,
                                        emptyMessage = "No organizations discovered yet.",
                                        firstItemGuideTargetId = DISCOVER_GUIDE_TARGET_FIRST_RESULT,
                                        onOrganizationClick = { organization ->
                                            component.viewOrganization(organization)
                                        }
                                    )
                                }

                                DiscoverTab.TEAMS -> {
                                    DiscoverTeamList(
                                        teams = teams,
                                        isLoading = isLoadingTeams,
                                        hasMore = hasMoreTeams,
                                        onLoadMore = { component.loadMoreTeams() },
                                        listState = teamsListState,
                                        firstElementPadding = firstElementPadding,
                                        lastElementPadding = offsetNavPadding,
                                        emptyMessage = "No teams open for registration yet.",
                                        firstItemGuideTargetId = DISCOVER_GUIDE_TARGET_FIRST_RESULT,
                                        onTeamClick = openTeam,
                                    )
                                }

                                DiscoverTab.RENTALS -> {
                                    DiscoverRentalList(
                                        organizations = rentals,
                                        isLoading = isLoadingRentals,
                                        hasMore = hasMoreRentals,
                                        onLoadMore = { component.loadMoreRentals() },
                                        listState = rentalsListState,
                                        firstElementPadding = firstElementPadding,
                                        lastElementPadding = offsetNavPadding,
                                        emptyMessage = "No rentals discovered nearby yet.",
                                        firstItemGuideTargetId = DISCOVER_GUIDE_TARGET_FIRST_RESULT,
                                        onOrganizationClick = { organization ->
                                            openRental(organization)
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            },
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .hazeEffect(
                    hazeState,
                    HazeMaterials.ultraThin(NavigationBarDefaults.containerColor)
                )
                .statusBarsPadding()
                .align(Alignment.TopCenter),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(DISCOVER_TAB_ROW_HEIGHT)
                    .guideTarget(DISCOVER_GUIDE_TARGET_TABS)
            ) {
                DiscoverTab.values().forEach { tab ->
                    val selected = selectedTab == tab
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(DISCOVER_TAB_ROW_HEIGHT)
                            .clickable { selectedTab = tab },
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 2.dp),
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = tab.icon(),
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = if (selected) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                            Text(
                                text = tab.label,
                                maxLines = 1,
                                overflow = TextOverflow.Clip,
                                softWrap = false,
                                fontSize = fixedTabFontSize,
                                fontWeight = FontWeight.SemiBold,
                                color = if (selected) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                        Box(
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .fillMaxWidth()
                                .height(if (selected) 2.dp else 1.dp)
                                .background(
                                    if (selected) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        MaterialTheme.colorScheme.outlineVariant
                                    }
                                )
                        )
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = showFloatingSearch,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(top = DISCOVER_TAB_ROW_HEIGHT + 6.dp),
            enter = slideInVertically { -it / 2 } + fadeIn(),
            exit = slideOutVertically { -it / 2 } + fadeOut()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .guideTarget(DISCOVER_GUIDE_TARGET_SEARCH)
                    .guideTarget(DISCOVER_GUIDE_TARGET_FILTERS)
                    .padding(horizontal = 12.dp),
            ) {
                SearchBox(
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = selectedTab.searchPlaceholder,
                    filter = selectedTab == DiscoverTab.EVENTS,
                    currentFilter = if (selectedTab == DiscoverTab.EVENTS) currentFilter else null,
                    currentRadiusMiles = if (selectedTab == DiscoverTab.EVENTS) currentRadius else null,
                    onRadiusChange = if (selectedTab == DiscoverTab.EVENTS) component::selectRadius else null,
                    onChange = { query ->
                        searchQuery = query
                        showSearchOverlay = query.isNotEmpty()
                    },
                    onSearch = { /* no-op */ },
                    onFocusChange = { isFocused ->
                        if (isFocused) {
                            showSearchOverlay = true
                        } else if (searchQuery.isEmpty()) {
                            showSearchOverlay = false
                        }
                    },
                    onPositionChange = { position, size ->
                        searchBoxPosition = position
                        searchBoxSize = size
                    },
                    onFilterChange = { update ->
                        if (selectedTab == DiscoverTab.EVENTS) {
                            component.updateFilter(update)
                        }
                    },
                    onToggleFilter = { showFilter ->
                        showingFilter = showFilter
                    },
                    filterMaxHeight = filterDropdownMaxHeight,
                    filterDismissSignal = filterDismissRequest,
                    filterExtraContent = if (selectedTab == DiscoverTab.EVENTS) {
                        {
                            DiscoverFilterSportSection(
                                sports = sports,
                                selectedSportIds = currentFilter.sportIds,
                                onSportToggled = { sport ->
                                    component.updateFilter {
                                        val nextSportIds = if (sport.id in sportIds) {
                                            sportIds - sport.id
                                        } else {
                                            sportIds + sport.id
                                        }
                                        copy(sportIds = nextSportIds)
                                    }
                                },
                            )
                            DiscoverFilterTagSection(
                                tags = eventTagOptions,
                                selectedTagSlugs = currentFilter.tagSlugs,
                                onTagToggled = { tag ->
                                    component.updateFilter {
                                        val tagSlug = tag.eventTagIdentity()
                                        val nextTagSlugs = if (tagSlug in tagSlugs) {
                                            tagSlugs - tagSlug
                                        } else {
                                            tagSlugs + tagSlug
                                        }
                                        copy(tagSlugs = nextTagSlugs)
                                    }
                                },
                            )
                            DiscoverFilterLocationSection(
                                locationLabel = selectedSearchLocationLabel ?: if (currentLocation != null) {
                                    "My location"
                                } else {
                                    "Choose location"
                                },
                                pickerVisible = showLocationPicker,
                                query = locationQuery,
                                onQueryChange = { locationQuery = it },
                                suggestions = locationSuggestions,
                                isSearching = isSearchingLocations,
                                canUseCurrentLocation = currentLocation != null,
                                onTogglePicker = { showLocationPicker = !showLocationPicker },
                                onUseCurrentLocation = {
                                    component.useCurrentLocationForSearch()
                                    showLocationPicker = false
                                    locationQuery = ""
                                    locationSuggestions = emptyList()
                                },
                                onSuggestionSelected = { place ->
                                    component.selectSearchLocation(
                                        label = place.name,
                                        center = LatLng(place.latitude, place.longitude),
                                    )
                                    showLocationPicker = false
                                    locationQuery = ""
                                    locationSuggestions = emptyList()
                                },
                            )
                        }
                    } else {
                        null
                    },
                )
            }
        }

        AnimatedVisibility(
            visible = showFloatingSearch && showSearchThisArea && !showSearchOverlay,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(y = searchAreaButtonTopOffset),
            enter = slideInVertically { -it / 2 } + fadeIn(),
            exit = slideOutVertically { -it / 2 } + fadeOut()
        ) {
            Button(
                onClick = {
                    mapViewCenter?.let { center ->
                        component.searchThisArea(center, mapViewRadiusMiles)
                        lastMapSearchCenter = center
                        lastMapSearchRadiusMiles = mapViewRadiusMiles
                    }
                },
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors(),
            ) {
                Text("Search this area")
            }
        }

        SearchOverlay(
            modifier = Modifier
                .width(overlayWidth)
                .heightIn(max = 400.dp)
                .offset(
                    x = overlayStartOffset,
                    y = overlayTopOffset
                ),
            isVisible = showSearchOverlay,
            searchQuery = searchQuery,
            onDismiss = {
                showSearchOverlay = false
            },
            suggestions = {
                val isQueryReady = searchQuery.trim().length >= 2
                when (selectedTab) {
                    DiscoverTab.EVENTS -> {
                        LazyColumn(modifier = Modifier.wrapContentSize()) {
                            if (!isQueryReady) {
                                item {
                                    EmptyDiscoverListItem(message = "Type at least 2 characters.")
                                }
                            } else if (suggestions.isEmpty()) {
                                item {
                                    EmptyDiscoverListItem(message = "No event suggestions found.")
                                }
                            }
                            items(suggestions) { event ->
                                Card(
                                    Modifier
                                        .padding(vertical = 4.dp, horizontal = 8.dp)
                                        .clickable(onClick = {
                                            component.viewEvent(event)
                                            showSearchOverlay = false
                                        })
                                        .fillMaxWidth()
                                ) {
                                    Text(
                                        text = "${event.name} at ${event.location}".toTitleCase(),
                                        modifier = Modifier.padding(8.dp),
                                        overflow = TextOverflow.Ellipsis,
                                        maxLines = 1,
                                        style = MaterialTheme.typography.bodyLarge
                                    )
                                }
                            }
                        }
                    }

                    DiscoverTab.ORGANIZATIONS -> {
                        LazyColumn(modifier = Modifier.wrapContentSize()) {
                            if (!isQueryReady) {
                                item {
                                    EmptyDiscoverListItem(message = "Type at least 2 characters.")
                                }
                            } else if (organizationSuggestions.isEmpty()) {
                                item {
                                    EmptyDiscoverListItem(message = "No organization suggestions found.")
                                }
                            }
                            items(organizationSuggestions) { organization ->
                                DiscoverOrganizationSuggestion(
                                    organization = organization,
                                    onClick = {
                                        component.viewOrganization(organization)
                                        showSearchOverlay = false
                                    }
                                )
                            }
                        }
                    }

                    DiscoverTab.TEAMS -> {
                        LazyColumn(modifier = Modifier.wrapContentSize()) {
                            if (!isQueryReady) {
                                item {
                                    EmptyDiscoverListItem(message = "Type at least 2 characters.")
                                }
                            } else if (teamSuggestions.isEmpty()) {
                                item {
                                    EmptyDiscoverListItem(message = "No team suggestions found.")
                                }
                            }
                            items(teamSuggestions) { team ->
                                DiscoverTeamSuggestion(
                                    team = team,
                                    onClick = {
                                        openTeam(team)
                                        showSearchOverlay = false
                                    }
                                )
                            }
                        }
                    }

                    DiscoverTab.RENTALS -> {
                        LazyColumn(modifier = Modifier.wrapContentSize()) {
                            if (!isQueryReady) {
                                item {
                                    EmptyDiscoverListItem(message = "Type at least 2 characters.")
                                }
                            } else if (organizationSuggestions.isEmpty()) {
                                item {
                                    EmptyDiscoverListItem(message = "No rental suggestions found.")
                                }
                            }
                            items(organizationSuggestions) { organization ->
                                DiscoverRentalSuggestion(
                                    organization = organization,
                                    onClick = {
                                        openRental(organization)
                                        showSearchOverlay = false
                                    }
                                )
                            }
                        }
                    }
                }
            },
            initial = {
                val message = when (selectedTab) {
                    DiscoverTab.EVENTS -> "Start typing to search for events..."
                    DiscoverTab.ORGANIZATIONS -> "Start typing to search for orgs..."
                    DiscoverTab.TEAMS -> "Start typing to search for teams..."
                    DiscoverTab.RENTALS -> "Start typing to search for rentals..."
                }
                EmptyDiscoverListItem(message = message)
            }
        )

    }

}

private fun distanceMilesBetween(start: LatLng, end: LatLng): Double {
    val earthRadiusMiles = 3958.8
    val startLat = start.latitude * PI / 180.0
    val endLat = end.latitude * PI / 180.0
    val deltaLat = (end.latitude - start.latitude) * PI / 180.0
    val deltaLong = (end.longitude - start.longitude) * PI / 180.0
    val a = sin(deltaLat / 2) * sin(deltaLat / 2) +
        cos(startLat) * cos(endLat) * sin(deltaLong / 2) * sin(deltaLong / 2)
    val normalizedA = a.coerceIn(0.0, 1.0)
    val c = 2 * atan2(sqrt(normalizedA), sqrt(1 - normalizedA))
    return earthRadiusMiles * c
}

private fun mapRadiusChangedEnough(current: Double?, last: Double?): Boolean {
    if (current == null || last == null) return false
    val threshold = maxOf(0.25, last * 0.15)
    return kotlin.math.abs(current - last) >= threshold
}
