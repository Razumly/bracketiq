package com.razumly.mvp.chat

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.chat.data.IChatGroupRepository
import com.razumly.mvp.chat.data.IMessageRepository
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupSummary
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.PushDeviceTargetDebugStatus
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.eventCreate.CreateEvent_FakeUserRepository
import com.razumly.mvp.eventCreate.MainDispatcherTest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChatTermsGatingTest : MainDispatcherTest() {
    @Test
    fun unsigned_user_still_loads_chat_and_polls_messages() = runTest(testDispatcher) {
        val harness = ChatGroupHarness(acceptedTerms = false)

        advance()

        assertEquals("chat_1", harness.component.chatGroup.value?.chatGroup?.id)
        assertFalse(harness.component.isChatLoading.value)
        assertEquals(listOf("chat_1"), harness.messageRepository.loadedChatIds)
        assertFalse(harness.component.showChatTermsPrompt.value)
    }

    @Test
    fun chat_stays_loading_without_a_resolved_group_and_preserves_its_draft() = runTest(testDispatcher) {
        val harness = ChatGroupHarness(
            acceptedTerms = true,
            chatGroupInitiallyLoading = true,
        )

        advance()

        assertTrue(harness.component.isChatLoading.value)
        assertNull(harness.component.chatGroup.value)

        harness.component.onMessageInputChange("Keep this draft")

        assertEquals("Keep this draft", harness.component.messageInput.value)
    }

    @Test
    fun unsigned_user_cannot_send_message_until_terms_are_accepted() = runTest(testDispatcher) {
        val harness = ChatGroupHarness(acceptedTerms = false)
        advance()

        harness.component.onMessageInputChange("Hello")
        harness.component.sendMessage()
        advance()

        assertTrue(harness.component.showChatTermsPrompt.value)
        assertEquals("Hello", harness.component.messageInput.value)
        assertEquals(emptyList(), harness.messageRepository.createdMessages)
    }

    @Test
    fun accepted_user_can_send_message() = runTest(testDispatcher) {
        val harness = ChatGroupHarness(acceptedTerms = true)
        advance()

        harness.component.onMessageInputChange("Hello")
        harness.component.sendMessage()
        advance()

        assertEquals("", harness.component.messageInput.value)
        assertEquals(1, harness.messageRepository.createdMessages.size)
        assertEquals("Hello", harness.messageRepository.createdMessages.single().body)
        assertEquals("chat_1", harness.messageRepository.createdMessages.single().chatId)
    }

    @Test
    fun accepted_user_sees_notification_warning_after_message_is_persisted() = runTest(testDispatcher) {
        val harness = ChatGroupHarness(acceptedTerms = true)
        harness.pushNotificationsRepository.chatGroupNotificationFailure = IllegalStateException("Relay unavailable")
        advance()

        harness.component.onMessageInputChange("Hello")
        harness.component.sendMessage()
        advance()

        assertEquals("", harness.component.messageInput.value)
        assertEquals(1, harness.messageRepository.createdMessages.size)
        assertNull(harness.component.errorState.value)
        assertEquals(
            ChatFeedback(
                message = "Message sent, but recipients may not receive a notification.",
                kind = ChatFeedbackKind.WARNING,
            ),
            harness.component.feedback.value,
        )

        harness.component.dismissFeedback()
        assertNull(harness.component.feedback.value)
    }

    @Test
    fun reporting_chat_without_leaving_emits_success_feedback_not_error() = runTest(testDispatcher) {
        val harness = ChatGroupHarness(acceptedTerms = true)
        advance()

        harness.component.reportChat(notes = "Spam", leaveChat = false)
        advance()

        assertNull(harness.component.errorState.value)
        assertEquals(
            ChatFeedback(
                message = "Chat reported.",
                kind = ChatFeedbackKind.SUCCESS,
            ),
            harness.component.feedback.value,
        )
    }

    @Test
    fun accepted_user_keeps_message_draft_when_send_fails() = runTest(testDispatcher) {
        val harness = ChatGroupHarness(acceptedTerms = true)
        harness.messageRepository.createMessageFailure = IllegalStateException("Network unavailable")
        advance()

        harness.component.onMessageInputChange("Keep this draft")
        harness.component.sendMessage()
        advance()

        assertEquals("Keep this draft", harness.component.messageInput.value)
        assertTrue(harness.component.errorState.value?.contains("Network unavailable") == true)
        assertEquals(emptyList(), harness.messageRepository.createdMessages)
    }

    @Test
    fun destroying_chat_component_clears_only_its_owned_active_chat() = runTest(testDispatcher) {
        val harness = ChatGroupHarness(acceptedTerms = true)
        advance()

        assertEquals("chat_1", harness.pushNotificationsRepository.activeChatId)
        harness.destroy()

        assertEquals(null, harness.pushNotificationsRepository.activeChatId)
    }

    @Test
    fun destroying_chat_component_does_not_clear_a_newer_active_chat() = runTest(testDispatcher) {
        val harness = ChatGroupHarness(acceptedTerms = true)
        advance()

        harness.pushNotificationsRepository.setActiveChat("chat_2")
        harness.destroy()

        assertEquals("chat_2", harness.pushNotificationsRepository.activeChatId)
    }
}

private class ChatGroupHarness(
    acceptedTerms: Boolean,
    chatGroupInitiallyLoading: Boolean = false,
) {
    val userRepository = CreateEvent_FakeUserRepository().also { repository ->
        repository.chatTermsConsent = repository.chatTermsConsent.copy(
            accepted = acceptedTerms,
            acceptedAt = if (acceptedTerms) repository.chatTermsConsent.acceptedAt else null,
        )
    }
    private val chat = ChatGroupWithRelations(
        chatGroup = ChatGroup(
            id = "chat_1",
            name = "Test chat",
            userIds = listOf("user-1", "user-2"),
            hostId = "user-1",
        ),
        users = emptyList(),
        messages = emptyList(),
    )
    val chatGroupRepository = ChatTerms_FakeChatGroupRepository(
        chat = chat,
        initiallyLoading = chatGroupInitiallyLoading,
    )
    val messageRepository = ChatTerms_FakeMessageRepository()
    val lifecycle = createTestLifecycle()
    val pushNotificationsRepository = ChatTerms_FakePushNotificationsRepository()
    val component = DefaultChatGroupComponent(
        componentContext = createTestComponentContext(lifecycle),
        userRepository = userRepository,
        chatGroupRepository = chatGroupRepository,
        messageUserId = null,
        initialChatId = chat.chatGroup.id,
        messagesRepository = messageRepository,
        pushNotificationsRepository = pushNotificationsRepository,
        navigationHandler = ChatTerms_FakeNavigationHandler(),
    )

    fun destroy() {
        lifecycle.onPause()
        lifecycle.onStop()
        lifecycle.onDestroy()
    }
}

private class ChatTerms_FakeChatGroupRepository(
    private val chat: ChatGroupWithRelations,
    private val initiallyLoading: Boolean = false,
) : IChatGroupRepository {
    var reportChatFailure: Throwable? = null
    var reportChatRemovedChatIds: List<String> = emptyList()
    override val chatGroupsFlow: Flow<Result<List<ChatGroupWithRelations>>> =
        flowOf(Result.success(listOf(chat)))
    override val chatSummariesFlow: Flow<Map<String, ChatGroupSummary>> =
        MutableStateFlow(emptyMap())

    override fun getUnreadMessageCountFlow(userId: String): Flow<Int> = flowOf(0)

    override fun getChatGroupFlow(
        messageUserId: String?,
        chatId: String?,
    ): Flow<Result<ChatGroupWithRelations>> = if (initiallyLoading) {
        emptyFlow()
    } else {
        flowOf(Result.success(chat))
    }

    override suspend fun refreshChatGroupsAndMessages(): Result<Unit> = Result.success(Unit)
    override suspend fun createChatGroup(newChatGroup: ChatGroupWithRelations): Result<Unit> = Result.success(Unit)
    override suspend fun updateChatGroup(newChatGroup: ChatGroup): Result<ChatGroup> = Result.success(newChatGroup)
    override suspend fun deleteChatGroup(chatGroupId: String): Result<Unit> = Result.success(Unit)
    override suspend fun deleteUserFromChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun addUserToChatGroup(chatGroup: ChatGroup, userId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun getCurrentUserMuteStatus(chatGroupId: String): Result<Boolean> = Result.success(false)
    override suspend fun setCurrentUserMuteStatus(chatGroupId: String, muted: Boolean): Result<Boolean> =
        Result.success(muted)
    override suspend fun reportChat(
        chatGroupId: String,
        notes: String?,
        leaveChat: Boolean,
    ): Result<List<String>> {
        reportChatFailure?.let { return Result.failure(it) }
        return Result.success(reportChatRemovedChatIds)
    }
}

private class ChatTerms_FakeMessageRepository : IMessageRepository {
    val loadedChatIds = mutableListOf<String>()
    val createdMessages = mutableListOf<MessageMVP>()
    var createMessageFailure: Throwable? = null

    override suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>> {
        loadedChatIds += chatGroupId
        return Result.success(emptyList())
    }

    override suspend fun createMessage(newMessage: MessageMVP): Result<Unit> {
        createMessageFailure?.let { return Result.failure(it) }
        createdMessages += newMessage
        return Result.success(Unit)
    }

    override suspend fun markMessagesRead(chatGroupId: String, userId: String): Result<Unit> = Result.success(Unit)
}

private class ChatTerms_FakePushNotificationsRepository : IPushNotificationsRepository {
    var activeChatId: String? = null
    var chatGroupNotificationFailure: Throwable? = null

    override suspend fun subscribeUserToTeamNotifications(userId: String, teamId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun unsubscribeUserFromTeamNotifications(userId: String, teamId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun subscribeUserToEventNotifications(userId: String, eventId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun unsubscribeUserFromEventNotifications(userId: String, eventId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun subscribeUserToMatchNotifications(userId: String, matchId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun unsubscribeUserFromMatchNotifications(userId: String, matchId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun subscribeUserToChatGroup(userId: String, chatGroupId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun unsubscribeUserFromChatGroup(userId: String, chatGroupId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun sendUserNotification(userId: String, title: String, body: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun sendTeamNotification(teamId: String, title: String, body: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun sendEventNotification(
        eventId: String,
        title: String,
        body: String,
        isTournament: Boolean,
    ): Result<Unit> = Result.success(Unit)
    override suspend fun sendMatchNotification(matchId: String, title: String, body: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun sendChatGroupNotification(chatGroupId: String, title: String, body: String): Result<Unit> =
        chatGroupNotificationFailure?.let { Result.failure(it) } ?: Result.success(Unit)
    override suspend fun createTeamTopic(team: Team): Result<Unit> = Result.success(Unit)
    override suspend fun deleteTopic(id: String): Result<Unit> = Result.success(Unit)
    override suspend fun createEventTopic(event: Event): Result<Unit> = Result.success(Unit)
    override suspend fun createTournamentTopic(event: Event): Result<Unit> = Result.success(Unit)
    override suspend fun createChatGroupTopic(chatGroup: ChatGroup): Result<Unit> = Result.success(Unit)
    override fun setActiveChat(chatGroupId: String?) {
        activeChatId = chatGroupId?.trim()?.takeIf(String::isNotBlank)
    }

    override fun clearActiveChatIfMatches(chatGroupId: String?) {
        val expectedChatId = chatGroupId?.trim()?.takeIf(String::isNotBlank) ?: return
        if (activeChatId == expectedChatId) {
            activeChatId = null
        }
    }
    override suspend fun addDeviceAsTarget(): Result<Unit> = Result.success(Unit)
    override suspend fun removeDeviceAsTarget(): Result<Unit> = Result.success(Unit)
    override suspend fun getDeviceTargetDebugStatus(syncBeforeCheck: Boolean): Result<PushDeviceTargetDebugStatus> =
        Result.success(PushDeviceTargetDebugStatus())
}

private class ChatTerms_FakeNavigationHandler : INavigationHandler {
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

private fun createTestLifecycle(): LifecycleRegistry {
    return LifecycleRegistry().also { lifecycle ->
        lifecycle.onCreate()
        lifecycle.onStart()
        lifecycle.onResume()
    }
}

private fun createTestComponentContext(lifecycle: LifecycleRegistry = createTestLifecycle()): DefaultComponentContext {
    return DefaultComponentContext(
        lifecycle = lifecycle,
        backHandler = BackDispatcher(),
    )
}
