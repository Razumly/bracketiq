package com.razumly.mvp.eventDetail.readonly

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertDoesNotExist
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import com.razumly.mvp.core.data.dataTypes.Organization
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class HostedByReadOnlyRowUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun organization_host_card_does_not_expose_unimplemented_follow_action() {
        composeRule.setContent {
            MaterialTheme {
                HostedByReadOnlyRow(
                    host = null,
                    organization = Organization(
                        id = "river-city",
                        name = "River City Sports Club",
                        location = "Portland, OR",
                        description = null,
                        logoId = null,
                        ownerId = "owner-1",
                        website = null,
                        hasStripeAccount = false,
                        coordinates = null,
                    ),
                    isOrganizationEvent = true,
                    fallbackHostDisplayName = "River City Sports Club",
                    currentUser = null,
                    onMessageUser = {},
                    onSendFriendRequest = {},
                    onFollowUser = {},
                    onUnfollowUser = {},
                    onBlockUser = { _, _ -> },
                    onUnblockUser = {},
                )
            }
        }

        composeRule.onNodeWithText("River City Sports Club").assertIsDisplayed()
        composeRule.onNodeWithTag(ORGANIZATION_HOST_CARD_TEST_TAG).assertHasNoClickAction()
        composeRule.onNodeWithText("Follow").assertDoesNotExist()
    }
}
