package com.razumly.mvp.userAuth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
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

    val isPasswordValid = password.length in 8..256
    val isConfirmPasswordValid = confirmPassword.length in 8..256

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
                        enabled = email.isNotBlank() && password.isNotBlank() && isPasswordValid && (!isSignup || (confirmPassword.isNotBlank() && isConfirmPasswordValid)) && loginState !is LoginState.Loading
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
expect fun AuthScreen(component: DefaultAuthComponent)
