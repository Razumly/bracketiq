package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.AppVersionCheckResponseDto
import com.razumly.mvp.core.network.dto.AppVersionDto
import com.razumly.mvp.core.util.Platform
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLQueryComponent

private const val APP_UPDATE_LOG_TAG = "AppUpdate"

data class AppUpdatePrompt(
    val versionName: String,
    val buildNumber: Int?,
    val changes: List<String>,
    val updateRequired: Boolean,
    val updateUrl: String,
    val releaseKey: String,
)

interface IAppUpdateRepository {
    suspend fun checkForUpdate(): Result<AppUpdatePrompt?>
    suspend fun dismiss(prompt: AppUpdatePrompt)
    suspend fun openUpdate(prompt: AppUpdatePrompt): Result<Unit>
}

class AppUpdateRepository(
    private val api: MvpApiClient,
    private val currentUserDataSource: CurrentUserDataSource,
) : IAppUpdateRepository {
    override suspend fun checkForUpdate(): Result<AppUpdatePrompt?> = runCatching {
        val response = api.get<AppVersionCheckResponseDto>(versionCheckPath())
        val latestVersion = response.latestVersion ?: return@runCatching null

        if (!response.updateAvailable) {
            return@runCatching null
        }

        val prompt = latestVersion.toPrompt(updateRequired = response.updateRequired)
            ?: return@runCatching null
        val dismissedReleaseKey = currentUserDataSource.getDismissedAppReleaseKeyNow().trim()

        if (!prompt.updateRequired && dismissedReleaseKey == prompt.releaseKey) {
            Napier.d("Suppressing dismissed update prompt for ${prompt.releaseKey}", tag = APP_UPDATE_LOG_TAG)
            return@runCatching null
        }

        prompt
    }.onFailure { throwable ->
        Napier.w("Failed to check app update state: ${throwable.message}", tag = APP_UPDATE_LOG_TAG)
    }

    override suspend fun dismiss(prompt: AppUpdatePrompt) {
        if (prompt.updateRequired) return
        currentUserDataSource.saveDismissedAppReleaseKey(prompt.releaseKey)
    }

    override suspend fun openUpdate(prompt: AppUpdatePrompt): Result<Unit> =
        openAppUpdateUrl(prompt.updateUrl)

    private fun versionCheckPath(): String {
        val queryParams = listOfNotNull(
            "platform=${platformValue().encodeURLQueryComponent()}",
            "versionName=${Platform.appVersionName.encodeURLQueryComponent()}",
            Platform.appBuildNumber?.let { "buildNumber=$it" },
        )

        return "api/app-version?${queryParams.joinToString("&")}"
    }

    private fun platformValue(): String = if (Platform.isIOS) "IOS" else "ANDROID"

    private fun AppVersionDto.toPrompt(updateRequired: Boolean): AppUpdatePrompt? {
        val normalizedVersion = versionName.trim().takeIf(String::isNotBlank) ?: return null
        val normalizedUrl = updateUrl?.trim()?.takeIf(String::isNotBlank) ?: return null
        val normalizedChanges = changes
            .map { change -> change.trim() }
            .filter(String::isNotBlank)
            .ifEmpty { listOf("This release includes the latest Bracket IQ improvements.") }
        val normalizedPlatform = platform.trim().uppercase().takeIf(String::isNotBlank) ?: platformValue()
        val releaseKey = buildString {
            append(normalizedPlatform)
            append(":")
            append(normalizedVersion)
            append(":")
            append(buildNumber ?: "none")
        }

        return AppUpdatePrompt(
            versionName = normalizedVersion,
            buildNumber = buildNumber,
            changes = normalizedChanges,
            updateRequired = updateRequired,
            updateUrl = normalizedUrl,
            releaseKey = releaseKey,
        )
    }
}
