package com.razumly.mvp.wear.ui

import android.app.Application
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class WearTextFieldSemanticsTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun givenNonemptyCredentials_whenRendered_thenFieldsStayLabeledAndPasswordRemainsSecret() {
        val email = "official@example.test"
        val password = "swordfish"

        composeRule.setContent {
            Column {
                WearTextField(
                    value = email,
                    label = "Email",
                    onValueChange = {},
                    keyboardType = KeyboardType.Email,
                )
                WearTextField(
                    value = password,
                    label = "Password",
                    onValueChange = {},
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardType = KeyboardType.Password,
                )
            }
        }

        val emailSemantics = composeRule
            .onNodeWithContentDescription("Email")
            .fetchSemanticsNode()
            .config
        val passwordSemantics = composeRule
            .onNodeWithContentDescription("Password")
            .fetchSemanticsNode()
            .config

        assertEquals(listOf("Email"), emailSemantics[SemanticsProperties.ContentDescription])
        assertEquals(listOf("Password"), passwordSemantics[SemanticsProperties.ContentDescription])
        assertNotEquals(
            emailSemantics[SemanticsProperties.ContentDescription],
            passwordSemantics[SemanticsProperties.ContentDescription],
        )
        assertFalse(emailSemantics.contains(SemanticsProperties.Password))
        assertTrue(passwordSemantics.contains(SemanticsProperties.Password))
        assertEquals(email, emailSemantics[SemanticsProperties.EditableText].text)

        val maskedPassword = passwordSemantics[SemanticsProperties.EditableText].text
        assertEquals(password.length, maskedPassword.length)
        assertFalse(maskedPassword.contains(password))
    }
}
