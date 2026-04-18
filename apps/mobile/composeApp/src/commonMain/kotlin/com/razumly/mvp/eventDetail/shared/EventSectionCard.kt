package com.razumly.mvp.eventDetail.shared

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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.razumly.mvp.core.presentation.util.transitionSpec

@OptIn(ExperimentalFoundationApi::class)
internal fun LazyListScope.animatedCardSection(
    sectionId: String,
    sectionExpansionStates: SnapshotStateMap<String, Boolean>,
    sectionTitle: String? = null,
    collapsibleInEditMode: Boolean = false,
    collapsibleInViewMode: Boolean = false,
    requiredMissingCount: Int = 0,
    viewSummary: String? = null,
    editSummary: String? = null,
    isEditMode: Boolean,
    lazyListState: LazyListState? = null,
    stickyHeaderTopInset: Dp = 0.dp,
    animationDelay: Int = 0,
    viewContent: @Composable() (ColumnScope.() -> Unit),
    editContent: @Composable() (ColumnScope.() -> Unit)
) {
    val isCollapsible = if (isEditMode) collapsibleInEditMode else collapsibleInViewMode
    val shouldUseStickyHeader = isCollapsible && sectionTitle != null
    val horizontalCardPadding = if (shouldUseStickyHeader) 0.dp else 16.dp
    val sectionStateKey = "$sectionId:${if (isEditMode) "edit" else "view"}"
    val headerKey = "${sectionStateKey}_header"
    val expanded = sectionExpansionStates[sectionStateKey] ?: false
    val summaryText = if (isEditMode) editSummary else viewSummary

    if (shouldUseStickyHeader) {
        stickyHeader(key = headerKey) {
            val isPinned by remember(lazyListState, headerKey) {
                derivedStateOf {
                    lazyListState?.layoutInfo?.visibleItemsInfo?.any { itemInfo ->
                        itemInfo.key == headerKey && itemInfo.offset <= 0
                    } == true
                }
            }
            CollapsibleSectionHeaderCard(
                title = sectionTitle,
                expanded = expanded,
                summaryText = summaryText,
                requiredMissingCount = requiredMissingCount,
                horizontalCardPadding = horizontalCardPadding,
                topInset = stickyHeaderTopInset,
                isPinned = isPinned,
                onToggleExpanded = {
                    sectionExpansionStates[sectionStateKey] = !expanded
                },
            )
        }

        item(key = "${sectionStateKey}_body") {
            CollapsibleSectionBodyCard(
                expanded = expanded,
                isEditMode = isEditMode,
                animationDelay = animationDelay,
                horizontalCardPadding = horizontalCardPadding,
                viewContent = viewContent,
                editContent = editContent,
            )
        }

        return
    }

    item(key = sectionId) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface),
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp, horizontal = horizontalCardPadding),
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
                        Text(
                            text = sectionTitle,
                            style = MaterialTheme.typography.titleMedium,
                            color = Color(localImageScheme.current.onSurface),
                        )
                    }

                    SectionCardAnimatedContent(
                        isEditMode = isEditMode,
                        animationDelay = animationDelay,
                        viewContent = viewContent,
                        editContent = editContent,
                    )
                }
            }
        }
    }
}

@Composable
private fun CollapsibleSectionHeaderCard(
    title: String,
    expanded: Boolean,
    summaryText: String?,
    requiredMissingCount: Int,
    horizontalCardPadding: Dp,
    topInset: Dp,
    isPinned: Boolean,
    onToggleExpanded: () -> Unit,
) {
    val bottomCornerSize = if (expanded) 0.dp else 16.dp
    val stickyHeaderTopSpacing = 6.dp
    val pinnedTopInset by animateDpAsState(
        targetValue = if (isPinned) topInset else 0.dp,
        label = "pinnedHeaderTopInset",
    )
    val pinnedHeaderOffset = (pinnedTopInset - stickyHeaderTopSpacing).coerceAtLeast(0.dp)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .zIndex(1f)
            .background(MaterialTheme.colorScheme.surface),
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .offset(y = pinnedHeaderOffset)
                .padding(
                    start = horizontalCardPadding,
                    end = horizontalCardPadding,
                    top = stickyHeaderTopSpacing,
                    bottom = if (expanded) 0.dp else 6.dp,
                ),
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = bottomCornerSize,
                bottomEnd = bottomCornerSize,
            ),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggleExpanded)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium,
                        color = Color(localImageScheme.current.onSurface),
                        modifier = Modifier.weight(1f),
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (requiredMissingCount > 0) {
                            Box(
                                modifier = Modifier
                                    .padding(end = 6.dp)
                                    .size(20.dp)
                                    .background(
                                        color = MaterialTheme.colorScheme.error,
                                        shape = RoundedCornerShape(999.dp),
                                    ),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = if (requiredMissingCount > 99) "99+" else requiredMissingCount.toString(),
                                    color = Color.White,
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            }
                        }
                        Icon(
                            imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = if (expanded) "Collapse section" else "Expand section",
                        )
                    }
                }

                if (!expanded && !summaryText.isNullOrBlank()) {
                    Text(
                        text = summaryText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun CollapsibleSectionBodyCard(
    expanded: Boolean,
    isEditMode: Boolean,
    animationDelay: Int,
    horizontalCardPadding: Dp,
    viewContent: @Composable() (ColumnScope.() -> Unit),
    editContent: @Composable() (ColumnScope.() -> Unit),
) {
    AnimatedVisibility(visible = expanded) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface),
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = horizontalCardPadding, end = horizontalCardPadding, bottom = 6.dp)
                    .offset(y = (-1).dp),
                shape = RoundedCornerShape(
                    topStart = 0.dp,
                    topEnd = 0.dp,
                    bottomStart = 16.dp,
                    bottomEnd = 16.dp,
                ),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                ) {
                    SectionCardAnimatedContent(
                        isEditMode = isEditMode,
                        animationDelay = animationDelay,
                        viewContent = viewContent,
                        editContent = editContent,
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionCardAnimatedContent(
    isEditMode: Boolean,
    animationDelay: Int,
    viewContent: @Composable() (ColumnScope.() -> Unit),
    editContent: @Composable() (ColumnScope.() -> Unit),
) {
    AnimatedContent(
        targetState = isEditMode,
        transitionSpec = { transitionSpec(animationDelay) },
        label = "cardTransition",
    ) { editMode ->
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (editMode) {
                editContent()
            } else {
                viewContent()
            }
        }
    }
}
