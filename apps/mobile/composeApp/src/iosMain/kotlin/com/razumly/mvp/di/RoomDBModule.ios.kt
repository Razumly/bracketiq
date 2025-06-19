package com.razumly.mvp.di

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.MVPDatabaseservice
import com.razumly.mvp.core.data.getDatabase
import io.github.aakira.napier.Napier
import org.koin.core.module.Module
import org.koin.dsl.bind
import org.koin.dsl.module


actual val roomDBModule: Module = module {
    single {
        Napier.d(tag = "Database") { "Initializing Room database module" }
        try {
            getDatabase()
                .fallbackToDestructiveMigration(true)
                .build().also {
                Napier.d(tag = "Database") { "Room database successfully initialized" }
            }
        } catch (e: Exception) {
            Napier.e(tag = "Database", throwable = e) { "Failed to initialize Room database" }
            throw e
        }
    } bind DatabaseService::class
}

