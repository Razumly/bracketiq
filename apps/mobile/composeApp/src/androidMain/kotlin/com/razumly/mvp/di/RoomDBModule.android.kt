package com.razumly.mvp.di

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.MIGRATION_80_81
import com.razumly.mvp.core.data.MIGRATION_81_82
import com.razumly.mvp.core.data.MIGRATION_82_83
import com.razumly.mvp.core.data.MIGRATION_83_84
import com.razumly.mvp.core.data.MIGRATION_84_85
import com.razumly.mvp.core.data.MIGRATION_87_88
import com.razumly.mvp.core.data.MVPDatabaseservice
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
            Room.databaseBuilder<MVPDatabaseservice>(
                context.applicationContext,
                dbFile.absolutePath
            ).setDriver(BundledSQLiteDriver())
                .addMigrations(
                    MIGRATION_80_81,
                    MIGRATION_81_82,
                    MIGRATION_82_83,
                    MIGRATION_83_84,
                    MIGRATION_84_85,
                    MIGRATION_87_88
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
                .build()
        }.onFailure { throwable ->
            Napier.e(tag = ROOM_DB_LOG_TAG, throwable = throwable) {
                "Failed to initialize Room database at ${dbFile.absolutePath}"
            }
        }.getOrThrow()

    } bind DatabaseService::class
}
