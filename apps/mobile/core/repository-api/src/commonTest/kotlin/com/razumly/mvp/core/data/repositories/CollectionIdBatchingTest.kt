package com.razumly.mvp.core.data.repositories

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class CollectionIdBatchingTest {
    @Test
    fun collectionIdChunks_normalizes_deduplicates_and_preserves_request_order() {
        val ids = listOf(" first ", "", "second", "first", "third", "  ", "fourth")

        val chunks = collectionIdChunks(ids, maxIdsPerRequest = 2)

        assertEquals(
            listOf(
                listOf("first", "second"),
                listOf("third", "fourth"),
            ),
            chunks,
        )
    }

    @Test
    fun collectionIdChunks_splits_every_requested_id_at_the_safe_limit() {
        val ids = (1..201).map { index -> "id_$index" }

        val chunks = collectionIdChunks(ids)

        assertEquals(listOf(100, 100, 1), chunks.map(List<String>::size))
        assertEquals(ids, chunks.flatten())
    }

    @Test
    fun collectionIdChunks_rejects_a_non_positive_request_limit() {
        assertFailsWith<IllegalArgumentException> {
            collectionIdChunks(listOf("id_1"), maxIdsPerRequest = 0)
        }
    }
}
