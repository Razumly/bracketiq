package com.razumly.mvp.userAuth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.icons.BaselineVisibility24
import com.razumly.mvp.icons.BaselineVisibilityOff24
import com.razumly.mvp.icons.MVPIcons

@Composable
fun AuthScreenBase(component: DefaultAuthComponent, onOauth2: () -> Unit?) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var userName by remember { mutableStateOf("") }
    var isPasswordVisible by remember { mutableStateOf(false) }
    var isConfirmPasswordVisible by remember { mutableStateOf(false) }

    val passwordError by component.passwordError.collectAsState()
    val loginState by component.loginState.collectAsState()
    val isSignup by component.isSignup.collectAsState()

    val isPasswordValid = password.length in 8..256
    val isConfirmPasswordValid = confirmPassword.length in 8..256

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .imePadding() // This handles keyboard insets
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        contentPadding = PaddingValues(bottom = 16.dp) // Extra padding at bottom
    ) {
        item {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (isSignup) {
                    OutlinedTextField(
                        value = firstName,
                        onValueChange = { firstName = it },
                        label = { Text("First Name") },
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            imeAction = ImeAction.Next
                        ),
                        singleLine = true
                    )

                    OutlinedTextField(
                        value = lastName,
                        onValueChange = { lastName = it },
                        label = { Text("Last Name") },
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            imeAction = ImeAction.Next
                        ),
                        singleLine = true
                    )

                    OutlinedTextField(
                        value = userName,
                        onValueChange = { userName = it },
                        label = { Text("Username") },
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            imeAction = ImeAction.Next
                        ),
                        singleLine = true
                    )
                }

                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next
                    ),
                    singleLine = true
                )

                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    modifier = Modifier.fillMaxWidth(),
                    visualTransformation = if (isPasswordVisible)
                        VisualTransformation.None
                    else
                        PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = if (isSignup) ImeAction.Next else ImeAction.Done
                    ),
                    isError = passwordError.isNotBlank(),
                    trailingIcon = {
                        IconButton(
                            onClick = { isPasswordVisible = !isPasswordVisible }
                        ) {
                            Icon(
                                if (isPasswordVisible)
                                    MVPIcons.BaselineVisibilityOff24
                                else
                                    MVPIcons.BaselineVisibility24,
                                contentDescription = "Password visibility"
                            )
                        }
                    },
                    singleLine = true,
                    supportingText = {
                        Text(passwordError, color = MaterialTheme.colorScheme.error)
                    }
                )

                if (isSignup) {
                    OutlinedTextField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it },
                        label = { Text("Confirm Password") },
                        modifier = Modifier.fillMaxWidth(),
                        visualTransformation = if (isConfirmPasswordVisible)
                            VisualTransformation.None
                        else
                            PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        trailingIcon = {
                            IconButton(
                                onClick = { isConfirmPasswordVisible = !isConfirmPasswordVisible }
                            ) {
                                Icon(
                                    if (isConfirmPasswordVisible)
                                        MVPIcons.BaselineVisibilityOff24
                                    else
                                        MVPIcons.BaselineVisibility24,
                                    contentDescription = "Confirm password visibility"
                                )
                            }
                        },
                        singleLine = true
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
                    onClick = {
                        if (isSignup) {
                            component.onSignup(email, password, confirmPassword, firstName, lastName, userName)
                        } else {
                            component.onLogin(email, password)
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    enabled = email.isNotBlank() &&
                            password.isNotBlank() &&
                            isPasswordValid &&
                            (!isSignup || (confirmPassword.isNotBlank() && isConfirmPasswordValid)) &&
                            loginState !is LoginState.Loading
                ) {
                    Text(if (isSignup) "Create Account" else "Login")
                }

                TextButton(onClick = { component.toggleIsSignup() }) {
                    Text(
                        text = if (isSignup)
                            "Already have an account? Login"
                        else
                            "Don't have an account? Sign Up"
                    )
                }

                TextButton(onClick = { onOauth2() }) {
                    Text("Sign in with Google")
                }
            }
        }
    }
}

@Composable
expect fun AuthScreen(component: DefaultAuthComponent)