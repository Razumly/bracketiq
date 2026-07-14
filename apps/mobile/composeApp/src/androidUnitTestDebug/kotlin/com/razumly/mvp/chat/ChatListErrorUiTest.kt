package com.razumly.mvp.chat

import android.app.Application
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupSummary
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.ChatTermsConsentState
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class ChatListErrorUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun refresh_error_is_visible_on_the_chat_list_and_can_be_retried() {
        val component = ChatListErrorUi_FakeComponent().apply {
            mutableErrorState.value = "Network unavailable"
        }

        composeRule.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    ChatListScreen(component)
                }
            }
        }

        composeRule.onNodeWithText("Unable to update chats").assertIsDisplayed()
        composeRule.onNodeWithText("Network unavailable").assertIsDisplayed()
        composeRule.onNodeWithText("Retry").performClick()

        assertEquals(1, component.retryLoadingChatsCalls)
    }

    @Test
    fun failed_creation_keeps_the_dialog_open_with_an_actionable_retry() {
        val component = ChatListErrorUi_FakeComponent(
            draft = ChatGroupWithRelations(
                chatGroup = ChatGroup(
                    id = "draft-chat",
                    name = "Keep this draft",
                    userIds = listOf("user-1", "user-2"),
                    hostId = "user-1",
                ),
                users = listOf(chatListErrorUiUser("user-2")),
                messages = emptyList(),
            ),
        )
        var dismissCalls = 0

        composeRule.setContent {
            MaterialTheme {
                NewChatDialog(
                    component = component,
                    onDismiss = { dismissCalls += 1 },
                )
            }
        }

        composeRule.onNodeWithText("Create chat").performClick()
        composeRule.waitForIdle()

        composeRule.onNodeWithText(
            "Couldn't create this chat. Your draft is still here. Network unavailable",
        ).assertIsDisplayed()
        composeRule.onNodeWithText("Retry").assertIsDisplayed()
        assertEquals(0, dismissCalls)

        composeRule.onNodeWithText("Retry").performClick()
        composeRule.waitForIdle()

        assertEquals(2, component.createChatCalls)
        assertEquals(0, dismissCalls)
    }

    @Test
    fun empty_chat_list_explains_the_state_and_opens_chat_creation() {
        val component = ChatListErrorUi_FakeComponent()

        composeRule.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    ChatListScreen(component)
                }
            }
        }

        composeRule.onNodeWithText("No chats yet").assertIsDisplayed()
        composeRule.onNodeWithText("Start a conversation with another player or organizer.")
            .assertIsDisplayed()
        composeRule.onNodeWithText("Start a chat").performClick()

        composeRule.onNodeWithText("Chat Name (Optional)").assertIsDisplayed()
    }

    @Test
    fun loading_chat_list_does_not_claim_the_account_has_no_chats() {
        val component = ChatListErrorUi_FakeComponent().apply {
            mutableIsLoadingChats.value = true
        }

        composeRule.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    ChatListScreen(component)
                }
            }
        }

        composeRule.onAllNodesWithText("No chats yet").assertCountEquals(0)
    }
}

private class ChatListErrorUi_FakeComponent(
    draft: ChatGroupWithRelations = ChatGroupWithRelations(
        chatGroup = ChatGroup.empty(),
        users = emptyList(),
        messages = emptyList(),
    ),
) : ChatListComponent {
    override val newChat: StateFlow<ChatGroupWithRelations> = MutableStateFlow(draft)
    override val selectedChat: StateFlow<ChatGroup?> = MutableStateFlow(null)
    override val chatGroups: StateFlow<List<ChatGroupWithRelations>> = MutableStateFlow(emptyList())
    override val chatSummaries: StateFlow<Map<String, ChatGroupSummary>> = MutableStateFlow(emptyMap())
    val mutableErrorState = MutableStateFlow<String?>(null)
    override val errorState: StateFlow<String?> = mutableErrorState
    val mutableIsLoadingChats = MutableStateFlow(false)
    override val isLoadingChats: StateFlow<Boolean> = mutableIsLoadingChats
    private val mutableChatCreationStatus = MutableStateFlow(ChatCreationStatus.IDLE)
    override val chatCreationStatus: StateFlow<ChatCreationStatus> = mutableChatCreationStatus
    private val mutableChatCreationError = MutableStateFlow<String?>(null)
    override val chatCreationError: StateFlow<String?> = mutableChatCreationError
    override val suggestedPlayers: StateFlow<List<UserData>> = MutableStateFlow(emptyList())
    override val currentUser: UserData = chatListErrorUiUser("user-1")
    override val friends: StateFlow<List<UserData>> = MutableStateFlow(emptyList())
    override val chatTermsState: StateFlow<ChatTermsConsentState> =
        MutableStateFlow(ChatTermsConsentState(accepted = true))
    override val isCheckingChatTerms: StateFlow<Boolean> = MutableStateFlow(false)
    override val showChatTermsPrompt: StateFlow<Boolean> = MutableStateFlow(false)

    var createChatCalls = 0
        private set
    var retryLoadingChatsCalls = 0
        private set

    override fun onChatSelected(chat: ChatGroupWithRelations) = Unit
    override fun onChatCreated() {
        createChatCalls += 1
        mutableChatCreationError.value = "Network unavailable"
        mutableChatCreationStatus.value = ChatCreationStatus.FAILED
    }

    override fun clearChatCreationFeedback() {
        mutableChatCreationError.value = null
        mutableChatCreationStatus.value = ChatCreationStatus.IDLE
    }

    override fun retryLoadingChats() {
        retryLoadingChatsCalls += 1
    }

    override fun updateNewChatField(update: ChatGroup.() -> ChatGroup) = Unit
    override fun addUserToNewChat(user: UserData) = Unit
    override fun removeUserFromNewChat(user: UserData) = Unit
    override fun searchPlayers(query: String) = Unit
    override fun dismissChatTermsPrompt() = Unit
    override fun acceptChatTermsPrompt() = Unit
}

private fun chatListErrorUiUser(id: String): UserData = UserData().copy(
    firstName = "Test",
    lastName = "User",
    userName = id,
    id = id,
)
