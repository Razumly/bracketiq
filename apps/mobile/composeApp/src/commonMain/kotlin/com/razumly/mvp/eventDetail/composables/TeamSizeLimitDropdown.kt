package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlatformTextField

@Composable
fun ColumnScope.TeamSizeLimitDropdown(
    selectedTeamSize: Int,
    onTeamSizeSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val teamSizeOptions = listOf(
        DropdownOption("2", "2"),
        DropdownOption("3", "3"),
        DropdownOption("4", "4"),
        DropdownOption("5", "5"),
        DropdownOption("6", "6"),
        DropdownOption("7", "6+")
    )

    PlatformDropdown(
        selectedValue = selectedTeamSize.toString(),
        onSelectionChange = { value ->
            onTeamSizeSelected(value.toInt())
        },
        options = teamSizeOptions,
        label = "Team Size Limit",
        modifier = modifier.fillMaxWidth()
    )
}
