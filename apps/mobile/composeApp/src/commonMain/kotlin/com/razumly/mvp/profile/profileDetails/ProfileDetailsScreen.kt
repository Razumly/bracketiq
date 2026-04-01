package com.razumly.mvp.profile.profileDetails

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.core.util.emailAddressRegex
import com.razumly.mvp.eventDetail.composables.SelectEventImage
import io.github.ismoy.imagepickerkmp.domain.models.MimeType
import io.github.ismoy.imagepickerkmp.presentation.ui.components.GalleryPickerLauncher

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileDetailsScreen(
    component: ProfileDetailsComponent
) {
    val popupHandler = LocalPopupHandler.current
    val loadingHandler = LocalLoadingHandler.current

    val currentUser by component.currentUser.collectAsState()
    val currentAccount by component.currentAccount.collectAsState()
    val lastUploadedImageId by component.lastUploadedImageId.collectAsState()

    // Form state
    var email by remember { mutableStateOf("") }
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var profileImageId by remember { mutableStateOf<String?>(null) }
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var userName by remember { mutableStateOf("") }
    var confirmNewPassword by remember { mutableStateOf("") }
    var currentPasswordVisible by remember { mutableStateOf(false) }
    var newPasswordVisible by remember { mutableStateOf(false) }
    var confirmNewPasswordVisible by remember { mutableStateOf(false) }
    var showUploadImagePicker by remember { mutableStateOf(false) }
    var showImageSelector by rememberSaveable { mutableStateOf(false) }
    var pendingProfileImageId by remember { mutableStateOf<String?>(null) }

    val uploadedImageIds = remember(currentUser.uploadedImages) {
        currentUser.uploadedImages
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
    }
    val selectableImageIds = remember(uploadedImageIds, profileImageId) {
        (uploadedImageIds + listOfNotNull(profileImageId?.trim()?.takeIf(String::isNotBlank))).distinct()
    }
    val avatarDisplayName = remember(firstName, lastName, userName) {
        listOf(firstName.trim(), lastName.trim())
            .filter(String::isNotBlank)
            .joinToString(" ")
            .ifBlank { userName.trim().ifBlank { "User" } }
    }

    val isEmailValid by remember {
        derivedStateOf {
            email.isNotBlank() && email.matches(emailAddressRegex)
        }
    }
    val isFirstNameValid by remember { derivedStateOf { firstName.isNotBlank() } }
    val isLastNameValid by remember { derivedStateOf { lastName.isNotBlank() } }
    val isPasswordValid by remember {
        derivedStateOf {
            if (newPassword.isBlank() && confirmNewPassword.isBlank()) return@derivedStateOf true
            // Server requires currentPassword + newPassword >= 8
            currentPassword.isNotBlank() && newPassword.length >= 8 && newPassword == confirmNewPassword
        }
    }
    val passwordsMatch by remember {
        derivedStateOf { newPassword.isBlank() || newPassword == confirmNewPassword }
    }

    val isFormValid by remember {
        derivedStateOf {
            isEmailValid && isFirstNameValid && isLastNameValid && isPasswordValid
        }
    }

    // Initialize form with current data
    LaunchedEffect(currentUser, currentAccount) {
        userName = currentUser.userName
        firstName = currentUser.firstName
        lastName = currentUser.lastName
        email = currentAccount.email
        profileImageId = currentUser.profileImageId
    }

    LaunchedEffect(lastUploadedImageId) {
        val uploadedId = lastUploadedImageId?.trim().orEmpty()
        if (uploadedId.isNotBlank()) {
            if (showImageSelector) {
                pendingProfileImageId = uploadedId
            } else {
                profileImageId = uploadedId
            }
            component.consumeUploadedImageSelection()
        }
    }

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
            }
        }
    }

    LaunchedEffect(Unit) {
        component.message.collect { message ->
            if (message != null) {
                popupHandler.showPopup(message)
            }
        }
    }

    if (showUploadImagePicker) {
        GalleryPickerLauncher(
            onPhotosSelected = { photos ->
                showUploadImagePicker = false
                photos.firstOrNull()?.let(component::onUploadSelected)
            },
            onError = {
                showUploadImagePicker = false
            },
            onDismiss = {
                showUploadImagePicker = false
            },
            allowMultiple = false,
            mimeTypes = listOf(
                MimeType.IMAGE_JPEG,
                MimeType.IMAGE_PNG,
                MimeType.IMAGE_WEBP,
            ),
        )
    }

    if (showImageSelector) {
        Dialog(onDismissRequest = { showImageSelector = false }) {
            Card {
                SelectEventImage(
                    onSelectedImage = { imageSelection ->
                        val selectedImageId = imageSelection(Event()).imageId.trim().ifBlank { null }
                        pendingProfileImageId = selectedImageId
                    },
                    imageIds = selectableImageIds,
                    initialSelectedImageId = pendingProfileImageId,
                    onUploadSelected = { showUploadImagePicker = true },
                    onDeleteImage = { imageId ->
                        component.deleteImage(imageId)
                        if (pendingProfileImageId == imageId) {
                            pendingProfileImageId = null
                        }
                        if (profileImageId == imageId) {
                            profileImageId = null
                        }
                    },
                    onConfirm = {
                        profileImageId = pendingProfileImageId
                        showImageSelector = false
                    },
                    onCancel = {
                        pendingProfileImageId = profileImageId
                        showImageSelector = false
                    },
                )
            }
        }
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(title = { Text("Profile Details") }, navigationIcon = {
                IconButton(onClick = component::onBackClicked) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            })
        }) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Personal Information Section
            Text(
                "Personal Information",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 16.dp)
            )

            StandardTextField(
                value = userName,
                onValueChange = { userName = it },
                label = "Username",
                isError = userName.isBlank(),
                supportingText = if (userName.isBlank()) "Required" else ""
            )

            StandardTextField(
                value = email,
                onValueChange = { email = it },
                label = "Email",
                keyboardType = "email",
                isError = !isEmailValid && email.isNotBlank(),
                supportingText = "Email changes are not supported yet",
                enabled = false,
                readOnly = true,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StandardTextField(
                    value = firstName,
                    onValueChange = { firstName = it },
                    label = "First Name",
                    modifier = Modifier.weight(1f),
                    isError = !isFirstNameValid && firstName.isNotBlank(),
                    supportingText = if (!isFirstNameValid && firstName.isNotBlank()) "Required" else ""
                )

                StandardTextField(
                    value = lastName,
                    onValueChange = { lastName = it },
                    label = "Last Name",
                    modifier = Modifier.weight(1f),
                    isError = !isLastNameValid && lastName.isNotBlank(),
                    supportingText = if (!isLastNameValid && lastName.isNotBlank()) "Required" else ""
                )
            }

            Text(
                "Profile Picture",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 8.dp),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                NetworkAvatar(
                    displayName = avatarDisplayName,
                    imageRef = profileImageId,
                    size = 80.dp,
                    contentDescription = "Profile picture",
                )

                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Button(onClick = {
                        pendingProfileImageId = profileImageId
                        showImageSelector = true
                    }) {
                        Text("Change Profile Photo")
                    }
                }
            }

            // Password Section
            Text(
                "Change Password (Optional)",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 8.dp)
            )

            OutlinedTextField(
                value = currentPassword,
                onValueChange = { currentPassword = it },
                label = { Text("Current Password") },
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = if (currentPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                trailingIcon = {
                    IconButton(onClick = { currentPasswordVisible = !currentPasswordVisible }) {
                        Icon(
                            if (currentPasswordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                            contentDescription = if (currentPasswordVisible) "Hide password" else "Show password"
                        )
                    }
                },
                supportingText = {
                    if (newPassword.isNotBlank() && currentPassword.isBlank()) {
                        Text("Required to change password", color = MaterialTheme.colorScheme.error)
                    }
                },
                isError = newPassword.isNotBlank() && currentPassword.isBlank()
            )

            OutlinedTextField(
                value = newPassword,
                onValueChange = { newPassword = it },
                label = { Text("New Password") },
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = if (newPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                trailingIcon = {
                    IconButton(onClick = { newPasswordVisible = !newPasswordVisible }) {
                        Icon(
                            if (newPasswordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                            contentDescription = if (newPasswordVisible) "Hide password" else "Show password"
                        )
                    }
                },
                supportingText = {
                    if (newPassword.isNotBlank() && newPassword.length < 8) {
                        Text(
                            "Password must be at least 8 characters",
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                },
                isError = newPassword.isNotBlank() && newPassword.length < 8
            )

            if (newPassword.isNotBlank()) {
                OutlinedTextField(
                    value = confirmNewPassword,
                    onValueChange = { confirmNewPassword = it },
                    label = { Text("Confirm New Password") },
                    modifier = Modifier.fillMaxWidth(),
                    visualTransformation = if (confirmNewPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = {
                        IconButton(onClick = { confirmNewPasswordVisible = !confirmNewPasswordVisible }) {
                            Icon(
                                if (confirmNewPasswordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                contentDescription = if (confirmNewPasswordVisible) "Hide password" else "Show password"
                            )
                        }
                    },
                    supportingText = {
                        if (confirmNewPassword.isNotBlank() && !passwordsMatch) {
                            Text("Passwords do not match", color = MaterialTheme.colorScheme.error)
                        }
                    },
                    isError = confirmNewPassword.isNotBlank() && !passwordsMatch
                )
            }

            // Save Button
            Button(
                onClick = {
                    component.updateProfile(
                        firstName = firstName,
                        lastName = lastName,
                        email = email,
                        currentPassword = currentPassword,
                        newPassword = newPassword,
                        userName = userName,
                        profileImageId = profileImageId,
                    )
                },
                modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                enabled = isFormValid
            ) {
                Text("Save Profile Changes")
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}
