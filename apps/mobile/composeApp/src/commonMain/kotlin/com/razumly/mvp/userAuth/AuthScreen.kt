package com.razumly.mvp.userAuth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.repositories.SignupProfileConflict
import com.razumly.mvp.core.data.repositories.SignupProfileField
import com.razumly.mvp.core.data.repositories.SignupProfileSelection
import com.razumly.mvp.core.presentation.composables.EmailSignInButton
import com.razumly.mvp.core.presentation.composables.GoogleSignInButton
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.composables.rememberPlatformFocusManager
import io.github.aakira.napier.Napier
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

@Composable
fun AuthScreenBase(component: AuthComponent, onOauth2: () -> Unit?) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var userName by remember { mutableStateOf("") }
    var dateOfBirth by remember { mutableStateOf("") }
    var showBirthdayPicker by remember { mutableStateOf(false) }

    val passwordError by component.passwordError.collectAsState()
    val loginState by component.loginState.collectAsState()
    val isSignup by component.isSignup.collectAsState()
    val signupConflict by component.signupConflict.collectAsState()

    val isPasswordValid = password.length in 8..256
    val isConfirmPasswordValid = confirmPassword.length in 8..256

    var firstNameConflictSource by remember(signupConflict) { mutableStateOf(ProfileConflictValueSource.EXISTING) }
    var lastNameConflictSource by remember(signupConflict) { mutableStateOf(ProfileConflictValueSource.EXISTING) }
    var userNameConflictSource by remember(signupConflict) { mutableStateOf(ProfileConflictValueSource.EXISTING) }
    var dateOfBirthConflictSource by remember(signupConflict) { mutableStateOf(ProfileConflictValueSource.EXISTING) }

    // Focus managers for field navigation
    val firstNameFocusManager = rememberPlatformFocusManager()
    val lastNameFocusManager = rememberPlatformFocusManager()
    val userNameFocusManager = rememberPlatformFocusManager()
    val emailFocusManager = rememberPlatformFocusManager()
    val passwordFocusManager = rememberPlatformFocusManager()
    val confirmPasswordFocusManager = rememberPlatformFocusManager()

    val handleSubmit = {
        if (isSignup) {
            component.onSignup(
                email = email,
                password = password,
                confirmPassword = confirmPassword,
                firstName = firstName,
                lastName = lastName,
                userName = userName,
                dateOfBirth = dateOfBirth.takeIf(String::isNotBlank),
            )
        } else {
            component.onLogin(email, password)
        }
    }

    LaunchedEffect(Unit) {
        firstNameFocusManager.setOnNextAction { lastNameFocusManager.requestFocus() }
        lastNameFocusManager.setOnNextAction { userNameFocusManager.requestFocus() }
        userNameFocusManager.setOnNextAction { emailFocusManager.requestFocus() }
        emailFocusManager.setOnNextAction { passwordFocusManager.requestFocus() }
        passwordFocusManager.setOnDoneAction { handleSubmit() }
    }

    LaunchedEffect(loginState) {
        if (loginState is LoginState.Error) {
            Napier.e("AuthScreen error state: ${(loginState as LoginState.Error).message}")
        }
    }

    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)
                .imePadding().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            contentPadding = PaddingValues(bottom = 16.dp)
        ) {
            item {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (isSignup) {
                        PlatformTextField(
                            value = firstName,
                            onValueChange = { firstName = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = "First Name",
                            imeAction = ImeAction.Next,
                            externalFocusManager = firstNameFocusManager
                        )

                        PlatformTextField(
                            value = lastName,
                            onValueChange = { lastName = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = "Last Name",
                            imeAction = ImeAction.Next,
                            externalFocusManager = lastNameFocusManager
                        )

                        PlatformTextField(
                            value = userName,
                            onValueChange = { userName = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = "Username",
                            imeAction = ImeAction.Next,
                            externalFocusManager = userNameFocusManager
                        )

                        PlatformTextField(
                            value = dateOfBirth,
                            onValueChange = {},
                            modifier = Modifier.fillMaxWidth(),
                            label = "Birthday",
                            placeholder = "Select birthday",
                            readOnly = true,
                            onTap = { showBirthdayPicker = true },
                        )
                    }

                    PlatformTextField(
                        value = email,
                        onValueChange = { email = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = "Email",
                        keyboardType = "email",
                        imeAction = ImeAction.Next,
                        externalFocusManager = emailFocusManager
                    )

                    PlatformTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = "Password",
                        isPassword = true,
                        isError = passwordError.isNotBlank(),
                        supportingText = passwordError,
                        modifier = Modifier.fillMaxWidth(),
                        imeAction = if (isSignup) ImeAction.Next else ImeAction.Done,
                        externalFocusManager = passwordFocusManager
                    )

                    if (isSignup) {
                        PlatformTextField(
                            value = confirmPassword,
                            onValueChange = { confirmPassword = it },
                            label = "Confirm Password",
                            isPassword = true,
                            modifier = Modifier.fillMaxWidth(),
                            imeAction = ImeAction.Done,
                            externalFocusManager = confirmPasswordFocusManager
                        )
                    }

                    if (isSignup && signupConflict != null) {
                        val conflict = signupConflict!!
                        Card(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text(
                                    text = "This email already has a child profile. Choose which details to keep:",
                                    style = MaterialTheme.typography.bodyMedium,
                                )

                                if (conflict.fields.contains(SignupProfileField.FIRST_NAME)) {
                                    ConflictChoiceRow(
                                        field = SignupProfileField.FIRST_NAME,
                                        existingValue = conflict.existing.firstName,
                                        incomingValue = conflict.incoming.firstName,
                                        selectedSource = firstNameConflictSource,
                                        onSourceSelected = { firstNameConflictSource = it },
                                    )
                                }

                                if (conflict.fields.contains(SignupProfileField.LAST_NAME)) {
                                    ConflictChoiceRow(
                                        field = SignupProfileField.LAST_NAME,
                                        existingValue = conflict.existing.lastName,
                                        incomingValue = conflict.incoming.lastName,
                                        selectedSource = lastNameConflictSource,
                                        onSourceSelected = { lastNameConflictSource = it },
                                    )
                                }

                                if (conflict.fields.contains(SignupProfileField.USER_NAME)) {
                                    ConflictChoiceRow(
                                        field = SignupProfileField.USER_NAME,
                                        existingValue = conflict.existing.userName,
                                        incomingValue = conflict.incoming.userName,
                                        selectedSource = userNameConflictSource,
                                        onSourceSelected = { userNameConflictSource = it },
                                    )
                                }

                                if (conflict.fields.contains(SignupProfileField.DATE_OF_BIRTH)) {
                                    ConflictChoiceRow(
                                        field = SignupProfileField.DATE_OF_BIRTH,
                                        existingValue = conflict.existing.dateOfBirth,
                                        incomingValue = conflict.incoming.dateOfBirth,
                                        selectedSource = dateOfBirthConflictSource,
                                        onSourceSelected = { dateOfBirthConflictSource = it },
                                    )
                                }

                                Row(modifier = Modifier.fillMaxWidth()) {
                                    OutlinedButton(
                                        onClick = { component.dismissSignupConflict() },
                                        modifier = Modifier.weight(1f),
                                        enabled = loginState !is LoginState.Loading,
                                    ) {
                                        Text("Cancel")
                                    }
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Button(
                                        onClick = {
                                            component.resolveSignupConflict(
                                                buildSignupConflictSelection(
                                                    conflict = conflict,
                                                    firstNameSource = firstNameConflictSource,
                                                    lastNameSource = lastNameConflictSource,
                                                    userNameSource = userNameConflictSource,
                                                    dateOfBirthSource = dateOfBirthConflictSource,
                                                )
                                            )
                                        },
                                        modifier = Modifier.weight(1f),
                                        enabled = loginState !is LoginState.Loading,
                                    ) {
                                        Text("Continue")
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    when (loginState) {
                        is LoginState.Error -> {
                            Text(
                                text = (loginState as LoginState.Error).message,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(vertical = 8.dp)
                            )
                        }

                        LoginState.Loading -> {
                            CircularProgressIndicator(
                                modifier = Modifier.padding(16.dp)
                            )
                        }

                        else -> {}
                    }

                    Button(
                        onClick = handleSubmit,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        enabled = email.isNotBlank() &&
                            password.isNotBlank() &&
                            isPasswordValid &&
                            (!isSignup || (confirmPassword.isNotBlank() && isConfirmPasswordValid)) &&
                            loginState !is LoginState.Loading &&
                            signupConflict == null
                    ) {
                        Text(if (isSignup) "Create Account" else "Login")
                    }

                    Text(
                        text = if (isSignup) "Already have an account?"
                        else "Don't have an account?"
                    )

                    EmailSignInButton(
                        text = if (isSignup) "Sign in with Email" else "Sign up with Email",
                        onClick = { component.toggleIsSignup() },
                        modifier = Modifier
                    )

                    Text("Or")
                    GoogleSignInButton(onClick = { onOauth2() })
                }
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
            showBirthdayPicker = false
        },
        onDismissRequest = { showBirthdayPicker = false },
        showPicker = showBirthdayPicker,
        getTime = false,
        canSelectPast = true,
    )
}

@Composable
private fun ConflictChoiceRow(
    field: SignupProfileField,
    existingValue: String?,
    incomingValue: String?,
    selectedSource: ProfileConflictValueSource,
    onSourceSelected: (ProfileConflictValueSource) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = field.label,
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            text = "Existing: ${existingValue.orEmpty().ifBlank { "Not set" }}",
            style = MaterialTheme.typography.bodySmall,
        )
        Text(
            text = "Entered: ${incomingValue.orEmpty().ifBlank { "Not set" }}",
            style = MaterialTheme.typography.bodySmall,
        )
        Row {
            OutlinedButton(
                onClick = { onSourceSelected(ProfileConflictValueSource.EXISTING) },
                modifier = Modifier.weight(1f),
            ) {
                Text(if (selectedSource == ProfileConflictValueSource.EXISTING) "Keep Existing (Selected)" else "Keep Existing")
            }
            Spacer(modifier = Modifier.width(8.dp))
            OutlinedButton(
                onClick = { onSourceSelected(ProfileConflictValueSource.ENTERED) },
                modifier = Modifier.weight(1f),
            ) {
                Text(if (selectedSource == ProfileConflictValueSource.ENTERED) "Keep Entered (Selected)" else "Keep Entered")
            }
        }
    }
}

private fun buildSignupConflictSelection(
    conflict: SignupProfileConflict,
    firstNameSource: ProfileConflictValueSource,
    lastNameSource: ProfileConflictValueSource,
    userNameSource: ProfileConflictValueSource,
    dateOfBirthSource: ProfileConflictValueSource,
): SignupProfileSelection {
    return SignupProfileSelection(
        firstName = resolveFieldSelection(
            conflict = conflict,
            field = SignupProfileField.FIRST_NAME,
            source = firstNameSource,
        ),
        lastName = resolveFieldSelection(
            conflict = conflict,
            field = SignupProfileField.LAST_NAME,
            source = lastNameSource,
        ),
        userName = resolveFieldSelection(
            conflict = conflict,
            field = SignupProfileField.USER_NAME,
            source = userNameSource,
        ),
        dateOfBirth = resolveFieldSelection(
            conflict = conflict,
            field = SignupProfileField.DATE_OF_BIRTH,
            source = dateOfBirthSource,
        ),
    )
}

private fun resolveFieldSelection(
    conflict: SignupProfileConflict,
    field: SignupProfileField,
    source: ProfileConflictValueSource,
): String? {
    if (!conflict.fields.contains(field)) {
        return conflict.incoming.valueFor(field)
    }
    return when (source) {
        ProfileConflictValueSource.EXISTING -> conflict.existing.valueFor(field)
        ProfileConflictValueSource.ENTERED -> conflict.incoming.valueFor(field)
    }
}

private enum class ProfileConflictValueSource {
    EXISTING,
    ENTERED,
}

@Composable
expect fun AuthScreen(component: DefaultAuthComponent)
