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
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RangeSlider
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
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.eventSearch.util.EventFilter
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

@Composable
@OptIn(ExperimentalTime::class)
fun SearchBox(
    modifier: Modifier = Modifier,
    placeholder: String,
    filter: Boolean,
    currentFilter: EventFilter? = null,
    onFilterChange: (EventFilter.() -> EventFilter) -> Unit,
    onChange: (String) -> Unit,
    onSearch: (String) -> Unit,
    onFocusChange: (Boolean) -> Unit,
    onPositionChange: (Offset, IntSize) -> Unit,
    onToggleFilter: (Boolean) -> Unit,
    trailingAction: (@Composable (() -> Unit))? = null,
    rowAction: (@Composable RowScope.() -> Unit)? = null,
) {
    var searchInput by remember { mutableStateOf("") }
    var isSearchFieldFocused by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    var showFilterDropdown by remember { mutableStateOf(false) }

    LaunchedEffect(showFilterDropdown) {
        onToggleFilter(showFilterDropdown)
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
                },
                modifier = Modifier
                    .weight(1f)
                    .onFocusChanged { focusState ->
                        isSearchFieldFocused = focusState.isFocused
                    },
            )

            if (filter && currentFilter != null) {
                Spacer(modifier = Modifier.width(8.dp))

                // Filter Button with Badge
                Box {
                    IconButton(onClick = { showFilterDropdown = !showFilterDropdown }) {
                        Icon(
                            Icons.Default.Menu,
                            contentDescription = "Filter",
                            tint = if (isFilterActive(currentFilter)) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    // Active filter indicator
                    if (isFilterActive(currentFilter)) {
                        Box(
                            modifier = Modifier.size(8.dp).background(
                                MaterialTheme.colorScheme.primary, CircleShape
                            ).align(Alignment.TopEnd)
                        )
                    }
                }
            }

            if (rowAction != null) {
                Spacer(modifier = Modifier.width(8.dp))
                rowAction()
            }
        }

        // Filter Dropdown
        if (filter && currentFilter != null) {
            FilterDropdown(visible = showFilterDropdown,
                currentFilter = currentFilter,
                onFilterChange = onFilterChange,
                onDismiss = { showFilterDropdown = false })
        }
    }
}

@OptIn(ExperimentalTime::class)
private fun isFilterActive(filter: EventFilter): Boolean {
    return filter.eventType != null || filter.price != null || filter.date.second != null
}

@Composable
@OptIn(ExperimentalTime::class)
private fun FilterDropdown(
    visible: Boolean,
    currentFilter: EventFilter,
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
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            color = MaterialTheme.colorScheme.surfaceContainerLow,
            tonalElevation = 0.dp,
            shape = RoundedCornerShape(12.dp)
        ) {
            Box {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Filter Events",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )

                        TextButton(onClick = {
                            onFilterChange { EventFilter() }
                            onDismiss()
                        }) {
                            Text("Clear All")
                        }
                    }

                    EventTypeFilterSection(
                        currentFilter = currentFilter, onFilterChange = onFilterChange
                    )

                    PriceFilterSection(
                        currentFilter = currentFilter, onFilterChange = onFilterChange
                    )

                    DateFilterSection(
                        currentFilter = currentFilter,
                        { showStartPicker = true },
                        { showEndPicker = true }
                    )

                    Button(
                        onClick = onDismiss, modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Apply Filters")
                    }
                }
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

@Composable
@OptIn(ExperimentalTime::class)
private fun EventTypeFilterSection(
    currentFilter: EventFilter, onFilterChange: (EventFilter.() -> EventFilter) -> Unit
) {
    Column {
        Text(
            text = "Event Type",
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp)
        ) {
            EventTypeFilterChip(
                selected = currentFilter.eventType == null,
                label = "All",
                onClick = { onFilterChange { copy(eventType = null) } },
            )

            EventTypeFilterChip(
                selected = currentFilter.eventType == EventType.TOURNAMENT,
                label = "Tournaments",
                onClick = { onFilterChange { copy(eventType = EventType.TOURNAMENT) } },
            )

            EventTypeFilterChip(
                selected = currentFilter.eventType == EventType.EVENT,
                label = "Events",
                onClick = { onFilterChange { copy(eventType = EventType.EVENT) } },
            )

            EventTypeFilterChip(
                selected = currentFilter.eventType == EventType.LEAGUE,
                label = "Leagues",
                onClick = { onFilterChange { copy(eventType = EventType.LEAGUE) } },
            )
        }
    }
}

@Composable
private fun EventTypeFilterChip(
    selected: Boolean,
    label: String,
    onClick: () -> Unit,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        colors = FilterChipDefaults.filterChipColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
            labelColor = MaterialTheme.colorScheme.onSurface,
            selectedContainerColor = MaterialTheme.colorScheme.primary,
            selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = selected,
            borderColor = MaterialTheme.colorScheme.outline,
            selectedBorderColor = MaterialTheme.colorScheme.primary,
        ),
    )
}

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
            Text(
                text = "$${priceRange.first.toInt()} - $${priceRange.second.toInt()}",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 8.dp)
            )

            RangeSlider(
                value = priceRange.first.toFloat()..priceRange.second.toFloat(),
                onValueChange = { range ->
                    priceRange = range.start.toDouble() to range.endInclusive.toDouble()
                    onFilterChange { copy(price = priceRange) }
                },
                valueRange = 0f..200f,
                steps = 19,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
    }
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
