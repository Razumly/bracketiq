package com.razumly.mvp.di

import android.content.Context
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.MIGRATION_80_81
import com.razumly.mvp.core.data.MVPDatabaseservice
import org.koin.dsl.bind
import org.koin.dsl.module

actual val roomDBModule = module {
    single {
        val context = get<Context>()
        val dbFile = context.getDatabasePath("tournament.db")
        Room.databaseBuilder<MVPDatabaseservice>(
            context.applicationContext,
            dbFile.absolutePath
        ).setDriver(BundledSQLiteDriver())
            .addMigrations(MIGRATION_80_81)
            .fallbackToDestructiveMigration(false)
            .build()

    } bind DatabaseService::class
}
