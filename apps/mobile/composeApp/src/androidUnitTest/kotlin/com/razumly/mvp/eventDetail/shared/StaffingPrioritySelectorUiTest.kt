package com.razumly.mvp.eventDetail.shared

import android.app.Application
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.razumly.mvp.core.data.dataTypes.StaffingPriority
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class StaffingPrioritySelectorUiTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun given_each_priority_when_its_description_is_selected_then_one_radio_row_announces_selection() {
        val selected = mutableStateOf(StaffingPriority.BEST_AVAILABLE_COVERAGE)
        var selectionCount = 0
        composeRule.setContent {
            MaterialTheme {
                StaffingPrioritySelector(
                    selectedPriority = selected.value,
                    onPrioritySelected = { selected.value = it; selectionCount += 1 },
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                )
            }
        }

        staffingPriorityChoices().forEachIndexed { index, choice ->
            composeRule.onNodeWithText(choice.description).performScrollTo().performClick()
            composeRule.onNodeWithText(choice.title)
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.RadioButton))
                .assertIsSelected()
            assertEquals(choice.priority, selected.value)
            assertEquals(index + 1, selectionCount)
        }
    }
}
