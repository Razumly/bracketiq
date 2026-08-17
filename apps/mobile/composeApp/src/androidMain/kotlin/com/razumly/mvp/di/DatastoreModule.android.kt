package com.razumly.mvp.di

import android.content.Context
import com.razumly.mvp.core.data.util.DATA_STORE_FILE_NAME
import com.razumly.mvp.core.data.util.createDataStore
import org.koin.dsl.module

actual val datastoreModule = module {
    single {
        val context: Context = get()
        createDataStore {
            context.filesDir.resolve(DATA_STORE_FILE_NAME).absolutePath
        }
    }
}