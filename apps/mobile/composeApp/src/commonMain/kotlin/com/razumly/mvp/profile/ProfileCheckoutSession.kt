package com.razumly.mvp.profile

import com.razumly.mvp.core.util.newId

/**
 * Coordinates the one PaymentSheet checkout that Profile may own at a time.
 *
 * PaymentSheet results do not carry the purchase-intent identity back to shared
 * code. Keeping an immutable operation ID and a single owner therefore prevents
 * a late result from being applied to both a bill installment and a child-team
 * registration.
 */
internal class ProfileCheckoutSessionCoordinator(
    private val operationIdFactory: () -> String = { newId() },
) {
    var activeSession: ProfileCheckoutSession? = null
        private set

    fun start(owner: ProfileCheckoutOwner): ProfileCheckoutSession? {
        if (activeSession != null) return null

        return ProfileCheckoutSession(
            operationId = operationIdFactory(),
            owner = owner,
        ).also { activeSession = it }
    }

    fun isCurrent(session: ProfileCheckoutSession): Boolean = activeSession === session

    fun awaitPaymentResult(session: ProfileCheckoutSession): Boolean {
        if (!isCurrent(session) || session.phase != ProfileCheckoutPhase.PREPARING) {
            return false
        }

        session.phase = ProfileCheckoutPhase.AWAITING_PAYMENT_RESULT
        return true
    }

    /**
     * Atomically claims a result for the currently presented checkout. Results
     * received while setup is still in flight, after resolution starts, or with
     * no owner are deliberately ignored by the caller.
     */
    fun claimPaymentResult(): ProfileCheckoutSession? {
        val session = activeSession
            ?.takeIf { it.phase == ProfileCheckoutPhase.AWAITING_PAYMENT_RESULT }
            ?: return null

        session.phase = ProfileCheckoutPhase.RESOLVING
        return session
    }

    /** Restores the current session when a result cannot be matched to its payload. */
    fun releasePaymentResultClaim(session: ProfileCheckoutSession): Boolean {
        if (!isCurrent(session) || session.phase != ProfileCheckoutPhase.RESOLVING) {
            return false
        }

        session.phase = ProfileCheckoutPhase.AWAITING_PAYMENT_RESULT
        return true
    }

    fun finish(session: ProfileCheckoutSession): Boolean {
        if (!isCurrent(session)) return false

        activeSession = null
        return true
    }
}

internal data class ProfileCheckoutSession(
    val operationId: String,
    val owner: ProfileCheckoutOwner,
    var phase: ProfileCheckoutPhase = ProfileCheckoutPhase.PREPARING,
)

internal enum class ProfileCheckoutOwner {
    BILL_INSTALLMENT,
    CHILD_TEAM_REGISTRATION,
}

internal enum class ProfileCheckoutPhase {
    PREPARING,
    AWAITING_PAYMENT_RESULT,
    RESOLVING,
}
