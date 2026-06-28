package com.razumly.mvp.core.auth

import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.WatchSetupRequestDto
import com.razumly.mvp.core.network.dto.WatchSetupResponseDto
import io.github.aakira.napier.Napier
import kotlin.time.Clock
import platform.Foundation.NSError
import platform.WatchConnectivity.WCSession
import platform.WatchConnectivity.WCSessionActivationState
import platform.WatchConnectivity.WCSessionDelegateProtocol
import platform.darwin.NSObject

actual fun createWatchAuthSync(api: MvpApiClient): WatchAuthSync = IosWatchAuthSync(api)

private class IosWatchAuthSync(
    private val api: MvpApiClient,
) : WatchAuthSync {
    private val sessionDelegate = IosWatchAuthSessionDelegate()

    override suspend fun syncAuthenticatedWatch() {
        if (api.tokenStore.get().isBlank()) return
        if (!WCSession.isSupported()) {
            Napier.d(tag = "WatchAuthSync") { "WatchConnectivity is not supported on this iOS device." }
            return
        }

        val session = WCSession.defaultSession
        session.delegate = sessionDelegate
        session.activateSession()
        if (!session.paired || !session.watchAppInstalled) {
            Napier.d(tag = "WatchAuthSync") { "Skipping watch auth sync because no paired watch app is installed." }
            return
        }

        val setup = api.post<WatchSetupRequestDto, WatchSetupResponseDto>(
            path = "api/auth/watch/setup",
            body = WatchSetupRequestDto(platform = "watchos"),
        )
        if (setup.setupToken.isBlank()) return

        val message = mapOf<Any?, Any?>(
            "type" to "watchSetup",
            "setupToken" to setup.setupToken,
            "issuedAt" to Clock.System.now().toString(),
        )

        runCatching {
            session.transferUserInfo(message)
        }.onFailure { error ->
            Napier.w(tag = "WatchAuthSync") {
                "Unable to queue watch auth setup token: ${error.message}"
            }
        }

        if (session.reachable) {
            session.sendMessage(
                message = message,
                replyHandler = null,
                errorHandler = { error ->
                    Napier.w(tag = "WatchAuthSync") {
                        "Unable to send reachable watch auth setup token: ${error?.localizedDescription}"
                    }
                },
            )
        } else {
            Napier.d(tag = "WatchAuthSync") { "Queued watch auth setup token; watch is not currently reachable." }
        }
    }
}

private class IosWatchAuthSessionDelegate : NSObject(), WCSessionDelegateProtocol {
    override fun session(
        session: WCSession,
        activationDidCompleteWithState: WCSessionActivationState,
        error: NSError?,
    ) {
        if (error != null) {
            Napier.w(tag = "WatchAuthSync") {
                "WatchConnectivity activation failed: ${error.localizedDescription}"
            }
        }
    }

    override fun sessionDidBecomeInactive(session: WCSession) = Unit

    override fun sessionDidDeactivate(session: WCSession) {
        session.activateSession()
    }
}
