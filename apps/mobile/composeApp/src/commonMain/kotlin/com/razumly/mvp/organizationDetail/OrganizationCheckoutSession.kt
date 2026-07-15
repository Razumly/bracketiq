package com.razumly.mvp.organizationDetail

import com.razumly.mvp.core.util.newId

/** Owns exactly one Organization Detail PaymentSheet operation at a time. */
internal class OrganizationCheckoutSessionCoordinator(
    private val operationIdFactory: () -> String = { newId() },
) {
    var activeSession: OrganizationCheckoutSession? = null
        private set

    fun start(owner: OrganizationCheckoutOwner): OrganizationCheckoutSession? {
        if (activeSession != null) return null
        return OrganizationCheckoutSession(operationIdFactory(), owner).also { activeSession = it }
    }

    fun isCurrent(session: OrganizationCheckoutSession): Boolean = activeSession === session

    fun awaitResult(session: OrganizationCheckoutSession): Boolean {
        if (!isCurrent(session) || session.phase != OrganizationCheckoutPhase.PREPARING) return false
        session.phase = OrganizationCheckoutPhase.AWAITING_RESULT
        return true
    }

    fun claimResult(): OrganizationCheckoutSession? {
        val session = activeSession?.takeIf { it.phase == OrganizationCheckoutPhase.AWAITING_RESULT }
            ?: return null
        session.phase = OrganizationCheckoutPhase.RESOLVING
        return session
    }

    fun releaseClaim(session: OrganizationCheckoutSession): Boolean {
        if (!isCurrent(session) || session.phase != OrganizationCheckoutPhase.RESOLVING) return false
        session.phase = OrganizationCheckoutPhase.AWAITING_RESULT
        return true
    }

    fun finish(session: OrganizationCheckoutSession): Boolean {
        if (!isCurrent(session)) return false
        activeSession = null
        return true
    }
}

internal data class OrganizationCheckoutSession(
    val operationId: String,
    val owner: OrganizationCheckoutOwner,
    var phase: OrganizationCheckoutPhase = OrganizationCheckoutPhase.PREPARING,
)

internal enum class OrganizationCheckoutOwner { PRODUCT, TEAM, RENTAL }

internal enum class OrganizationCheckoutPhase { PREPARING, AWAITING_RESULT, RESOLVING }
