package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Field
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class IMVPRepositoryTest {
    @Test
    fun multiResponse_deletes_only_requested_ids_and_returns_the_post_sync_snapshot() = runTest {
        val requestedIds = listOf("field-stale", "field-fresh")
        val local = mutableListOf(
            Field(id = "field-stale", fieldNumber = 1),
            Field(id = "field-fresh", fieldNumber = 2),
            Field(id = "field-unrelated", fieldNumber = 3),
        )
        val deletedIds = mutableListOf<String>()

        val result = IMVPRepository.multiResponse(
            authoritativeIds = requestedIds,
            getRemoteData = { listOf(Field(id = "field-fresh", fieldNumber = 20)) },
            getLocalData = { local.filter { field -> field.id in requestedIds } },
            saveData = { refreshed ->
                refreshed.forEach { field ->
                    local.removeAll { cached -> cached.id == field.id }
                    local += field
                }
            },
            deleteData = { staleIds ->
                deletedIds += staleIds
                local.removeAll { field -> field.id in staleIds }
            },
        ).getOrThrow()

        assertEquals(listOf("field-stale"), deletedIds)
        assertEquals(listOf(Field(id = "field-fresh", fieldNumber = 20)), result)
        assertTrue(local.any { field -> field.id == "field-unrelated" })
    }

    @Test
    fun multiResponse_empty_authoritative_response_returns_empty_after_deleting_cached_rows() = runTest {
        val requestedIds = listOf("field-removed")
        val local = mutableListOf(Field(id = "field-removed", fieldNumber = 1))

        val result = IMVPRepository.multiResponse(
            authoritativeIds = requestedIds,
            getRemoteData = { emptyList() },
            getLocalData = { local.filter { field -> field.id in requestedIds } },
            saveData = { error("No data should be saved for an empty response") },
            deleteData = { staleIds -> local.removeAll { field -> field.id in staleIds } },
        ).getOrThrow()

        assertTrue(result.isEmpty())
        assertTrue(local.isEmpty())
    }

    @Test
    fun multiResponse_never_deletes_rows_for_a_non_authoritative_collection_response() = runTest {
        val local = mutableListOf(Field(id = "field-cached", fieldNumber = 1))
        val deletedIds = mutableListOf<String>()

        val result = IMVPRepository.multiResponse(
            getRemoteData = { listOf(Field(id = "field-returned", fieldNumber = 2)) },
            getLocalData = { local.toList() },
            saveData = { refreshed -> local += refreshed },
            deleteData = { staleIds -> deletedIds += staleIds },
        ).getOrThrow()

        assertTrue(deletedIds.isEmpty())
        assertEquals(
            listOf(
                Field(id = "field-cached", fieldNumber = 1),
                Field(id = "field-returned", fieldNumber = 2),
            ),
            result,
        )
    }
}
