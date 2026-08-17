package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.core.data.repositories.InclusivePriceQuote
import com.razumly.mvp.core.data.repositories.InclusivePriceQuoteDirection
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class InclusivePriceQuoteUiState(
    val hostInput: String,
    val totalInput: String,
    val activeDirection: InclusivePriceQuoteDirection,
    val requestedAmountCents: Int?,
    val acceptedQuote: InclusivePriceQuote? = null,
    val isPending: Boolean = false,
    val errorMessage: String? = null,
    val generation: Long = 0,
    val acceptedGeneration: Long? = null,
) {
    val isCurrentInputConfirmed: Boolean
        get() = acceptedQuote != null &&
            acceptedGeneration == generation &&
            acceptedQuote.direction == activeDirection &&
            acceptedQuote.requestedAmountCents == requestedAmountCents
}

class InclusivePriceQuoteCoordinator(
    initialTotalPriceCents: Int,
    private val eventType: String?,
    private val scope: CoroutineScope,
    private val debounceMillis: Long = 250L,
    private val requestQuote: suspend (InclusivePriceQuoteDirection, Int, String?) -> Result<InclusivePriceQuote>,
) {
    private var isClosed = false
    private var generationCounter = 1L
    private var debounceJob: Job? = null
    private val _state = MutableStateFlow(
        InclusivePriceQuoteUiState(
            hostInput = "",
            totalInput = centsInputValue(initialTotalPriceCents),
            activeDirection = InclusivePriceQuoteDirection.TOTAL_PRICE,
            requestedAmountCents = initialTotalPriceCents,
            isPending = true,
            generation = generationCounter,
        ),
    )

    val state: StateFlow<InclusivePriceQuoteUiState> = _state.asStateFlow()

    init {
        require(initialTotalPriceCents >= 0) { "Initial total price must not be negative." }
        require(debounceMillis >= 0) { "Inclusive price quote debounce must not be negative." }
        launchRequest(
            generation = generationCounter,
            direction = InclusivePriceQuoteDirection.TOTAL_PRICE,
            amountCents = initialTotalPriceCents,
        )
    }

    fun updateHostInput(raw: String) {
        updateInput(direction = InclusivePriceQuoteDirection.HOST_AMOUNT, raw = raw)
    }

    fun updateTotalInput(raw: String) {
        updateInput(direction = InclusivePriceQuoteDirection.TOTAL_PRICE, raw = raw)
    }

    fun syncExternalTotalPrice(totalPriceCents: Int) {
        if (isClosed) return
        require(totalPriceCents >= 0) { "External total price must not be negative." }

        val current = _state.value
        val ownerEchoesAcceptedQuote = current.isCurrentInputConfirmed &&
            current.acceptedQuote?.breakdown?.totalPriceCents == totalPriceCents
        if (ownerEchoesAcceptedQuote) return

        val totalInput = centsInputValue(totalPriceCents)
        val alreadySynchronized = current.activeDirection == InclusivePriceQuoteDirection.TOTAL_PRICE &&
            current.requestedAmountCents == totalPriceCents &&
            current.totalInput == totalInput
        if (alreadySynchronized) return

        updateInput(
            direction = InclusivePriceQuoteDirection.TOTAL_PRICE,
            raw = totalInput,
            debounce = false,
        )
    }

    fun retry() {
        if (isClosed) return
        debounceJob?.cancel()
        debounceJob = null

        val current = _state.value
        val amountCents = parseCentsInput(
            when (current.activeDirection) {
                InclusivePriceQuoteDirection.HOST_AMOUNT -> current.hostInput
                InclusivePriceQuoteDirection.TOTAL_PRICE -> current.totalInput
            },
        )
        val generation = nextGeneration()
        _state.update { state ->
            state.copy(
                requestedAmountCents = amountCents,
                isPending = amountCents != null,
                errorMessage = amountCents?.let { null } ?: INVALID_AMOUNT_MESSAGE,
                generation = generation,
            )
        }
        if (amountCents != null) {
            launchRequest(
                generation = generation,
                direction = current.activeDirection,
                amountCents = amountCents,
            )
        }
    }

    fun close() {
        if (isClosed) return
        isClosed = true
        debounceJob?.cancel()
        debounceJob = null
        val closedGeneration = nextGeneration()
        _state.update { state ->
            state.copy(
                isPending = false,
                errorMessage = null,
                generation = closedGeneration,
            )
        }
    }

    private fun updateInput(
        direction: InclusivePriceQuoteDirection,
        raw: String,
        debounce: Boolean = true,
    ) {
        if (isClosed) return
        debounceJob?.cancel()

        val amountCents = parseCentsInput(raw)
        val generation = nextGeneration()
        _state.update { current ->
            current.copy(
                hostInput = if (direction == InclusivePriceQuoteDirection.HOST_AMOUNT) raw else current.hostInput,
                totalInput = if (direction == InclusivePriceQuoteDirection.TOTAL_PRICE) raw else current.totalInput,
                activeDirection = direction,
                requestedAmountCents = amountCents,
                isPending = amountCents != null,
                errorMessage = amountCents?.let { null } ?: INVALID_AMOUNT_MESSAGE,
                generation = generation,
            )
        }

        if (amountCents == null) {
            debounceJob = null
            return
        }
        if (!debounce) {
            debounceJob = null
            launchRequest(
                generation = generation,
                direction = direction,
                amountCents = amountCents,
            )
            return
        }
        debounceJob = scope.launch {
            delay(debounceMillis)
            if (isClosed || _state.value.generation != generation) return@launch

            // The request gets its own job. Later edits may cancel a pending debounce,
            // but correctness never depends on cancelling an in-flight request.
            scope.launch {
                performRequest(
                    generation = generation,
                    direction = direction,
                    amountCents = amountCents,
                )
            }
        }
    }

    private fun launchRequest(
        generation: Long,
        direction: InclusivePriceQuoteDirection,
        amountCents: Int,
    ) {
        scope.launch {
            performRequest(
                generation = generation,
                direction = direction,
                amountCents = amountCents,
            )
        }
    }

    private suspend fun performRequest(
        generation: Long,
        direction: InclusivePriceQuoteDirection,
        amountCents: Int,
    ) {
        val result = try {
            requestQuote(direction, amountCents, eventType)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Throwable) {
            Result.failure(error)
        }

        _state.update { current ->
            if (
                isClosed ||
                current.generation != generation ||
                current.activeDirection != direction ||
                current.requestedAmountCents != amountCents
            ) {
                return@update current
            }

            result.fold(
                onSuccess = { quote ->
                    if (quote.direction != direction || quote.requestedAmountCents != amountCents) {
                        current.copy(
                            isPending = false,
                            errorMessage = MISMATCHED_QUOTE_MESSAGE,
                        )
                    } else {
                        current.copy(
                            hostInput = if (direction == InclusivePriceQuoteDirection.TOTAL_PRICE) {
                                centsInputValue(quote.breakdown.hostReceivesCents)
                            } else {
                                current.hostInput
                            },
                            totalInput = if (direction == InclusivePriceQuoteDirection.HOST_AMOUNT) {
                                centsInputValue(quote.breakdown.totalPriceCents)
                            } else {
                                current.totalInput
                            },
                            acceptedQuote = quote,
                            isPending = false,
                            errorMessage = null,
                            acceptedGeneration = generation,
                        )
                    }
                },
                onFailure = {
                    current.copy(
                        isPending = false,
                        errorMessage = DEFAULT_ERROR_MESSAGE,
                    )
                },
            )
        }
    }

    private fun nextGeneration(): Long {
        generationCounter += 1
        return generationCounter
    }

    private companion object {
        const val INVALID_AMOUNT_MESSAGE = "Enter a valid price."
        const val MISMATCHED_QUOTE_MESSAGE = "The price quote did not match the current amount."
        const val DEFAULT_ERROR_MESSAGE = "Unable to refresh the online price."

        fun centsInputValue(cents: Int): String = cents.takeIf { it > 0 }?.toString().orEmpty()

        fun parseCentsInput(raw: String): Int? = when {
            raw.isEmpty() -> 0
            raw.any { character -> !character.isDigit() } -> null
            else -> raw.toIntOrNull()
        }
    }
}
