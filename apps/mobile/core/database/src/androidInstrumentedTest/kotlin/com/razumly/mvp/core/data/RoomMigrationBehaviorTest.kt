package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.room.useReaderConnection
import androidx.room.useWriterConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.db.MVPDatabaseService
import com.razumly.mvp.core.db.MVP_DATABASE_MIGRATION_107_108
import com.razumly.mvp.core.db.MVP_DATABASE_VERSION
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RoomMigrationBehaviorTest {

    @Test
    fun given_older_cache_version_when_database_reopens_then_roomRecreatesCache() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val databaseName = "room-destructive-upgrade"
        context.deleteDatabase(databaseName)

        fun openDatabase() =
            Room.databaseBuilder<MVPDatabaseService>(context, databaseName)
                .setDriver(BundledSQLiteDriver())
                .fallbackToDestructiveMigration(dropAllTables = true)
                .build()

        val original = openDatabase()
        try {
            runBlocking {
                original.useWriterConnection { connection ->
                    connection.usePrepared(
                        "CREATE TABLE `room_upgrade_sentinel` (`id` INTEGER NOT NULL PRIMARY KEY)",
                    ) { statement ->
                        statement.step()
                    }
                    connection.usePrepared(
                        "PRAGMA user_version = ${MVP_DATABASE_VERSION - 1}",
                    ) { statement ->
                        statement.step()
                    }
                }
            }
        } finally {
            original.close()
        }

        val reopened = openDatabase()
        try {
            val sentinelExists = runBlocking {
                reopened.useReaderConnection { connection ->
                    connection.usePrepared(
                        "SELECT `name` FROM `sqlite_master` WHERE `type` = 'table' AND `name` = 'room_upgrade_sentinel'",
                    ) { statement ->
                        statement.step()
                    }
                }
            }
            assertTrue(sentinelExists.not())
        } finally {
            reopened.close()
            context.deleteDatabase(databaseName)
        }
    }
    @Test
    fun given_persisted_affiliate_event_when_database_upgrades_then_event_type_is_migrated() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val databaseName = "room-affiliate-event-migration"
        context.deleteDatabase(databaseName)

        fun openDatabase() =
            Room.databaseBuilder<MVPDatabaseService>(context, databaseName)
                .setDriver(BundledSQLiteDriver())
                .addMigrations(MVP_DATABASE_MIGRATION_107_108)
                .build()

        val original = openDatabase()
        try {
            runBlocking {
                original.getEventDao.upsertEvent(Event(id = "legacy-affiliate"))
                original.useWriterConnection { connection ->
                    connection.usePrepared(
                        "UPDATE Event SET eventType = 'AFFILIATE' WHERE id = 'legacy-affiliate'",
                    ) { statement ->
                        statement.step()
                    }
                    connection.usePrepared(
                        "PRAGMA user_version = ${MVP_DATABASE_VERSION - 1}",
                    ) { statement ->
                        statement.step()
                    }
                }
            }
        } finally {
            original.close()
        }

        val reopened = openDatabase()
        try {
            val migratedEvent = runBlocking {
                reopened.getEventDao.getEventById("legacy-affiliate")
            }
            val storedEventType = runBlocking {
                reopened.useReaderConnection { connection ->
                    connection.usePrepared(
                        "SELECT eventType FROM Event WHERE id = 'legacy-affiliate'",
                    ) { statement ->
                        statement.step()
                        statement.getText(0)
                    }
                }
            }
            assertEquals(EventType.EVENT, migratedEvent?.eventType)
            assertEquals("EVENT", storedEventType)
        } finally {
            reopened.close()
            context.deleteDatabase(databaseName)
        }
    }

}
