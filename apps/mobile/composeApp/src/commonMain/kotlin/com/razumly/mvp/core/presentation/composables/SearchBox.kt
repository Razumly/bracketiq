package com.razumly.mvp.core.presentation.composables

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.eventSearch.util.EventFilter
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.format
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import kotlin.math.roundToInt
import kotlin.time.Duration.Companion.nanoseconds
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Composable
@OptIn(ExperimentalTime::class)
fun SearchBox(
    modifier: Modifier = Modifier,
    placeholder: String,
    query: String,
    filter: Boolean,
    currentFilter: EventFilter? = null,
    currentRadiusMiles: Double? = null,
    onRadiusChange: ((Double) -> Unit)? = null,
    onFilterChange: (EventFilter.() -> EventFilter) -> Unit,
    onChange: (String) -> Unit,
    onSearch: (String) -> Unit,
    onFocusChange: (Boolean) -> Unit,
    onPositionChange: (Offset, IntSize) -> Unit,
    onToggleFilter: (Boolean) -> Unit,
    trailingAction: (@Composable (() -> Unit))? = null,
    rowAction: (@Composable RowScope.() -> Unit)? = null,
    filterExtraContent: (@Composable (() -> Unit))? = null,
    filterTitle: String = "Filter Events",
    showDefaultFilterContent: Boolean = true,
    filterMaxHeight: Dp? = null,
    filterDismissSignal: Int = 0,
) {
    var isSearchFieldFocused by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    var showFilterDropdown by remember { mutableStateOf(false) }
    val isCurrentFilterActive = currentFilter?.let { activeFilter ->
        isFilterActive(
            filter = activeFilter,
            currentRadiusMiles = currentRadiusMiles,
        )
    } ?: false

    LaunchedEffect(showFilterDropdown) {
        onToggleFilter(showFilterDropdown)
    }
    LaunchedEffect(filterDismissSignal) {
        if (filterDismissSignal > 0) {
            showFilterDropdown = false
        }
    }
    LaunchedEffect(filter, currentFilter) {
        if (!filter || currentFilter == null) {
            showFilterDropdown = false
        }
    }
    LaunchedEffect(isSearchFieldFocused, query) {
        onFocusChange(isSearchFieldFocused || query.isNotEmpty())
    }

    Column(modifier = modifier.fillMaxWidth().onGloballyPositioned { coordinates ->
        val position = coordinates.positionInRoot()
        val size = coordinates.size
        onPositionChange(position, size)
    }) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            StandardTextField(
                value = query,
                onValueChange = onChange,
                placeholder = placeholder,
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Search"
                    )
                },
                trailingIcon = trailingAction ?: {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = {
                                onChange("")
                                focusManager.clearFocus()
                            }) {
                                Icon(
                                    imageVector = Icons.Default.Clear,
                                    contentDescription = "Clear"
                                )
                            }
                        }

                        if (filter && currentFilter != null) {
                            Box {
                                IconButton(
                                    onClick = { showFilterDropdown = !showFilterDropdown },
                                    modifier = Modifier.semantics {
                                        stateDescription = if (isCurrentFilterActive) "Active" else "Inactive"
                                    },
                                ) {
                                    Icon(
                                        Icons.Default.Menu,
                                        contentDescription = "Filter",
                                        tint = if (isCurrentFilterActive) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            MaterialTheme.colorScheme.onSurfaceVariant
                                        }
                                    )
                                }

                                if (isCurrentFilterActive) {
                                    Box(
                                        modifier = Modifier.size(8.dp).background(
                                            MaterialTheme.colorScheme.primary, CircleShape
                                        ).align(Alignment.TopEnd)
                                    )
                                }
                            }
                        }
                    }
                },
                modifier = Modifier
                    .weight(1f)
                    .onFocusChanged { focusState ->
                        isSearchFieldFocused = focusState.isFocused
                    },
                imeAction = ImeAction.Search,
                onImeAction = { onSearch(query) },
            )

            if (rowAction != null) {
                Spacer(modifier = Modifier.width(8.dp))
                rowAction()
            }
        }

        // Filter Dropdown
        if (filter && currentFilter != null) {
            FilterDropdown(visible = showFilterDropdown,
                currentFilter = currentFilter,
                currentRadiusMiles = currentRadiusMiles,
                onRadiusChange = onRadiusChange,
                maxHeight = filterMaxHeight,
                extraContent = filterExtraContent,
                title = filterTitle,
                showDefaultFilterContent = showDefaultFilterContent,
                onFilterChange = onFilterChange,
                onDismiss = { showFilterDropdown = false })
        }
    }
}

@OptIn(ExperimentalTime::class)
internal fun isFilterActive(
    filter: EventFilter,
    currentRadiusMiles: Double? = null,
    now: Instant = Clock.System.now(),
    timeZone: TimeZone = TimeZone.currentSystemDefault(),
): Boolean {
    val startLocalDate = filter.date.first.toLocalDateTime(timeZone).date
    val hasChangedStartDate = startLocalDate != now.toLocalDateTime(timeZone).date ||
        filter.date.first == startLocalDate.atStartOfDayIn(timeZone)
    return filter.price != null ||
        filter.sportIds.isNotEmpty() ||
        filter.tagSlugs.isNotEmpty() ||
        hasChangedStartDate ||
        filter.date.second != null ||
        ((currentRadiusMiles ?: 0.0) > 0.0)
}

@Composable
@OptIn(ExperimentalTime::class)
private fun FilterDropdown(
    visible: Boolean,
    currentFilter: EventFilter,
    currentRadiusMiles: Double? = null,
    onRadiusChange: ((Double) -> Unit)? = null,
    maxHeight: Dp? = null,
    extraContent: (@Composable (() -> Unit))? = null,
    title: String = "Filter Events",
    showDefaultFilterContent: Boolean = true,
    onFilterChange: (EventFilter.() -> EventFilter) -> Unit,
    onDismiss: () -> Unit
) {
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
    var isPriceInputValid by remember { mutableStateOf(true) }
    AnimatedVisibility(
        modifier = Modifier.padding(bottom = 8.dp),
        visible = visible,
        enter = expandVertically(animationSpec = tween(300)) + fadeIn(),
        exit = shrinkVertically(animationSpec = tween(300)) + fadeOut()
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .then(if (maxHeight != null) Modifier.heightIn(max = maxHeight) else Modifier),
            color = MaterialTheme.colorScheme.surfaceContainerLow,
            tonalElevation = 0.dp,
            shape = RoundedCornerShape(20.dp)
        ) {
            Box {
                Column(
                    modifier = Modifier
                        .then(if (maxHeight != null) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        )

                        TextButton(onClick = {
                            onFilterChange { EventFilter() }
                            onRadiusChange?.invoke(0.0)
                            onDismiss()
                        }) {
                            Text("Clear All")
                        }
                    }

                    if (showDefaultFilterContent) {
                        PriceFilterSection(
                            currentFilter = currentFilter,
                            onFilterChange = onFilterChange,
                            onValidityChange = { isPriceInputValid = it },
                        )

                        DateFilterSection(
                            currentFilter = currentFilter,
                            { showStartPicker = true },
                            { showEndPicker = true }
                        )
                    }

                    extraContent?.invoke()

                    if (onRadiusChange != null) {
                        DistanceFilterSection(
                            currentRadiusMiles = currentRadiusMiles ?: 0.0,
                            onRadiusChange = onRadiusChange,
                        )
                    }

                    Button(
                        onClick = onDismiss,
                        enabled = !showDefaultFilterContent || isPriceInputValid,
                        modifier = Modifier.fillMaxWidth().testTag(APPLY_FILTERS_TEST_TAG),
                    ) {
                        Text("Apply Filters")
                    }
                }
                if (showDefaultFilterContent) {
                    PlatformDateTimePicker(
                        onDateSelected = { selectedInstant ->
                            selectedInstant?.let {
                                val selectedDate = normalizeFilterStartDate(it)
                                onFilterChange {
                                    copy(date = updateFilterStartDate(date, selectedDate))
                                }
                            }
                            showStartPicker = false
                        },
                        onDismissRequest = { showStartPicker = false },
                        showPicker = showStartPicker,
                        getTime = false,
                        canSelectPast = true,
                        initialDate = currentFilter.date.first,
                    )
                    PlatformDateTimePicker(
                        onDateSelected = { selectedInstant ->
                            onFilterChange {
                                copy(
                                    date = updateFilterEndDate(
                                        currentRange = date,
                                        selectedEnd = selectedInstant?.let { normalizeFilterEndDate(it) },
                                    )
                                )
                            }
                            showEndPicker = false
                        },
                        onDismissRequest = { showEndPicker = false },
                        showPicker = showEndPicker,
                        getTime = false,
                        canSelectPast = true,
                        initialDate = currentFilter.date.second ?: currentFilter.date.first,
                    )
                }
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun DistanceFilterSection(
    currentRadiusMiles: Double,
    onRadiusChange: (Double) -> Unit,
) {
    var enabled by remember(currentRadiusMiles) {
        mutableStateOf(currentRadiusMiles > 0.0)
    }
    var radiusMiles by remember(currentRadiusMiles) {
        mutableStateOf(
            currentRadiusMiles
                .takeIf { it > 0.0 }
                ?.roundToInt()
                ?.coerceIn(DISTANCE_SLIDER_MIN_MILES, DISTANCE_SLIDER_MAX_MILES)
                ?: DEFAULT_DISTANCE_FILTER_MILES
        )
    }

    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Distance",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = if (enabled) "Within $radiusMiles mi" else "Any distance",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = enabled, onCheckedChange = { nextEnabled ->
                enabled = nextEnabled
                onRadiusChange(if (nextEnabled) radiusMiles.toDouble() else 0.0)
            })
        }

        if (enabled) {
            Slider(
                value = radiusMiles.toFloat(),
                onValueChange = { value ->
                    radiusMiles = value.roundToInt()
                },
                onValueChangeFinished = {
                    onRadiusChange(radiusMiles.toDouble())
                },
                valueRange = DISTANCE_SLIDER_MIN_MILES.toFloat()..DISTANCE_SLIDER_MAX_MILES.toFloat(),
                track = { sliderState ->
                    SliderDefaults.Track(
                        sliderState = sliderState,
                        drawStopIndicator = null,
                    )
                },
                modifier = Modifier.padding(top = 4.dp)
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "${DISTANCE_SLIDER_MIN_MILES} mi",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "${DISTANCE_SLIDER_MAX_MILES} mi",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private const val DEFAULT_DISTANCE_FILTER_MILES = 50
private const val DISTANCE_SLIDER_MIN_MILES = 10
private const val DISTANCE_SLIDER_MAX_MILES = 100

@Composable
@OptIn(ExperimentalTime::class)
private fun PriceFilterSection(
    currentFilter: EventFilter,
    onFilterChange: (EventFilter.() -> EventFilter) -> Unit,
    onValidityChange: (Boolean) -> Unit,
) {
    var enablePriceFilter by remember(currentFilter.price) {
        mutableStateOf(currentFilter.price != null)
    }
    var minPriceInput by remember(currentFilter.price) {
        mutableStateOf(formatPriceInput(currentFilter.price?.first ?: DEFAULT_MIN_PRICE))
    }
    var maxPriceInput by remember(currentFilter.price) {
        mutableStateOf(formatPriceInput(currentFilter.price?.second ?: DEFAULT_MAX_PRICE))
    }
    val validation = validatePriceRangeInput(minPriceInput, maxPriceInput)

    LaunchedEffect(enablePriceFilter, validation.isValid) {
        onValidityChange(!enablePriceFilter || validation.isValid)
    }

    fun applyValidPriceInput(minInput: String, maxInput: String) {
        validatePriceRangeInput(minInput, maxInput).range?.let { nextRange ->
            onFilterChange { copy(price = nextRange) }
        }
    }

    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Price Range",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Switch(checked = enablePriceFilter, onCheckedChange = { enabled ->
                enablePriceFilter = enabled
                onFilterChange {
                    copy(price = if (enabled) validation.range else null)
                }
            }, modifier = Modifier.testTag(PRICE_FILTER_SWITCH_TEST_TAG))
        }

        if (enablePriceFilter) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                PriceTextField(
                    value = minPriceInput,
                    label = "Min",
                    onValueChange = { nextValue ->
                        minPriceInput = nextValue
                        applyValidPriceInput(nextValue, maxPriceInput)
                    },
                    isError = !validation.isValid,
                    testTag = MIN_PRICE_INPUT_TEST_TAG,
                    modifier = Modifier.weight(1f),
                )
                PriceTextField(
                    value = maxPriceInput,
                    label = "Max",
                    onValueChange = { nextValue ->
                        maxPriceInput = nextValue
                        applyValidPriceInput(minPriceInput, nextValue)
                    },
                    isError = !validation.isValid,
                    testTag = MAX_PRICE_INPUT_TEST_TAG,
                    modifier = Modifier.weight(1f),
                )
            }
            validation.errorMessage?.let { errorMessage ->
                Text(
                    text = errorMessage,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun PriceTextField(
    value: String,
    label: String,
    onValueChange: (String) -> Unit,
    isError: Boolean,
    testTag: String,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { input ->
            val normalized = normalizePriceInput(input)
            onValueChange(normalized)
        },
        modifier = modifier.testTag(testTag),
        singleLine = true,
        label = { Text(label) },
        leadingIcon = { Text("$") },
        isError = isError,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = MaterialTheme.colorScheme.outline,
            focusedLabelColor = MaterialTheme.colorScheme.primary,
            unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
    )
}

internal data class PriceRangeInputValidation(
    val range: Pair<Double, Double>? = null,
    val errorMessage: String? = null,
) {
    val isValid: Boolean
        get() = range != null
}

internal fun validatePriceRangeInput(
    minInput: String,
    maxInput: String,
): PriceRangeInputValidation {
    if (minInput.isBlank() || maxInput.isBlank()) {
        return PriceRangeInputValidation(errorMessage = "Enter both a minimum and maximum price.")
    }

    val minPrice = minInput.toDoubleOrNull()
    val maxPrice = maxInput.toDoubleOrNull()
    if (
        minPrice == null ||
        maxPrice == null ||
        !minPrice.isFinite() ||
        !maxPrice.isFinite() ||
        minPrice < 0.0 ||
        maxPrice < 0.0
    ) {
        return PriceRangeInputValidation(errorMessage = "Enter valid non-negative prices.")
    }
    if (minPrice > maxPrice) {
        return PriceRangeInputValidation(errorMessage = "Minimum price cannot exceed maximum price.")
    }

    return PriceRangeInputValidation(range = minPrice to maxPrice)
}

internal fun normalizePriceInput(input: String): String {
    var hasDecimalPoint = false
    return buildString {
        input.forEach { character ->
            when {
                character.isDigit() -> append(character)
                character == '.' && !hasDecimalPoint -> {
                    if (isEmpty()) append('0')
                    append(character)
                    hasDecimalPoint = true
                }
            }
        }
    }
}

private fun formatPriceInput(price: Double): String = price.toString().removeSuffix(".0")

private const val DEFAULT_MIN_PRICE = 0.0
private const val DEFAULT_MAX_PRICE = 100.0
internal const val PRICE_FILTER_SWITCH_TEST_TAG = "event-filter-price-switch"
internal const val MIN_PRICE_INPUT_TEST_TAG = "event-filter-min-price"
internal const val MAX_PRICE_INPUT_TEST_TAG = "event-filter-max-price"
internal const val APPLY_FILTERS_TEST_TAG = "event-filter-apply"
internal const val START_DATE_FILTER_FIELD_TEST_TAG = "event-filter-start-date"
internal const val END_DATE_FILTER_FIELD_TEST_TAG = "event-filter-end-date"

@OptIn(ExperimentalTime::class)
internal fun normalizeFilterStartDate(
    selected: Instant,
    timeZone: TimeZone = TimeZone.currentSystemDefault(),
): Instant = selected.toLocalDateTime(timeZone).date.atStartOfDayIn(timeZone)

@OptIn(ExperimentalTime::class)
internal fun normalizeFilterEndDate(
    selected: Instant,
    timeZone: TimeZone = TimeZone.currentSystemDefault(),
): Instant = selected
    .toLocalDateTime(timeZone)
    .date
    .plus(1, DateTimeUnit.DAY)
    .atStartOfDayIn(timeZone) - 1.nanoseconds

@OptIn(ExperimentalTime::class)
internal fun updateFilterStartDate(
    currentRange: Pair<Instant, Instant?>,
    selectedStart: Instant,
    timeZone: TimeZone = TimeZone.currentSystemDefault(),
): Pair<Instant, Instant?> {
    val clampedEnd = currentRange.second?.let { currentEnd ->
        if (currentEnd < selectedStart) normalizeFilterEndDate(selectedStart, timeZone) else currentEnd
    }
    return selectedStart to clampedEnd
}

@OptIn(ExperimentalTime::class)
internal fun updateFilterEndDate(
    currentRange: Pair<Instant, Instant?>,
    selectedEnd: Instant?,
    timeZone: TimeZone = TimeZone.currentSystemDefault(),
): Pair<Instant, Instant?> {
    if (selectedEnd == null) return currentRange.first to null
    val clampedStart = if (currentRange.first > selectedEnd) {
        normalizeFilterStartDate(selectedEnd, timeZone)
    } else {
        currentRange.first
    }
    return clampedStart to selectedEnd
}

@Composable
@OptIn(ExperimentalTime::class)
private fun DateFilterSection(
    currentFilter: EventFilter, onStartDateClicked: () -> Unit, onEndDateClicked: () -> Unit
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Date Range",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            FilterDateField(
                value = currentFilter.date.first.toLocalDateTime(
                    TimeZone.currentSystemDefault()
                ).date.format(dateFormat),
                modifier = Modifier.weight(1f),
                label = "Start Date",
                testTag = START_DATE_FILTER_FIELD_TEST_TAG,
                onClick = onStartDateClicked,
            )
            FilterDateField(
                value = currentFilter.date.second?.toLocalDateTime(
                    TimeZone.currentSystemDefault()
                )?.date?.format(dateFormat) ?: "Select an End Date",
                modifier = Modifier.weight(1f),
                label = "End Date",
                testTag = END_DATE_FILTER_FIELD_TEST_TAG,
                onClick = onEndDateClicked,
            )
        }
    }
}

@Composable
private fun FilterDateField(
    value: String,
    label: String,
    testTag: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .testTag(testTag)
            .semantics {
                contentDescription = label
                stateDescription = value
            }
            .clickable(
                role = Role.Button,
                onClick = onClick,
            ),
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            modifier = Modifier.fillMaxWidth(),
            label = { Text(label) },
            enabled = true,
            readOnly = true,
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = MaterialTheme.colorScheme.onSurface,
                unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                focusedLabelColor = MaterialTheme.colorScheme.primary,
                unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        )
        Box(
            modifier = Modifier
                .matchParentSize()
                .clip(OutlinedTextFieldDefaults.shape)
                .clickable(
                    role = Role.Button,
                    onClick = onClick,
                )
                .clearAndSetSemantics {},
        )
    }
}
