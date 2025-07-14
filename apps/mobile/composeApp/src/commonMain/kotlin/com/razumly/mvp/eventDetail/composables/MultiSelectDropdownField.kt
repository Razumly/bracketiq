package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MultiSelectDropdownField(
    selectedItems: List<Division>,
    label: String,
    modifier: Modifier = Modifier,
    isError: Boolean,
    errorMessage: String?,
    onSelectionChange: (List<Division>) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    // Create a comma-separated string of selected division names.
    val displayText = if (selectedItems.isEmpty()) {
        ""
    } else {
        selectedItems.joinToString(", ") { it.name }
    }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier
    ) {
        OutlinedTextField(
            value = displayText,
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            label = { Text(label, maxLines = 1) },
            trailingIcon = {
                ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
            },
            supportingText = {
                if (isError && errorMessage != null) {
                    Text(
                        text = errorMessage,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryEditable, true)
                .fillMaxWidth()
                .clickable { expanded = !expanded }
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            Division.entries.forEach { division ->
                DropdownMenuItem(
                    onClick = {
                        // Toggle selection without dismissing the menu.
                        val current = selectedItems.toMutableList()
                        if (current.contains(division)) {
                            current.remove(division)
                        } else {
                            current.add(division)
                        }
                        onSelectionChange(current)
                    },
                    text = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Checkbox(
                                checked = selectedItems.contains(division),
                                onCheckedChange = { checked ->
                                    val current = selectedItems.toMutableList()
                                    if (checked) {
                                        current.add(division)
                                    } else {
                                        current.remove(division)
                                    }
                                    onSelectionChange(current)
                                }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(text = division.name)
                        }
                    }
                )
            }
        }
    }
}