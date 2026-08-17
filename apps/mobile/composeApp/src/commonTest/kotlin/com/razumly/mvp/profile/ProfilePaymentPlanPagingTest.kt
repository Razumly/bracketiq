package com.razumly.mvp.profile

import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.repositories.RepositoryPage
import com.razumly.mvp.core.data.repositories.RepositoryPagination
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class ProfilePaymentPlanPagingTest {
    @Test
    fun loads_every_server_page_and_deduplicates_overlapping_bills() = runTest {
        val requestedOffsets = mutableListOf<Int>()
        val pages = mapOf(
            0 to billPage(
                bills = listOf(
                    bill("bill-new", totalAmountCents = 1_000),
                    bill("bill-overlap", totalAmountCents = 2_000),
                ),
                offset = 0,
                nextOffset = 2,
                hasMore = true,
            ),
            2 to billPage(
                bills = listOf(
                    bill("bill-overlap", totalAmountCents = 2_500),
                    bill("bill-older-unpaid", totalAmountCents = 3_000),
                ),
                offset = 2,
                nextOffset = 4,
                hasMore = false,
            ),
        )

        val result = loadAllProfileBills(
            loadPage = { _, offset ->
                requestedOffsets += offset
                Result.success(requireNotNull(pages[offset]))
            },
            isCurrent = { true },
            pageSize = 2,
        ).getOrThrow()

        assertEquals(listOf(0, 2), requestedOffsets)
        assertEquals(
            listOf("bill-new", "bill-overlap", "bill-older-unpaid"),
            result?.map { it.id },
        )
        assertEquals(2_500, result?.first { it.id == "bill-overlap" }?.totalAmountCents)
    }

    @Test
    fun superseded_refresh_discards_late_page_and_stops_paging() = runTest {
        val firstPage = CompletableDeferred<Result<RepositoryPage<Bill>>>()
        val requestedOffsets = mutableListOf<Int>()
        var isCurrent = true

        val load = async {
            loadAllProfileBills(
                loadPage = { _, offset ->
                    requestedOffsets += offset
                    firstPage.await()
                },
                isCurrent = { isCurrent },
                pageSize = 1,
            ).getOrThrow()
        }
        runCurrent()

        isCurrent = false
        firstPage.complete(
            Result.success(
                billPage(
                    bills = listOf(bill("stale-bill")),
                    offset = 0,
                    nextOffset = 1,
                    hasMore = true,
                ),
            ),
        )

        assertNull(load.await())
        assertEquals(listOf(0), requestedOffsets)
    }

    @Test
    fun rejects_a_has_more_page_that_does_not_advance() = runTest {
        val result = loadAllProfileBills(
            loadPage = { _, _ ->
                Result.success(
                    billPage(
                        bills = listOf(bill("bill-1")),
                        offset = 0,
                        nextOffset = 0,
                        hasMore = true,
                    ),
                )
            },
            isCurrent = { true },
            pageSize = 1,
        )

        assertTrue(result.isFailure)
        assertEquals(
            "Bill pagination did not advance beyond offset 0.",
            result.exceptionOrNull()?.message,
        )
    }

    @Test
    fun propagates_a_later_page_failure_instead_of_publishing_a_partial_list() = runTest {
        val requestedOffsets = mutableListOf<Int>()
        val expectedFailure = IllegalStateException("page two failed")

        val result = loadAllProfileBills(
            loadPage = { _, offset ->
                requestedOffsets += offset
                if (offset == 0) {
                    Result.success(
                        billPage(
                            bills = listOf(bill("bill-new")),
                            offset = 0,
                            nextOffset = 1,
                            hasMore = true,
                        ),
                    )
                } else {
                    Result.failure(expectedFailure)
                }
            },
            isCurrent = { true },
            pageSize = 1,
        )

        assertEquals(listOf(0, 1), requestedOffsets)
        assertTrue(result.isFailure)
        assertEquals(expectedFailure, result.exceptionOrNull())
    }

    @Test
    fun fails_closed_when_a_server_advances_forever() = runTest {
        val requestedOffsets = mutableListOf<Int>()

        val result = loadAllProfileBills(
            loadPage = { _, offset ->
                requestedOffsets += offset
                Result.success(
                    billPage(
                        bills = listOf(bill("bill-$offset")),
                        offset = offset,
                        nextOffset = offset + 1,
                        hasMore = true,
                    ),
                )
            },
            isCurrent = { true },
            pageSize = 1,
            maxPages = 2,
        )

        assertEquals(listOf(0, 1), requestedOffsets)
        assertTrue(result.isFailure)
        assertEquals(
            "Bill pagination exceeded the safe page limit.",
            result.exceptionOrNull()?.message,
        )
    }
}

private fun bill(
    id: String,
    totalAmountCents: Int = 1_000,
): Bill = Bill(
    id = id,
    ownerType = "USER",
    ownerId = "user-1",
    totalAmountCents = totalAmountCents,
    paidAmountCents = 0,
    status = "OPEN",
)

private fun billPage(
    bills: List<Bill>,
    offset: Int,
    nextOffset: Int,
    hasMore: Boolean,
): RepositoryPage<Bill> = RepositoryPage(
    items = bills,
    pagination = RepositoryPagination(
        limit = 2,
        offset = offset,
        nextOffset = nextOffset,
        hasMore = hasMore,
    ),
)
