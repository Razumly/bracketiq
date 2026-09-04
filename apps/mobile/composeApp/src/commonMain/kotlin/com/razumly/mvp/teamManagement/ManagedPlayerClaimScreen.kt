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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
) {
    var preview by remember(inviteId, version, expiresAt, signature) { mutableStateOf<com.razumly.mvp.core.data.repositories.ManagedPlayerClaimPreview?>(null) }
    var dateOfBirth by remember(inviteId) { mutableStateOf("") }
    var confirmed by remember(inviteId) { mutableStateOf(false) }
    var needsBirthDate by remember(inviteId) { mutableStateOf(false) }
    var loading by remember(inviteId, version, expiresAt, signature) { mutableStateOf(true) }
    var saving by remember(inviteId) { mutableStateOf(false) }
    var error by remember(inviteId) { mutableStateOf<String?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    LaunchedEffect(inviteId, version, expiresAt, signature) {
        loading = true
        error = null
        repository.previewManagedPlayerClaim(inviteId, version, expiresAt, signature)
            .onSuccess { value -> preview = value }
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
        Text("Claim Player profile", style = MaterialTheme.typography.headlineSmall)
        when {
            loading -> CircularProgressIndicator()
            error != null -> Text(error.orEmpty(), color = MaterialTheme.colorScheme.error)
            preview != null -> {
                val currentPreview = preview ?: return@Column
                Text(
                    "${currentPreview.displayName} is a managed Player profile. Claim it to keep the roster history with your account.",
                )
                Text(
                    if (currentPreview.hasAttachedEmail) {
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
                RowConfirmation(
                    checked = confirmed,
                    isMinor = currentPreview.isMinor,
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
                            ).onSuccess { result ->
                                when (result.status) {
                                    "BIRTHDATE_REQUIRED" -> needsBirthDate = true
                                    "GUARDIAN_REQUIRED" -> error = "A guardian must complete this claim."
                                    else -> onClaimed()
                                }
                            }.onFailure { throwable -> error = throwable.message ?: "The profile could not be claimed." }
                            saving = false
                        }
                    },
                    enabled = confirmed && !saving && (!needsBirthDate || dateOfBirth.isNotBlank()),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (saving) "Claiming…" else "Claim profile")
                }
            }
        }
    }
}

@Composable
private fun RowConfirmation(
    checked: Boolean,
    isMinor: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(if (isMinor) "I confirm that I am authorized to act for this Player." else "I confirm that this profile belongs to me.")
    }
    Spacer(Modifier.height(1.dp))
}
