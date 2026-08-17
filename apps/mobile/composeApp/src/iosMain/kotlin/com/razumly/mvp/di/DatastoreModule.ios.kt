package com.razumly.mvp.di

import com.razumly.mvp.core.data.util.DATA_STORE_FILE_NAME
import com.razumly.mvp.core.data.util.createDataStore
import kotlinx.cinterop.ExperimentalForeignApi
import org.koin.dsl.module
import platform.Foundation.NSApplicationSupportDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSURL
import platform.Foundation.NSUserDomainMask

@OptIn(ExperimentalForeignApi::class)
actual val datastoreModule = module {
    single {
        createDataStore {
            val appSupportDirectory: NSURL? =
                NSFileManager.defaultManager.URLForDirectory(
                    directory = NSApplicationSupportDirectory,
                    inDomain = NSUserDomainMask,
                    appropriateForURL = null,
                    create = true,
                    error = null,
                )
            val directory = requireNotNull(appSupportDirectory)
            requireNotNull(directory.path) + "/$DATA_STORE_FILE_NAME"
        }
    }
}
