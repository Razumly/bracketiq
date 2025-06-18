package com.razumly.mvp.di

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.test.TestScope
import org.koin.dsl.module
import java.nio.file.Files

val testDatastoreModule = module {
    single<DataStore<Preferences>> {
        PreferenceDataStoreFactory.create(
            scope = CoroutineScope(get<TestScope>().testScheduler + Job()),
            produceFile = {
                Files.createTempFile("test_datastore", ".preferences_pb").toFile()
            }
        )
    }
}