package com.razumly.mvp.profileCompletion

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.repositories.SignupProfileField
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.StandardTextField
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

@Composable
fun ProfileCompletionScreen(component: ProfileCompletionComponent) {
    val currentUser by component.currentUser.collectAsState()
    val missingFields by component.missingFields.collectAsState()
    val prefillProfile by component.prefillProfile.collectAsState()
    val isSubmitting by component.isSubmitting.collectAsState()
    val errorMessage by component.errorMessage.collectAsState()

    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var userName by remember { mutableStateOf("") }
    var dateOfBirth by remember { mutableStateOf("") }
    var showBirthdayPicker by remember { mutableStateOf(false) }

    LaunchedEffect(currentUser.id, prefillProfile) {
        if (firstName.isBlank()) {
            firstName = currentUser.firstName.ifBlank { prefillProfile.firstName.orEmpty() }
        }
        if (lastName.isBlank()) {
            lastName = currentUser.lastName.ifBlank { prefillProfile.lastName.orEmpty() }
        }
        if (userName.isBlank()) {
            userName = currentUser.userName.ifBlank { prefillProfile.userName.orEmpty() }
        }
        if (dateOfBirth.isBlank()) {
            dateOfBirth = prefillProfile.dateOfBirth.orEmpty()
        }
    }

    val missingSummary = remember(missingFields) {
        SignupProfileField.entries
            .filter(missingFields::contains)
            .joinToString { field ->
            when (field) {
                SignupProfileField.FIRST_NAME -> "first name"
                SignupProfileField.LAST_NAME -> "last name"
                SignupProfileField.DATE_OF_BIRTH -> "birthday"
                SignupProfileField.USER_NAME -> "username"
            }
            }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .padding(start = 20.dp, top = 16.dp, end = 20.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "Complete your profile",
                style = MaterialTheme.typography.headlineMedium,
            )
            Text(
                text = "We need a few details before you can continue.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (missingSummary.isNotBlank()) {
                Surface(
                    tonalElevation = 1.dp,
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.secondaryContainer,
                ) {
                    Text(
                        text = "Missing: $missingSummary",
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                StandardTextField(
                    value = firstName,
                    onValueChange = {
                        firstName = it
                        component.clearError()
                    },
                    label = "First Name",
                    modifier = Modifier.weight(1f),
                )

                StandardTextField(
                    value = lastName,
                    onValueChange = {
                        lastName = it
                        component.clearError()
                    },
                    label = "Last Name",
                    modifier = Modifier.weight(1f),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                StandardTextField(
                    value = userName,
                    onValueChange = {
                        userName = it
                        component.clearError()
                    },
                    label = "Username",
                    modifier = Modifier.weight(1f),
                )

                StandardTextField(
                    value = dateOfBirth,
                    onValueChange = {},
                    modifier = Modifier.weight(1f),
                    label = "Birthday",
                    placeholder = "Select birthday",
                    readOnly = true,
                    onTap = {
                        component.clearError()
                        showBirthdayPicker = true
                    },
                )
            }

            if (!errorMessage.isNullOrBlank()) {
                Surface(
                    tonalElevation = 1.dp,
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.errorContainer,
                ) {
                    Text(
                        text = errorMessage.orEmpty(),
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = {
                    component.submit(
                        firstName = firstName,
                        lastName = lastName,
                        userName = userName,
                        dateOfBirth = dateOfBirth,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isSubmitting,
            ) {
                Text(if (isSubmitting) "Saving..." else "Continue")
            }

            OutlinedButton(
                onClick = component::logout,
                modifier = Modifier.fillMaxWidth(),
                enabled = !isSubmitting,
            ) {
                Text("Log Out")
            }
        }
    }

    PlatformDateTimePicker(
        onDateSelected = { selected ->
            dateOfBirth = selected
                ?.toLocalDateTime(TimeZone.currentSystemDefault())
                ?.date
                ?.toString()
                .orEmpty()
        },
        onDismissRequest = { showBirthdayPicker = false },
        showPicker = showBirthdayPicker,
        getTime = false,
        showDate = true,
        canSelectPast = true,
    )
}
