package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.util.newId

/**
 * Serializes the checkout operations owned by one PaymentProcessor host.
 *
 * PaymentSheet results contain no purchase-intent identity, so callers must
 * retain an immutable operation ID alongside their pending payload and claim a
 * result before resolving it. This keeps a result from being applied to a
 * second, unrelated checkout owned by the same screen component.
 */
internal class PaymentSheetOperationHost<Owner>(
    private val operationIdFactory: () -> String = { newId() },
) {
    var activeOperation: PaymentSheetOperation<Owner>? = null
        private set

    fun start(owner: Owner): PaymentSheetOperation<Owner>? {
        if (activeOperation != null) return null

        return PaymentSheetOperation(
            operationId = operationIdFactory(),
            owner = owner,
        ).also { activeOperation = it }
    }

    fun isCurrent(operation: PaymentSheetOperation<Owner>): Boolean = activeOperation === operation

    fun awaitResult(operation: PaymentSheetOperation<Owner>): Boolean {
        if (!isCurrent(operation) || operation.phase != PaymentSheetOperationPhase.PREPARING) {
            return false
        }

        operation.phase = PaymentSheetOperationPhase.AWAITING_RESULT
        return true
    }

    fun claimResult(): PaymentSheetOperation<Owner>? {
        val operation = activeOperation
            ?.takeIf { it.phase == PaymentSheetOperationPhase.AWAITING_RESULT }
            ?: return null

        operation.phase = PaymentSheetOperationPhase.RESOLVING
        return operation
    }

    fun releaseResultClaim(operation: PaymentSheetOperation<Owner>): Boolean {
        if (!isCurrent(operation) || operation.phase != PaymentSheetOperationPhase.RESOLVING) {
            return false
        }

        operation.phase = PaymentSheetOperationPhase.AWAITING_RESULT
        return true
    }

    fun finish(operation: PaymentSheetOperation<Owner>): Boolean {
        if (!isCurrent(operation)) return false

        activeOperation = null
        return true
    }
}

internal data class PaymentSheetOperation<Owner>(
    val operationId: String,
    val owner: Owner,
    var phase: PaymentSheetOperationPhase = PaymentSheetOperationPhase.PREPARING,
)

internal enum class PaymentSheetOperationPhase {
    PREPARING,
    AWAITING_RESULT,
    RESOLVING,
}
