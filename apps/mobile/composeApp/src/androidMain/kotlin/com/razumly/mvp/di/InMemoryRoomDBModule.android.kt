package com.razumly.mvp.di

import androidx.room.Room
import com.razumly.mvp.core.data.MVPDatabase
import org.koin.core.module.Module
import org.koin.dsl.module

actual val inMemoryRoomDBModule = module {
    single {
        Room.inMemoryDatabaseBuilder(get(), MVPDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }
}