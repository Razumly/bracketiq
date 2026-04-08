@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import com.razumly.mvp.core.presentation.util.topViewController
import io.github.aakira.napier.Napier
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine
import platform.AuthenticationServices.ASPresentationAnchor
import platform.AuthenticationServices.ASAuthorization
import platform.AuthenticationServices.ASAuthorizationAppleIDCredential
import platform.AuthenticationServices.ASAuthorizationAppleIDProvider
import platform.AuthenticationServices.ASAuthorizationController
import platform.AuthenticationServices.ASAuthorizationControllerDelegateProtocol
import platform.AuthenticationServices.ASAuthorizationControllerPresentationContextProvidingProtocol
import platform.AuthenticationServices.ASAuthorizationScopeEmail
import platform.AuthenticationServices.ASAuthorizationScopeFullName
import platform.Foundation.NSData
import platform.Foundation.NSError
import platform.darwin.NSObject

private data class AppleAuthorizationPayload(
    val identityToken: String,
    val authorizationCode: String,
    val user: String,
    val email: String?,
    val firstName: String?,
    val lastName: String?,
)

private data class AppleAuthorizationSession(
    val controller: ASAuthorizationController,
    val delegate: AppleAuthorizationDelegate,
)

private val activeAppleAuthorizationSessions = mutableSetOf<AppleAuthorizationSession>()

suspend fun IUserRepository.appleLogin(): Result<Unit> {
    val repository = this as? UserRepository
        ?: return Result.failure(IllegalStateException("Apple sign-in requires UserRepository"))

    return runCatching {
        val payload = requestAppleAuthorization()
        repository.loginWithAppleIdentityToken(
            identityToken = payload.identityToken,
            authorizationCode = payload.authorizationCode,
            user = payload.user,
            email = payload.email,
            firstName = payload.firstName,
            lastName = payload.lastName,
        ).getOrThrow()
    }.onFailure { throwable ->
        Napier.e("iOS Apple sign-in failed", throwable)
    }.map {}
}

private suspend fun requestAppleAuthorization(): AppleAuthorizationPayload = suspendCoroutine { continuation ->
    val presentationAnchor = topViewController()?.view?.window
    if (presentationAnchor == null) {
        continuation.resumeWithException(
            IllegalStateException("Unable to find a presenting window for Apple sign-in."),
        )
        return@suspendCoroutine
    }

    val request = ASAuthorizationAppleIDProvider().createRequest().apply {
        requestedScopes = listOf(ASAuthorizationScopeFullName, ASAuthorizationScopeEmail)
    }
    val controller = ASAuthorizationController(authorizationRequests = listOf(request))

    var session: AppleAuthorizationSession? = null
    val delegate = AppleAuthorizationDelegate(
        presentationAnchor = presentationAnchor,
        onSuccess = { credential ->
            continuation.resume(credential.toPayload())
        },
        onFailure = { error ->
            continuation.resumeWithException(error.toException())
        },
        onComplete = {
            session?.let { activeAppleAuthorizationSessions.remove(it) }
        },
    )

    session = AppleAuthorizationSession(controller = controller, delegate = delegate)
    activeAppleAuthorizationSessions += session!!

    controller.delegate = delegate
    controller.presentationContextProvider = delegate
    controller.performRequests()
}

private fun ASAuthorizationAppleIDCredential.toPayload(): AppleAuthorizationPayload {
    val resolvedUser = user.takeIf(String::isNotBlank)
        ?: error("Apple sign-in did not return a user identifier.")
    val resolvedToken = identityToken?.toUtf8String()
        ?.takeIf(String::isNotBlank)
        ?: error("Apple sign-in did not return an identity token.")
    val resolvedAuthorizationCode = authorizationCode?.toUtf8String()
        ?.takeIf(String::isNotBlank)
        ?: error("Apple sign-in did not return an authorization code.")

    return AppleAuthorizationPayload(
        identityToken = resolvedToken,
        authorizationCode = resolvedAuthorizationCode,
        user = resolvedUser,
        email = email?.trim()?.takeIf(String::isNotBlank),
        firstName = fullName?.givenName?.trim()?.takeIf(String::isNotBlank),
        lastName = fullName?.familyName?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun NSData.toUtf8String(): String? {
    if (length.toInt() == 0) return null

    val bytes = ByteArray(length.toInt())
    bytes.usePinned { pinned ->
        getBytes(pinned.addressOf(0), length)
    }
    return bytes.decodeToString()
}

private fun NSError.toException(): Exception {
    val description = localizedDescription ?: "Apple sign-in failed."
    return Exception(description)
}

private class AppleAuthorizationDelegate(
    private val presentationAnchor: ASPresentationAnchor,
    private val onSuccess: (ASAuthorizationAppleIDCredential) -> Unit,
    private val onFailure: (NSError) -> Unit,
    private val onComplete: () -> Unit,
) : NSObject(),
    ASAuthorizationControllerDelegateProtocol,
    ASAuthorizationControllerPresentationContextProvidingProtocol {

    private var isCompleted = false

    override fun authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization: ASAuthorization,
    ) {
        if (isCompleted) return
        isCompleted = true

        val credential = didCompleteWithAuthorization.credential as? ASAuthorizationAppleIDCredential
        if (credential == null) {
            onFailure(IllegalStateNSError("Apple sign-in did not return an Apple ID credential."))
            onComplete()
            return
        }

        onSuccess(credential)
        onComplete()
    }

    override fun authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError: NSError,
    ) {
        if (isCompleted) return
        isCompleted = true
        onFailure(didCompleteWithError)
        onComplete()
    }

    override fun presentationAnchorForAuthorizationController(controller: ASAuthorizationController): ASPresentationAnchor {
        return presentationAnchor
    }
}

private fun IllegalStateNSError(message: String): NSError {
    return NSError.errorWithDomain(
        domain = "BracketIQAppleSignIn",
        code = 0,
        userInfo = mapOf(
            "NSLocalizedDescription" to message,
        ),
    )
}
