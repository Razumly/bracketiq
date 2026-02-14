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
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import io.github.aakira.napier.Napier
import java.util.UUID

suspend fun IUserRepository.oauth2Login(activity: ComponentActivity): Result<Unit> {
    val repository = this as? UserRepository
        ?: return Result.failure(IllegalStateException("Google OAuth requires UserRepository"))

    val serverClientId = resolveGoogleServerClientId(activity)
        ?: return Result.failure(
            IllegalStateException(
                "Missing Google web client ID for Android sign-in. " +
                    "Ensure composeApp/google-services.json includes default_web_client_id.",
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
                    "and ensure composeApp/google-services.json is valid for this app build.",
                throwable,
            )
            is GetCredentialException -> Exception(throwable.toUserFacingGoogleSignInError(activity.packageName), throwable)
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

private fun resolveGoogleServerClientId(activity: ComponentActivity): String? {
    return activity.resources
        .getIdentifier("default_web_client_id", "string", activity.packageName)
        .takeIf { it != 0 }
        ?.let(activity::getString)
        ?.trim()
        ?.takeIf { it.isNotBlank() }
}

private fun GetCredentialException.toUserFacingGoogleSignInError(packageName: String): String {
    val rawMessage = message?.trim().orEmpty()
    if (rawMessage.contains("28444")) {
        return "Google sign-in failed: developer configuration error [28444]. " +
            "Ensure google-services.json provides default_web_client_id (OAuth 2.0 Web client) " +
            "and an Android OAuth client exists for package $packageName with the app's SHA-1 fingerprints."
    }

    return if (rawMessage.isNotBlank()) {
        "Google sign-in failed: $rawMessage"
    } else {
        "Google sign-in failed due to an unknown credential provider error."
    }
}
