package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.razumly.mvp.core.data.dataTypes.CatalogQueryCacheEntry
import com.razumly.mvp.core.data.dataTypes.TimeSlotCacheEntry
import com.razumly.mvp.core.db.MVP_DATABASE_VERSION
import com.razumly.mvp.core.db.MVPDatabaseService
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.runner.RunWith
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
class CatalogCacheMigrationTest {
    @get:Rule
    val migrationHelper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        MVPDatabaseService::class.java,
    )

    @Test
    fun v91CatalogMigration_createsViewerScopedExactQueryCache() {
        val databaseName = "room-catalog-v91"
        migrationHelper.createDatabase(databaseName, 91).close()

        migrationHelper.runMigrationsAndValidate(
            databaseName,
            MVP_DATABASE_VERSION,
            true,
            *MVP_DATABASE_MIGRATIONS,
        ).use { database ->
            database.execSQL(
                "INSERT INTO `catalog_cache_viewer` (`id`, `viewerKey`) VALUES ('active', 'viewer-a')",
            )
            database.execSQL(
                "INSERT INTO `time_slot_cache` (`viewerKey`, `projectionKey`, `id`, `payloadJson`) " +
                    "VALUES ('viewer-a', 'authenticated', 'slot-1', '{}')",
            )
            database.execSQL(
                "INSERT INTO `catalog_query_cache` " +
                    "(`cacheKey`, `viewerKey`, `resourceType`, `projectionKey`, `orderedIdsJson`, " +
                    "`payloadJson`, `paginationJson`, `isComplete`) VALUES " +
                    "('query-a', 'viewer-a', 'time-slots', 'authenticated', '[\"slot-1\"]', " +
                    "'[]', '{\"hasMore\":false}', 1)",
            )

            database.query(
                "SELECT `viewerKey`, `projectionKey`, `isComplete` FROM `catalog_query_cache` " +
                    "WHERE `cacheKey` = 'query-a'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("viewer-a", cursor.getString(0))
                assertEquals("authenticated", cursor.getString(1))
                assertEquals(1, cursor.getInt(2))
            }
            database.query(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' " +
                    "AND name = 'time_slot_field_cross_ref'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals(0, cursor.getInt(0))
            }
        }
    }

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
