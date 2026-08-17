package com.razumly.mvp.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class AppVersionCheckResponseDto(
    val updateAvailable: Boolean = false,
    val updateRequired: Boolean = false,
    val latestVersion: AppVersionDto? = null,
    val releases: List<AppVersionDto> = emptyList(),
)

@Serializable
data class AppVersionDto(
    val platform: String = "",
    val versionName: String = "",
    val buildNumber: Int? = null,
    val changes: List<String> = emptyList(),
    val hasBreakingChanges: Boolean = false,
    val updateUrl: String? = null,
    val releasedAt: String? = null,
)
