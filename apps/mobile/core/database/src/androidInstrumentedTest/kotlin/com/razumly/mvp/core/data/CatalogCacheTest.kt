package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.razumly.mvp.core.data.dataTypes.CatalogQueryCacheEntry
import com.razumly.mvp.core.data.dataTypes.TimeSlotCacheEntry
import com.razumly.mvp.core.db.MVPDatabaseService
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.runner.RunWith
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
class CatalogCacheTest {


    @Test
    fun catalogDao_atomicallyReplacesStaleRows_andPurgesOnViewerChange() = runBlocking {
        val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(
            InstrumentationRegistry.getInstrumentation().targetContext,
        ).allowMainThreadQueries().build()

        try {
            val dao = database.getCatalogCacheDao
            dao.activateViewer("viewer-a")
            val firstSnapshot = CatalogQueryCacheEntry(
                cacheKey = "query-a",
                viewerKey = "viewer-a",
                resourceType = "time-slots",
                projectionKey = "authenticated",
                orderedIdsJson = "[\"slot-old\"]",
                payloadJson = "[]",
                isComplete = true,
            )
            dao.replaceTimeSlotQuery(
                snapshot = firstSnapshot,
                entries = listOf(
                    TimeSlotCacheEntry("viewer-a", "authenticated", "slot-old", "{}"),
                ),
                staleTimeSlotIds = emptyList(),
            )

            val replacement = firstSnapshot.copy(
                orderedIdsJson = "[\"slot-new\"]",
                payloadJson = "[{\"id\":\"slot-new\"}]",
            )
            dao.replaceTimeSlotQuery(
                snapshot = replacement,
                entries = listOf(
                    TimeSlotCacheEntry("viewer-a", "authenticated", "slot-new", "{}"),
                ),
                staleTimeSlotIds = listOf("slot-old"),
            )

            assertTrue(dao.getTimeSlots(listOf("slot-old"), "viewer-a", "authenticated").isEmpty())
            assertEquals(
                listOf("slot-new"),
                dao.getTimeSlots(listOf("slot-new"), "viewer-a", "authenticated").map { it.id },
            )
            assertEquals(replacement, dao.getCatalogQuery("query-a", "viewer-a"))

            dao.activateViewer("anonymous")
            assertTrue(dao.getTimeSlots(listOf("slot-new"), "viewer-a", "authenticated").isEmpty())
            assertEquals(null, dao.getCatalogQuery("query-a", "viewer-a"))
            assertEquals("anonymous", dao.getActiveViewer()?.viewerKey)

            assertFails {
                dao.replaceTimeSlotQuery(
                    snapshot = replacement,
                    entries = listOf(TimeSlotCacheEntry("viewer-a", "authenticated", "late-slot", "{}")),
                    staleTimeSlotIds = emptyList(),
                )
            }
            assertTrue(dao.getTimeSlots(listOf("late-slot"), "viewer-a", "authenticated").isEmpty())
        } finally {
            database.close()
        }
    }

    @Test
    fun catalogDao_rollsBackDeletedAndInsertedRowsWhenSnapshotWriteFails() = runBlocking {
        val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(
            InstrumentationRegistry.getInstrumentation().targetContext,
        ).allowMainThreadQueries().build()

        try {
            val dao = database.getCatalogCacheDao
            dao.activateViewer("viewer-a")
            val original = CatalogQueryCacheEntry(
                cacheKey = "query-a",
                viewerKey = "viewer-a",
                resourceType = "time-slots",
                projectionKey = "authenticated",
                orderedIdsJson = "[\"slot-old\"]",
                payloadJson = "[{\"id\":\"slot-old\"}]",
                isComplete = true,
            )
            dao.replaceTimeSlotQuery(
                snapshot = original,
                entries = listOf(TimeSlotCacheEntry("viewer-a", "authenticated", "slot-old", "{}")),
                staleTimeSlotIds = emptyList(),
            )
            database.openHelper.writableDatabase.execSQL(
                "CREATE TRIGGER fail_catalog_snapshot BEFORE UPDATE ON catalog_query_cache " +
                    "WHEN NEW.cacheKey = 'query-a' BEGIN " +
                    "SELECT RAISE(ABORT, 'forced catalog snapshot failure'); END",
            )

            val replacement = original.copy(
                orderedIdsJson = "[\"slot-new\"]",
                payloadJson = "[{\"id\":\"slot-new\"}]",
            )
            assertFails {
                dao.replaceTimeSlotQuery(
                    snapshot = replacement,
                    entries = listOf(TimeSlotCacheEntry("viewer-a", "authenticated", "slot-new", "{}")),
                    staleTimeSlotIds = listOf("slot-old"),
                )
            }

            assertEquals(original, dao.getCatalogQuery("query-a", "viewer-a"))
            assertEquals(
                listOf("slot-old"),
                dao.getTimeSlots(listOf("slot-old"), "viewer-a", "authenticated").map { it.id },
            )
            assertTrue(dao.getTimeSlots(listOf("slot-new"), "viewer-a", "authenticated").isEmpty())
        } finally {
            database.close()
        }
    }
}
