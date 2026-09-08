package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.razumly.mvp.core.db.MVP_DATABASE_MIGRATION_107_108
import io.github.aakira.napier.Napier
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.Dispatchers
import platform.Foundation.NSDocumentDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSUserDomainMask
private const val ROOM_DB_LOG_TAG = "RoomDB"
private const val ROOM_DB_NAME = "tournament.db"

fun getDatabase(): RoomDatabase.Builder<MVPDatabaseService> {
    val dbPath = databasePath()

    return try {
        Room.databaseBuilder<MVPDatabaseService>(
            name = dbPath,
        )
            .setDriver(BundledSQLiteDriver())
            .addMigrations(MVP_DATABASE_MIGRATION_107_108)
            .setQueryCoroutineContext(Dispatchers.Default)
            .fallbackToDestructiveMigration(dropAllTables = true)
            .also { Napier.d(tag = ROOM_DB_LOG_TAG) { "Database builder created successfully for $dbPath" } }
    } catch (e: Exception) {
        Napier.e(tag = ROOM_DB_LOG_TAG, throwable = e) { "Failed to create database builder for $dbPath" }
        throw e
    }
}


@OptIn(ExperimentalForeignApi::class)
private fun documentDirectory(): String {
    Napier.d(tag = ROOM_DB_LOG_TAG) { "Fetching document directory" }

    return try {
        val documentDirectory = NSFileManager.defaultManager.URLForDirectory(
            directory = NSDocumentDirectory,
            inDomain = NSUserDomainMask,
            appropriateForURL = null,
            create = false,
            error = null,
        )
        requireNotNull(documentDirectory?.path).also {
            Napier.d(tag = ROOM_DB_LOG_TAG) { "Document directory path: $it" }
        }
    } catch (e: Exception) {
        Napier.e(tag = ROOM_DB_LOG_TAG, throwable = e) { "Failed to get document directory" }
        throw e
    }
}

private fun databasePath(): String = documentDirectory() + "/$ROOM_DB_NAME"
