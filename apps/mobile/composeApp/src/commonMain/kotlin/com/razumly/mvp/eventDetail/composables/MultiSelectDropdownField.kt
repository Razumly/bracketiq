package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlatformTextField

@Composable
fun MultiSelectDropdownField(
    selectedItems: List<Division>,
    label: String,
    modifier: Modifier = Modifier,
    isError: Boolean,
    errorMessage: String?,
    onSelectionChange: (List<Division>) -> Unit,
) {
    val divisionOptions = Division.entries.map { division ->
        DropdownOption(
            value = division.name,
            label = division.name
        )
    }

    PlatformDropdown(
        selectedValue = "", // Not used for multi-select
        onSelectionChange = {}, // Not used for multi-select
        options = divisionOptions,
        label = label,
        multiSelect = true,
        selectedValues = selectedItems.map { it.name },
        onMultiSelectionChange = { values ->
            val divisions = values.mapNotNull { value ->
                Division.entries.find { it.name == value }
            }
            onSelectionChange(divisions)
        },
        isError = isError,
        supportingText = errorMessage ?: "",
        modifier = modifier.fillMaxWidth()
    )
}
