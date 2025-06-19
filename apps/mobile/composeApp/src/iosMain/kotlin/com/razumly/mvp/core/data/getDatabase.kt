package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import io.github.aakira.napier.Napier
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.Dispatchers
import platform.Foundation.NSDocumentDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSUserDomainMask


fun getDatabase() : RoomDatabase.Builder<MVPDatabaseservice> {
    return try {
        Room.databaseBuilder<MVPDatabaseservice>(
            name = documentDirectory() + "/tournament.db",
        )
            .setDriver(BundledSQLiteDriver())
            .setQueryCoroutineContext(Dispatchers.Default)
            .fallbackToDestructiveMigrationOnDowngrade(true)

            .also { Napier.d(tag = "Database") { "Database builder created successfully" } }
    } catch (e: Exception) {
        Napier.e(tag = "Database", throwable = e) { "Failed to create database builder" }
        throw e
    }
}

@OptIn(ExperimentalForeignApi::class)
private fun documentDirectory(): String {
    Napier.d(tag = "Database") { "Fetching document directory" }

    return try {
        val documentDirectory = NSFileManager.defaultManager.URLForDirectory(
            directory = NSDocumentDirectory,
            inDomain = NSUserDomainMask,
            appropriateForURL = null,
            create = false,
            error = null,
        )
        requireNotNull(documentDirectory?.path).also {
            Napier.d(tag = "Database") { "Document directory path: $it" }
        }
    } catch (e: Exception) {
        Napier.e(tag = "Database", throwable = e) { "Failed to get document directory" }
        throw e
    }
}
