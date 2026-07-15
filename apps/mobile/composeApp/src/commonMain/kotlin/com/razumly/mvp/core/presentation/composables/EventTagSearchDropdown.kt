package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToDownIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.PopupProperties
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.eventTagIdentity
import com.razumly.mvp.core.data.dataTypes.eventTagLabelWithCount
import com.razumly.mvp.core.data.dataTypes.normalizedEventTag

private val SystemTagChipContainer = Color(0xFFE3F2FD)
private val SystemTagChipContent = Color(0xFF1565C0)
private val SystemTagChipSelectedContainer = Color(0xFF1565C0)
private val CommunityTagChipContainer = Color(0xFFE8F5E9)
private val CommunityTagChipContent = Color(0xFF166534)
private val CommunityTagChipSelectedContainer = Color(0xFF2E7D32)
private val TagChipSelectedContent = Color.White

@Composable
fun EventTagSearchDropdown(
    value: String,
    onValueChange: (String) -> Unit,
    tags: List<EventTag>,
    selectedTagSlugs: Set<String>,
    onTagSelected: (EventTag) -> Unit,
    modifier: Modifier = Modifier,
    label: String = "",
    placeholder: String = "Search tags",
    enabled: Boolean = true,
    hideSelectedOptions: Boolean = false,
    allowCustomTag: Boolean = false,
    onCustomTagAdded: ((EventTag) -> Unit)? = null,
    clearQueryOnSelect: Boolean = true,
    collapseOnSelect: Boolean = false,
    excludedTagSlugs: Set<String> = emptySet(),
    maxVisibleTags: Int = 5,
) {
    var expanded by remember { mutableStateOf(false) }
    var suppressFocusedExpansion by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val focusRequester = remember { FocusRequester() }
    val normalizedQuery = value.trim().lowercase()
    val visibleTags = remember(tags, selectedTagSlugs, normalizedQuery, hideSelectedOptions, excludedTagSlugs, maxVisibleTags) {
        tags
            .filter { tag ->
                !hideSelectedOptions || tag.eventTagIdentity() !in selectedTagSlugs
            }
            .filter { tag ->
                tag.eventTagIdentity() !in excludedTagSlugs
            }
            .filter { tag ->
                normalizedQuery.isBlank() ||
                    tag.name.lowercase().contains(normalizedQuery) ||
                    tag.slug.lowercase().contains(normalizedQuery)
            }
            .sortedWith(
                compareByDescending<EventTag> { tag -> tag.eventCount }
                    .thenBy { tag -> tag.name.lowercase() },
            )
            .take(maxVisibleTags)
    }
    val typedTag = remember(value, tags, selectedTagSlugs, excludedTagSlugs, allowCustomTag) {
        if (!allowCustomTag) {
            null
        } else {
            EventTag(name = value)
                .normalizedEventTag()
                ?.takeIf { tag ->
                    tag.eventTagIdentity() !in selectedTagSlugs &&
                        tag.eventTagIdentity() !in excludedTagSlugs &&
                        tags.none { option -> option.eventTagIdentity() == tag.eventTagIdentity() }
                }
        }
    }
    val hasDropdownContent = visibleTags.isNotEmpty() || typedTag != null
    @Composable
    fun tagChipColors(tag: EventTag) = if (tag.isSystem) {
        FilterChipDefaults.filterChipColors(
            containerColor = SystemTagChipContainer,
            labelColor = SystemTagChipContent,
            iconColor = SystemTagChipContent,
            selectedContainerColor = SystemTagChipSelectedContainer,
            selectedLabelColor = TagChipSelectedContent,
            selectedLeadingIconColor = TagChipSelectedContent,
            selectedTrailingIconColor = TagChipSelectedContent,
        )
    } else {
        FilterChipDefaults.filterChipColors(
            containerColor = CommunityTagChipContainer,
            labelColor = CommunityTagChipContent,
            iconColor = CommunityTagChipContent,
            selectedContainerColor = CommunityTagChipSelectedContainer,
            selectedLabelColor = TagChipSelectedContent,
            selectedLeadingIconColor = TagChipSelectedContent,
            selectedTrailingIconColor = TagChipSelectedContent,
        )
    }

    fun selectTag(tag: EventTag) {
        onTagSelected(tag)
        if (clearQueryOnSelect) {
            onValueChange("")
        }
        if (collapseOnSelect) {
            suppressFocusedExpansion = true
            expanded = false
            focusManager.clearFocus()
        } else {
            expanded = true
        }
    }

    fun addTypedTag() {
        val tag = typedTag ?: return
        onCustomTagAdded?.invoke(tag)
        if (clearQueryOnSelect) {
            onValueChange("")
        }
        if (collapseOnSelect) {
            suppressFocusedExpansion = true
            expanded = false
            focusManager.clearFocus()
        } else {
            expanded = true
        }
    }

    Box(modifier = modifier) {
        StandardTextField(
            value = value,
            onValueChange = {
                suppressFocusedExpansion = false
                onValueChange(it)
                expanded = true
            },
            label = label,
            placeholder = placeholder,
            enabled = enabled,
            leadingIcon = {
                Icon(
                    imageVector = Icons.Default.Search,
                    contentDescription = "Search tags",
                )
            },
            imeAction = ImeAction.Done,
            onImeAction = {
                if (typedTag != null) {
                    addTypedTag()
                }
            },
            onTap = {
                suppressFocusedExpansion = false
                expanded = true
            },
            onFocusChanged = { isFocused ->
                if (isFocused && !suppressFocusedExpansion) {
                    expanded = true
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focusRequester)
                .then(
                    if (enabled) {
                        Modifier.semantics {
                            onClick {
                                suppressFocusedExpansion = false
                                expanded = true
                                focusRequester.requestFocus()
                                true
                            }
                        }
                    } else {
                        Modifier
                    },
                )
                .pointerInput(enabled) {
                    if (!enabled) return@pointerInput
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent(PointerEventPass.Initial)
                            if (event.changes.any { it.changedToDownIgnoreConsumed() }) {
                                suppressFocusedExpansion = false
                                expanded = true
                            }
                        }
                    }
                },
        )
        DropdownMenu(
            expanded = enabled && expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.fillMaxWidth(),
            properties = PopupProperties(focusable = false),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 220.dp)
                    .verticalScroll(rememberScrollState())
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (!hasDropdownContent) {
                    Text(
                        text = if (normalizedQuery.isBlank()) {
                            "No tags available."
                        } else {
                            "No tags match this search."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        typedTag?.let { tag ->
                            FilterChip(
                                selected = false,
                                onClick = ::addTypedTag,
                                colors = tagChipColors(tag),
                                label = {
                                    Text(
                                        text = tag.name,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                },
                            )
                        }
                        visibleTags.forEach { tag ->
                            val identity = tag.eventTagIdentity()
                            FilterChip(
                                selected = identity in selectedTagSlugs,
                                onClick = { selectTag(tag) },
                                colors = tagChipColors(tag),
                                label = {
                                    Text(
                                        text = tag.eventTagLabelWithCount(),
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
    }
}
