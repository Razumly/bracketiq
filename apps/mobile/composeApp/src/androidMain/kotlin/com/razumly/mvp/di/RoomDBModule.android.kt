package com.razumly.mvp.di

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.MVP_DATABASE_MIGRATIONS
import com.razumly.mvp.core.db.MVPDatabaseService
import io.github.aakira.napier.Napier
import org.koin.dsl.bind
import org.koin.dsl.module

private const val ROOM_DB_LOG_TAG = "RoomDB"

actual val roomDBModule = module {
    single {
        val context = get<Context>()
        val dbFile = context.getDatabasePath("tournament.db")
        Napier.i(tag = ROOM_DB_LOG_TAG) { "Initializing Room database at ${dbFile.absolutePath}" }
        runCatching {
            Room.databaseBuilder<MVPDatabaseService>(
                context.applicationContext,
                dbFile.absolutePath
            ).setDriver(BundledSQLiteDriver())
                .addMigrations(*MVP_DATABASE_MIGRATIONS)
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
                .build()
        }.onFailure { throwable ->
            Napier.e(tag = ROOM_DB_LOG_TAG, throwable = throwable) {
                "Failed to initialize Room database at ${dbFile.absolutePath}"
            }
        }.getOrThrow()

    } bind DatabaseService::class
}
