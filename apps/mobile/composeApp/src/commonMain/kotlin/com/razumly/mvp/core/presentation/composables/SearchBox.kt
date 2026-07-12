package com.razumly.mvp.core.presentation.composables

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.eventSearch.util.EventFilter
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.math.roundToInt
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

@Composable
@OptIn(ExperimentalTime::class)
fun SearchBox(
    modifier: Modifier = Modifier,
    placeholder: String,
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
    showPriceFilter: Boolean = showDefaultFilterContent,
    showDateFilter: Boolean = showDefaultFilterContent,
    filterMaxHeight: Dp? = null,
    filterDismissSignal: Int = 0,
) {
    var searchInput by remember { mutableStateOf("") }
    var isSearchFieldFocused by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    var showFilterDropdown by remember { mutableStateOf(false) }

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
    LaunchedEffect(isSearchFieldFocused, searchInput) {
        onFocusChange(isSearchFieldFocused || searchInput.isNotEmpty())
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
                value = searchInput,
                onValueChange = { newQuery ->
                    searchInput = newQuery
                    onChange(newQuery)
                },
                placeholder = placeholder,
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Search"
                    )
                },
                trailingIcon = trailingAction ?: {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (searchInput.isNotEmpty()) {
                            IconButton(onClick = {
                                searchInput = ""
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
                                IconButton(onClick = { showFilterDropdown = !showFilterDropdown }) {
                                    Icon(
                                        Icons.Default.Menu,
                                        contentDescription = "Filter",
                                        tint = if (isFilterActive(currentFilter, currentRadiusMiles)) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            MaterialTheme.colorScheme.onSurfaceVariant
                                        }
                                    )
                                }

                                if (isFilterActive(currentFilter, currentRadiusMiles)) {
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
                showPriceFilter = showPriceFilter,
                showDateFilter = showDateFilter,
                onFilterChange = onFilterChange,
                onDismiss = { showFilterDropdown = false })
        }
    }
}

@OptIn(ExperimentalTime::class)
private fun isFilterActive(filter: EventFilter, currentRadiusMiles: Double? = null): Boolean {
    return filter.price != null ||
        filter.sportIds.isNotEmpty() ||
        filter.tagSlugs.isNotEmpty() ||
        filter.divisionGenders.isNotEmpty() ||
        filter.skillDivisionTypeIds.isNotEmpty() ||
        filter.ageDivisionTypeIds.isNotEmpty() ||
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
    showPriceFilter: Boolean = true,
    showDateFilter: Boolean = true,
    onFilterChange: (EventFilter.() -> EventFilter) -> Unit,
    onDismiss: () -> Unit
) {
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
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

                    if (showPriceFilter) {
                        PriceFilterSection(
                            currentFilter = currentFilter, onFilterChange = onFilterChange
                        )
                    }
                    if (showDateFilter) {
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
                        onClick = onDismiss, modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Apply Filters")
                    }
                }
                if (showDateFilter) {
                    PlatformDateTimePicker(
                        onDateSelected = { selectedInstant ->
                            onFilterChange {
                                copy(
                                    date = (selectedInstant ?: Clock.System.now()) to date.second
                                )
                            }
                            showStartPicker = false
                        },
                        onDismissRequest = { showStartPicker = false },
                        showPicker = showStartPicker,
                        getTime = false,
                        canSelectPast = true,
                    )
                    PlatformDateTimePicker(
                        onDateSelected = { selectedInstant ->
                            onFilterChange {
                                copy(
                                    date = date.first to selectedInstant
                                )
                            }
                            showEndPicker = false
                        },
                        onDismissRequest = { showEndPicker = false },
                        showPicker = showEndPicker,
                        getTime = false,
                        canSelectPast = true,
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
    currentFilter: EventFilter, onFilterChange: (EventFilter.() -> EventFilter) -> Unit
) {
    var enablePriceFilter by remember(currentFilter.price) {
        mutableStateOf(currentFilter.price != null)
    }
    var priceRange by remember(currentFilter.price) {
        mutableStateOf(currentFilter.price ?: (0.0 to 100.0))
    }
    var minPriceInput by remember(currentFilter.price) {
        mutableStateOf(priceRange.first.toInt().toString())
    }
    var maxPriceInput by remember(currentFilter.price) {
        mutableStateOf(priceRange.second.toInt().toString())
    }

    fun updatePriceFilter(minInput: String, maxInput: String) {
        val minPrice = minInput.toDoubleOrNull() ?: return
        val maxPrice = maxInput.toDoubleOrNull() ?: return
        if (minPrice > maxPrice) return
        val nextRange = minPrice to maxPrice
        priceRange = nextRange
        onFilterChange { copy(price = nextRange) }
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
                    copy(price = if (enabled) priceRange else null)
                }
            })
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
                        updatePriceFilter(nextValue, maxPriceInput)
                    },
                    modifier = Modifier.weight(1f),
                )
                PriceTextField(
                    value = maxPriceInput,
                    label = "Max",
                    onValueChange = { nextValue ->
                        maxPriceInput = nextValue
                        updatePriceFilter(minPriceInput, nextValue)
                    },
                    modifier = Modifier.weight(1f),
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
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { input ->
            val normalized = input.filter(Char::isDigit)
            onValueChange(normalized)
        },
        modifier = modifier,
        singleLine = true,
        label = { Text(label) },
        leadingIcon = { Text("$") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = MaterialTheme.colorScheme.outline,
            focusedLabelColor = MaterialTheme.colorScheme.primary,
            unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
    )
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
                onClick = onStartDateClicked,
            )
            FilterDateField(
                value = currentFilter.date.second?.toLocalDateTime(
                    TimeZone.currentSystemDefault()
                )?.date?.format(dateFormat) ?: "Select an End Date",
                modifier = Modifier.weight(1f),
                label = "End Date",
                onClick = onEndDateClicked,
            )
        }
    }
}

@Composable
private fun FilterDateField(
    value: String,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.clickable(
            indication = null,
            interactionSource = remember { MutableInteractionSource() },
            onClick = onClick,
        )
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            modifier = Modifier.fillMaxWidth(),
            label = { Text(label) },
            enabled = false,
            readOnly = true,
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                disabledTextColor = MaterialTheme.colorScheme.onSurface,
                disabledContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                disabledBorderColor = MaterialTheme.colorScheme.surfaceContainerLow,
                disabledLabelColor = MaterialTheme.colorScheme.onSurface,
            ),
        )
    }
}
