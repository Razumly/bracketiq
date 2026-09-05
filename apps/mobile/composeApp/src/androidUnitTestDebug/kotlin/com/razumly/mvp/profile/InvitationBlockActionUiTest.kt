package com.razumly.mvp.profile

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.razumly.mvp.core.data.dataTypes.Invite
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class InvitationBlockActionUiTest {
    @get:Rule val composeRule = createComposeRule()

    @Test fun sender_block_keeps_chat_leave_unchecked() {
        var saved: Pair<String, Boolean>? = null
        composeRule.setContent { MaterialTheme {
            InvitationBlockAction(Invite(id = "child", canBlockSender = true), true) { scope, leave, callback ->
                saved = scope to leave
                callback(Result.success(Unit))
            }
        } }
        composeRule.onNodeWithText("Decline and block").performClick()
        composeRule.onAllNodes(isSelectable())[1].performClick()
        composeRule.onNode(isToggleable()).assertIsOff()
        composeRule.onNodeWithText("Save decline and block").performClick()
        assertEquals("sender" to false, saved)
    }

    @Test fun team_block_keeps_child_scope_and_disables_an_unclaimed_sender() {
        var saved: Pair<String, Boolean>? = null
        composeRule.setContent { MaterialTheme {
            InvitationBlockAction(Invite(id = "child", canBlockSender = false, childFullName = "First Child"), true) { scope, leave, callback ->
                saved = scope to leave
                callback(Result.success(Unit))
            }
        } }
        composeRule.onNodeWithText("Decline and block").performClick()
        composeRule.onAllNodes(isSelectable())[1].assertIsNotEnabled()
        composeRule.onNodeWithText("Save decline and block").performClick()
        assertEquals("team" to false, saved)
    }
}
