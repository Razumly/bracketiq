package com.razumly.mvp.di

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.MIGRATION_1_2_NO_OP
import com.razumly.mvp.core.data.MIGRATION_2_3_MATCH_START_NULLABLE
import com.razumly.mvp.core.data.MIGRATION_3_4_USER_PRIVACY_FIELDS
import com.razumly.mvp.core.data.MVP_DATABASE_VERSION
import com.razumly.mvp.core.data.MVPDatabaseService
import io.github.aakira.napier.Napier
import org.koin.dsl.bind
import org.koin.dsl.module

private const val ROOM_DB_LOG_TAG = "RoomDB"

actual val roomDBModule = module {
    single {
        val context = get<Context>()
        val dbFile = context.getDatabasePath("tournament.db")
        deleteDatabaseIfSchemaVersionChanged(
            context = context.applicationContext,
            dbName = dbFile.name,
            expectedVersion = MVP_DATABASE_VERSION,
        )
        Napier.i(tag = ROOM_DB_LOG_TAG) { "Initializing Room database at ${dbFile.absolutePath}" }
        runCatching {
            Room.databaseBuilder<MVPDatabaseService>(
                context.applicationContext,
                dbFile.absolutePath
            ).setDriver(BundledSQLiteDriver())
                .addMigrations(
                    MIGRATION_1_2_NO_OP,
                    MIGRATION_2_3_MATCH_START_NULLABLE,
                    MIGRATION_3_4_USER_PRIVACY_FIELDS,
                )
                .addCallback(object : RoomDatabase.Callback() {
                    override fun onCreate(connection: SQLiteConnection) {
                        Napier.i(tag = ROOM_DB_LOG_TAG) { "Room database created at ${dbFile.absolutePath}" }
                    }

                    override fun onOpen(connection: SQLiteConnection) {
                        Napier.d(tag = ROOM_DB_LOG_TAG) { "Room database opened at ${dbFile.absolutePath}" }
                    }

                    override fun onDestructiveMigration(connection: SQLiteConnection) {
                        Napier.w(tag = ROOM_DB_LOG_TAG) {
                            "Room destructive migration executed at ${dbFile.absolutePath}"
                        }
                    }
                })
                .fallbackToDestructiveMigration(true)
                .fallbackToDestructiveMigrationOnDowngrade(true)
                .build()
        }.onFailure { throwable ->
            Napier.e(tag = ROOM_DB_LOG_TAG, throwable = throwable) {
                "Failed to initialize Room database at ${dbFile.absolutePath}"
            }
        }.getOrThrow()

    } bind DatabaseService::class
}

private fun deleteDatabaseIfSchemaVersionChanged(
    context: Context,
    dbName: String,
    expectedVersion: Int,
) {
    val dbFile = context.getDatabasePath(dbName)
    if (!dbFile.exists()) return

    val currentVersion = runCatching {
        SQLiteDatabase.openDatabase(
            dbFile.absolutePath,
            null,
            SQLiteDatabase.OPEN_READONLY,
        ).use { database ->
            database.version
        }
    }.getOrElse { throwable ->
        Napier.w(tag = ROOM_DB_LOG_TAG, throwable = throwable) {
            "Failed reading Room database version for ${dbFile.absolutePath}; deleting database."
        }
        Int.MIN_VALUE
    }

    if (currentVersion == expectedVersion) return

    Napier.w(tag = ROOM_DB_LOG_TAG) {
        "Deleting Room database at ${dbFile.absolutePath} because schema version $currentVersion != $expectedVersion"
    }
    context.deleteDatabase(dbName)
}
