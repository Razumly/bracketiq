package com.razumly.mvp.di

import android.content.Context
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.razumly.mvp.core.data.MVPDatabase
import org.koin.dsl.module

actual val roomDBModule = module {
    single {
        val context = get<Context>()
        val dbFile = context.getDatabasePath("tournament.db")
        Room.databaseBuilder<MVPDatabase>(
            context.applicationContext,
            dbFile.absolutePath
        ).setDriver(BundledSQLiteDriver())
            .fallbackToDestructiveMigration(false)
            .build()
    }
}