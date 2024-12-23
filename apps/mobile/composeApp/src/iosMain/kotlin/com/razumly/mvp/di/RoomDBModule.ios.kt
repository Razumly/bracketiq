package com.razumly.mvp.di

import org.koin.core.module.Module
import org.koin.dsl.module
import com.razumly.mvp.core.data.MVPDatabase
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import platform.Foundation.NSHomeDirectory

actual val roomDBModule: Module = module {
    single {
        val dbFilePath = NSHomeDirectory() + "/Documents/tournament.db"
        Room.databaseBuilder<MVPDatabase>(
            name = dbFilePath
        )
            .setDriver(BundledSQLiteDriver())
            .fallbackToDestructiveMigration(false)
            .build()
    }
}
