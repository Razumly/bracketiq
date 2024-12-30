package com.razumly.mvp.di

import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.razumly.mvp.core.data.MVPDatabase
import kotlinx.coroutines.Dispatchers
import org.koin.dsl.module

actual val roomDBModule = module {
    single {
        Room.inMemoryDatabaseBuilder(get(), MVPDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }
}