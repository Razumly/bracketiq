package com.razumly.mvp.teamManagement

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.StandardTextField

enum class ContactPermissionStatus {
    NOT_DETERMINED,
    GRANTED,
    DENIED,
    DENIED_PERMANENTLY,
}

data class DeviceContact(
    val id: String,
    val firstName: String = "",
    val lastName: String = "",
    val displayName: String = "",
    val emails: List<String> = emptyList(),
    val phones: List<String> = emptyList(),
) {
    val resolvedDisplayName: String
        get() = displayName.trim().ifBlank {
            "$firstName $lastName".trim().ifBlank {
                emails.firstOrNull() ?: phones.firstOrNull() ?: "Unnamed contact"
            }
        }
}

data class SelectedDeviceContact(
    val contactId: String,
    val firstName: String,
    val lastName: String,
    val displayName: String,
    val email: String?,
    val phone: String?,
)

interface ContactAccessService {
    fun permissionStatus(): ContactPermissionStatus
    fun requestPermission(onResult: (ContactPermissionStatus) -> Unit)
    suspend fun loadContacts(): Result<List<DeviceContact>>
    fun openAppSettings()
}

@Composable
expect fun rememberContactAccessService(): ContactAccessService

internal fun normalizeDeviceContacts(contacts: List<DeviceContact>): List<DeviceContact> =
    contacts
        .map { contact ->
            contact.copy(
                firstName = contact.firstName.trim(),
                lastName = contact.lastName.trim(),
                displayName = contact.displayName.trim(),
                emails = contact.emails
                    .map(String::trim)
                    .filter(String::isNotBlank)
                    .distinctBy(String::lowercase),
                phones = contact.phones
                    .map(String::trim)
                    .filter(String::isNotBlank)
                    .distinctBy { value -> value.filter(Char::isDigit) },
            )
        }
        .filter { contact ->
            contact.resolvedDisplayName != "Unnamed contact" ||
                contact.emails.isNotEmpty() ||
                contact.phones.isNotEmpty()
        }
        .distinctBy(DeviceContact::id)
        .sortedBy { contact -> contact.resolvedDisplayName.lowercase() }

internal fun filterDeviceContacts(
    contacts: List<DeviceContact>,
    query: String,
    limit: Int = 100,
): List<DeviceContact> {
    val normalizedQuery = query.trim().lowercase()
    return contacts.asSequence()
        .filter { contact ->
            normalizedQuery.isBlank() || listOf(
                contact.resolvedDisplayName,
                contact.firstName,
                contact.lastName,
                contact.emails.joinToString(" "),
                contact.phones.joinToString(" "),
            ).joinToString(" ").lowercase().contains(normalizedQuery)
        }
        .take(limit.coerceAtLeast(1))
        .toList()
}

private enum class ContactDialogStage {
    PRIMER,
    DENIED,
    PICKER,
    METHODS,
}

@Composable
internal fun AddFromContactsDialog(
    onDismiss: () -> Unit,
    onUseManualEntry: () -> Unit,
    onContactSelected: (SelectedDeviceContact) -> Unit,
) {
    val contactAccess = rememberContactAccessService()
    var stage by remember(contactAccess) {
        mutableStateOf(
            if (contactAccess.permissionStatus() == ContactPermissionStatus.GRANTED) {
                ContactDialogStage.PICKER
            } else {
                ContactDialogStage.PRIMER
            },
        )
    }
    var contacts by remember { mutableStateOf<List<DeviceContact>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var reloadToken by remember { mutableIntStateOf(0) }
    var selectedContact by remember { mutableStateOf<DeviceContact?>(null) }
    var selectedEmail by remember { mutableStateOf<String?>(null) }
    var selectedPhone by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(stage, reloadToken) {
        if (stage != ContactDialogStage.PICKER) return@LaunchedEffect
        isLoading = true
        loadError = null
        contactAccess.loadContacts()
            .onSuccess { contacts = normalizeDeviceContacts(it) }
            .onFailure { loadError = "Contacts could not be loaded. You can try again or enter the player manually." }
        isLoading = false
    }

    fun openPickerOrDenied(status: ContactPermissionStatus) {
        if (status == ContactPermissionStatus.GRANTED) {
            stage = ContactDialogStage.PICKER
            reloadToken += 1
        } else {
            stage = ContactDialogStage.DENIED
        }
    }

    fun selectContact(contact: DeviceContact) {
        selectedContact = contact
        selectedEmail = contact.emails.singleOrNull()
        selectedPhone = contact.phones.singleOrNull()
        stage = ContactDialogStage.METHODS
    }

    when (stage) {
        ContactDialogStage.PRIMER -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Add from contacts") },
            text = {
                Text(
                    "BracketIQ will ask for access to show contacts on this device. Your address book stays on your phone. Only the contact you choose is used to find an existing BracketIQ account or prefill an invitation.",
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        when (val status = contactAccess.permissionStatus()) {
                            ContactPermissionStatus.GRANTED -> openPickerOrDenied(status)
                            ContactPermissionStatus.DENIED_PERMANENTLY -> stage = ContactDialogStage.DENIED
                            else -> contactAccess.requestPermission(::openPickerOrDenied)
                        }
                    },
                    modifier = Modifier.testTag("contacts-permission-continue"),
                ) {
                    Text("Continue")
                }
            },
            dismissButton = {
                TextButton(onClick = onDismiss) {
                    Text("Not now")
                }
            },
        )

        ContactDialogStage.DENIED -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Contacts access is off") },
            text = {
                Text(
                    "Turn on Contacts access in Settings to choose someone from your address book, or enter their details manually.",
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        val status = contactAccess.permissionStatus()
                        if (status == ContactPermissionStatus.GRANTED) {
                            openPickerOrDenied(status)
                        } else {
                            contactAccess.openAppSettings()
                        }
                    },
                ) {
                    Text(
                        if (contactAccess.permissionStatus() == ContactPermissionStatus.GRANTED) {
                            "Load contacts"
                        } else {
                            "Open Settings"
                        },
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = onUseManualEntry) {
                    Text("Enter manually")
                }
            },
        )

        ContactDialogStage.PICKER -> {
            val filteredContacts = remember(contacts, query) {
                filterDeviceContacts(contacts, query)
            }
            AlertDialog(
                onDismissRequest = onDismiss,
                title = { Text("Choose a contact") },
                text = {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        StandardTextField(
                            value = query,
                            onValueChange = { query = it },
                            label = "Search contacts",
                            modifier = Modifier.fillMaxWidth().testTag("contacts-search"),
                        )
                        Box(
                            modifier = Modifier.fillMaxWidth().height(300.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            when {
                                isLoading -> CircularProgressIndicator()
                                loadError != null -> Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text(
                                        loadError.orEmpty(),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    OutlinedButton(onClick = { reloadToken += 1 }) {
                                        Text("Try again")
                                    }
                                }
                                contacts.isEmpty() -> Text(
                                    "No contacts with names, email addresses, or phone numbers were found.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                filteredContacts.isEmpty() -> Text(
                                    "No contacts match your search.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                else -> LazyColumn(
                                    modifier = Modifier.fillMaxWidth().testTag("contacts-list"),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    items(filteredContacts, key = DeviceContact::id) { contact ->
                                        Card(
                                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable { selectContact(contact) }
                                                .testTag("contact-row-" + contact.id),
                                        ) {
                                            Column(
                                                modifier = Modifier.fillMaxWidth().padding(10.dp),
                                                verticalArrangement = Arrangement.spacedBy(2.dp),
                                            ) {
                                                Text(
                                                    contact.resolvedDisplayName,
                                                    style = MaterialTheme.typography.bodyLarge,
                                                    fontWeight = FontWeight.SemiBold,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                )
                                                val detail = contact.emails.firstOrNull()
                                                    ?: contact.phones.firstOrNull()
                                                detail?.let {
                                                    Text(
                                                        it,
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis,
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = onUseManualEntry) {
                        Text("Enter manually")
                    }
                },
                dismissButton = {
                    TextButton(onClick = onDismiss) {
                        Text("Cancel")
                    }
                },
            )
        }

        ContactDialogStage.METHODS -> {
            val contact = selectedContact ?: return
            val needsEmailChoice = contact.emails.size > 1
            val needsPhoneChoice = contact.phones.size > 1
            val isSelectionComplete =
                (!needsEmailChoice || selectedEmail != null) &&
                    (!needsPhoneChoice || selectedPhone != null)
            AlertDialog(
                onDismissRequest = { stage = ContactDialogStage.PICKER },
                title = { Text(contact.resolvedDisplayName) },
                text = {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            "Choose the email address or phone number to use when this contact has more than one.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (contact.emails.isNotEmpty()) {
                            ContactMethodChoices(
                                label = "Email",
                                values = contact.emails,
                                selected = selectedEmail,
                                onSelected = { selectedEmail = it },
                            )
                        }
                        if (contact.phones.isNotEmpty()) {
                            ContactMethodChoices(
                                label = "Phone",
                                values = contact.phones,
                                selected = selectedPhone,
                                onSelected = { selectedPhone = it },
                            )
                        }
                        if (contact.emails.isEmpty() && contact.phones.isEmpty()) {
                            Text(
                                "This contact has no email address or phone number. Their name can still be used for a share-link invitation.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            onContactSelected(
                                    SelectedDeviceContact(
                                        contactId = contact.id,
                                        firstName = contact.firstName,
                                        lastName = contact.lastName,
                                        displayName = contact.resolvedDisplayName,
                                        email = selectedEmail,
                                        phone = selectedPhone,
                                    ),
                            )
                        },
                        enabled = isSelectionComplete,
                        modifier = Modifier.testTag("contact-use-selection"),
                    ) {
                        Text("Use contact")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { stage = ContactDialogStage.PICKER }) {
                        Text("Back")
                    }
                },
            )
        }
    }
}

@Composable
private fun ContactMethodChoices(
    label: String,
    values: List<String>,
    selected: String?,
    onSelected: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        values.forEach { value ->
            OutlinedButton(
                onClick = { onSelected(value) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (selected == value) "Selected" else "Choose")
                    Text(
                        value,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}
