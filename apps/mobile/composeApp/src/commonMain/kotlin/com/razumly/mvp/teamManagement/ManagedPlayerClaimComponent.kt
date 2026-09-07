package com.razumly.mvp.teamManagement

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.ManagedPlayerClaimPreview
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** A signed-link form. Its preview is transient and invalidated with the Account or link. */
class ManagedPlayerClaimComponent(
    private val repository: IUserRepository,
    private val inviteId: String,
    private val version: String?,
    private val expiresAt: String?,
    private val signature: String?,
    parentScope: CoroutineScope,
    private val onClaimed: () -> Unit,
) {
    private val scope = CoroutineScope(parentScope.coroutineContext + SupervisorJob(parentScope.coroutineContext[Job]))
    var preview by mutableStateOf<ManagedPlayerClaimPreview?>(null)
        private set
    var dateOfBirth by mutableStateOf("")
    var confirmed by mutableStateOf(false)
    var guardianDeclared by mutableStateOf(false)
    var reviewed by mutableStateOf(false)
        private set
    var declined by mutableStateOf(false)
        private set
    var accepted by mutableStateOf(false)
        private set
    var needsBirthDate by mutableStateOf(false)
        private set
    var loading by mutableStateOf(true)
        private set
    var saving by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    suspend fun load() {
        loading = true
        error = null
        preview = null
        repository.previewManagedPlayerClaim(inviteId, version, expiresAt, signature)
            .onSuccess { preview = it; needsBirthDate = it.birthdateRequired }
            .onFailure { error = it.message ?: "This claim link is unavailable." }
        loading = false
    }

    suspend fun refreshActions(viewerId: String) {
        repository.listInvites(viewerId, "TEAM")
            .onFailure { error = "Invitation actions could not load. Review the invitation again." }
    }

    fun decline() {
        if (saving) return
        saving = true
        error = null
        scope.launch {
            repository.declineInvite(inviteId)
                .onSuccess { declined = true }
                .onFailure { error = it.message ?: "The decline could not be confirmed. Retry the same action." }
            saving = false
        }
    }

    fun declineAndBlock(blockScope: String, leaveChats: Boolean, onResult: (Result<Unit>) -> Unit) {
        if (saving) return
        saving = true
        scope.launch {
            val result = repository.declineAndBlockInvite(inviteId, blockScope, leaveChats)
            result.onSuccess { declined = true }
            saving = false
            onResult(result)
        }
    }

    fun claim(review: Boolean = false) {
        val current = preview ?: return
        if (saving || (!review && !confirmed)) return
        saving = true
        error = null
        scope.launch {
            repository.claimManagedPlayerProfile(
                profileId = current.profileId, inviteId = current.inviteId, confirmation = true,
                dateOfBirth = dateOfBirth.takeIf(String::isNotBlank),
                version = version, expiresAt = expiresAt, signature = signature,
                guardianDeclaration = guardianDeclared.takeIf { current.isMinor },
                acceptTeamInvitation = (!review).takeIf { current.isMinor },
                reviewGuardianInvitation = review.takeIf { current.isMinor },
            ).onSuccess { result ->
                when (result.status) {
                    "GUARDIAN_ACCEPTED" -> accepted = true
                    "GUARDIAN_READY" -> reviewed = true
                    "BIRTHDATE_REQUIRED" -> needsBirthDate = true
                    "GUARDIAN_REQUIRED" -> {
                        confirmed = false
                        guardianDeclared = false
                        load()
                    }
                    else -> if (review) error = "The invitation could not be reviewed. Open your profile and reload the invitation."
                        else onClaimed()
                }
                result.refreshError?.let { error = "The action was saved. Invitation data could not refresh: $it" }
            }.onFailure { error = it.message ?: "The profile could not be claimed." }
            saving = false
        }
    }

    fun close() {
        scope.cancel()
        preview = null
    }
}
