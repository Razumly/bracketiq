package com.razumly.mvp.di

import androidx.room.Room
import com.razumly.mvp.core.data.MVPDatabase
import kotlinx.coroutines.Dispatchers
import org.koin.dsl.module

actual val roomDBModule = module {
    single {
        Room.inMemoryDatabaseBuilder<MVPDatabase>(get())
            .setDriver(BundledSQLiteDriver())
            .setQueryCoroutineContext(Dispatchers.IO)
            .build()
    }
}