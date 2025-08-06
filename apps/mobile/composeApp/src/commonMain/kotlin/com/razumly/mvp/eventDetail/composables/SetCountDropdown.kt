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
fun ColumnScope.SetCountDropdown(
    selectedCount: Int,
    onCountSelected: (Int) -> Unit,
    label: String,
    modifier: Modifier = Modifier
) {
    val setCountOptions = (1..5).map { count ->
        DropdownOption(
            value = count.toString(),
            label = count.toString()
        )
    }

    PlatformDropdown(
        selectedValue = selectedCount.toString(),
        onSelectionChange = { value ->
            onCountSelected(value.toInt())
        },
        options = setCountOptions,
        label = label,
        modifier = modifier.fillMaxWidth()
    )
}


@Composable
fun ColumnScope.WinnerSetCountDropdown(
    selectedCount: Int,
    onCountSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    SetCountDropdown(
        selectedCount = selectedCount,
        onCountSelected = onCountSelected,
        label = "Winner Bracket Set Count",
        modifier = modifier
    )
}

@Composable
fun ColumnScope.LoserSetCountDropdown(
    selectedCount: Int,
    onCountSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    SetCountDropdown(
        selectedCount = selectedCount,
        onCountSelected = onCountSelected,
        label = "Loser Bracket Set Count",
        modifier = modifier
    )
}
