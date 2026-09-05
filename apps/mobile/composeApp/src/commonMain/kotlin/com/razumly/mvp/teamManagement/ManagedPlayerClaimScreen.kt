package com.razumly.mvp.teamManagement

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import com.razumly.mvp.core.data.repositories.IUserRepository

@Composable
fun ManagedPlayerClaimScreen(
    repository: IUserRepository,
    inviteId: String,
    version: String?,
    expiresAt: String?,
    signature: String?,
    onClaimed: () -> Unit,
    onGuardianAccepted: () -> Unit = onClaimed,
) {
    var preview by remember(inviteId, version, expiresAt, signature) { mutableStateOf<com.razumly.mvp.core.data.repositories.ManagedPlayerClaimPreview?>(null) }
    var dateOfBirth by remember(inviteId) { mutableStateOf("") }
    var confirmed by remember(inviteId) { mutableStateOf(false) }
    var guardianDeclared by remember(inviteId) { mutableStateOf(false) }
    var accepted by remember(inviteId) { mutableStateOf(false) }
    var needsBirthDate by remember(inviteId) { mutableStateOf(false) }
    var loading by remember(inviteId, version, expiresAt, signature) { mutableStateOf(true) }
    var saving by remember(inviteId) { mutableStateOf(false) }
    var error by remember(inviteId) { mutableStateOf<String?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    LaunchedEffect(inviteId, version, expiresAt, signature) {
        loading = true
        error = null
        repository.previewManagedPlayerClaim(inviteId, version, expiresAt, signature)
            .onSuccess { value -> preview = value; needsBirthDate = value.birthdateRequired }
            .onFailure { throwable -> error = throwable.message ?: "This claim link is unavailable." }
        loading = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (accepted) {
            Text("Invitation accepted", style = MaterialTheme.typography.headlineSmall)
            Text("${preview?.displayName} has joined ${preview?.teamName ?: "the team"}. Their Player profile remains separate from yours.")
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = onGuardianAccepted) { Text("Open profile") }
            return@Column
        }
        Text(if (preview?.isMinor == true) "Accept for your child" else "Claim Player profile", style = MaterialTheme.typography.headlineSmall)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        when {
            loading -> CircularProgressIndicator()
            preview != null -> {
                val currentPreview = preview ?: return@Column
                Text(
                    if (currentPreview.isMinor) "Review ${currentPreview.displayName}’s invitation to ${currentPreview.teamName ?: "the team"}. This child keeps a separate Player profile."
                    else "${currentPreview.displayName} is a managed Player profile. Claim it to keep the roster history with your account.",
                )
                currentPreview.dateOfBirth?.let { Text("Date of birth: $it") }
                if (currentPreview.guardianContactRequired) {
                    Text("Ask the team manager to add a guardian contact and issue a new invitation.")
                    return@Column
                }
                if (currentPreview.guardianSetupRequired) {
                    ConfirmationRow(guardianDeclared, currentPreview.guardianDeclaration.orEmpty()) { guardianDeclared = it }
                    Text("We record your declaration. Email verification and this declaration do not independently verify guardianship.", style = MaterialTheme.typography.bodySmall)
                }
                Text(
                    if (currentPreview.isMinor && !currentPreview.guardianSetupRequired) {
                        "Your active guardian relationship is ready. Review and accept the invitation below."
                    } else if (currentPreview.hasAttachedEmail) {
                        "Your verified account email must match the attached ${if (currentPreview.isMinor) "guardian" else "Player"} email."
                    } else {
                        "This signed link proves the invitation. You must still confirm the profile belongs to you."
                    },
                    style = MaterialTheme.typography.bodySmall,
                )
                if (needsBirthDate) {
                    ManagedPlayerDateField(
                        value = dateOfBirth,
                        onValueChange = { dateOfBirth = it },
                        label = "Date of birth",
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                ConfirmationRow(
                    checked = confirmed,
                    label = if (currentPreview.isMinor) "I accept this team invitation for ${currentPreview.displayName}." else "I confirm that this profile belongs to me.",
                    onCheckedChange = { confirmed = it },
                )
                Button(
                    onClick = {
                        saving = true
                        error = null
                        scope.launch {
                            // The server performs email, guardian, signature, and merge checks atomically.
                            repository.claimManagedPlayerProfile(
                                profileId = currentPreview.profileId,
                                inviteId = currentPreview.inviteId,
                                confirmation = true,
                                dateOfBirth = dateOfBirth.takeIf(String::isNotBlank),
                                version = version,
                                expiresAt = expiresAt,
                                signature = signature,
                                guardianDeclaration = guardianDeclared.takeIf { currentPreview.isMinor },
                                acceptTeamInvitation = true.takeIf { currentPreview.isMinor },
                            ).onSuccess { result ->
                                when (result.status) {
                                    "GUARDIAN_ACCEPTED" -> {
                                        accepted = true
                                        result.refreshError?.let { error = "Invitation accepted. Family data could not refresh: $it" }
                                    }
                                    "BIRTHDATE_REQUIRED" -> needsBirthDate = true
                                    "GUARDIAN_REQUIRED" -> {
                                        confirmed = false
                                        guardianDeclared = false
                                        preview = null
                                        repository.previewManagedPlayerClaim(inviteId, version, expiresAt, signature)
                                            .onSuccess { value -> preview = value; needsBirthDate = value.birthdateRequired }
                                            .onFailure { throwable -> error = throwable.message ?: "The guardian invitation could not load." }
                                    }
                                    else -> onClaimed()
                                }
                            }.onFailure { throwable -> error = throwable.message ?: "The profile could not be claimed." }
                            saving = false
                        }
                    },
                    enabled = confirmed && !saving && (!needsBirthDate || dateOfBirth.isNotBlank()) && (!currentPreview.guardianSetupRequired || guardianDeclared),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (saving) "Saving…" else if (currentPreview.isMinor) "Accept team invitation" else "Claim profile")
                }
            }
        }
    }
}

@Composable
private fun ConfirmationRow(
    checked: Boolean,
    label: String,
    onCheckedChange: (Boolean) -> Unit,
) {
    androidx.compose.foundation.layout.Row(modifier = Modifier.toggleable(value = checked, role = Role.Checkbox, onValueChange = onCheckedChange), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Checkbox(checked = checked, onCheckedChange = null)
        Text(label)
    }
    Spacer(Modifier.height(1.dp))
}
