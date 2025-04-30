package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SearchBar
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchBox(
    modifier: Modifier = Modifier,
    placeholder: String,
    filter: Boolean,
    onChange: (String) -> Unit,
    onSearch: (String) -> Unit,
    initialList: @Composable () -> Unit,
    suggestions: @Composable () -> Unit
) {
    var searchActive by remember { mutableStateOf(false) }
    val onActiveChange: (Boolean) -> Unit = { isActive ->
        searchActive = isActive
    }
    var searchInput by mutableStateOf("")

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        SearchBar(
            modifier = modifier,
            inputField = {
                SearchBarDefaults.InputField(
                    query = searchInput,
                    onQueryChange = { newQuery ->
                        searchInput = newQuery
                        onChange(newQuery)
                    },
                    onSearch = onSearch,
                    expanded = searchActive,
                    onExpandedChange = onActiveChange,
                    placeholder = { Text(placeholder) },
                )
            },
            expanded = searchActive,
            onExpandedChange = onActiveChange,
        )
        {
            if (searchInput.isBlank()) {
                initialList()
            } else {
                suggestions()
            }
        }
        if (filter) {
            IconButton(
                onClick = {},
            ) {
                Icon(Icons.Default.Menu, contentDescription = "Filter")
            }
        }
    }
}

