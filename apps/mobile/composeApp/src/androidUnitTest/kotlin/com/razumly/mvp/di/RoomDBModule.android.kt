package com.razumly.mvp.di

import androidx.room.Room
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.MVPDatabaseservice
import org.koin.dsl.bind
import org.koin.dsl.module

actual val roomDBModule = module {
    single {
        Room.inMemoryDatabaseBuilder(get(), MVPDatabaseservice::class.java)
            .allowMainThreadQueries()
            .build()
    } bind DatabaseService::class
}