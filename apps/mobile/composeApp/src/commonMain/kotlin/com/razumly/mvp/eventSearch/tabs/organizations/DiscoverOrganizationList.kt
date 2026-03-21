package com.razumly.mvp.eventSearch.tabs.organizations

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.eventSearch.composables.EmptyDiscoverListItem
import com.razumly.mvp.eventSearch.tabs.organizations.composables.DiscoverOrganizationCard
import com.razumly.mvp.eventSearch.tabs.organizations.composables.DiscoverOrganizationCardPlaceholder

private const val DISCOVER_ORGANIZATION_PLACEHOLDER_COUNT = 4

@Composable
fun DiscoverOrganizationList(
    organizations: List<Organization>,
    isLoading: Boolean,
    listState: LazyListState,
    firstElementPadding: PaddingValues,
    lastElementPadding: PaddingValues,
    emptyMessage: String,
    onOrganizationClick: (Organization) -> Unit,
) {
    LazyColumn(
        state = listState,
    ) {
        if (organizations.isEmpty()) {
            if (isLoading) {
                items(DISCOVER_ORGANIZATION_PLACEHOLDER_COUNT) { index ->
                    val padding = when (index) {
                        0 -> firstElementPadding
                        DISCOVER_ORGANIZATION_PLACEHOLDER_COUNT - 1 -> lastElementPadding
                        else -> PaddingValues()
                    }

                    DiscoverOrganizationCardPlaceholder(
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
                organizations.size - 1 -> lastElementPadding
                else -> PaddingValues()
            }

            DiscoverOrganizationCard(
                organization = organization,
                onClick = { onOrganizationClick(organization) },
                modifier = Modifier
                    .padding(padding)
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .fillMaxWidth()
            )
        }
    }
}
