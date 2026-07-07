package com.razumly.mvp.eventSearch.tabs.rentals

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.eventSearch.composables.EmptyDiscoverListItem
import com.razumly.mvp.eventSearch.tabs.rentals.composables.DiscoverRentalCard
import com.razumly.mvp.eventSearch.tabs.rentals.composables.DiscoverRentalCardPlaceholder
import com.razumly.mvp.core.presentation.guides.guideTarget

private const val DISCOVER_RENTAL_PLACEHOLDER_COUNT = 4

@Composable
fun DiscoverRentalList(
    organizations: List<Organization>,
    isLoading: Boolean,
    hasMore: Boolean,
    onLoadMore: () -> Unit,
    listState: LazyListState,
    firstElementPadding: PaddingValues,
    lastElementPadding: PaddingValues,
    emptyMessage: String,
    firstItemGuideTargetId: String? = null,
    onOrganizationClick: (Organization) -> Unit,
) {
    var lastLoadRequestKey by remember { mutableStateOf<String?>(null) }
    val hasTrailingStatusItem = organizations.isNotEmpty() && isLoading

    LaunchedEffect(listState, organizations.size, hasMore, isLoading) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1 }
            .collect { lastVisibleIndex ->
                val nearListEnd = organizations.isNotEmpty() && lastVisibleIndex >= organizations.lastIndex - 2
                val currentRequestKey = "${organizations.size}:${organizations.lastOrNull()?.id.orEmpty()}"
                val canRequestMore = hasMore && !isLoading && nearListEnd && lastLoadRequestKey != currentRequestKey
                if (canRequestMore) {
                    lastLoadRequestKey = currentRequestKey
                    onLoadMore()
                }
            }
    }

    LazyColumn(
        state = listState,
    ) {
        if (organizations.isEmpty()) {
            if (isLoading) {
                items(DISCOVER_RENTAL_PLACEHOLDER_COUNT) { index ->
                    val padding = when (index) {
                        0 -> firstElementPadding
                        DISCOVER_RENTAL_PLACEHOLDER_COUNT - 1 -> lastElementPadding
                        else -> PaddingValues()
                    }

                    DiscoverRentalCardPlaceholder(
                        modifier = Modifier
                            .padding(padding)
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                            .fillMaxWidth()
                    )
                }
            } else {
                item {
                    EmptyDiscoverListItem(
                        message = emptyMessage,
                        modifier = Modifier
                            .padding(firstElementPadding)
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }
            }
            return@LazyColumn
        }

        itemsIndexed(organizations, key = { _, organization -> organization.id }) { index, organization ->
            val padding = when (index) {
                0 -> firstElementPadding
                organizations.size - 1 -> if (hasTrailingStatusItem) PaddingValues() else lastElementPadding
                else -> PaddingValues()
            }

            DiscoverRentalCard(
                organization = organization,
                onClick = { onOrganizationClick(organization) },
                modifier = Modifier
                    .padding(padding)
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .fillMaxWidth()
                    .then(
                        if (index == 0 && firstItemGuideTargetId != null) {
                            Modifier.guideTarget(firstItemGuideTargetId)
                        } else {
                            Modifier
                        }
                    )
            )
        }

        if (isLoading && organizations.isNotEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(lastElementPadding)
                        .padding(16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
        }
    }
}
