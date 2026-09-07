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
import androidx.compose.runtime.collectAsState
import com.razumly.mvp.profile.InvitationBlockAction
import com.razumly.mvp.core.data.dataTypes.Invite
import kotlinx.coroutines.flow.flowOf
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
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
    val currentUser by repository.currentUser.collectAsState()
    val viewerId = currentUser.getOrNull()?.id
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val component = remember(repository, inviteId, version, expiresAt, signature, viewerId) {
        ManagedPlayerClaimComponent(repository, inviteId, version, expiresAt, signature, scope, onClaimed)
    }
    DisposableEffect(component) { onDispose { component.close() } }
    val preview = component.preview
    val dateOfBirth = component.dateOfBirth
    val confirmed = component.confirmed
    val guardianDeclared = component.guardianDeclared
    val reviewed = component.reviewed
    val declined = component.declined
    val accepted = component.accepted
    val needsBirthDate = component.needsBirthDate
    val loading = component.loading
    val saving = component.saving
    val error = component.error
    val invitationFlow = remember(viewerId) { viewerId?.let(repository::observeRecipientInvitations) ?: flowOf(emptyList<Invite>()) }
    val invitations by invitationFlow.collectAsState(emptyList())
    val invitation = invitations.firstOrNull { it.id == inviteId }
    LaunchedEffect(component) { component.load() }
    LaunchedEffect(component, viewerId, preview, reviewed) {
        if (viewerId != null && preview?.isMinor == true && (reviewed || preview?.guardianSetupRequired == false)) {
            component.refreshActions(viewerId)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (declined) {
            Text("Invitation declined", style = MaterialTheme.typography.headlineSmall)
            Button(onClick = onGuardianAccepted) { Text("Open profile") }
            return@Column
        }
        if (accepted) {
            Text("Invitation accepted", style = MaterialTheme.typography.headlineSmall)
            Text("${preview?.displayName} has joined ${preview?.teamName ?: "the team"}. Their Player profile remains separate from yours.")
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = onGuardianAccepted) { Text("Open profile") }
            return@Column
        }
        Text(if (preview?.isMinor == true) "Review your child’s invitation" else "Claim Player profile", style = MaterialTheme.typography.headlineSmall)
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
                if (currentPreview.guardianSetupRequired && !reviewed) {
                    ConfirmationRow(guardianDeclared, currentPreview.guardianDeclaration.orEmpty()) { component.guardianDeclared = it }
                    Text("We record your declaration. Email verification and this declaration do not independently verify guardianship.", style = MaterialTheme.typography.bodySmall)
                }
                Text(
                    if (currentPreview.isMinor && !currentPreview.guardianSetupRequired) {
                        "Your active guardian relationship is ready. You can accept or decline the invitation below."
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
                        onValueChange = { component.dateOfBirth = it },
                        label = "Date of birth",
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                if (currentPreview.isMinor) {
                    if (invitation?.status == "PENDING") {
                        TextButton(enabled = !saving, onClick = component::decline) { Text("Decline") }
                        InvitationBlockAction(invitation, enabled = !saving, onSave = component::declineAndBlock)
                    } else if (invitation != null) {
                        Text(invitation.invitationLabel ?: "Invitation ${invitation.status?.lowercase()}")
                    } else {
                        Button(enabled = !saving && (!currentPreview.guardianSetupRequired || reviewed || guardianDeclared),
                            onClick = { component.claim(review = true) }) { Text("Review decline options") }
                    }
                }
                ConfirmationRow(
                    checked = confirmed,
                    label = if (currentPreview.isMinor) "I accept this team invitation for ${currentPreview.displayName}." else "I confirm that this profile belongs to me.",
                    onCheckedChange = { component.confirmed = it },
                )
                Button(
                    onClick = { component.claim() },
                    enabled = confirmed && !saving && (!needsBirthDate || dateOfBirth.isNotBlank()) && (!currentPreview.guardianSetupRequired || reviewed || guardianDeclared) && (invitation == null || invitation.status == "PENDING"),
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
