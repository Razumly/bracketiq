package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.AppVersionCheckResponseDto
import com.razumly.mvp.core.network.dto.AppVersionDto
import com.razumly.mvp.core.util.Platform
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLQueryComponent

private const val APP_UPDATE_LOG_TAG = "AppUpdate"

data class AppUpdateRelease(
    val versionName: String,
    val buildNumber: Int?,
    val changes: List<String>,
)

data class AppUpdatePrompt(
    val versionName: String,
    val buildNumber: Int?,
    val changes: List<String>,
    val releases: List<AppUpdateRelease>,
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

        if (!response.updateAvailable) {
            return@runCatching null
        }

        val prompt = response.toPrompt() ?: return@runCatching null
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

    private fun AppVersionCheckResponseDto.toPrompt(): AppUpdatePrompt? {
        val latest = latestVersion ?: return null
        val latestRelease = latest.toReleaseSummary() ?: return null
        val normalizedUrl = latest.updateUrl?.trim()?.takeIf(String::isNotBlank) ?: return null
        val normalizedPlatform = latest.platform.trim().uppercase().takeIf(String::isNotBlank) ?: platformValue()
        val responseReleaseSections = releases
            .mapNotNull { release -> release.toReleaseSummary() }
        val releaseSections = when {
            responseReleaseSections.isEmpty() -> listOf(latestRelease)
            responseReleaseSections.any { release -> release.matches(latestRelease) } -> responseReleaseSections
            else -> responseReleaseSections + latestRelease
        }
        val releaseKey = buildString {
            append(normalizedPlatform)
            append(":")
            append(latestRelease.versionName)
            append(":")
            append(latestRelease.buildNumber ?: "none")
        }

        return AppUpdatePrompt(
            versionName = latestRelease.versionName,
            buildNumber = latestRelease.buildNumber,
            changes = releaseSections.flatMap(AppUpdateRelease::changes),
            releases = releaseSections,
            updateRequired = updateRequired,
            updateUrl = normalizedUrl,
            releaseKey = releaseKey,
        )
    }

    private fun AppUpdateRelease.matches(other: AppUpdateRelease): Boolean =
        versionName == other.versionName && buildNumber == other.buildNumber

    private fun AppVersionDto.toReleaseSummary(): AppUpdateRelease? {
        val normalizedVersion = versionName.trim().takeIf(String::isNotBlank) ?: return null
        val normalizedChanges = changes
            .map { change -> change.trim() }
            .filter(String::isNotBlank)
            .ifEmpty { listOf("This release includes the latest Bracket IQ improvements.") }

        return AppUpdateRelease(
            versionName = normalizedVersion,
            buildNumber = buildNumber,
            changes = normalizedChanges,
        )
    }
}
