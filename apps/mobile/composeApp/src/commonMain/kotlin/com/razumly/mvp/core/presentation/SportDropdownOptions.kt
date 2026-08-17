package com.razumly.mvp.core.data.dataTypes

import com.razumly.mvp.core.presentation.composables.DropdownOption

fun List<DivisionTypeParameterOption>.toDropdownOptions(): List<DropdownOption> =
    mapNotNull { option ->
        val value = option.id.trim()
        val label = option.name.trim()
        if (value.isBlank() || label.isBlank()) {
            null
        } else {
            DropdownOption(value = value, label = label)
        }
    }
