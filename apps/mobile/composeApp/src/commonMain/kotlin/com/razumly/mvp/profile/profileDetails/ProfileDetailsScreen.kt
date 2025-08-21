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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.composables.StripeButton
import com.razumly.mvp.core.util.LocalErrorHandler
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.emailAddressRegex
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileDetailsScreen(
    component: ProfileDetailsComponent, onBack: () -> Unit
) {
    val errorHandler = LocalErrorHandler.current
    val loadingHandler = LocalLoadingHandler.current
    val scope = rememberCoroutineScope()

    val currentUser by component.currentUser.collectAsState()
    val currentAccount by component.currentAccount.collectAsState()
    val currentBillingAddress by component.currentBillingAddress.collectAsState()

    // Form state
    var email by remember { mutableStateOf("") }
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var userName by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var confirmPasswordVisible by remember { mutableStateOf(false) }

    // Billing address state
    var billingLine1 by remember { mutableStateOf("") }
    var billingLine2 by remember { mutableStateOf("") }
    var billingCity by remember { mutableStateOf("") }
    var billingState by remember { mutableStateOf("") }
    var billingPostalCode by remember { mutableStateOf("") }
    var billingCountry by remember { mutableStateOf("") }

    val isEmailValid by remember {
        derivedStateOf {
            email.isNotBlank() && email.matches(emailAddressRegex)
        }
    }
    val isFirstNameValid by remember { derivedStateOf { firstName.isNotBlank() } }
    val isLastNameValid by remember { derivedStateOf { lastName.isNotBlank() } }
    val isPasswordValid by remember {
        derivedStateOf {
            password.isBlank() || (password.length >= 6 && password == confirmPassword)
        }
    }
    val passwordsMatch by remember {
        derivedStateOf {
            password.isBlank() || password == confirmPassword
        }
    }
    val isBillingValid by remember {
        derivedStateOf {
            billingLine1.isNotBlank() && billingCity.isNotBlank() && billingState.isNotBlank() && billingPostalCode.isNotBlank() && billingCountry.isNotBlank()
        }
    }

    val isFormValid by remember {
        derivedStateOf {
            isEmailValid && isFirstNameValid && isLastNameValid && isPasswordValid && isBillingValid
        }
    }

    // Initialize form with current data
    LaunchedEffect(currentUser, currentBillingAddress, currentAccount) {
        userName = currentUser.userName
        firstName = currentUser.firstName
        lastName = currentUser.lastName
        email = currentAccount.email
        billingLine1 = currentBillingAddress?.line1 ?: ""
        billingLine2 = currentBillingAddress?.line2 ?: ""
        billingCity = currentBillingAddress?.city ?: ""
        billingState = currentBillingAddress?.state ?: ""
        billingPostalCode = currentBillingAddress?.postalCode ?: ""
        billingCountry = currentBillingAddress?.country ?: ""
    }

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                errorHandler.showError(error.message)
            }
        }
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(title = { Text("Profile Details") }, navigationIcon = {
                IconButton(onClick = onBack) {
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

            PlatformTextField(
                value = userName,
                onValueChange = { userName = it },
                label = "Username",
                isError = userName.isBlank(),
                supportingText = if (userName.isBlank()) "Required" else ""
            )

            PlatformTextField(
                value = email,
                onValueChange = { email = it },
                label = "Email",
                keyboardType = "email",
                isError = !isEmailValid && email.isNotBlank(),
                supportingText = if (!isEmailValid && email.isNotBlank()) "Please enter a valid email" else ""
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                PlatformTextField(
                    value = firstName,
                    onValueChange = { firstName = it },
                    label = "First Name",
                    modifier = Modifier.weight(1f),
                    isError = !isFirstNameValid && firstName.isNotBlank(),
                    supportingText = if (!isFirstNameValid && firstName.isNotBlank()) "Required" else ""
                )

                PlatformTextField(
                    value = lastName,
                    onValueChange = { lastName = it },
                    label = "Last Name",
                    modifier = Modifier.weight(1f),
                    isError = !isLastNameValid && lastName.isNotBlank(),
                    supportingText = if (!isLastNameValid && lastName.isNotBlank()) "Required" else ""
                )
            }

            // Password Section
            Text(
                "Change Password (Optional)",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 8.dp)
            )

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("New Password") },
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                            contentDescription = if (passwordVisible) "Hide password" else "Show password"
                        )
                    }
                },
                supportingText = {
                    if (password.isNotBlank() && password.length < 6) {
                        Text(
                            "Password must be at least 6 characters",
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                },
                isError = password.isNotBlank() && password.length < 6
            )

            if (password.isNotBlank()) {
                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it },
                    label = { Text("Confirm Password") },
                    modifier = Modifier.fillMaxWidth(),
                    visualTransformation = if (confirmPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = {
                        IconButton(onClick = { confirmPasswordVisible = !confirmPasswordVisible }) {
                            Icon(
                                if (confirmPasswordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                contentDescription = if (confirmPasswordVisible) "Hide password" else "Show password"
                            )
                        }
                    },
                    supportingText = {
                        if (confirmPassword.isNotBlank() && !passwordsMatch) {
                            Text("Passwords do not match", color = MaterialTheme.colorScheme.error)
                        }
                    },
                    isError = confirmPassword.isNotBlank() && !passwordsMatch
                )
            }

            // Save Button
            Button(
                onClick = {
                    scope.launch {
                        try {
                            component.updateProfile(
                                firstName = firstName,
                                lastName = lastName,
                                email = email,
                                password = password,
                                userName = userName,
                            ).onFailure { error ->
                                errorHandler.showError("Failed to update profile: ${error.message}")
                                return@launch
                            }

                            onBack()
                        } catch (e: Exception) {
                            errorHandler.showError("Failed to update profile: ${e.message}")
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                enabled = isFormValid
            ) {
                Text("Save Profile Changes")
            }

            StripeButton(
                onClick = {
                    currentBillingAddress?.let {
                        component.presentAddressElement(it)
                    }
                },
                paymentProcessor = component,
                text = "Update Billing Address",
            )

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}
