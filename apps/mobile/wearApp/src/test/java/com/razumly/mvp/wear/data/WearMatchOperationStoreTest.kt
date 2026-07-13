package com.razumly.mvp.wear.data

import kotlinx.serialization.SerializationException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class WearMatchOperationStoreTest {
    @Test
    fun givenConcurrentStoreInstances_whenWritingOperationsAndCache_thenNoUpdatesAreLost() {
        val storage = FakeWearMatchOperationStorage()
        val stores = List(3) { WearMatchOperationStore(storage) }
        val executor = Executors.newFixedThreadPool(8)

        try {
            val writes = (0 until 24).map { index ->
                executor.submit {
                    val store = stores[index % stores.size]
                    val operation = store.newOperation(
                        eventId = "event_1",
                        matchId = "match_$index",
                        kind = WEAR_MATCH_OPERATION_KIND_PATCH,
                        payloadJson = "{\"status\":\"IN_PROGRESS\"}",
                    )
                    store.upsertOperation(operation)
                    store.cacheMatch(WearMatchDto(id = "match_$index", eventId = "event_1"))
                }
            }

            writes.forEach { it.get(5, TimeUnit.SECONDS) }

            val operations = stores.first().pendingOperations()
            assertEquals(24, operations.size)
            assertEquals((1L..24L).toSet(), operations.map { it.clientSequence }.toSet())
            assertEquals(24, stores.first().cachedMatches().size)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun givenCorruptPersistedOperations_whenRead_thenTheQueueIsNotSilentlyDiscarded() {
        val storage = FakeWearMatchOperationStorage(
            WearMatchOperationStoreSnapshot(operationsJson = "not-json"),
        )
        val store = WearMatchOperationStore(storage)

        assertFailsWith<SerializationException> {
            store.pendingOperations()
        }
        assertEquals("not-json", storage.snapshot().operationsJson)
    }

    private class FakeWearMatchOperationStorage(
        private var value: WearMatchOperationStoreSnapshot = WearMatchOperationStoreSnapshot(),
    ) : WearMatchOperationStorage {
        override fun snapshot(): WearMatchOperationStoreSnapshot = value

        override fun replace(snapshot: WearMatchOperationStoreSnapshot) {
            value = snapshot
        }

        override fun clear() {
            value = WearMatchOperationStoreSnapshot()
        }
    }
}
