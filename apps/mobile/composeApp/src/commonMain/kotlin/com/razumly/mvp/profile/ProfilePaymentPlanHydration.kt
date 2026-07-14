package com.razumly.mvp.profile

import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillPayment
import com.razumly.mvp.core.data.dataTypes.Event
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal const val PROFILE_PAYMENT_PLAN_NETWORK_CONCURRENCY = 4

internal data class ProfilePaymentPlanBillSource(
    val bill: Bill,
    val ownerLabel: String,
)

private data class ProfilePaymentPlanEventRequest(
    val eventId: String,
    val bills: List<Bill>,
)

internal data class ProfilePaymentPlanHydrationResult(
    val plans: List<ProfilePaymentPlan>,
    val paymentDetailFailureCount: Int,
    val eventDetailFailureCount: Int,
) {
    val warning: String?
        get() {
            if (paymentDetailFailureCount == 0 && eventDetailFailureCount == 0) return null

            val missingDetails = buildList {
                if (paymentDetailFailureCount > 0) {
                    add(
                        "payment details for $paymentDetailFailureCount " +
                            (if (paymentDetailFailureCount == 1) "bill" else "bills"),
                    )
                }
                if (eventDetailFailureCount > 0) {
                    add(
                        "event details for $eventDetailFailureCount " +
                            (if (eventDetailFailureCount == 1) "event" else "events"),
                    )
                }
            }
            return "Some bill details could not be loaded: ${missingDetails.joinToString(" and ")}. " +
                "The available bills are shown below; pull to refresh the missing details."
        }
}

/**
 * Owns the active payment-plan refresh so replacement refreshes cannot overlap their network work.
 * The replacement waits for cancellation cleanup from the previous job before its block starts.
 */
internal class ProfilePaymentPlanRefreshCoordinator {
    private var requestId = 0L
    private var currentJob: Job? = null
    private val refreshMutex = Mutex()

    fun replace(
        scope: CoroutineScope,
        block: suspend (isCurrent: () -> Boolean) -> Unit,
    ): Job {
        currentJob?.cancel()
        val nextRequestId = ++requestId
        val nextJob = scope.launch {
            // Every refresh, including a canceled predecessor still finishing cleanup, owns
            // this mutex for its full lifetime. A replacement therefore cannot overlap A even
            // when an intermediate B is canceled before B's launch body ever starts.
            refreshMutex.withLock {
                if (nextRequestId != requestId) return@withLock
                block { nextRequestId == requestId }
            }
        }
        currentJob = nextJob
        return nextJob
    }

    fun cancel() {
        requestId += 1
        currentJob?.cancel()
        currentJob = null
    }
}

private suspend fun <T> captureProfilePaymentPlanResult(
    request: suspend () -> Result<T>,
): Result<T> = try {
    request()
} catch (throwable: Throwable) {
    if (throwable is CancellationException) throw throwable
    Result.failure(throwable)
}

internal suspend fun <T, R> mapProfilePaymentPlanRequestsBounded(
    items: List<T>,
    maxConcurrency: Int = PROFILE_PAYMENT_PLAN_NETWORK_CONCURRENCY,
    isCurrent: () -> Boolean,
    transform: suspend (T) -> R,
): List<R>? {
    require(maxConcurrency > 0) { "maxConcurrency must be greater than zero." }
    if (!isCurrent()) return null
    if (items.isEmpty()) return emptyList()

    val unset = Any()
    val results = MutableList<Any?>(items.size) { unset }
    val stateMutex = Mutex()
    var nextIndex = 0

    coroutineScope {
        repeat(minOf(maxConcurrency, items.size)) {
            launch {
                while (true) {
                    val index = stateMutex.withLock {
                        if (!isCurrent() || nextIndex >= items.size) {
                            null
                        } else {
                            nextIndex++
                            nextIndex - 1
                        }
                    } ?: return@launch

                    val result = transform(items[index])
                    val shouldContinue = stateMutex.withLock {
                        if (!isCurrent()) {
                            false
                        } else {
                            results[index] = result
                            true
                        }
                    }
                    if (!shouldContinue) return@launch
                }
            }
        }
    }

    if (!isCurrent()) return null
    return results.mapIndexed { index, result ->
        check(result !== unset) { "Bounded request $index did not produce a result." }
        @Suppress("UNCHECKED_CAST")
        result as R
    }
}

internal suspend fun hydrateProfilePaymentPlans(
    sources: List<ProfilePaymentPlanBillSource>,
    isCurrent: () -> Boolean,
    loadPayments: suspend (Bill) -> Result<List<BillPayment>>,
    loadEvent: suspend (String) -> Result<Event>,
    onPaymentFailure: (Bill, Throwable) -> Unit = { _, _ -> },
    onEventFailure: (String, List<Bill>, Throwable) -> Unit = { _, _, _ -> },
    maxConcurrency: Int = PROFILE_PAYMENT_PLAN_NETWORK_CONCURRENCY,
): ProfilePaymentPlanHydrationResult? {
    val distinctSources = sources.distinctBy { it.bill.id }
    val paymentResults = mapProfilePaymentPlanRequestsBounded(
        items = distinctSources,
        maxConcurrency = maxConcurrency,
        isCurrent = isCurrent,
    ) { source ->
        captureProfilePaymentPlanResult { loadPayments(source.bill) }
    } ?: return null

    var paymentDetailFailureCount = 0
    val payments = paymentResults.mapIndexed { index, result ->
        result.getOrElse { throwable ->
            if (throwable is CancellationException) throw throwable
            paymentDetailFailureCount += 1
            onPaymentFailure(distinctSources[index].bill, throwable)
            emptyList()
        }
    }
    if (!isCurrent()) return null

    val billsByEventId = linkedMapOf<String, MutableList<Bill>>()
    distinctSources.forEach { source ->
        source.bill.eventId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { eventId ->
                billsByEventId.getOrPut(eventId, ::mutableListOf).add(source.bill)
            }
    }
    val eventRequests = billsByEventId.map { (eventId, bills) ->
        ProfilePaymentPlanEventRequest(
            eventId = eventId,
            bills = bills,
        )
    }
    val eventResults = mapProfilePaymentPlanRequestsBounded(
        items = eventRequests,
        maxConcurrency = maxConcurrency,
        isCurrent = isCurrent,
    ) { request ->
        captureProfilePaymentPlanResult { loadEvent(request.eventId) }
    } ?: return null

    var eventDetailFailureCount = 0
    val eventsById = eventRequests.mapIndexed { index, request ->
        request.eventId to eventResults[index].fold(
            onSuccess = { event -> event },
            onFailure = { throwable ->
                if (throwable is CancellationException) throw throwable
                eventDetailFailureCount += 1
                onEventFailure(request.eventId, request.bills, throwable)
                null
            },
        )
    }.toMap()
    if (!isCurrent()) return null

    return ProfilePaymentPlanHydrationResult(
        plans = distinctSources.mapIndexed { index, source ->
            ProfilePaymentPlan(
                bill = source.bill,
                ownerLabel = source.ownerLabel,
                payments = payments[index],
                event = source.bill.eventId
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?.let(eventsById::get),
            )
        },
        paymentDetailFailureCount = paymentDetailFailureCount,
        eventDetailFailureCount = eventDetailFailureCount,
    )
}
