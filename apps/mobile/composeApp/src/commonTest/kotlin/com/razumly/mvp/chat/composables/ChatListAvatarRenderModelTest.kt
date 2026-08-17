package com.razumly.mvp.chat.composables

import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlin.test.Test
import kotlin.test.assertEquals

class ChatListAvatarRenderModelTest {
    @Test
    fun team_chat_uses_single_team_avatar() {
        val model = resolveChatAvatarRenderModel(
            chatGroup = chatGroup(
                userIds = listOf("u1", "u2", "u3"),
                users = listOf(user("u1"), user("u2"), user("u3")),
                teamId = "team_1",
                imageRef = "team_logo_file_id",
            ),
            currentUserId = "u1",
        )

        assertEquals(ChatAvatarLayout.SINGLE, model.layout)
        assertEquals(listOf("team:team_1"), model.sources.map { source -> source.id })
    }

    @Test
    fun one_on_one_chat_uses_other_user_avatar() {
        val model = resolveChatAvatarRenderModel(
            chatGroup = chatGroup(
                userIds = listOf("u1", "u2"),
                users = listOf(user("u1"), user("u2")),
            ),
            currentUserId = "u1",
        )

        assertEquals(ChatAvatarLayout.SINGLE, model.layout)
        assertEquals(listOf("u2"), model.sources.map { source -> source.id })
    }

    @Test
    fun three_other_users_use_triangle_layout() {
        val model = resolveChatAvatarRenderModel(
            chatGroup = chatGroup(
                userIds = listOf("u1", "u2", "u3", "u4"),
                users = listOf(user("u1"), user("u2"), user("u3"), user("u4")),
            ),
            currentUserId = "u1",
        )

        assertEquals(ChatAvatarLayout.TRIANGLE, model.layout)
        assertEquals(listOf("u2", "u3", "u4"), model.sources.map { source -> source.id })
    }

    @Test
    fun four_other_users_use_grid_layout() {
        val model = resolveChatAvatarRenderModel(
            chatGroup = chatGroup(
                userIds = listOf("u1", "u2", "u3", "u4", "u5"),
                users = listOf(user("u1"), user("u2"), user("u3"), user("u4"), user("u5")),
            ),
            currentUserId = "u1",
        )

        assertEquals(ChatAvatarLayout.GRID, model.layout)
        assertEquals(listOf("u2", "u3", "u4", "u5"), model.sources.map { source -> source.id })
    }

    @Test
    fun five_or_more_other_users_use_grid_with_plus_layout() {
        val model = resolveChatAvatarRenderModel(
            chatGroup = chatGroup(
                userIds = listOf("u1", "u2", "u3", "u4", "u5", "u6"),
                users = listOf(user("u1"), user("u2"), user("u3"), user("u4"), user("u5"), user("u6")),
            ),
            currentUserId = "u1",
        )

        assertEquals(ChatAvatarLayout.GRID_WITH_PLUS, model.layout)
        assertEquals(listOf("u2", "u3", "u4"), model.sources.map { source -> source.id })
    }
}

private fun chatGroup(
    userIds: List<String>,
    users: List<UserData>,
    teamId: String? = null,
    imageRef: String? = null,
): ChatGroupWithRelations {
    val group = ChatGroup(
        id = "chat_1",
        name = "Sample Chat",
        userIds = userIds,
        hostId = userIds.firstOrNull().orEmpty(),
    ).apply {
        this.teamId = teamId
    }.setImageUrl(imageRef)

    return ChatGroupWithRelations(
        chatGroup = group,
        users = users,
        messages = emptyList(),
    )
}

private fun user(id: String): UserData =
    UserData(
        firstName = id,
        lastName = "",
        teamIds = emptyList(),
        friendIds = emptyList(),
        friendRequestIds = emptyList(),
        friendRequestSentIds = emptyList(),
        followingIds = emptyList(),
        userName = id,
        hasStripeAccount = false,
        uploadedImages = emptyList(),
        profileImageId = "${id}_image",
        privacyDisplayName = null,
        isMinor = false,
        isIdentityHidden = false,
        id = id,
    )
