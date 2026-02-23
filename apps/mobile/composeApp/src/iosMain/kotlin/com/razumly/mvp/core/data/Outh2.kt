@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.razumly.mvp.core.data

import cocoapods.GoogleSignIn.GIDConfiguration
import cocoapods.GoogleSignIn.GIDSignIn
import cocoapods.GoogleSignIn.GIDSignInResult
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import com.razumly.mvp.core.util.AppSecrets
import io.github.aakira.napier.Napier
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine
import platform.Foundation.NSError
import platform.UIKit.UIApplication
import platform.UIKit.UIViewController


suspend fun IUserRepository.oauth2Login(): Result<Unit> {
    val repository = this as? UserRepository
        ?: return Result.failure(IllegalStateException("Google OAuth requires UserRepository"))

    val clientId = AppSecrets.googleMobileIosClientId
        .trim()
        .takeIf { it.isNotBlank() }
        ?: return Result.failure(
            IllegalStateException(
                "Missing iOS Google client ID. Set googleMobileIosClientId in Secrets.plist " +
                    "or include CLIENT_ID in GoogleService-Info.plist.",
            ),
        )

    val rootViewController = UIApplication.sharedApplication.keyWindow?.rootViewController
        ?: return Result.failure(IllegalStateException("Unable to find root view controller for Google sign-in."))

    return runCatching {
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID = clientId)
        val result = signInWithGoogle(rootViewController)
        val token = result.user.idToken?.tokenString
            ?.takeIf(String::isNotBlank)
            ?: error("Google sign-in did not return an ID token.")

        repository.loginWithGoogleIdToken(token).getOrThrow()
    }.onFailure { throwable ->
        Napier.e("iOS Google OAuth login failed", throwable)
    }.map {}
}

private suspend fun signInWithGoogle(presentingViewController: UIViewController): GIDSignInResult =
    suspendCoroutine { continuation ->
        GIDSignIn.sharedInstance.signInWithPresentingViewController(
            presentingViewController,
        ) { signInResult, error ->
            when {
                error != null -> continuation.resumeWithException(error.toException())
                signInResult != null -> continuation.resume(signInResult)
                else -> continuation.resumeWithException(IllegalStateException("Google sign-in failed with no result."))
            }
        }
}

private fun NSError.toException(): Exception {
    val description = localizedDescription ?: "Google sign-in failed."
    return Exception(description)
}
