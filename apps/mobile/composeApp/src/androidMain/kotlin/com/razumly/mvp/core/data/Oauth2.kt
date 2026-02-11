package com.razumly.mvp.core.data

import androidx.activity.ComponentActivity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.razumly.mvp.BuildConfig
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import io.github.aakira.napier.Napier
import java.util.UUID

suspend fun IUserRepository.oauth2Login(activity: ComponentActivity): Result<Unit> {
    val repository = this as? UserRepository
        ?: return Result.failure(IllegalStateException("Google OAuth requires UserRepository"))

    val serverClientId = BuildConfig.GOOGLE_MOBILE_ANDROID_CLIENT_ID
        .trim()
        .takeIf { it.isNotBlank() && !it.startsWith("DEFAULT_") }
        ?: return Result.failure(
            IllegalStateException(
                "Missing GOOGLE_MOBILE_ANDROID_CLIENT_ID. Set it in secrets.properties.",
            ),
        )

    return runCatching {
        val credentialManager = CredentialManager.create(activity)
        val result = runCatching {
            credentialManager.getCredential(
                context = activity,
                request = buildGoogleIdRequest(serverClientId),
            )
        }.recoverCatching { throwable ->
            if (throwable !is NoCredentialException) throw throwable
            Napier.i("No saved Google credentials found, retrying with explicit Google sign-in.")
            credentialManager.getCredential(
                context = activity,
                request = buildSignInWithGoogleRequest(serverClientId),
            )
        }.getOrThrow()

        val customCredential = result.credential as? CustomCredential
            ?: error("Google sign-in did not return a custom credential.")
        if (customCredential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            error("Unexpected credential type returned by Google sign-in.")
        }

        val googleCredential = try {
            GoogleIdTokenCredential.createFrom(customCredential.data)
        } catch (e: GoogleIdTokenParsingException) {
            throw IllegalStateException("Failed to parse Google ID token.", e)
        }

        val idToken = googleCredential.idToken
            .takeIf(String::isNotBlank)
            ?: error("Google sign-in did not return an ID token.")

        repository.loginWithGoogleIdToken(idToken).getOrThrow()
    }.recoverCatching { throwable ->
        throw when (throwable) {
            is GetCredentialCancellationException -> Exception("Google sign-in was canceled.", throwable)
            is NoCredentialException -> Exception(
                "Google sign-in failed: no credentials available. " +
                    "For local/dev, use a Play-enabled emulator/device with a signed-in Google account " +
                    "and verify GOOGLE_MOBILE_ANDROID_CLIENT_ID in secrets.properties.",
                throwable,
            )
            is GetCredentialException -> Exception("Google sign-in failed: ${throwable.message}", throwable)
            else -> throwable
        }
    }.onFailure { throwable ->
        Napier.e("Android Google OAuth login failed", throwable)
    }.map {}
}

private fun buildGoogleIdRequest(serverClientId: String): GetCredentialRequest {
    val googleIdOption = GetGoogleIdOption.Builder()
        .setFilterByAuthorizedAccounts(false)
        .setServerClientId(serverClientId)
        .setAutoSelectEnabled(false)
        .setNonce(UUID.randomUUID().toString())
        .build()

    return GetCredentialRequest.Builder()
        .addCredentialOption(googleIdOption)
        .build()
}

private fun buildSignInWithGoogleRequest(serverClientId: String): GetCredentialRequest {
    val signInWithGoogleOption = GetSignInWithGoogleOption.Builder(serverClientId).build()
    return GetCredentialRequest.Builder()
        .addCredentialOption(signInWithGoogleOption)
        .build()
}
