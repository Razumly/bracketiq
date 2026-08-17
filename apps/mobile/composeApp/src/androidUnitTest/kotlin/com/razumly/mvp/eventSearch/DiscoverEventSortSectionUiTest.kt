package com.razumly.mvp.eventSearch

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.razumly.mvp.core.data.repositories.EventSearchSort
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class DiscoverEventSortSectionUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun recommendedIsSelectedAndNearestCanBeChosen() {
        var selected = EventSearchSort.RECOMMENDED
        composeRule.setContent {
            MaterialTheme {
                DiscoverEventSortSection(
                    selectedSort = selected,
                    onSortSelected = { selected = it },
                )
            }
        }

        composeRule.onNodeWithText("Recommended").assertIsSelected()
        composeRule.onNodeWithText("Nearest").performClick()

        assertEquals(EventSearchSort.NEAREST, selected)
    }
}
