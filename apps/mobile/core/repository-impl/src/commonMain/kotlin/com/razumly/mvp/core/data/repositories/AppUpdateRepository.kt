package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.AppVersionCheckResponseDto
import com.razumly.mvp.core.network.dto.AppVersionDto
import com.razumly.mvp.core.util.AppUpdatePlatform
import com.razumly.mvp.core.util.Platform
import com.razumly.mvp.core.util.trustedAppUpdateUrlOrNull
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

    override suspend fun openUpdate(prompt: AppUpdatePrompt): Result<Unit> {
        val trustedUrl = trustedAppUpdateUrlOrNull(
            rawUrl = prompt.updateUrl,
            platform = currentAppUpdatePlatform(),
        ) ?: return Result.failure(IllegalArgumentException("The update link is invalid."))
        return openAppUpdateUrl(trustedUrl)
    }

    private fun versionCheckPath(): String {
        val queryParams = listOfNotNull(
            "platform=${platformValue().encodeURLQueryComponent()}",
            "versionName=${Platform.appVersionName.encodeURLQueryComponent()}",
            Platform.appBuildNumber?.let { "buildNumber=$it" },
        )

        return "api/app-version?${queryParams.joinToString("&")}"
    }

    private fun currentAppUpdatePlatform(): AppUpdatePlatform =
        if (Platform.isIOS) AppUpdatePlatform.IOS else AppUpdatePlatform.ANDROID

    private fun platformValue(): String = currentAppUpdatePlatform().name

    private fun AppVersionCheckResponseDto.toPrompt(): AppUpdatePrompt? {
        val latest = latestVersion ?: return null
        val latestRelease = latest.toReleaseSummary() ?: return null
        val expectedPlatform = currentAppUpdatePlatform()
        val responsePlatform = latest.platform.trim().uppercase().takeIf(String::isNotBlank)
        if (responsePlatform != null && responsePlatform != expectedPlatform.name) return null
        val normalizedUrl = trustedAppUpdateUrlOrNull(latest.updateUrl, expectedPlatform) ?: return null
        val responseReleaseSections = releases
            .mapNotNull { release -> release.toReleaseSummary() }
        val releaseSections = when {
            responseReleaseSections.isEmpty() -> listOf(latestRelease)
            responseReleaseSections.any { release -> release.matches(latestRelease) } -> responseReleaseSections
            else -> responseReleaseSections + latestRelease
        }
        val releaseKey = buildString {
            append(expectedPlatform.name)
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
