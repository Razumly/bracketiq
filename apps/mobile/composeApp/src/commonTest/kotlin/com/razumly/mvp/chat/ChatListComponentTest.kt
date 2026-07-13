package com.razumly.mvp.chat

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.chat.data.IChatGroupRepository
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupSummary
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.eventCreate.CreateEvent_FakeUserRepository
import com.razumly.mvp.eventCreate.MainDispatcherTest
import com.razumly.mvp.eventCreate.createUser
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChatListComponentTest : MainDispatcherTest() {

    @Test
    fun given_refresh_failure_when_retrying_then_the_error_is_exposed_and_cleared_after_success() = runTest(testDispatcher) {
        val harness = ChatListHarness().also { harness ->
            harness.chatGroupRepository.refreshFailure = IllegalStateException("Network unavailable")
        }

        advance()

        assertTrue(harness.component.errorState.value?.contains("Network unavailable") == true)
        val refreshCallsBeforeRetry = harness.chatGroupRepository.refreshCallCount

        harness.chatGroupRepository.refreshFailure = null
        harness.component.retryLoadingChats()
        advance()

        assertEquals(refreshCallsBeforeRetry + 1, harness.chatGroupRepository.refreshCallCount)
        assertNull(harness.component.errorState.value)
    }

    @Test
    fun given_create_failure_when_retrying_then_the_draft_is_preserved_until_creation_succeeds() = runTest(testDispatcher) {
        val harness = ChatListHarness()
        advance()
        val invitedPlayer = createUser(id = "player-2")
        harness.component.updateNewChatField { copy(name = "Keep this draft") }
        harness.component.addUserToNewChat(invitedPlayer)
        val draftBeforeFailure = harness.component.newChat.value
        harness.chatGroupRepository.createFailure = IllegalStateException("Connection unavailable")

        harness.component.onChatCreated()

        assertEquals(ChatCreationStatus.CREATING, harness.component.chatCreationStatus.value)
        advance()

        assertEquals(ChatCreationStatus.FAILED, harness.component.chatCreationStatus.value)
        assertEquals(draftBeforeFailure, harness.component.newChat.value)
        assertTrue(harness.component.chatCreationError.value?.contains("Connection unavailable") == true)
        assertTrue(harness.component.errorState.value?.contains("Connection unavailable") == true)
        assertEquals(1, harness.chatGroupRepository.createCallCount)

        harness.component.clearChatCreationFeedback()

        assertEquals(ChatCreationStatus.IDLE, harness.component.chatCreationStatus.value)
        assertNull(harness.component.chatCreationError.value)
        assertNull(harness.component.errorState.value)
        assertEquals(draftBeforeFailure, harness.component.newChat.value)

        harness.chatGroupRepository.createFailure = null
        harness.component.onChatCreated()
        advance()

        assertEquals(ChatCreationStatus.SUCCEEDED, harness.component.chatCreationStatus.value)
        assertNull(harness.component.chatCreationError.value)
        assertEquals("", harness.component.newChat.value.chatGroup.name)
        assertEquals(listOf("user-1"), harness.component.newChat.value.chatGroup.userIds)
        assertFalse(harness.component.newChat.value.users.any { user -> user.id == invitedPlayer.id })
        assertEquals(2, harness.chatGroupRepository.createCallCount)
    }
}

private class ChatListHarness {
    val chatGroupRepository = ChatList_FakeChatGroupRepository()
    val component = DefaultChatListComponent(
        componentContext = createChatListTestComponentContext(),
        chatGroupRepository = chatGroupRepository,
        userRepository = CreateEvent_FakeUserRepository(),
        navigationHandler = ChatList_FakeNavigationHandler(),
    )
}

private class ChatList_FakeChatGroupRepository : IChatGroupRepository {
    var refreshFailure: Throwable? = null
    var createFailure: Throwable? = null
    var refreshCallCount = 0
    var createCallCount = 0

    override val chatGroupsFlow: Flow<Result<List<ChatGroupWithRelations>>> =
        MutableStateFlow(Result.success(emptyList()))
    override val chatSummariesFlow: Flow<Map<String, ChatGroupSummary>> = MutableStateFlow(emptyMap())

    override fun getUnreadMessageCountFlow(userId: String): Flow<Int> = flowOf(0)

    override fun getChatGroupFlow(
        messageUserId: String?,
        chatId: String?,
    ): Flow<Result<ChatGroupWithRelations>> = flowOf(Result.failure(IllegalStateException("unused")))

    override suspend fun refreshChatGroupsAndMessages(): Result<Unit> {
        refreshCallCount += 1
        return refreshFailure?.let(Result.Companion::failure) ?: Result.success(Unit)
    }

    override suspend fun createChatGroup(newChatGroup: ChatGroupWithRelations): Result<Unit> {
        createCallCount += 1
        return createFailure?.let(Result.Companion::failure) ?: Result.success(Unit)
    }

    override suspend fun updateChatGroup(newChatGroup: ChatGroup): Result<ChatGroup> = Result.success(newChatGroup)
    override suspend fun deleteChatGroup(chatGroupId: String): Result<Unit> = Result.success(Unit)
    override suspend fun deleteUserFromChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun addUserToChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun getCurrentUserMuteStatus(chatGroupId: String): Result<Boolean> = Result.success(false)
    override suspend fun setCurrentUserMuteStatus(chatGroupId: String, muted: Boolean): Result<Boolean> =
        Result.success(muted)
}

private class ChatList_FakeNavigationHandler : INavigationHandler {
    override fun navigateToMatch(matchId: String, eventId: String) = Unit
    override fun navigateToTeams(
        freeAgents: List<String>,
        eventId: String?,
        selectedFreeAgentId: String?,
    ) = Unit

    override fun navigateToChat(messageUserId: String?, chatId: String?) = Unit
    override fun navigateToCreate() = Unit
    override fun navigateToSearch() = Unit
    override fun navigateToEvent(eventId: String) = Unit
    override fun navigateToOrganization(organizationId: String, initialTab: OrganizationDetailTab) = Unit
    override fun navigateToEvents() = Unit
    override fun navigateToRefunds() = Unit
    override fun navigateToLogin() = Unit
    override fun navigateBack() = Unit
}

private fun createChatListTestComponentContext(): DefaultComponentContext {
    val lifecycle = LifecycleRegistry().also { lifecycle ->
        lifecycle.onCreate()
        lifecycle.onStart()
        lifecycle.onResume()
    }
    return DefaultComponentContext(
        lifecycle = lifecycle,
        backHandler = BackDispatcher(),
    )
}
