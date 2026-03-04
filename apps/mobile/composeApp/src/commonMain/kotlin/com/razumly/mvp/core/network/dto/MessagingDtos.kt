package com.razumly.mvp.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class MessagingTopicUpsertRequestDto(
    val topicName: String? = null,
    val userIds: List<String>? = null,
)

@Serializable
data class MessagingTopicSubscriptionRequestDto(
    val userIds: List<String>,
    val pushToken: String? = null,
    val pushTarget: String? = null,
)

@Serializable
data class MessagingTopicMessageRequestDto(
    val title: String,
    val body: String,
    val userIds: List<String> = emptyList(),
    val senderId: String? = null,
)

@Serializable
data class MessagingTopicSubscriptionDebugResponseDto(
    val topicId: String,
    val userId: String,
    val hasAnyTargetForUser: Boolean = false,
    val hasTopicTargetForUser: Boolean = false,
    val hasProvidedTokenForUser: Boolean = false,
    val hasProvidedTokenOnTopic: Boolean = false,
    val tokenRecordPushTarget: String? = null,
    val tokenRecordPushPlatform: String? = null,
    val tokenRecordUpdatedAt: String? = null,
    val tokenRecordLastSeenAt: String? = null,
)
