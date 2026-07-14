package com.razumly.mvp.core.presentation.composables

import androidx.compose.ui.text.input.KeyboardType
import kotlin.test.Test
import kotlin.test.assertEquals

class InputDisplayLogicTest {

    @Test
    fun givenFractionalNumberField_whenKeyboardTypeIsResolved_thenDecimalEntryIsAvailable() {
        assertEquals(
            KeyboardType.Decimal,
            resolveComposeKeyboardType(keyboardType = "decimal"),
        )
    }

    @Test
    fun givenIntegerAndMoneyFields_whenKeyboardTypeIsResolved_thenWholeNumberEntryIsPreserved() {
        assertEquals(
            KeyboardType.Number,
            resolveComposeKeyboardType(keyboardType = "number"),
        )
        assertEquals(
            KeyboardType.Number,
            resolveComposeKeyboardType(keyboardType = "numbers"),
        )
        assertEquals(
            KeyboardType.Number,
            resolveComposeKeyboardType(keyboardType = "money"),
        )
    }

    @Test
    fun givenLoadedAndUnloadedSelections_whenMultiSelectTextIsBuilt_thenEverySelectionRemainsVisible() {
        assertEquals(
            "Loaded label, legacy-id",
            dropdownDisplayText(
                selectedValue = "",
                selectedValues = listOf("loaded", "legacy-id"),
                options = listOf(DropdownOption(value = "loaded", label = "Loaded label")),
                multiSelect = true,
            ),
        )
    }

    @Test
    fun givenAnUnloadedSingleSelection_whenTextIsBuilt_thenTheStoredValueRemainsVisible() {
        assertEquals(
            "legacy-id",
            dropdownDisplayText(
                selectedValue = "legacy-id",
                selectedValues = emptyList(),
                options = emptyList(),
                multiSelect = false,
            ),
        )
    }
}
